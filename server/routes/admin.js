'use strict';
const express = require('express');
const crypto = require('crypto');
const hash = require('../lib/hash');
const db = require('../db');
const config = require('../config');
const log = require('../lib/log');
const v = require('../lib/validar');
const { asincrono } = require('../lib/seguridad');
const { requiere, NOMBRES_FUNCION, olvidar } = require('../lib/sesion');
const { cicloPorId } = require('../lib/comun');
const { peticionInvalida, noEncontrado, conflicto, ErrorApp } = require('../lib/errores');
const { aCsv, tipoReal, nombreSeguro } = require('../lib/archivos');
const { sincronizarFuente, PERFILES } = require('../lib/sincronizar');
const pdf = require('../lib/pdf');
const envioCorreo = require('../lib/correo');
const publico = require('./publico');
const categorias = require('../lib/categorias');
const modo = require('../lib/modo');
const ciclosIniciales = require('../lib/ciclosIniciales');

const router = express.Router();
router.use('/admin', requiere('administrador'));
router.use('/admin', (req, res, next) => {
  if (req.method !== 'GET') {
    res.on('finish', () => { if (res.statusCode < 400) { olvidar(); publico.invalidarEstado(); } });
  }
  next();
});
const L = v.LIMITES;
const FUNCIONES = Object.keys(NOMBRES_FUNCION);
const FASES = ['convocatoria', 'diagnostico_registro', 'dictaminacion', 'sorteo_difusion', 'consulta', 'resultados', 'ejecucion_seguimiento', 'evaluacion'];

async function cicloExistente(con, id) {
  const c = await cicloPorId(con, id);
  if (!c) throw noEncontrado('El ciclo no existe');
  return c;
}

router.get('/admin/resumen', asincrono(async (req, res) => {
  const datos = await db.conUsuario(req.usuario.id, async (con) => {
    const ciclo = await con.uno("SELECT id FROM ciclos WHERE estado = 'activo'");
    const totales = await con.uno(`SELECT
        (SELECT COUNT(*) FROM usuarios WHERE rol = 'ciudadano') AS ciudadanos,
        (SELECT COUNT(*) FROM usuarios WHERE rol = 'ciudadano' AND estado = 'suspendida') AS suspendidos,
        (SELECT COUNT(*) FROM usuarios WHERE rol = 'funcionario' AND estado = 'activa') AS funcionarios,
        (SELECT COUNT(*) FROM correos_salida WHERE estado = 'pendiente') AS correos_pendientes,
        (SELECT COUNT(*) FROM ciclos) AS ciclos`);
    let proyectos = [];
    let participacion = null;
    if (ciclo) {
      proyectos = await con.q('SELECT estatus, COUNT(*) AS n FROM proyectos WHERE ciclo_id = ? GROUP BY estatus', [ciclo.id]);
      participacion = await con.uno('SELECT registrados, votantes, porcentaje FROM v_est_participacion_general WHERE ciclo_id = ?', [ciclo.id]);
    }
    return { ciclo_id: ciclo ? ciclo.id : null, totales, proyectos, participacion, correo_configurado: envioCorreo.configurado() };
  });
  res.json(datos);
}));

router.get('/admin/ciclos', asincrono(async (req, res) => {
  const filas = await db.conUsuario(req.usuario.id, (con) => con.q(
    `SELECT c.id, c.nombre, c.anio_simulado, c.estado, c.presupuesto_total, c.creado_en, c.cerrado_en, c.tipo, c.pausado_en,
            f.nombre_es AS fase_es, f.nombre_en AS fase_en,
            (SELECT COUNT(*) FROM ciclo_unidades cu WHERE cu.ciclo_id = c.id) AS unidades
     FROM ciclos c LEFT JOIN fases f ON f.id = c.fase_actual_id ORDER BY c.creado_en DESC, c.id DESC LIMIT 100`));
  res.json(filas);
}));

router.get('/admin/ciclos/:id', asincrono(async (req, res) => {
  const id = v.id(req.params.id, 'el ciclo');
  const datos = await db.conUsuario(req.usuario.id, async (con) => {
    const ciclo = await cicloExistente(con, id);
    const fases = await con.q('SELECT fase_id, orden, clave, nombre_es, nombre_en, fecha_inicio, fecha_fin, es_fase_activa FROM v_panel_ciclo WHERE ciclo_id = ? ORDER BY orden', [id]);
    const unidades = await con.q(
      `SELECT cu.unidad_territorial_id, ut.clave, ut.nombre, ut.tipo, a.id AS alcaldia_id, a.nombre AS alcaldia, cu.poblacion, cu.poblacion_flotante,
              cu.indice_pobreza, cu.indice_delictivo, cu.es_pueblo_originario, cu.presupuesto_asignado
       FROM ciclo_unidades cu JOIN unidades_territoriales ut ON ut.id = cu.unidad_territorial_id JOIN alcaldias a ON a.id = ut.alcaldia_id
       WHERE cu.ciclo_id = ? ORDER BY a.nombre, ut.nombre`, [id]);
    const estatus = await con.q('SELECT estatus, COUNT(*) AS n FROM proyectos WHERE ciclo_id = ? GROUP BY estatus', [id]);
    const pendientes = await con.uno(`SELECT
        (SELECT COUNT(*) FROM proyectos WHERE ciclo_id = ? AND estatus IN ('registrado', 'en_dictaminacion') AND estado_moderacion = 'visible') AS sin_dictamen,
        (SELECT COUNT(*) FROM ciclo_unidades cu WHERE cu.ciclo_id = ?
            AND NOT EXISTS (SELECT 1 FROM sorteos s WHERE s.ciclo_id = cu.ciclo_id AND s.unidad_territorial_id = cu.unidad_territorial_id)) AS sorteos_pendientes,
        (SELECT COUNT(*) FROM resultados_unidad WHERE ciclo_id = ? AND proyecto_ganador_id IS NULL) AS casos_sin_resolver,
        (SELECT COUNT(*) FROM resultados_unidad WHERE ciclo_id = ? AND caso_especial IS NOT NULL) AS casos_especiales,
        (SELECT COUNT(*) FROM participaciones WHERE ciclo_id = ?) AS votos`, [id, id, id, id, id]);
    return { ciclo, fases, unidades, estatus, pendientes };
  });
  res.json(datos);
}));

router.post('/admin/ciclos', asincrono(async (req, res) => {
  const b = v.cuerpo(req);
  const nombre = v.texto(b.nombre, { campo: 'el nombre del ciclo', max: L.cicloNombre, min: 3 });
  const anio = v.entero(b.anio_simulado, { campo: 'el año simulado', min: 2000, max: 2100 });
  const presupuesto = v.decimal(b.presupuesto_total, { campo: 'el presupuesto total', min: 0, max: 999999999999.99, minExclusivo: true });
  const alcaldias = v.listaIds(b.alcaldias, { campo: 'las alcaldías', max: 16 });
  const unidades = v.listaIds(b.unidades, { campo: 'las unidades territoriales', max: 2000 });
  if (!alcaldias.length && !unidades.length) throw peticionInvalida('Selecciona al menos una alcaldía o unidad territorial participante');
  const origen = v.opcion(b.origen_indices || 'aleatorio', ['api', 'aleatorio', 'manual'], { campo: 'el origen de los índices' });
  const pct = b.porcentaje_partes_iguales === undefined || b.porcentaje_partes_iguales === ''
    ? 50 : v.decimal(b.porcentaje_partes_iguales, { campo: 'el porcentaje en partes iguales', min: 0, max: 100 });
  const id = await db.conUsuario(req.usuario.id, (con) => con.transaccion(async () => {
    if (alcaldias.length) {
      const n = await con.uno(`SELECT COUNT(*) AS n FROM alcaldias WHERE id IN (${alcaldias.map(() => '?').join(',')})`, alcaldias);
      if (n.n !== alcaldias.length) throw peticionInvalida('Alguna alcaldía seleccionada no existe');
    }
    if (unidades.length) {
      const n = await con.uno(`SELECT COUNT(*) AS n FROM unidades_territoriales WHERE activa AND id IN (${unidades.map(() => '?').join(',')})`, unidades);
      if (n.n !== unidades.length) throw peticionInvalida('Alguna unidad territorial seleccionada no existe');
    }
    // Con origen «api» los índices se copian después en una sola consulta: el procedimiento los busca colonia por colonia
    // y con una base remota tardaba más que el límite de 15 s por consulta.
    const filas = await con.call('sp_crear_ciclo', [nombre, anio, presupuesto,
      alcaldias.length ? alcaldias.join(',') : null, unidades.length ? unidades.join(',') : null, origen === 'api' ? 'manual' : origen]);
    const cicloId = filas[0].ciclo_id;
    const n = await con.uno('SELECT COUNT(*) AS n FROM ciclo_unidades WHERE ciclo_id = ?', [cicloId]);
    if (!n.n) {
      await con.q('DELETE FROM ciclos WHERE id = ?', [cicloId]);
      throw peticionInvalida('Las alcaldías o unidades seleccionadas no tienen unidades territoriales activas');
    }
    if (pct !== 50) await con.q('UPDATE ciclos SET porcentaje_partes_iguales = ? WHERE id = ?', [pct, cicloId]);
    if (origen === 'api') await modo.indicesDesdeApis(con, cicloId);
    else await con.call('sp_calcular_presupuesto', [cicloId]);
    return cicloId;
  }));
  res.status(201).json({ ok: true, id, mensaje: 'El ciclo se creó en borrador y se calculó la distribución del presupuesto' });
}));

router.put('/admin/ciclos/:id', asincrono(async (req, res) => {
  const id = v.id(req.params.id, 'el ciclo');
  const b = v.cuerpo(req);
  const nombre = v.texto(b.nombre, { campo: 'el nombre del ciclo', max: L.cicloNombre, min: 3 });
  const anio = v.entero(b.anio_simulado, { campo: 'el año simulado', min: 2000, max: 2100 });
  const presupuesto = v.decimal(b.presupuesto_total, { campo: 'el presupuesto total', min: 0, max: 999999999999.99, minExclusivo: true });
  const pct = v.decimal(b.porcentaje_partes_iguales ?? 50, { campo: 'el porcentaje en partes iguales', min: 0, max: 100 });
  await db.conUsuario(req.usuario.id, async (con) => {
    const c = await cicloExistente(con, id);
    if (c.estado !== 'borrador' || c.pausado_en) {
      await con.q('UPDATE ciclos SET nombre = ? WHERE id = ?', [nombre, id]);
      return;
    }
    await con.q('UPDATE ciclos SET nombre = ?, anio_simulado = ?, presupuesto_total = ?, porcentaje_partes_iguales = ? WHERE id = ?',
      [nombre, anio, presupuesto, pct, id]);
    await con.call('sp_calcular_presupuesto', [id]);
  });
  res.json({ ok: true, mensaje: 'Los datos del ciclo se guardaron' });
}));

router.delete('/admin/ciclos/:id', asincrono(async (req, res) => {
  const id = v.id(req.params.id, 'el ciclo');
  await db.conUsuario(req.usuario.id, async (con) => {
    const c = await cicloExistente(con, id);
    if (c.estado !== 'borrador') throw conflicto('Solo se pueden eliminar ciclos en borrador');
    if (c.pausado_en) throw conflicto('Este ciclo está pausado y conserva su historial: actívalo y ciérralo en lugar de eliminarlo');
    await con.q("DELETE FROM ciclos WHERE id = ? AND estado = 'borrador'", [id]);
  });
  res.json({ ok: true, mensaje: 'El ciclo en borrador se eliminó' });
}));

router.put('/admin/ciclos/:id/fases', asincrono(async (req, res) => {
  const id = v.id(req.params.id, 'el ciclo');
  const b = v.cuerpo(req);
  if (!Array.isArray(b.fases) || !b.fases.length || b.fases.length > 20) throw peticionInvalida('Indica las fechas de las fases');
  const fases = b.fases.map((f) => {
    if (!f || typeof f !== 'object') throw peticionInvalida('Alguna fase no es válida');
    const inicio = v.fecha(f.fecha_inicio, { campo: 'la fecha de inicio' });
    const fin = v.fecha(f.fecha_fin, { campo: 'la fecha de fin' });
    if (fin < inicio) throw peticionInvalida('La fecha de fin de una fase no puede ser anterior a su inicio');
    return { fase: v.id(f.fase_id, 'la fase'), inicio, fin };
  });
  await db.conUsuario(req.usuario.id, (con) => con.transaccion(async () => {
    await cicloExistente(con, id);
    const orden = await con.q('SELECT id, orden FROM fases');
    const mapa = new Map(orden.map((f) => [f.id, f.orden]));
    if (fases.some((f) => !mapa.has(f.fase))) throw peticionInvalida('Alguna fase no existe');
    const ordenadas = [...fases].sort((a, b2) => mapa.get(a.fase) - mapa.get(b2.fase));
    for (let i = 1; i < ordenadas.length; i += 1) {
      if (ordenadas[i].inicio < ordenadas[i - 1].inicio) throw peticionInvalida('Las fases deben seguir el orden del calendario');
    }
    for (const f of fases) {
      await con.q(`INSERT INTO ciclo_fases (ciclo_id, fase_id, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?)
                   ON DUPLICATE KEY UPDATE fecha_inicio = VALUES(fecha_inicio), fecha_fin = VALUES(fecha_fin)`, [id, f.fase, f.inicio, f.fin]);
    }
  }));
  res.json({ ok: true, mensaje: 'Las fechas de las fases se guardaron' });
}));

router.put('/admin/ciclos/:id/unidades/:ut', asincrono(async (req, res) => {
  const id = v.id(req.params.id, 'el ciclo');
  const ut = v.id(req.params.ut, 'la unidad territorial');
  const b = v.cuerpo(req);
  const datos = [
    v.entero(b.poblacion, { campo: 'la población', min: 0, max: 100000000 }),
    v.entero(b.poblacion_flotante, { campo: 'la población flotante', min: 0, max: 100000000 }),
    v.decimal(b.indice_pobreza, { campo: 'el índice de pobreza', min: 0, max: 1, decimales: 4 }),
    v.decimal(b.indice_delictivo, { campo: 'el índice delictivo', min: 0, max: 1, decimales: 4 }),
    v.booleano(b.es_pueblo_originario),
  ];
  const r = await db.conUsuario(req.usuario.id, async (con) => {
    const c = await cicloExistente(con, id);
    if (c.estado !== 'borrador' || c.pausado_en) throw conflicto('Los índices solo se modifican mientras el ciclo está en borrador');
    return con.q(`UPDATE ciclo_unidades SET poblacion = ?, poblacion_flotante = ?, indice_pobreza = ?, indice_delictivo = ?, es_pueblo_originario = ?
                  WHERE ciclo_id = ? AND unidad_territorial_id = ?`, [...datos, id, ut]);
  });
  if (!r.affectedRows) throw noEncontrado('La unidad territorial no participa en este ciclo');
  res.json({ ok: true, mensaje: 'Los índices se guardaron. Recalcula el presupuesto para aplicarlos' });
}));

router.post('/admin/ciclos/:id/presupuesto', asincrono(async (req, res) => {
  const id = v.id(req.params.id, 'el ciclo');
  const filas = await db.conUsuario(req.usuario.id, async (con) => {
    const c = await cicloExistente(con, id);
    if (c.pausado_en) throw conflicto('El ciclo está pausado: su presupuesto ya no se recalcula');
    return con.call('sp_calcular_presupuesto', [id]);
  });
  res.json({ ok: true, unidades: filas, mensaje: 'La distribución del presupuesto se recalculó' });
}));

router.post('/admin/ciclos/:id/fase', asincrono(async (req, res) => {
  const id = v.id(req.params.id, 'el ciclo');
  const fase = v.opcion(v.cuerpo(req).fase, FASES, { campo: 'la fase' });
  const c = await db.conUsuario(req.usuario.id, (con) => cicloExistente(con, id));
  if (c.estado === 'borrador') {
    // Activar un ciclo: si había otro activo, queda pausado.
    const r = await modo.activar(req.usuario.id, id);
    if (c.tipo !== 'oficial' && r.fase !== fase) await db.conUsuario(req.usuario.id, (con) => con.call('sp_cambiar_fase', [id, fase]));
    return res.json({ ok: true, mensaje: r.pausado ? `El ciclo se activó; «${r.pausado}» quedó pausado` : 'El ciclo se activó' });
  }
  if (c.tipo === 'oficial') throw conflicto('El ciclo oficial avanza solo según el calendario del IECM');
  await db.conUsuario(req.usuario.id, (con) => con.call('sp_cambiar_fase', [id, fase]));
  return res.json({ ok: true, mensaje: 'La fase del ciclo cambió' });
}));

router.get('/admin/modo', asincrono(async (req, res) => {
  res.json(await modo.estado(req.usuario.id));
}));

router.post('/admin/modo/cargar-oficial', asincrono(async (req, res) => {
  const r = await ciclosIniciales.crearOficial({ forzar: true });
  if (!r.id) throw conflicto(r.motivo || 'No se pudo cargar el ciclo oficial');
  res.json({ ok: true, id: r.id, mensaje: r.yaExistia ? 'El ciclo oficial ya estaba cargado' : 'Se cargó el ciclo oficial 2026-2027 con el calendario del IECM' });
}));

router.post('/admin/modo', asincrono(async (req, res) => {
  const b = v.cuerpo(req);
  const elegido = v.opcion(b.modo, ['oficial', 'practica'], { campo: 'el modo' });
  const e = await modo.estado(req.usuario.id);
  let id;
  if (elegido === 'oficial') {
    const of = b.ciclo_id ? e.oficiales.find((c) => c.id === Number(b.ciclo_id)) : e.oficiales[0];
    if (!of) throw conflicto('No hay un ciclo oficial cargado todavía');
    id = of.id;
  } else {
    id = v.id(b.ciclo_id, 'el ciclo de práctica');
    const pr = e.practicas.find((c) => c.id === id);
    if (!pr) throw peticionInvalida('Elige uno de tus ciclos de práctica');
    if (!Number(pr.fases_con_fecha)) throw conflicto('Configura las fechas de las fases de ese ciclo antes de activarlo');
  }
  const r = await modo.activar(req.usuario.id, id);
  publico.invalidarEstado && publico.invalidarEstado();
  res.json({
    ok: true, ...r,
    mensaje: r.sinCambio ? 'Ese ciclo ya es el activo'
      : `Modo ${elegido === 'oficial' ? 'oficial' : 'práctica'}: «${r.ciclo}» está activo${r.pausado ? ` y «${r.pausado}» quedó pausado` : ''}`,
  });
}));

router.post('/admin/ciclos/:id/votacion', asincrono(async (req, res) => {
  const id = v.id(req.params.id, 'el ciclo');
  const accion = v.opcion(v.cuerpo(req).accion, ['abrir', 'cerrar'], { campo: 'la acción' });
  const r = await db.conUsuario(req.usuario.id, (con) => (accion === 'abrir'
    ? con.call('sp_abrir_votacion', [id]) : con.call('sp_cerrar_votacion', [id])));
  res.json({
    ok: true, computo: accion === 'cerrar' ? r[0] || null : null,
    mensaje: accion === 'abrir' ? 'La recepción de votos está abierta' : 'La votación se cerró y los votos se contaron',
  });
}));

router.post('/admin/ciclos/:id/ganadores', asincrono(async (req, res) => {
  const id = v.id(req.params.id, 'el ciclo');
  const r = await db.conUsuario(req.usuario.id, (con) => con.call('sp_publicar_ganadores', [id]));
  res.json({ ok: true, ganadores: r[0] ? r[0].ganadores : 0, mensaje: 'Se publicaron los proyectos ganadores' });
}));

router.post('/admin/ciclos/:id/cerrar', asincrono(async (req, res) => {
  const id = v.id(req.params.id, 'el ciclo');
  await db.conUsuario(req.usuario.id, (con) => con.call('sp_cerrar_ciclo', [id]));
  res.json({ ok: true, mensaje: 'El ciclo se cerró y quedó como histórico de solo lectura' });
}));

const TAM_PDF = 10 * 1024 * 1024;
router.put('/admin/ciclos/:id/convocatoria', express.raw({ type: ['application/pdf'], limit: TAM_PDF + 1024 }), asincrono(async (req, res) => {
  const id = v.id(req.params.id, 'el ciclo');
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || !buf.length) throw peticionInvalida('Elige un archivo PDF');
  if (buf.length > TAM_PDF) throw new ErrorApp(413, 'El PDF pesa más de 10 MB');
  if (tipoReal(buf) !== 'application/pdf') throw peticionInvalida('El archivo no es un PDF válido');
  const uuid = await db.conUsuario(req.usuario.id, async (con) => {
    const c = await cicloExistente(con, id);
    if (c.estado === 'cerrado') throw conflicto('El ciclo está cerrado: su información es de solo lectura');
    const f = await con.call('sp_guardar_archivo', ['convocatoria', `convocatoria-${id}.pdf`, 'application/pdf', buf, null, null, null]);
    await con.q('UPDATE ciclos SET convocatoria_archivo_id = ? WHERE id = ?', [f[0].archivo_id, id]);
    return f[0].uuid;
  });
  res.json({ ok: true, uuid, mensaje: 'La convocatoria se publicó' });
}));

async function registrarExportacion(con, { cicloId, tipo, categoria, nombre, mime, buf, filtros }) {
  if (buf.length > 19 * 1024 * 1024) return;
  try {
    const f = await con.call('sp_guardar_archivo', [categoria, nombre, mime, buf, null, null, null]);
    await con.call('sp_registrar_reporte_generado', [cicloId, tipo, f[0].archivo_id, filtros ? JSON.stringify(filtros) : null]);
  } catch (e) {
    log.aviso('No se pudo registrar la exportación:', e.sqlMessage || e.message);
  }
}

router.get('/admin/ciclos/:id/resultados.csv', asincrono(async (req, res) => {
  const id = v.id(req.params.id, 'el ciclo');
  const { buf, nombre } = await db.conUsuario(req.usuario.id, async (con) => {
    const c = await cicloExistente(con, id);
    const filas = await con.q('SELECT * FROM v_resultados_consulta WHERE ciclo_id = ? ORDER BY alcaldia, unidad_territorial, posicion, numero_sorteo', [id]);
    const csv = aCsv([
      { titulo: 'Ciclo', campo: 'ciclo' }, { titulo: 'Alcaldía', campo: 'alcaldia' }, { titulo: 'Clave UT', campo: 'clave_ut' },
      { titulo: 'Unidad territorial', campo: 'unidad_territorial' }, { titulo: 'Número en boleta', campo: 'numero_sorteo' },
      { titulo: 'Folio', campo: 'folio' }, { titulo: 'Proyecto', campo: 'titulo' }, { titulo: 'Rubro', campo: 'rubro' },
      { titulo: 'Votos', campo: 'total_votos' }, { titulo: 'Posición', campo: 'posicion' },
      { titulo: 'Ganador', valor: (f) => (f.ganador ? 'Sí' : 'No') }, { titulo: 'Caso especial', campo: 'caso_especial' },
      { titulo: 'Método', campo: 'metodo' },
    ], filas);
    const n = `resultados-${nombreSeguro(c.nombre)}.csv`;
    await registrarExportacion(con, { cicloId: id, tipo: 'resultados_csv', categoria: 'exportacion', nombre: n, mime: 'text/csv', buf: csv });
    return { buf: csv, nombre: n };
  });
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${nombre}"`, 'Cache-Control': 'no-store' }).send(buf);
}));

router.get('/admin/ciclos/:id/reporte.pdf', asincrono(async (req, res) => {
  const id = v.id(req.params.id, 'el ciclo');
  const { buf, nombre } = await db.conUsuario(req.usuario.id, async (con) => {
    const c = await cicloExistente(con, id);
    const part = await con.uno('SELECT registrados, votantes, porcentaje FROM v_est_participacion_general WHERE ciclo_id = ?', [id]);
    const est = await con.q('SELECT estatus, COUNT(*) AS n FROM proyectos WHERE ciclo_id = ? GROUP BY estatus ORDER BY n DESC', [id]);
    const ganadores = await con.q(
      `SELECT a.nombre AS alcaldia, ut.nombre AS unidad, p.folio, p.titulo, ru.metodo, ru.total_votos
       FROM resultados_unidad ru JOIN unidades_territoriales ut ON ut.id = ru.unidad_territorial_id JOIN alcaldias a ON a.id = ut.alcaldia_id
       LEFT JOIN proyectos p ON p.id = ru.proyecto_ganador_id WHERE ru.ciclo_id = ? ORDER BY a.nombre, ut.nombre`, [id]);
    const doc = pdf.documento({
      titulo: `Reporte del ciclo: ${c.nombre}`,
      subtitulo: `Año simulado ${c.anio_simulado} · Estado: ${c.estado} · Fase: ${c.fase_es || '—'}`,
      bloques: [
        { tipo: 'titulo', texto: 'Datos generales' },
        { tipo: 'dato', etiqueta: 'Presupuesto total', valor: `$${Number(c.presupuesto_total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` },
        { tipo: 'dato', etiqueta: 'Ciudadanos registrados', valor: String(part ? part.registrados : 0) },
        { tipo: 'dato', etiqueta: 'Votantes', valor: `${part ? part.votantes : 0} (${part && part.porcentaje !== null ? part.porcentaje : 0} %)` },
        { tipo: 'titulo', texto: 'Proyectos por estatus' },
        { tipo: 'tabla', columnas: ['Estatus', 'Proyectos'], anchos: [300, 200], filas: est.map((e) => [e.estatus.replace(/_/g, ' '), e.n]) },
        { tipo: 'titulo', texto: 'Resultados por unidad territorial' },
        { tipo: 'tabla', columnas: ['Alcaldía', 'Unidad territorial', 'Folio', 'Proyecto ganador', 'Votos'], anchos: [90, 110, 90, 150, 60],
          filas: ganadores.map((g) => [g.alcaldia, g.unidad, g.folio || '—', g.titulo || 'Sin resolver', g.total_votos]) },
      ],
    });
    const n = `reporte-${nombreSeguro(c.nombre)}.pdf`;
    await registrarExportacion(con, { cicloId: id, tipo: 'cierre_ciclo', categoria: 'reporte', nombre: n, mime: 'application/pdf', buf: doc });
    return { buf: doc, nombre: n };
  });
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${nombre}"`, 'Cache-Control': 'no-store' }).send(buf);
}));

function passwordTemporal() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(12);
  let s = '';
  for (const b of bytes) s += abc[b % abc.length];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

function funcionesValidas(lista) {
  if (!Array.isArray(lista) || !lista.length) throw peticionInvalida('Selecciona al menos una función');
  const f = [...new Set(lista)];
  if (f.some((x) => typeof x !== 'string' || !FUNCIONES.includes(x))) throw peticionInvalida('Alguna función no es válida');
  return f;
}

router.get('/admin/funcionarios', asincrono(async (req, res) => {
  const filas = await db.conUsuario(req.usuario.id, (con) => con.q(
    `SELECT u.id, u.nombre_completo, u.correo, u.estado, u.creado_en, f.alcaldia_id, a.nombre AS alcaldia, f.debe_cambiar_password,
            (SELECT GROUP_CONCAT(ff.funcion ORDER BY ff.funcion) FROM funcionario_funciones ff WHERE ff.funcionario_id = u.id) AS funciones,
            (SELECT MAX(s.creada_en) FROM sesiones s WHERE s.usuario_id = u.id) AS ultimo_acceso
     FROM usuarios u JOIN funcionarios f ON f.usuario_id = u.id JOIN alcaldias a ON a.id = f.alcaldia_id
     ORDER BY u.estado = 'activa' DESC, a.nombre, u.nombre_completo LIMIT 1000`));
  filas.forEach((f) => { f.funciones = f.funciones ? f.funciones.split(',') : []; });
  res.json(filas);
}));

router.post('/admin/funcionarios', asincrono(async (req, res) => {
  const b = v.cuerpo(req);
  const nombre = v.nombrePersona(b.nombre);
  const correo = v.correo(b.correo, { campo: 'el correo' });
  const alcaldia = v.id(b.alcaldia_id, 'la alcaldía');
  const funciones = funcionesValidas(b.funciones);
  const temporal = passwordTemporal();
  const hashTemp = await hash.hash(temporal);
  const id = await db.conUsuario(req.usuario.id, async (con) => {
    const a = await con.uno('SELECT id FROM alcaldias WHERE id = ?', [alcaldia]);
    if (!a) throw peticionInvalida('La alcaldía no existe');
    const filas = await con.call('sp_registrar_funcionario', [nombre, correo, hashTemp, alcaldia, funciones.join(',')]);
    const nuevo = filas[0].usuario_id;
    // La contraseña temporal solo entra a la cola si hay correo configurado; tras enviarse se borra del registro.
    if (envioCorreo.configurado()) await con.call('sp_encolar_correo', [nuevo, correo, 'Prepar · Tu cuenta de Funcionario',
      `Hola, ${nombre}.\n\nEl Administrador de Prepar creó tu cuenta de Funcionario.\nCorreo: ${correo}\nContraseña temporal: ${temporal}\n\n` +
      `Inicia sesión en ${config.urlPublica}/login.html; el sistema te pedirá cambiarla la primera vez.`, 'contrasena_temporal']);
    return nuevo;
  });
  envioCorreo.avisar();
  const envia = envioCorreo.configurado();
  res.status(201).json({ ok: true, id, passwordTemporal: temporal, correoEnviado: envia,
    mensaje: envia ? 'El Funcionario se registró y se le está enviando su contraseña temporal por correo'
      : 'El Funcionario se registró. El envío de correos no está configurado: entrégale tú su contraseña temporal' });
}));

router.put('/admin/funcionarios/:id', asincrono(async (req, res) => {
  const id = v.id(req.params.id, 'el funcionario');
  const b = v.cuerpo(req);
  const alcaldia = v.id(b.alcaldia_id, 'la alcaldía');
  const funciones = funcionesValidas(b.funciones);
  await db.conUsuario(req.usuario.id, (con) => con.transaccion(async () => {
    const f = await con.uno('SELECT usuario_id FROM funcionarios WHERE usuario_id = ?', [id]);
    if (!f) throw noEncontrado('El funcionario no existe');
    const a = await con.uno('SELECT id FROM alcaldias WHERE id = ?', [alcaldia]);
    if (!a) throw peticionInvalida('La alcaldía no existe');
    await con.call('sp_asignar_funciones', [id, alcaldia, funciones.join(',')]);
  }));
  res.json({ ok: true, mensaje: 'Los datos del funcionario se actualizaron' });
}));

router.post('/admin/funcionarios/:id/estado', asincrono(async (req, res) => {
  const id = v.id(req.params.id, 'el funcionario');
  const estado = v.opcion(v.cuerpo(req).estado, ['activa', 'desactivada'], { campo: 'el estado' });
  const r = await db.conUsuario(req.usuario.id, (con) => con.q("UPDATE usuarios SET estado = ? WHERE id = ? AND rol = 'funcionario'", [estado, id]));
  if (!r.affectedRows) throw noEncontrado('El funcionario no existe');
  res.json({ ok: true, mensaje: estado === 'activa' ? 'La cuenta se reactivó' : 'La cuenta se desactivó y se cerraron sus sesiones' });
}));

router.post('/admin/funcionarios/:id/restablecer', asincrono(async (req, res) => {
  const id = v.id(req.params.id, 'el funcionario');
  const temporal = passwordTemporal();
  const hashTemp = await hash.hash(temporal);
  await db.conUsuario(req.usuario.id, (con) => con.transaccion(async () => {
    const u = await con.uno("SELECT id, correo, nombre_completo FROM usuarios WHERE id = ? AND rol = 'funcionario'", [id]);
    if (!u) throw noEncontrado('El funcionario no existe');
    await con.q('UPDATE usuarios SET password_hash = ?, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?', [hashTemp, id]);
    await con.q('UPDATE funcionarios SET debe_cambiar_password = TRUE WHERE usuario_id = ?', [id]);
    await con.q('UPDATE sesiones SET cerrada_en = NOW() WHERE usuario_id = ? AND cerrada_en IS NULL', [id]);
    if (envioCorreo.configurado()) await con.call('sp_encolar_correo', [id, u.correo, 'Prepar · Nueva contraseña temporal',
      `Hola, ${u.nombre_completo}.\n\nTu nueva contraseña temporal es: ${temporal}\nCámbiala al iniciar sesión.`, 'contrasena_temporal']);
  }));
  envioCorreo.avisar();
  res.json({ ok: true, passwordTemporal: temporal, correoEnviado: envioCorreo.configurado(), mensaje: 'Se generó una nueva contraseña temporal' });
}));

router.get('/admin/ciudadanos', asincrono(async (req, res) => {
  const q = v.busqueda(req.query.q);
  const estado = v.opcion(req.query.estado, ['activa', 'suspendida', 'desactivada'], { campo: 'el estado', requerido: false });
  const alcaldia = v.id(req.query.alcaldia, 'la alcaldía', false);
  const { limite, desplazamiento } = v.pagina(req.query, 50, 200);
  const datos = await db.conUsuario(req.usuario.id, async (con) => {
    const where = `u.rol = 'ciudadano' AND (? IS NULL OR CONCAT(u.nombre_completo, ' ', u.correo) LIKE ?)
                   AND (? IS NULL OR u.estado = ?) AND (? IS NULL OR ut.alcaldia_id = ?)`;
    const params = [q, q, estado, estado, alcaldia, alcaldia];
    const total = await con.uno(`SELECT COUNT(*) AS n FROM usuarios u JOIN ciudadanos c ON c.usuario_id = u.id
                                 JOIN unidades_territoriales ut ON ut.id = c.unidad_territorial_id WHERE ${where}`, params);
    const filas = await con.q(
      `SELECT u.id, u.nombre_completo, u.correo, u.estado, u.creado_en, ut.nombre AS unidad_territorial, a.nombre AS alcaldia,
              CASE WHEN TIMESTAMPDIFF(YEAR, c.fecha_nacimiento, CURDATE()) < 30 THEN '18-29'
                   WHEN TIMESTAMPDIFF(YEAR, c.fecha_nacimiento, CURDATE()) < 45 THEN '30-44'
                   WHEN TIMESTAMPDIFF(YEAR, c.fecha_nacimiento, CURDATE()) < 60 THEN '45-59' ELSE '60+' END AS rango_edad,
              (SELECT sc.motivo FROM suspensiones_cuenta sc WHERE sc.ciudadano_id = u.id ORDER BY sc.realizada_en DESC, sc.id DESC LIMIT 1) AS ultimo_motivo
       FROM usuarios u JOIN ciudadanos c ON c.usuario_id = u.id
       JOIN unidades_territoriales ut ON ut.id = c.unidad_territorial_id JOIN alcaldias a ON a.id = ut.alcaldia_id
       WHERE ${where} ORDER BY u.creado_en DESC, u.id DESC LIMIT ? OFFSET ?`, [...params, limite, desplazamiento]);
    return { ciudadanos: filas, total: total.n };
  });
  res.json(datos);
}));

router.post('/admin/ciudadanos/:id/suspension', asincrono(async (req, res) => {
  const id = v.id(req.params.id, 'el ciudadano');
  const b = v.cuerpo(req);
  const accion = v.opcion(b.accion, ['suspender', 'reactivar'], { campo: 'la acción' });
  const motivo = v.texto(b.motivo, { campo: 'el motivo', max: L.motivo, min: accion === 'suspender' ? 5 : 0, requerido: accion === 'suspender', multilinea: true });
  await db.conUsuario(req.usuario.id, async (con) => {
    const c = await con.uno('SELECT u.estado FROM usuarios u JOIN ciudadanos c ON c.usuario_id = u.id WHERE u.id = ?', [id]);
    if (!c) throw noEncontrado('El ciudadano no existe');
    if (accion === 'suspender' && c.estado === 'suspendida') throw conflicto('La cuenta ya está suspendida');
    if (accion === 'reactivar' && c.estado === 'activa') throw conflicto('La cuenta ya está activa');
    await con.q('INSERT INTO suspensiones_cuenta (ciudadano_id, accion, motivo) VALUES (?, ?, ?)', [id, accion, motivo]);
  });
  res.json({ ok: true, mensaje: accion === 'suspender' ? 'La cuenta se suspendió y se cerraron sus sesiones' : 'La cuenta se reactivó' });
}));

const RANGOS = ['18-29', '30-44', '45-59', '60+'];
const GENEROS = ['mujer', 'hombre', 'no_binario', 'prefiero_no_decir'];

function filtrosEstadistica(query) {
  return {
    ciclo: v.id(query.ciclo, 'el ciclo', false),
    alcaldia: v.id(query.alcaldia, 'la alcaldía', false),
    unidad: v.id(query.unidad, 'la unidad territorial', false),
    genero: v.opcion(query.genero, GENEROS, { campo: 'el género', requerido: false }),
    rango: v.opcion(query.rango, RANGOS, { campo: 'el rango de edad', requerido: false }),
    rubro: v.id(query.rubro, 'el rubro', false),
    desde: v.fecha(query.desde, { campo: 'la fecha inicial', requerido: false }),
    hasta: v.fecha(query.hasta, { campo: 'la fecha final', requerido: false }),
  };
}

router.get('/admin/estadisticas', asincrono(async (req, res) => {
  const tipo = v.opcion(req.query.tipo || 'participacion', ['participacion', 'demograficas', 'proyectos', 'seguimiento'], { campo: 'el tipo de estadística' });
  const f = filtrosEstadistica(req.query);
  const datos = await db.conUsuario(req.usuario.id, async (con) => {
    const ciclo = f.ciclo || ((await con.uno("SELECT id FROM ciclos WHERE estado = 'activo'")) || (await con.uno('SELECT id FROM ciclos ORDER BY creado_en DESC LIMIT 1')) || {}).id;
    if (!ciclo) return { tipo, ciclo: null };
    const wp = `ciclo_id = ? AND (? IS NULL OR alcaldia_id = ?) AND (? IS NULL OR unidad_territorial_id = ?)
                AND (? IS NULL OR genero = ?) AND (? IS NULL OR rango_edad = ?)`;
    const pp = [ciclo, f.alcaldia, f.alcaldia, f.unidad, f.unidad, f.genero, f.genero, f.rango, f.rango];
    if (tipo === 'participacion' || tipo === 'demograficas') {
      const total = await con.uno(`SELECT COALESCE(SUM(registrados), 0) AS registrados, COALESCE(SUM(votantes), 0) AS votantes,
                                          ROUND(100 * SUM(votantes) / NULLIF(SUM(registrados), 0), 2) AS porcentaje
                                   FROM v_est_participacion WHERE ${wp}`, pp);
      const porAlcaldia = await con.q(`SELECT alcaldia AS etiqueta, SUM(registrados) AS registrados, SUM(votantes) AS votantes
                                       FROM v_est_participacion WHERE ${wp} GROUP BY alcaldia ORDER BY alcaldia`, pp);
      if (tipo === 'participacion') {
        const porDia = await con.q(
          `SELECT DATE(pa.participo_en) AS dia, COUNT(*) AS votantes
           FROM participaciones pa JOIN ciudadanos ci ON ci.usuario_id = pa.ciudadano_id
           JOIN unidades_territoriales ut ON ut.id = pa.unidad_territorial_id
           WHERE pa.ciclo_id = ? AND (? IS NULL OR ut.alcaldia_id = ?) AND (? IS NULL OR pa.unidad_territorial_id = ?)
             AND (? IS NULL OR ci.genero = ?) AND (? IS NULL OR pa.participo_en >= ?) AND (? IS NULL OR pa.participo_en < DATE_ADD(?, INTERVAL 1 DAY))
           GROUP BY DATE(pa.participo_en) ORDER BY dia`,
          [ciclo, f.alcaldia, f.alcaldia, f.unidad, f.unidad, f.genero, f.genero, f.desde, f.desde, f.hasta, f.hasta]);
        return { tipo, ciclo, total, porAlcaldia, porDia };
      }
      const porGenero = await con.q(`SELECT genero AS etiqueta, SUM(registrados) AS registrados, SUM(votantes) AS votantes
                                     FROM v_est_participacion WHERE ${wp} GROUP BY genero ORDER BY FIELD(genero, 'mujer', 'hombre', 'no_binario', 'prefiero_no_decir')`, pp);
      const porEdad = await con.q(`SELECT rango_edad AS etiqueta, SUM(registrados) AS registrados, SUM(votantes) AS votantes
                                   FROM v_est_participacion WHERE ${wp} GROUP BY rango_edad ORDER BY rango_edad`, pp);
      return { tipo, ciclo, total, porGenero, porEdad, porAlcaldia };
    }
    if (tipo === 'proyectos') {
      const wpr = `p.ciclo_id = ? AND (? IS NULL OR ut.alcaldia_id = ?) AND (? IS NULL OR p.unidad_territorial_id = ?)
                   AND (? IS NULL OR p.rubro_id = ?) AND (? IS NULL OR p.creado_en >= ?) AND (? IS NULL OR p.creado_en < DATE_ADD(?, INTERVAL 1 DAY))`;
      const ppr = [ciclo, f.alcaldia, f.alcaldia, f.unidad, f.unidad, f.rubro, f.rubro, f.desde, f.desde, f.hasta, f.hasta];
      const sel = `SUM(p.estatus <> 'retirado') AS registrados, SUM(d.resultado = 'viable') AS viables,
                   SUM(d.resultado = 'no_viable') AS no_viables, COUNT(ru.proyecto_ganador_id) AS ganadores`;
      const from = `FROM proyectos p JOIN unidades_territoriales ut ON ut.id = p.unidad_territorial_id JOIN alcaldias a ON a.id = ut.alcaldia_id
                    JOIN rubros r ON r.id = p.rubro_id LEFT JOIN dictamenes d ON d.proyecto_id = p.id AND d.emitido_en IS NOT NULL
                    LEFT JOIN resultados_unidad ru ON ru.proyecto_ganador_id = p.id`;
      const total = await con.uno(`SELECT ${sel} ${from} WHERE ${wpr}`, ppr);
      const porRubro = await con.q(`SELECT r.nombre_es AS etiqueta, ${sel} ${from} WHERE ${wpr} GROUP BY r.id, r.nombre_es ORDER BY r.id`, ppr);
      const porAlcaldia = await con.q(`SELECT a.nombre AS etiqueta, ${sel} ${from} WHERE ${wpr} GROUP BY a.id, a.nombre ORDER BY a.nombre`, ppr);
      const porEstatus = await con.q(`SELECT p.estatus AS etiqueta, COUNT(*) AS n ${from} WHERE ${wpr} GROUP BY p.estatus ORDER BY n DESC`, ppr);
      return { tipo, ciclo, total, porRubro, porAlcaldia, porEstatus };
    }
    const ws = `ciclo_id = ? AND (? IS NULL OR alcaldia_id = ?) AND (? IS NULL OR unidad_territorial_id = ?) AND (? IS NULL OR rubro_id = ?)`;
    const ps = [ciclo, f.alcaldia, f.alcaldia, f.unidad, f.unidad, f.rubro, f.rubro];
    const total = await con.uno(`SELECT COUNT(*) AS proyectos, ROUND(AVG(avance_porcentaje), 2) AS avance_promedio,
                                        COALESCE(SUM(monto_ejercido), 0) AS monto_ejercido, COALESCE(SUM(presupuesto_asignado), 0) AS presupuesto_asignado,
                                        COALESCE(SUM(reportes), 0) AS reportes, COALESCE(SUM(irregularidades), 0) AS irregularidades,
                                        COALESCE(SUM(reportes_atendidos), 0) AS reportes_atendidos,
                                        ROUND(SUM(calificacion_promedio * total_calificaciones) / NULLIF(SUM(total_calificaciones), 0), 2) AS calificacion_promedio
                                 FROM v_est_seguimiento WHERE ${ws}`, ps);
    const porAlcaldia = await con.q(`SELECT alcaldia AS etiqueta, ROUND(AVG(avance_porcentaje), 2) AS avance_promedio,
                                            SUM(monto_ejercido) AS monto_ejercido, SUM(presupuesto_asignado) AS presupuesto_asignado,
                                            SUM(reportes) AS reportes, ROUND(AVG(calificacion_promedio), 2) AS calificacion_promedio
                                     FROM v_est_seguimiento WHERE ${ws} GROUP BY alcaldia ORDER BY alcaldia`, ps);
    const proyectos = await con.q(`SELECT folio, alcaldia, rubro, estatus, avance_porcentaje, monto_ejercido, presupuesto_asignado, reportes,
                                          irregularidades, calificacion_promedio, total_calificaciones
                                   FROM v_est_seguimiento WHERE ${ws} ORDER BY alcaldia, folio LIMIT 500`, ps);
    return { tipo, ciclo, total, porAlcaldia, proyectos };
  });
  res.json(datos);
}));

function filtrosBitacora(query) {
  return {
    usuario: v.id(query.funcionario, 'el funcionario', false),
    accion: v.texto(query.accion, { campo: 'el tipo de acción', max: 60, requerido: false }),
    alcaldia: v.id(query.alcaldia, 'la alcaldía', false),
    ciclo: v.id(query.ciclo, 'el ciclo', false),
    desde: v.fecha(query.desde, { campo: 'la fecha inicial', requerido: false }),
    hasta: v.fecha(query.hasta, { campo: 'la fecha final', requerido: false }),
  };
}
const WHERE_BIT = `(? IS NULL OR usuario_id = ?) AND (? IS NULL OR accion = ?) AND (? IS NULL OR alcaldia_id = ?)
                   AND (? IS NULL OR ciclo_id = ?) AND (? IS NULL OR realizada_en >= ?) AND (? IS NULL OR realizada_en < DATE_ADD(?, INTERVAL 1 DAY))`;
const paramsBit = (f) => [f.usuario, f.usuario, f.accion, f.accion, f.alcaldia, f.alcaldia, f.ciclo, f.ciclo, f.desde, f.desde, f.hasta, f.hasta];

router.get('/admin/bitacora', asincrono(async (req, res) => {
  const f = filtrosBitacora(req.query);
  const { limite, desplazamiento } = v.pagina(req.query, 50, 200);
  const datos = await db.conUsuario(req.usuario.id, async (con) => ({
    registros: await con.q(`SELECT id, realizada_en, usuario_id, responsable, rol, alcaldia, ciclo_id, accion, entidad, entidad_id, detalle
                            FROM v_bitacora WHERE ${WHERE_BIT} ORDER BY realizada_en DESC, id DESC LIMIT ? OFFSET ?`,
    [...paramsBit(f), limite, desplazamiento]),
    total: (await con.uno(`SELECT COUNT(*) AS n FROM v_bitacora WHERE ${WHERE_BIT}`, paramsBit(f))).n,
    acciones: (await con.q('SELECT DISTINCT accion FROM bitacora ORDER BY accion')).map((x) => x.accion),
    responsables: await con.q("SELECT id, nombre_completo, rol FROM usuarios WHERE rol IN ('funcionario', 'administrador') ORDER BY nombre_completo"),
  }));
  res.json(datos);
}));

router.get('/admin/bitacora.csv', asincrono(async (req, res) => {
  const f = filtrosBitacora(req.query);
  const buf = await db.conUsuario(req.usuario.id, async (con) => {
    const filas = await con.q(`SELECT * FROM v_bitacora WHERE ${WHERE_BIT} ORDER BY realizada_en DESC, id DESC LIMIT 50000`, paramsBit(f));
    const csv = aCsv([
      { titulo: 'Fecha', campo: 'realizada_en' }, { titulo: 'Responsable', campo: 'responsable' }, { titulo: 'Rol', campo: 'rol' },
      { titulo: 'Alcaldía', campo: 'alcaldia' }, { titulo: 'Ciclo', campo: 'ciclo_id' }, { titulo: 'Acción', campo: 'accion' },
      { titulo: 'Entidad', campo: 'entidad' }, { titulo: 'Id', campo: 'entidad_id' }, { titulo: 'Detalle', campo: 'detalle' },
    ], filas);
    await registrarExportacion(con, { cicloId: f.ciclo, tipo: 'bitacora_csv', categoria: 'exportacion', nombre: 'bitacora.csv', mime: 'text/csv', buf: csv, filtros: f });
    return csv;
  });
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="bitacora.csv"', 'Cache-Control': 'no-store' }).send(buf);
}));

function claveDe(nombre) {
  const c = categorias.normalizar(nombre).replace(/ñ/g, 'n').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 17);
  return /^[a-z]/.test(c) ? c : `t_${c}`.slice(0, 17);
}
function datosTipo(b, parcial) {
  const nombreEs = v.texto(b.nombre_es, { campo: 'el nombre del tipo', max: 60, min: 3 });
  const color = String(b.color || '').trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw peticionInvalida('Elige un color válido (por ejemplo #3B9EDB)');
  const palabras = v.texto(b.palabras, { campo: 'las palabras clave', max: 400, requerido: false }) || '';
  if (palabras && palabras.split(',').some((p) => p.trim().length > 40)) throw peticionInvalida('Separa las palabras clave con comas (cada una de máximo 40 letras)');
  return {
    nombre_es: nombreEs,
    nombre_en: v.texto(b.nombre_en, { campo: 'el nombre en inglés', max: 60, requerido: false }) || nombreEs,
    color: color.toUpperCase(),
    icono: v.opcion(b.icono, categorias.ICONOS, { campo: 'el dibujo' }),
    palabras: palabras.split(',').map((p) => p.trim().replace(/\s+/g, ' ')).filter(Boolean).join(', '),
    orden: v.entero(b.orden, { campo: 'el orden', min: 1, max: 998, requerido: false }),
    activa: parcial ? v.booleano(b.activa, true) : true,
  };
}
const tiposCambiaron = () => { categorias.invalidar(); publico.invalidarCatalogos(); };

router.get('/admin/categorias', asincrono(async (req, res) => {
  const filas = await db.conUsuario(req.usuario.id, (con) => con.q(
    `SELECT c.clave, c.nombre_es, c.nombre_en, c.color, c.icono, c.palabras, c.orden, c.activa, COUNT(p.id) AS proyectos
     FROM categorias_proyecto c LEFT JOIN proyectos p ON p.categoria = c.clave
     GROUP BY c.clave, c.nombre_es, c.nombre_en, c.color, c.icono, c.palabras, c.orden, c.activa
     ORDER BY c.orden, c.clave`));
  res.json({ tipos: filas.map((f) => ({ ...f, activa: Number(f.activa), proyectos: Number(f.proyectos) })), iconos: categorias.ICONOS, respaldo: categorias.RESPALDO });
}));

router.post('/admin/categorias', asincrono(async (req, res) => {
  const d = datosTipo(v.cuerpo(req), false);
  const clave = await db.conUsuario(req.usuario.id, async (con) => {
    if (await con.uno('SELECT 1 AS si FROM categorias_proyecto WHERE LOWER(nombre_es) = LOWER(?)', [d.nombre_es])) {
      throw conflicto('Ya existe un tipo con ese nombre');
    }
    const base = claveDe(d.nombre_es);
    let c = base;
    for (let i = 2; await con.uno('SELECT 1 AS si FROM categorias_proyecto WHERE clave = ?', [c]); i += 1) c = `${base}_${i}`;
    const orden = d.orden || Number((await con.uno('SELECT COALESCE(MAX(orden), 0) + 10 AS o FROM categorias_proyecto WHERE clave <> ?', [categorias.RESPALDO])).o);
    await con.q('INSERT INTO categorias_proyecto (clave, nombre_es, nombre_en, color, icono, palabras, orden, activa) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)',
      [c, d.nombre_es, d.nombre_en, d.color, d.icono, d.palabras, Math.min(orden, 998)]);
    return c;
  });
  tiposCambiaron();
  res.status(201).json({ ok: true, clave, mensaje: `Se agregó «${d.nombre_es}». Ya aparece en los formularios, los mapas y la simbología.` });
}));

router.put('/admin/categorias/:clave', asincrono(async (req, res) => {
  const clave = v.texto(req.params.clave, { campo: 'el tipo', max: 20 });
  const d = datosTipo(v.cuerpo(req), true);
  if (clave === categorias.RESPALDO && !d.activa) throw peticionInvalida('«Otro» no se puede desactivar: es el tipo que se usa cuando ningún otro coincide');
  await db.conUsuario(req.usuario.id, async (con) => {
    if (!(await con.uno('SELECT 1 AS si FROM categorias_proyecto WHERE clave = ?', [clave]))) throw noEncontrado('El tipo de proyecto no existe');
    if (await con.uno('SELECT 1 AS si FROM categorias_proyecto WHERE LOWER(nombre_es) = LOWER(?) AND clave <> ?', [d.nombre_es, clave])) {
      throw conflicto('Ya existe otro tipo con ese nombre');
    }
    const r = await con.q(`UPDATE categorias_proyecto SET nombre_es = ?, nombre_en = ?, color = ?, icono = ?, palabras = ?,
                           orden = COALESCE(?, orden), activa = ? WHERE clave = ?`,
    [d.nombre_es, d.nombre_en, d.color, d.icono, d.palabras, clave === categorias.RESPALDO ? null : d.orden, d.activa, clave]);
    return r;
  });
  tiposCambiaron();
  res.json({ ok: true, mensaje: 'Se guardaron los cambios. Los mapas ya usan el color y el dibujo nuevos.' });
}));

router.delete('/admin/categorias/:clave', asincrono(async (req, res) => {
  const clave = v.texto(req.params.clave, { campo: 'el tipo', max: 20 });
  if (clave === categorias.RESPALDO) throw peticionInvalida('«Otro» no se puede borrar');
  await db.conUsuario(req.usuario.id, async (con) => {
    const usos = await con.uno('SELECT COUNT(*) AS n FROM proyectos WHERE categoria = ?', [clave]);
    if (Number(usos.n) > 0) throw conflicto(`Hay ${usos.n} proyecto(s) con este tipo. Desactívalo en lugar de borrarlo: los proyectos conservan su color.`);
    const r = await con.q('DELETE FROM categorias_proyecto WHERE clave = ?', [clave]);
    if (!r.affectedRows) throw noEncontrado('El tipo de proyecto no existe');
  });
  tiposCambiaron();
  res.json({ ok: true, mensaje: 'Se borró el tipo de proyecto' });
}));

router.post('/admin/categorias/reclasificar', asincrono(async (req, res) => {
  await categorias.refrescar(true);
  const cambios = await db.conSistema(async (con) => {
    const filas = await con.q(`SELECT p.id, p.titulo, p.descripcion FROM proyectos p JOIN ciclos c ON c.id = p.ciclo_id
                               WHERE c.estado = 'activo' AND (p.categoria IS NULL OR p.categoria = ?)`, [categorias.RESPALDO]);
    let n = 0;
    for (const p of filas) {
      const nueva = categorias.adivinar(p.titulo, p.descripcion);
      if (nueva !== categorias.RESPALDO) { await con.q('UPDATE proyectos SET categoria = ? WHERE id = ?', [nueva, p.id]); n += 1; }
    }
    return { revisados: filas.length, n };
  });
  log.info(`Tipos de proyecto reclasificados por el administrador ${req.usuario.id}: ${cambios.n} de ${cambios.revisados}`);
  res.json({ ok: true, ...cambios, mensaje: cambios.n ? `Se asignó un tipo a ${cambios.n} de ${cambios.revisados} proyecto(s) que estaban como «Otro».` : 'Ningún proyecto marcado como «Otro» coincide con las palabras clave.' });
}));

const fechaLocal = (ms) => new Date(ms - 6 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');

router.get('/admin/correo', asincrono(async (req, res) => {
  const datos = await db.conUsuario(req.usuario.id, async (con) => {
    const cuenta = await con.q('SELECT estado, COUNT(*) AS n FROM correos_salida GROUP BY estado');
    const ultimo = await con.uno("SELECT ultimo_error, creado_en FROM correos_salida WHERE ultimo_error IS NOT NULL ORDER BY id DESC LIMIT 1");
    const recientes = await con.q('SELECT destinatario, asunto, estado, intentos, creado_en, enviado_en FROM correos_salida ORDER BY id DESC LIMIT 10');
    return { cuenta, ultimo, recientes };
  });
  const n = (e) => Number((datos.cuenta.find((x) => x.estado === e) || {}).n || 0);
  const c = config.correo;
  res.json({
    configurado: envioCorreo.configurado(), faltante: envioCorreo.faltante(), proveedor: c.proveedor || null,
    remitente: envioCorreo.esSmtp() ? (c.remitente || c.smtp.usuario) : c.remitente,
    servidor: envioCorreo.esSmtp() ? `${c.smtp.host}:${c.smtp.puerto}` : null,
    pendientes: n('pendiente'), enviados: n('enviado'), fallidos: n('fallido'),
    ultimoError: datos.ultimo ? datos.ultimo.ultimo_error : null,
    recientes: datos.recientes.map((x) => ({ ...x, destinatario: String(x.destinatario).replace(/^(.{2}).*(@.*)$/, '$1•••$2') })),
  });
}));

router.post('/admin/correo/prueba', asincrono(async (req, res) => {
  const destino = v.correo(v.cuerpo(req).destinatario);
  const r = await envioCorreo.enviarPrueba(destino);
  if (!r.ok) throw new ErrorApp(502, `No se pudo enviar el correo de prueba: ${r.error}`);
  envioCorreo.avisar();
  res.json({ ok: true, mensaje: `Se envió un correo de prueba a ${destino}. Revisa la bandeja de entrada (y la de spam).` });
}));

router.get('/admin/integraciones', asincrono(async (req, res) => {
  const datos = await db.conUsuario(req.usuario.id, async (con) => ({
    fuentes: await con.q(`SELECT e.*, f.url_base, f.recurso, f.atribucion, f.licencia,
                                 (SELECT sy.mensaje FROM sincronizaciones sy WHERE sy.fuente_id = e.id ORDER BY sy.iniciada_en DESC LIMIT 1) AS ultimo_mensaje
                          FROM v_estado_integraciones e JOIN fuentes_externas f ON f.id = e.id ORDER BY e.tipo, e.nombre`),
    errores: await con.q(`SELECT se.mensaje, se.id_externo, se.creado_en, fe.nombre AS fuente FROM sincronizacion_errores se
                          JOIN sincronizaciones sy ON sy.id = se.sincronizacion_id JOIN fuentes_externas fe ON fe.id = sy.fuente_id
                          ORDER BY se.creado_en DESC LIMIT 20`),
  }));
  const ahora = Date.now();
  for (const f of datos.fuentes) {
    if (!f.activa || f.tipo !== 'datos') continue;
    const intento = f.ultimo_intento ? Date.parse(String(f.ultimo_intento).replace(' ', 'T') + '-06:00') : NaN;
    if (f.ultimo_estado === 'fallida' && Number.isFinite(intento)) {
      const siguiente = intento + 6 * 3600 * 1000;
      if (siguiente > ahora) {
        f.proxima_sincronizacion = fechaLocal(siguiente);
      } else f.proxima_pronto = true;
    } else if (!f.ultima_sincronizacion_exitosa) f.proxima_pronto = true;
  }
  res.json(datos);
}));

router.put('/admin/integraciones/:clave', asincrono(async (req, res) => {
  const clave = v.texto(req.params.clave, { campo: 'la fuente', max: 40 });
  const b = v.cuerpo(req);
  const recurso = v.texto(b.recurso, { campo: 'el recurso', max: 255, requerido: false });
  const activa = v.booleano(b.activa);
  const frecuencia = v.entero(b.frecuencia_minutos, { campo: 'la frecuencia', min: 5, max: 525600, requerido: false });
  const r = await db.conUsuario(req.usuario.id, async (con) => {
    const f = await con.uno('SELECT tipo FROM fuentes_externas WHERE clave = ?', [clave]);
    if (!f) throw noEncontrado('La fuente no existe');
    if (activa && f.tipo === 'datos' && !recurso && !PERFILES[clave]) throw peticionInvalida('Indica el id del recurso antes de activar la fuente');
    return con.q('UPDATE fuentes_externas SET recurso = ?, activa = ?, frecuencia_minutos = COALESCE(?, frecuencia_minutos) WHERE clave = ?',
      [recurso, activa, frecuencia, clave]);
  });
  publico.invalidarCatalogos();
  res.json({ ok: true, cambios: r.affectedRows, mensaje: 'La fuente se actualizó' });
}));

router.post('/admin/integraciones/:clave/sincronizar', asincrono(async (req, res) => {
  const clave = v.texto(req.params.clave, { campo: 'la fuente', max: 40 });
  const fuente = await db.conUsuario(req.usuario.id, (con) => con.uno(
    "SELECT * FROM fuentes_externas WHERE clave = ? AND tipo = 'datos'", [clave]));
  if (!fuente) throw noEncontrado('La fuente de datos no existe');
  if (!fuente.activa) throw conflicto('Activa la fuente antes de sincronizarla');
  sincronizarFuente(fuente, 'manual', req.usuario.id)
    .then((r) => { publico.invalidarCatalogos(); log.info(`Sincronización manual ${clave}:`, r && r.estado); })
    .catch((e) => log.aviso(`Sincronización manual ${clave} falló:`, e.sqlMessage || e.message));
  res.status(202).json({ ok: true, mensaje: 'La sincronización comenzó. Actualiza en unos minutos para ver el resultado' });
}));

module.exports = router;
