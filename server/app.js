'use strict';
const path = require('path');
const express = require('express');
const config = require('./config');
const log = require('./lib/log');
const db = require('./db');
const { encabezados, limitador, antiCsrf, cookies } = require('./lib/seguridad');
const { leerSesion } = require('./lib/sesion');
const { protegerPaginas } = require('./lib/paginas');
const { traducir, esErrorConexion } = require('./lib/errores');

function crearApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.confiarProxy);
  app.set('etag', 'strong');
  app.set('query parser', 'simple');
  app.set('json escape', true);

  app.use(encabezados);

  app.get('/salud', async (req, res) => {
    const ok = await db.salud();
    res.status(ok ? 200 : 503).json({ ok, hora: new Date().toISOString() });
  });

  const api = express.Router();
  api.use(limitador({ ventanaMs: 60 * 1000, maximo: 3000, mensaje: 'Demasiadas solicitudes desde tu conexión. Espera un minuto' }));
  api.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  api.use(cookies);
  api.use(antiCsrf);
  api.use(express.json({ limit: '100kb', strict: true, type: ['application/json'] }));
  api.use(leerSesion);
  api.use(require('./routes/publico'));
  api.use(require('./routes/auth'));
  api.use(require('./routes/ciudadano'));
  api.use(require('./routes/seguimiento'));
  api.use(require('./routes/funcionario'));
  api.use(require('./routes/admin'));
  api.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
  app.use('/api', api);

  const publico = path.join(config.raiz, 'public');
  app.use(protegerPaginas);
  app.use(express.static(publico, {
    extensions: ['html'],
    index: 'index.html',
    dotfiles: 'ignore',
    maxAge: config.produccion ? '1h' : 0,
    setHeaders(res, ruta) {
      if (ruta.endsWith('.html')) {
        if (!/no-store/.test(String(res.getHeader('Cache-Control') || ''))) res.setHeader('Cache-Control', 'no-cache');
      }
      else if (/[\\/](vendor|img)[\\/]/.test(ruta)) res.setHeader('Cache-Control', 'public, max-age=2592000');
    },
  }));
  app.use((req, res) => {
    res.status(404);
    const esPagina = !/\.[a-z0-9]{1,5}$/i.test(req.path) || /\.html?$/i.test(req.path);
    if (esPagina && req.accepts('html')) return res.sendFile(path.join(publico, '404.html'), (e) => { if (e && !res.headersSent) res.end(); });
    return res.json({ error: 'No encontrado' });
  });

  app.use((err, req, res, next) => {
    const t = traducir(err);
    if (esErrorConexion(err)) log.tarea(`${req.method} ${req.originalUrl}:`, err);
    else if (t.interno || t.estado >= 500) {
      log.error(`${req.method} ${req.originalUrl} →`, err && (err.stack || err.message || err));
    }
    if (res.headersSent) {
      try { res.end(); } catch { }
      return undefined;
    }
    const cuerpo = { error: t.mensaje };
    if (t.extra) Object.assign(cuerpo, t.extra);
    return res.status(t.estado).json(cuerpo);
  });

  return app;
}

module.exports = { crearApp };
