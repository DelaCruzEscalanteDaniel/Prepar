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

function fases(cicloId) {
  return db.q(`SELECT f.id, f.nombre, cf.fecha_inicio, cf.fecha_fin
               FROM fases f LEFT JOIN ciclo_fases cf ON cf.fase_id = f.id AND cf.ciclo_id = ?
               ORDER BY f.id`, [cicloId || 0]);
}

function validarFechas(lista) {
  if (!Array.isArray(lista) || lista.length !== 8) throw invalido('Escribe las fechas de las 8 fases');
  const fechas = lista.map((f, i) => {
    const inicio = String((f && f.fecha_inicio) || '');
    const fin = String((f && f.fecha_fin) || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fin)) throw invalido(`Faltan las fechas de la fase ${i + 1}`);
    if (fin < inicio) throw invalido(`En la fase ${i + 1} la fecha de fin es antes que la de inicio`);
    return { fase_id: i + 1, inicio, fin };
  });
  for (let i = 1; i < fechas.length; i += 1) {
    if (fechas[i].inicio <= fechas[i - 1].fin) throw invalido(`La fase ${i + 1} debe empezar después de que termine la fase ${i}`);
  }
  return fechas;
}

async function guardarFechas(t, cicloId, fechas) {
  for (const f of fechas) {
    await t.q('UPDATE ciclo_fases SET fecha_inicio = ?, fecha_fin = ? WHERE ciclo_id = ? AND fase_id = ?', [f.inicio, f.fin, cicloId, f.fase_id]);
  }
}

module.exports = { activo, exigirActivo, fases, validarFechas, guardarFechas };
