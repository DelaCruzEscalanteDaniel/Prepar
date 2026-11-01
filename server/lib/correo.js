'use strict';
const config = require('../config');
const db = require('../db');
const log = require('./log');
const smtp = require('./smtp');

const esSmtp = () => ['gmail', 'smtp'].includes(config.correo.proveedor);
function configurado() {
  const c = config.correo;
  if (esSmtp()) return !!(c.smtp.host && c.smtp.usuario && c.smtp.contrasena);
  return !!(c.proveedor && c.apiKey && c.remitente);
}
function faltante() {
  const c = config.correo;
  if (!c.proveedor) return 'No hay proveedor de correo configurado (CORREO_PROVEEDOR)';
  if (esSmtp()) {
    if (!c.smtp.host) return 'Falta CORREO_SMTP_HOST';
    if (!c.smtp.usuario) return 'Falta CORREO_SMTP_USUARIO (tu correo)';
    if (!c.smtp.contrasena) return 'Falta CORREO_SMTP_CONTRASENA (la contraseña de aplicación)';
    return null;
  }
  if (!['resend', 'brevo'].includes(c.proveedor)) return `Proveedor de correo no válido: ${c.proveedor} (usa gmail, smtp, resend o brevo)`;
  if (!c.apiKey) return 'Falta CORREO_API_KEY';
  if (!c.remitente) return 'Falta CORREO_REMITENTE';
  return null;
}

async function enviarUno(c) {
  if (esSmtp()) {
    const s = config.correo.smtp;
    const r = await smtp.enviar({ host: s.host, puerto: s.puerto, usuario: s.usuario, contrasena: s.contrasena, sinTls: s.sinTls,
      remitente: config.correo.remitente.includes('@') ? config.correo.remitente : `Prepar <${s.usuario}>`, para: c.destinatario, asunto: c.asunto, texto: c.cuerpo });
    const id = /id=?\s*([\w.@-]+)/i.exec(r);
    return id ? id[1].slice(0, 100) : null;
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    let r;
    if (config.correo.proveedor === 'resend') {
      r = await fetch('https://api.resend.com/emails', {
        method: 'POST', signal: ctrl.signal,
        headers: { Authorization: `Bearer ${config.correo.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: config.correo.remitente, to: [c.destinatario], subject: c.asunto, text: c.cuerpo }),
      });
    } else if (config.correo.proveedor === 'brevo') {
      r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST', signal: ctrl.signal,
        headers: { 'api-key': config.correo.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ sender: { email: config.correo.remitente, name: 'Prepar' }, to: [{ email: c.destinatario }], subject: c.asunto, textContent: c.cuerpo }),
      });
    } else {
      throw new Error(`Proveedor de correo no soportado: ${config.correo.proveedor}`);
    }
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`HTTP ${r.status} ${JSON.stringify(datos).slice(0, 200)}`);
    return String(datos.id || datos.messageId || '').slice(0, 100) || null;
  } finally {
    clearTimeout(t);
  }
}

let ocupado = false;
// Quita la contraseña temporal del texto guardado de un correo ya enviado.
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
    log.aviso('No se pudo procesar la cola de correos:', e.message);
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
  SQL_OCULTAR_TEMPORAL, procesarCola, configurado, faltante, avisar, enviarPrueba, esSmtp };
