'use strict';
const categorias = require('../lib/categorias');
const express = require('express');
const db = require('../db');
const v = require('../lib/validar');
const { asincrono, limitador } = require('../lib/seguridad');
const { requiere } = require('../lib/sesion');
const { cicloActivo, cicloPorId } = require('../lib/comun');
const { peticionInvalida, noEncontrado, conflicto, ErrorApp } = require('../lib/errores');
const { geocodificar } = require('../lib/geocodificar');
const { tipoReal, dimensiones, acotar } = require('../lib/archivos');
const pdf = require('../lib/pdf');

const router = express.Router();
const soloCiudadano = requiere('ciudadano');
const L = v.LIMITES;

const limiteEscritura = limitador({ ventanaMs: 60 * 1000, maximo: 30, clave: (req) => `w:${req.usuario ? req.usuario.id : req.ip}`,
  mensaje: 'Estás publicando muy rápido. Espera un momento' });
const limiteArchivos = limitador({ ventanaMs: 10 * 60 * 1000, maximo: 40, clave: (req) => `a:${req.usuario ? req.usuario.id : req.ip}`,
  mensaje: 'Subiste demasiados archivos. Espera unos minutos' });

async function contexto(con, u) {
  const ciclo = await cicloActivo(con);
  let unidad = null;
  if (ciclo) {
    unidad = await con.uno(
      `SELECT cu.presupuesto_asignado, ut.nombre, a.nombre AS alcaldia
       FROM ciclo_unidades cu JOIN unidades_territoriales ut ON ut.id = cu.unidad_territorial_id
       JOIN alcaldias a ON a.id = ut.alcaldia_id
       WHERE cu.ciclo_id = ? AND cu.unidad_territorial_id = ?`, [ciclo.id, u.unidadId]);
  }
  return { ciclo, unidad, participa: !!unidad };
}

function exigirParticipacion(ctx, fase) {
  if (!ctx.ciclo) throw conflicto('No hay un ciclo de simulación activo');
  if (!ctx.participa) throw conflicto('Tu unidad territorial no participa en el ciclo activo');
  if (fase && ctx.ciclo.fase !== fase) {
    const nombres = { diagnostico_registro: 'Diagnóstico y Registro', consulta: 'Consulta', evaluacion: 'Evaluación y Rendición de Cuentas' };
    throw conflicto(`Esta acción solo está disponible en la fase "${nombres[fase] || fase}"`);
  }
}

router.get('/ciudadano/panel', soloCiudadano, asincrono(async (req, res) => {
  const u = req.usuario;
  const datos = await db.conUsuario(u.id, async (con) => {
    const ctx = await contexto(con, u);
    const avisos = ctx.ciclo ? await con.q(
      `SELECT av.id, av.titulo, av.mensaje, av.publicado_en, a.nombre AS alcaldia
       FROM avisos av LEFT JOIN alcaldias a ON a.id = av.alcaldia_id
       WHERE av.ciclo_id = ? AND av.activo AND (av.alcaldia_id IS NULL OR av.alcaldia_id = ?)
         AND (av.vigente_hasta IS NULL OR av.vigente_hasta >= CURDATE())
       ORDER BY av.publicado_en DESC LIMIT 5`, [ctx.ciclo.id, u.alcaldiaId]) : [];
    const voto = ctx.ciclo ? await con.uno('SELECT folio_comprobante, participo_en FROM participaciones WHERE ciclo_id = ? AND ciudadano_id = ?', [ctx.ciclo.id, u.id]) : null;
    const resumen = await con.uno(
      `SELECT (SELECT COUNT(*) FROM proyectos WHERE proponente_id = ? AND estatus <> 'retirado' AND ciclo_id = ?) AS mis_proyectos,
              (SELECT COUNT(*) FROM ideas WHERE ciclo_id = ? AND unidad_territorial_id = ? AND estado = 'visible') AS ideas_foro,
              (SELECT COUNT(*) FROM notificaciones WHERE usuario_id = ? AND NOT leida) AS no_leidas`,
      [u.id, ctx.ciclo ? ctx.ciclo.id : 0, ctx.ciclo ? ctx.ciclo.id : 0, u.unidadId, u.id]);
    const ganador = ctx.ciclo ? await con.uno(
      `SELECT p.id, p.folio, p.titulo, p.estatus, p.avance_porcentaje FROM resultados_unidad ru
       JOIN proyectos p ON p.id = ru.proyecto_ganador_id
       WHERE ru.ciclo_id = ? AND ru.unidad_territorial_id = ? AND p.estatus IN ('ganador','en_ejecucion','concluido','inejecutable')`,
      [ctx.ciclo.id, u.unidadId]) : null;
    let presupuesto = null;
    if (ctx.ciclo && ctx.unidad && ctx.unidad.presupuesto_asignado !== null) {
      const n = await con.uno('SELECT COUNT(*) AS n FROM ciclo_unidades WHERE ciclo_id = ?', [ctx.ciclo.id]);
      const pct = Number(ctx.ciclo.porcentaje_partes_iguales) || 0;
      const total = Number(ctx.unidad.presupuesto_asignado);
      const igual = n.n ? Math.round((Number(ctx.ciclo.presupuesto_total) * pct / 100 / n.n) * 100) / 100 : 0;
      presupuesto = { total, igual: Math.min(igual, total), indices: Math.max(0, Math.round((total - igual) * 100) / 100), porcentaje: pct, unidades: n.n };
    }
    const misProyectos = ctx.ciclo ? await con.q(
      `SELECT id, folio, titulo, estatus FROM proyectos WHERE proponente_id = ? AND ciclo_id = ? AND estatus <> 'retirado'
       ORDER BY creado_en DESC LIMIT 3`, [u.id, ctx.ciclo.id]) : [];
    const miIdea = ctx.ciclo ? await con.uno(
      'SELECT COUNT(*) AS ideas, COALESCE(MAX(total_apoyos), 0) AS apoyos FROM v_foro WHERE autor_id = ? AND ciclo_id = ?',
      [u.id, ctx.ciclo.id]) : null;
    return { ...ctx, avisos, voto, resumen, ganador, presupuesto, misProyectos, miIdea };
  });
  res.json(datos);
}));

router.get('/foro', soloCiudadano, asincrono(async (req, res) => {
  const u = req.usuario;
  const q = v.busqueda(req.query.q);
  const rubro = v.id(req.query.rubro, 'el rubro', false);
  const desde = v.fecha(req.query.desde, { campo: 'la fecha inicial', requerido: false });
  const hasta = v.fecha(req.query.hasta, { campo: 'la fecha final', requerido: false });
  const minApoyos = v.entero(req.query.min_apoyos, { campo: 'el número de apoyos', min: 0, max: 1000000, requerido: false });
  const orden = req.query.orden === 'apoyos' ? 'f.total_apoyos DESC, f.creada_en DESC' : 'f.creada_en DESC';
  const { limite, desplazamiento } = v.pagina(req.query, 30, 100);
  const datos = await db.conUsuario(u.id, async (con) => {
    const ctx = await contexto(con, u);
    if (!ctx.ciclo) return { ...ctx, ideas: [], total: 0 };
    const where = `f.ciclo_id = ? AND f.unidad_territorial_id = ?
        AND (? IS NULL OR f.contenido LIKE ?) AND (? IS NULL OR f.rubro_id = ?)
        AND (? IS NULL OR f.creada_en >= ?) AND (? IS NULL OR f.creada_en < DATE_ADD(?, INTERVAL 1 DAY))
        AND (? IS NULL OR f.total_apoyos >= ?)`;
    const params = [ctx.ciclo.id, u.unidadId, q, q, rubro, rubro, desde, desde, hasta, hasta, minApoyos, minApoyos];
    const total = await con.uno(`SELECT COUNT(*) AS n FROM v_foro f WHERE ${where}`, params);
    const ideas = await con.q(
      `SELECT f.id, f.contenido, f.rubro_id, f.rubro, f.total_apoyos, f.total_comentarios, f.creada_en, f.autor,
              (f.autor_id = ?) AS es_mia,
              EXISTS (SELECT 1 FROM apoyos_idea ap WHERE ap.idea_id = f.id AND ap.ciudadano_id = ?) AS apoyada,
              (SELECT a.uuid FROM usuarios x JOIN archivos a ON a.id = x.foto_archivo_id AND a.eliminado_en IS NULL WHERE x.id = f.autor_id) AS autor_foto
       FROM v_foro f WHERE ${where} ORDER BY ${orden} LIMIT ? OFFSET ?`,
      [u.id, u.id, ...params, limite, desplazamiento]);
    return { ...ctx, ideas, total: total.n };
  });
  res.json(datos);
}));

router.post('/foro/ideas', soloCiudadano, limiteEscritura, asincrono(async (req, res) => {
  const b = v.cuerpo(req);
  const contenido = v.texto(b.contenido, { campo: 'tu idea', max: L.idea, min: 5, letras: 4, multilinea: true });
  const rubro = v.id(b.rubro_id, 'el rubro');
  const id = await db.conUsuario(req.usuario.id, async (con) => {
    exigirParticipacion(await contexto(con, req.usuario), 'diagnostico_registro');
    const r = await con.q('INSERT INTO ideas (rubro_id, contenido) VALUES (?, ?)', [rubro, contenido]);
    return r.insertId;
  });
  res.status(201).json({ ok: true, id, mensaje: 'Tu idea se publicó en el foro' });
}));

async function ideaDeMiForo(con, u, ideaId) {
  const idea = await con.uno("SELECT id, ciclo_id, unidad_territorial_id, autor_id, estado FROM ideas WHERE id = ?", [ideaId]);
  if (!idea || idea.estado !== 'visible' || idea.unidad_territorial_id !== u.unidadId) throw noEncontrado('La idea no existe o ya no está disponible');
  return idea;
}

router.get('/foro/ideas/:id/comentarios', soloCiudadano, asincrono(async (req, res) => {
  const ideaId = v.id(req.params.id, 'la idea');
  const filas = await db.conUsuario(req.usuario.id, async (con) => {
    await ideaDeMiForo(con, req.usuario, ideaId);
    return con.q(
      `SELECT c.id, c.contenido, c.creado_en, u.nombre_completo AS autor, (c.autor_id = ?) AS es_mio,
              (SELECT a.uuid FROM archivos a WHERE a.id = u.foto_archivo_id AND a.eliminado_en IS NULL) AS autor_foto
       FROM comentarios_idea c JOIN usuarios u ON u.id = c.autor_id
       WHERE c.idea_id = ? AND c.estado = 'visible' ORDER BY c.creado_en LIMIT 500`, [req.usuario.id, ideaId]);
  });
  res.json(filas);
}));

router.post('/foro/ideas/:id/comentarios', soloCiudadano, limiteEscritura, asincrono(async (req, res) => {
  const ideaId = v.id(req.params.id, 'la idea');
  const contenido = v.texto(v.cuerpo(req).contenido, { campo: 'tu comentario', max: L.comentario, letras: 2, multilinea: true });
  await db.conUsuario(req.usuario.id, async (con) => {
    await ideaDeMiForo(con, req.usuario, ideaId);
    await con.q('INSERT INTO comentarios_idea (idea_id, contenido) VALUES (?, ?)', [ideaId, contenido]);
  });
  res.status(201).json({ ok: true, mensaje: 'Comentario publicado' });
}));

router.post('/foro/ideas/:id/apoyo', soloCiudadano, limiteEscritura, asincrono(async (req, res) => {
  const ideaId = v.id(req.params.id, 'la idea');
  const total = await db.conUsuario(req.usuario.id, async (con) => {
    await ideaDeMiForo(con, req.usuario, ideaId);
    await con.q('INSERT IGNORE INTO apoyos_idea (idea_id) VALUES (?)', [ideaId]);
    return (await con.uno('SELECT total_apoyos FROM ideas WHERE id = ?', [ideaId])).total_apoyos;
  });
  res.json({ ok: true, apoyada: true, total_apoyos: total });
}));

router.delete('/foro/ideas/:id/apoyo', soloCiudadano, limiteEscritura, asincrono(async (req, res) => {
  const ideaId = v.id(req.params.id, 'la idea');
  const total = await db.conUsuario(req.usuario.id, async (con) => {
    await ideaDeMiForo(con, req.usuario, ideaId);
    await con.q('DELETE FROM apoyos_idea WHERE idea_id = ? AND ciudadano_id = ?', [ideaId, req.usuario.id]);
    return (await con.uno('SELECT total_apoyos FROM ideas WHERE id = ?', [ideaId])).total_apoyos;
  });
  res.json({ ok: true, apoyada: false, total_apoyos: total });
}));

const TAM_IMAGEN = 5 * 1024 * 1024;
router.post('/archivos', soloCiudadano, limiteArchivos,
  express.raw({ type: ['image/jpeg', 'image/png', 'image/jpg'], limit: TAM_IMAGEN + 1024 }),
  asincrono(async (req, res) => {
    const categoria = v.opcion(req.query.categoria, ['imagen_proyecto', 'foto_reporte'], { campo: 'el tipo de archivo' });
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || !buf.length) throw peticionInvalida('Elige una imagen JPG o PNG');
    if (buf.length > TAM_IMAGEN) throw new ErrorApp(413, 'La imagen pesa más de 5 MB');
    const tipo = tipoReal(buf);
    if (!['image/jpeg', 'image/png'].includes(tipo)) throw peticionInvalida('Solo se aceptan imágenes JPG o PNG');
    let nombre = 'imagen';
    try { nombre = decodeURIComponent(String(req.get('X-Nombre-Archivo') || 'imagen')); } catch { }
    nombre = v.limpiarTexto(nombre, false).slice(0, 200) || 'imagen';
    const dim = dimensiones(buf) || {};
    const filas = await db.conUsuario(req.usuario.id, (con) => con.call('sp_guardar_archivo',
      [categoria, nombre, tipo, buf, acotar(dim.ancho), acotar(dim.alto), null]));
    res.status(201).json({ uuid: filas[0].uuid });
  }));

async function idImagen(con, u, uuid, categoria) {
  if (!uuid) return null;
  if (typeof uuid !== 'string' || !/^[0-9a-f-]{36}$/i.test(uuid)) throw peticionInvalida('La imagen no es válida');
  const a = await con.uno('SELECT id FROM archivos WHERE uuid = ? AND categoria = ? AND subido_por = ? AND eliminado_en IS NULL', [uuid, categoria, u.id]);
  if (!a) throw peticionInvalida('La imagen no es válida o ya no existe. Súbela de nuevo');
  return a.id;
}

function numeroExterior(valor) {
  const s = v.texto(valor, { campo: 'el número', max: L.numero, requerido: false });
  if (s && !/^s\/?n$/i.test(s) && !/\d/.test(s)) throw peticionInvalida('El número exterior debe tener dígitos (por ejemplo 45 o 12-B) o escribe S/N');
  return s;
}

function revisarCosto(ctx, costo) {
  const tope = ctx && ctx.unidad ? Number(ctx.unidad.presupuesto_asignado) : 0;
  if (tope > 0 && costo > tope) {
    throw peticionInvalida(`El costo estimado no puede ser mayor al presupuesto de tu colonia ($${tope.toLocaleString('es-MX', { maximumFractionDigits: 2 })})`);
  }
}

function datosProyecto(b) {
  const d = datosProyectoBase(b);
  if (!d.categoria) d.categoria = categorias.adivinar(d.titulo, d.descripcion);
  return d;
}
function datosProyectoBase(b) {
  return {
    titulo: v.texto(b.titulo, { campo: 'el título', max: L.titulo, min: 5, letras: 4, revisar: true }),
    descripcion: v.texto(b.descripcion, { campo: 'la descripción', max: L.descripcion, min: 10, letras: 6, multilinea: true }),
    rubro: v.id(b.rubro_id, 'el rubro'),
    categoria: v.opcion(b.categoria, categorias.claves(), { campo: 'el tipo de proyecto', requerido: false }),
    costo: v.decimal(b.costo_estimado, { campo: 'el costo estimado', min: 1000, max: 999999999.99 }),
    calle: v.texto(b.calle, { campo: 'la calle', max: L.calle, min: 2, letras: 2 }),
    numero: numeroExterior(b.numero),
    referencias: v.texto(b.referencias, { campo: 'las referencias', max: L.referencias, requerido: false, letras: 2 }),
    cp: v.codigoPostal(b.codigo_postal),
    coords: v.coordenadas(b.latitud, b.longitud, false),
  };
}

async function ubicar(u, d) {
  if (d.coords) return { id: null, latitud: d.coords.latitud, longitud: d.coords.longitud, estado: 'ubicado' };
  const lugar = await db.conSistema((con) => con.uno(
    'SELECT ut.nombre, a.nombre AS alcaldia FROM unidades_territoriales ut JOIN alcaldias a ON a.id = ut.alcaldia_id WHERE ut.id = ?', [u.unidadId]));
  const consulta = `${d.calle}${d.numero && !/^s\/?n$/i.test(d.numero) ? ` ${d.numero}` : ''}, ${d.cp ? `${d.cp}, ` : ''}${lugar ? `${lugar.nombre}, ${lugar.alcaldia}, ` : ''}Ciudad de México`;
  const g = await geocodificar(consulta);
  return g ? { id: g.id, latitud: g.latitud, longitud: g.longitud, estado: 'ubicado' } : { id: null, latitud: null, longitud: null, estado: 'no_ubicado' };
}

router.post('/proyectos', soloCiudadano, limiteEscritura, asincrono(async (req, res) => {
  const b = v.cuerpo(req);
  await categorias.refrescar();
  const d = datosProyecto(b);
  const ideaId = v.id(b.idea_id, 'la idea de origen', false);
  const u = req.usuario;
  const imagenId = await db.conUsuario(u.id, async (con) => {
    const ctx = await contexto(con, u);
    exigirParticipacion(ctx, 'diagnostico_registro');
    revisarCosto(ctx, d.costo);
    const r = await con.uno('SELECT id FROM rubros WHERE id = ? AND activo', [d.rubro]);
    if (!r) throw peticionInvalida('El rubro no existe');
    return idImagen(con, u, b.imagen_uuid, 'imagen_proyecto');
  });
  const ubic = await ubicar(u, d);
  const proyecto = await db.conUsuario(u.id, async (con) => {
    const r = await con.q(
      `INSERT INTO proyectos (titulo, descripcion, rubro_id, categoria, costo_estimado, calle, numero, referencias, codigo_postal,
                              latitud, longitud, estado_ubicacion, geocodificacion_id, imagen_archivo_id, idea_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [d.titulo, d.descripcion, d.rubro, d.categoria, d.costo, d.calle, d.numero, d.referencias, d.cp,
        ubic.latitud, ubic.longitud, ubic.estado, ubic.id, imagenId, ideaId]);
    return con.uno('SELECT id, folio, estado_ubicacion, latitud, longitud FROM proyectos WHERE id = ?', [r.insertId]);
  });
  res.status(201).json({
    ok: true, ...proyecto,
    mensaje: proyecto.estado_ubicacion === 'ubicado'
      ? `Tu proyecto quedó registrado con el folio ${proyecto.folio}`
      : `Tu proyecto quedó registrado con el folio ${proyecto.folio}. No pudimos ubicar la dirección en el mapa; un Funcionario la revisará.`,
  });
}));

router.put('/proyectos/:id', soloCiudadano, limiteEscritura, asincrono(async (req, res) => {
  const id = v.id(req.params.id, 'el proyecto');
  const b = v.cuerpo(req);
  await categorias.refrescar();
  const d = datosProyecto(b);
  const u = req.usuario;
  const previo = await db.conUsuario(u.id, async (con) => {
    const p = await con.uno('SELECT id, proponente_id, calle, numero, codigo_postal, latitud, longitud, imagen_archivo_id, estado_ubicacion, geocodificacion_id FROM proyectos WHERE id = ?', [id]);
    if (!p || p.proponente_id !== u.id) throw noEncontrado('El proyecto no existe');
    revisarCosto(await contexto(con, u), d.costo);
    const r = await con.uno('SELECT id FROM rubros WHERE id = ? AND activo', [d.rubro]);
    if (!r) throw peticionInvalida('El rubro no existe');
    let imagen = p.imagen_archivo_id;
    if (v.booleano(b.quitar_imagen)) imagen = null;
    else if (b.imagen_uuid) imagen = await idImagen(con, u, b.imagen_uuid, 'imagen_proyecto');
    return { p, imagen };
  });
  const cambioDireccion = previo.p.calle !== d.calle || (previo.p.numero || null) !== (d.numero || null) || (previo.p.codigo_postal || null) !== (d.cp || null);
  let ubic = { id: previo.p.geocodificacion_id, latitud: previo.p.latitud, longitud: previo.p.longitud, estado: previo.p.estado_ubicacion };
  if (d.coords || cambioDireccion) ubic = await ubicar(u, d);
  await db.conUsuario(u.id, (con) => con.q(
    `UPDATE proyectos SET titulo = ?, descripcion = ?, rubro_id = ?, categoria = ?, costo_estimado = ?, calle = ?, numero = ?, referencias = ?, codigo_postal = ?,
                          latitud = ?, longitud = ?, estado_ubicacion = ?, geocodificacion_id = ?, imagen_archivo_id = ?
     WHERE id = ?`,
    [d.titulo, d.descripcion, d.rubro, d.categoria, d.costo, d.calle, d.numero, d.referencias, d.cp,
      ubic.latitud, ubic.longitud, ubic.estado, ubic.id, previo.imagen, id]));
  res.json({ ok: true, mensaje: 'Los cambios de tu proyecto se guardaron' });
}));

router.post('/proyectos/:id/retirar', soloCiudadano, limiteEscritura, asincrono(async (req, res) => {
  const id = v.id(req.params.id, 'el proyecto');
  await db.conUsuario(req.usuario.id, async (con) => {
    const p = await con.uno('SELECT proponente_id, estatus FROM proyectos WHERE id = ?', [id]);
    if (!p || p.proponente_id !== req.usuario.id) throw noEncontrado('El proyecto no existe');
    if (p.estatus === 'retirado') throw conflicto('El proyecto ya estaba retirado');
    await con.q("UPDATE proyectos SET estatus = 'retirado' WHERE id = ?", [id]);
  });
  res.json({ ok: true, mensaje: 'Retiraste tu proyecto. Su folio no se volverá a usar' });
}));

router.get('/proyectos/mios', soloCiudadano, asincrono(async (req, res) => {
  const filas = await db.conUsuario(req.usuario.id, (con) => con.q(
    `SELECT p.id, p.folio, p.ciclo_id, c.nombre AS ciclo, c.estado AS ciclo_estado, p.titulo, p.descripcion, p.rubro_id, p.categoria, r.nombre_es AS rubro,
            p.costo_estimado, p.calle, p.numero, p.referencias, p.codigo_postal, p.latitud, p.longitud, p.estado_ubicacion, p.estatus,
            p.numero_sorteo, p.avance_porcentaje, p.monto_ejercido, p.estado_moderacion, p.creado_en,
            (SELECT a.uuid FROM archivos a WHERE a.id = p.imagen_archivo_id AND a.eliminado_en IS NULL) AS imagen_uuid,
            d.resultado AS dictamen, d.justificacion AS dictamen_justificacion, d.emitido_en AS dictamen_emitido_en,
            (SELECT rr.observacion FROM revisiones_registro rr WHERE rr.proyecto_id = p.id AND rr.resultado = 'correccion_solicitada' LIMIT 1) AS correccion,
            (SELECT f.clave FROM fases f WHERE f.id = c.fase_actual_id) AS fase_ciclo
     FROM proyectos p JOIN ciclos c ON c.id = p.ciclo_id JOIN rubros r ON r.id = p.rubro_id
     LEFT JOIN dictamenes d ON d.proyecto_id = p.id AND d.emitido_en IS NOT NULL
     WHERE p.proponente_id = ? ORDER BY p.creado_en DESC LIMIT 200`, [req.usuario.id]));
  res.json(filas);
}));

router.get('/proyectos/alcaldia', soloCiudadano, asincrono(async (req, res) => {
  const u = req.usuario;
  const ut = v.id(req.query.unidad, 'la colonia', false);
  const datos = await db.conUsuario(u.id, async (con) => {
    const ciclo = await cicloActivo(con);
    const alc = await con.uno(
      `SELECT a.id, a.nombre FROM unidades_territoriales ut JOIN alcaldias a ON a.id = ut.alcaldia_id WHERE ut.id = ?`, [u.unidadId]);
    if (!ciclo || !alc) return { alcaldia: alc ? alc.nombre : null, colonias: [], proyectos: [] };
    const colonias = await con.q(
      `SELECT ut.id, ut.nombre, cu.presupuesto_asignado,
              (SELECT COUNT(*) FROM proyectos p WHERE p.ciclo_id = cu.ciclo_id AND p.unidad_territorial_id = ut.id
                 AND p.estatus <> 'retirado' AND p.estado_moderacion = 'visible') AS proyectos
       FROM ciclo_unidades cu JOIN unidades_territoriales ut ON ut.id = cu.unidad_territorial_id
       WHERE cu.ciclo_id = ? AND ut.alcaldia_id = ? ORDER BY ut.nombre`, [ciclo.id, alc.id]);
    const proyectos = await con.q(
      `SELECT p.id, p.folio, p.titulo, p.descripcion, r.nombre_es AS rubro, p.costo_estimado, p.estatus, p.numero_sorteo,
              p.unidad_territorial_id, ut.nombre AS colonia, (p.proponente_id = ?) AS es_mio, (p.unidad_territorial_id = ?) AS de_mi_colonia,
              (SELECT a.uuid FROM archivos a WHERE a.id = p.imagen_archivo_id AND a.eliminado_en IS NULL) AS imagen_uuid
       FROM proyectos p JOIN rubros r ON r.id = p.rubro_id JOIN unidades_territoriales ut ON ut.id = p.unidad_territorial_id
       WHERE p.ciclo_id = ? AND ut.alcaldia_id = ? AND (? IS NULL OR p.unidad_territorial_id = ?)
         AND p.estatus <> 'retirado' AND p.estado_moderacion = 'visible'
       ORDER BY (p.unidad_territorial_id = ?) DESC, ut.nombre, p.creado_en DESC LIMIT 500`,
      [u.id, u.unidadId, ciclo.id, alc.id, ut, ut, u.unidadId]);
    return { alcaldia: alc.nombre, mi_colonia: u.unidadId, colonias, proyectos };
  });
  res.json(datos);
}));

router.get('/proyectos/unidad', soloCiudadano, asincrono(async (req, res) => {
  const u = req.usuario;
  const filas = await db.conUsuario(u.id, async (con) => {
    const ciclo = await cicloActivo(con);
    if (!ciclo) return [];
    return con.q(
      `SELECT p.id, p.folio, p.titulo, p.descripcion, r.nombre_es AS rubro, p.costo_estimado, p.estatus, p.numero_sorteo,
              (p.proponente_id = ?) AS es_mio,
              (SELECT a.uuid FROM archivos a WHERE a.id = p.imagen_archivo_id AND a.eliminado_en IS NULL) AS imagen_uuid
       FROM proyectos p JOIN rubros r ON r.id = p.rubro_id
       WHERE p.ciclo_id = ? AND p.unidad_territorial_id = ? AND p.estatus <> 'retirado' AND p.estado_moderacion = 'visible'
       ORDER BY p.creado_en DESC LIMIT 300`, [u.id, ciclo.id, u.unidadId]);
  });
  res.json(filas);
}));

router.get('/votacion', soloCiudadano, asincrono(async (req, res) => {
  const u = req.usuario;
  const datos = await db.conUsuario(u.id, async (con) => {
    const ctx = await contexto(con, u);
    if (!ctx.ciclo) return { ...ctx, boleta: [], voto: null, resultados: [] };
    const boleta = await con.q(
      `SELECT b.proyecto_id, b.numero_sorteo, b.folio, b.titulo, b.descripcion, b.rubro, b.costo_estimado, b.imagen_uuid
       FROM v_boleta b JOIN proyectos p ON p.id = b.proyecto_id
       WHERE b.ciclo_id = ? AND b.unidad_territorial_id = ? AND p.estatus IN ('en_consulta','ganador','en_ejecucion','concluido','inejecutable')
       ORDER BY b.numero_sorteo`, [ctx.ciclo.id, u.unidadId]);
    const voto = await con.uno('SELECT folio_comprobante, participo_en FROM participaciones WHERE ciclo_id = ? AND ciudadano_id = ?', [ctx.ciclo.id, u.id]);
    const resultados = ctx.ciclo.resultados_publicados_en ? await con.q(
      `SELECT folio, titulo, numero_sorteo, total_votos, posicion, ganador, caso_especial, metodo
       FROM v_resultados_consulta WHERE ciclo_id = ? AND clave_ut = (SELECT clave FROM unidades_territoriales WHERE id = ?)
       ORDER BY posicion, numero_sorteo`, [ctx.ciclo.id, u.unidadId]) : [];
    return { ...ctx, boleta, voto, resultados };
  });
  res.json(datos);
}));

const limiteVoto = limitador({ ventanaMs: 60 * 1000, maximo: 10, clave: (req) => `v:${req.usuario ? req.usuario.id : req.ip}` });
router.post('/votacion', soloCiudadano, limiteVoto, asincrono(async (req, res) => {
  const proyecto = v.id(v.cuerpo(req).proyecto_id, 'el proyecto');
  const filas = await db.conUsuario(req.usuario.id, (con) => con.call('sp_emitir_voto', [proyecto]));
  res.status(201).json({ ok: true, ...filas[0], mensaje: 'Tu voto quedó registrado. Descarga tu comprobante' });
}));

router.get('/votacion/comprobante', soloCiudadano, asincrono(async (req, res) => {
  const u = req.usuario;
  const cicloId = v.id(req.query.ciclo, 'el ciclo', false);
  const datos = await db.conUsuario(u.id, async (con) => {
    const ciclo = cicloId ? await cicloPorId(con, cicloId) : await cicloActivo(con);
    if (!ciclo) throw noEncontrado('No hay un ciclo para este comprobante');
    const p = await con.uno(
      `SELECT pa.folio_comprobante, pa.participo_en, ut.nombre AS unidad, a.nombre AS alcaldia
       FROM participaciones pa JOIN unidades_territoriales ut ON ut.id = pa.unidad_territorial_id
       JOIN alcaldias a ON a.id = ut.alcaldia_id WHERE pa.ciclo_id = ? AND pa.ciudadano_id = ?`, [ciclo.id, u.id]);
    if (!p) throw noEncontrado('No has votado en este ciclo');
    return { ciclo, p };
  });
  const doc = pdf.documento({
    titulo: 'Comprobante de participación',
    subtitulo: `${datos.ciclo.nombre} · Consulta simulada del Presupuesto Participativo`,
    bloques: [
      { tipo: 'destacado', etiqueta: 'Folio del comprobante', valor: datos.p.folio_comprobante },
      { tipo: 'dato', etiqueta: 'Participante', valor: u.nombre },
      { tipo: 'dato', etiqueta: 'Unidad territorial', valor: `${datos.p.unidad}, ${datos.p.alcaldia}` },
      { tipo: 'dato', etiqueta: 'Fecha y hora', valor: `${datos.p.participo_en} (hora de la CDMX)` },
      { tipo: 'dato', etiqueta: 'Ciclo', valor: `${datos.ciclo.nombre} (${datos.ciclo.anio_simulado})` },
      { tipo: 'parrafo', texto: 'Este comprobante acredita que la persona participó en la consulta. Por ser un voto secreto, no indica el proyecto elegido.', color: '#475569' },
    ],
  });
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="comprobante-${datos.p.folio_comprobante}.pdf"`,
    'Cache-Control': 'private, no-store',
  }).send(doc);
}));

router.get('/notificaciones', requiere(), asincrono(async (req, res) => {
  const datos = await db.conUsuario(req.usuario.id, async (con) => ({
    notificaciones: await con.q(
      `SELECT n.id, n.tipo, n.titulo, n.mensaje, n.proyecto_id, n.leida, n.creada_en
       FROM notificaciones n WHERE n.usuario_id = ? ORDER BY n.creada_en DESC, n.id DESC LIMIT 50`, [req.usuario.id]),
    no_leidas: (await con.uno('SELECT COUNT(*) AS n FROM notificaciones WHERE usuario_id = ? AND NOT leida', [req.usuario.id])).n,
  }));
  res.set('Cache-Control', 'no-store').json(datos);
}));

router.post('/notificaciones/leidas', requiere(), asincrono(async (req, res) => {
  const b = v.cuerpo(req);
  const ids = v.listaIds(b.ids, { campo: 'las notificaciones', max: 200 });
  await db.conUsuario(req.usuario.id, (con) => (ids.length
    ? con.q(`UPDATE notificaciones SET leida = TRUE WHERE usuario_id = ? AND id IN (${ids.map(() => '?').join(',')})`, [req.usuario.id, ...ids])
    : con.q('UPDATE notificaciones SET leida = TRUE WHERE usuario_id = ? AND NOT leida', [req.usuario.id])));
  res.json({ ok: true });
}));

module.exports = router;
