'use strict';
process.env.DB_NAME = process.env.DB_NAME_PRUEBA || 'prepar_prueba';
process.env.LOG_SILENCIO = 'true';
process.env.GEOCODIFICACION = 'false';
process.env.TAREAS_PROGRAMADAS = 'false';
process.env.VERIFICAR_CORREO = 'true';
process.env.LIMITES_FACTOR = process.env.LIMITES_FACTOR || '100';

const zlib = require('zlib');
const bcrypt = require('bcryptjs');
const { instalar } = require('../scripts/instalar-bd');
const db = require('../server/db');
const { crearApp } = require('../server/app');

let servidor = null;
let base = '';

async function iniciar() {
  await instalar({ nombreBd: process.env.DB_NAME, silencioso: true });
  const app = crearApp();
  await new Promise((r) => { servidor = app.listen(0, '127.0.0.1', r); });
  base = `http://127.0.0.1:${servidor.address().port}`;
  return base;
}

async function detener() {
  if (servidor) await new Promise((r) => servidor.close(r));
  await db.cerrar();
}

function cliente() {
  let cookie = '';
  async function pedir(metodo, ruta, cuerpo, opciones = {}) {
    if (!opciones.crudo && metodo === 'POST' && ruta === '/api/auth/registro' && cuerpo && typeof cuerpo === 'object' && !Buffer.isBuffer(cuerpo)) {
      cuerpo = { confirmar: cuerpo.password, acepta_terminos: true, ...cuerpo };
    }
    const r = await pedirCrudo(metodo, ruta, cuerpo, opciones);
    if (!opciones.crudo && metodo === 'POST' && ruta === '/api/auth/login' && r.estado === 200 && r.datos && r.datos.debeAceptarTerminos) {
      await pedirCrudo('POST', '/api/auth/aceptar-terminos', { acepto: true });
    }
    if (!opciones.crudo && !opciones.sinVerificar && metodo === 'POST' && ruta === '/api/auth/registro' && r.estado === 201 && r.datos && r.datos.verificarCorreo) {
      const token = await tokenVerificacion(cuerpo.correo);
      await pedirCrudo('POST', '/api/auth/verificar-correo', { token });
    }
    return r;
  }
  async function pedirCrudo(metodo, ruta, cuerpo, opciones = {}) {
    const headers = { 'X-Prepar': '1', ...(opciones.headers || {}) };
    if (cookie) headers.Cookie = cookie;
    let body;
    if (Buffer.isBuffer(cuerpo)) body = cuerpo;
    else if (cuerpo !== undefined) {
      body = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo);
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    }
    const r = await fetch(base + ruta, { method: metodo, headers, body, redirect: 'manual' });
    const sc = r.headers.get('set-cookie');
    if (sc) {
      const m = /prepar_sesion=([^;]*)/.exec(sc);
      if (m) cookie = m[1] ? `prepar_sesion=${m[1]}` : '';
    }
    const tipo = r.headers.get('content-type') || '';
    let datos;
    if (tipo.includes('application/json')) datos = await r.json();
    else datos = Buffer.from(await r.arrayBuffer());
    return { estado: r.status, datos, headers: r.headers };
  }
  return {
    get: (ruta, o) => pedir('GET', ruta, undefined, o),
    post: (ruta, c, o) => pedir('POST', ruta, c === undefined ? {} : c, o),
    put: (ruta, c, o) => pedir('PUT', ruta, c === undefined ? {} : c, o),
    del: (ruta, o) => pedir('DELETE', ruta, undefined, o),
    pedir,
    get cookie() { return cookie; },
    set cookie(c) { cookie = c; },
  };
}

async function tokenVerificacion(correo) {
  const c = await db.conSistema((con) => con.uno(
    "SELECT cuerpo FROM correos_salida WHERE destinatario = ? AND plantilla = 'verificacion' ORDER BY id DESC LIMIT 1", [String(correo).toLowerCase()]));
  const m = c && /verificar\.html#token=([A-Za-z0-9_-]+)/.exec(c.cuerpo);
  return m ? m[1] : null;
}


async function crearAdmin(correo = 'admin@prepar.mx', pass = 'Admin12345') {
  const hash = await bcrypt.hash(pass, 4);
  await db.conSistema((con) => con.call('sp_crear_administrador', ['Administrador Prepar', correo, hash]));
}

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function bloque(tipo, datos) {
  const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length);
  const td = Buffer.concat([Buffer.from(tipo, 'latin1'), datos]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([largo, td, crc]);
}
function png(ancho = 8, alto = 6, color = [224, 142, 109]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0); ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const filas = [];
  for (let y = 0; y < alto; y += 1) {
    filas.push(Buffer.from([0]));
    for (let x = 0; x < ancho; x += 1) filas.push(Buffer.from(color));
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque('IHDR', ihdr), bloque('IDAT', zlib.deflateSync(Buffer.concat(filas))), bloque('IEND', Buffer.alloc(0)),
  ]);
}

function jpegFalso(ancho = 640, alto = 480) {
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, alto >> 8, alto & 255, ancho >> 8, ancho & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]), sof, Buffer.from([0xff, 0xd9])]);
}

const olvidarSesiones = () => require('../server/lib/sesion').olvidar();
module.exports = {
  tokenVerificacion, iniciar, detener, cliente, crearAdmin, png, jpegFalso, db, olvidarSesiones, get base() { return base; } };
