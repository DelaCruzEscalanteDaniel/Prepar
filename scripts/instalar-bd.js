'use strict';
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mysql = require('mysql2/promise');
const config = require('../server/config');

const ARCHIVO = path.join(__dirname, '..', 'bd', 'prepar_bd_mysql.sql');

function sentencias(sql) {
  const salida = [];
  let delim = ';';
  let actual = '';
  let comilla = null;
  const lineas = sql.split(/\r?\n/);
  for (const linea of lineas) {
    if (!comilla) {
      const m = /^\s*DELIMITER\s+(\S+)\s*$/i.exec(linea);
      if (m) { delim = m[1]; continue; }
      if (!actual.trim() && /^\s*(--|#)/.test(linea)) continue;
    }
    let i = 0;
    while (i < linea.length) {
      const c = linea[i];
      if (comilla) {
        actual += c;
        if (c === '\\') { actual += linea[i + 1] || ''; i += 2; continue; }
        if (c === comilla) {
          if (linea[i + 1] === comilla) { actual += comilla; i += 2; continue; }
          comilla = null;
        }
        i += 1;
        continue;
      }
      if (c === '-' && linea[i + 1] === '-' && /\s|$/.test(linea[i + 2] || ' ')) break;
      if (c === "'" || c === '"' || c === '`') { comilla = c; actual += c; i += 1; continue; }
      if (linea.startsWith(delim, i)) {
        if (actual.trim()) salida.push(actual.trim());
        actual = '';
        i += delim.length;
        continue;
      }
      actual += c;
      i += 1;
    }
    actual += '\n';
  }
  if (actual.trim()) salida.push(actual.trim());
  return salida;
}

async function instalar({ nombreBd = config.bd.database, silencioso = false } = {}) {
  if (!/^[A-Za-z0-9_]{1,64}$/.test(nombreBd)) throw new Error('Nombre de base de datos no válido');
  let sql = fs.readFileSync(ARCHIVO, 'utf8');
  sql = sql.replace(/DROP DATABASE IF EXISTS prepar;/, `DROP DATABASE IF EXISTS \`${nombreBd}\`;`)
    .replace(/CREATE DATABASE prepar /, `CREATE DATABASE \`${nombreBd}\` `)
    .replace(/\nUSE prepar;/, `\nUSE \`${nombreBd}\`;`);
  const opciones = {
    host: config.bd.host, port: config.bd.port, user: config.bd.user, password: config.bd.password,
    charset: 'utf8mb4', multipleStatements: false,
  };
  if (config.bd.socketPath) opciones.socketPath = config.bd.socketPath;
  if (config.bd.ssl) opciones.ssl = config.bd.ssl;
  const con = await mysql.createConnection(opciones);
  try {
    const lista = sentencias(sql);
    let n = 0;
    for (const s of lista) {
      await con.query(s);
      n += 1;
    }
    if (!silencioso) console.log(`✔ Base de datos "${nombreBd}" instalada (${n} sentencias).`);
    return n;
  } finally {
    await con.end();
  }
}

const ADMIN_INICIAL = {
  nombre: 'Administrador Prepar',
  correo: 'equipoprepar@gmail.com',
  hash: '$2a$10$9poaVAzhNvXq1LOZYN1n.OeSooSA6CFvHwFNU7UCDweXHg37D.hnS',
};

async function crearAdministradorInicial() {
  const db = require('../server/db');
  try {
    await db.conSistema((con) => con.call('sp_crear_administrador', [ADMIN_INICIAL.nombre, ADMIN_INICIAL.correo, ADMIN_INICIAL.hash]));
    console.log(`✔ Administrador creado: ${ADMIN_INICIAL.correo}`);
  } finally {
    await db.cerrar();
  }
}

module.exports = { instalar, sentencias, ADMIN_INICIAL };

if (require.main === module) {
  (async () => {
    const nombre = config.bd.database;
    if (!process.argv.includes('--si')) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const r = await new Promise((res) => rl.question(`Se BORRARÁ y volverá a crear la base "${nombre}". ¿Continuar? (s/n) `, res));
      rl.close();
      if (!/^s/i.test(r.trim())) { console.log('Cancelado.'); return; }
    }
    try {
      await instalar({ nombreBd: nombre });
      await crearAdministradorInicial();
    } catch (e) {
      console.error('✘ No se pudo instalar la base de datos:', e.sqlMessage || e.message);
      process.exitCode = 1;
    }
  })();
}
