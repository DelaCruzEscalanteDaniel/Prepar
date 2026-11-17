'use strict';
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../server/config');
const { sentencias } = require('./instalar-bd');

const DURACION = [7, 21, 14, 7, 7, 3, 90, 14];

async function actualizar() {
  const opciones = { host: config.bd.host, port: config.bd.port, user: config.bd.user, password: config.bd.password, database: config.bd.database, charset: 'utf8mb4', dateStrings: true };
  if (config.bd.socketPath) opciones.socketPath = config.bd.socketPath;
  if (config.bd.ssl) opciones.ssl = config.bd.ssl;
  const con = await mysql.createConnection(opciones);
  try {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'bd', 'prepar_bd_mysql.sql'), 'utf8');
    const todas = sentencias(sql);
    const tabla = todas.find((s) => s.startsWith('CREATE TABLE ciclo_fases'));
    const procedimiento = todas.find((s) => s.startsWith('CREATE PROCEDURE sp_crear_ciclo'));
    await con.query(tabla.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'));
    await con.query('DROP PROCEDURE IF EXISTS sp_crear_ciclo');
    await con.query(procedimiento);
    const ciclos = await con.query(
      'SELECT c.id, DATE(c.creado_en) AS inicio FROM ciclos c WHERE NOT EXISTS (SELECT 1 FROM ciclo_fases f WHERE f.ciclo_id = c.id)');
    for (const c of ciclos[0]) {
      let dia = new Date(`${c.inicio}T12:00`);
      for (let fase = 1; fase <= 8; fase += 1) {
        const inicio = dia.toISOString().slice(0, 10);
        dia.setDate(dia.getDate() + DURACION[fase - 1] - 1);
        const fin = dia.toISOString().slice(0, 10);
        dia.setDate(dia.getDate() + 1);
        await con.query('INSERT INTO ciclo_fases (ciclo_id, fase_id, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?)', [c.id, fase, inicio, fin]);
      }
    }
    return ciclos[0].length;
  } finally {
    await con.end();
  }
}

if (require.main === module) {
  actualizar()
    .then((n) => console.log(`✔ Base actualizada sin borrar datos. Se pusieron fechas a ${n} ciclo(s); el administrador las puede cambiar en Ciclos.`))
    .catch((e) => { console.error('✘ No se pudo actualizar la base:', e.message); process.exitCode = 1; });
}

module.exports = { actualizar };
