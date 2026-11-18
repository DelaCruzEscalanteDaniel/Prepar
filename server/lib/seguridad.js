'use strict';
const { ErrorApp } = require('./errores');

const intentos = new Map();

function registrar(texto) {
  console.log(`[seguridad] ${texto}`);
}

function limite(nombre, maximo, minutos) {
  return (req, res, next) => {
    const clave = `${nombre}:${req.ip}`;
    const ahora = Date.now();
    let r = intentos.get(clave);
    if (!r || r.vence <= ahora) {
      r = { veces: 0, vence: ahora + minutos * 60000 };
      intentos.set(clave, r);
    }
    r.veces += 1;
    if (r.veces > maximo) {
      if (r.veces === maximo + 1) registrar(`Límite de ${nombre} alcanzado desde ${req.ip}`);
      return next(new ErrorApp(429, `Hiciste demasiados intentos. Espera ${minutos} minutos e intenta de nuevo`));
    }
    return next();
  };
}

setInterval(() => {
  const ahora = Date.now();
  for (const [clave, r] of intentos) if (r.vence <= ahora) intentos.delete(clave);
}, 10 * 60000).unref();

module.exports = { limite, registrar };
