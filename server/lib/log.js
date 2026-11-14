'use strict';
const config = require('../config');

function escribir(nivel, args) {
  if (!config.registrarEnConsola && nivel !== 'error') return;
  try {
    const fecha = new Date().toISOString();
    const salida = nivel === 'error' ? console.error : console.log;
    salida(`[${fecha}] ${nivel.toUpperCase()}`, ...args);
  } catch { }
}

const SILENCIO_BD_MS = 5 * 60 * 1000;
let ultimoAvisoBd = 0;
let omitidos = 0;
function tarea(texto, e) {
  const { esErrorConexion } = require('./errores');
  if (!esErrorConexion(e)) { escribir('aviso', [texto, (e && (e.sqlMessage || e.message)) || e]); return; }
  const ahora = Date.now();
  if (ahora - ultimoAvisoBd < SILENCIO_BD_MS) { omitidos += 1; return; }
  const extra = omitidos ? ` (${omitidos} aviso(s) iguales omitidos)` : '';
  ultimoAvisoBd = ahora;
  omitidos = 0;
  escribir('aviso', [`Sin conexión con MySQL (${e.code || e.message}): las tareas automáticas se reanudan solas cuando vuelva.`
    + ' Revisa que la base esté encendida y que DB_HOST, DB_PORT, DB_USER, DB_PASSWORD y DB_SSL del .env sean correctos'
    + ` y que tu red permita conectarse a ese puerto.${extra}`]);
}

const ventanas = new Map();
function enmascarar(c) {
  const [u, d] = String(c || '').split('@');
  return d ? `${u.slice(0, 2)}***@${d}` : undefined;
}
function seguridad(evento, req, datos = {}) {
  const ip = (req && req.ip) || '-';
  const k = `${evento}|${ip}`;
  const ahora = Date.now();
  const v = ventanas.get(k);
  if (v && ahora - v.desde < 60000) { v.n += 1; if (v.n > 10) return; } else {
    if (ventanas.size > 5000) ventanas.clear();
    ventanas.set(k, { desde: ahora, n: 1 });
  }
  const linea = { evento, ip, metodo: req && req.method, ruta: req && String(req.originalUrl || '').split('?')[0].slice(0, 120) };
  if (req && req.usuario) linea.usuario = req.usuario.id;
  for (const [c, val] of Object.entries(datos)) if (val !== undefined) linea[c] = c === 'correo' ? enmascarar(val) : val;
  escribir('seguridad', [JSON.stringify(linea)]);
}

module.exports = {
  seguridad,
  tarea,
  info: (...a) => escribir('info', a),
  aviso: (...a) => escribir('aviso', a),
  error: (...a) => escribir('error', a),
};
