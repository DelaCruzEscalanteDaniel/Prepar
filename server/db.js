'use strict';
const mysql = require('mysql2/promise');
const config = require('./config');
const log = require('./lib/log');

const TIEMPO_CONSULTA_MS = 15000;

let pool = null;

function crearPool() {
  const opciones = {
    host: config.bd.host,
    port: config.bd.port,
    user: config.bd.user,
    password: config.bd.password,
    database: config.bd.database,
    charset: 'utf8mb4',
    connectionLimit: config.bd.conexiones,
    waitForConnections: true,
    queueLimit: 2000,
    connectTimeout: 10000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    dateStrings: true,
    decimalNumbers: true,
    supportBigNumbers: true,
    multipleStatements: false,
    namedPlaceholders: false,
    maxIdle: config.bd.conexiones,
    idleTimeout: 60000,
  };
  if (config.bd.socketPath) opciones.socketPath = config.bd.socketPath;
  if (config.bd.ssl) opciones.ssl = config.bd.ssl;
  const p = mysql.createPool(opciones);
  p.pool.on('connection', (con) => {
    con.query("SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'", () => {});
    con.query("SET time_zone = '-06:00', @usuario_id = NULL, @interno = 0", () => {});
  });
  p.pool.on('error', (e) => log.error('Error en el pool de MySQL:', e.message));
  return p;
}

function obtenerPool() {
  if (!pool) pool = crearPool();
  return pool;
}

function consultar(conexion, sql, params) {
  return conexion.query({ sql, timeout: TIEMPO_CONSULTA_MS }, params);
}

async function conUsuario(usuarioId, trabajo) {
  const p = obtenerPool();
  const conexion = await p.getConnection();
  let sana = true;
  try {
    await consultar(conexion, 'SET @usuario_id = ?, @interno = 0', [usuarioId == null ? null : usuarioId]);
    return await trabajo(envolver(conexion));
  } catch (e) {
    if (e && (e.fatal || e.code === 'PROTOCOL_SEQUENCE_TIMEOUT')) sana = false;
    throw e;
  } finally {
    if (sana) {
      try {
        await consultar(conexion, 'ROLLBACK');
        await consultar(conexion, 'SET @usuario_id = NULL, @interno = 0');
        conexion.release();
      } catch {
        try { conexion.destroy(); } catch { }
      }
    } else {
      try { conexion.destroy(); } catch { }
    }
  }
}

function conSistema(trabajo) {
  return conUsuario(null, trabajo);
}

const esBloqueo = (e) => e && (e.code === 'ER_LOCK_DEADLOCK' || e.code === 'ER_LOCK_WAIT_TIMEOUT');
const INTENTOS = 5;
const pausa = (n) => new Promise((r) => setTimeout(r, 15 + Math.floor(Math.random() * 40) * n));

function envolver(conexion) {
  let enTransaccion = false;
  async function ejecutar(sql, params) {
    for (let intento = 1; ; intento += 1) {
      try {
        return await consultar(conexion, sql, params);
      } catch (e) {
        if (enTransaccion || !esBloqueo(e) || intento >= INTENTOS) throw e;
        await pausa(intento);
      }
    }
  }
  const con = {
    async q(sql, params = []) {
      const [filas] = await ejecutar(sql, params);
      return filas;
    },
    async uno(sql, params = []) {
      const filas = await con.q(sql, params);
      return Array.isArray(filas) && filas.length ? filas[0] : null;
    },
    async call(nombre, params = []) {
      if (!/^sp_[a-z_]+$/.test(nombre)) throw new Error('Nombre de procedimiento no válido');
      const marcas = params.map(() => '?').join(', ');
      const [res] = await ejecutar(`CALL ${nombre}(${marcas})`, params);
      if (Array.isArray(res) && Array.isArray(res[0])) return res[0];
      return [];
    },
    async transaccion(trabajo) {
      for (let intento = 1; ; intento += 1) {
        await consultar(conexion, 'START TRANSACTION');
        enTransaccion = true;
        try {
          const r = await trabajo(con);
          await consultar(conexion, 'COMMIT');
          return r;
        } catch (e) {
          try { await consultar(conexion, 'ROLLBACK'); } catch { }
          if (!esBloqueo(e) || intento >= INTENTOS) throw e;
          await pausa(intento);
        } finally {
          enTransaccion = false;
        }
      }
    },
  };
  return con;
}

async function salud() {
  try {
    await conSistema((c) => c.q('SELECT 1'));
    return true;
  } catch {
    return false;
  }
}

async function cerrar() {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end().catch(() => {});
  }
}

module.exports = { conUsuario, conSistema, salud, cerrar, obtenerPool };
