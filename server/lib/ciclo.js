'use strict';
const db = require('../db');
const { invalido } = require('./errores');

function activo() {
  return db.uno(`SELECT c.id, c.nombre, c.anio, c.presupuesto_total, c.fase_id, f.nombre AS fase, f.descripcion
                 FROM ciclos c JOIN fases f ON f.id = c.fase_id WHERE c.estado = 'activo' LIMIT 1`);
}

async function exigirActivo(fase) {
  const c = await activo();
  if (!c) throw invalido('No hay un ciclo activo en este momento');
  if (fase && c.fase_id !== fase) {
    const f = await db.uno('SELECT nombre FROM fases WHERE id = ?', [fase]);
    throw invalido(`Esto solo se puede hacer en la fase de ${f.nombre}`);
  }
  return c;
}

module.exports = { activo, exigirActivo };
