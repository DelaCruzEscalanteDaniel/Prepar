'use strict';
const crypto = require('crypto');
const config = require('../config');

const AUTORIZAR = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const EMISORES = ['https://accounts.google.com', 'accounts.google.com'];
const SECRETO = config.google.secreto || crypto.randomBytes(32).toString('hex');

const activo = () => !!(config.google.clientId && config.google.clientSecret);
const redireccion = () => `${config.urlPublica}/api/auth/google/callback`;

function firmar(datos, minutos) {
  const cuerpo = Buffer.from(JSON.stringify({ ...datos, exp: Date.now() + minutos * 60 * 1000 })).toString('base64url');
  const firma = crypto.createHmac('sha256', SECRETO).update(cuerpo).digest('base64url');
  return `${cuerpo}.${firma}`;
}
function leerFirmado(valor) {
  if (typeof valor !== 'string' || valor.length > 2000) return null;
  const [cuerpo, firma] = valor.split('.');
  if (!cuerpo || !firma) return null;
  const esperada = crypto.createHmac('sha256', SECRETO).update(cuerpo).digest('base64url');
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let datos;
  try { datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')); } catch { return null; }
  if (!datos || typeof datos.exp !== 'number' || datos.exp < Date.now()) return null;
  return datos;
}

function urlAutorizacion(estado, nonce) {
  const u = new URL(AUTORIZAR);
  u.search = new URLSearchParams({
    client_id: config.google.clientId, redirect_uri: redireccion(), response_type: 'code',
    scope: 'openid email profile', state: estado, nonce, prompt: 'select_account', access_type: 'online',
  }).toString();
  return u.toString();
}

function decodificarJwt(jwt) {
  const partes = String(jwt || '').split('.');
  if (partes.length !== 3) throw new Error('Respuesta de Google no válida');
  return JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'));
}

function validarIdentidad(datos, nonce) {
  if (!datos || !EMISORES.includes(datos.iss)) throw new Error('La respuesta no viene de Google');
  const aud = Array.isArray(datos.aud) ? datos.aud : [datos.aud];
  if (!aud.includes(config.google.clientId)) throw new Error('La respuesta de Google no es para esta aplicación');
  if (!datos.exp || datos.exp * 1000 < Date.now() - 60 * 1000) throw new Error('La respuesta de Google ya expiró');
  if (!nonce || datos.nonce !== nonce) throw new Error('La respuesta de Google no coincide con la solicitud');
  if (!datos.email || !(datos.email_verified === true || datos.email_verified === 'true')) throw new Error('Tu cuenta de Google no tiene un correo verificado');
  return { correo: String(datos.email).toLowerCase(), nombre: String(datos.name || '').trim().slice(0, 50) };
}

async function canjearCodigo(codigo, nonce, { pedir = fetch } = {}) {
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), 15000);
  let r;
  try {
    r = await pedir(TOKEN, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        code: codigo, client_id: config.google.clientId, client_secret: config.google.clientSecret,
        redirect_uri: redireccion(), grant_type: 'authorization_code',
      }).toString(),
    });
  } finally {
    clearTimeout(reloj);
  }
  const datos = await r.json().catch(() => null);
  if (!r.ok || !datos || !datos.id_token) throw new Error('Google no confirmó el inicio de sesión');
  return validarIdentidad(decodificarJwt(datos.id_token), nonce);
}

module.exports = { activo, urlAutorizacion, canjearCodigo, firmar, leerFirmado, validarIdentidad, decodificarJwt, redireccion };
