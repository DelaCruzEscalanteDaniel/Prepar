'use strict';
const config = require('../config');
const db = require('../db');
const log = require('./log');
const { coordenadas } = require('./validar');

const URL_BASE = 'https://nominatim.openstreetmap.org/search';
const TIEMPO_MAX_MS = 2000;
const MAX_EN_COLA = 1;
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

async function consultarNominatim(consulta, agente) {
  if (enCola >= MAX_EN_COLA) throw new Error('Demasiadas consultas simultáneas');
  enCola += 1;
  try {
    await turno();
    const params = new URLSearchParams({
      q: consulta, format: 'jsonv2', limit: '1', countrycodes: 'mx',
      viewbox: '-99.37,19.60,-98.94,19.05', bounded: '1', 'accept-language': 'es',
    });
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIEMPO_MAX_MS);
    try {
      const r = await fetch(`${URL_BASE}?${params}`, { headers: { 'User-Agent': agente, Accept: 'application/json' }, signal: ctrl.signal });
      if (!r.ok) throw new Error(`Nominatim respondió ${r.status}`);
      const datos = await r.json();
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

module.exports = { geocodificar };
