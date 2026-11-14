'use strict';
const os = require('os');
const { Worker } = require('worker_threads');
const bcrypt = require('bcryptjs');

const COSTO = 10;
const HILOS = Math.max(1, Math.min(4, (os.cpus() || []).length || 1));
const CODIGO = `
  const { parentPort } = require('worker_threads');
  const bcrypt = require(${JSON.stringify(require.resolve('bcryptjs'))});
  parentPort.on('message', ({ id, op, a, b }) => {
    try {
      const r = op === 'hash' ? bcrypt.hashSync(a, b) : bcrypt.compareSync(a, b);
      parentPort.postMessage({ id, r });
    } catch (e) {
      parentPort.postMessage({ id, e: e.message });
    }
  });`;

let hilos = [];
let siguiente = 0;
let contador = 0;
const pendientes = new Map();

function crearHilo() {
  const w = new Worker(CODIGO, { eval: true, resourceLimits: { maxOldGenerationSizeMb: 64 } });
  w.trabajos = 0;
  w.on('message', ({ id, r, e }) => {
    const p = pendientes.get(id);
    if (!p) return;
    pendientes.delete(id);
    soltar(w);
    if (e) p.rechazar(new Error(e)); else p.resolver(r);
  });
  w.on('error', () => reemplazar(w));
  w.on('exit', () => reemplazar(w));
  w.unref();
  return w;
}

function tomar(w) { if (w.trabajos++ === 0) w.ref(); }
function soltar(w) { if (w.trabajos > 0 && --w.trabajos === 0) w.unref();
}

function reemplazar(w) {
  const i = hilos.indexOf(w);
  if (i < 0) return;
  for (const [id, p] of pendientes) {
    if (p.hilo !== w) continue;
    pendientes.delete(id);
    try { p.resolver(p.op === 'hash' ? bcrypt.hashSync(p.a, p.b) : bcrypt.compareSync(p.a, p.b)); } catch (e) { p.rechazar(e); }
  }
  hilos[i] = crearHilo();
}

function ejecutar(op, a, b) {
  if (!hilos.length) {
    try { hilos = Array.from({ length: HILOS }, crearHilo); } catch { hilos = []; }
  }
  if (!hilos.length) return Promise.resolve(op === 'hash' ? bcrypt.hashSync(a, b) : bcrypt.compareSync(a, b));
  return new Promise((resolver, rechazar) => {
    contador = (contador + 1) % Number.MAX_SAFE_INTEGER;
    const hilo = hilos[siguiente];
    siguiente = (siguiente + 1) % hilos.length;
    pendientes.set(contador, { resolver, rechazar, hilo, op, a, b });
    tomar(hilo);
    hilo.postMessage({ id: contador, op, a, b });
  });
}

const hash = (texto) => ejecutar('hash', String(texto), COSTO);
const comparar = (texto, h) => ejecutar('comparar', String(texto).slice(0, 72), String(h || '')).catch(() => false);

module.exports = { hash, comparar, COSTO };
