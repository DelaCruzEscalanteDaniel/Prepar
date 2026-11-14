'use strict';

const SQL_CICLO = `
  SELECT c.id, c.nombre, c.anio_simulado, c.estado, c.presupuesto_total, c.votacion_abierta,
         c.votacion_abierta_en, c.votacion_cerrada_en, c.computo_realizado_en, c.resultados_publicados_en,
         c.origen_indices, c.porcentaje_partes_iguales, c.creado_en, c.cerrado_en, c.tipo, c.pausado_en,
         (SELECT a.uuid FROM archivos a WHERE a.id = c.convocatoria_archivo_id AND a.eliminado_en IS NULL) AS convocatoria_uuid,
         f.id AS fase_id, f.clave AS fase, f.nombre_es AS fase_es, f.nombre_en AS fase_en, f.orden AS fase_orden,
         f.que_ocurre_es, f.que_ocurre_en, f.que_puedes_hacer_es, f.que_puedes_hacer_en
  FROM ciclos c LEFT JOIN fases f ON f.id = c.fase_actual_id`;

const cicloActivo = (con) => con.uno(`${SQL_CICLO} WHERE c.estado = 'activo' LIMIT 1`);

const cicloPorId = (con, id) => con.uno(`${SQL_CICLO} WHERE c.id = ?`, [id]);

const ORDEN_FASE = {
  convocatoria: 1, diagnostico_registro: 2, dictaminacion: 3, sorteo_difusion: 4,
  consulta: 5, resultados: 6, ejecucion_seguimiento: 7, evaluacion: 8,
};

const ESTATUS_GANADOR = ['ganador', 'en_ejecucion', 'concluido', 'inejecutable'];

module.exports = { cicloActivo, cicloPorId, ORDEN_FASE, ESTATUS_GANADOR, SQL_CICLO };
