'use strict';
const config = require('../config');
const db = require('../db');
const log = require('./log');
const BREVO = 'https://api.brevo.com/v3/smtp/email';

function configurado() {
  return !!(config.correo.apiKey && config.correo.remitente);
}
function faltante() {
  if (!config.correo.apiKey) return 'Falta CORREO_API_KEY (la clave de la API de Brevo)';
  if (!config.correo.remitente) return 'Falta CORREO_REMITENTE (el correo que verificaste en Brevo)';
  return null;
}
function remitente() {
  const r = config.correo.remitente.trim();
  const m = /^(.*)<([^>]+)>$/.exec(r);
  return m ? { email: m[2].trim(), name: m[1].trim().replace(/^"|"$/g, '') || 'Prepar' } : { email: r, name: 'Prepar' };
}

async function enviarUno(c) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(BREVO, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'api-key': config.correo.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender: remitente(), to: [{ email: c.destinatario }], subject: c.asunto, textContent: c.cuerpo }),
    });
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Brevo respondió ${r.status}: ${String(datos.message || JSON.stringify(datos)).slice(0, 200)}`);
    return String(datos.messageId || '').slice(0, 100) || null;
  } finally {
    clearTimeout(t);
  }
}

let ocupado = false;
const SQL_OCULTAR_TEMPORAL = "UPDATE correos_salida SET cuerpo = REGEXP_REPLACE(REGEXP_REPLACE(cuerpo, "
  + "'temporal es: [^[:space:]]+', 'temporal es: [oculta]'), 'temporal: [^[:space:]]+', 'temporal: [oculta]')";

async function procesarCola() {
  if (ocupado || !configurado()) return 0;
  ocupado = true;
  let enviados = 0;
  try {
    await db.conSistema(async (con) => {
      const candado = await con.uno("SELECT GET_LOCK('prepar_correos', 0) AS ok");
      if (!candado || candado.ok !== 1) return;
      try {
        const pendientes = await con.q(
          "SELECT id, destinatario, asunto, cuerpo, plantilla FROM correos_salida WHERE estado = 'pendiente' ORDER BY creado_en LIMIT 20");
        for (const c of pendientes) {
          try {
            const idExterno = await enviarUno(c);
            await con.call('sp_correo_resultado', [c.id, true, 'correo', idExterno, null]);
            if (c.plantilla === 'contrasena_temporal') await con.q(SQL_OCULTAR_TEMPORAL + ' WHERE id = ?', [c.id]);
            enviados += 1;
          } catch (e) {
            await con.call('sp_correo_resultado', [c.id, false, 'correo', null, String(e.message).slice(0, 500)]);
            if (c.plantilla === 'contrasena_temporal') await con.q(`${SQL_OCULTAR_TEMPORAL} WHERE id = ? AND estado = 'fallido'`, [c.id]);
          }
        }
      } finally {
        await con.q("SELECT RELEASE_LOCK('prepar_correos')");
      }
    });
  } catch (e) {
    log.tarea('No se pudo procesar la cola de correos:', e);
  } finally {
    ocupado = false;
  }
  return enviados;
}

function avisar() {
  if (!configurado()) return;
  setImmediate(() => { procesarCola().catch(() => {}); });
}

async function enviarPrueba(destino) {
  const f = faltante();
  if (f) return { ok: false, error: f };
  try {
    await enviarUno({ destinatario: destino, asunto: 'Prepar · Correo de prueba',
      cuerpo: 'Hola.\n\nEste es un correo de prueba de Prepar. Si lo recibes, el envío de correos ya funciona: ' +
        'las contraseñas temporales, la recuperación de contraseña y los avisos llegarán por aquí.\n\nPrepar · Simulador del Presupuesto Participativo' });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e).slice(0, 300) };
  }
}

module.exports = {
  SQL_OCULTAR_TEMPORAL, procesarCola, configurado, faltante, avisar, enviarPrueba };
