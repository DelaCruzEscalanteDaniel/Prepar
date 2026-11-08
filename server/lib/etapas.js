'use strict';

const UMBRAL_ALERTA = 40;

const SQL_ETAPAS = `
  SELECT p.id AS proyecto_id, e.id, e.orden, e.nombre_es, e.nombre_en, e.peso, ep.cumplida_en, ep.evidencia
  FROM proyectos p
  JOIN etapas_rubro e ON (e.rubro_id = p.rubro_id
        OR (e.rubro_id IS NULL AND NOT EXISTS (SELECT 1 FROM etapas_rubro x WHERE x.rubro_id = p.rubro_id)))
  LEFT JOIN etapas_proyecto ep ON ep.proyecto_id = p.id AND ep.etapa_id = e.id`;

function limpiar(f) {
  return {
    id: Number(f.id), orden: Number(f.orden), nombre_es: f.nombre_es, nombre_en: f.nombre_en, peso: Number(f.peso),
    cumplida_en: f.cumplida_en || null, evidencia: f.evidencia || null,
  };
}

async function etapasDe(con, proyectoId) {
  const filas = await con.q(`${SQL_ETAPAS} WHERE p.id = ? ORDER BY e.orden`, [proyectoId]);
  return filas.map(limpiar);
}

async function etapasDeVarios(con, ids) {
  const mapa = new Map(ids.map((id) => [Number(id), []]));
  if (!ids.length) return mapa;
  const filas = await con.q(`${SQL_ETAPAS} WHERE p.id IN (?) ORDER BY p.id, e.orden`, [ids]);
  for (const f of filas) mapa.get(Number(f.proyecto_id)).push(limpiar(f));
  return mapa;
}

function porcentaje(etapas) {
  const suma = etapas.filter((e) => e.cumplida_en).reduce((t, e) => t + e.peso, 0);
  return Math.min(100, Math.round(suma * 100) / 100);
}

function avanceFinanciero(monto, costo, presupuesto) {
  const base = Number(costo) > 0 ? Number(costo) : Number(presupuesto);
  if (!(base > 0)) return 0;
  return Math.round(Math.min(999, (Number(monto) / base) * 100) * 10) / 10;
}

function alerta(fisico, financiero) {
  return Number(financiero) - Number(fisico) >= UMBRAL_ALERTA;
}

async function rellenarAnteriores(con) {
  const previos = await con.q(
    `SELECT p.id, p.avance_porcentaje FROM proyectos p
     WHERE p.avance_porcentaje > 0 AND NOT EXISTS (SELECT 1 FROM etapas_proyecto ep WHERE ep.proyecto_id = p.id)`);
  let total = 0;
  for (const p of previos) {
    const etapas = await etapasDe(con, p.id);
    let acumulado = 0;
    for (const e of etapas) {
      if (acumulado + e.peso > Number(p.avance_porcentaje) + 0.001) break;
      acumulado += e.peso;
      await con.q('INSERT INTO etapas_proyecto (proyecto_id, etapa_id, evidencia) VALUES (?, ?, ?)',
        [p.id, e.id, `Avance registrado antes de usar etapas (${Number(p.avance_porcentaje)} %)`]);
      total += 1;
    }
  }
  return total;
}

module.exports = { UMBRAL_ALERTA, etapasDe, etapasDeVarios, porcentaje, avanceFinanciero, alerta, rellenarAnteriores };
