'use strict';
const fs = require('fs');
const path = require('path');
const db = require('../db');
const log = require('./log');

const existeColumna = (con, tabla, col) => con.uno(
  'SELECT 1 AS si FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [tabla, col]);
const existeTabla = (con, tabla) => con.uno(
  'SELECT 1 AS si FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [tabla]);

function sentenciaDelScript(inicio) {
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'bd', 'prepar_bd_mysql.sql'), 'utf8');
  const i = sql.indexOf(inicio);
  if (i < 0) return null;
  let dentro = false;
  for (let j = i; j < sql.length; j += 1) {
    const c = sql[j];
    if (c === "'") {
      if (dentro && sql[j + 1] === "'") { j += 1; continue; }
      dentro = !dentro;
    } else if (c === ';' && !dentro) return sql.slice(i, j);
  }
  return null;
}

const PASOS = [
  {
    nombre: 'modo del simulador (ciclos.tipo y ciclos.pausado_en)',
    falta: async (con) => !(await existeColumna(con, 'ciclos', 'tipo')),
    aplicar: async (con) => {
      await con.q(`ALTER TABLE ciclos
        ADD COLUMN tipo VARCHAR(8) NOT NULL DEFAULT 'practica' AFTER origen_indices,
        ADD COLUMN pausado_en DATETIME NULL AFTER tipo,
        ADD CONSTRAINT ck_ciclo_tipo CHECK (tipo IN ('oficial', 'practica'))`);
      await con.q("UPDATE ciclos SET tipo = 'oficial' WHERE nombre LIKE '%(IECM)%' AND estado <> 'cerrado'");
    },
  },
  {
    nombre: 'contraseñas temporales ocultas en correos ya enviados',
    // Los pendientes también, si no hay correo configurado: nunca se enviarán y el Administrador ya vio la contraseña.
    falta: async (con) => !!(await con.uno(`SELECT 1 AS si FROM correos_salida WHERE plantilla = 'contrasena_temporal'
      AND (estado <> 'pendiente' OR ?) AND cuerpo NOT LIKE '%[oculta]%' LIMIT 1`, [!require('./correo').configurado()])),
    aplicar: (con) => con.q(`${require('./correo').SQL_OCULTAR_TEMPORAL} WHERE plantilla = 'contrasena_temporal'
      AND (estado <> 'pendiente' OR ?)`, [!require('./correo').configurado()]),
  },
  {
    nombre: 'teléfono de oficina (usuarios.telefono)',
    falta: async (con) => !(await existeColumna(con, 'usuarios', 'telefono')),
    aplicar: (con) => con.q(`ALTER TABLE usuarios ADD COLUMN telefono VARCHAR(10) NULL AFTER foto_archivo_id,
      ADD CONSTRAINT ck_usuarios_telefono CHECK (telefono IS NULL OR telefono REGEXP '^[0-9]{10}$')`),
  },
  {
    nombre: 'vigencia de avisos (avisos.vigente_hasta)',
    falta: async (con) => !(await existeColumna(con, 'avisos', 'vigente_hasta')),
    aplicar: (con) => con.q('ALTER TABLE avisos ADD COLUMN vigente_hasta DATE NULL'),
  },
  {
    nombre: 'Términos y condiciones (tabla terminos_condiciones)',
    falta: async (con) => !(await existeTabla(con, 'terminos_condiciones')),
    aplicar: async (con) => {
      await con.q(sentenciaDelScript('CREATE TABLE terminos_condiciones'));
      await con.q(sentenciaDelScript('INSERT INTO terminos_condiciones'));
    },
  },
  {
    nombre: 'aceptación de Términos (usuarios.terminos_version)',
    falta: async (con) => !(await existeColumna(con, 'usuarios', 'terminos_version')),
    aplicar: (con) => con.q(`ALTER TABLE usuarios
      ADD COLUMN terminos_version VARCHAR(10) NULL,
      ADD COLUMN terminos_aceptados_en DATETIME NULL,
      ADD CONSTRAINT fk_usuario_terminos FOREIGN KEY (terminos_version) REFERENCES terminos_condiciones(version)`),
  },
  {
    nombre: 'tipos de proyecto configurables (tabla categorias_proyecto)',
    falta: async (con) => !(await existeTabla(con, 'categorias_proyecto')),
    aplicar: async (con) => {
      await con.q(sentenciaDelScript('CREATE TABLE categorias_proyecto'));
      await con.q(sentenciaDelScript('INSERT INTO categorias_proyecto'));
    },
  },
  {
    nombre: 'tipo de proyecto (proyectos.categoria)',
    falta: async (con) => !(await existeColumna(con, 'proyectos', 'categoria')),
    aplicar: (con) => con.q(`ALTER TABLE proyectos ADD COLUMN categoria VARCHAR(20) NULL AFTER rubro_id,
      ADD CONSTRAINT fk_proy_categoria FOREIGN KEY (categoria) REFERENCES categorias_proyecto(clave)`),
  },
  {
    nombre: 'tipo de proyecto ligado a la tabla de tipos (fk_proy_categoria)',
    falta: async (con) => !(await con.uno(`SELECT 1 AS si FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proyectos' AND CONSTRAINT_NAME = 'fk_proy_categoria'`)),
    aplicar: async (con) => {
      const check = await con.uno(`SELECT 1 AS si FROM information_schema.TABLE_CONSTRAINTS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proyectos' AND CONSTRAINT_NAME = 'ck_proy_categoria'`);
      if (check) {
        try { await con.q('ALTER TABLE proyectos DROP CHECK ck_proy_categoria'); } catch { await con.q('ALTER TABLE proyectos DROP CONSTRAINT ck_proy_categoria'); }
      }
      await con.q('ALTER TABLE proyectos MODIFY COLUMN categoria VARCHAR(20) NULL');
      await con.q('UPDATE proyectos SET categoria = NULL WHERE categoria IS NOT NULL AND categoria NOT IN (SELECT clave FROM categorias_proyecto)');
      await con.q('ALTER TABLE proyectos ADD CONSTRAINT fk_proy_categoria FOREIGN KEY (categoria) REFERENCES categorias_proyecto(clave)');
    },
  },
  {
    nombre: 'directorio con datos oficiales y Gobierno de la Ciudad (tabla directorio_ciudad)',
    falta: async (con) => !(await existeTabla(con, 'directorio_ciudad')),
    aplicar: async (con) => {
      if (!(await existeColumna(con, 'directorio', 'fuente_url'))) {
        await con.q(`ALTER TABLE directorio ADD COLUMN fuente_nombre VARCHAR(150) NULL AFTER editado_manualmente,
          ADD COLUMN fuente_url VARCHAR(300) NULL AFTER fuente_nombre, ADD COLUMN consultado_en DATE NULL AFTER fuente_url`);
      }
      await con.q(sentenciaDelScript('CREATE TABLE directorio_ciudad'));
      await con.q(sentenciaDelScript('INSERT INTO directorio_ciudad'));
      await con.q(`DELETE FROM directorio WHERE nombre_titular = 'Persona Titular (dato de ejemplo)' OR correo LIKE '%.ejemplo.mx'
        OR (cargo = 'Centro de Servicios y Atención Ciudadana' AND direccion = 'Av. 22 de Febrero 440')
        OR (cargo = 'Ventanilla Única de Coyoacán' AND direccion = 'Jardín Hidalgo 1, Coyoacán')`);
      await con.q(sentenciaDelScript('UPDATE directorio d JOIN alcaldias a ON a.id = d.alcaldia_id JOIN ('));
      await con.q(sentenciaDelScript('INSERT INTO directorio (alcaldia_id, tipo, cargo, nombre_titular, temas, direccion, telefono, correo, sitio_web, fuente_nombre'));
    },
  },
];

async function migrar() {
  const hechos = [];
  for (const p of PASOS) {
    try {
      await db.conSistema(async (con) => {
        if (await p.falta(con)) { await p.aplicar(con); hechos.push(p.nombre); }
      });
    } catch (e) {
      log.error(`No se pudo actualizar la base (${p.nombre}): ${e.message}. Corre "npm run bd:instalar" para reinstalarla.`);
    }
  }
  try {
    const categorias = require('./categorias');
    await categorias.refrescar(true);
    await db.conSistema(async (con) => {
      const filas = await con.q(`SELECT p.id, p.titulo, p.descripcion FROM proyectos p JOIN ciclos c ON c.id = p.ciclo_id
                                 WHERE c.estado = 'activo' AND p.categoria IS NULL`);
      for (const p of filas) await con.q('UPDATE proyectos SET categoria = ? WHERE id = ?', [categorias.adivinar(p.titulo, p.descripcion), p.id]);
    });
  } catch (e) {
    log.error(`No se pudo asignar el tipo a proyectos anteriores: ${e.message}`);
  }
  if (hechos.length) log.info(`Base de datos actualizada automáticamente: ${hechos.join(', ')}`);
  return hechos;
}

module.exports = { migrar, sentenciaDelScript };
