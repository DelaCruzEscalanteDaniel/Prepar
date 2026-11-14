'use strict';
const express = require('express');
const db = require('../db');
const sesion = require('../lib/sesion');
const ciclo = require('../lib/ciclo');
const v = require('../lib/validar');
const { asincrono, invalido, noEncontrado } = require('../lib/errores');
const { ideasDelForo, detalleObra } = require('./ciudadano');

const r = express.Router();
const funcionario = sesion.requiere('funcionario');

r.get('/func/resumen', funcionario, asincrono(async (req, res) => {
  const c = await ciclo.activo();
  if (!c) return res.json({ ciclo: null, conteo: [] });
  const conteo = await db.q(
    `SELECT p.estatus, COUNT(*) AS total FROM proyectos p JOIN colonias co ON co.id = p.colonia_id
     WHERE p.ciclo_id = ? AND co.alcaldia_id = ? GROUP BY p.estatus`, [c.id, req.usuario.alcaldia_id]);
  return res.json({ ciclo: c, conteo });
}));

r.get('/func/proyectos', funcionario, asincrono(async (req, res) => {
  const c = await ciclo.activo();
  if (!c) return res.json({ ciclo: null, proyectos: [] });
  const proyectos = await db.q(
    `SELECT p.id, p.titulo, p.descripcion, p.costo, p.calle, p.numero, p.estatus, p.imagen_id,
            co.nombre AS colonia, cc.presupuesto, r.nombre AS rubro, u.nombre AS proponente,
            d.resultado, d.justificacion
     FROM proyectos p
     JOIN colonias co ON co.id = p.colonia_id
     JOIN ciclo_colonias cc ON cc.ciclo_id = p.ciclo_id AND cc.colonia_id = p.colonia_id
     JOIN rubros r ON r.id = p.rubro_id
     JOIN usuarios u ON u.id = p.proponente_id
     LEFT JOIN dictamenes d ON d.proyecto_id = p.id
     WHERE p.ciclo_id = ? AND co.alcaldia_id = ?
     ORDER BY p.estatus <> 'registrado', co.nombre, p.id`, [c.id, req.usuario.alcaldia_id]);
  return res.json({ ciclo: c, proyectos });
}));

async function proyectoDeMiAlcaldia(id, usuario) {
  const p = await db.uno(
    `SELECT p.id, p.estatus, p.costo, p.rubro_id FROM proyectos p JOIN colonias co ON co.id = p.colonia_id
     JOIN ciclos c ON c.id = p.ciclo_id WHERE p.id = ? AND co.alcaldia_id = ? AND c.estado = 'activo'`, [id, usuario.alcaldia_id]);
  if (!p) throw noEncontrado('El proyecto no existe');
  return p;
}

r.post('/func/proyectos/:id/dictamen', funcionario, asincrono(async (req, res) => {
  await ciclo.exigirActivo(3);
  const p = await proyectoDeMiAlcaldia(Number(req.params.id) || 0, req.usuario);
  if (p.estatus !== 'registrado') throw invalido('Este proyecto ya tiene dictamen');
  const resultado = req.body.resultado === 'viable' ? 'viable' : req.body.resultado === 'no_viable' ? 'no_viable' : null;
  if (!resultado) throw invalido('Elige si el proyecto es viable o no viable');
  const justificacion = v.texto(req.body.justificacion, 'la justificación', 500);
  await db.q('INSERT INTO dictamenes (proyecto_id, funcionario_id, resultado, justificacion) VALUES (?, ?, ?, ?)',
    [p.id, req.usuario.id, resultado, justificacion]);
  res.json({ ok: true });
}));

r.get('/func/sorteo', funcionario, asincrono(async (req, res) => {
  const c = await ciclo.activo();
  if (!c) return res.json({ ciclo: null, colonias: [] });
  const colonias = await db.q(
    `SELECT co.id, co.nombre,
            (SELECT COUNT(*) FROM proyectos p WHERE p.ciclo_id = ? AND p.colonia_id = co.id AND p.estatus = 'viable') AS viables,
            (SELECT COUNT(*) FROM proyectos p WHERE p.ciclo_id = ? AND p.colonia_id = co.id AND p.numero_boleta IS NOT NULL) AS en_boleta
     FROM colonias co WHERE co.alcaldia_id = ? ORDER BY co.nombre`, [c.id, c.id, req.usuario.alcaldia_id]);
  const boletas = await db.q(
    `SELECT p.colonia_id, p.numero_boleta, p.titulo FROM proyectos p JOIN colonias co ON co.id = p.colonia_id
     WHERE p.ciclo_id = ? AND co.alcaldia_id = ? AND p.numero_boleta IS NOT NULL ORDER BY p.numero_boleta`,
    [c.id, req.usuario.alcaldia_id]);
  for (const co of colonias) co.boleta = boletas.filter((b) => b.colonia_id === co.id);
  return res.json({ ciclo: c, colonias });
}));

r.post('/func/sorteo/:colonia', funcionario, asincrono(async (req, res) => {
  const c = await ciclo.exigirActivo(4);
  const colonia = await db.uno('SELECT id FROM colonias WHERE id = ? AND alcaldia_id = ?', [Number(req.params.colonia) || 0, req.usuario.alcaldia_id]);
  if (!colonia) throw noEncontrado('La colonia no es de tu alcaldía');
  await db.llamar('sp_sorteo', [c.id, colonia.id]);
  res.json({ ok: true });
}));

r.get('/func/obras', funcionario, asincrono(async (req, res) => {
  const c = await ciclo.activo();
  if (!c) return res.json({ ciclo: null, obras: [] });
  const obras = await db.q('SELECT * FROM v_obras WHERE ciclo_id = ? AND alcaldia_id = ? ORDER BY colonia, titulo', [c.id, req.usuario.alcaldia_id]);
  return res.json({ ciclo: c, obras });
}));

async function obraDeMiAlcaldia(id, usuario) {
  const obra = await detalleObra(id);
  if (obra.alcaldia_id !== usuario.alcaldia_id) throw noEncontrado('La obra no existe');
  return obra;
}

async function obraEditable(id, usuario) {
  const c = await ciclo.exigirActivo();
  if (c.fase_id < 7) throw invalido('Las obras se registran a partir de la fase de Ejecución y seguimiento');
  const obra = await obraDeMiAlcaldia(id, usuario);
  if (obra.ciclo_id !== c.id) throw noEncontrado('La obra no existe');
  if (obra.estatus === 'concluido' || obra.estatus === 'inejecutable') throw invalido('Esta obra ya está cerrada');
  return obra;
}

r.get('/func/obras/:id', funcionario, asincrono(async (req, res) => {
  const obra = await obraDeMiAlcaldia(Number(req.params.id) || 0, req.usuario);
  obra.gastos = await db.q('SELECT id, monto, concepto, fecha FROM gastos WHERE proyecto_id = ? ORDER BY id DESC', [obra.id]);
  res.json(obra);
}));

r.post('/func/obras/:id/pasos', funcionario, asincrono(async (req, res) => {
  const obra = await obraEditable(Number(req.params.id) || 0, req.usuario);
  const siguiente = obra.pasos.find((p) => !p.fecha);
  if (!siguiente) throw invalido('Todos los pasos ya están terminados');
  const queSeHizo = v.texto(req.body.que_se_hizo, 'qué se hizo', 250);
  await db.q('INSERT INTO pasos_proyecto (proyecto_id, paso_id, que_se_hizo, funcionario_id) VALUES (?, ?, ?, ?)',
    [obra.id, siguiente.id, queSeHizo, req.usuario.id]);
  res.json({ ok: true });
}));

r.post('/func/obras/:id/gastos', funcionario, asincrono(async (req, res) => {
  const obra = await obraEditable(Number(req.params.id) || 0, req.usuario);
  const monto = v.dinero(req.body.monto, 'El monto');
  const concepto = v.texto(req.body.concepto, 'el concepto', 150);
  await db.q('INSERT INTO gastos (proyecto_id, funcionario_id, monto, concepto) VALUES (?, ?, ?, ?)',
    [obra.id, req.usuario.id, monto, concepto]);
  res.json({ ok: true });
}));

r.post('/func/obras/:id/inejecutable', funcionario, asincrono(async (req, res) => {
  const obra = await obraEditable(Number(req.params.id) || 0, req.usuario);
  const motivo = v.texto(req.body.motivo, 'el motivo', 250);
  await db.q("UPDATE proyectos SET estatus = 'inejecutable', motivo_inejecutable = ? WHERE id = ?", [motivo, obra.id]);
  res.json({ ok: true });
}));

r.get('/func/foro', funcionario, asincrono(async (req, res) => {
  const c = await ciclo.activo();
  if (!c) return res.json({ ciclo: null, ideas: [] });
  return res.json({ ciclo: c, ideas: await ideasDelForo(c.id, req.usuario.alcaldia_id, 0) });
}));

r.delete('/func/ideas/:id', funcionario, asincrono(async (req, res) => {
  const borrado = await db.q(
    'DELETE i FROM ideas i JOIN colonias c ON c.id = i.colonia_id WHERE i.id = ? AND c.alcaldia_id = ?',
    [Number(req.params.id) || 0, req.usuario.alcaldia_id]);
  if (!borrado.affectedRows) throw noEncontrado('La idea no existe');
  res.json({ ok: true });
}));

r.delete('/func/comentarios/:id', funcionario, asincrono(async (req, res) => {
  const borrado = await db.q(
    `DELETE co FROM comentarios co JOIN ideas i ON i.id = co.idea_id JOIN colonias c ON c.id = i.colonia_id
     WHERE co.id = ? AND c.alcaldia_id = ?`, [Number(req.params.id) || 0, req.usuario.alcaldia_id]);
  if (!borrado.affectedRows) throw noEncontrado('El comentario no existe');
  res.json({ ok: true });
}));

r.delete('/func/fotos/:id', funcionario, asincrono(async (req, res) => {
  const foto = await db.uno(
    `SELECT f.id, f.imagen_id FROM fotos_denuncia f JOIN proyectos p ON p.id = f.proyecto_id
     JOIN colonias c ON c.id = p.colonia_id WHERE f.id = ? AND c.alcaldia_id = ?`, [Number(req.params.id) || 0, req.usuario.alcaldia_id]);
  if (!foto) throw noEncontrado('La foto no existe');
  await db.q('DELETE FROM fotos_denuncia WHERE id = ?', [foto.id]);
  await db.q('DELETE FROM imagenes WHERE id = ?', [foto.imagen_id]);
  res.json({ ok: true });
}));

module.exports = r;
