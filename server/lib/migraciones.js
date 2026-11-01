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
  {
    nombre: 'verificación de correo y baja de cuenta (usuarios.correo_verificado_en, usuarios.eliminado_en, tokens_verificacion)',
    falta: async (con) => !(await existeTabla(con, 'tokens_verificacion')),
    aplicar: async (con) => {
      if (!(await existeColumna(con, 'usuarios', 'correo_verificado_en'))) {
        await con.q('ALTER TABLE usuarios ADD COLUMN correo_verificado_en DATETIME NULL AFTER bloqueado_hasta, ADD COLUMN eliminado_en DATETIME NULL AFTER correo_verificado_en');
      }
      await con.q('UPDATE usuarios SET correo_verificado_en = creado_en WHERE correo_verificado_en IS NULL');
      await con.q(sentenciaDelScript('CREATE TABLE tokens_verificacion'));
    },
  },
  {
    nombre: 'aviso de privacidad 2.0 con derechos ARCO',
    falta: async (con) => !(await con.uno("SELECT 1 AS si FROM avisos_privacidad WHERE version = '2.0'")),
    aplicar: (con) => con.q(sentenciaDelScript("INSERT INTO avisos_privacidad (version, texto_es, texto_en, vigente_desde) VALUES\n  ('2.0'")),
  },
  {
    nombre: 'ciclo oficial con el monto y el calendario publicados (Gaceta Oficial e IECM)',
    falta: async (con) => {
      const { PP_2026 } = require('./datosOficiales');
      const c = await con.uno("SELECT id, presupuesto_total FROM ciclos WHERE tipo = 'oficial' AND nombre = ? AND estado <> 'cerrado' AND votacion_abierta = FALSE LIMIT 1", [PP_2026.nombre]);
      if (!c) return false;
      const fases = await con.q("SELECT f.clave, DATE_FORMAT(cf.fecha_inicio, '%Y-%m-%d') AS ini, DATE_FORMAT(cf.fecha_fin, '%Y-%m-%d') AS fin FROM ciclo_fases cf JOIN fases f ON f.id = cf.fase_id WHERE cf.ciclo_id = ?", [c.id]);
      const distinta = Object.entries(PP_2026.fases).some(([k, [ini, fin]]) => !fases.some((f) => f.clave === k && f.ini === ini && f.fin === fin));
      const suma = await con.uno('SELECT COALESCE(SUM(presupuesto_asignado), 0) AS s FROM ciclo_unidades WHERE ciclo_id = ?', [c.id]);
      return distinta || Number(c.presupuesto_total) === 1500000000 || Math.abs(Number(suma.s) - Number(c.presupuesto_total)) > 1;
    },
    aplicar: async (con) => {
      const { PP_2026, repartirOficial } = require('./datosOficiales');
      const c = await con.uno("SELECT id FROM ciclos WHERE tipo = 'oficial' AND nombre = ? AND estado <> 'cerrado' AND votacion_abierta = FALSE LIMIT 1", [PP_2026.nombre]);
      const catalogo = await con.q('SELECT id, clave FROM fases');
      await con.transaccion(async () => {
        for (const f of catalogo) {
          const r = PP_2026.fases[f.clave];
          if (!r) continue;
          await con.q(`INSERT INTO ciclo_fases (ciclo_id, fase_id, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE fecha_inicio = VALUES(fecha_inicio), fecha_fin = VALUES(fecha_fin)`, [c.id, f.id, r[0], r[1]]);
        }
        await repartirOficial(con, c.id);
      });
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
