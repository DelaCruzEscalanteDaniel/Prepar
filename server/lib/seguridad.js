'use strict';
const { ErrorApp } = require('./errores');

function encabezados(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(self), payment=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; '));
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
}

const FACTOR = Math.max(1, Number(process.env.LIMITES_FACTOR) || 1);

function limitador({ ventanaMs, maximo, clave = (req) => req.ip, mensaje, contarSi }) {
  const cubetas = new Map();
  const tope = maximo * FACTOR;
  const limpieza = setInterval(() => {
    const ahora = Date.now();
    for (const [k, v] of cubetas) if (v.reinicio <= ahora) cubetas.delete(k);
  }, Math.max(ventanaMs, 10000));
  limpieza.unref();
  const sumar = (k) => {
    const ahora = Date.now();
    let c = cubetas.get(k);
    if (!c || c.reinicio <= ahora) {
      c = { cuenta: 0, reinicio: ahora + ventanaMs };
      if (cubetas.size > 50000) cubetas.clear();
      cubetas.set(k, c);
    }
    c.cuenta += 1;
  };
  const mw = (req, res, next) => {
    let k;
    try { k = String(clave(req) || req.ip || 'anon').slice(0, 200); } catch { k = req.ip || 'anon'; }
    const ahora = Date.now();
    const c = cubetas.get(k);
    if (c && c.reinicio > ahora && c.cuenta >= tope) {
      res.setHeader('Retry-After', Math.ceil((c.reinicio - ahora) / 1000));
      return next(new ErrorApp(429, mensaje || 'Demasiadas solicitudes. Espera un momento e intenta de nuevo'));
    }
    if (contarSi) res.on('finish', () => { if (contarSi(res.statusCode)) sumar(k); });
    else sumar(k);
    return next();
  };
  mw.reiniciar = () => cubetas.clear();
  return mw;
}

function antiCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Prepar') !== '1') return next(new ErrorApp(403, 'Solicitud no permitida'));
  const origen = req.get('Origin');
  if (origen) {
    let host;
    try { host = new URL(origen).host; } catch { return next(new ErrorApp(403, 'Solicitud no permitida')); }
    const esperado = req.get('X-Forwarded-Host') || req.get('Host');
    if (host !== esperado) return next(new ErrorApp(403, 'Solicitud no permitida'));
  }
  return next();
}

function cookies(req, res, next) {
  const salida = Object.create(null);
  const h = req.headers.cookie;
  if (h && h.length < 8192) {
    for (const parte of h.split(';')) {
      const i = parte.indexOf('=');
      if (i < 0) continue;
      const k = parte.slice(0, i).trim();
      if (!k || k in salida) continue;
      let v = parte.slice(i + 1).trim();
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      try { salida[k] = decodeURIComponent(v); } catch { salida[k] = v; }
    }
  }
  req.cookies = salida;
  next();
}

const asincrono = (fn) => (req, res, next) => {
  try {
    Promise.resolve(fn(req, res, next)).catch(next);
  } catch (e) {
    next(e);
  }
};

module.exports = { encabezados, limitador, antiCsrf, cookies, asincrono };
