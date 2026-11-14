'use strict';
process.env.DB_NAME = process.env.DB_NAME_PRUEBA || 'prepar_prueba';
process.env.ADMIN_PRUEBAS_CORREO = '';

const bcrypt = require('bcryptjs');
const { instalar } = require('../scripts/instalar-bd');
const db = require('../server/db');
const { crearApp } = require('../server/app');

let servidor;
let base = '';

async function iniciar() {
  await instalar(process.env.DB_NAME);
  await db.q("INSERT INTO usuarios (rol, nombre, correo, password_hash) VALUES ('administrador', 'Admin', 'admin@prueba.mx', ?)",
    [await bcrypt.hash('Admin2026', 10)]);
  servidor = await new Promise((r) => { const s = crearApp().listen(0, '127.0.0.1', () => r(s)); });
  base = `http://127.0.0.1:${servidor.address().port}`;
}

async function detener() {
  await new Promise((r) => servidor.close(r));
  await db.pool.end();
}

function cliente() {
  let cookie = '';
  async function pedir(metodo, ruta, cuerpo, encabezados = { 'X-Prepar': '1' }) {
    const headers = { ...encabezados };
    if (cookie) headers.Cookie = cookie;
    if (cuerpo !== undefined) headers['Content-Type'] = 'application/json';
    const r = await fetch(base + '/api' + ruta, { method: metodo, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo), redirect: 'manual' });
    const m = /prepar_sesion=([^;]*)/.exec(r.headers.get('set-cookie') || '');
    if (m) cookie = m[1] ? `prepar_sesion=${m[1]}` : '';
    return { estado: r.status, datos: await r.json().catch(() => null) };
  }
  return {
    get: (ruta) => pedir('GET', ruta),
    post: (ruta, cuerpo = {}, encabezados) => pedir('POST', ruta, cuerpo, encabezados),
    put: (ruta, cuerpo = {}) => pedir('PUT', ruta, cuerpo),
    del: (ruta, cuerpo) => pedir('DELETE', ruta, cuerpo),
    pagina: (ruta) => fetch(base + ruta, { headers: cookie ? { Cookie: cookie } : {}, redirect: 'manual' }),
  };
}

async function entrar(correo, password) {
  const c = cliente();
  const r = await c.post('/login', { correo, password });
  if (r.estado !== 200) throw new Error(`No se pudo entrar como ${correo}: ${JSON.stringify(r.datos)}`);
  return c;
}

const FOTO_PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000'
  + '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex').toString('base64');

module.exports = { iniciar, detener, cliente, entrar, db, FOTO_PNG };
