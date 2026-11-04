'use strict';
const config = require('../config');
const db = require('../db');
const log = require('./log');
const { coordenadas } = require('./validar');

const URL_BASE = 'https://nominatim.openstreetmap.org/search';
const URL_INVERSA = 'https://nominatim.openstreetmap.org/reverse';
const TIEMPO_MAX_MS = 2000;
const MAX_EN_COLA = 3;
let ultimaPeticion = 0;
let enCola = 0;
let cola = Promise.resolve();

function turno() {
  const espera = cola.then(async () => {
    const falta = ultimaPeticion + 1100 - Date.now();
    if (falta > 0) await new Promise((r) => setTimeout(r, falta));
    ultimaPeticion = Date.now();
  });
  cola = espera.catch(() => {});
  return espera;
}

async function consultarNominatim(consulta, agente, extra) {
  if (enCola >= MAX_EN_COLA) throw new Error('Demasiadas consultas simultáneas');
  enCola += 1;
  try {
    await turno();
    const inversa = extra && extra.inversa;
    const params = new URLSearchParams(inversa
      ? { lat: String(extra.lat), lon: String(extra.lon), format: 'jsonv2', addressdetails: '1', zoom: '18', 'accept-language': 'es' }
      : {
        q: consulta, format: 'jsonv2', limit: String((extra && extra.limite) || 1), countrycodes: 'mx',
        viewbox: '-99.37,19.60,-98.94,19.05', bounded: '1', 'accept-language': 'es', addressdetails: extra ? '1' : '0',
      });
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIEMPO_MAX_MS);
    try {
      const r = await fetch(`${inversa ? URL_INVERSA : URL_BASE}?${params}`, { headers: { 'User-Agent': agente, Accept: 'application/json' }, signal: ctrl.signal });
      if (!r.ok) throw new Error(`Nominatim respondió ${r.status}`);
      const datos = await r.json();
      if (inversa) return datos && !datos.error ? [datos] : [];
      return Array.isArray(datos) ? datos : [];
    } finally {
      clearTimeout(t);
    }
  } finally {
    enCola -= 1;
  }
}

async function geocodificar(consulta) {
  const texto = String(consulta || '').replace(/\s+/g, ' ').slice(0, 300).trim();
  if (!texto) return null;
  try {
    const previo = await db.conSistema(async (con) => {
      const cache = await con.call('sp_geocodificacion_buscar', [texto]);
      const p = await con.uno("SELECT valor FROM parametros_sistema WHERE clave = 'nominatim_user_agent'");
      return { cache: cache[0] || null, agente: (p && p.valor) || 'Prepar-Simulador/1.0' };
    });
    if (previo.cache) {
      const c = previo.cache;
      return c.exito && c.latitud != null ? { id: c.id, latitud: Number(c.latitud), longitud: Number(c.longitud), direccion: c.direccion_encontrada } : null;
    }
    if (!config.geocodificacion) return null;
    let resultados;
    try {
      resultados = await consultarNominatim(texto, previo.agente);
    } catch (e) {
      log.aviso('Geocodificación no disponible:', e.message);
      return null;
    }
    const r = resultados[0];
    let coords = null;
    if (r) {
      try { coords = coordenadas(r.lat, r.lon); } catch { coords = null; }
    }
    const respuesta = r ? JSON.stringify({ place_id: r.place_id, display_name: r.display_name, lat: r.lat, lon: r.lon, licence: r.licence }) : null;
    const guardado = await db.conSistema((con) => con.call('sp_geocodificacion_guardar', [
      texto, !!coords, coords ? coords.latitud : null, coords ? coords.longitud : null,
      r ? String(r.display_name || '').slice(0, 300) : null, respuesta,
    ]));
    if (!coords || !guardado.length) return null;
    return { id: guardado[0].id, latitud: coords.latitud, longitud: coords.longitud, direccion: r.display_name };
  } catch (e) {
    log.aviso('Error al geocodificar:', e.message);
    return null;
  }
}

const memoria = new Map();
function recordar(clave, valor) {
  memoria.set(clave, valor);
  if (memoria.size > 500) memoria.delete(memoria.keys().next().value);
  return valor;
}

async function agenteNominatim() {
  const p = await db.conSistema((con) => con.uno("SELECT valor FROM parametros_sistema WHERE clave = 'nominatim_user_agent'"));
  return (p && p.valor) || 'Prepar-Simulador/1.0';
}

function limpio(s, max) { return String(s || '').replace(/[<>"`]/g, '').replace(/\s+/g, ' ').trim().slice(0, max); }

function desglosar(r) {
  const a = r.address || {};
  let coords = null;
  try { coords = coordenadas(r.lat, r.lon); } catch { coords = null; }
  if (!coords) return null;
  const cp = /^\d{5}$/.test(a.postcode || '') ? a.postcode : null;
  return {
    calle: limpio(a.road || a.pedestrian || a.footway || a.residential || a.square || a.amenity || '', 100),
    numero: limpio(a.house_number || '', 10) || null,
    codigo_postal: cp,
    colonia: limpio(a.neighbourhood || a.suburb || a.quarter || a.city_block || '', 100) || null,
    alcaldia: limpio(a.city_district || a.borough || a.county || a.town || '', 100) || null,
    texto: limpio(r.display_name, 200),
    latitud: coords.latitud, longitud: coords.longitud,
  };
}

async function sugerirDirecciones(consulta) {
  const texto = String(consulta || '').replace(/\s+/g, ' ').slice(0, 300).trim();
  if (!texto || !config.geocodificacion) return [];
  const clave = `s:${texto.toLowerCase()}`;
  if (memoria.has(clave)) return memoria.get(clave);
  try {
    const lista = await consultarNominatim(texto, await agenteNominatim(), { limite: 5 });
    return recordar(clave, lista.map(desglosar).filter((x) => x && x.calle));
  } catch (e) {
    log.aviso('Sugerencias de dirección no disponibles:', e.message);
    return [];
  }
}

async function direccionDePunto(lat, lon) {
  if (!config.geocodificacion) return null;
  const clave = `r:${Number(lat).toFixed(5)},${Number(lon).toFixed(5)}`;
  if (memoria.has(clave)) return memoria.get(clave);
  try {
    const lista = await consultarNominatim(null, await agenteNominatim(), { inversa: true, lat, lon });
    return recordar(clave, lista.length ? desglosar(lista[0]) : null);
  } catch (e) {
    log.aviso('Dirección del punto no disponible:', e.message);
    return null;
  }
}

module.exports = { geocodificar, sugerirDirecciones, direccionDePunto, desglosar };
