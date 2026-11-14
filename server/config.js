'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

function cargarEnv(archivo) {
  let texto;
  try { texto = fs.readFileSync(archivo, 'utf8'); } catch { return; }
  for (const linea of texto.split(/\r?\n/)) {
    const l = linea.trim();
    if (!l || l.startsWith('#') || !l.includes('=')) continue;
    const i = l.indexOf('=');
    const clave = l.slice(0, i).trim();
    const valor = l.slice(i + 1).trim().replace(/^(["'])(.*)\1$/, '$2');
    if (process.env[clave] === undefined) process.env[clave] = valor;
  }
}
cargarEnv(path.join(RAIZ, '.env'));

const env = process.env;
const produccion = env.NODE_ENV === 'production';
const puerto = Number(env.PORT) || 3000;

function certificado(valor) {
  const v = String(valor || '').trim();
  if (!v) return undefined;
  if (v.includes('BEGIN CERTIFICATE')) return v.replace(/\\n/g, '\n');
  return fs.readFileSync(path.isAbsolute(v) ? v : path.join(RAIZ, v), 'utf8');
}

module.exports = {
  raiz: RAIZ,
  produccion,
  puerto,
  urlPublica: (env.URL_PUBLICA || `http://localhost:${puerto}`).replace(/\/+$/, ''),
  bd: {
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT) || 3306,
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME || 'prepar',
    socketPath: env.DB_SOCKET || undefined,
    ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: env.DB_SSL_VERIFICAR !== 'false', ca: certificado(env.DB_SSL_CA) } : undefined,
  },
  cookieSegura: produccion,
  correo: {
    apiKey: (env.CORREO_API_KEY || '').trim(),
    remitente: (env.CORREO_REMITENTE || '').trim(),
  },
  adminPruebas: {
    correo: (env.ADMIN_PRUEBAS_CORREO || '').trim().toLowerCase(),
    password: env.ADMIN_PRUEBAS_PASSWORD || '',
  },
};
