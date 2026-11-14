'use strict';
const mysql = require('mysql2/promise');
const config = require('./config');

const opciones = {
  host: config.bd.host,
  port: config.bd.port,
  user: config.bd.user,
  password: config.bd.password,
  database: config.bd.database,
  charset: 'utf8mb4',
  connectionLimit: 10,
  dateStrings: true,
  decimalNumbers: true,
  timezone: '-06:00',
};
if (config.bd.socketPath) opciones.socketPath = config.bd.socketPath;
if (config.bd.ssl) opciones.ssl = config.bd.ssl;

const pool = mysql.createPool(opciones);
pool.pool.on('connection', (con) => con.query("SET time_zone = '-06:00'"));

async function q(sql, params = []) {
  const [filas] = await pool.query(sql, params);
  return filas;
}

async function uno(sql, params = []) {
  const filas = await q(sql, params);
  return filas[0] || null;
}

async function llamar(procedimiento, params = []) {
  const marcas = params.map(() => '?').join(', ');
  const [res] = await pool.query(`CALL ${procedimiento}(${marcas})`, params);
  return Array.isArray(res[0]) ? res[0] : [];
}

async function transaccion(trabajo) {
  const con = await pool.getConnection();
  try {
    await con.beginTransaction();
    const t = {
      q: async (sql, params = []) => (await con.query(sql, params))[0],
      uno: async (sql, params = []) => (await con.query(sql, params))[0][0] || null,
    };
    const r = await trabajo(t);
    await con.commit();
    return r;
  } catch (e) {
    await con.rollback();
    throw e;
  } finally {
    con.release();
  }
}

module.exports = { q, uno, llamar, transaccion, pool };
