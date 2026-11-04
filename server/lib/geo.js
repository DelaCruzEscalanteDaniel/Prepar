'use strict';

function geometria(g) {
  if (!g) return null;
  let obj = g;
  if (typeof g === 'string') {
    try { obj = JSON.parse(g); } catch { return null; }
  }
  if (!obj || typeof obj !== 'object') return null;
  if (obj.type === 'Feature') obj = obj.geometry;
  if (!obj || !['Polygon', 'MultiPolygon', 'Point'].includes(obj.type) || !Array.isArray(obj.coordinates)) return null;
  const p = primerPunto(obj);
  if (!p || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90) return null;
  return obj;
}

function primerPunto(g) {
  let c = g.coordinates;
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
  return Array.isArray(c) && c.length >= 2 && Number.isFinite(+c[0]) && Number.isFinite(+c[1]) ? [+c[0], +c[1]] : null;
}

function poligonos(g) {
  if (!g) return [];
  if (g.type === 'Polygon') return [g.coordinates];
  if (g.type === 'MultiPolygon') return g.coordinates;
  return [];
}

function caja(g) {
  let a = Infinity; let b = Infinity; let c = -Infinity; let d = -Infinity;
  const ver = (p) => { if (p[0] < a) a = p[0]; if (p[1] < b) b = p[1]; if (p[0] > c) c = p[0]; if (p[1] > d) d = p[1]; };
  if (g.type === 'Point') ver(g.coordinates);
  for (const pol of poligonos(g)) for (const anillo of pol) for (const p of anillo) ver(p);
  return Number.isFinite(a) ? [a, b, c, d] : null;
}

function centro(g) {
  if (!g) return null;
  if (g.type === 'Point') return { lat: +g.coordinates[1], lng: +g.coordinates[0] };
  let mejor = null;
  for (const pol of poligonos(g)) if (pol[0] && (!mejor || pol[0].length > mejor.length)) mejor = pol[0];
  if (!mejor || !mejor.length) return null;
  let A = 0; let x = 0; let y = 0;
  for (let i = 0, j = mejor.length - 1; i < mejor.length; j = i, i += 1) {
    const f = mejor[j][0] * mejor[i][1] - mejor[i][0] * mejor[j][1];
    A += f; x += (mejor[j][0] + mejor[i][0]) * f; y += (mejor[j][1] + mejor[i][1]) * f;
  }
  if (Math.abs(A) < 1e-14) {
    const n = mejor.length;
    return { lng: mejor.reduce((s, p) => s + p[0], 0) / n, lat: mejor.reduce((s, p) => s + p[1], 0) / n };
  }
  return { lng: x / (3 * A), lat: y / (3 * A) };
}

function enAnillo(lng, lat, anillo) {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i, i += 1) {
    const xi = anillo[i][0]; const yi = anillo[i][1]; const xj = anillo[j][0]; const yj = anillo[j][1];
    if (((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) dentro = !dentro;
  }
  return dentro;
}

function contiene(g, lng, lat) {
  for (const pol of poligonos(g)) {
    if (!pol[0] || !enAnillo(lng, lat, pol[0])) continue;
    let enHueco = false;
    for (let k = 1; k < pol.length; k += 1) if (enAnillo(lng, lat, pol[k])) { enHueco = true; break; }
    if (!enHueco) return true;
  }
  return false;
}

function indice(elementos, celda = 0.01) {
  const rejilla = new Map();
  const lista = [];
  for (const e of elementos) {
    const bb = e.geom && caja(e.geom);
    if (!bb || e.geom.type === 'Point') continue;
    const item = { ...e, bb };
    lista.push(item);
    for (let x = Math.floor(bb[0] / celda); x <= Math.floor(bb[2] / celda); x += 1) {
      for (let y = Math.floor(bb[1] / celda); y <= Math.floor(bb[3] / celda); y += 1) {
        const k = `${x}:${y}`;
        if (!rejilla.has(k)) rejilla.set(k, []);
        rejilla.get(k).push(item);
      }
    }
  }
  return {
    total: lista.length,
    buscar(lng, lat) {
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
      const cands = rejilla.get(`${Math.floor(lng / celda)}:${Math.floor(lat / celda)}`);
      if (!cands) return null;
      for (const c of cands) {
        if (lng < c.bb[0] || lng > c.bb[2] || lat < c.bb[1] || lat > c.bb[3]) continue;
        if (contiene(c.geom, lng, lat)) return c.id;
      }
      return null;
    },
  };
}

function distanciaKm(a, b) {
  const R = 6371;
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

const enCdmx = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat > 19.0 && lat < 19.65 && lng > -99.4 && lng < -98.9;

module.exports = { geometria, caja, centro, contiene, indice, distanciaKm, enCdmx };
