'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mysql = require('mysql2/promise');
const config = require('../server/config');

const ARCHIVO = path.join(__dirname, '..', 'bd', 'prepar_bd_mysql.sql');

function sentencias(sql) {
  const salida = [];
  let delimitador = ';';
  let actual = '';
  for (const linea of sql.split(/\r?\n/)) {
    const cambio = /^\s*DELIMITER\s+(\S+)\s*$/i.exec(linea);
    if (cambio) { delimitador = cambio[1]; continue; }
    actual += linea + '\n';
    if (linea.trimEnd().endsWith(delimitador)) {
      const texto = actual.trimEnd();
      salida.push(texto.slice(0, texto.length - delimitador.length).trim());
      actual = '';
    }
  }
  if (actual.trim()) salida.push(actual.trim());
  return salida.filter(Boolean);
}

async function instalar(nombreBd = config.bd.database) {
  if (!/^[A-Za-z0-9_]{1,64}$/.test(nombreBd)) throw new Error('Nombre de base de datos no válido');
  const sql = fs.readFileSync(ARCHIVO, 'utf8')
    .replace('DROP DATABASE IF EXISTS prepar;', `DROP DATABASE IF EXISTS \`${nombreBd}\`;`)
    .replace('CREATE DATABASE prepar ', `CREATE DATABASE \`${nombreBd}\` `)
    .replace('USE prepar;', `USE \`${nombreBd}\`;`);
  const opciones = { host: config.bd.host, port: config.bd.port, user: config.bd.user, password: config.bd.password, charset: 'utf8mb4' };
  if (config.bd.socketPath) opciones.socketPath = config.bd.socketPath;
  if (config.bd.ssl) opciones.ssl = config.bd.ssl;
  const conexion = await mysql.createConnection(opciones);
  try {
    for (const s of sentencias(sql)) await conexion.query(s);
  } finally {
    await conexion.end();
  }
}

function confirmar(pregunta) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((r) => rl.question(pregunta, (x) => { rl.close(); r(x.trim().toLowerCase()); }));
}

if (require.main === module) {
  (async () => {
    const nombre = config.bd.database;
    console.log(`Se va a BORRAR y volver a crear la base "${nombre}" en ${config.bd.host}.`);
    const r = process.argv.includes('--si') ? 'si' : await confirmar('Escribe "si" para continuar: ');
    if (r !== 'si' && r !== 'sí') { console.log('Cancelado.'); return; }
    await instalar(nombre);
    console.log('✔ Base de datos instalada. Ahora crea el administrador con: npm run crear-admin');
  })().catch((e) => { console.error('✘ No se pudo instalar la base de datos:', e.message); process.exitCode = 1; });
}

module.exports = { instalar, sentencias };
