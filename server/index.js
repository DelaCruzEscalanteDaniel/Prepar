'use strict';
const http = require('http');
const config = require('./config');
const log = require('./lib/log');
const db = require('./db');
const { crearApp } = require('./app');
const correo = require('./lib/correo');
const sincronizar = require('./lib/sincronizar');
const ciclosIniciales = require('./lib/ciclosIniciales');

process.on('unhandledRejection', (e) => log.error('Promesa rechazada sin atrapar:', e && (e.stack || e)));
process.on('uncaughtException', (e) => log.error('Excepción sin atrapar:', e && (e.stack || e)));

const app = crearApp();
const servidor = http.createServer(app);
servidor.requestTimeout = 60 * 1000;
servidor.headersTimeout = 20 * 1000;
servidor.keepAliveTimeout = 65 * 1000;
servidor.maxHeadersCount = 80;
servidor.maxRequestsPerSocket = 1000;
servidor.maxConnections = 2000;
servidor.maxRequestsPerSocket = 1000;
servidor.on('clientError', (err, socket) => {
  try { if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'); } catch { }
});

const tareas = [];
function iniciarTareas() {
  if (!config.tareasProgramadas) return;
  tareas.push(setInterval(() => { correo.procesarCola().catch(() => {}); }, 60 * 1000));
  const sincronizarYCiclos = () => sincronizar.sincronizarPendientes().catch(() => {}).then(() => ciclosIniciales.asegurar()).then(() => require('./lib/cicloDemostracion').asegurar());
  tareas.push(setInterval(sincronizarYCiclos, 10 * 60 * 1000));
  tareas.push(setTimeout(sincronizarYCiclos, 60 * 1000));
  tareas.forEach((t) => t.unref());
}

servidor.listen(config.puerto, async () => {
  log.info(`Prepar escuchando en ${config.urlPublica} (puerto ${config.puerto})`);
  const ok = await db.salud();
  if (ok) {
    log.info('Conexión con MySQL correcta');
    await require('./lib/migraciones').migrar().catch(() => {});
    await ciclosIniciales.asegurar();
    await require('./lib/cicloDemostracion').asegurar();
  }
  else log.error('No se pudo conectar con MySQL. Revisa las variables DB_* del archivo .env (el servidor sigue intentando en cada petición)');
  iniciarTareas();
});

servidor.on('error', (e) => {
  log.error(e.code === 'EADDRINUSE' ? `El puerto ${config.puerto} ya está en uso. Cambia PORT en el archivo .env` : e.message);
  process.exit(1);
});

let cerrando = false;
async function apagar(senal) {
  if (cerrando) return;
  cerrando = true;
  log.info(`Recibí ${senal}. Cerrando con orden…`);
  tareas.forEach(clearInterval);
  const limite = setTimeout(() => process.exit(0), 10000);
  limite.unref();
  servidor.close(async () => {
    await db.cerrar();
    process.exit(0);
  });
}
process.on('SIGTERM', () => apagar('SIGTERM'));
process.on('SIGINT', () => apagar('SIGINT'));
