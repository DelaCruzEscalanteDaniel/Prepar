'use strict';

const PP_2026 = {
  nombre: 'Presupuesto Participativo 2026-2027 (IECM)',
  anio: 2026,
  monto: 2304009505,
  porcentajePartesIguales: 50,
  porAlcaldia: {
    AOB: 169851554, AZC: 105692410, BJU: 119723488, COY: 150476181, CUJ: 95570610, CUH: 178543729,
    GAM: 253579110, IZC: 111118475, IZP: 310927942, MAC: 93501190, MHI: 129087794, MAL: 82486009,
    TLH: 96745454, TLP: 145674186, VCA: 148550844, XOC: 112480529,
  },
  nombres: {
    AOB: 'Álvaro Obregón', AZC: 'Azcapotzalco', BJU: 'Benito Juárez', COY: 'Coyoacán', CUJ: 'Cuajimalpa de Morelos', CUH: 'Cuauhtémoc',
    GAM: 'Gustavo A. Madero', IZC: 'Iztacalco', IZP: 'Iztapalapa', MAC: 'La Magdalena Contreras', MHI: 'Miguel Hidalgo', MAL: 'Milpa Alta',
    TLH: 'Tláhuac', TLP: 'Tlalpan', VCA: 'Venustiano Carranza', XOC: 'Xochimilco',
  },
  fases: {
    convocatoria: ['2026-01-12', '2026-01-24'],
    diagnostico_registro: ['2026-01-25', '2026-03-01'],
    dictaminacion: ['2026-03-02', '2026-03-24'],
    sorteo_difusion: ['2026-03-25', '2026-04-19'],
    consulta: ['2026-04-20', '2026-05-03'],
    resultados: ['2026-05-04', '2026-06-30'],
    ejecucion_seguimiento: ['2026-07-01', '2027-08-26'],
    evaluacion: ['2027-08-27', '2027-12-31'],
  },
};

const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function claveOficial(alcaldia) {
  if (PP_2026.porAlcaldia[alcaldia.clave]) return alcaldia.clave;
  const n = sinAcentos(alcaldia.nombre);
  return Object.keys(PP_2026.nombres).find((k) => sinAcentos(PP_2026.nombres[k]) === n) || null;
}

async function repartirOficial(con, cicloId) {
  const filas = await con.q(
    `SELECT cu.unidad_territorial_id AS ut, a.id AS alcaldia_id, a.clave, a.nombre, cu.poblacion, cu.poblacion_flotante,
            cu.indice_pobreza, cu.indice_delictivo, cu.es_pueblo_originario
     FROM ciclo_unidades cu JOIN unidades_territoriales u ON u.id = cu.unidad_territorial_id JOIN alcaldias a ON a.id = u.alcaldia_id
     WHERE cu.ciclo_id = ?`, [cicloId]);
  const grupos = new Map();
  for (const f of filas) {
    const clave = claveOficial(f);
    if (!clave) continue;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(f);
  }
  const pct = PP_2026.porcentajePartesIguales / 100;
  const asignado = [];
  let total = 0;
  for (const [clave, uts] of grupos) {
    const montoCent = PP_2026.porAlcaldia[clave] * 100;
    const maxPob = Math.max(0, ...uts.map((u) => Number(u.poblacion) || 0));
    const maxFlot = Math.max(0, ...uts.map((u) => Number(u.poblacion_flotante) || 0));
    const peso = (u) => ((Number(u.indice_pobreza) || 0) + (Number(u.indice_delictivo) || 0)
      + (maxPob ? (Number(u.poblacion) || 0) / maxPob : 0) + (maxFlot ? (Number(u.poblacion_flotante) || 0) / maxFlot : 0)
      + (Number(u.es_pueblo_originario) ? 1 : 0)) / 5;
    const suma = uts.reduce((s, u) => s + peso(u), 0);
    const cent = uts.map((u) => Math.floor(montoCent * pct / uts.length
      + (suma > 0 ? montoCent * (1 - pct) * peso(u) / suma : montoCent * (1 - pct) / uts.length)));
    let resto = montoCent - cent.reduce((s, c) => s + c, 0);
    const orden = cent.map((c, i) => i).sort((a, b) => cent[b] - cent[a]);
    for (let k = 0; resto > 0; k = (k + 1) % orden.length, resto -= 1) cent[orden[k]] += 1;
    uts.forEach((u, i) => asignado.push([u.ut, cent[i] / 100]));
    total += PP_2026.porAlcaldia[clave];
  }
  if (!asignado.length) return { total: 0, alcaldias: 0 };
  await con.q(
    `UPDATE ciclo_unidades cu JOIN JSON_TABLE(?, '$[*]' COLUMNS (ut INT PATH '$[0]', monto DECIMAL(14,2) PATH '$[1]')) j
       ON j.ut = cu.unidad_territorial_id
     SET cu.presupuesto_asignado = j.monto WHERE cu.ciclo_id = ?`, [JSON.stringify(asignado), cicloId]);
  await con.q('UPDATE ciclos SET presupuesto_total = ?, porcentaje_partes_iguales = ? WHERE id = ?', [total, PP_2026.porcentajePartesIguales, cicloId]);
  return { total, alcaldias: grupos.size };
}

module.exports = { PP_2026, repartirOficial, claveOficial };
