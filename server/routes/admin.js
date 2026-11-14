'use strict';
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const config = require('../config');
const sesion = require('../lib/sesion');
const correo = require('../lib/correo');
const v = require('../lib/validar');
const { asincrono, invalido, noEncontrado } = require('../lib/errores');

const r = express.Router();
const admin = sesion.requiere('administrador');

async function cicloPorId(id) {
  const c = await db.uno('SELECT id, nombre, estado, fase_id FROM ciclos WHERE id = ?', [Number(id) || 0]);
  if (!c) throw noEncontrado('El ciclo no existe');
  return c;
}

r.get('/admin/ciclos', admin, asincrono(async (req, res) => {
  res.json(await db.q(
    `SELECT c.id, c.nombre, c.anio, c.presupuesto_total, c.estado, c.fase_id, f.nombre AS fase
     FROM ciclos c JOIN fases f ON f.id = c.fase_id ORDER BY c.estado = 'activo' DESC, c.id DESC`));
}));

r.post('/admin/ciclos', admin, asincrono(async (req, res) => {
  const b = req.body || {};
  const nombre = v.texto(b.nombre, 'el nombre del ciclo', 50);
  const anio = Number(b.anio);
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) throw invalido('El año no es válido');
  const presupuesto = v.dinero(b.presupuesto, 'El presupuesto');
  const filas = await db.llamar('sp_crear_ciclo', [nombre, anio, presupuesto]);
  res.status(201).json({ ok: true, id: filas[0].ciclo_id });
}));

r.post('/admin/ciclos/:id/activar', admin, asincrono(async (req, res) => {
  const c = await cicloPorId(req.params.id);
  if (c.estado === 'cerrado') throw invalido('Un ciclo cerrado ya no se puede activar');
  await db.transaccion(async (t) => {
    await t.q("UPDATE ciclos SET estado = 'borrador' WHERE estado = 'activo'");
    await t.q("UPDATE ciclos SET estado = 'activo' WHERE id = ?", [c.id]);
  });
  res.json({ ok: true });
}));

r.post('/admin/ciclos/:id/siguiente-fase', admin, asincrono(async (req, res) => {
  const c = await cicloPorId(req.params.id);
  if (c.estado !== 'activo') throw invalido('Primero activa este ciclo');
  if (c.fase_id >= 8) throw invalido('El ciclo ya está en la última fase. Puedes cerrarlo');
  await db.q('UPDATE ciclos SET fase_id = fase_id + 1 WHERE id = ?', [c.id]);
  if (c.fase_id + 1 === 6) await db.llamar('sp_calcular_ganadores', [c.id]);
  res.json({ ok: true });
}));

r.post('/admin/ciclos/:id/cerrar', admin, asincrono(async (req, res) => {
  const c = await cicloPorId(req.params.id);
  if (c.fase_id < 8) throw invalido('Solo se puede cerrar un ciclo que llegó a la fase de Evaluación');
  await db.q("UPDATE ciclos SET estado = 'cerrado' WHERE id = ?", [c.id]);
  res.json({ ok: true });
}));

r.get('/admin/ciclos/:id/resumen', admin, asincrono(async (req, res) => {
  const c = await cicloPorId(req.params.id);
  const votos = await db.q('SELECT colonia, alcaldia, votos FROM v_votos_colonia WHERE ciclo_id = ? AND votos > 0 ORDER BY votos DESC, colonia LIMIT 15', [c.id]);
  const totales = await db.uno(
    `SELECT (SELECT COUNT(*) FROM ideas WHERE ciclo_id = ?) AS ideas,
            (SELECT COUNT(*) FROM proyectos WHERE ciclo_id = ?) AS proyectos,
            (SELECT COUNT(*) FROM votos WHERE ciclo_id = ?) AS votos,
            (SELECT COUNT(*) FROM usuarios WHERE rol = 'ciudadano' AND activo) AS ciudadanos`, [c.id, c.id, c.id]);
  res.json({ ciclo: c, votos, totales });
}));

r.get('/admin/usuarios', admin, asincrono(async (req, res) => {
  const rol = ['ciudadano', 'funcionario', 'administrador'].includes(req.query.rol) ? req.query.rol : '';
  res.json(await db.q(
    `SELECT u.id, u.rol, u.nombre, u.correo, u.activo, c.nombre AS colonia, a.nombre AS alcaldia
     FROM usuarios u
     LEFT JOIN colonias c ON c.id = u.colonia_id
     LEFT JOIN alcaldias a ON a.id = COALESCE(u.alcaldia_id, c.alcaldia_id)
     WHERE (? = '' OR u.rol = ?) AND u.correo NOT LIKE 'eliminada%@prepar.mx'
     ORDER BY u.rol, u.nombre`, [rol, rol]));
}));

r.post('/admin/funcionarios', admin, asincrono(async (req, res) => {
  const b = req.body || {};
  const nombre = v.texto(b.nombre, 'el nombre', 60);
  const email = v.correo(b.correo);
  const alcaldia = v.entero(b.alcaldia_id, 'La alcaldía');
  if (!(await db.uno('SELECT id FROM alcaldias WHERE id = ?', [alcaldia]))) throw invalido('Elige la alcaldía');
  if (await db.uno('SELECT id FROM usuarios WHERE correo = ?', [email])) throw invalido('Ya existe una cuenta con ese correo');
  const temporal = `Prepar${crypto.randomInt(1000, 9999)}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  await db.q(
    `INSERT INTO usuarios (rol, nombre, correo, password_hash, alcaldia_id, debe_cambiar_password)
     VALUES ('funcionario', ?, ?, ?, ?, TRUE)`, [nombre, email, await bcrypt.hash(temporal, 10), alcaldia]);
  const enviado = await correo.enviar(email, 'Prepar · Tu cuenta de funcionario',
    `Hola, ${nombre}.\n\nSe creó tu cuenta de funcionario en Prepar.\nEntra en ${config.urlPublica}/login.html con tu correo y esta contraseña temporal: ${temporal}\n\nAl entrar te pediremos cambiarla.`);
  res.status(201).json({ ok: true, temporal, enviado });
}));

r.put('/admin/usuarios/:id/activo', admin, asincrono(async (req, res) => {
  const id = Number(req.params.id) || 0;
  if (id === req.usuario.id) throw invalido('No puedes desactivar tu propia cuenta');
  const activo = req.body.activo === true;
  const r2 = await db.q('UPDATE usuarios SET activo = ? WHERE id = ?', [activo, id]);
  if (!r2.affectedRows) throw noEncontrado('La cuenta no existe');
  if (!activo) await db.q('DELETE FROM sesiones WHERE usuario_id = ?', [id]);
  res.json({ ok: true });
}));

module.exports = r;
