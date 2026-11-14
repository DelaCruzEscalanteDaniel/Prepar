'use strict';
const config = require('../config');

const AGENTE = `Prepar/1.0 (simulador academico del Presupuesto Participativo; ${config.urlPublica})`;

class ErrorCkan extends Error {
  constructor(mensaje, { estado, noEncontrado } = {}) {
    super(mensaje);
    this.estado = estado;
    this.noEncontrado = !!noEncontrado;
  }
}

function raizApi(urlBase) {
  const m = /^(https?:\/\/[^\s?#]+?\/api\/3\/action)(\/|$)/i.exec(String(urlBase || ''));
  if (!m) throw new ErrorCkan('Esta fuente no usa la API de datos abiertos (CKAN)');
  return m[1];
}

const esperar = (ms) => new Promise((r) => { setTimeout(r, ms); });

async function pedir(url, { timeout = 60000, intentos = 2 } = {}) {
  let ultimo;
  for (let i = 0; i < intentos; i += 1) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': AGENTE, Accept: 'application/json' } });
      return r;
    } catch (e) {
      ultimo = e;
    } finally {
      clearTimeout(t);
    }
    if (i < intentos - 1) await esperar(1500);
  }
  throw new ErrorCkan(`No se pudo conectar con el portal de datos (${ultimo && ultimo.name === 'AbortError'
    ? 'tardó demasiado en responder' : 'sin conexión a internet o el portal no responde'}). Se reintentará más tarde`);
}

async function accion(raiz, nombre, params = {}, opciones = {}) {
  const u = new URL(`${raiz}/${nombre}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    u.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  const r = await pedir(u, opciones);
  let datos = null;
  try { datos = await r.json(); } catch { datos = null; }
  if (!r.ok || !datos || datos.success === false) {
    const msg = datos && datos.error ? (datos.error.message || datos.error.__type || JSON.stringify(datos.error)) : `respuesta ${r.status}`;
    throw new ErrorCkan(`El portal respondió con error en ${nombre}: ${String(msg).slice(0, 200)}`,
      { estado: r.status, noEncontrado: r.status === 404 || /not found/i.test(String(msg)) });
  }
  return datos.result;
}

async function descargar(url, { maxBytes = 120 * 1024 * 1024, timeout = 180000 } = {}) {
  const r = await pedir(url, { timeout, intentos: 2 });
  if (!r.ok) throw new ErrorCkan(`No se pudo descargar el archivo (respuesta ${r.status})`, { estado: r.status, noEncontrado: r.status === 404 });
  const largo = Number(r.headers && r.headers.get && r.headers.get('content-length'));
  if (largo && largo > maxBytes) throw new ErrorCkan('El archivo del portal es demasiado grande');
  if (r.body && typeof r.body.getReader === 'function') {
    const lector = r.body.getReader();
    const partes = [];
    let total = 0;
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) { lector.cancel().catch(() => {}); throw new ErrorCkan('El archivo del portal es demasiado grande'); }
      partes.push(Buffer.from(value));
    }
    return Buffer.concat(partes);
  }
  if (typeof r.arrayBuffer === 'function') {
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > maxBytes) throw new ErrorCkan('El archivo del portal es demasiado grande');
    return buf;
  }
  const texto = await r.text();
  if (texto.length > maxBytes) throw new ErrorCkan('El archivo del portal es demasiado grande');
  return Buffer.from(texto, 'utf8');
}

async function descargarTexto(url, opciones) {
  const buf = await descargar(url, opciones);
  const utf = buf.toString('utf8').replace(/^\uFEFF/, '');
  const malos = (utf.match(/\uFFFD/g) || []).length;
  return malos > 3 ? buf.toString('latin1') : utf;
}

module.exports = { raizApi, accion, descargar, descargarTexto, ErrorCkan, AGENTE };
