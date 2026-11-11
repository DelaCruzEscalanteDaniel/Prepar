'use strict';
const express = require('express');
const db = require('../db');
const v = require('../lib/validar');
const { asincrono } = require('../lib/seguridad');
const { cicloActivo } = require('../lib/comun');
const { noEncontrado, prohibido } = require('../lib/errores');
const { nombreSeguro } = require('../lib/archivos');

const router = express.Router();

let cacheCatalogos = null;
let cacheHasta = 0;
const invalidarCatalogos = () => { cacheCatalogos = null; cacheHasta = 0; };

let cacheEstado = null;
let estadoHasta = 0;
let estadoEnCurso = null;
let generacion = 0;
const invalidarEstado = () => { cacheEstado = null; estadoHasta = 0; generacion += 1; estadoEnCurso = null; cacheHasta = 0; };

router.get('/publico/estado', asincrono(async (req, res) => {
  if (!cacheEstado || Date.now() >= estadoHasta) {
    if (!estadoEnCurso) {
      const gen = generacion;
      const p = cargarEstado()
        .then((d) => { if (gen === generacion) { cacheEstado = d; estadoHasta = Date.now() + 5000; } return d; })
        .finally(() => { if (estadoEnCurso === p) estadoEnCurso = null; });
      estadoEnCurso = p;
    }
    return res.set('Cache-Control', 'no-store').json(await estadoEnCurso);
  }
  return res.set('Cache-Control', 'no-store').json(cacheEstado);
}));

function cargarEstado() {
  return db.conSistema(async (con) => {
    const ciclo = await cicloActivo(con);
    const avisos = await con.q("SELECT clave, valor FROM parametros_sistema WHERE clave IN ('aviso_simulador_es', 'aviso_simulador_en')");
    let fases = [];
    if (ciclo) {
      fases = await con.q(`SELECT fase_id, orden, clave, nombre_es, nombre_en, fecha_inicio, fecha_fin, es_fase_activa,
                                  que_ocurre_es, que_ocurre_en, que_puedes_hacer_es, que_puedes_hacer_en
                           FROM v_panel_ciclo WHERE ciclo_id = ? ORDER BY orden`, [ciclo.id]);
    } else {
      fases = await con.q('SELECT id AS fase_id, orden, clave, nombre_es, nombre_en, NULL AS fecha_inicio, NULL AS fecha_fin, 0 AS es_fase_activa, que_ocurre_es, que_ocurre_en, que_puedes_hacer_es, que_puedes_hacer_en FROM fases ORDER BY orden');
    }
    const totales = await con.uno(`SELECT
        (SELECT COUNT(*) FROM usuarios WHERE rol = 'ciudadano' AND estado = 'activa') AS ciudadanos,
        (SELECT COUNT(*) FROM proyectos WHERE estatus <> 'retirado' AND estado_moderacion = 'visible') AS proyectos,
        (SELECT COUNT(*) FROM alcaldias) AS alcaldias,
        (SELECT COUNT(*) FROM unidades_territoriales WHERE activa) AS unidades`);
    return {
      aviso: Object.fromEntries(avisos.map((a) => [a.clave.replace('aviso_simulador_', ''), a.valor])),
      ciclo, fases, totales,
    };
  });
}

router.get('/catalogos', asincrono(async (req, res) => {
  if (!cacheCatalogos || Date.now() > cacheHasta) {
    cacheCatalogos = await db.conSistema(async (con) => ({
      alcaldias: await con.q('SELECT id, clave, nombre, latitud, longitud FROM alcaldias ORDER BY nombre'),
      unidades: await con.q(`SELECT ut.id, ut.clave, ut.nombre, ut.tipo, ut.alcaldia_id, ut.latitud, ut.longitud,
                                    EXISTS (SELECT 1 FROM ciclo_unidades cu JOIN ciclos c ON c.id = cu.ciclo_id
                                            WHERE cu.unidad_territorial_id = ut.id AND c.estado = 'activo') AS participa
                             FROM unidades_territoriales ut WHERE ut.activa ORDER BY ut.nombre`),
      rubros: await con.q('SELECT id, nombre_es, nombre_en, descripcion FROM rubros WHERE activo ORDER BY id'),
      fases: await con.q('SELECT id, clave, orden, nombre_es, nombre_en FROM fases ORDER BY orden'),
      criterios: await con.q('SELECT id, clave, nombre_es, nombre_en, descripcion FROM criterios_dictamen WHERE activo ORDER BY orden, id'),
      atribuciones: await con.q('SELECT clave, atribucion FROM v_atribuciones'),
    }));
    cacheHasta = Date.now() + 60 * 1000;
  }
  res.set('Cache-Control', 'private, max-age=60').json(cacheCatalogos);
}));

router.get('/publico/privacidad', asincrono(async (req, res) => {
  const aviso = await db.conSistema((con) => con.uno(
    'SELECT version, texto_es, texto_en, vigente_desde FROM avisos_privacidad WHERE vigente_desde <= CURDATE() ORDER BY vigente_desde DESC LIMIT 1'));
  res.json(aviso || { version: null, texto_es: '', texto_en: '' });
}));

router.get('/publico/terminos', asincrono(async (req, res) => {
  const t = await db.conSistema((con) => con.uno(
    'SELECT version, texto_es, texto_en, vigente_desde FROM terminos_condiciones WHERE vigente_desde <= CURDATE() ORDER BY vigente_desde DESC LIMIT 1'));
  res.json(t || { version: null, texto_es: '', texto_en: '' });
}));

router.get('/directorio', asincrono(async (req, res) => {
  const q = v.busqueda(req.query.q);
  const alcaldia = v.id(req.query.alcaldia, 'la alcaldía', false);
  const filas = await db.conSistema((con) => con.q(
    `SELECT d.id, d.alcaldia_id, a.nombre AS alcaldia, d.tipo, d.cargo, d.nombre_titular, d.temas, d.direccion,
            d.telefono, d.correo, d.sitio_web, d.origen, d.actualizado_en, d.fuente_nombre, d.fuente_url,
            DATE_FORMAT(d.consultado_en, '%Y-%m-%d') AS consultado_en
     FROM directorio d JOIN alcaldias a ON a.id = d.alcaldia_id
     WHERE (? IS NULL OR d.alcaldia_id = ?)
       AND (? IS NULL OR CONCAT_WS(' ', d.cargo, d.nombre_titular, d.temas, a.nombre) LIKE ?)
     ORDER BY a.nombre, FIELD(d.tipo, 'alcaldia', 'titular', 'sede_atencion'), d.cargo
     LIMIT 500`, [alcaldia, alcaldia, q, q]));
  res.json(filas);
}));

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIPOS_SERVIBLES = { 'image/jpeg': 'inline', 'image/png': 'inline', 'application/pdf': 'inline', 'text/csv': 'attachment' };
router.get('/archivos/:uuid', asincrono(async (req, res) => {
  const uuid = String(req.params.uuid || '');
  if (!RE_UUID.test(uuid)) throw noEncontrado('Archivo no encontrado');
  const mini = v.booleano(req.query.mini);
  const f = await db.conSistema((con) => con.uno(
    `SELECT a.categoria, a.nombre_original, a.tipo_mime, a.sha256,
            IF(? AND c.miniatura IS NOT NULL, c.miniatura, c.contenido) AS contenido
     FROM archivos a JOIN archivos_contenido c ON c.archivo_id = a.id
     WHERE a.uuid = ? AND a.eliminado_en IS NULL`, [mini, uuid]));
  if (!f) throw noEncontrado('Archivo no encontrado');
  if (['exportacion', 'reporte'].includes(f.categoria) && !(req.usuario && req.usuario.rol === 'administrador')) {
    throw prohibido();
  }
  const disp = TIPOS_SERVIBLES[f.tipo_mime];
  if (!disp) throw noEncontrado('Archivo no encontrado');
  const etag = `"${f.sha256}${mini ? 'm' : ''}"`;
  res.set({
    'Content-Type': f.tipo_mime === 'text/csv' ? 'text/csv; charset=utf-8' : f.tipo_mime,
    'Content-Disposition': `${disp}; filename="${nombreSeguro(f.nombre_original)}"`,
    'Cache-Control': ['exportacion', 'reporte'].includes(f.categoria) ? 'private, no-store' : 'public, max-age=604800, immutable',
    'Cross-Origin-Resource-Policy': 'same-origin',
    ETag: etag,
  });
  if (req.get('If-None-Match') === etag) return res.status(304).end();
  return res.send(Buffer.from(f.contenido));
}));

module.exports = router;
module.exports.invalidarCatalogos = invalidarCatalogos;
module.exports.invalidarEstado = invalidarEstado;
