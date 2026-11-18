'use strict';
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../server/config');
const { sentencias } = require('./instalar-bd');

const DURACION = [7, 21, 14, 7, 7, 3, 90, 14];

const SINGULAR = {
  alcaldias: 'alcaldia', colonias: 'colonia', rubros: 'rubro', pasos_rubro: 'paso_rubro', fases: 'fase',
  usuarios: 'usuario', sesiones: 'sesion', recuperaciones: 'recuperacion', ciclos: 'ciclo', ideas: 'idea',
  comentarios: 'comentario', imagenes: 'imagen', proyectos: 'proyecto', dictamenes: 'dictamen', votos: 'voto',
  gastos: 'gasto', fotos_denuncia: 'foto_denuncia',
};

const FORANEAS = {
  alcaldia_id: 'id_alcaldia', colonia_id: 'id_colonia', rubro_id: 'id_rubro', fase_id: 'id_fase', ciclo_id: 'id_ciclo',
  idea_id: 'id_idea', usuario_id: 'id_usuario', proyecto_id: 'id_proyecto', imagen_id: 'id_imagen', autor_id: 'id_autor',
  funcionario_id: 'id_funcionario', proponente_id: 'id_proponente', paso_id: 'id_paso_rubro',
};

async function actualizar() {
  const opciones = {
    host: config.bd.host, port: config.bd.port, user: config.bd.user, password: config.bd.password,
    database: config.bd.database, charset: 'utf8mb4', dateStrings: true,
  };
  if (config.bd.socketPath) opciones.socketPath = config.bd.socketPath;
  if (config.bd.ssl) opciones.ssl = config.bd.ssl;
  const con = await mysql.createConnection(opciones);
  const q = async (sql, params) => (await con.query(sql, params))[0];
  const quitarRestricciones = async () => {
    const restricciones = await q(
      `SELECT TABLE_NAME AS tabla, CONSTRAINT_NAME AS nombre, CONSTRAINT_TYPE AS tipo FROM information_schema.TABLE_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_TYPE IN ('FOREIGN KEY', 'CHECK')`);
    for (const r of restricciones.filter((x) => x.tipo === 'FOREIGN KEY')) await q(`ALTER TABLE \`${r.tabla}\` DROP FOREIGN KEY \`${r.nombre}\``);
    for (const r of restricciones.filter((x) => x.tipo === 'CHECK')) await q(`ALTER TABLE \`${r.tabla}\` DROP CHECK \`${r.nombre}\``);
  };
  let renombradas = 0;
  try {
    const todas = sentencias(fs.readFileSync(path.join(__dirname, '..', 'bd', 'prepar_bd_mysql.sql'), 'utf8'));
    const nombre = (s) => /CREATE (?:VIEW|TRIGGER|PROCEDURE) (\w+)/.exec(s)[1];

    for (const t of await q("SELECT TRIGGER_NAME AS n FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE()")) await q(`DROP TRIGGER \`${t.n}\``);
    for (const p of await q("SELECT ROUTINE_NAME AS n FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = DATABASE() AND ROUTINE_TYPE = 'PROCEDURE'")) await q(`DROP PROCEDURE \`${p.n}\``);
    for (const v of await q("SELECT TABLE_NAME AS n FROM information_schema.VIEWS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME = 'v_avance_proyecto'")) await q(`DROP VIEW \`${v.n}\``);

    const nuevoNombre = (tabla, columna) => {
      if (columna === 'id' && SINGULAR[tabla]) return `id_${SINGULAR[tabla]}`;
      return FORANEAS[columna] || null;
    };
    const columnas = await q(
      `SELECT c.TABLE_NAME AS tabla, c.COLUMN_NAME AS columna FROM information_schema.COLUMNS c
       JOIN information_schema.TABLES t ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
       WHERE c.TABLE_SCHEMA = DATABASE() AND t.TABLE_TYPE = 'BASE TABLE'`);
    const cambios = columnas.filter((c) => nuevoNombre(c.tabla, c.columna));
    await quitarRestricciones();

    const porTabla = {};
    for (const c of cambios) (porTabla[c.tabla] = porTabla[c.tabla] || []).push(c.columna);
    for (const [tabla, lista] of Object.entries(porTabla)) {
      const partes = lista.map((c) => `RENAME COLUMN \`${c}\` TO \`${nuevoNombre(tabla, c)}\``).join(', ');
      await q(`ALTER TABLE \`${tabla}\` ${partes}`);
      renombradas += lista.length;
    }

    const tablaFechas = todas.find((s) => s.startsWith('CREATE TABLE ciclo_fases'));
    await q(tablaFechas.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'));
    await quitarRestricciones();
    for (const s of todas.filter((x) => x.startsWith('CREATE TABLE'))) {
      const tabla = /CREATE TABLE (\w+)/.exec(s)[1];
      for (const linea of s.split('\n').map((l) => l.trim().replace(/,$/, ''))) {
        if (linea.startsWith('FOREIGN KEY') || linea.startsWith('CHECK')) await q(`ALTER TABLE \`${tabla}\` ADD ${linea}`);
      }
    }

    const sinFechas = await q(
      'SELECT c.id_ciclo, DATE(c.creado_en) AS inicio FROM ciclos c WHERE NOT EXISTS (SELECT 1 FROM ciclo_fases f WHERE f.id_ciclo = c.id_ciclo)');
    for (const c of sinFechas) {
      const dia = new Date(`${c.inicio}T12:00`);
      for (let fase = 1; fase <= 8; fase += 1) {
        const inicio = dia.toISOString().slice(0, 10);
        dia.setDate(dia.getDate() + DURACION[fase - 1] - 1);
        const fin = dia.toISOString().slice(0, 10);
        dia.setDate(dia.getDate() + 1);
        await q('INSERT INTO ciclo_fases (id_ciclo, id_fase, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?)', [c.id_ciclo, fase, inicio, fin]);
      }
    }

    for (const s of todas.filter((x) => /^CREATE (VIEW|TRIGGER|PROCEDURE)/.test(x))) {
      if (!nombre(s)) continue;
      await q(s);
    }
    return { renombradas, fechas: sinFechas.length };
  } finally {
    await con.end();
  }
}

if (require.main === module) {
  actualizar()
    .then(({ renombradas, fechas }) => console.log(`✔ Base actualizada sin borrar datos. Columnas renombradas: ${renombradas}. Ciclos con fechas nuevas: ${fechas}.`))
    .catch((e) => { console.error('✘ No se pudo actualizar la base:', e.message); process.exitCode = 1; });
}

module.exports = { actualizar };
