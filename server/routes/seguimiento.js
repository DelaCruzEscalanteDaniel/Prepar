'use strict';
const express = require('express');
const db = require('../db');
const v = require('../lib/validar');
const { asincrono, limitador } = require('../lib/seguridad');
const { requiere } = require('../lib/sesion');
const { cicloActivo, ESTATUS_GANADOR } = require('../lib/comun');
const etapasObra = require('../lib/etapas');
const { peticionInvalida, noEncontrado } = require('../lib/errores');

const router = express.Router();
const conSesion = requiere();
const soloCiudadano = requiere('ciudadano');
const L = v.LIMITES;
const ESTATUS = ['registrado', 'en_dictaminacion', 'viable', 'no_viable', 'en_consulta', 'ganador', 'en_ejecucion', 'concluido', 'inejecutable'];

const limiteEscritura = limitador({ ventanaMs: 60 * 1000, maximo: 20, clave: (req) => `s:${req.usuario ? req.usuario.id : req.ip}`,
  mensaje: 'Estás publicando muy rápido. Espera un momento' });

async function cicloPorDefecto(con, cicloId) {
  if (cicloId) return cicloId;
  const c = (await cicloActivo(con)) || await con.uno("SELECT id FROM ciclos WHERE estado <> 'borrador' ORDER BY creado_en DESC LIMIT 1");
  return c ? c.id : null;
}

router.get('/ciclos', conSesion, asincrono(async (req, res) => {
  const filas = await db.conSistema((con) => con.q(
    `SELECT c.id, c.nombre, c.anio_simulado, c.estado, f.nombre_es AS fase_es, f.nombre_en AS fase_en
     FROM ciclos c LEFT JOIN fases f ON f.id = c.fase_actual_id
     WHERE c.estado <> 'borrador' OR ? ORDER BY c.creado_en DESC LIMIT 100`, [req.usuario.rol === 'administrador']));
  res.json(filas);
}));

router.get('/mapa/proyectos', conSesion, asincrono(async (req, res) => {
  const ciclo = v.id(req.query.ciclo, 'el ciclo', false);
  const alcaldia = v.id(req.query.alcaldia, 'la alcaldía', false);
  const ut = v.id(req.query.unidad, 'la unidad territorial', false);
  const rubro = v.id(req.query.rubro, 'el rubro', false);
  const estatus = v.opcion(req.query.estatus, ESTATUS, { campo: 'el estatus', requerido: false });
  const datos = await db.conSistema(async (con) => {
    const c = await cicloPorDefecto(con, ciclo);
    if (!c) return { ciclo_id: null, proyectos: [] };
    const proyectos = await con.q(
      `SELECT id, folio, ciclo_id, alcaldia_id, alcaldia, unidad_territorial_id, unidad_territorial, titulo, rubro_id, rubro,
              costo_estimado, presupuesto_asignado, latitud, longitud, estado_ubicacion, estatus, numero_sorteo,
              avance_porcentaje, monto_ejercido, total_fotos, calificacion_promedio, imagen_uuid, total_votos
       FROM v_ficha_proyecto
       WHERE ciclo_id = ? AND (? IS NULL OR alcaldia_id = ?) AND (? IS NULL OR unidad_territorial_id = ?)
         AND (? IS NULL OR rubro_id = ?) AND (? IS NULL OR estatus = ?)
       ORDER BY alcaldia, unidad_territorial, folio LIMIT 3000`,
      [c, alcaldia, alcaldia, ut, ut, rubro, rubro, estatus, estatus]);
    return { ciclo_id: c, proyectos };
  });
  res.json(datos);
}));

router.get('/mapa/proyectos/:id', conSesion, asincrono(async (req, res) => {
  const id = v.id(req.params.id, 'el proyecto');
  const datos = await db.conSistema(async (con) => {
    const ficha = await con.uno('SELECT * FROM v_ficha_proyecto WHERE id = ?', [id]);
    if (!ficha) throw noEncontrado('El proyecto no existe o no está disponible');
    const galeria = await con.q(
      'SELECT foto_id, archivo_uuid, reporte_id, tipo, descripcion, estatus, subida_en FROM v_galeria_proyecto WHERE proyecto_id = ? ORDER BY subida_en DESC LIMIT 60', [id]);
    const avances = await con.q(
      'SELECT porcentaje, monto_ejercido, estatus, nota, justificacion_inejecutable, registrado_en FROM avances_proyecto WHERE proyecto_id = ? ORDER BY registrado_en DESC, id DESC LIMIT 50', [id]);
    const etapas = ESTATUS_GANADOR.includes(ficha.estatus) ? await etapasObra.etapasDe(con, id) : [];
    return { ...ficha, galeria, avances, etapas };
  });
  res.json(datos);
}));

router.get('/mapa/unidades', conSesion, asincrono(async (req, res) => {
  const filas = await db.conSistema((con) => con.q(
    'SELECT id, clave, nombre, tipo, alcaldia_id, alcaldia, latitud, longitud FROM v_unidades_mapa ORDER BY alcaldia, nombre'));
  res.json(filas);
}));

router.get('/foto-denuncia/proyectos', conSesion, asincrono(async (req, res) => {
  const ciclo = v.id(req.query.ciclo, 'el ciclo', false);
  const alcaldia = v.id(req.query.alcaldia, 'la alcaldía', false);
  const u = req.usuario;
  const datos = await db.conSistema(async (con) => {
    const c = await cicloPorDefecto(con, ciclo);
    if (!c) return { ciclo_id: null, proyectos: [] };
    const proyectos = await con.q(
      `SELECT p.id, p.folio, p.titulo, p.estatus, p.avance_porcentaje, p.monto_ejercido, cu.presupuesto_asignado,
              ut.id AS unidad_territorial_id, ut.nombre AS unidad_territorial, a.id AS alcaldia_id, a.nombre AS alcaldia,
              (SELECT ROUND(AVG(ca.puntuacion), 2) FROM calificaciones ca WHERE ca.proyecto_id = p.id) AS calificacion_promedio,
              (SELECT COUNT(*) FROM calificaciones ca WHERE ca.proyecto_id = p.id) AS total_calificaciones,
              (SELECT COUNT(*) FROM reportes re WHERE re.proyecto_id = p.id AND re.estatus <> 'eliminado') AS total_reportes,
              (SELECT ca.puntuacion FROM calificaciones ca WHERE ca.proyecto_id = p.id AND ca.ciudadano_id = ?) AS mi_calificacion,
              (SELECT ca.comentario FROM calificaciones ca WHERE ca.proyecto_id = p.id AND ca.ciudadano_id = ?) AS mi_comentario,
              (p.unidad_territorial_id = ?) AS es_de_mi_unidad,
              (SELECT a2.uuid FROM archivos a2 WHERE a2.id = p.imagen_archivo_id AND a2.eliminado_en IS NULL) AS imagen_uuid
       FROM proyectos p
       JOIN ciclo_unidades cu ON cu.ciclo_id = p.ciclo_id AND cu.unidad_territorial_id = p.unidad_territorial_id
       JOIN unidades_territoriales ut ON ut.id = p.unidad_territorial_id
       JOIN alcaldias a ON a.id = ut.alcaldia_id
       WHERE p.ciclo_id = ? AND p.estatus IN (?) AND p.estado_moderacion = 'visible' AND (? IS NULL OR a.id = ?)
       ORDER BY calificacion_promedio IS NULL, calificacion_promedio DESC, total_calificaciones DESC, p.avance_porcentaje DESC, p.folio
       LIMIT 500`,
      [u.id, u.id, u.unidadId || 0, c, ESTATUS_GANADOR, alcaldia, alcaldia]);
    const fase = await con.uno('SELECT f.clave FROM ciclos c JOIN fases f ON f.id = c.fase_actual_id WHERE c.id = ?', [c]);
    return { ciclo_id: c, fase: fase ? fase.clave : null, proyectos };
  });
  res.json(datos);
}));

router.get('/foto-denuncia/reportes', conSesion, asincrono(async (req, res) => {
  const proyecto = v.id(req.query.proyecto, 'el proyecto', false);
  const alcaldia = v.id(req.query.alcaldia, 'la alcaldía', false);
  const tipo = v.opcion(req.query.tipo, ['avance', 'irregularidad'], { campo: 'el tipo', requerido: false });
  const estatus = v.opcion(req.query.estatus, ['pendiente', 'atendido'], { campo: 'el estatus', requerido: false });
  const desde = v.fecha(req.query.desde, { campo: 'la fecha inicial', requerido: false });
  const hasta = v.fecha(req.query.hasta, { campo: 'la fecha final', requerido: false });
  const { limite, desplazamiento } = v.pagina(req.query, 30, 100);
  const datos = await db.conSistema(async (con) => {
    const where = `(? IS NULL OR r.proyecto_id = ?) AND (? IS NULL OR r.alcaldia_id = ?) AND (? IS NULL OR r.tipo = ?)
                   AND (? IS NULL OR r.estatus = ?) AND (? IS NULL OR r.creado_en >= ?)
                   AND (? IS NULL OR r.creado_en < DATE_ADD(?, INTERVAL 1 DAY))`;
    const params = [proyecto, proyecto, alcaldia, alcaldia, tipo, tipo, estatus, estatus, desde, desde, hasta, hasta];
    const total = await con.uno(`SELECT COUNT(*) AS n FROM v_reportes r WHERE ${where}`, params);
    const reportes = await con.q(
      `SELECT r.id, r.proyecto_id, r.folio, r.proyecto, r.alcaldia, r.tipo, r.descripcion, r.estatus, r.respuesta,
              r.creado_en, r.autor, r.total_comentarios, (r.autor_id = ?) AS es_mio,
              (SELECT GROUP_CONCAT(a.uuid ORDER BY f.orden SEPARATOR ',') FROM reporte_fotos f
                 JOIN archivos a ON a.id = f.archivo_id AND a.eliminado_en IS NULL WHERE f.reporte_id = r.id) AS fotos
       FROM v_reportes r WHERE ${where} ORDER BY r.creado_en DESC, r.id DESC LIMIT ? OFFSET ?`,
      [req.usuario.id, ...params, limite, desplazamiento]);
    reportes.forEach((r) => { r.fotos = r.fotos ? r.fotos.split(',') : []; });
    return { reportes, total: total.n };
  });
  res.json(datos);
}));

router.get('/foto-denuncia/reportes/:id', conSesion, asincrono(async (req, res) => {
  const id = v.id(req.params.id, 'el reporte');
  const datos = await db.conSistema(async (con) => {
    const r = await con.uno('SELECT * FROM v_reportes WHERE id = ?', [id]);
    if (!r) throw noEncontrado('El reporte no existe o fue eliminado');
    const fotos = await con.q(
      `SELECT a.uuid FROM reporte_fotos f JOIN archivos a ON a.id = f.archivo_id AND a.eliminado_en IS NULL
       WHERE f.reporte_id = ? ORDER BY f.orden`, [id]);
    const comentarios = await con.q(
      `SELECT c.id, c.contenido, c.creado_en, u.nombre_completo AS autor,
              (SELECT a.uuid FROM archivos a WHERE a.id = u.foto_archivo_id AND a.eliminado_en IS NULL) AS autor_foto
       FROM comentarios_reporte c JOIN usuarios u ON u.id = c.autor_id
       WHERE c.reporte_id = ? AND c.estado = 'visible' ORDER BY c.creado_en LIMIT 500`, [id]);
    delete r.autor_id;
    return { ...r, fotos: fotos.map((f) => f.uuid), comentarios };
  });
  res.json(datos);
}));

router.post('/foto-denuncia/reportes', soloCiudadano, limiteEscritura, asincrono(async (req, res) => {
  const b = v.cuerpo(req);
  const proyecto = v.id(b.proyecto_id, 'el proyecto');
  const tipo = v.opcion(b.tipo, ['avance', 'irregularidad'], { campo: 'el tipo de reporte' });
  const descripcion = v.texto(b.descripcion, { campo: 'la descripción', max: L.descripcion, min: 10, letras: 6, multilinea: true });
  const fotos = Array.isArray(b.fotos) ? b.fotos : [];
  if (!fotos.length) throw peticionInvalida('Agrega al menos una fotografía');
  if (fotos.length > 5) throw peticionInvalida('Un reporte admite como máximo 5 fotografías');
  if (fotos.some((f) => typeof f !== 'string' || !/^[0-9a-f-]{36}$/i.test(f))) throw peticionInvalida('Alguna fotografía no es válida');
  if (new Set(fotos).size !== fotos.length) throw peticionInvalida('Hay fotografías repetidas');
  const id = await db.conUsuario(req.usuario.id, (con) => con.transaccion(async () => {
    const r = await con.q('INSERT INTO reportes (proyecto_id, tipo, descripcion) VALUES (?, ?, ?)', [proyecto, tipo, descripcion]);
    let orden = 1;
    for (const uuid of fotos) {
      const a = await con.uno(
        `SELECT a.id FROM archivos a WHERE a.uuid = ? AND a.categoria = 'foto_reporte' AND a.subido_por = ? AND a.eliminado_en IS NULL
           AND NOT EXISTS (SELECT 1 FROM reporte_fotos f WHERE f.archivo_id = a.id)`, [uuid, req.usuario.id]);
      if (!a) throw peticionInvalida('Alguna fotografía no es válida o ya se usó. Súbela de nuevo');
      await con.q('INSERT INTO reporte_fotos (reporte_id, archivo_id, orden) VALUES (?, ?, ?)', [r.insertId, a.id, orden]);
      orden += 1;
    }
    return r.insertId;
  }));
  res.status(201).json({ ok: true, id, mensaje: 'Tu reporte se publicó' });
}));

router.post('/foto-denuncia/reportes/:id/comentarios', soloCiudadano, limiteEscritura, asincrono(async (req, res) => {
  const id = v.id(req.params.id, 'el reporte');
  const contenido = v.texto(v.cuerpo(req).contenido, { campo: 'tu comentario', max: L.comentario, letras: 2, multilinea: true });
  await db.conUsuario(req.usuario.id, async (con) => {
    const r = await con.uno("SELECT id FROM reportes WHERE id = ? AND estatus <> 'eliminado'", [id]);
    if (!r) throw noEncontrado('El reporte no existe o fue eliminado');
    await con.q('INSERT INTO comentarios_reporte (reporte_id, contenido) VALUES (?, ?)', [id, contenido]);
  });
  res.status(201).json({ ok: true, mensaje: 'Comentario publicado' });
}));

router.post('/foto-denuncia/proyectos/:id/calificacion', soloCiudadano, limiteEscritura, asincrono(async (req, res) => {
  const id = v.id(req.params.id, 'el proyecto');
  const b = v.cuerpo(req);
  const puntuacion = v.entero(b.puntuacion, { campo: 'la calificación', min: 1, max: 5 });
  const comentario = v.texto(b.comentario, { campo: 'el comentario', max: L.comentario, requerido: false, letras: 2, multilinea: true });
  await db.conUsuario(req.usuario.id, async (con) => {
    const p = await con.uno('SELECT id FROM proyectos WHERE id = ?', [id]);
    if (!p) throw noEncontrado('El proyecto no existe');
    await con.q(
      `INSERT INTO calificaciones (proyecto_id, puntuacion, comentario) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE puntuacion = VALUES(puntuacion), comentario = VALUES(comentario), creada_en = NOW()`,
      [id, puntuacion, comentario]);
  });
  res.json({ ok: true, mensaje: 'Gracias, tu calificación se guardó' });
}));

module.exports = router;
