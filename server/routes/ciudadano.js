'use strict';
const express = require('express');
const db = require('../db');
const sesion = require('../lib/sesion');
const ciclo = require('../lib/ciclo');
const imagenes = require('../lib/imagenes');
const v = require('../lib/validar');
const { asincrono, invalido, noEncontrado } = require('../lib/errores');

const r = express.Router();
const ciudadano = sesion.requiere('ciudadano');

const nombreCorto = (n) => {
  const [nombre, apellido] = String(n || '').split(' ');
  return apellido ? `${nombre} ${apellido[0]}.` : nombre;
};

async function ideasDelForo(cicloId, alcaldiaId, usuarioId, filtros = {}) {
  const ideas = await db.q(
    `SELECT i.id, i.texto, i.creada_en, i.colonia_id, c.nombre AS colonia, r.nombre AS rubro, u.nombre AS autor,
            (SELECT COUNT(*) FROM apoyos a WHERE a.idea_id = i.id) AS apoyos,
            EXISTS (SELECT 1 FROM apoyos a WHERE a.idea_id = i.id AND a.usuario_id = ?) AS yo_apoyo
     FROM ideas i
     JOIN colonias c ON c.id = i.colonia_id
     JOIN rubros r ON r.id = i.rubro_id
     JOIN usuarios u ON u.id = i.autor_id
     WHERE i.ciclo_id = ? AND c.alcaldia_id = ?
       AND (? = 0 OR i.colonia_id = ?) AND (? = 0 OR i.rubro_id = ?)
     ORDER BY apoyos DESC, i.id DESC`,
    [usuarioId, cicloId, alcaldiaId, filtros.colonia || 0, filtros.colonia || 0, filtros.rubro || 0, filtros.rubro || 0]);
  const comentarios = ideas.length ? await db.q(
    `SELECT co.id, co.idea_id, co.texto, co.creado_en, u.nombre AS autor
     FROM comentarios co JOIN usuarios u ON u.id = co.autor_id
     WHERE co.idea_id IN (?) ORDER BY co.id`, [ideas.map((i) => i.id)]) : [];
  for (const i of ideas) {
    i.autor = nombreCorto(i.autor);
    i.yo_apoyo = !!i.yo_apoyo;
    i.comentarios = comentarios.filter((c) => c.idea_id === i.id).map((c) => ({ ...c, autor: nombreCorto(c.autor) }));
  }
  return ideas;
}

r.get('/foro', ciudadano, asincrono(async (req, res) => {
  const c = await ciclo.activo();
  if (!c) return res.json({ ciclo: null, ideas: [] });
  const ideas = await ideasDelForo(c.id, req.usuario.alcaldia_id, req.usuario.id,
    { colonia: Number(req.query.colonia) || 0, rubro: Number(req.query.rubro) || 0 });
  return res.json({ ciclo: c, ideas });
}));

r.post('/ideas', ciudadano, asincrono(async (req, res) => {
  const c = await ciclo.exigirActivo();
  const texto = v.texto(req.body.texto, 'tu idea', 500);
  const rubro = v.entero(req.body.rubro_id, 'El rubro');
  await db.q('INSERT INTO ideas (ciclo_id, colonia_id, autor_id, rubro_id, texto) VALUES (?, ?, ?, ?, ?)',
    [c.id, req.usuario.colonia_id, req.usuario.id, rubro, texto]);
  res.status(201).json({ ok: true });
}));

async function ideaDeMiAlcaldia(id, usuario) {
  const idea = await db.uno(
    `SELECT i.id FROM ideas i JOIN colonias c ON c.id = i.colonia_id JOIN ciclos ci ON ci.id = i.ciclo_id
     WHERE i.id = ? AND c.alcaldia_id = ? AND ci.estado = 'activo'`, [id, usuario.alcaldia_id]);
  if (!idea) throw noEncontrado('La idea no existe');
  return idea;
}

r.post('/ideas/:id/apoyo', ciudadano, asincrono(async (req, res) => {
  const idea = await ideaDeMiAlcaldia(Number(req.params.id) || 0, req.usuario);
  const borrado = await db.q('DELETE FROM apoyos WHERE idea_id = ? AND usuario_id = ?', [idea.id, req.usuario.id]);
  if (!borrado.affectedRows) await db.q('INSERT INTO apoyos (idea_id, usuario_id) VALUES (?, ?)', [idea.id, req.usuario.id]);
  res.json({ ok: true, apoyo: !borrado.affectedRows });
}));

r.post('/ideas/:id/comentarios', ciudadano, asincrono(async (req, res) => {
  const idea = await ideaDeMiAlcaldia(Number(req.params.id) || 0, req.usuario);
  const texto = v.texto(req.body.texto, 'tu comentario', 250);
  await db.q('INSERT INTO comentarios (idea_id, autor_id, texto) VALUES (?, ?, ?)', [idea.id, req.usuario.id, texto]);
  res.status(201).json({ ok: true });
}));

r.get('/mis-proyectos', ciudadano, asincrono(async (req, res) => {
  const c = await ciclo.activo();
  if (!c) return res.json({ ciclo: null, proyectos: [] });
  const proyectos = await db.q(
    `SELECT p.id, p.titulo, p.costo, p.estatus, r.nombre AS rubro, d.justificacion
     FROM proyectos p JOIN rubros r ON r.id = p.rubro_id LEFT JOIN dictamenes d ON d.proyecto_id = p.id
     WHERE p.ciclo_id = ? AND p.proponente_id = ? ORDER BY p.id DESC`, [c.id, req.usuario.id]);
  return res.json({ ciclo: c, proyectos });
}));

r.post('/proyectos', ciudadano, asincrono(async (req, res) => {
  const c = await ciclo.exigirActivo(2);
  const b = req.body || {};
  const datos = [
    c.id, req.usuario.colonia_id, req.usuario.id,
    v.entero(b.rubro_id, 'El rubro'),
    v.texto(b.titulo, 'el título', 100),
    v.texto(b.descripcion, 'la descripción', 500),
    v.dinero(b.costo, 'El costo'),
    v.texto(b.calle, 'la calle', 100),
    v.texto(b.numero, 'el número', 10, false),
    v.coordenada(b.latitud, 18.9, 19.7),
    v.coordenada(b.longitud, -99.4, -98.9),
  ];
  const imagen = b.foto ? await imagenes.guardar(Buffer.from(String(b.foto), 'base64')) : null;
  await db.q(
    `INSERT INTO proyectos (ciclo_id, colonia_id, proponente_id, rubro_id, titulo, descripcion, costo, calle, numero, latitud, longitud, imagen_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [...datos, imagen]);
  res.status(201).json({ ok: true });
}));

r.get('/boleta', ciudadano, asincrono(async (req, res) => {
  const c = await ciclo.activo();
  if (!c) return res.json({ ciclo: null, proyectos: [] });
  const proyectos = await db.q(
    `SELECT p.id, p.numero_boleta, p.titulo, p.descripcion, p.costo, r.nombre AS rubro, p.imagen_id
     FROM proyectos p JOIN rubros r ON r.id = p.rubro_id
     WHERE p.ciclo_id = ? AND p.colonia_id = ? AND p.numero_boleta IS NOT NULL ORDER BY p.numero_boleta`,
    [c.id, req.usuario.colonia_id]);
  const voto = await db.uno('SELECT folio, fecha FROM participaciones WHERE ciclo_id = ? AND usuario_id = ?', [c.id, req.usuario.id]);
  return res.json({ ciclo: c, proyectos, voto });
}));

r.post('/votar', ciudadano, asincrono(async (req, res) => {
  await ciclo.exigirActivo(5);
  const proyecto = v.entero(req.body.proyecto_id, 'El proyecto');
  const filas = await db.llamar('sp_votar', [req.usuario.id, proyecto]);
  res.json({ ok: true, folio: filas[0].folio });
}));

r.get('/mapa', ciudadano, asincrono(async (req, res) => {
  const c = await ciclo.activo();
  if (!c) return res.json({ ciclo: null, proyectos: [] });
  const proyectos = await db.q(
    `SELECT p.id, p.titulo, p.costo, p.estatus, p.latitud, p.longitud, p.colonia_id, co.nombre AS colonia,
            p.rubro_id, r.nombre AS rubro, r.color, av.avance, av.gastado
     FROM proyectos p
     JOIN colonias co ON co.id = p.colonia_id
     JOIN rubros r ON r.id = p.rubro_id
     JOIN v_avance_proyecto av ON av.proyecto_id = p.id
     WHERE p.ciclo_id = ? AND co.alcaldia_id = ? AND p.estatus <> 'no_viable' AND p.latitud IS NOT NULL`,
    [c.id, req.usuario.alcaldia_id]);
  return res.json({ ciclo: c, proyectos });
}));

r.get('/obras', ciudadano, asincrono(async (req, res) => {
  const c = await ciclo.activo();
  if (!c) return res.json({ ciclo: null, obras: [] });
  const obras = await db.q('SELECT * FROM v_obras WHERE ciclo_id = ? AND alcaldia_id = ? ORDER BY colonia_id = ? DESC, colonia, titulo',
    [c.id, req.usuario.alcaldia_id, req.usuario.colonia_id]);
  return res.json({ ciclo: c, obras });
}));

async function detalleObra(id) {
  const obra = await db.uno('SELECT * FROM v_obras WHERE id = ?', [id]);
  if (!obra) throw noEncontrado('La obra no existe');
  obra.pasos = await db.q(
    `SELECT pr.id, pr.orden, pr.nombre, pr.porcentaje, pp.que_se_hizo, pp.fecha
     FROM pasos_rubro pr LEFT JOIN pasos_proyecto pp ON pp.paso_id = pr.id AND pp.proyecto_id = ?
     WHERE pr.rubro_id = ? ORDER BY pr.orden`, [id, obra.rubro_id]);
  obra.fotos = (await db.q(
    `SELECT f.id, f.imagen_id, f.comentario, f.fecha, u.nombre AS autor
     FROM fotos_denuncia f JOIN usuarios u ON u.id = f.autor_id WHERE f.proyecto_id = ? ORDER BY f.id DESC`, [id]))
    .map((f) => ({ ...f, autor: nombreCorto(f.autor) }));
  return obra;
}

r.get('/obras/:id', ciudadano, asincrono(async (req, res) => {
  const obra = await detalleObra(Number(req.params.id) || 0);
  if (obra.alcaldia_id !== req.usuario.alcaldia_id) throw noEncontrado('La obra no existe');
  res.json(obra);
}));

r.post('/obras/:id/fotos', ciudadano, asincrono(async (req, res) => {
  const obra = await db.uno('SELECT id, alcaldia_id FROM v_obras WHERE id = ?', [Number(req.params.id) || 0]);
  if (!obra || obra.alcaldia_id !== req.usuario.alcaldia_id) throw noEncontrado('La obra no existe');
  const comentario = v.texto(req.body.comentario, 'un comentario', 250);
  if (!req.body.foto) throw invalido('Elige una foto');
  const imagen = await imagenes.guardar(Buffer.from(String(req.body.foto), 'base64'));
  await db.q('INSERT INTO fotos_denuncia (proyecto_id, autor_id, imagen_id, comentario) VALUES (?, ?, ?, ?)',
    [obra.id, req.usuario.id, imagen, comentario]);
  res.status(201).json({ ok: true });
}));

module.exports = r;
module.exports.ideasDelForo = ideasDelForo;
module.exports.detalleObra = detalleObra;
