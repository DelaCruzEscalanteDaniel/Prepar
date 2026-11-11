'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

function cargarEnv(archivo) {
  let texto;
  try { texto = fs.readFileSync(archivo, 'utf8'); } catch { return; }
  for (const linea of texto.split(/\r?\n/)) {
    const l = linea.trim();
    if (!l || l.startsWith('#')) continue;
    const i = l.indexOf('=');
    if (i <= 0) continue;
    const clave = l.slice(0, i).trim();
    let valor = l.slice(i + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    if (process.env[clave] === undefined) process.env[clave] = valor;
  }
}
cargarEnv(path.join(RAIZ, '.env'));

const env = process.env;

function certificadoCa(valor) {
  const v = String(valor || '').trim();
  if (!v) return undefined;
  if (v.includes('BEGIN CERTIFICATE')) return v.replace(/\\n/g, '\n');
  try {
    return fs.readFileSync(path.isAbsolute(v) ? v : path.join(__dirname, '..', v), 'utf8');
  } catch (e) {
    console.error(`No se pudo leer el certificado de DB_SSL_CA (${v}): ${e.message}`);
    return undefined;
  }
}
const entero = (v, def) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};

const produccion = env.NODE_ENV === 'production';

module.exports = {
  raiz: RAIZ,
  produccion,
  puerto: entero(env.PORT, 3000),
  urlPublica: (env.URL_PUBLICA || `http://localhost:${entero(env.PORT, 3000)}`).replace(/\/+$/, ''),
  bd: {
    host: env.DB_HOST || '127.0.0.1',
    port: entero(env.DB_PORT, 3306),
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME || 'prepar',
    socketPath: env.DB_SOCKET || undefined,
    conexiones: entero(env.DB_CONEXIONES, 10),
    ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: env.DB_SSL_VERIFICAR !== 'false', ca: certificadoCa(env.DB_SSL_CA) } : undefined,
  },
  cookieSegura: env.COOKIE_SEGURA ? env.COOKIE_SEGURA === 'true' : produccion,
  confiarProxy: entero(env.CONFIAR_PROXY, produccion ? 1 : 0),
  verificacionGoogle: (env.GOOGLE_VERIFICACION || '').trim().replace(/^.*\//, ''),
  verificarCorreo: env.VERIFICAR_CORREO === 'false' ? false : (env.VERIFICAR_CORREO === 'true' ? true : 'auto'),
  correo: {
    proveedor: (env.CORREO_PROVEEDOR || '').trim().toLowerCase(),
    apiKey: env.CORREO_API_KEY || '',
    remitente: env.CORREO_REMITENTE || env.CORREO_SMTP_USUARIO || '',
    smtp: {
      host: env.CORREO_SMTP_HOST || ((env.CORREO_PROVEEDOR || '').trim().toLowerCase() === 'gmail' ? 'smtp.gmail.com' : ''),
      puerto: entero(env.CORREO_SMTP_PUERTO, 465),
      usuario: env.CORREO_SMTP_USUARIO || '',
      contrasena: (env.CORREO_SMTP_CONTRASENA || '').replace(/\s+/g, ''),
      sinTls: env.CORREO_SMTP_TLS === 'false',
    },
  },
  tareasProgramadas: env.TAREAS_PROGRAMADAS !== 'false',
  geocodificacion: env.GEOCODIFICACION !== 'false',
  registrarEnConsola: env.LOG_SILENCIO !== 'true',
};
