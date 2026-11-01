'use strict';
const db = require('../db');
const log = require('./log');
const { ErrorApp } = require('./errores');
const { PP_2026, repartirOficial } = require('./datosOficiales');

const hoyLocal = () => {
  const d = new Date(Date.now() - 6 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
};

async function faseSegunFecha(con, cicloId, fecha = hoyLocal()) {
  const fases = await con.q(
    `SELECT f.clave, f.orden, DATE_FORMAT(cf.fecha_inicio, '%Y-%m-%d') AS ini, DATE_FORMAT(cf.fecha_fin, '%Y-%m-%d') AS fin
     FROM ciclo_fases cf JOIN fases f ON f.id = cf.fase_id WHERE cf.ciclo_id = ? ORDER BY f.orden`, [cicloId]);
  if (!fases.length) return null;
  const dentro = fases.find((f) => f.ini <= fecha && fecha <= f.fin);
  if (dentro) return dentro.clave;
  const empezadas = fases.filter((f) => f.ini <= fecha);
  return (empezadas.length ? empezadas[empezadas.length - 1] : fases[0]).clave;
}

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
  const t = await con.uno('SELECT tipo FROM ciclos WHERE id = ?', [cicloId]);
  if (t && t.tipo === 'oficial') await repartirOficial(con, cicloId);
  else await con.call('sp_calcular_presupuesto', [cicloId]);
}

async function estado(usuarioId) {
  return db.conUsuario(usuarioId, async (con) => {
    const ciclos = await con.q(
      `SELECT c.id, c.nombre, c.tipo, c.estado, c.pausado_en, c.votacion_abierta, f.clave AS fase, f.nombre_es AS fase_es, f.nombre_en AS fase_en,
              (SELECT COUNT(*) FROM ciclo_fases cf WHERE cf.ciclo_id = c.id) AS fases_con_fecha
       FROM ciclos c LEFT JOIN fases f ON f.id = c.fase_actual_id
       WHERE c.estado <> 'cerrado' ORDER BY c.tipo = 'oficial' DESC, c.creado_en DESC, c.id DESC`);
    const activo = ciclos.find((c) => c.estado === 'activo') || null;
    const nombres = await con.q('SELECT clave, nombre_es, nombre_en FROM fases');
    for (const c of ciclos.filter((x) => x.tipo === 'oficial')) {
      const clave = await faseSegunFecha(con, c.id);
      const f = nombres.find((x) => x.clave === clave);
      c.fase_hoy = clave;
      c.fase_hoy_es = f ? f.nombre_es : null;
      c.fase_hoy_en = f ? f.nombre_en : null;
    }
    return {
      modo: activo ? activo.tipo : null,
      activo,
      oficiales: ciclos.filter((c) => c.tipo === 'oficial'),
      practicas: ciclos.filter((c) => c.tipo === 'practica'),
      hoy: hoyLocal(),
      montoOficial: PP_2026.monto,
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
    let fase = c.fase;
    if (c.tipo === 'oficial') {
      const n = await con.uno('SELECT COUNT(*) AS n FROM ciclo_fases WHERE ciclo_id = ?', [c.id]);
      if (!n.n) throw new ErrorApp(409, 'El ciclo oficial no tiene su calendario cargado');
      const conProyectos = await con.uno('SELECT COUNT(*) AS n FROM proyectos WHERE ciclo_id = ?', [c.id]);
      if (!conProyectos.n) await indicesDesdeApis(con, c.id);
      fase = await faseSegunFecha(con, c.id);
    }
    if (actual) await con.q("UPDATE ciclos SET estado = 'borrador', pausado_en = NOW() WHERE id = ?", [actual.id]);
    await con.call('sp_cambiar_fase', [c.id, fase]);
    await con.q('UPDATE ciclos SET pausado_en = NULL WHERE id = ?', [c.id]);
    return { ciclo: c.nombre, fase, pausado: actual ? actual.nombre : null };
  }));
}

async function avanzarOficial() {
  try {
    await db.conSistema(async (con) => {
      const c = await con.uno(
        `SELECT c.id, c.votacion_abierta, f.clave AS fase FROM ciclos c LEFT JOIN fases f ON f.id = c.fase_actual_id
         WHERE c.estado = 'activo' AND c.tipo = 'oficial'`);
      if (!c || Number(c.votacion_abierta)) return;
      const fase = await faseSegunFecha(con, c.id);
      if (fase && fase !== c.fase) {
        await con.call('sp_cambiar_fase', [c.id, fase]);
        log.info(`Ciclo oficial: la fase cambió a «${fase}» según el calendario del IECM`);
      }
    });
  } catch (e) {
    log.tarea('No se pudo actualizar la fase del ciclo oficial:', e);
  }
}

module.exports = { estado, activar, avanzarOficial, faseSegunFecha, indicesDesdeApis, hoyLocal };
