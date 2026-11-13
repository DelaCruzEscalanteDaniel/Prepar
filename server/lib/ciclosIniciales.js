'use strict';
const db = require('../db');
const log = require('./log');
const { indicesDesdeApis } = require('./modo');

const PARAMETRO = 'ciclos_iniciales_creados';
const ESPERA_SIN_COLONIAS_MS = 30 * 60 * 1000;
const inicio = Date.now();

const PRACTICA = {
  nombre: 'Ciclo de práctica (simulación)',
  presupuesto: 120000000,
  inicioDiasAtras: 7,
  dias: { convocatoria: 7, diagnostico_registro: 21, dictaminacion: 14, sorteo_difusion: 7, consulta: 7, resultados: 10, ejecucion_seguimiento: 90, evaluacion: 30 },
  faseActual: 'diagnostico_registro',
};

const fechaLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function calendarioPractica(hoy = new Date()) {
  const cal = {};
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - PRACTICA.inicioDiasAtras);
  for (const [clave, n] of Object.entries(PRACTICA.dias)) {
    const ini = new Date(d);
    d.setDate(d.getDate() + n - 1);
    cal[clave] = [fechaLocal(ini), fechaLocal(d)];
    d.setDate(d.getDate() + 1);
  }
  return cal;
}

async function crearCiclo(adminId, { nombre, anio, presupuesto, fases, alcaldias, tipo = 'practica' }) {
  return db.conUsuario(adminId, (con) => con.transaccion(async () => {
    const r = await con.call('sp_crear_ciclo', [nombre, anio, presupuesto, alcaldias, null, 'manual']);
    const id = r[0].ciclo_id;
    await con.q('UPDATE ciclos SET tipo = ? WHERE id = ?', [tipo, id]);
    const catalogo = await con.q('SELECT id, clave FROM fases');
    for (const f of catalogo) {
      const rango = fases[f.clave];
      if (rango) await con.q('INSERT INTO ciclo_fases (ciclo_id, fase_id, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?)', [id, f.id, rango[0], rango[1]]);
    }
    await indicesDesdeApis(con, id);
    return id;
  }));
}

async function limpiarDuplicados() {
  return db.conSistema(async (con) => {
    const filas = await con.q(
      `SELECT c.id, c.nombre, c.tipo, c.estado, c.pausado_en,
              (SELECT COUNT(*) FROM ciclo_fases cf WHERE cf.ciclo_id = c.id) AS nf,
              (SELECT COUNT(*) FROM ciclo_unidades cu WHERE cu.ciclo_id = c.id) AS nu,
              (SELECT COUNT(*) FROM ciclo_unidades cu WHERE cu.ciclo_id = c.id AND cu.presupuesto_asignado IS NULL) AS sin_presupuesto,
              (SELECT COUNT(*) FROM proyectos p WHERE p.ciclo_id = c.id) AS np,
              (SELECT COUNT(*) FROM participaciones pa WHERE pa.ciclo_id = c.id) AS nv
       FROM ciclos c WHERE c.nombre = ? ORDER BY c.id`, [PRACTICA.nombre]);
    let borrados = 0;
    for (const nombre of [PRACTICA.nombre]) {
      const grupo = filas.filter((f) => f.nombre === nombre);
      const completo = (f) => Number(f.nf) >= 8 && Number(f.nu) > 0 && !Number(f.sin_presupuesto);
      const usado = (f) => f.estado !== 'borrador' || f.pausado_en || Number(f.np) || Number(f.nv);
      const conservar = grupo.find(usado) || grupo.find(completo);
      for (const f of grupo) {
        if (f === conservar || usado(f)) continue;
        await con.q("DELETE FROM ciclos WHERE id = ? AND estado = 'borrador' AND pausado_en IS NULL", [f.id]);
        borrados += 1;
      }
    }
    if (borrados) log.info(`Se eliminaron ${borrados} borrador(es) incompletos o repetidos de los ciclos iniciales`);
    return borrados;
  });
}

const marcar = (clave, desc) => db.conSistema((con) => con.q(
  "INSERT IGNORE INTO parametros_sistema (clave, valor, tipo, descripcion) VALUES (?, 'true', 'booleano', ?)", [clave, desc]));
const marcado = async (clave) => !!(await db.conSistema((con) => con.uno('SELECT valor FROM parametros_sistema WHERE clave = ?', [clave])));

async function datosBase({ forzar }) {
  const admin = await db.conSistema((con) => con.uno("SELECT id FROM usuarios WHERE rol = 'administrador' AND estado = 'activa' ORDER BY id LIMIT 1"));
  if (!admin) return { motivo: 'No hay un Administrador activo' };
  const col = await db.conSistema((con) => con.uno(
    "SELECT activa, ultima_sincronizacion_exitosa AS ok FROM fuentes_externas WHERE clave = 'datos_cdmx_unidades'"));
  if (!forzar && col && col.activa && !col.ok && Date.now() - inicio < ESPERA_SIN_COLONIAS_MS) return { motivo: 'Esperando a que se sincronicen las colonias' };
  const alc = await db.conSistema((con) => con.q(
    'SELECT DISTINCT alcaldia_id AS id FROM unidades_territoriales WHERE activa ORDER BY alcaldia_id'));
  if (!alc.length) return { motivo: 'Todavía no hay colonias cargadas. Sincroniza «Colonias» en Datos abiertos' };
  return { admin, alcaldias: alc.map((a) => a.id).join(',') };
}

async function crearPracticaInicial() {
  const hay = await db.conSistema((con) => con.uno("SELECT COUNT(*) AS n FROM ciclos"));
  if (hay.n > 0) { await marcar(PARAMETRO, 'Se crearon los ciclos iniciales'); return; }
  const base = await datosBase({ forzar: false });
  if (!base.admin) return;
  const hoy = new Date();
  const id = await crearCiclo(base.admin.id, {
    nombre: PRACTICA.nombre, anio: hoy.getFullYear(), presupuesto: PRACTICA.presupuesto, fases: calendarioPractica(hoy), alcaldias: base.alcaldias,
  });
  const activo = await db.conSistema((con) => con.uno("SELECT id FROM ciclos WHERE estado = 'activo'"));
  if (!activo) await db.conUsuario(base.admin.id, (con) => con.call('sp_cambiar_fase', [id, PRACTICA.faseActual]));
  await marcar(PARAMETRO, 'Se crearon los ciclos iniciales');
  log.info(`Se creó el ciclo «${PRACTICA.nombre}»${activo ? '' : ' (activo)'}`);
}

let ocupado = false;
async function asegurar() {
  if (ocupado) return;
  ocupado = true;
  try {
    await limpiarDuplicados();
    if (!(await marcado(PARAMETRO))) await crearPracticaInicial();
  } catch (e) {
    log.tarea('No se pudieron crear los ciclos iniciales:', e);
  } finally {
    ocupado = false;
  }
}

module.exports = { asegurar, limpiarDuplicados, calendarioPractica, PRACTICA };
