'use strict';
const config = require('../config');

const BREVO = 'https://api.brevo.com/v3/smtp/email';

const configurado = () => !!(config.correo.apiKey && config.correo.remitente);

function remitente() {
  const m = /^(.*)<([^>]+)>$/.exec(config.correo.remitente);
  return m ? { name: m[1].trim() || 'Prepar', email: m[2].trim() } : { name: 'Prepar', email: config.correo.remitente };
}

async function enviar(destinatario, asunto, cuerpo) {
  if (!configurado()) {
    console.log(`[correo sin enviar: falta configurar Brevo] Para ${destinatario}: ${asunto}`);
    return false;
  }
  try {
    const r = await fetch(BREVO, {
      method: 'POST',
      headers: { 'api-key': config.correo.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: remitente(), to: [{ email: destinatario }], subject: asunto, textContent: cuerpo }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) console.error(`Brevo respondió ${r.status} al enviar a ${destinatario}`);
    return r.ok;
  } catch (e) {
    console.error('No se pudo enviar el correo:', e.message);
    return false;
  }
}

module.exports = { enviar, configurado };
