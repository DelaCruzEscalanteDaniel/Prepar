'use strict';
const crypto = require('crypto');
const config = require('../config');
const log = require('./log');
const correo = require('./correo');

const VIGENCIA_HORAS = 48;
const RE_TOKEN = /^[A-Za-z0-9_-]{20,100}$/;
const huella = (t) => crypto.createHash('sha256').update(t).digest('hex');

function activa() {
  return config.verificarCorreo === true || (config.verificarCorreo === 'auto' && correo.configurado());
}

async function enviarEnlace(con, usuario) {
  const token = crypto.randomBytes(32).toString('base64url');
  await con.q('DELETE FROM tokens_verificacion WHERE usuario_id = ? AND usado_en IS NULL', [usuario.id]);
  await con.q('INSERT INTO tokens_verificacion (usuario_id, token_hash, expira_en) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))',
    [usuario.id, huella(token), VIGENCIA_HORAS]);
  const enlace = `${config.urlPublica}/verificar.html#token=${token}`;
  await con.call('sp_encolar_correo', [usuario.id, usuario.correo, 'Prepar · Confirma tu correo',
    `Hola, ${usuario.nombre}.\n\nPara terminar de crear tu cuenta de Prepar confirma que este correo es tuyo.\n` +
    `Abre este enlace (válido por ${VIGENCIA_HORAS} horas):\n${enlace}\n\nSi no creaste una cuenta, ignora este mensaje.`, 'verificacion']);
  if (!config.produccion) log.info(`[Desarrollo] Enlace para confirmar el correo de ${usuario.correo}: ${enlace}`);
  correo.avisar();
}

async function confirmar(con, token) {
  if (typeof token !== 'string' || !RE_TOKEN.test(token)) return null;
  const t = await con.uno(
    `SELECT tv.id, tv.usuario_id FROM tokens_verificacion tv JOIN usuarios u ON u.id = tv.usuario_id
     WHERE tv.token_hash = ? AND tv.usado_en IS NULL AND tv.expira_en > NOW() AND u.eliminado_en IS NULL FOR UPDATE`, [huella(token)]);
  if (!t) return null;
  await con.q('UPDATE tokens_verificacion SET usado_en = NOW() WHERE id = ?', [t.id]);
  await con.q('UPDATE usuarios SET correo_verificado_en = COALESCE(correo_verificado_en, NOW()) WHERE id = ?', [t.usuario_id]);
  return t.usuario_id;
}

module.exports = { activa, enviarEnlace, confirmar, VIGENCIA_HORAS, _huella: huella };
