'use strict';
const path = require('path');
const { cookies } = require('./seguridad');
const { leerSesion } = require('./sesion');

const ZONAS = { ciudadano: 'ciudadano', funcionario: 'funcionario', admin: 'administrador' };
const PANEL = { ciudadano: '/ciudadano/inicio.html', funcionario: '/funcionario/inicio.html', administrador: '/admin/inicio.html' };

function zonaDe(rutaCruda) {
  let r;
  try { r = decodeURIComponent(rutaCruda); } catch { return { invalida: true }; }
  if (r.includes('\0')) return { invalida: true };
  r = path.posix.normalize('/' + r.replace(/\\/g, '/')).toLowerCase();
  const primera = r.split('/').filter(Boolean)[0] || '';
  return { carpeta: primera, ruta: r };
}

function protegerPaginas(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const z = zonaDe(req.path);
  if (z.invalida) return res.status(400).end();
  const rol = ZONAS[z.carpeta];
  if (!rol) return next();

  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Vary', 'Cookie');
  return cookies(req, res, (e1) => {
    if (e1) return next(e1);
    return leerSesion(req, res, (e2) => (e2 ? next(e2) : decidir(req, res, next, rol, z)));
  });
}

function decidir(req, res, next, rol, z) {
  const u = req.usuario;
  if (!u) {
    const volver = encodeURIComponent(req.originalUrl.slice(0, 300));
    return res.redirect(302, '/login.html?' + (req.sesionExpirada ? 'expirada=1&' : '') + 'volver=' + volver);
  }
  if (u.rol !== rol) return res.redirect(302, PANEL[u.rol] || '/');
  if (u.debeAceptarTerminos) {
    return res.redirect(302, '/terminos.html?aceptar=1&volver=' + encodeURIComponent(req.originalUrl.slice(0, 300)));
  }
  if (u.debeCambiarPassword && !/\/perfil(\.html)?$/.test(z.ruta)) {
    return res.redirect(302, (u.rol === 'administrador' ? '/admin' : '/funcionario') + '/perfil.html?temporal=1');
  }
  return next();
}

module.exports = { protegerPaginas, zonaDe };
