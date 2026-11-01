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

module.exports = {
  info: (...a) => escribir('info', a),
  aviso: (...a) => escribir('aviso', a),
  error: (...a) => escribir('error', a),
};
