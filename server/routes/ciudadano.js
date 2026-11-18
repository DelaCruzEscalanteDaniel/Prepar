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
    `SELECT i.id_idea, i.texto, i.creada_en, i.id_colonia, c.nombre AS colonia, r.nombre AS rubro, u.nombre AS autor,
            (SELECT COUNT(*) FROM apoyos a WHERE a.id_idea = i.id_idea) AS apoyos,
            EXISTS (SELECT 1 FROM apoyos a WHERE a.id_idea = i.id_idea AND a.id_usuario = ?) AS yo_apoyo
     FROM ideas i
     JOIN colonias c ON c.id_colonia = i.id_colonia
     JOIN rubros r ON r.id_rubro = i.id_rubro
     JOIN usuarios u ON u.id_usuario = i.id_autor
     WHERE i.id_ciclo = ? AND c.id_alcaldia = ?
       AND (? = 0 OR i.id_colonia = ?) AND (? = 0 OR i.id_rubro = ?)
     ORDER BY apoyos DESC, i.id_idea DESC`,
    [usuarioId, cicloId, alcaldiaId, filtros.colonia || 0, filtros.colonia || 0, filtros.rubro || 0, filtros.rubro || 0]);
  const comentarios = ideas.length ? await db.q(
    `SELECT co.id_comentario, co.id_idea, co.texto, co.creado_en, u.nombre AS autor
     FROM comentarios co JOIN usuarios u ON u.id_usuario = co.id_autor
     WHERE co.id_idea IN (?) ORDER BY co.id_comentario`, [ideas.map((i) => i.id_idea)]) : [];
  for (const i of ideas) {
    i.autor = nombreCorto(i.autor);
    i.yo_apoyo = !!i.yo_apoyo;
    i.comentarios = comentarios.filter((c) => c.id_idea === i.id_idea).map((c) => ({ ...c, autor: nombreCorto(c.autor) }));
  }
  return ideas;
}

r.get('/foro', ciudadano, asincrono(async (req, res) => {
  const c = await ciclo.activo();
  if (!c) return res.json({ ciclo: null, ideas: [] });
  const ideas = await ideasDelForo(c.id_ciclo, req.usuario.id_alcaldia, req.usuario.id_usuario,
    { colonia: Number(req.query.colonia) || 0, rubro: Number(req.query.rubro) || 0 });
  return res.json({ ciclo: c, ideas });
}));

r.post('/ideas', ciudadano, asincrono(async (req, res) => {
  const c = await ciclo.exigirActivo();
  const texto = v.texto(req.body.texto, 'tu idea', 500);
  const rubro = v.entero(req.body.id_rubro, 'El rubro');
  await db.q('INSERT INTO ideas (id_ciclo, id_colonia, id_autor, id_rubro, texto) VALUES (?, ?, ?, ?, ?)',
    [c.id_ciclo, req.usuario.id_colonia, req.usuario.id_usuario, rubro, texto]);
  res.status(201).json({ ok: true });
}));

async function ideaDeMiAlcaldia(id, usuario) {
  const idea = await db.uno(
    `SELECT i.id_idea FROM ideas i JOIN colonias c ON c.id_colonia = i.id_colonia JOIN ciclos ci ON ci.id_ciclo = i.id_ciclo
     WHERE i.id_idea = ? AND c.id_alcaldia = ? AND ci.estado = 'activo'`, [id, usuario.id_alcaldia]);
  if (!idea) throw noEncontrado('La idea no existe');
  return idea;
}

r.post('/ideas/:id/apoyo', ciudadano, asincrono(async (req, res) => {
  const idea = await ideaDeMiAlcaldia(Number(req.params.id) || 0, req.usuario);
  const borrado = await db.q('DELETE FROM apoyos WHERE id_idea = ? AND id_usuario = ?', [idea.id_idea, req.usuario.id_usuario]);
  if (!borrado.affectedRows) await db.q('INSERT INTO apoyos (id_idea, id_usuario) VALUES (?, ?)', [idea.id_idea, req.usuario.id_usuario]);
  res.json({ ok: true, apoyo: !borrado.affectedRows });
}));

r.post('/ideas/:id/comentarios', ciudadano, asincrono(async (req, res) => {
  const idea = await ideaDeMiAlcaldia(Number(req.params.id) || 0, req.usuario);
  const texto = v.texto(req.body.texto, 'tu comentario', 250);
  await db.q('INSERT INTO comentarios (id_idea, id_autor, texto) VALUES (?, ?, ?)', [idea.id_idea, req.usuario.id_usuario, texto]);
  res.status(201).json({ ok: true });
}));

r.get('/mis-proyectos', ciudadano, asincrono(async (req, res) => {
  const c = await ciclo.activo();
  if (!c) return res.json({ ciclo: null, proyectos: [] });
  const proyectos = await db.q(
    `SELECT p.id_proyecto, p.titulo, p.costo, p.estatus, r.nombre AS rubro, d.justificacion
     FROM proyectos p JOIN rubros r ON r.id_rubro = p.id_rubro LEFT JOIN dictamenes d ON d.id_proyecto = p.id_proyecto
     WHERE p.id_ciclo = ? AND p.id_proponente = ? ORDER BY p.id_proyecto DESC`, [c.id_ciclo, req.usuario.id_usuario]);
  return res.json({ ciclo: c, proyectos });
}));

r.post('/proyectos', ciudadano, asincrono(async (req, res) => {
  const c = await ciclo.exigirActivo(2);
  const b = req.body || {};
  const datos = [
    c.id_ciclo, req.usuario.id_colonia, req.usuario.id_usuario,
    v.entero(b.id_rubro, 'El rubro'),
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
    `INSERT INTO proyectos (id_ciclo, id_colonia, id_proponente, id_rubro, titulo, descripcion, costo, calle, numero, latitud, longitud, id_imagen)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [...datos, imagen]);
  res.status(201).json({ ok: true });
}));

r.get('/boleta', ciudadano, asincrono(async (req, res) => {
  const c = await ciclo.activo();
  if (!c) return res.json({ ciclo: null, proyectos: [] });
  const proyectos = await db.q(
    `SELECT p.id_proyecto, p.numero_boleta, p.titulo, p.descripcion, p.costo, r.nombre AS rubro, p.id_imagen
     FROM proyectos p JOIN rubros r ON r.id_rubro = p.id_rubro
     WHERE p.id_ciclo = ? AND p.id_colonia = ? AND p.numero_boleta IS NOT NULL ORDER BY p.numero_boleta`,
    [c.id_ciclo, req.usuario.id_colonia]);
  const voto = await db.uno('SELECT folio, fecha FROM participaciones WHERE id_ciclo = ? AND id_usuario = ?', [c.id_ciclo, req.usuario.id_usuario]);
  return res.json({ ciclo: c, proyectos, voto });
}));

r.post('/votar', ciudadano, asincrono(async (req, res) => {
  await ciclo.exigirActivo(5);
  const proyecto = v.entero(req.body.id_proyecto, 'El proyecto');
  const filas = await db.llamar('sp_votar', [req.usuario.id_usuario, proyecto]);
  res.json({ ok: true, folio: filas[0].folio });
}));

r.get('/resultados', ciudadano, asincrono(async (req, res) => {
  const c = await ciclo.activo();
  if (!c || c.id_fase < 6) return res.json({ ciclo: c, proyectos: [], total: 0 });
  const proyectos = (await db.q(
    `SELECT p.titulo, p.estatus, (SELECT COUNT(*) FROM votos v WHERE v.id_proyecto = p.id_proyecto) AS votos
     FROM proyectos p WHERE p.id_ciclo = ? AND p.id_colonia = ? AND p.numero_boleta IS NOT NULL
     ORDER BY votos DESC, p.id_proyecto`, [c.id_ciclo, req.usuario.id_colonia]))
    .map((p) => ({ titulo: p.titulo, votos: p.votos, ganador: !['viable', 'no_viable', 'registrado'].includes(p.estatus) }));
  return res.json({ ciclo: c, proyectos, total: proyectos.reduce((s, p) => s + p.votos, 0) });
}));

async function proyectosDelMapa(req, res) {
  const c = await ciclo.activo();
  if (!c) return res.json({ ciclo: null, proyectos: [] });
  const proyectos = await db.q(
    `SELECT p.id_proyecto, p.titulo, p.costo, p.estatus, p.latitud, p.longitud, p.id_colonia, co.nombre AS colonia,
            p.id_rubro, r.nombre AS rubro, r.color, av.avance, av.gastado
     FROM proyectos p
     JOIN colonias co ON co.id_colonia = p.id_colonia
     JOIN rubros r ON r.id_rubro = p.id_rubro
     JOIN v_avance_proyecto av ON av.id_proyecto = p.id_proyecto
     WHERE p.id_ciclo = ? AND co.id_alcaldia = ? AND p.estatus <> 'no_viable' AND p.latitud IS NOT NULL`,
    [c.id_ciclo, req.usuario.id_alcaldia]);
  return res.json({ ciclo: c, proyectos });
}

r.get('/mapa', ciudadano, asincrono(proyectosDelMapa));

r.get('/obras', ciudadano, asincrono(async (req, res) => {
  const c = await ciclo.activo();
  if (!c) return res.json({ ciclo: null, obras: [] });
  const obras = await db.q('SELECT * FROM v_obras WHERE id_ciclo = ? AND id_alcaldia = ? ORDER BY id_colonia = ? DESC, colonia, titulo',
    [c.id_ciclo, req.usuario.id_alcaldia, req.usuario.id_colonia]);
  return res.json({ ciclo: c, obras });
}));

async function detalleObra(id) {
  const obra = await db.uno('SELECT * FROM v_obras WHERE id_proyecto = ?', [id]);
  if (!obra) throw noEncontrado('La obra no existe');
  obra.pasos = await db.q(
    `SELECT pr.id_paso_rubro, pr.orden, pr.nombre, pr.porcentaje, pp.que_se_hizo, pp.fecha
     FROM pasos_rubro pr LEFT JOIN pasos_proyecto pp ON pp.id_paso_rubro = pr.id_paso_rubro AND pp.id_proyecto = ?
     WHERE pr.id_rubro = ? ORDER BY pr.orden`, [id, obra.id_rubro]);
  obra.fotos = (await db.q(
    `SELECT f.id_foto_denuncia, f.id_imagen, f.comentario, f.fecha, u.nombre AS autor
     FROM fotos_denuncia f JOIN usuarios u ON u.id_usuario = f.id_autor WHERE f.id_proyecto = ? ORDER BY f.id_foto_denuncia DESC`, [id]))
    .map((f) => ({ ...f, autor: nombreCorto(f.autor) }));
  return obra;
}

r.get('/obras/:id', ciudadano, asincrono(async (req, res) => {
  const obra = await detalleObra(Number(req.params.id) || 0);
  if (obra.id_alcaldia !== req.usuario.id_alcaldia) throw noEncontrado('La obra no existe');
  res.json(obra);
}));

r.post('/obras/:id/fotos', ciudadano, asincrono(async (req, res) => {
  const obra = await db.uno('SELECT id_proyecto, id_alcaldia FROM v_obras WHERE id_proyecto = ?', [Number(req.params.id) || 0]);
  if (!obra || obra.id_alcaldia !== req.usuario.id_alcaldia) throw noEncontrado('La obra no existe');
  const comentario = v.texto(req.body.comentario, 'un comentario', 250);
  if (!req.body.foto) throw invalido('Elige una foto');
  const imagen = await imagenes.guardar(Buffer.from(String(req.body.foto), 'base64'));
  await db.q('INSERT INTO fotos_denuncia (id_proyecto, id_autor, id_imagen, comentario) VALUES (?, ?, ?, ?)',
    [obra.id_proyecto, req.usuario.id_usuario, imagen, comentario]);
  res.status(201).json({ ok: true });
}));

module.exports = r;
module.exports.ideasDelForo = ideasDelForo;
module.exports.detalleObra = detalleObra;
module.exports.proyectosDelMapa = proyectosDelMapa;
