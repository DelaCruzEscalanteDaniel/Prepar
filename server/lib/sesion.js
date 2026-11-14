'use strict';
const crypto = require('crypto');
const config = require('../config');
const db = require('../db');
const { ErrorApp, prohibido } = require('./errores');

const COOKIE = 'prepar_sesion';
const HORAS = 12;

const sha256 = (texto) => crypto.createHash('sha256').update(String(texto)).digest('hex');

function leerCookie(req) {
  const partes = String(req.headers.cookie || '').split(';');
  for (const parte of partes) {
    const [nombre, ...resto] = parte.trim().split('=');
    if (nombre === COOKIE) return resto.join('=');
  }
  return null;
}

async function crear(res, usuarioId) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.q('INSERT INTO sesiones (usuario_id, token) VALUES (?, ?)', [usuarioId, sha256(token)]);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: config.cookieSegura, path: '/', maxAge: HORAS * 3600 * 1000 });
}

async function cerrar(req, res) {
  const token = leerCookie(req);
  if (token) await db.q('DELETE FROM sesiones WHERE token = ?', [sha256(token)]);
  res.clearCookie(COOKIE, { path: '/' });
}

const SQL_USUARIO = `
  SELECT u.id, u.rol, u.nombre, u.correo, u.telefono, u.debe_cambiar_password,
         u.colonia_id, c.nombre AS colonia,
         COALESCE(u.alcaldia_id, c.alcaldia_id) AS alcaldia_id, a.nombre AS alcaldia
  FROM sesiones s
  JOIN usuarios u ON u.id = s.usuario_id
  LEFT JOIN colonias c ON c.id = u.colonia_id
  LEFT JOIN alcaldias a ON a.id = COALESCE(u.alcaldia_id, c.alcaldia_id)
  WHERE s.token = ? AND u.activo AND s.ultima_actividad > NOW() - INTERVAL ${HORAS} HOUR`;

async function leer(req, res, next) {
  req.usuario = null;
  const token = leerCookie(req);
  if (!token) return next();
  try {
    const hash = sha256(token);
    const u = await db.uno(SQL_USUARIO, [hash]);
    if (u) {
      u.debe_cambiar_password = !!u.debe_cambiar_password;
      req.usuario = u;
      await db.q('UPDATE sesiones SET ultima_actividad = NOW() WHERE token = ?', [hash]);
    }
    return next();
  } catch (e) {
    return next(e);
  }
}

function requiere(...roles) {
  return (req, res, next) => {
    if (!req.usuario) return next(new ErrorApp(401, 'Inicia sesión para continuar'));
    if (roles.length && !roles.includes(req.usuario.rol)) return next(prohibido('Esta sección no corresponde a tu tipo de cuenta'));
    if (req.usuario.debe_cambiar_password && !/^\/(yo|ciclo|password|logout)$/.test(req.path)) {
      return next(prohibido('Cambia tu contraseña temporal para continuar'));
    }
    return next();
  };
}

module.exports = { crear, cerrar, leer, requiere, sha256 };
