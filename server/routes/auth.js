'use strict';
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const config = require('../config');
const sesion = require('../lib/sesion');
const correo = require('../lib/correo');
const ciclo = require('../lib/ciclo');
const v = require('../lib/validar');
const { asincrono, invalido } = require('../lib/errores');

const r = express.Router();
const ERROR_LOGIN = 'Correo o contraseña incorrectos';

r.get('/catalogos', asincrono(async (req, res) => {
  res.json({
    alcaldias: await db.q('SELECT id, nombre FROM alcaldias ORDER BY nombre'),
    colonias: await db.q('SELECT id, alcaldia_id, nombre, latitud, longitud FROM colonias ORDER BY nombre'),
    rubros: await db.q('SELECT id, nombre, color FROM rubros ORDER BY id'),
    fases: await db.q('SELECT id, nombre, descripcion FROM fases ORDER BY id'),
  });
}));

r.post('/registro', asincrono(async (req, res) => {
  const b = req.body || {};
  if (b.acepto !== true) throw invalido('Debes aceptar el aviso de privacidad');
  const nombre = v.texto(b.nombre, 'tu nombre', 60);
  const email = v.correo(b.correo);
  const password = v.password(b.password);
  const telefono = v.telefono(b.telefono);
  const colonia = v.entero(b.colonia_id, 'La colonia');
  if (!(await db.uno('SELECT id FROM colonias WHERE id = ?', [colonia]))) throw invalido('Elige tu colonia');
  if (await db.uno('SELECT id FROM usuarios WHERE correo = ?', [email])) throw invalido('Ya existe una cuenta con ese correo');
  const hash = await bcrypt.hash(password, 10);
  const nuevo = await db.q(
    "INSERT INTO usuarios (rol, nombre, correo, password_hash, telefono, colonia_id) VALUES ('ciudadano', ?, ?, ?, ?, ?)",
    [nombre, email, hash, telefono, colonia]);
  await sesion.crear(res, nuevo.insertId);
  res.status(201).json({ ok: true, rol: 'ciudadano' });
}));

r.post('/login', asincrono(async (req, res) => {
  const b = req.body || {};
  const email = String(b.correo || '').trim().toLowerCase();
  const password = String(b.password || '');
  const u = await db.uno(
    'SELECT id, rol, password_hash, activo, intentos_fallidos, bloqueado_hasta > NOW() AS bloqueado FROM usuarios WHERE correo = ?', [email]);
  if (!u || !u.activo || u.bloqueado || !(await bcrypt.compare(password, u.password_hash))) {
    if (u && !u.bloqueado) {
      const intentos = u.intentos_fallidos + 1;
      if (intentos >= 5) await db.q('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NOW() + INTERVAL 15 MINUTE WHERE id = ?', [u.id]);
      else await db.q('UPDATE usuarios SET intentos_fallidos = ? WHERE id = ?', [intentos, u.id]);
    }
    throw invalido(ERROR_LOGIN);
  }
  await db.q('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?', [u.id]);
  await sesion.crear(res, u.id);
  res.json({ ok: true, rol: u.rol });
}));

r.post('/logout', asincrono(async (req, res) => {
  await sesion.cerrar(req, res);
  res.json({ ok: true });
}));

r.get('/yo', sesion.requiere(), (req, res) => res.json(req.usuario));

r.get('/ciclo', sesion.requiere(), asincrono(async (req, res) => {
  const c = await ciclo.activo();
  if (c && req.usuario.colonia_id) {
    const cc = await db.uno('SELECT presupuesto FROM ciclo_colonias WHERE ciclo_id = ? AND colonia_id = ?', [c.id, req.usuario.colonia_id]);
    c.presupuesto_colonia = cc ? cc.presupuesto : null;
  }
  res.json({ ciclo: c, fases: await db.q('SELECT id, nombre FROM fases ORDER BY id') });
}));

r.post('/recuperar', asincrono(async (req, res) => {
  const email = String((req.body || {}).correo || '').trim().toLowerCase();
  const u = await db.uno('SELECT id, nombre FROM usuarios WHERE correo = ? AND activo', [email]);
  if (u) {
    const token = crypto.randomBytes(32).toString('hex');
    await db.q('INSERT INTO recuperaciones (usuario_id, token, expira_en) VALUES (?, ?, NOW() + INTERVAL 1 HOUR)', [u.id, sesion.sha256(token)]);
    await correo.enviar(email, 'Prepar · Recupera tu contraseña',
      `Hola, ${u.nombre}.\n\nPara crear una contraseña nueva abre este enlace (vale 1 hora):\n${config.urlPublica}/restablecer.html?token=${token}\n\nSi no lo pediste, ignora este correo.`);
  }
  res.json({ ok: true, mensaje: 'Si el correo está registrado, te enviamos un enlace para crear una contraseña nueva' });
}));

r.post('/restablecer', asincrono(async (req, res) => {
  const b = req.body || {};
  const password = v.password(b.password);
  const rec = await db.uno('SELECT id, usuario_id FROM recuperaciones WHERE token = ? AND NOT usado AND expira_en > NOW()',
    [sesion.sha256(String(b.token || ''))]);
  if (!rec) throw invalido('El enlace ya no es válido. Pide uno nuevo');
  await db.q('UPDATE usuarios SET password_hash = ?, debe_cambiar_password = FALSE, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?',
    [await bcrypt.hash(password, 10), rec.usuario_id]);
  await db.q('UPDATE recuperaciones SET usado = TRUE WHERE id = ?', [rec.id]);
  await db.q('DELETE FROM sesiones WHERE usuario_id = ?', [rec.usuario_id]);
  res.json({ ok: true });
}));

r.put('/perfil', sesion.requiere(), asincrono(async (req, res) => {
  const b = req.body || {};
  const nombre = v.texto(b.nombre, 'tu nombre', 60);
  const telefono = v.telefono(b.telefono);
  let colonia = req.usuario.colonia_id;
  if (req.usuario.rol === 'ciudadano' && b.colonia_id) {
    colonia = v.entero(b.colonia_id, 'La colonia');
    if (!(await db.uno('SELECT id FROM colonias WHERE id = ?', [colonia]))) throw invalido('Elige tu colonia');
  }
  await db.q('UPDATE usuarios SET nombre = ?, telefono = ?, colonia_id = ? WHERE id = ?', [nombre, telefono, colonia, req.usuario.id]);
  res.json({ ok: true });
}));

r.put('/password', sesion.requiere(), asincrono(async (req, res) => {
  const b = req.body || {};
  const u = await db.uno('SELECT password_hash FROM usuarios WHERE id = ?', [req.usuario.id]);
  if (!(await bcrypt.compare(String(b.actual || ''), u.password_hash))) throw invalido('La contraseña actual no es correcta');
  const nueva = v.password(b.nueva);
  if (nueva === b.actual) throw invalido('La contraseña nueva debe ser distinta de la actual');
  await db.q('UPDATE usuarios SET password_hash = ?, debe_cambiar_password = FALSE WHERE id = ?', [await bcrypt.hash(nueva, 10), req.usuario.id]);
  res.json({ ok: true });
}));

r.delete('/cuenta', sesion.requiere('ciudadano'), asincrono(async (req, res) => {
  const u = await db.uno('SELECT password_hash FROM usuarios WHERE id = ?', [req.usuario.id]);
  if (!(await bcrypt.compare(String((req.body || {}).password || ''), u.password_hash))) throw invalido('La contraseña no es correcta');
  await db.q(`UPDATE usuarios SET activo = FALSE, nombre = 'Cuenta eliminada', telefono = NULL,
              correo = CONCAT('eliminada', id, '@prepar.mx'), password_hash = '' WHERE id = ?`, [req.usuario.id]);
  await db.q('DELETE FROM sesiones WHERE usuario_id = ?', [req.usuario.id]);
  res.clearCookie('prepar_sesion', { path: '/' });
  res.json({ ok: true });
}));

module.exports = r;
