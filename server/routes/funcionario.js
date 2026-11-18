'use strict';
const express = require('express');
const db = require('../db');
const sesion = require('../lib/sesion');
const ciclo = require('../lib/ciclo');
const v = require('../lib/validar');
const { asincrono, invalido, noEncontrado } = require('../lib/errores');
const { registrar } = require('../lib/seguridad');
const { ideasDelForo, detalleObra, proyectosDelMapa } = require('./ciudadano');

const r = express.Router();
const funcionario = sesion.requiere('funcionario');
const MOTIVOS = ['ubicacion', 'costo', 'competencia', 'repetido', 'beneficio', 'otro'];

r.get('/func/resumen', funcionario, asincrono(async (req, res) => {
  const c = await ciclo.activo();
  if (!c) return res.json({ ciclo: null, conteo: [] });
  const conteo = await db.q(
    `SELECT p.estatus, COUNT(*) AS total FROM proyectos p JOIN colonias co ON co.id_colonia = p.id_colonia
     WHERE p.id_ciclo = ? AND co.id_alcaldia = ? GROUP BY p.estatus`, [c.id_ciclo, req.usuario.id_alcaldia]);
  return res.json({ ciclo: c, conteo });
}));

r.get('/func/proyectos', funcionario, asincrono(async (req, res) => {
  const c = await ciclo.activo();
  if (!c) return res.json({ ciclo: null, proyectos: [] });
  const proyectos = await db.q(
    `SELECT p.id_proyecto, p.titulo, p.descripcion, p.costo, p.calle, p.numero, p.estatus, p.id_imagen, p.latitud, p.longitud,
            co.nombre AS colonia, co.latitud AS colonia_latitud, co.longitud AS colonia_longitud, cc.presupuesto, r.nombre AS rubro,
            u.nombre AS proponente, d.resultado, d.motivo, d.justificacion
     FROM proyectos p
     JOIN colonias co ON co.id_colonia = p.id_colonia
     JOIN ciclo_colonias cc ON cc.id_ciclo = p.id_ciclo AND cc.id_colonia = p.id_colonia
     JOIN rubros r ON r.id_rubro = p.id_rubro
     JOIN usuarios u ON u.id_usuario = p.id_proponente
     LEFT JOIN dictamenes d ON d.id_proyecto = p.id_proyecto
     WHERE p.id_ciclo = ? AND co.id_alcaldia = ?
     ORDER BY p.estatus <> 'registrado', co.nombre, p.id_proyecto`, [c.id_ciclo, req.usuario.id_alcaldia]);
  return res.json({ ciclo: c, proyectos });
}));

async function proyectoDeMiAlcaldia(id, usuario) {
  const p = await db.uno(
    `SELECT p.id_proyecto, p.estatus, p.costo, p.id_rubro FROM proyectos p JOIN colonias co ON co.id_colonia = p.id_colonia
     JOIN ciclos c ON c.id_ciclo = p.id_ciclo WHERE p.id_proyecto = ? AND co.id_alcaldia = ? AND c.estado = 'activo'`, [id, usuario.id_alcaldia]);
  if (!p) throw noEncontrado('El proyecto no existe');
  return p;
}

r.post('/func/proyectos/:id/dictamen', funcionario, asincrono(async (req, res) => {
  await ciclo.exigirActivo(3);
  const p = await proyectoDeMiAlcaldia(Number(req.params.id) || 0, req.usuario);
  if (p.estatus !== 'registrado') throw invalido('Este proyecto ya tiene dictamen');
  const resultado = req.body.resultado === 'viable' ? 'viable' : req.body.resultado === 'no_viable' ? 'no_viable' : null;
  if (!resultado) throw invalido('Elige si el proyecto es viable o no viable');
  const motivo = resultado === 'no_viable' && MOTIVOS.includes(req.body.motivo) ? req.body.motivo : null;
  if (resultado === 'no_viable' && !motivo) throw invalido('Elige el motivo por el que el proyecto no es viable');
  const justificacion = v.texto(req.body.justificacion, 'la justificación', 500);
  await db.q('INSERT INTO dictamenes (id_proyecto, id_funcionario, resultado, motivo, justificacion) VALUES (?, ?, ?, ?, ?)',
    [p.id_proyecto, req.usuario.id_usuario, resultado, motivo, justificacion]);
  res.json({ ok: true });
}));

r.get('/func/sorteo', funcionario, asincrono(async (req, res) => {
  const c = await ciclo.activo();
  if (!c) return res.json({ ciclo: null, colonias: [] });
  const colonias = await db.q(
    `SELECT co.id_colonia, co.nombre,
            (SELECT COUNT(*) FROM proyectos p WHERE p.id_ciclo = ? AND p.id_colonia = co.id_colonia AND p.estatus = 'viable') AS viables,
            (SELECT COUNT(*) FROM proyectos p WHERE p.id_ciclo = ? AND p.id_colonia = co.id_colonia AND p.numero_boleta IS NOT NULL) AS en_boleta
     FROM colonias co WHERE co.id_alcaldia = ? ORDER BY co.nombre`, [c.id_ciclo, c.id_ciclo, req.usuario.id_alcaldia]);
  const boletas = await db.q(
    `SELECT p.id_colonia, p.numero_boleta, p.titulo FROM proyectos p JOIN colonias co ON co.id_colonia = p.id_colonia
     WHERE p.id_ciclo = ? AND co.id_alcaldia = ? AND p.numero_boleta IS NOT NULL ORDER BY p.numero_boleta`,
    [c.id_ciclo, req.usuario.id_alcaldia]);
  for (const co of colonias) co.boleta = boletas.filter((b) => b.id_colonia === co.id_colonia);
  return res.json({ ciclo: c, colonias });
}));

r.post('/func/sorteo/:colonia', funcionario, asincrono(async (req, res) => {
  const c = await ciclo.exigirActivo(4);
  const colonia = await db.uno('SELECT id_colonia FROM colonias WHERE id_colonia = ? AND id_alcaldia = ?', [Number(req.params.colonia) || 0, req.usuario.id_alcaldia]);
  if (!colonia) throw noEncontrado('La colonia no es de tu alcaldía');
  await db.llamar('sp_sorteo', [c.id_ciclo, colonia.id_colonia]);
  res.json({ ok: true });
}));

r.get('/func/obras', funcionario, asincrono(async (req, res) => {
  const c = await ciclo.activo();
  if (!c) return res.json({ ciclo: null, obras: [] });
  const obras = await db.q('SELECT * FROM v_obras WHERE id_ciclo = ? AND id_alcaldia = ? ORDER BY colonia, titulo', [c.id_ciclo, req.usuario.id_alcaldia]);
  return res.json({ ciclo: c, obras });
}));

async function obraDeMiAlcaldia(id, usuario) {
  const obra = await detalleObra(id);
  if (obra.id_alcaldia !== usuario.id_alcaldia) throw noEncontrado('La obra no existe');
  return obra;
}

async function obraEditable(id, usuario) {
  const c = await ciclo.exigirActivo();
  if (c.id_fase < 7) throw invalido('Las obras se registran a partir de la fase de Ejecución y seguimiento');
  const obra = await obraDeMiAlcaldia(id, usuario);
  if (obra.id_ciclo !== c.id_ciclo) throw noEncontrado('La obra no existe');
  if (obra.estatus === 'concluido' || obra.estatus === 'inejecutable') throw invalido('Esta obra ya está cerrada');
  return obra;
}

r.get('/func/obras/:id', funcionario, asincrono(async (req, res) => {
  const obra = await obraDeMiAlcaldia(Number(req.params.id) || 0, req.usuario);
  obra.gastos = await db.q('SELECT id_gasto, monto, concepto, fecha FROM gastos WHERE id_proyecto = ? ORDER BY id_gasto DESC', [obra.id_proyecto]);
  res.json(obra);
}));

r.post('/func/obras/:id/pasos', funcionario, asincrono(async (req, res) => {
  const obra = await obraEditable(Number(req.params.id) || 0, req.usuario);
  const siguiente = obra.pasos.find((p) => !p.fecha);
  if (!siguiente) throw invalido('Todos los pasos ya están terminados');
  const queSeHizo = v.texto(req.body.que_se_hizo, 'qué se hizo', 250);
  await db.q('INSERT INTO pasos_proyecto (id_proyecto, id_paso_rubro, que_se_hizo, id_funcionario) VALUES (?, ?, ?, ?)',
    [obra.id_proyecto, siguiente.id_paso_rubro, queSeHizo, req.usuario.id_usuario]);
  res.json({ ok: true });
}));

r.post('/func/obras/:id/gastos', funcionario, asincrono(async (req, res) => {
  const obra = await obraEditable(Number(req.params.id) || 0, req.usuario);
  const monto = v.dinero(req.body.monto, 'El monto');
  const concepto = v.texto(req.body.concepto, 'el concepto', 150);
  await db.q('INSERT INTO gastos (id_proyecto, id_funcionario, monto, concepto) VALUES (?, ?, ?, ?)',
    [obra.id_proyecto, req.usuario.id_usuario, monto, concepto]);
  res.json({ ok: true });
}));

r.post('/func/obras/:id/inejecutable', funcionario, asincrono(async (req, res) => {
  const obra = await obraEditable(Number(req.params.id) || 0, req.usuario);
  const motivo = v.texto(req.body.motivo, 'el motivo', 250);
  await db.q("UPDATE proyectos SET estatus = 'inejecutable', motivo_inejecutable = ? WHERE id_proyecto = ?", [motivo, obra.id_proyecto]);
  res.json({ ok: true });
}));

r.get('/func/foro', funcionario, asincrono(async (req, res) => {
  const c = await ciclo.activo();
  if (!c) return res.json({ ciclo: null, ideas: [] });
  return res.json({ ciclo: c, ideas: await ideasDelForo(c.id_ciclo, req.usuario.id_alcaldia, 0, { colonia: Number(req.query.colonia) || 0 }) });
}));

r.get('/func/mapa', funcionario, asincrono(proyectosDelMapa));

r.delete('/func/ideas/:id', funcionario, asincrono(async (req, res) => {
  const borrado = await db.q(
    'DELETE i FROM ideas i JOIN colonias c ON c.id_colonia = i.id_colonia WHERE i.id_idea = ? AND c.id_alcaldia = ?',
    [Number(req.params.id) || 0, req.usuario.id_alcaldia]);
  if (!borrado.affectedRows) throw noEncontrado('La idea no existe');
  registrar(`El funcionario ${req.usuario.id_usuario} borró la idea ${req.params.id}`);
  res.json({ ok: true });
}));

r.delete('/func/comentarios/:id', funcionario, asincrono(async (req, res) => {
  const borrado = await db.q(
    `DELETE co FROM comentarios co JOIN ideas i ON i.id_idea = co.id_idea JOIN colonias c ON c.id_colonia = i.id_colonia
     WHERE co.id_comentario = ? AND c.id_alcaldia = ?`, [Number(req.params.id) || 0, req.usuario.id_alcaldia]);
  if (!borrado.affectedRows) throw noEncontrado('El comentario no existe');
  registrar(`El funcionario ${req.usuario.id_usuario} borró el comentario ${req.params.id}`);
  res.json({ ok: true });
}));

r.delete('/func/fotos/:id', funcionario, asincrono(async (req, res) => {
  const foto = await db.uno(
    `SELECT f.id_foto_denuncia, f.id_imagen FROM fotos_denuncia f JOIN proyectos p ON p.id_proyecto = f.id_proyecto
     JOIN colonias c ON c.id_colonia = p.id_colonia WHERE f.id_foto_denuncia = ? AND c.id_alcaldia = ?`, [Number(req.params.id) || 0, req.usuario.id_alcaldia]);
  if (!foto) throw noEncontrado('La foto no existe');
  await db.q('DELETE FROM fotos_denuncia WHERE id_foto_denuncia = ?', [foto.id_foto_denuncia]);
  await db.q('DELETE FROM imagenes WHERE id_imagen = ?', [foto.id_imagen]);
  registrar(`El funcionario ${req.usuario.id_usuario} borró la foto ${foto.id_foto_denuncia}`);
  res.json({ ok: true });
}));

module.exports = r;
