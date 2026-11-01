'use strict';
const crypto = require('crypto');

const ALFABETO = 'ABCDEFGHJKLMNPRSTUVWXYZ23456789';
const LARGO = 5;
const VIGENCIA_MS = 10 * 60 * 1000;
const MAXIMO = 5000;

const GLIFOS = {
  A: [[[0, 6], [2, 0], [4, 6]], [[1, 3.5], [3, 3.5]]],
  B: [[[0, 6], [0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]], [[3, 3], [4, 4], [4, 5], [3, 6], [0, 6]]],
  C: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5]]],
  D: [[[0, 0], [0, 6], [2.5, 6], [4, 4.5], [4, 1.5], [2.5, 0], [0, 0]]],
  E: [[[4, 0], [0, 0], [0, 6], [4, 6]], [[0, 3], [3, 3]]],
  F: [[[4, 0], [0, 0], [0, 6]], [[0, 3], [3, 3]]],
  G: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 3.5], [2.5, 3.5]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  J: [[[4, 0], [4, 5], [3, 6], [1, 6], [0, 5]]],
  K: [[[0, 0], [0, 6]], [[4, 0], [0, 3.5]], [[1.3, 2.6], [4, 6]]],
  L: [[[0, 0], [0, 6], [4, 6]]],
  M: [[[0, 6], [0, 0], [2, 3.5], [4, 0], [4, 6]]],
  N: [[[0, 6], [0, 0], [4, 6], [4, 0]]],
  P: [[[0, 6], [0, 0], [3, 0], [4, 1], [4, 2.5], [3, 3.5], [0, 3.5]]],
  R: [[[0, 6], [0, 0], [3, 0], [4, 1], [4, 2.5], [3, 3.5], [0, 3.5]], [[2, 3.5], [4, 6]]],
  S: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 2], [1, 3], [3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]]],
  T: [[[0, 0], [4, 0]], [[2, 0], [2, 6]]],
  U: [[[0, 0], [0, 5], [1, 6], [3, 6], [4, 5], [4, 0]]],
  V: [[[0, 0], [2, 6], [4, 0]]],
  W: [[[0, 0], [1, 6], [2, 2.5], [3, 6], [4, 0]]],
  X: [[[0, 0], [4, 6]], [[4, 0], [0, 6]]],
  Y: [[[0, 0], [2, 3], [4, 0]], [[2, 3], [2, 6]]],
  Z: [[[0, 0], [4, 0], [0, 6], [4, 6]]],
  2: [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [0, 6], [4, 6]]],
  3: [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [1.5, 3]], [[3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]]],
  4: [[[3, 6], [3, 0], [0, 4], [4, 4]]],
  5: [[[4, 0], [0, 0], [0, 3], [3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]]],
  6: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]]],
  7: [[[0, 0], [4, 0], [1.5, 6]]],
  8: [[[1, 3], [0, 2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [1, 3], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3]]],
  9: [[[4, 3], [1, 3], [0, 2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5]]],
};
const COLORES = ['#1E3A8A', '#7C2D12', '#14532D', '#581C87', '#0F172A', '#9F1239', '#134E4A'];

const azar = (min, max) => min + (crypto.randomInt(0, 10000) / 10000) * (max - min);
const r1 = (n) => Math.round(n * 10) / 10;

function dibujar(texto) {
  const ancho = 210;
  const alto = 72;
  const partes = [`<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}">`,
    `<rect width="${ancho}" height="${alto}" rx="10" fill="#F1F5F9"/>`];
  for (let i = 0; i < 28; i += 1) {
    partes.push(`<circle cx="${r1(azar(0, ancho))}" cy="${r1(azar(0, alto))}" r="${r1(azar(0.8, 2.2))}" fill="#94A3B8" opacity="${r1(azar(0.3, 0.8))}"/>`);
  }
  for (let i = 0; i < 2; i += 1) {
    partes.push(`<path d="M${r1(azar(0, 20))} ${r1(azar(10, 62))} C ${r1(azar(40, 90))} ${r1(azar(-10, 80))}, ${r1(azar(110, 170))} ${r1(azar(-10, 80))}, ${r1(azar(190, 210))} ${r1(azar(10, 62))}" stroke="#64748B" stroke-width="${r1(azar(1.2, 2))}" fill="none" opacity="0.7"/>`);
  }
  const escala = 6.4;
  [...texto].forEach((c, i) => {
    const cx = 18 + i * 37 + azar(-3, 3);
    const cy = 16 + azar(-4, 4);
    const giro = r1(azar(-20, 20));
    const sesgo = r1(azar(-12, 12));
    const color = COLORES[crypto.randomInt(0, COLORES.length)];
    const trazos = GLIFOS[c].map((linea) => 'M' + linea.map(([x, y]) => `${r1((x + azar(-0.25, 0.25)) * escala)} ${r1((y + azar(-0.25, 0.25)) * escala)}`).join(' L')).join(' ');
    partes.push(`<g transform="translate(${r1(cx)} ${r1(cy)}) rotate(${giro} 13 19) skewX(${sesgo})"><path d="${trazos}" stroke="${color}" stroke-width="${r1(azar(3, 3.8))}" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`);
  });
  partes.push(`<path d="M0 ${r1(azar(25, 50))} Q ${r1(azar(60, 150))} ${r1(azar(0, 72))} ${ancho} ${r1(azar(20, 55))}" stroke="#334155" stroke-width="1.4" fill="none" opacity="0.55"/>`);
  partes.push('</svg>');
  return partes.join('');
}

const pendientes = new Map();
function limpiar() {
  const ahora = Date.now();
  for (const [k, v] of pendientes) if (v.vence < ahora) pendientes.delete(k);
  while (pendientes.size > MAXIMO) pendientes.delete(pendientes.keys().next().value);
}

function crear() {
  limpiar();
  let respuesta = '';
  for (let i = 0; i < LARGO; i += 1) respuesta += ALFABETO[crypto.randomInt(0, ALFABETO.length)];
  const id = crypto.randomBytes(16).toString('hex');
  pendientes.set(id, { respuesta, vence: Date.now() + VIGENCIA_MS });
  return { id, imagen: `data:image/svg+xml;base64,${Buffer.from(dibujar(respuesta)).toString('base64')}` };
}

const normalizar = (t) => String(t || '').toUpperCase().replace(/[\s-]+/g, '').slice(0, 12);

function verificar(id, texto) {
  if (typeof id !== 'string' || !/^[0-9a-f]{32}$/.test(id)) return false;
  const p = pendientes.get(id);
  if (!p) return false;
  pendientes.delete(id);
  if (p.vence < Date.now()) return false;
  const a = Buffer.from(normalizar(texto));
  const b = Buffer.from(p.respuesta);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const fallos = new Map();
const VENTANA_FALLOS_MS = 15 * 60 * 1000;
const FALLOS_PARA_PEDIR = 2;
function llavesDe(req, correo) { return [`ip:${req.ip}`, `c:${String(correo || '').toLowerCase()}`]; }
function requiere(req, correo) {
  const ahora = Date.now();
  return llavesDe(req, correo).some((k) => {
    const f = fallos.get(k);
    if (!f) return false;
    if (f.hasta < ahora) { fallos.delete(k); return false; }
    return f.n >= FALLOS_PARA_PEDIR;
  });
}
function anotarFallo(req, correo) {
  const ahora = Date.now();
  if (fallos.size > 20000) for (const [k, v] of fallos) if (v.hasta < ahora) fallos.delete(k);
  for (const k of llavesDe(req, correo)) {
    const f = fallos.get(k);
    if (f && f.hasta >= ahora) f.n += 1;
    else fallos.set(k, { n: 1, hasta: ahora + VENTANA_FALLOS_MS });
  }
}
function limpiarFallos(req, correo) { for (const k of llavesDe(req, correo)) fallos.delete(k); }

module.exports = {
  crear, verificar, requiere, anotarFallo, limpiarFallos, dibujar, ALFABETO,
  _respuesta: (id) => (pendientes.get(id) || {}).respuesta,
  _reiniciar: () => { pendientes.clear(); fallos.clear(); },
};
