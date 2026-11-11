'use strict';

const db = require('../db');
const geo = require('./geo');
const { direccionDePunto } = require('./geocodificar');

const VIGENCIA_MS = 10 * 60 * 1000;
const TOLERANCIA_KM = 0.15;
const RADIO_SIN_LIMITE_KM = 3.5;
let cache = null;
let cargando = null;

const sinAcentos = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

async function cargar() {
  const [unidades, alcaldias] = await db.conSistema(async (con) => [
    await con.q(`SELECT ut.id, ut.nombre, ut.alcaldia_id, ut.latitud, ut.longitud, ut.limite_geojson
                 FROM unidades_territoriales ut WHERE ut.activa`),
    await con.q('SELECT id, nombre, limite_geojson FROM alcaldias'),
  ]);
  const alc = new Map();
  for (const a of alcaldias) {
    const g = geo.geometria(a.limite_geojson);
    alc.set(Number(a.id), { id: Number(a.id), nombre: a.nombre, geom: g && g.type !== 'Point' ? g : null });
  }
  const uts = new Map();
  for (const u of unidades) {
    const g = geo.geometria(u.limite_geojson);
    const poligono = g && g.type !== 'Point' ? g : null;
    let centro = u.latitud !== null && u.longitud !== null ? { lat: Number(u.latitud), lng: Number(u.longitud) } : null;
    if (!centro && poligono) centro = geo.centro(poligono);
    uts.set(Number(u.id), { id: Number(u.id), nombre: u.nombre, alcaldiaId: Number(u.alcaldia_id), geom: poligono, centro });
  }
  const conPoligono = [...uts.values()].filter((u) => u.geom);
  const alcConPoligono = [...alc.values()].filter((a) => a.geom);
  return {
    en: Date.now(),
    uts,
    alc,
    indiceUts: geo.indice(conPoligono.map((u) => ({ id: u.id, geom: u.geom }))),
    indiceAlc: geo.indice(alcConPoligono.map((a) => ({ id: a.id, geom: a.geom }))),
    totalAlcPoligono: alcConPoligono.length,
  };
}

async function datos() {
  if (cache && Date.now() - cache.en < VIGENCIA_MS) return cache;
  if (!cargando) {
    cargando = cargar().then((c) => { cache = c; return c; }).finally(() => { cargando = null; });
  }
  return cargando;
}

function invalidar() {
  cache = null;
}

function distanciaSegmentoKm(p, a, b) {
  const k = Math.cos((p.lat * Math.PI) / 180);
  const ax = a[0] * k; const ay = a[1]; const bx = b[0] * k; const by = b[1]; const px = p.lng * k; const py = p.lat;
  const dx = bx - ax; const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx; const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy) * 111.32;
}

function distanciaBordeKm(g, p) {
  let min = Infinity;
  const pols = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  for (const pol of pols) {
    for (const anillo of pol) {
      for (let i = 1; i < anillo.length; i += 1) {
        const d = distanciaSegmentoKm(p, anillo[i - 1], anillo[i]);
        if (d < min) min = d;
      }
    }
  }
  return min;
}

function dentroOCerca(g, p) {
  return geo.contiene(g, p.lng, p.lat) || distanciaBordeKm(g, p) <= TOLERANCIA_KM;
}

function masCercana(d, p) {
  let mejor = null;
  let dist = Infinity;
  for (const u of d.uts.values()) {
    if (!u.centro) continue;
    const x = geo.distanciaKm(u.centro, p);
    if (x < dist) { dist = x; mejor = u; }
  }
  return mejor ? { unidad: mejor, km: dist } : null;
}

function rechazo(nivel, d, mia, donde) {
  const miAlc = d.alc.get(mia.alcaldiaId);
  const tuya = `${mia.nombre}, ${miAlc ? miAlc.nombre : ''}`.replace(/, $/, '');
  let lugar = '';
  if (donde && donde.unidad) {
    const a = d.alc.get(donde.unidad.alcaldiaId);
    lugar = `${donde.unidad.nombre}${a ? `, ${a.nombre}` : ''}`;
  } else if (donde && donde.alcaldia) {
    lugar = `la alcaldía ${donde.alcaldia}`;
  }
  const inicio = lugar ? `La ubicación que marcaste está en ${lugar}.` : 'La ubicación que marcaste está fuera de tu colonia.';
  return {
    ok: false,
    nivel,
    mensaje: `${inicio} Solo puedes registrar proyectos dentro de tu colonia: ${tuya}. Si cambiaste de domicilio, actualiza tu colonia en Mi perfil.`,
  };
}

async function verificar(unidadId, latitud, longitud, { consultarDireccion = true } = {}) {
  const p = { lat: Number(latitud), lng: Number(longitud) };
  if (!geo.enCdmx(p.lat, p.lng)) return { ok: false, nivel: 'alcaldia', mensaje: 'La ubicación debe estar dentro de la Ciudad de México, en tu colonia.' };
  const d = await datos();
  const mia = d.uts.get(Number(unidadId));
  if (!mia) return { ok: true, nivel: null };
  const miAlc = d.alc.get(mia.alcaldiaId);
  const unidadEn = d.indiceUts.total ? d.uts.get(d.indiceUts.buscar(p.lng, p.lat)) : null;

  if (d.totalAlcPoligono) {
    const alcEn = d.alc.get(d.indiceAlc.buscar(p.lng, p.lat));
    if (alcEn && alcEn.id !== mia.alcaldiaId && !(miAlc && miAlc.geom && distanciaBordeKm(miAlc.geom, p) <= TOLERANCIA_KM)) {
      return rechazo('alcaldia', d, mia, unidadEn ? { unidad: unidadEn } : { alcaldia: alcEn.nombre });
    }
    if (!alcEn && miAlc && miAlc.geom && !dentroOCerca(miAlc.geom, p)) return rechazo('alcaldia', d, mia, unidadEn ? { unidad: unidadEn } : null);
  }

  if (mia.geom) {
    if (dentroOCerca(mia.geom, p)) return { ok: true, nivel: null };
    const otra = unidadEn && unidadEn.id !== mia.id ? unidadEn : null;
    return rechazo(otra && otra.alcaldiaId !== mia.alcaldiaId ? 'alcaldia' : 'colonia', d, mia, otra ? { unidad: otra } : null);
  }

  if (unidadEn && unidadEn.id !== mia.id) {
    return rechazo(unidadEn.alcaldiaId !== mia.alcaldiaId ? 'alcaldia' : 'colonia', d, mia, { unidad: unidadEn });
  }

  if (!d.totalAlcPoligono && consultarDireccion && miAlc) {
    const r = await direccionDePunto(p.lat, p.lng).catch(() => null);
    if (r && r.alcaldia) {
      const suya = sinAcentos(miAlc.nombre);
      const dice = sinAcentos(`${r.alcaldia} ${r.texto || ''}`);
      if (!dice.includes(suya)) {
        const cerca = masCercana(d, p);
        return rechazo('alcaldia', d, mia, cerca && cerca.unidad.alcaldiaId !== mia.alcaldiaId ? { unidad: cerca.unidad } : { alcaldia: r.alcaldia });
      }
    }
  }

  if (mia.centro) {
    const km = geo.distanciaKm(mia.centro, p);
    if (km > RADIO_SIN_LIMITE_KM) {
      const cerca = masCercana(d, p);
      const otra = cerca && cerca.unidad.id !== mia.id ? cerca.unidad : null;
      return rechazo(otra && otra.alcaldiaId !== mia.alcaldiaId ? 'alcaldia' : 'colonia', d, mia, otra ? { unidad: otra } : null);
    }
    const cerca = masCercana(d, p);
    if (cerca && cerca.unidad.id !== mia.id && km > 1.5 && cerca.km < km / 2) {
      return rechazo(cerca.unidad.alcaldiaId !== mia.alcaldiaId ? 'alcaldia' : 'colonia', d, mia, { unidad: cerca.unidad });
    }
  }
  return { ok: true, nivel: null };
}

module.exports = { verificar, invalidar };
