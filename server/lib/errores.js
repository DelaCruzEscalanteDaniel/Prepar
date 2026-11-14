'use strict';

class ErrorApp extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.estado = estado;
  }
}

const invalido = (mensaje) => new ErrorApp(400, mensaje);
const prohibido = (mensaje = 'No tienes permiso para hacer esto') => new ErrorApp(403, mensaje);
const noEncontrado = (mensaje = 'No se encontró lo que buscas') => new ErrorApp(404, mensaje);

const asincrono = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function manejarErrores(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err instanceof ErrorApp) return res.status(err.estado).json({ error: err.message });
  if (err && err.sqlState === '45000') return res.status(400).json({ error: err.sqlMessage });
  if (err && err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ese registro ya existe' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'El archivo es demasiado grande (máximo 5 MB)' });
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Los datos enviados no son válidos' });
  console.error(`${req.method} ${req.originalUrl}:`, err);
  return res.status(500).json({ error: 'Ocurrió un error en el servidor. Intenta de nuevo' });
}

module.exports = { ErrorApp, invalido, prohibido, noEncontrado, asincrono, manejarErrores };
