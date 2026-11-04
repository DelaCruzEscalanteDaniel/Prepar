'use strict';
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');

function direccion(texto) {
  const m = /<([^<>\s]+@[^<>\s]+)>/.exec(String(texto || ''));
  return (m ? m[1] : String(texto || '')).trim();
}
const limpio = (t) => String(t || '').replace(/[\r\n]+/g, ' ').trim();
function codificar(t) {
  const s = limpio(t);
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
}
function remitenteCodificado(remitente) {
  const m = /^(.*)<([^<>]+)>\s*$/.exec(limpio(remitente));
  if (!m) return limpio(remitente);
  const nombre = m[1].trim().replace(/^"|"$/g, '');
  return nombre ? `${codificar(nombre)} <${m[2].trim()}>` : `<${m[2].trim()}>`;
}

function armarMensaje({ remitente, para, asunto, texto }) {
  const cuerpo = Buffer.from(String(texto || '').replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n');
  const dominio = direccion(remitente).split('@')[1] || 'prepar.local';
  return [
    `From: ${remitenteCodificado(remitente)}`,
    `To: <${direccion(para)}>`,
    `Subject: ${codificar(asunto)}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${crypto.randomBytes(12).toString('hex')}@${dominio}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    cuerpo,
  ].join('\r\n');
}

function enviar(op) {
  const puerto = Number(op.puerto) || 465;
  const directo = puerto === 465 && !op.sinTls;
  const tiempo = op.tiempo || 20000;
  return new Promise((resolver, rechazar) => {
    let socket;
    let buffer = '';
    let espera = null;
    let terminado = false;
    const fin = (err, valor) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(reloj);
      try { socket.end(); } catch { }
      try { socket.destroy(); } catch { }
      if (err) rechazar(err); else resolver(valor);
    };
    const reloj = setTimeout(() => fin(new Error('El servidor de correo no respondió a tiempo')), tiempo);
    const procesar = () => {
      if (!espera) return;
      const lineas = buffer.split('\r\n');
      for (let i = 0; i < lineas.length - 1; i += 1) {
        if (/^\d{3} /.test(lineas[i])) {
          const respuesta = lineas.slice(0, i + 1).join('\n');
          buffer = lineas.slice(i + 1).join('\r\n');
          const e = espera;
          espera = null;
          e.resolver({ codigo: Number(lineas[i].slice(0, 3)), texto: respuesta });
          return;
        }
      }
    };
    const alDatos = (d) => { buffer += d.toString('utf8'); procesar(); };
    const leer = () => new Promise((ok, mal) => { espera = { resolver: ok, rechazar: mal }; procesar(); });
    const enviarLinea = (l) => socket.write(l + '\r\n');
    const paso = async (linea, esperado, que) => {
      if (linea !== null) enviarLinea(linea);
      const r = await leer();
      if (!esperado.includes(r.codigo)) {
        const err = new Error(`${que}: ${r.texto.replace(/\s+/g, ' ').slice(0, 200)}`);
        err.codigo = r.codigo;
        throw err;
      }
      return r;
    };
    const conectarEventos = (s) => {
      s.on('data', alDatos);
      s.on('error', (e) => fin(new Error(`No se pudo conectar con el servidor de correo (${e.code || e.message})`)));
      s.on('close', () => { if (espera) espera.rechazar(new Error('El servidor de correo cerró la conexión')); });
    };
    const opcionesTls = { servername: op.host, rejectUnauthorized: !op.tlsInseguro };
    const conversar = async () => {
      await paso(null, [220], 'Saludo');
      await paso(`EHLO ${op.nombreEquipo || 'prepar'}`, [250], 'EHLO');
      if (!directo && !op.sinTls) {
        await paso('STARTTLS', [220], 'STARTTLS');
        socket.removeListener('data', alDatos);
        socket = tls.connect({ socket, ...opcionesTls });
        conectarEventos(socket);
        await new Promise((ok, mal) => { socket.once('secureConnect', ok); socket.once('error', mal); });
        await paso(`EHLO ${op.nombreEquipo || 'prepar'}`, [250], 'EHLO');
      }
      if (op.usuario) {
        await paso('AUTH LOGIN', [334], 'Autenticación');
        await paso(Buffer.from(op.usuario).toString('base64'), [334], 'Autenticación (usuario)');
        await paso(Buffer.from(op.contrasena || '').toString('base64'), [235], 'Usuario o contraseña de correo incorrectos');
      }
      await paso(`MAIL FROM:<${direccion(op.remitente)}>`, [250], 'Remitente');
      await paso(`RCPT TO:<${direccion(op.para)}>`, [250, 251], 'Destinatario');
      await paso('DATA', [354], 'DATA');
      socket.write(armarMensaje(op) + '\r\n.\r\n');
      const r = await paso(null, [250], 'Envío');
      enviarLinea('QUIT');
      return r.texto;
    };
    try {
      socket = directo ? tls.connect({ host: op.host, port: puerto, ...opcionesTls }) : net.connect({ host: op.host, port: puerto });
    } catch (e) { fin(e); return; }
    conectarEventos(socket);
    socket.once(directo ? 'secureConnect' : 'connect', () => {
      conversar().then((t) => fin(null, t), (e) => fin(e));
    });
  });
}

module.exports = { enviar, armarMensaje, direccion, codificar };
