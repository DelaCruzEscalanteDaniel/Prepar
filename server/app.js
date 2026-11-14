'use strict';
const path = require('path');
const express = require('express');
const db = require('./db');
const sesion = require('./lib/sesion');
const { asincrono, noEncontrado, manejarErrores, prohibido } = require('./lib/errores');

const PUBLICO = path.join(__dirname, '..', 'public');
const ZONAS = { ciudadano: 'ciudadano', funcionario: 'funcionario', admin: 'administrador' };
const INICIO = { ciudadano: '/ciudadano/inicio.html', funcionario: '/funcionario/inicio.html', administrador: '/admin/inicio.html' };

function encabezados(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.tile.openstreetmap.org; frame-ancestors 'none'");
  next();
}

function antiCsrf(req, res, next) {
  if (req.method === 'GET' || req.get('X-Prepar') === '1') return next();
  return next(prohibido('Solicitud no permitida'));
}

function protegerPaginas(req, res, next) {
  const carpeta = req.path.split('/')[1];
  const rol = ZONAS[carpeta];
  if (!rol) return next();
  return sesion.leer(req, res, (e) => {
    if (e) return next(e);
    if (!req.usuario) return res.redirect('/login.html');
    if (req.usuario.rol !== rol) return res.redirect(INICIO[req.usuario.rol]);
    res.set('Cache-Control', 'no-store');
    return next();
  });
}

function crearApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(encabezados);

  app.get('/salud', (req, res) => res.json({ ok: true }));

  app.get('/api/imagenes/:id',asincrono(async (req, res) => {
    const img = await db.uno('SELECT tipo, contenido FROM imagenes WHERE id = ?', [Number(req.params.id) || 0]);
    if (!img) throw noEncontrado('La imagen no existe');
    res.set('Cache-Control', 'public, max-age=86400').type(img.tipo).send(img.contenido);
  }));

  const api = express.Router();
  api.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  api.use(antiCsrf);
  api.use(express.json({ limit: '8mb' }));
  api.use(sesion.leer);
  api.use(require('./routes/auth'));
  api.use(require('./routes/ciudadano'));
  api.use(require('./routes/funcionario'));
  api.use(require('./routes/admin'));
  api.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
  app.use('/api', api);

  app.use(protegerPaginas);
  app.use(express.static(PUBLICO, { extensions: ['html'] }));
  app.use((req, res) => res.status(404).sendFile(path.join(PUBLICO, '404.html')));
  app.use(manejarErrores);
  return app;
}

module.exports = { crearApp };
