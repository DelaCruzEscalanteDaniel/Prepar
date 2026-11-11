'use strict';
const db = require('../db');
const { ErrorApp } = require('./errores');

const hoyLocal = () => {
  const d = new Date(Date.now() - 6 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
};

async function indicesDesdeApis(con, cicloId) {
  const m = await con.uno(
    `SELECT MAX(vi.incidencia_delictiva_actual) AS maximo FROM v_indicadores_recientes vi
     JOIN ciclo_unidades cu ON cu.unidad_territorial_id = vi.unidad_territorial_id WHERE cu.ciclo_id = ?`, [cicloId]);
  const max = m && Number(m.maximo) > 0 ? Number(m.maximo) : 0;
  await con.q(
    `UPDATE ciclo_unidades cu LEFT JOIN v_indicadores_recientes vi ON vi.unidad_territorial_id = cu.unidad_territorial_id
     SET cu.poblacion = COALESCE(FLOOR(vi.poblacion_actual), 0),
         cu.poblacion_flotante = COALESCE(FLOOR(vi.poblacion_flotante_actual), 0),
         cu.indice_pobreza = LEAST(GREATEST(COALESCE(vi.indice_pobreza_actual, 0), 0), 1),
         cu.indice_delictivo = IF(? > 0, ROUND(COALESCE(vi.incidencia_delictiva_actual, 0) / ?, 4), 0)
     WHERE cu.ciclo_id = ?`, [max, max || 1, cicloId]);
  await con.q("UPDATE ciclos SET origen_indices = 'api' WHERE id = ?", [cicloId]);
  await con.call('sp_calcular_presupuesto', [cicloId]);
}

async function estado(usuarioId) {
  return db.conUsuario(usuarioId, async (con) => {
    const ciclos = await con.q(
      `SELECT c.id, c.nombre, c.tipo, c.estado, c.pausado_en, c.votacion_abierta, f.clave AS fase, f.nombre_es AS fase_es, f.nombre_en AS fase_en,
              (SELECT COUNT(*) FROM ciclo_fases cf WHERE cf.ciclo_id = c.id) AS fases_con_fecha
       FROM ciclos c LEFT JOIN fases f ON f.id = c.fase_actual_id
       WHERE c.estado <> 'cerrado' ORDER BY c.creado_en DESC, c.id DESC`);
    const activo = ciclos.find((c) => c.estado === 'activo') || null;
    return {
      modo: activo ? 'practica' : null,
      activo,
      practicas: ciclos,
      hoy: hoyLocal(),
    };
  });
}

async function activar(usuarioId, cicloId) {
  return db.conUsuario(usuarioId, (con) => con.transaccion(async () => {
    const c = await con.uno('SELECT c.id, c.nombre, c.tipo, c.estado, f.clave AS fase FROM ciclos c LEFT JOIN fases f ON f.id = c.fase_actual_id WHERE c.id = ? FOR UPDATE', [cicloId]);
    if (!c) throw new ErrorApp(404, 'El ciclo no existe');
    if (c.estado === 'cerrado') throw new ErrorApp(409, 'El ciclo está cerrado y no se puede activar');
    const actual = await con.uno("SELECT id, nombre, votacion_abierta FROM ciclos WHERE estado = 'activo' FOR UPDATE");
    if (actual && actual.id === c.id) return { ciclo: c.nombre, fase: c.fase, sinCambio: true };
    if (actual && Number(actual.votacion_abierta)) {
      throw new ErrorApp(409, `Cierra la votación de «${actual.nombre}» antes de cambiar de ciclo`);
    }
    const fase = c.fase;
    if (actual) await con.q("UPDATE ciclos SET estado = 'borrador', pausado_en = NOW() WHERE id = ?", [actual.id]);
    await con.call('sp_cambiar_fase', [c.id, fase]);
    await con.q('UPDATE ciclos SET pausado_en = NULL WHERE id = ?', [c.id]);
    return { ciclo: c.nombre, fase, pausado: actual ? actual.nombre : null };
  }));
}

module.exports = { estado, activar, indicesDesdeApis, hoyLocal };
