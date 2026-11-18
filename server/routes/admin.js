'use strict';
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const config = require('../config');
const sesion = require('../lib/sesion');
const correo = require('../lib/correo');
const ciclo = require('../lib/ciclo');
const { registrar } = require('../lib/seguridad');
const v = require('../lib/validar');
const { asincrono, invalido, noEncontrado } = require('../lib/errores');

const r = express.Router();
const admin = sesion.requiere('administrador');

async function cicloPorId(id) {
  const c = await db.uno('SELECT id_ciclo, nombre, estado, id_fase FROM ciclos WHERE id_ciclo = ?', [Number(id) || 0]);
  if (!c) throw noEncontrado('El ciclo no existe');
  return c;
}

r.get('/admin/ciclos', admin, asincrono(async (req, res) => {
  res.json(await db.q(
    `SELECT c.id_ciclo, c.nombre, c.anio, c.presupuesto_total, c.estado, c.id_fase, f.nombre AS fase
     FROM ciclos c JOIN fases f ON f.id_fase = c.id_fase ORDER BY c.estado = 'activo' DESC, c.id_ciclo DESC`));
}));

r.post('/admin/ciclos', admin, asincrono(async (req, res) => {
  const b = req.body || {};
  const nombre = v.texto(b.nombre, 'el nombre del ciclo', 50);
  const anio = Number(b.anio);
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) throw invalido('El año no es válido');
  const presupuesto = v.dinero(b.presupuesto, 'El presupuesto');
  const alcaldias = Array.isArray(b.alcaldias) ? b.alcaldias.map(Number).filter(Number.isInteger) : [];
  if (!alcaldias.length) throw invalido('Elige al menos una alcaldía que participe');
  const fechas = ciclo.validarFechas(b.fechas);
  const id = await db.transaccion(async (t) => {
    const [filas] = await t.q('CALL sp_crear_ciclo(?, ?, ?)', [nombre, anio, presupuesto]);
    const nuevo = filas[0].id_ciclo;
    await t.q(`DELETE cc FROM ciclo_colonias cc JOIN colonias c ON c.id_colonia = cc.id_colonia
               WHERE cc.id_ciclo = ? AND c.id_alcaldia NOT IN (?)`, [nuevo, alcaldias]);
    await t.q('CALL sp_repartir_presupuesto(?)', [nuevo]);
    await ciclo.guardarFechas(t, nuevo, fechas);
    return nuevo;
  });
  registrar(`El administrador ${req.usuario.id_usuario} creó el ciclo ${id}`);
  res.status(201).json({ ok: true, id_ciclo: id });
}));

r.put('/admin/ciclos/:id/fechas', admin, asincrono(async (req, res) => {
  const c = await cicloPorId(req.params.id);
  if (c.estado === 'cerrado') throw invalido('Un ciclo cerrado ya no se puede cambiar');
  const fechas = ciclo.validarFechas((req.body || {}).fechas);
  await db.transaccion((t) => ciclo.guardarFechas(t, c.id_ciclo, fechas));
  registrar(`El administrador ${req.usuario.id_usuario} cambió las fechas del ciclo ${c.id_ciclo}`);
  res.json({ ok: true });
}));

r.post('/admin/ciclos/:id/activar', admin, asincrono(async (req, res) => {
  const c = await cicloPorId(req.params.id);
  if (c.estado === 'cerrado') throw invalido('Un ciclo cerrado ya no se puede activar');
  await db.transaccion(async (t) => {
    await t.q("UPDATE ciclos SET estado = 'borrador' WHERE estado = 'activo'");
    await t.q("UPDATE ciclos SET estado = 'activo' WHERE id_ciclo = ?", [c.id_ciclo]);
  });
  registrar(`El administrador ${req.usuario.id_usuario} activó el ciclo ${c.id_ciclo}`);
  res.json({ ok: true });
}));

r.post('/admin/ciclos/:id/siguiente-fase', admin, asincrono(async (req, res) => {
  const c = await cicloPorId(req.params.id);
  if (c.estado !== 'activo') throw invalido('Primero activa este ciclo');
  if (c.id_fase >= 8) throw invalido('El ciclo ya está en la última fase. Puedes cerrarlo');
  await db.q('UPDATE ciclos SET id_fase = id_fase + 1 WHERE id_ciclo = ?', [c.id_ciclo]);
  if (c.id_fase + 1 === 6) await db.llamar('sp_calcular_ganadores', [c.id_ciclo]);
  registrar(`El administrador ${req.usuario.id_usuario} pasó el ciclo ${c.id_ciclo} a la fase ${c.id_fase + 1}`);
  res.json({ ok: true });
}));

r.post('/admin/ciclos/:id/cerrar', admin, asincrono(async (req, res) => {
  const c = await cicloPorId(req.params.id);
  if (c.id_fase < 8) throw invalido('Solo se puede cerrar un ciclo que llegó a la fase de Evaluación');
  await db.q("UPDATE ciclos SET estado = 'cerrado' WHERE id_ciclo = ?", [c.id_ciclo]);
  registrar(`El administrador ${req.usuario.id_usuario} cerró el ciclo ${c.id_ciclo}`);
  res.json({ ok: true });
}));

r.get('/admin/ciclos/:id/resumen', admin, asincrono(async (req, res) => {
  const c = await cicloPorId(req.params.id);
  const votos = await db.q('SELECT colonia, alcaldia, votos FROM v_votos_colonia WHERE id_ciclo = ? AND votos > 0 ORDER BY votos DESC, colonia LIMIT 10', [c.id_ciclo]);
  const totales = await db.uno(
    `SELECT (SELECT COUNT(*) FROM ideas WHERE id_ciclo = ?) AS ideas,
            (SELECT COUNT(*) FROM proyectos WHERE id_ciclo = ?) AS proyectos,
            (SELECT COUNT(*) FROM votos WHERE id_ciclo = ?) AS votos,
            (SELECT COUNT(*) FROM usuarios u JOIN ciclo_colonias cc ON cc.id_colonia = u.id_colonia
              WHERE cc.id_ciclo = ? AND u.rol = 'ciudadano' AND u.activo) AS ciudadanos`, [c.id_ciclo, c.id_ciclo, c.id_ciclo, c.id_ciclo]);
  totales.participacion = totales.ciudadanos ? Math.round((totales.votos / totales.ciudadanos) * 100) : 0;
  res.json({ ciclo: c, votos, totales, fases: await ciclo.fases(c.id_ciclo) });
}));

r.get('/admin/usuarios', admin, asincrono(async (req, res) => {
  const rol = ['ciudadano', 'funcionario', 'administrador'].includes(req.query.rol) ? req.query.rol : 'ciudadano';
  const buscar = `%${String(req.query.q || '').trim().slice(0, 60)}%`;
  const usuarios = await db.q(
    `SELECT u.id_usuario, u.rol, u.nombre, u.correo, u.activo, c.nombre AS colonia, a.nombre AS alcaldia
     FROM usuarios u
     LEFT JOIN colonias c ON c.id_colonia = u.id_colonia
     LEFT JOIN alcaldias a ON a.id_alcaldia = COALESCE(u.id_alcaldia, c.id_alcaldia)
     WHERE u.rol = ? AND (u.nombre LIKE ? OR u.correo LIKE ?) AND u.correo NOT LIKE 'eliminada%@prepar.mx'
     ORDER BY u.nombre LIMIT 200`, [rol, buscar, buscar]);
  const conteo = {};
  for (const f of await db.q("SELECT rol, COUNT(*) AS total FROM usuarios WHERE correo NOT LIKE 'eliminada%@prepar.mx' GROUP BY rol")) conteo[f.rol] = f.total;
  res.json({ usuarios, conteo });
}));

r.post('/admin/funcionarios', admin, asincrono(async (req, res) => {
  const b = req.body || {};
  const nombre = v.texto(b.nombre, 'el nombre', 60);
  const email = v.correo(b.correo);
  const alcaldia = v.entero(b.id_alcaldia, 'La alcaldía');
  if (!(await db.uno('SELECT id_alcaldia FROM alcaldias WHERE id_alcaldia = ?', [alcaldia]))) throw invalido('Elige la alcaldía');
  if (await db.uno('SELECT id_usuario FROM usuarios WHERE correo = ?', [email])) throw invalido('Ya existe una cuenta con ese correo');
  const temporal = `Prepar${crypto.randomInt(1000, 9999)}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  await db.q(
    `INSERT INTO usuarios (rol, nombre, correo, password_hash, id_alcaldia, debe_cambiar_password)
     VALUES ('funcionario', ?, ?, ?, ?, TRUE)`, [nombre, email, await bcrypt.hash(temporal, 10), alcaldia]);
  const enviado = await correo.enviar(email, 'Prepar · Tu cuenta de funcionario',
    `Hola, ${nombre}.\n\nSe creó tu cuenta de funcionario en Prepar.\nEntra en ${config.urlPublica}/login.html con tu correo y esta contraseña temporal: ${temporal}\n\nAl entrar te pediremos cambiarla.`);
  registrar(`El administrador ${req.usuario.id_usuario} creó una cuenta de funcionario`);
  res.status(201).json({ ok: true, temporal, enviado });
}));

r.put('/admin/usuarios/:id/activo', admin, asincrono(async (req, res) => {
  const id = Number(req.params.id) || 0;
  if (id === req.usuario.id_usuario) throw invalido('No puedes desactivar tu propia cuenta');
  const cuenta = await db.uno('SELECT rol FROM usuarios WHERE id_usuario = ?', [id]);
  if (!cuenta) throw noEncontrado('La cuenta no existe');
  if (cuenta.rol === 'administrador') throw invalido('Un administrador no puede activar ni desactivar a otro administrador');
  const activo = req.body.activo === true;
  await db.q('UPDATE usuarios SET activo = ? WHERE id_usuario = ?', [activo, id]);
  if (!activo) await db.q('DELETE FROM sesiones WHERE id_usuario = ?', [id]);
  registrar(`El administrador ${req.usuario.id_usuario} ${activo ? 'activó' : 'desactivó'} la cuenta ${id}`);
  res.json({ ok: true });
}));

module.exports = r;
