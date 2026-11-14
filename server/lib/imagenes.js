'use strict';
const db = require('../db');
const { invalido } = require('./errores');

function tipoDe(buffer) {
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length > 8 && buffer.toString('hex', 0, 8) === '89504e470d0a1a0a') return 'image/png';
  return null;
}

async function guardar(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw invalido('Elige una foto');
  if (buffer.length > 5 * 1024 * 1024) throw invalido('La foto no puede pesar más de 5 MB');
  const tipo = tipoDe(buffer);
  if (!tipo) throw invalido('La foto debe ser JPG o PNG');
  const r = await db.q('INSERT INTO imagenes (tipo, contenido) VALUES (?, ?)', [tipo, buffer]);
  return r.insertId;
}

module.exports = { guardar, tipoDe };
