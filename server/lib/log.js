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

module.exports = {
  tarea,
  info: (...a) => escribir('info', a),
  aviso: (...a) => escribir('aviso', a),
  error: (...a) => escribir('error', a),
};
