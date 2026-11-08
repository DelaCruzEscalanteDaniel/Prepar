'use strict';
const { adivinar: adivinarCategoria } = require('../lib/categorias');
const express = require('express');
const db = require('../db');
const v = require('../lib/validar');
const { asincrono, limitador } = require('../lib/seguridad');
const { requiere, requiereFuncion } = require('../lib/sesion');
const { cicloActivo, ESTATUS_GANADOR } = require('../lib/comun');
const etapasObra = require('../lib/etapas');
const { peticionInvalida, noEncontrado, conflicto, prohibido } = require('../lib/errores');
const { geocodificar, sugerirDirecciones, direccionDePunto } = require('../lib/geocodificar');

const router = express.Router();
const soloFuncionario = requiere('funcionario');
const personal = requiere('funcionario', 'administrador');
const L = v.LIMITES;

const limiteGeo = limitador({ ventanaMs: 60 * 1000, maximo: 15, clave: (req) => `g:${req.usuario ? req.usuario.id : req.ip}`,
  mensaje: 'Demasiadas búsquedas de direcciones. Espera un momento' });

async function cicloObligatorio(con, fases) {
  const c = await cicloActivo(con);
  if (!c) throw conflicto('No hay un ciclo de simulación activo');
  if (fases && !fases.includes(c.fase)) {
    const nombres = { diagnostico_registro: 'Diagnóstico y Registro', dictaminacion: 'Dictaminación' };
    throw conflicto(`Esta acción solo está disponible en la fase ${fases.map((f) => `"${nombres[f] || f}"`).join(' o ')}`);
  }
  return c;
}

router.get('/func/panel', soloFuncionario, asincrono(async (req, res) => {
  const u = req.usuario;
  const datos = await db.conUsuario(u.id, async (con) => {
    const ciclo = await cicloActivo(con);
    if (!ciclo) return { ciclo: null, funciones: u.funciones, conteos: {} };
    const conteos = await con.uno(
      `SELECT
         SUM(p.estatus = 'registrado' AND p.estado_moderacion = 'visible') AS registros,
         SUM(p.estatus = 'en_dictaminacion') AS dictaminar,
         SUM(p.estado_ubicacion IN ('pendiente', 'no_ubicado') AND p.estatus <> 'retirado') AS sin_ubicar,
         SUM(p.estatus IN ('ganador', 'en_ejecucion')) AS en_seguimiento
       FROM proyectos p JOIN unidades_territoriales ut ON ut.id = p.unidad_territorial_id
       WHERE p.ciclo_id = ? AND ut.alcaldia_id = ?`, [ciclo.id, u.alcaldiaId]);
    const extra = await con.uno(
      `SELECT
         (SELECT COUNT(*) FROM ciclo_unidades cu JOIN unidades_territoriales ut ON ut.id = cu.unidad_territorial_id
           WHERE cu.ciclo_id = ? AND ut.alcaldia_id = ?
             AND NOT EXISTS (SELECT 1 FROM sorteos s WHERE s.ciclo_id = cu.ciclo_id AND s.unidad_territorial_id = cu.unidad_territorial_id)
            AND EXISTS (SELECT 1 FROM proyectos px WHERE px.ciclo_id = cu.ciclo_id AND px.unidad_territorial_id = cu.unidad_territorial_id
                          AND px.estatus <> 'retirado' AND px.estado_moderacion = 'visible')) AS sorteos_pendientes,
         (SELECT COUNT(*) FROM resultados_unidad ru JOIN unidades_territoriales ut ON ut.id = ru.unidad_territorial_id
           WHERE ru.ciclo_id = ? AND ut.alcaldia_id = ? AND ru.caso_especial IS NOT NULL AND ru.proyecto_ganador_id IS NULL) AS casos,
         (SELECT COUNT(*) FROM reportes re JOIN proyectos p ON p.id = re.proyecto_id
           JOIN unidades_territoriales ut ON ut.id = p.unidad_territorial_id
           WHERE p.ciclo_id = ? AND ut.alcaldia_id = ? AND re.estatus = 'pendiente') AS reportes,
         (SELECT COUNT(*) FROM ideas i JOIN unidades_territoriales ut ON ut.id = i.unidad_territorial_id
           WHERE i.ciclo_id = ? AND ut.alcaldia_id = ? AND i.estado = 'visible' AND i.creada_en > NOW() - INTERVAL 7 DAY) AS ideas_recientes`,
      [ciclo.id, u.alcaldiaId, ciclo.id, u.alcaldiaId, ciclo.id, u.alcaldiaId, ciclo.id, u.alcaldiaId]);
    const avisos = await con.q(
      `SELECT av.id, av.titulo, av.mensaje, av.publicado_en, av.alcaldia_id, a.nombre AS alcaldia, (av.autor_id = ?) AS es_mio
       FROM avisos av LEFT JOIN alcaldias a ON a.id = av.alcaldia_id
       WHERE av.ciclo_id = ? AND av.activo AND (av.alcaldia_id IS NULL OR av.alcaldia_id = ?)
       ORDER BY av.publicado_en DESC LIMIT 10`, [u.id, ciclo.id, u.alcaldiaId]);
    const dir = await con.uno('SELECT MAX(actualizado_en) AS ultima, COUNT(*) AS n FROM directorio WHERE alcaldia_id = ?', [u.alcaldiaId]);
    return { ciclo, funciones: u.funciones, conteos: { ...conteos, ...extra }, avisos, directorio: dir };
  });
  res.json(datos);
}));

router.get('/func/registros', soloFuncionario, requiereFuncion('revision_registros'), asincrono(async (req, res) => {
  const u = req.usuario;
  const filtro = req.query.estatus === 'todos' ? null : 'registrado';
  const filas = await db.conUsuario(u.id, async (con) => {
    const ciclo = await cicloActivo(con);
    if (!ciclo) return [];
    return con.q(
      `SELECT p.id, p.folio, p.titulo, p.descripcion, r.nombre_es AS rubro, p.costo_estimado, p.calle, p.numero, p.referencias, p.codigo_postal,
              p.estatus, p.estado_ubicacion, p.creado_en, p.actualizado_en, ut.nombre AS unidad_territorial, us.nombre_completo AS proponente,
              cu.presupuesto_asignado,
              (SELECT a.uuid FROM archivos a WHERE a.id = p.imagen_archivo_id AND a.eliminado_en IS NULL) AS imagen_uuid,
              (SELECT rr.observacion FROM revisiones_registro rr WHERE rr.proyecto_id = p.id AND rr.resultado = 'correccion_solicitada') AS correccion,
              (SELECT rr.revisado_en FROM revisiones_registro rr WHERE rr.proyecto_id = p.id AND rr.resultado = 'correccion_solicitada') AS correccion_en
       FROM proyectos p JOIN unidades_territoriales ut ON ut.id = p.unidad_territorial_id
       JOIN rubros r ON r.id = p.rubro_id JOIN usuarios us ON us.id = p.proponente_id
       JOIN ciclo_unidades cu ON cu.ciclo_id = p.ciclo_id AND cu.unidad_territorial_id = p.unidad_territorial_id
       WHERE p.ciclo_id = ? AND ut.alcaldia_id = ? AND p.estatus <> 'retirado' AND p.estado_moderacion = 'visible'
         AND (? IS NULL OR p.estatus = ?)
       ORDER BY p.creado_en LIMIT 500`, [ciclo.id, u.alcaldiaId, filtro, filtro]);
  });
  res.json(filas);
}));

router.post('/func/registros/:id/revision', soloFuncionario, requiereFuncion('revision_registros'), asincrono(async (req, res) => {
  const id = v.id(req.params.id, 'el proyecto');
  const b = v.cuerpo(req);
  const resultado = v.opcion(b.resultado, ['completo', 'correccion_solicitada'], { campo: 'el resultado de la revisión' });
  const observacion = v.texto(b.observacion, { campo: 'la observación', max: L.comentario, requerido: resultado === 'correccion_solicitada', letras: 3, multilinea: true });
  await db.conUsuario(req.usuario.id, async (con) => {
    await cicloObligatorio(con, ['diagnostico_registro', 'dictaminacion']);
    await con.transaccion(() => con.q(
      'INSERT INTO revisiones_registro (proyecto_id, resultado, observacion) VALUES (?, ?, ?)', [id, resultado, observacion]));
  });
  res.json({ ok: true, mensaje: resultado === 'completo' ? 'El proyecto pasó a dictaminación' : 'Se envió la solicitud de corrección al proponente' });
}));

const TIPOS_MOD = {
  idea: {
    sql: `SELECT i.id, i.contenido AS texto, i.estado, i.creada_en AS fecha, u.nombre_completo AS autor, ut.nombre AS unidad_territorial,
                 r.nombre_es AS contexto
          FROM ideas i JOIN unidades_territoriales ut ON ut.id = i.unidad_territorial_id JOIN usuarios u ON u.id = i.autor_id
          JOIN rubros r ON r.id = i.rubro_id
          WHERE i.ciclo_id = ? AND ut.alcaldia_id = ? AND (? IS NULL OR i.estado = ?) AND (? IS NULL OR i.contenido LIKE ?)
          ORDER BY i.creada_en DESC LIMIT 200`,
  },
  comentario_idea: {
    sql: `SELECT c.id, c.contenido AS texto, c.estado, c.creado_en AS fecha, u.nombre_completo AS autor, ut.nombre AS unidad_territorial,
                 LEFT(i.contenido, 80) AS contexto
          FROM comentarios_idea c JOIN ideas i ON i.id = c.idea_id JOIN unidades_territoriales ut ON ut.id = i.unidad_territorial_id
          JOIN usuarios u ON u.id = c.autor_id
          WHERE i.ciclo_id = ? AND ut.alcaldia_id = ? AND (? IS NULL OR c.estado = ?) AND (? IS NULL OR c.contenido LIKE ?)
          ORDER BY c.creado_en DESC LIMIT 200`,
  },
  proyecto: {
    sql: `SELECT p.id, CONCAT(p.folio, ' · ', p.titulo, ' — ', p.descripcion) AS texto, p.estado_moderacion AS estado, p.creado_en AS fecha,
                 u.nombre_completo AS autor, ut.nombre AS unidad_territorial, p.estatus AS contexto
          FROM proyectos p JOIN unidades_territoriales ut ON ut.id = p.unidad_territorial_id JOIN usuarios u ON u.id = p.proponente_id
          WHERE p.ciclo_id = ? AND ut.alcaldia_id = ? AND p.estatus <> 'retirado' AND (? IS NULL OR p.estado_moderacion = ?)
            AND (? IS NULL OR CONCAT(p.titulo, ' ', p.descripcion) LIKE ?)
          ORDER BY p.creado_en DESC LIMIT 200`,
  },
  comentario_reporte: {
    sql: `SELECT c.id, c.contenido AS texto, c.estado, c.creado_en AS fecha, u.nombre_completo AS autor, ut.nombre AS unidad_territorial,
                 CONCAT(p.folio, ' · reporte #', re.id) AS contexto
          FROM comentarios_reporte c JOIN reportes re ON re.id = c.reporte_id JOIN proyectos p ON p.id = re.proyecto_id
          JOIN unidades_territoriales ut ON ut.id = p.unidad_territorial_id JOIN usuarios u ON u.id = c.autor_id
          WHERE p.ciclo_id = ? AND ut.alcaldia_id = ? AND (? IS NULL OR c.estado = ?) AND (? IS NULL OR c.contenido LIKE ?)
          ORDER BY c.creado_en DESC LIMIT 200`,
  },
};

router.get('/func/moderacion', soloFuncionario, requiereFuncion('moderacion'), asincrono(async (req, res) => {
  const tipo = v.opcion(req.query.tipo || 'idea', Object.keys(TIPOS_MOD), { campo: 'el tipo de contenido' });
  const estado = v.opcion(req.query.estado, ['visible', 'oculto', 'eliminado'], { campo: 'el estado', requerido: false });
  const q = v.busqueda(req.query.q);
  const filas = await db.conUsuario(req.usuario.id, async (con) => {
    const ciclo = await cicloActivo(con);
    if (!ciclo) return [];
    return con.q(TIPOS_MOD[tipo].sql, [ciclo.id, req.usuario.alcaldiaId, estado, estado, q, q]);
  });
  res.json(filas);
}));

router.post('/func/moderacion', soloFuncionario, requiereFuncion('moderacion'), asincrono(async (req, res) => {
  const b = v.cuerpo(req);
  const tipo = v.opcion(b.tipo_objeto, Object.keys(TIPOS_MOD), { campo: 'el tipo de contenido' });
  const objeto = v.id(b.objeto_id, 'el contenido');
  const accion = v.opcion(b.accion, ['ocultar', 'eliminar', 'restaurar'], { campo: 'la acción' });
  const motivo = v.texto(b.motivo, { campo: 'el motivo', max: L.motivo, min: 3, letras: 3, multilinea: true });
  await db.conUsuario(req.usuario.id, (con) => con.transaccion(() => con.q(
    'INSERT INTO moderaciones (tipo_objeto, objeto_id, accion, motivo) VALUES (?, ?, ?, ?)', [tipo, objeto, accion, motivo])));
  const textos = { ocultar: 'El contenido quedó oculto', eliminar: 'El contenido se eliminó', restaurar: 'El contenido se restauró' };
  res.json({ ok: true, mensaje: textos[accion] });
}));

router.get('/func/dictamenes', soloFuncionario, requiereFuncion('dictaminacion'), asincrono(async (req, res) => {
  const u = req.usuario;
  const datos = await db.conUsuario(u.id, async (con) => {
    const ciclo = await cicloActivo(con);
    if (!ciclo) return { ciclo: null, pendientes: [], emitidos: [] };
    const base = `SELECT p.id, p.folio, p.titulo, p.descripcion, r.nombre_es AS rubro, p.costo_estimado, p.calle, p.numero, p.referencias, p.codigo_postal,
                         p.estatus, ut.nombre AS unidad_territorial, cu.presupuesto_asignado,
                         (SELECT a.uuid FROM archivos a WHERE a.id = p.imagen_archivo_id AND a.eliminado_en IS NULL) AS imagen_uuid,
                         d.id AS dictamen_id, d.resultado, d.justificacion, d.emitido_en
                  FROM proyectos p JOIN unidades_territoriales ut ON ut.id = p.unidad_territorial_id
                  JOIN rubros r ON r.id = p.rubro_id
                  JOIN ciclo_unidades cu ON cu.ciclo_id = p.ciclo_id AND cu.unidad_territorial_id = p.unidad_territorial_id
                  LEFT JOIN dictamenes d ON d.proyecto_id = p.id
                  WHERE p.ciclo_id = ? AND ut.alcaldia_id = ? AND p.estado_moderacion = 'visible'`;
    const pendientes = await con.q(`${base} AND p.estatus = 'en_dictaminacion' ORDER BY p.creado_en LIMIT 300`, [ciclo.id, u.alcaldiaId]);
    const emitidos = await con.q(`${base} AND d.emitido_en IS NOT NULL ORDER BY d.emitido_en DESC LIMIT 100`, [ciclo.id, u.alcaldiaId]);
    const ids = pendientes.filter((p) => p.dictamen_id).map((p) => p.dictamen_id);
    const criterios = ids.length ? await con.q(
      `SELECT dictamen_id, criterio_id, cumple, observacion FROM dictamen_criterios WHERE dictamen_id IN (${ids.map(() => '?').join(',')})`, ids) : [];
    pendientes.forEach((p) => { p.criterios = criterios.filter((c) => c.dictamen_id === p.dictamen_id); });
    return { ciclo: { id: ciclo.id, fase: ciclo.fase }, pendientes, emitidos };
  });
  res.json(datos);
}));

router.post('/func/dictamenes/:id', soloFuncionario, requiereFuncion('dictaminacion'), asincrono(async (req, res) => {
  const proyecto = v.id(req.params.id, 'el proyecto');
  const b = v.cuerpo(req);
  const emitir = v.booleano(b.emitir);
  if (!Array.isArray(b.criterios) || b.criterios.length > 50) throw peticionInvalida('Evalúa los criterios del dictamen');
  const criterios = b.criterios.map((c) => {
    if (!c || typeof c !== 'object') throw peticionInvalida('Algún criterio no es válido');
    return {
      id: v.id(c.criterio_id, 'el criterio'),
      cumple: v.booleano(c.cumple),
      observacion: v.texto(c.observacion, { campo: 'la observación del criterio', max: L.comentario, requerido: false, letras: 2, multilinea: true }),
    };
  });
  let resultado = null;
  let justificacion = null;
  if (emitir) {
    resultado = v.opcion(b.resultado, ['viable', 'no_viable'], { campo: 'el resultado del dictamen' });
    justificacion = v.texto(b.justificacion, { campo: 'la justificación', max: L.justificacion, min: 10, letras: 6, multilinea: true });
  }
  await db.conUsuario(req.usuario.id, async (con) => {
    await cicloObligatorio(con, ['dictaminacion']);
    await con.transaccion(async () => {
    const activos = await con.q('SELECT id FROM criterios_dictamen WHERE activo');
    const idsActivos = new Set(activos.map((c) => c.id));
    for (const c of criterios) if (!idsActivos.has(c.id)) throw peticionInvalida('Algún criterio no existe');
    if (emitir) {
      const evaluados = new Set(criterios.map((c) => c.id));
      if ([...idsActivos].some((idc) => !evaluados.has(idc))) throw peticionInvalida('Evalúa todos los criterios antes de emitir el dictamen');
      if (resultado === 'viable' && criterios.some((c) => !c.cumple)) {
        throw peticionInvalida('Un proyecto que no cumple todos los criterios no puede declararse viable');
      }
    }
    let d = await con.uno('SELECT id, emitido_en FROM dictamenes WHERE proyecto_id = ? FOR UPDATE', [proyecto]);
    if (d && d.emitido_en) throw conflicto('El dictamen ya fue emitido y es definitivo');
    if (!d) {
      const r = await con.q('INSERT INTO dictamenes (proyecto_id) VALUES (?)', [proyecto]);
      d = { id: r.insertId };
    }
    for (const c of criterios) {
      await con.q(
        `INSERT INTO dictamen_criterios (dictamen_id, criterio_id, cumple, observacion) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE cumple = VALUES(cumple), observacion = VALUES(observacion)`, [d.id, c.id, c.cumple, c.observacion]);
    }
    if (emitir) {
      await con.q('UPDATE dictamenes SET resultado = ?, justificacion = ?, emitido_en = NOW() WHERE id = ?', [resultado, justificacion, d.id]);
    }
    });
  });
  res.json({ ok: true, mensaje: emitir ? 'El dictamen se emitió y se notificó al proponente' : 'La evaluación se guardó como borrador' });
}));

router.get('/func/sorteos', soloFuncionario, requiereFuncion('dictaminacion'), asincrono(async (req, res) => {
  const u = req.usuario;
  const datos = await db.conUsuario(u.id, async (con) => {
    const ciclo = await cicloActivo(con);
    if (!ciclo) return { ciclo: null, unidades: [] };
    const unidades = await con.q(
      `SELECT ut.id, ut.nombre, ut.tipo, cu.presupuesto_asignado, s.realizado_en,
              (SELECT COUNT(*) FROM proyectos p WHERE p.ciclo_id = cu.ciclo_id AND p.unidad_territorial_id = ut.id
                 AND p.estatus IN ('viable', 'en_consulta') AND p.estado_moderacion = 'visible') AS viables,
              (SELECT COUNT(*) FROM proyectos p WHERE p.ciclo_id = cu.ciclo_id AND p.unidad_territorial_id = ut.id
                 AND p.estatus IN ('registrado', 'en_dictaminacion') AND p.estado_moderacion = 'visible') AS sin_dictamen,
              (SELECT COUNT(*) FROM proyectos p WHERE p.ciclo_id = cu.ciclo_id AND p.unidad_territorial_id = ut.id
                 AND p.estatus <> 'retirado' AND p.estado_moderacion = 'visible') AS proyectos
       FROM ciclo_unidades cu JOIN unidades_territoriales ut ON ut.id = cu.unidad_territorial_id
       LEFT JOIN sorteos s ON s.ciclo_id = cu.ciclo_id AND s.unidad_territorial_id = ut.id
       WHERE cu.ciclo_id = ? AND ut.alcaldia_id = ? ORDER BY ut.nombre`, [ciclo.id, u.alcaldiaId]);
    const boletas = await con.q(
      `SELECT b.unidad_territorial_id, b.numero_sorteo, b.folio, b.titulo FROM v_boleta b
       JOIN unidades_territoriales ut ON ut.id = b.unidad_territorial_id
       WHERE b.ciclo_id = ? AND ut.alcaldia_id = ? ORDER BY b.numero_sorteo`, [ciclo.id, u.alcaldiaId]);
    const viables = await con.q(
      `SELECT p.unidad_territorial_id, p.folio, p.titulo FROM proyectos p JOIN unidades_territoriales ut ON ut.id = p.unidad_territorial_id
       WHERE p.ciclo_id = ? AND ut.alcaldia_id = ? AND p.estatus IN ('viable', 'en_consulta') AND p.estado_moderacion = 'visible'
       ORDER BY p.folio`, [ciclo.id, u.alcaldiaId]);
    const conProyectos = unidades.filter((x) => Number(x.proyectos) > 0 || x.realizado_en);
    conProyectos.forEach((x) => {
      x.boleta = boletas.filter((b) => b.unidad_territorial_id === x.id);
      x.proyectos_viables = viables.filter((b) => b.unidad_territorial_id === x.id);
    });
    return { ciclo: { id: ciclo.id, fase: ciclo.fase }, unidades: conProyectos, sin_proyectos: unidades.length - conProyectos.length };
  });
  res.json(datos);
}));

router.post('/func/sorteos/:ut', soloFuncionario, requiereFuncion('dictaminacion'), asincrono(async (req, res) => {
  const ut = v.id(req.params.ut, 'la unidad territorial');
  const boleta = await db.conUsuario(req.usuario.id, async (con) => {
    const ciclo = await cicloObligatorio(con);
    return con.call('sp_realizar_sorteo', [ciclo.id, ut]);
  });
  res.json({ ok: true, boleta, mensaje: boleta.length ? `Sorteo realizado: la boleta tiene ${boleta.length} proyecto(s)` : 'Sorteo realizado: no hubo proyectos viables en esta unidad' });
}));

router.get('/func/casos', soloFuncionario, requiereFuncion('consulta'), asincrono(async (req, res) => {
  const u = req.usuario;
  const datos = await db.conUsuario(u.id, async (con) => {
    const ciclo = await cicloActivo(con);
    if (!ciclo) return { ciclo: null, casos: [] };
    const casos = await con.q(
      `SELECT ru.unidad_territorial_id, ut.nombre AS unidad_territorial, ru.total_votos, ru.caso_especial, ru.metodo,
              ru.justificacion, ru.resuelto_en, p.folio AS ganador_folio, p.titulo AS ganador_titulo
       FROM resultados_unidad ru JOIN unidades_territoriales ut ON ut.id = ru.unidad_territorial_id
       LEFT JOIN proyectos p ON p.id = ru.proyecto_ganador_id
       WHERE ru.ciclo_id = ? AND ut.alcaldia_id = ? AND ru.caso_especial IS NOT NULL ORDER BY ut.nombre`, [ciclo.id, u.alcaldiaId]);
    const candidatos = await con.q(
      `SELECT rp.unidad_territorial_id, rp.proyecto_id, rp.total_votos, rp.posicion, p.folio, p.titulo, p.numero_sorteo
       FROM resultados_proyecto rp JOIN proyectos p ON p.id = rp.proyecto_id
       JOIN unidades_territoriales ut ON ut.id = rp.unidad_territorial_id
       WHERE rp.ciclo_id = ? AND ut.alcaldia_id = ? ORDER BY rp.posicion, p.numero_sorteo`, [ciclo.id, u.alcaldiaId]);
    casos.forEach((c) => {
      c.candidatos = candidatos.filter((x) => x.unidad_territorial_id === c.unidad_territorial_id
        && (c.caso_especial !== 'empate' || x.posicion === 1));
    });
    return { ciclo: { id: ciclo.id, fase: ciclo.fase, publicados: !!ciclo.resultados_publicados_en, computo: !!ciclo.computo_realizado_en }, casos };
  });
  res.json(datos);
}));

router.post('/func/casos/:ut', soloFuncionario, requiereFuncion('consulta'), asincrono(async (req, res) => {
  const ut = v.id(req.params.ut, 'la unidad territorial');
  const b = v.cuerpo(req);
  const metodo = v.opcion(b.metodo, ['asamblea_seleccion', 'asamblea_sorteo'], { campo: 'el método' });
  const justificacion = v.texto(b.justificacion, { campo: 'la justificación', max: L.justificacion, min: 10, letras: 6, multilinea: true });
  const proyecto = metodo === 'asamblea_seleccion' ? v.id(b.proyecto_id, 'el proyecto seleccionado') : null;
  const filas = await db.conUsuario(req.usuario.id, async (con) => {
    const ciclo = await cicloObligatorio(con);
    return con.call('sp_resolver_caso_especial', [ciclo.id, ut, metodo, justificacion, proyecto]);
  });
  res.json({ ok: true, proyecto_ganador_id: filas[0] && filas[0].proyecto_ganador_id, mensaje: 'El caso especial quedó resuelto' });
}));

router.get('/func/ubicaciones', soloFuncionario, asincrono(async (req, res) => {
  const u = req.usuario;
  const estado = v.opcion(req.query.estado, ['pendiente', 'ubicado', 'no_ubicado', 'corregido'], { campo: 'el estado', requerido: false });
  const filas = await db.conUsuario(u.id, async (con) => {
    const ciclo = await cicloActivo(con);
    if (!ciclo) return [];
    return con.q(
      `SELECT p.id, p.folio, p.titulo, p.calle, p.numero, p.referencias, p.codigo_postal, p.latitud, p.longitud, p.estado_ubicacion, p.estatus, p.rubro_id, p.categoria,
              ut.id AS unidad_territorial_id, ut.nombre AS unidad_territorial, ut.latitud AS ut_latitud, ut.longitud AS ut_longitud
       FROM proyectos p JOIN unidades_territoriales ut ON ut.id = p.unidad_territorial_id
       WHERE p.ciclo_id = ? AND ut.alcaldia_id = ? AND p.estatus <> 'retirado' AND p.estado_moderacion = 'visible'
         AND (? IS NULL OR p.estado_ubicacion = ?)
       ORDER BY FIELD(p.estado_ubicacion, 'no_ubicado', 'pendiente', 'ubicado', 'corregido'), p.folio LIMIT 1000`,
      [ciclo.id, u.alcaldiaId, estado, estado]);
  });
  filas.forEach((p) => { if (!p.categoria) p.categoria = adivinarCategoria(p.titulo, ''); });
  res.json(filas);
}));

router.put('/func/ubicaciones/:id', soloFuncionario, asincrono(async (req, res) => {
  const id = v.id(req.params.id, 'el proyecto');
  const b = v.cuerpo(req);
  const calle = v.texto(b.calle, { campo: 'la calle', max: L.calle, min: 2, letras: 2 });
  const numero = v.texto(b.numero, { campo: 'el número', max: L.numero, requerido: false });
  if (numero && !/^s\/?n$/i.test(numero) && !/\d/.test(numero)) throw peticionInvalida('El número exterior debe tener dígitos (por ejemplo 45 o 12-B) o escribe S/N');
  const referencias = v.texto(b.referencias, { campo: 'las referencias', max: L.referencias, requerido: false, letras: 2 });
  let coords = v.coordenadas(b.latitud, b.longitud, false);
  let geoId = null;
  const proyecto = await db.conUsuario(req.usuario.id, (con) => con.uno(
    `SELECT p.id, ut.nombre AS unidad, a.nombre AS alcaldia, ut.alcaldia_id FROM proyectos p
     JOIN unidades_territoriales ut ON ut.id = p.unidad_territorial_id JOIN alcaldias a ON a.id = ut.alcaldia_id WHERE p.id = ?`, [id]));
  if (!proyecto) throw noEncontrado('El proyecto no existe');
  if (proyecto.alcaldia_id !== req.usuario.alcaldiaId) throw prohibido('El proyecto no es de tu alcaldía');
  if (!coords) {
    const g = await geocodificar(`${calle}${numero ? ` ${numero}` : ''}, ${proyecto.unidad}, ${proyecto.alcaldia}, Ciudad de México`);
    if (g) { coords = { latitud: g.latitud, longitud: g.longitud }; geoId = g.id; }
  }
  await db.conUsuario(req.usuario.id, (con) => con.q(
    'UPDATE proyectos SET calle = ?, numero = ?, referencias = ?, latitud = ?, longitud = ?, geocodificacion_id = ? WHERE id = ?',
    [calle, numero, referencias, coords ? coords.latitud : null, coords ? coords.longitud : null, geoId, id]));
  res.json({
    ok: true, ubicado: !!coords, latitud: coords && coords.latitud, longitud: coords && coords.longitud,
    mensaje: coords ? 'La ubicación del proyecto se corrigió' : 'Se guardó la dirección, pero no se encontró en el mapa. Marca el punto manualmente',
  });
}));

router.post('/geocodificar', requiere(), limiteGeo, asincrono(async (req, res) => {
  const direccion = v.texto(v.cuerpo(req).direccion, { campo: 'la dirección', max: 250, min: 4, letras: 3 });
  const g = await geocodificar(/ciudad de m[eé]xico|cdmx/i.test(direccion) ? direccion : `${direccion}, Ciudad de México`);
  res.json(g ? { encontrado: true, latitud: g.latitud, longitud: g.longitud, direccion: g.direccion } : { encontrado: false });
}));

function sinAcentos(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }

async function lugarDe(u) {
  return db.conSistema((con) => (u.unidadId
    ? con.uno('SELECT ut.nombre AS colonia, a.id AS alcaldia_id, a.nombre AS alcaldia FROM unidades_territoriales ut JOIN alcaldias a ON a.id = ut.alcaldia_id WHERE ut.id = ?', [u.unidadId])
    : con.uno('SELECT NULL AS colonia, a.id AS alcaldia_id, a.nombre AS alcaldia FROM alcaldias a WHERE a.id = ?', [u.alcaldiaId || 0])));
}

router.get('/direcciones/locales', requiere(), limiteGeo, asincrono(async (req, res) => {
  const q = v.texto(req.query.q, { campo: 'la búsqueda', max: 60, min: 2 });
  const lugar = await lugarDe(req.usuario);
  if (!lugar) return res.json([]);
  const filas = await db.conSistema((con) => con.q(
    `SELECT p.calle, MAX(p.codigo_postal) AS codigo_postal, ut.nombre AS colonia, COUNT(*) AS veces
     FROM proyectos p JOIN unidades_territoriales ut ON ut.id = p.unidad_territorial_id
     WHERE ut.alcaldia_id = ? AND p.calle LIKE ? AND p.estado_moderacion = 'visible'
     GROUP BY p.calle, ut.nombre ORDER BY (ut.nombre = ?) DESC, veces DESC, p.calle LIMIT 8`,
    [lugar.alcaldia_id, `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`, lugar.colonia || '']));
  res.json(filas.map((f) => ({ calle: f.calle, codigo_postal: f.codigo_postal, colonia: f.colonia })));
}));

router.post('/direcciones/buscar', requiere(), limiteGeo, asincrono(async (req, res) => {
  const b = v.cuerpo(req);
  const calle = v.texto(b.calle, { campo: 'la calle', max: L.calle, min: 2, letras: 2 });
  const numero = v.texto(b.numero, { campo: 'el número', max: L.numero, requerido: false });
  const cp = v.codigoPostal(b.codigo_postal);
  const lugar = await lugarDe(req.usuario);
  const base = `${calle}${numero && !/^s\/?n$/i.test(numero) ? ` ${numero}` : ''}`;
  const intentos = [
    `${base}, ${cp ? `${cp}, ` : ''}${lugar && lugar.colonia ? `${lugar.colonia}, ` : ''}${lugar ? `${lugar.alcaldia}, ` : ''}Ciudad de México`,
    `${base}, ${cp ? `${cp}, ` : ''}${lugar ? `${lugar.alcaldia}, ` : ''}Ciudad de México`,
    `${base}, Ciudad de México`,
  ];
  let lista = [];
  for (const q of [...new Set(intentos)]) {
    lista = await sugerirDirecciones(q);
    if (lista.length) break;
  }
  const alc = lugar ? sinAcentos(lugar.alcaldia) : '';
  res.json({
    disponible: lista.length > 0 || require('../config').geocodificacion,
    sugerencias: lista.map((x) => ({ ...x, numero: x.numero || numero || null, codigo_postal: x.codigo_postal || cp || null,
      en_tu_alcaldia: !!alc && sinAcentos(`${x.alcaldia} ${x.texto}`).includes(alc) })),
  });
}));

router.post('/direcciones/punto', requiere(), limiteGeo, asincrono(async (req, res) => {
  const b = v.cuerpo(req);
  const c = v.coordenadas(b.latitud, b.longitud, true);
  const d = await direccionDePunto(c.latitud, c.longitud);
  res.json(d ? { encontrado: true, ...d } : { encontrado: false });
}));

router.get('/func/seguimiento', soloFuncionario, requiereFuncion('seguimiento'), asincrono(async (req, res) => {
  const u = req.usuario;
  const filas = await db.conUsuario(u.id, async (con) => {
    const ciclo = await cicloActivo(con);
    if (!ciclo) return { ciclo: null, proyectos: [] };
    const proyectos = await con.q(
      `SELECT p.id, p.folio, p.titulo, p.estatus, p.avance_porcentaje, p.monto_ejercido, cu.presupuesto_asignado, p.costo_estimado,
              ut.nombre AS unidad_territorial,
              (SELECT ap.nota FROM avances_proyecto ap WHERE ap.proyecto_id = p.id ORDER BY ap.registrado_en DESC, ap.id DESC LIMIT 1) AS ultima_nota,
              (SELECT ap.registrado_en FROM avances_proyecto ap WHERE ap.proyecto_id = p.id ORDER BY ap.registrado_en DESC, ap.id DESC LIMIT 1) AS ultimo_avance,
              (SELECT COUNT(*) FROM reportes re WHERE re.proyecto_id = p.id AND re.estatus = 'pendiente') AS reportes_pendientes
       FROM proyectos p JOIN unidades_territoriales ut ON ut.id = p.unidad_territorial_id
       JOIN ciclo_unidades cu ON cu.ciclo_id = p.ciclo_id AND cu.unidad_territorial_id = p.unidad_territorial_id
       WHERE p.ciclo_id = ? AND ut.alcaldia_id = ? AND p.estatus IN (?) ORDER BY p.folio`,
      [ciclo.id, u.alcaldiaId, ESTATUS_GANADOR]);
    const etapas = await etapasObra.etapasDeVarios(con, proyectos.map((p) => p.id));
    for (const p of proyectos) {
      p.etapas = etapas.get(Number(p.id)) || [];
      p.avance_financiero = etapasObra.avanceFinanciero(p.monto_ejercido, p.costo_estimado, p.presupuesto_asignado);
      p.alerta_gasto = etapasObra.alerta(p.avance_porcentaje, p.avance_financiero);
    }
    return { ciclo: { id: ciclo.id, fase: ciclo.fase, fase_orden: ciclo.fase_orden }, proyectos };
  });
  res.json(filas);
}));

async function obraBloqueada(con, id, alcaldiaId) {
  const p = await con.uno(
    `SELECT p.id, p.estatus, p.monto_ejercido, ut.alcaldia_id FROM proyectos p
     JOIN unidades_territoriales ut ON ut.id = p.unidad_territorial_id WHERE p.id = ? FOR UPDATE`, [id]);
  if (!p) throw noEncontrado('El proyecto no existe');
  if (Number(p.alcaldia_id) !== Number(alcaldiaId)) throw prohibido('El proyecto no es de tu alcaldía');
  if (!ESTATUS_GANADOR.includes(p.estatus)) throw conflicto('Solo se registra avance de proyectos ganadores');
  return p;
}

router.post('/func/seguimiento/:id/avance', soloFuncionario, requiereFuncion('seguimiento'), asincrono(async (req, res) => {
  const id = v.id(req.params.id, 'el proyecto');
  const b = v.cuerpo(req);
  const monto = v.decimal(b.monto_ejercido, { campo: 'el monto ejercido', min: 0 });
  const estatus = v.opcion(b.estatus, ESTATUS_GANADOR, { campo: 'el estatus' });
  const nota = v.texto(b.nota, { campo: 'la nota para los vecinos', max: L.nota, requerido: false, letras: 3, multilinea: true });
  const justif = estatus === 'inejecutable'
    ? v.texto(b.justificacion_inejecutable, { campo: 'la justificación de por qué es inejecutable', max: L.justificacion, min: 10, letras: 6, multilinea: true })
    : null;
  await db.conUsuario(req.usuario.id, (con) => con.transaccion(async () => {
    await obraBloqueada(con, id, req.usuario.alcaldiaId);
    const porcentaje = etapasObra.porcentaje(await etapasObra.etapasDe(con, id));
    if (estatus === 'concluido' && porcentaje < 100) throw peticionInvalida('Para marcar el proyecto como concluido deben estar cumplidas todas sus etapas');
    await con.q(
      `INSERT INTO avances_proyecto (proyecto_id, porcentaje, monto_ejercido, estatus, nota, justificacion_inejecutable)
       VALUES (?, ?, ?, ?, ?, ?)`, [id, porcentaje, monto, estatus, nota, justif]);
  }));
  res.json({ ok: true, mensaje: 'El avance se registró y ya lo pueden ver los vecinos' });
}));

router.post('/func/seguimiento/:id/etapa', soloFuncionario, requiereFuncion('seguimiento'), asincrono(async (req, res) => {
  const id = v.id(req.params.id, 'el proyecto');
  const b = v.cuerpo(req);
  const etapaId = v.id(b.etapa_id, 'la etapa');
  const evidencia = v.texto(b.evidencia, { campo: 'la evidencia de la etapa', max: L.nota, min: 10, letras: 6, multilinea: true });
  const r = await db.conUsuario(req.usuario.id, (con) => con.transaccion(async () => {
    const p = await obraBloqueada(con, id, req.usuario.alcaldiaId);
    if (p.estatus === 'concluido') throw conflicto('El proyecto ya está concluido');
    if (p.estatus === 'inejecutable') throw conflicto('El proyecto se declaró inejecutable');
    const etapas = await etapasObra.etapasDe(con, id);
    const etapa = etapas.find((e) => e.id === etapaId);
    if (!etapa) throw peticionInvalida('Esa etapa no corresponde a este proyecto');
    if (etapa.cumplida_en) throw conflicto('Esa etapa ya está marcada como cumplida');
    const siguiente = etapas.find((e) => !e.cumplida_en);
    if (siguiente.id !== etapaId) throw conflicto(`Las etapas se cumplen en orden: primero marca «${siguiente.nombre_es}»`);
    await con.q('INSERT INTO etapas_proyecto (proyecto_id, etapa_id, evidencia, usuario_id) VALUES (?, ?, ?, ?)', [id, etapaId, evidencia, req.usuario.id]);
    etapa.cumplida_en = new Date();
    const porcentaje = etapasObra.porcentaje(etapas);
    const estatus = porcentaje >= 100 ? 'concluido' : 'en_ejecucion';
    await con.q('INSERT INTO avances_proyecto (proyecto_id, porcentaje, monto_ejercido, estatus, nota) VALUES (?, ?, ?, ?, ?)',
      [id, porcentaje, p.monto_ejercido, estatus, evidencia]);
    return { porcentaje, estatus };
  }));
  res.json({ ok: true, ...r, mensaje: r.estatus === 'concluido' ? 'Se cumplieron todas las etapas: el proyecto quedó concluido' : 'La etapa se marcó como cumplida y ya la pueden ver los vecinos' });
}));

router.get('/func/reportes', soloFuncionario, requiereFuncion('seguimiento'), asincrono(async (req, res) => {
  const estatus = v.opcion(req.query.estatus, ['pendiente', 'atendido'], { campo: 'el estatus', requerido: false });
  const filas = await db.conUsuario(req.usuario.id, async (con) => {
    const rep = await con.q(
      `SELECT r.id, r.proyecto_id, r.folio, r.proyecto, r.tipo, r.descripcion, r.estatus, r.respuesta, r.creado_en, r.autor, r.total_comentarios,
              (SELECT GROUP_CONCAT(a.uuid ORDER BY f.orden SEPARATOR ',') FROM reporte_fotos f
                 JOIN archivos a ON a.id = f.archivo_id AND a.eliminado_en IS NULL WHERE f.reporte_id = r.id) AS fotos
       FROM v_reportes r JOIN proyectos p ON p.id = r.proyecto_id JOIN ciclos c ON c.id = p.ciclo_id
       WHERE r.alcaldia_id = ? AND c.estado = 'activo' AND (? IS NULL OR r.estatus = ?)
       ORDER BY r.estatus = 'pendiente' DESC, r.creado_en DESC LIMIT 300`, [req.usuario.alcaldiaId, estatus, estatus]);
    rep.forEach((r) => { r.fotos = r.fotos ? r.fotos.split(',') : []; });
    return rep;
  });
  res.json(filas);
}));

router.post('/func/reportes/:id', soloFuncionario, requiereFuncion('seguimiento'), asincrono(async (req, res) => {
  const id = v.id(req.params.id, 'el reporte');
  const b = v.cuerpo(req);
  const accion = v.opcion(b.accion, ['atender', 'eliminar'], { campo: 'la acción' });
  const texto = v.texto(b.texto, { campo: accion === 'atender' ? 'la respuesta al vecino' : 'el motivo de eliminación', max: L.comentario, min: 5, letras: 4, multilinea: true });
  await db.conUsuario(req.usuario.id, async (con) => {
    const r = await con.uno('SELECT estatus FROM reportes WHERE id = ?', [id]);
    if (!r) throw noEncontrado('El reporte no existe');
    if (r.estatus !== 'pendiente') throw conflicto('Este reporte ya fue revisado');
    await (accion === 'atender'
      ? con.q("UPDATE reportes SET estatus = 'atendido', respuesta = ? WHERE id = ? AND estatus = 'pendiente'", [texto, id])
      : con.q("UPDATE reportes SET estatus = 'eliminado', motivo_eliminacion = ? WHERE id = ? AND estatus = 'pendiente'", [texto, id]));
  });
  res.json({ ok: true, mensaje: accion === 'atender' ? 'El reporte quedó como Atendido y se notificó al vecino' : 'El reporte se eliminó' });
}));

function datosDirectorio(b, alcaldiaPorDefecto) {
  return {
    alcaldia: v.id(b.alcaldia_id ?? alcaldiaPorDefecto, 'la alcaldía'),
    tipo: v.opcion(b.tipo, ['alcaldia', 'titular', 'sede_atencion'], { campo: 'el tipo de registro' }),
    cargo: v.texto(b.cargo, { campo: 'el cargo', max: L.cargo, min: 2, letras: 2 }),
    titular: v.texto(b.nombre_titular, { campo: 'el nombre de la persona titular', max: L.nombre, requerido: false, letras: 3 }),
    temas: v.texto(b.temas, { campo: 'los temas de atención', max: L.temas, requerido: false, letras: 3 }),
    direccion: v.texto(b.direccion, { campo: 'la dirección', max: L.direccion, requerido: false, letras: 3 }),
    telefono: v.telefono(b.telefono),
    correo: v.correo(b.correo, { requerido: false, campo: 'el correo' }),
    web: v.url(b.sitio_web),
  };
}

function alcaldiaPermitida(req, alcaldia) {
  if (req.usuario.rol === 'funcionario' && alcaldia !== req.usuario.alcaldiaId) throw prohibido('Solo puedes editar el directorio de tu alcaldía');
}

router.post('/func/directorio', personal, requiereFuncion('directorio'), asincrono(async (req, res) => {
  const d = datosDirectorio(v.cuerpo(req), req.usuario.alcaldiaId);
  alcaldiaPermitida(req, d.alcaldia);
  const r = await db.conUsuario(req.usuario.id, (con) => con.q(
    `INSERT INTO directorio (alcaldia_id, tipo, cargo, nombre_titular, temas, direccion, telefono, correo, sitio_web, fuente_nombre, fuente_url, consultado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Captura de un funcionario de la alcaldía', NULL, CURDATE())`, [d.alcaldia, d.tipo, d.cargo, d.titular, d.temas, d.direccion, d.telefono, d.correo, d.web]));
  res.status(201).json({ ok: true, id: r.insertId, mensaje: 'El registro se agregó al directorio' });
}));

router.put('/func/directorio/:id', personal, requiereFuncion('directorio'), asincrono(async (req, res) => {
  const id = v.id(req.params.id, 'el registro');
  const d = datosDirectorio(v.cuerpo(req), req.usuario.alcaldiaId);
  alcaldiaPermitida(req, d.alcaldia);
  const r = await db.conUsuario(req.usuario.id, async (con) => {
    const previo = await con.uno('SELECT alcaldia_id FROM directorio WHERE id = ?', [id]);
    if (!previo) throw noEncontrado('El registro no existe');
    alcaldiaPermitida(req, previo.alcaldia_id);
    return con.q(
      `UPDATE directorio SET alcaldia_id = ?, tipo = ?, cargo = ?, nombre_titular = ?, temas = ?, direccion = ?, telefono = ?,
                             correo = ?, sitio_web = ?, fuente_nombre = 'Captura de un funcionario de la alcaldía', fuente_url = NULL,
                             consultado_en = CURDATE() WHERE id = ?`,
      [d.alcaldia, d.tipo, d.cargo, d.titular, d.temas, d.direccion, d.telefono, d.correo, d.web, id]);
  });
  res.json({ ok: true, cambios: r.affectedRows, mensaje: 'El registro del directorio se actualizó' });
}));

router.delete('/func/directorio/:id', personal, requiereFuncion('directorio'), asincrono(async (req, res) => {
  const id = v.id(req.params.id, 'el registro');
  await db.conUsuario(req.usuario.id, async (con) => {
    const previo = await con.uno('SELECT alcaldia_id FROM directorio WHERE id = ?', [id]);
    if (!previo) throw noEncontrado('El registro no existe');
    alcaldiaPermitida(req, previo.alcaldia_id);
    await con.q('DELETE FROM directorio WHERE id = ?', [id]);
  });
  res.json({ ok: true, mensaje: 'El registro se eliminó del directorio' });
}));

router.get('/avisos', personal, asincrono(async (req, res) => {
  const u = req.usuario;
  const filas = await db.conUsuario(u.id, async (con) => {
    const ciclo = await cicloActivo(con);
    if (!ciclo) return [];
    return con.q(
      `SELECT av.id, av.titulo, av.mensaje, av.publicado_en, av.activo, av.vigente_hasta, av.alcaldia_id, a.nombre AS alcaldia,
              us.nombre_completo AS autor, (av.autor_id = ?) AS es_mio
       FROM avisos av LEFT JOIN alcaldias a ON a.id = av.alcaldia_id JOIN usuarios us ON us.id = av.autor_id
       WHERE av.ciclo_id = ? AND (? = 'administrador' OR av.alcaldia_id IS NULL OR av.alcaldia_id = ?)
       ORDER BY av.publicado_en DESC LIMIT 100`, [u.id, ciclo.id, u.rol, u.alcaldiaId || 0]);
  });
  res.json(filas);
}));

router.post('/avisos', personal, asincrono(async (req, res) => {
  const b = v.cuerpo(req);
  const titulo = v.texto(b.titulo, { campo: 'el título del aviso', max: L.avisoTitulo, min: 3, letras: 3, revisar: true });
  const mensaje = v.texto(b.mensaje, { campo: 'el mensaje', max: L.avisoMensaje, min: 5, letras: 5, multilinea: true });
  let alcaldia = null;
  if (req.usuario.rol === 'funcionario') {
    alcaldia = v.opcion(b.alcance || 'mi_alcaldia', ['todas', 'mi_alcaldia'], { campo: 'a quién va dirigido' }) === 'todas' ? null : req.usuario.alcaldiaId;
  } else {
    alcaldia = v.id(b.alcaldia_id, 'la alcaldía', false);
  }
  const vigente = v.fecha(b.vigente_hasta, { campo: 'la fecha de vigencia', requerido: false });
  const hoy = new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10);
  if (vigente && vigente < hoy) throw peticionInvalida('La fecha de vigencia no puede ser anterior a hoy');
  const enUnAnio = new Date(Date.now() - 6 * 3600 * 1000 + 366 * 86400000).toISOString().slice(0, 10);
  if (vigente && vigente > enUnAnio) throw peticionInvalida('La fecha de vigencia no puede ser de más de un año');
  await db.conUsuario(req.usuario.id, (con) => con.q('INSERT INTO avisos (alcaldia_id, titulo, mensaje, vigente_hasta) VALUES (?, ?, ?, ?)', [alcaldia, titulo, mensaje, vigente]));
  res.status(201).json({ ok: true, mensaje: 'El aviso se publicó en el panel de los ciudadanos' });
}));

router.post('/avisos/:id/retirar', personal, asincrono(async (req, res) => {
  const id = v.id(req.params.id, 'el aviso');
  const r = await db.conUsuario(req.usuario.id, (con) => con.q(
    'UPDATE avisos SET activo = FALSE WHERE id = ? AND (autor_id = ? OR ? = \'administrador\')', [id, req.usuario.id, req.usuario.rol]));
  if (!r.affectedRows) throw noEncontrado('El aviso no existe o no lo publicaste tú');
  res.json({ ok: true, mensaje: 'El aviso se retiró' });
}));

module.exports = router;
