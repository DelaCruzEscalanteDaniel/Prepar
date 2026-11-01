'use strict';
const crypto = require('crypto');
const db = require('../db');
const log = require('./log');
const ckan = require('./ckan');
const geo = require('./geo');

const sinAcentos = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s) => sinAcentos(s).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const base = (s) => norm(s).replace(/^(COLONIA|COL|BARRIO|BO|PUEBLO|PBLO|FRACC|FRACCIONAMIENTO)\s+/, '')
  .replace(/\s+(I|II|III|IV|V|VI|VII|VIII|IX|X|\d+)$/, '').trim();

function titulo(s) {
  const t = String(s || '').trim().replace(/\s+/g, ' ');
  if (!t || t !== t.toUpperCase()) return t;
  const menores = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en', 'a']);
  return t.toLowerCase().split(' ').map((w, i) => {
    if (/^(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/.test(w)) return w.toUpperCase();
    if (i > 0 && menores.has(w)) return w;
    return w.replace(/^([^a-zñáéíóúü]*)([a-zñáéíóúü])/, (m, a, b) => a + b.toUpperCase());
  }).join(' ');
}

const llave = (k) => sinAcentos(String(k).replace(/,[a-z],\d+(,\d+)?$/i, '')).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const huella = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 16);

function campo(reg, candidatos) {
  const llaves = Object.keys(reg);
  for (const c of candidatos) {
    const k = llaves.find((x) => x.toLowerCase() === c || llave(x) === c);
    if (k && reg[k] !== null && reg[k] !== undefined && String(reg[k]).trim() !== '') return reg[k];
  }
  return null;
}

function numero(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function punto(reg) {
  const gp = campo(reg, ['geo_point_2d', 'geopoint', 'punto']);
  if (gp && typeof gp === 'object' && !Array.isArray(gp)) {
    const lat = numero(gp.lat ?? gp.latitude);
    const lng = numero(gp.lon ?? gp.lng ?? gp.longitude);
    if (lat !== null && lng !== null) return { lat, lng };
  } else if (gp) {
    const partes = String(Array.isArray(gp) ? gp.join(',') : gp)
      .replace(/[[\]{}"a-z:]/gi, ' ').split(/[ ,;]+/).filter((x) => x !== '').map(Number).filter(Number.isFinite);
    if (partes.length >= 2) return { lat: partes[0], lng: partes[1] };
  }
  const lat = numero(campo(reg, ['latitud', 'lat', 'latitude', 'y']));
  const lng = numero(campo(reg, ['longitud', 'lon', 'lng', 'longitude', 'x']));
  return lat !== null && lng !== null ? { lat, lng } : null;
}

const enRango = (p) => p && p.lat >= -90 && p.lat <= 90 && p.lng >= -180 && p.lng <= 180;
const r6 = (x) => Math.round(x * 1e6) / 1e6;

const C = {
  nombreUt: ['nomut', 'nom_ut', 'nombre_ut', 'nombre', 'nom_col', 'colonia', 'nombre_col', 'nom_colonia', 'nomb_col', 'nombre_colonia'],
  claveUt: ['cveut', 'cve_ut', 'clave_ut', 'cve_col', 'clave_col', 'id_ut', 'clave', 'cve_colonia'],
  nombreAlc: ['nomdt', 'nom_dt', 'alcaldia', 'nom_alc', 'alc', 'delegacion', 'nom_mun', 'municipio', 'nomgeo', 'demarcacion', 'nom_del', 'alcaldia_nombre'],
  codigoAlc: ['cvedt', 'cve_dt', 'cve_alc', 'cve_mun', 'cve_del', 'cve_dem', 'id_alc'],
  tipoUt: ['tipo', 'clasif', 'tipo_ut', 'clasificacion', 'tipo_col', 'tipo_colonia'],
  lat: ['latitud', 'lat', 'latitude', 'y'],
  lng: ['longitud', 'lon', 'lng', 'longitude', 'x'],
  punto: ['geo_point_2d', 'geopoint', 'punto'],
  forma: ['geo_shape', 'geometry', 'geojson', 'geom', 'the_geom', 'shape'],
  anio: ['anio_inicio', 'ao_inicio', 'anio_hecho', 'anio', 'año', 'ano', 'periodo', 'year'],
  coloniaDelito: ['colonia_catalogo', 'colonia_hecho', 'colonia_datos', 'colonia'],
  alcaldiaDelito: ['alcaldia_catalogo', 'alcaldia_hecho', 'alcaldia'],
  ids: ['ids', 'ids_2020', 'ids2020', 'ids_2015', 'ids2015', 'ids_2010', 'ids2010', 'ids_ut', 'ids_ut_2020', 'indice_ds', 'ind_ds', 'indice_desarrollo_social',
    'indice_de_desarrollo_social', 'valor_ids', 'ids_valor', 'idsocial', 'ids_col', 'ids_cdmx', 'valor_del_ids', 'ids_total', 'idsm', 'ids_m'],
  estrato: ['estrato', 'estrato_ids', 'estrato_2020', 'grado', 'grado_ids', 'grado_de_desarrollo', 'grado_de_desarrollo_social', 'nivel_ids', 'nivel_de_desarrollo', 'estrato_de_desarrollo', 'e_idsm', 'e_ids_v', 'e_ids', 'estrato_idsm'],
  poblacion: ['pob_tot', 'pobtot', 'poblacion', 'pob_total', 'poblacion_total', 'pob'],
  telefono: ['telefono', 'tel', 'telefonos', 'telefono_1'],
  direccion: ['direccion', 'domicilio', 'ubicacion', 'calle'],
  idExterno: ['id', 'objectid', 'fid', 'gid', 'id_registro'],
};
const tiene = (campos, lista) => lista.some((c) => campos.includes(c));
const elegir = (mapa, lista) => { for (const c of lista) if (mapa[c]) return mapa[c]; return null; };

const PERFILES = {
  datos_cdmx_alcaldias: {
    conjuntos: ['limite-de-las-alcaldias', 'alcaldias', 'limites-de-alcaldias', 'alcaldias-cdmx'],
    busquedas: ['limite de las alcaldias', 'alcaldias'],
    tipos: ['geojson', 'datastore'],
    valida: (c) => tiene(c, [...C.nombreAlc, 'nombre']) && tiene(c, [...C.forma, ...C.punto, ...C.lat]),
  },
  datos_cdmx_unidades: {
    conjuntos: ['colonias-del-iecm-2022', 'coloniascdmx', 'colonias-del-iecm-2019', 'unidades-territoriales'],
    busquedas: ['colonias IECM', 'colonias unidades territoriales', 'colonias'],
    tipos: ['geojson', 'datastore'],
    valida: (c) => tiene(c, C.nombreUt) && (tiene(c, C.nombreAlc) || tiene(c, C.codigoAlc)),
  },
  datos_cdmx_delitos: {
    conjuntos: ['carpetas-de-investigacion-fgj-de-la-ciudad-de-mexico', 'carpetas-de-investigacion-pgj-de-la-ciudad-de-mexico',
      'carpetas-de-investigacion-pgj-cdmx'],
    busquedas: ['carpetas de investigacion FGJ', 'carpetas de investigacion'],
    tipos: ['datastore'],
    valida: (c) => tiene(c, C.anio) && ((tiene(c, C.lat) && tiene(c, C.lng)) || tiene(c, C.coloniaDelito)),
  },
  indice_desarrollo_social: {
    conjuntos: ['indice-de-desarrollo-social-de-la-ciudad-de-mexico-2020', 'indice-de-desarrollo-social-ids-2020-a-nivel-unidad-territorial', 'indice-de-desarrollo-social-de-la-ciudad-de-mexico',
      'indice-de-desarrollo-social', 'indice-de-desarrollo-social-de-la-ciudad-de-mexico-2015', 'indice-de-desarrollo-social-por-colonia',
      'indice-de-desarrollo-social-ids', 'indice-de-desarrollo-social-por-unidad-territorial'],
    busquedas: ['IDS 2020 a nivel Unidad Territorial', 'indice de desarrollo social', 'Índice de Desarrollo Social de la Ciudad de México', 'desarrollo social Evalua', 'IDS Evalua'],
    tipos: ['datastore', 'csv', 'geojson'],
    preferir: /unidad(es)?\s+territorial/i,
    descartar: (p) => /\s[-–]\s*[íi]ndice de desarrollo social/i.test(sinAcentos(String((p && p.title) || ''))),
    valida: (c) => (tiene(c, C.ids) || tiene(c, C.estrato)) && (tiene(c, C.nombreUt) || tiene(c, C.claveUt) || tiene(c, C.punto)
      || tiene(c, C.forma) || (tiene(c, C.lat) && tiene(c, C.lng))),
  },
  directorio_alcaldias: {
    conjuntos: ['directorio-de-alcaldias', 'directorio-alcaldias', 'directorio-de-las-alcaldias'],
    busquedas: ['directorio alcaldias', 'directorio de funcionarios alcaldias', 'atencion ciudadana alcaldias'],
    tipos: ['datastore'],
    valida: (c) => (tiene(c, C.telefono) || tiene(c, C.direccion)) && (tiene(c, C.nombreAlc) || tiene(c, C.codigoAlc)),
  },
};
const ORDEN = ['datos_cdmx_alcaldias', 'datos_cdmx_unidades', 'indice_desarrollo_social', 'datos_cdmx_delitos', 'directorio_alcaldias'];

const esUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ''));
const esDatastore = (r) => r && (r.datastore_active === true || String(r.datastore_active).toLowerCase() === 'true');
const esCsv = (r) => r && !esDatastore(r) && r.url && (/csv/i.test(String(r.format || '')) || /\.csv(\?|$)/i.test(String(r.url || '')));
const esTipo = (t, r) => (t === 'datastore' ? esDatastore(r) : (t === 'csv' ? esCsv(r) : esGeojson(r)));
const esGeojson = (r) => r && (/geo\s*json/i.test(String(r.format || '')) || /\.geojson(\?|$)/i.test(String(r.url || '')));
const esFallaDeRed = (e) => !(e instanceof ckan.ErrorCkan) || (!e.estado && !e.noEncontrado) || e.estado >= 500;

function anioEn(texto) {
  const m = String(texto || '').match(/20\d\d/g);
  return m ? Math.max(...m.map(Number)) : 0;
}

function recursosDe(paquete, perfil) {
  const lista = [];
  for (const r of (paquete && paquete.resources) || []) {
    const tipo = perfil.tipos.find((t) => esTipo(t, r));
    if (!tipo) continue;
    if (/diccionario/i.test(sinAcentos(`${r.name || ''} ${r.description || ''}`))) continue;
    lista.push({ r, tipo, paquete });
  }
  const pref = (x) => (perfil.preferir && perfil.preferir.test(sinAcentos(`${x.r.name || ''} ${x.r.description || ''}`)) ? 0 : 1);
  const fecha = (x) => Date.parse(x.r.last_modified || x.r.metadata_modified || x.r.created || '') || 0;
  return lista.sort((a, b) => (pref(a) - pref(b)) || (perfil.tipos.indexOf(a.tipo) - perfil.tipos.indexOf(b.tipo))
    || (anioEn(`${b.r.name} ${b.r.description || ''}`) - anioEn(`${a.r.name} ${a.r.description || ''}`))
    || (fecha(b) - fecha(a)));
}

function deGeojson(texto) {
  let obj;
  try { obj = JSON.parse(texto); } catch { throw new ckan.ErrorCkan('El archivo GeoJSON del portal no es válido'); }
  const feats = obj && Array.isArray(obj.features) ? obj.features : [];
  return feats.map((f, i) => ({ ...(f && f.properties ? f.properties : {}), geo_shape: f && f.geometry ? f.geometry : null, _fid: f && f.id !== undefined ? f.id : i }));
}

function deCsv(texto) {
  const filas = [];
  const primera = texto.slice(0, texto.indexOf('\n') > 0 ? texto.indexOf('\n') : texto.length);
  const sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : ',';
  let fila = [];
  let celda = '';
  let comillas = false;
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { celda += '"'; i += 1; } else if (c === '"') comillas = false; else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(celda); celda = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i += 1;
      fila.push(celda); celda = '';
      if (fila.some((x) => x.trim() !== '')) filas.push(fila);
      fila = [];
    } else celda += c;
  }
  fila.push(celda);
  if (fila.some((x) => x.trim() !== '')) filas.push(fila);
  if (filas.length < 2) return [];
  const cab = filas[0].map((h) => h.trim());
  return filas.slice(1).map((f, i) => {
    const o = { _fid: i };
    cab.forEach((h, j) => { if (h) o[h] = f[j] === undefined ? null : f[j].trim(); });
    return o;
  });
}

async function probar(raiz, cand, perfil) {
  const { r, tipo, paquete } = cand;
  const nombre = `${(paquete && paquete.title) || ''} ${r.name || ''}`.trim();
  if (tipo === 'datastore') {
    const info = await ckan.accion(raiz, 'datastore_search', { resource_id: r.id, limit: 0, include_total: true });
    const campos = {};
    const tipos = {};
    for (const f of info.fields || []) {
      if (!f || !f.id || f.id === '_id' || f.id === '_full_text') continue;
      campos[f.id.toLowerCase()] = f.id;
      tipos[f.id.toLowerCase()] = f.type || 'text';
      if (!campos[llave(f.id)]) { campos[llave(f.id)] = f.id; tipos[llave(f.id)] = f.type || 'text'; }
    }
    if (!perfil.valida(Object.keys(campos))) return null;
    return { tipo, id: r.id, nombre, campos, tipos, total: info.total };
  }
  const texto = await ckan.descargarTexto(r.url);
  const registros = tipo === 'csv' ? deCsv(texto) : deGeojson(texto);
  const llaves = new Set();
  for (const x of registros.slice(0, 50)) for (const k of Object.keys(x)) if (x[k] !== null) { llaves.add(k.toLowerCase()); llaves.add(llave(k)); }
  if (!registros.length || !perfil.valida([...llaves])) return null;
  return { tipo, id: r.id, nombre, registros };
}

async function resolver(raiz, fuente, perfil) {
  const conjuntos = [...perfil.conjuntos];
  if (fuente.recurso && esUuid(fuente.recurso)) {
    try {
      const r = await ckan.accion(raiz, 'resource_show', { id: fuente.recurso });
      const tipo = perfil.tipos.find((t) => esTipo(t, r));
      if (tipo) {
        const res = await probar(raiz, { r, tipo, paquete: null }, perfil);
        if (res) return { recurso: res, cambio: false };
      }
      log.aviso(`La fuente ${fuente.clave} tenía un recurso que ya no sirve; se buscará otro`);
    } catch (e) {
      if (esFallaDeRed(e)) throw e;
    }
  } else if (fuente.recurso) {
    conjuntos.unshift(String(fuente.recurso).trim());
  }
  const vistos = new Set();
  const intentar = async (paquete) => {
    if (!paquete || vistos.has(paquete.id || paquete.name)) return null;
    if (perfil.descartar && perfil.descartar(paquete)) return null;
    vistos.add(paquete.id || paquete.name);
    for (const cand of recursosDe(paquete, perfil)) {
      try {
        const res = await probar(raiz, cand, perfil);
        if (res) return res;
      } catch (e) {
        if (esFallaDeRed(e)) throw e;
      }
    }
    return null;
  };
  for (const id of conjuntos) {
    let paquete = null;
    try { paquete = await ckan.accion(raiz, 'package_show', { id }); } catch (e) { if (esFallaDeRed(e)) throw e; }
    const res = await intentar(paquete);
    if (res) return { recurso: res, cambio: true };
  }
  for (const q of perfil.busquedas) {
    let r = null;
    try { r = await ckan.accion(raiz, 'package_search', { q, rows: 20 }); } catch (e) { if (esFallaDeRed(e)) throw e; }
    for (const paquete of (r && r.results) || []) {
      const res = await intentar(paquete);
      if (res) return { recurso: res, cambio: true };
    }
  }
  throw new ckan.ErrorCkan('No se encontró en el portal un conjunto de datos con la información necesaria. '
    + 'Puedes indicar el id del recurso en "Configurar"');
}

async function registrosDatastore(raiz, id, { fields, filters, max = 60000, porPagina = 5000 } = {}) {
  const salida = [];
  for (let offset = 0; offset < max; offset += porPagina) {
    const r = await ckan.accion(raiz, 'datastore_search', {
      resource_id: id, limit: porPagina, offset, include_total: false,
      fields: fields ? fields.join(',') : undefined, filters,
    });
    const lote = Array.isArray(r.records) ? r.records : [];
    salida.push(...lote);
    if (lote.length < porPagina) break;
  }
  return salida;
}

const comillas = (c) => `"${String(c).replace(/"/g, '""')}"`;

async function datosDelitos(raiz, res) {
  const F = res.campos;
  const fAnio = elegir(F, C.anio);
  const fLat = elegir(F, C.lat);
  const fLng = elegir(F, C.lng);
  const fCol = elegir(F, C.coloniaDelito);
  const fAlc = elegir(F, C.alcaldiaDelito);
  if (!/^[A-Za-z0-9_-]+$/.test(res.id)) throw new ckan.ErrorCkan('Id de recurso no válido');
  const tabla = comillas(res.id);
  const actual = new Date().getFullYear();
  let sqlOk = true;
  let max = null;
  try {
    const r = await ckan.accion(raiz, 'datastore_search_sql', { sql: `SELECT MAX(CAST(${comillas(fAnio)} AS text)) AS m FROM ${tabla}` }, { timeout: 120000 });
    max = Number.parseInt(r.records && r.records[0] && r.records[0].m, 10);
  } catch (e) {
    if (esFallaDeRed(e) && !(e instanceof ckan.ErrorCkan && e.estado)) throw e;
    sqlOk = false;
  }
  if (!Number.isFinite(max)) {
    const r = await ckan.accion(raiz, 'datastore_search', { resource_id: res.id, limit: 1, sort: `${fAnio} desc`, fields: fAnio, include_total: false });
    max = Number.parseInt(r.records && r.records[0] && r.records[0][fAnio], 10);
  }
  if (!Number.isFinite(max) || max < 2000) throw new ckan.ErrorCkan('No se pudo identificar el año más reciente de las carpetas');
  max = Math.min(max, actual);
  const opciones = max >= actual ? [actual - 1, max] : [max];
  const numerico = /int|num|float|double/i.test(res.tipos[fAnio.toLowerCase()] || '');
  const regla = (c) => `CASE WHEN CAST(${comillas(c)} AS text) ~ '^ *-?[0-9]+(\\.[0-9]+)? *$' THEN ROUND(CAST(TRIM(CAST(${comillas(c)} AS text)) AS numeric), 3) END`;
  for (const periodo of opciones) {
    const grupos = new Map();
    const sumar = (la, lo, a, c, n) => {
      const k = `${la}|${lo}|${a}|${c}`;
      const g = grupos.get(k);
      if (g) g.n += n; else grupos.set(k, { la, lo, a, c, n });
    };
    let hecho = false;
    if (sqlOk) {
      try {
        const sel = [];
        if (fLat && fLng) sel.push(`${regla(fLat)} AS la`, `${regla(fLng)} AS lo`);
        sel.push(fAlc ? `${comillas(fAlc)} AS a` : 'NULL AS a', fCol ? `${comillas(fCol)} AS c` : 'NULL AS c');
        const pos = sel.map((_, i) => i + 1).join(', ');
        const PAG = 30000;
        for (let off = 0; off < 40 * PAG; off += PAG) {
          const sql = `SELECT ${sel.join(', ')}, COUNT(*) AS n FROM ${tabla} WHERE CAST(${comillas(fAnio)} AS text) = '${periodo}' `
            + `GROUP BY ${pos} ORDER BY ${pos} LIMIT ${PAG} OFFSET ${off}`;
          const r = await ckan.accion(raiz, 'datastore_search_sql', { sql }, { timeout: 180000 });
          const filas = r.records || [];
          for (const f of filas) sumar(numero(f.la), numero(f.lo), f.a || null, f.c || null, Number(f.n) || 0);
          if (filas.length < PAG) break;
        }
        hecho = true;
      } catch (e) {
        if (esFallaDeRed(e) && !(e instanceof ckan.ErrorCkan && e.estado)) throw e;
        sqlOk = false;
        grupos.clear();
      }
    }
    if (!hecho) {
      const fields = [fLat, fLng, fAlc, fCol].filter(Boolean);
      const PAG = 30000;
      for (let off = 0; off < 1200000; off += PAG) {
        const r = await ckan.accion(raiz, 'datastore_search', {
          resource_id: res.id, limit: PAG, offset: off, include_total: false, fields: fields.join(','),
          filters: { [fAnio]: numerico ? periodo : String(periodo) },
        }, { timeout: 180000 });
        const filas = r.records || [];
        for (const f of filas) {
          const la = fLat ? numero(f[fLat]) : null;
          const lo = fLng ? numero(f[fLng]) : null;
          sumar(la === null ? null : Math.round(la * 1000) / 1000, lo === null ? null : Math.round(lo * 1000) / 1000,
            fAlc ? f[fAlc] || null : null, fCol ? f[fCol] || null : null, 1);
        }
        if (filas.length < PAG) break;
      }
    }
    const lista = [...grupos.values()];
    const total = lista.reduce((s, g) => s + g.n, 0);
    if (total > 0) return { periodo, grupos: lista, total };
  }
  throw new ckan.ErrorCkan('El conjunto de carpetas no tiene registros del año más reciente');
}

async function obtener(fuente, perfil) {
  const raiz = ckan.raizApi(fuente.url_base);
  const { recurso, cambio } = await resolver(raiz, fuente, perfil);
  let datos;
  if (fuente.clave === 'datos_cdmx_delitos') datos = await datosDelitos(raiz, recurso);
  else if (recurso.tipo === 'geojson' || recurso.tipo === 'csv') datos = { registros: recurso.registros };
  else datos = { registros: await registrosDatastore(raiz, recurso.id) };
  return { ...datos, recurso, cambio };
}

const ALIAS_ALC = {
  AZC: ['AZCAPOTZALCO', 2], COY: ['COYOACAN', 3], CUJ: ['CUAJIMALPA DE MORELOS', 'CUAJIMALPA', 4],
  GAM: ['GUSTAVO A MADERO', 'GUSTAVO ADOLFO MADERO', 'GAM', 5], IZC: ['IZTACALCO', 6], IZP: ['IZTAPALAPA', 7],
  MAC: ['LA MAGDALENA CONTRERAS', 'MAGDALENA CONTRERAS', 8], MAL: ['MILPA ALTA', 9], AOB: ['ALVARO OBREGON', 10],
  TLH: ['TLAHUAC', 11], TLP: ['TLALPAN', 12], XOC: ['XOCHIMILCO', 13], BJU: ['BENITO JUAREZ', 14],
  CUH: ['CUAUHTEMOC', 15], MHI: ['MIGUEL HIDALGO', 16], VCA: ['VENUSTIANO CARRANZA', 17],
};

function resolutorAlcaldias(filas) {
  const porClave = new Map(filas.map((a) => [a.clave, a]));
  const porNombre = new Map(filas.map((a) => [norm(a.nombre), a]));
  const variantes = [];
  for (const [clave, al] of Object.entries(ALIAS_ALC)) {
    const a = porClave.get(clave);
    if (!a) continue;
    for (const x of al) {
      if (typeof x === 'number') variantes.push({ codigo: x, a });
      else variantes.push({ texto: x, a });
    }
  }
  variantes.sort((x, y) => (y.texto || '').length - (x.texto || '').length);
  return (valor) => {
    if (valor === null || valor === undefined || valor === '') return null;
    const s = String(valor).trim();
    if (/^\d{1,5}$/.test(s)) {
      const n = Number(s) % 1000;
      const v = variantes.find((x) => x.codigo === n);
      return v ? v.a : null;
    }
    const t = norm(s).replace(/^(ALCALDIA|DELEGACION|DEMARCACION TERRITORIAL)\s+/, '');
    if (porNombre.has(t)) return porNombre.get(t);
    if (porClave.has(t)) return porClave.get(t);
    const v = variantes.find((x) => x.texto && (x.texto === t || t.includes(x.texto)));
    return v ? v.a : null;
  };
}

function tipoUnidad(r, nombre) {
  const t = norm(`${campo(r, C.tipoUt) || ''} ${nombre}`);
  if (/\bPUEBLO\b/.test(t)) return 'pueblo_originario';
  if (/\bBARRIO\b/.test(t)) return 'barrio';
  if (/\bU ?HAB\b|UNIDAD HABITACIONAL|\bUH\b/.test(t)) return 'unidad_habitacional';
  return 'colonia';
}

function sinGeometria(r) {
  const o = {};
  for (const [k, v] of Object.entries(r)) if (!C.forma.includes(k.toLowerCase()) && k !== '_fid') o[k] = v;
  return JSON.stringify(o).slice(0, 200000);
}

async function registrarError(con, sync, idExt, mensaje, r) {
  await con.call('sp_sync_error', [sync, idExt ? String(idExt).slice(0, 100) : null, String(mensaje).slice(0, 500),
    r ? JSON.stringify(r).slice(0, 100000) : null]).catch(() => {});
}

async function guardarAlcaldias(con, sync, registros) {
  const alc = resolutorAlcaldias(await con.q('SELECT id, clave, nombre FROM alcaldias'));
  for (const r of registros) {
    const nombre = campo(r, [...C.nombreAlc, 'nombre']);
    const a = alc(nombre) || alc(campo(r, C.codigoAlc));
    if (!a) { await registrarError(con, sync, nombre, `Alcaldía no reconocida: ${nombre || '?'}`, null); continue; }
    const g = geo.geometria(campo(r, C.forma));
    let p = punto(r);
    if (!enRango(p) || !geo.enCdmx(p.lat, p.lng)) p = g ? geo.centro(g) : null;
    try {
      await con.call('sp_sync_alcaldia', [sync, a.clave, a.nombre, a.clave, p ? r6(p.lat) : null, p ? r6(p.lng) : null,
        g && g.type !== 'Point' ? JSON.stringify(g) : null, sinGeometria(r)]);
    } catch (e) { await registrarError(con, sync, a.clave, e.sqlMessage || e.message, null); }
  }
}

async function guardarUnidades(con, sync, registros) {
  const alc = resolutorAlcaldias(await con.q('SELECT id, clave, nombre FROM alcaldias'));
  const existentes = await con.q('SELECT id, clave, nombre, alcaldia_id, origen, id_externo FROM unidades_territoriales');
  const porNombre = new Map(existentes.map((u) => [`${u.alcaldia_id}|${norm(u.nombre)}`, u]));
  const claves = new Set(existentes.map((u) => u.clave));
  const enLote = new Set();
  for (const r of registros) {
    const nombreOrig = campo(r, C.nombreUt);
    const a = alc(campo(r, C.nombreAlc)) || alc(campo(r, C.codigoAlc));
    const claveDato = campo(r, C.claveUt);
    const idExt = String(claveDato || campo(r, C.idExterno) || r._fid || huella(JSON.stringify(r))).slice(0, 100);
    if (!nombreOrig || !a) {
      await registrarError(con, sync, idExt, !a ? `Alcaldía no reconocida: ${campo(r, C.nombreAlc) || campo(r, C.codigoAlc) || '?'}` : 'Registro sin nombre de colonia', null);
      continue;
    }
    let nombre = titulo(nombreOrig).slice(0, 100);
    let clave = String(claveDato || `${a.clave}-${huella(norm(nombre))}`).trim().slice(0, 20);
    const llave = `${a.id}|${norm(nombre)}`;
    const previa = porNombre.get(llave);
    if (previa && previa.origen === 'manual' && !previa.id_externo) clave = previa.clave;
    if (enLote.has(llave)) nombre = `${nombre} (${clave})`.slice(0, 100);
    enLote.add(llave);
    const g = geo.geometria(campo(r, C.forma));
    let p = punto(r);
    if (!enRango(p) || !geo.enCdmx(p.lat, p.lng)) p = g ? geo.centro(g) : null;
    if (p && !geo.enCdmx(p.lat, p.lng)) p = null;
    try {
      await con.call('sp_sync_unidad', [sync, idExt, a.nombre, clave, nombre, tipoUnidad(r, nombreOrig),
        p ? r6(p.lat) : null, p ? r6(p.lng) : null, g && g.type !== 'Point' ? JSON.stringify(g) : null, sinGeometria(r)]);
      claves.add(clave);
    } catch (e) {
      await registrarError(con, sync, idExt, e.sqlMessage || e.message, null);
    }
  }
}

async function cargarUnidades(con) {
  const filas = await con.q('SELECT id, clave, nombre, alcaldia_id, latitud, longitud, limite_geojson FROM unidades_territoriales WHERE activa');
  return filas.map((u) => {
    const g = geo.geometria(u.limite_geojson);
    const c = (u.latitud !== null && u.longitud !== null) ? { lat: Number(u.latitud), lng: Number(u.longitud) } : (g ? geo.centro(g) : null);
    return { id: u.id, clave: u.clave, nombre: u.nombre, alcaldiaId: u.alcaldia_id, geom: g && g.type !== 'Point' ? g : null, centro: c };
  });
}

function porNombreUnidad(unidades) {
  const exacto = new Map();
  const aprox = new Map();
  const add = (m, k, u) => { if (!m.has(k)) m.set(k, []); m.get(k).push(u); };
  for (const u of unidades) {
    add(exacto, `${u.alcaldiaId}|${norm(u.nombre)}`, u);
    add(aprox, `${u.alcaldiaId}|${base(u.nombre)}`, u);
  }
  return (alcaldiaId, nombre) => {
    if (!alcaldiaId || !nombre) return [];
    return exacto.get(`${alcaldiaId}|${norm(nombre)}`) || aprox.get(`${alcaldiaId}|${base(nombre)}`) || [];
  };
}

async function guardarIndicador(con, sync, clave, indicador, periodo, valor, extra) {
  try {
    await con.call('sp_sync_indicador', [sync, clave, indicador, periodo, valor, JSON.stringify(extra)]);
    return true;
  } catch (e) {
    await registrarError(con, sync, clave, e.sqlMessage || e.message, null);
    return false;
  }
}

async function guardarDelitos(con, sync, datos) {
  const unidades = await cargarUnidades(con);
  const idx = geo.indice(unidades.filter((u) => u.geom).map((u) => ({ id: u.id, geom: u.geom })));
  const alc = resolutorAlcaldias(await con.q('SELECT id, clave, nombre FROM alcaldias'));
  const buscarNombre = porNombreUnidad(unidades);
  const cuenta = new Map();
  let sinUbicar = 0;
  for (const g of datos.grupos) {
    let uid = null;
    if (idx.total && g.la !== null && g.lo !== null && geo.enCdmx(g.la, g.lo)) uid = idx.buscar(g.lo, g.la);
    if (!uid && g.c) {
      const a = alc(g.a);
      const lista = buscarNombre(a && a.id, g.c);
      if (lista.length === 1) uid = lista[0].id;
    }
    if (uid) cuenta.set(uid, (cuenta.get(uid) || 0) + g.n);
    else sinUbicar += g.n;
  }
  let escritos = 0;
  for (const u of unidades) {
    const n = cuenta.get(u.id);
    if (n === undefined && !u.geom) continue;
    if (await guardarIndicador(con, sync, u.clave, 'incidencia_delictiva', datos.periodo, n || 0,
      { fuente: 'Carpetas de investigación FGJ', periodo: datos.periodo, carpetas: n || 0 })) escritos += 1;
  }
  if (!escritos) throw new Error('No se pudo relacionar ninguna carpeta con las colonias. Sincroniza primero las colonias');
  if (sinUbicar) {
    await registrarError(con, sync, `periodo-${datos.periodo}`,
      `${sinUbicar} de ${datos.total} carpetas sin colonia identificable (sin coordenadas o fuera de las colonias registradas)`, null);
  }
}

async function guardarDesarrolloSocial(con, sync, datos) {
  const unidades = await cargarUnidades(con);
  const alc = resolutorAlcaldias(await con.q('SELECT id, clave, nombre FROM alcaldias'));
  const nombreRec = (datos.recurso && datos.recurso.nombre) || '';
  const items = [];
  const ESTRATOS = [[/muy\s*bajo/, 0.6], [/muy\s*alto/, 0.97], [/bajo/, 0.75], [/medio/, 0.85], [/alto/, 0.93]];
  const deEstrato = (t) => {
    const x = sinAcentos(t).toLowerCase();
    const e = ESTRATOS.find(([re]) => re.test(x));
    return e ? e[1] : null;
  };
  for (const r of datos.registros) {
    let v = numero(campo(r, C.ids));
    if (v === null) { const e = campo(r, C.estrato); v = e === null ? null : deEstrato(e); }
    if (v === null) continue;
    if (v > 1 && v <= 100) v /= 100;
    if (v < 0 || v > 1) continue;
    const g = geo.geometria(campo(r, C.forma));
    let p = punto(r);
    if (!enRango(p) || !geo.enCdmx(p.lat, p.lng)) p = g ? geo.centro(g) : null;
    items.push({
      ids: v, pob: numero(campo(r, C.poblacion)), geom: g && g.type !== 'Point' ? g : null, p,
      nombre: campo(r, C.nombreUt), clave: campo(r, C.claveUt),
      alc: alc(campo(r, C.nombreAlc)) || alc(campo(r, C.codigoAlc)),
      periodo: Math.trunc(numero(campo(r, ['anio', 'año', 'ano', 'periodo', 'year'])) || anioEn(nombreRec) || new Date().getFullYear()),
      unidades: [],
    });
  }
  if (!items.length) throw new Error('El conjunto no contiene valores del Índice de Desarrollo Social');
  const conPoligono = items.filter((x) => x.geom);
  const conPunto = items.filter((x) => x.p && geo.enCdmx(x.p.lat, x.p.lng));
  const porClave = new Map(unidades.map((u) => [norm(u.clave), u]));
  const buscarNombre = porNombreUnidad(unidades);
  if (conPoligono.length >= items.length / 2) {
    const idx = geo.indice(conPoligono.map((x, i) => ({ id: i + 1, geom: x.geom })));
    for (const u of unidades) {
      if (!u.centro) continue;
      const k = idx.buscar(u.centro.lng, u.centro.lat);
      if (k) conPoligono[k - 1].unidades.push(u);
    }
  } else if (conPunto.length >= items.length / 2) {
    for (const u of unidades) {
      if (!u.centro) continue;
      let mejor = null; let d = 2;
      for (const x of conPunto) {
        const dx = geo.distanciaKm(u.centro, x.p);
        if (dx < d) { d = dx; mejor = x; }
      }
      if (mejor) mejor.unidades.push(u);
    }
  } else {
    for (const x of items) {
      const u = x.clave && porClave.get(norm(x.clave));
      if (u) x.unidades.push(u);
      else x.unidades.push(...buscarNombre(x.alc && x.alc.id, x.nombre));
    }
  }
  const porUnidad = new Map();
  for (const x of items) {
    for (const u of x.unidades) {
      const peso = x.pob !== null && x.pob > 0 ? x.pob : 1;
      const k = `${u.clave}|${x.periodo}`;
      const a = porUnidad.get(k) || { u, periodo: x.periodo, suma: 0, pesos: 0, pob: null };
      a.suma += x.ids * peso;
      a.pesos += peso;
      if (x.pob !== null && x.pob >= 0) a.pob = (a.pob || 0) + Math.round(x.pob / x.unidades.length);
      porUnidad.set(k, a);
    }
  }
  let escritos = 0;
  for (const a of porUnidad.values()) {
    const ids = Math.round((a.suma / a.pesos) * 10000) / 10000;
    const extra = { fuente: 'Índice de Desarrollo Social (Evalúa CDMX)', ids, periodo: a.periodo };
    if (await guardarIndicador(con, sync, a.u.clave, 'indice_pobreza', a.periodo, Math.round((1 - ids) * 10000) / 10000, extra)) escritos += 1;
    if (a.pob !== null) await guardarIndicador(con, sync, a.u.clave, 'poblacion', a.periodo, a.pob, extra);
  }
  if (!escritos) throw new Error('No se pudo relacionar el índice con ninguna colonia. Sincroniza primero las colonias');
}

async function guardarDirectorio(con, sync, registros) {
  const alc = resolutorAlcaldias(await con.q('SELECT id, clave, nombre FROM alcaldias'));
  const txt = (r, l, n) => { const x = campo(r, l); return x === null ? null : String(x).trim().slice(0, n); };
  for (const r of registros) {
    const a = alc(campo(r, C.nombreAlc)) || alc(campo(r, C.codigoAlc));
    const cargo = txt(r, ['cargo', 'nombre_sede', 'sede', 'area', 'nombre', 'unidad_administrativa'], 50) || 'Sede de atención';
    const direccion = txt(r, C.direccion, 150);
    const idExt = String(campo(r, C.idExterno) || huella(`${a ? a.clave : ''}|${norm(cargo)}|${norm(direccion)}`)).slice(0, 100);
    if (!a) { await registrarError(con, sync, idExt, `Alcaldía no reconocida: ${campo(r, C.nombreAlc) || '?'}`, null); continue; }
    try {
      await con.call('sp_sync_directorio', [sync, idExt, a.nombre, 'sede_atencion', titulo(cargo).slice(0, 50),
        txt(r, ['titular', 'responsable', 'nombre_titular', 'servidor_publico'], 50), txt(r, ['temas', 'servicios', 'atribuciones'], 100),
        direccion, txt(r, C.telefono, 30), txt(r, ['correo', 'email', 'correo_electronico'], 50), txt(r, ['sitio_web', 'web', 'url', 'pagina'], 100),
        sinGeometria(r)]);
    } catch (e) { await registrarError(con, sync, idExt, e.sqlMessage || e.message, null); }
  }
}

async function guardarIndicadoresGenericos(con, sync, fuente, registros) {
  for (const r of registros) {
    const periodo = Math.trunc(numero(campo(r, C.anio)) || new Date().getFullYear());
    const clave = String(campo(r, C.claveUt) || '').slice(0, 20);
    await guardarIndicador(con, sync, clave, 'poblacion', periodo,
      numero(campo(r, ['valor', 'total', ...C.poblacion])), r);
  }
}

async function sincronizarFuente(fuente, disparadaPor = 'programada', usuarioId = null) {
  const ini = await db.conUsuario(usuarioId, (con) => con.call('sp_sync_iniciar', [fuente.clave, disparadaPor]));
  const sync = ini[0].sincronizacion_id;
  const finalizar = async (error) => {
    const fin = await db.conSistema((con) => con.call('sp_sync_finalizar', [sync, error ? String(error).slice(0, 1000) : null]));
    const r = fin[0] || null;
    if (r && error) r.motivo = String(error).slice(0, 300);
    return r;
  };
  try {
    const perfil = PERFILES[fuente.clave] || {
      conjuntos: [], busquedas: [], tipos: ['datastore'], valida: () => true,
    };
    if (!PERFILES[fuente.clave] && !fuente.recurso) throw new Error('La fuente no tiene configurado el recurso (id del conjunto de datos)');
    const datos = await obtener(fuente, perfil);
    await db.conSistema(async (con) => {
      if (datos.cambio) await con.q('UPDATE fuentes_externas SET recurso = ? WHERE id = ?', [datos.recurso.id, fuente.id]);
      if (fuente.clave === 'datos_cdmx_delitos') return guardarDelitos(con, sync, datos);
      if (fuente.clave === 'indice_desarrollo_social') return guardarDesarrolloSocial(con, sync, datos);
      switch (fuente.entidad_destino) {
        case 'alcaldias': return guardarAlcaldias(con, sync, datos.registros);
        case 'unidades_territoriales': return guardarUnidades(con, sync, datos.registros);
        case 'directorio': return guardarDirectorio(con, sync, datos.registros);
        case 'indicadores_unidad': return guardarIndicadoresGenericos(con, sync, fuente, datos.registros);
        default: throw new Error(`Destino no soportado: ${fuente.entidad_destino}`);
      }
    });
    if (datos.cambio) log.info(`Fuente ${fuente.clave}: se detectó el recurso ${datos.recurso.id} (${datos.recurso.nombre})`);
    return await finalizar(null);
  } catch (e) {
    return finalizar(e.sqlMessage || e.message || 'Error desconocido');
  }
}

let ocupado = false;
const ESPERA_TRAS_FALLA_HORAS = 6;

async function sincronizarPendientes() {
  if (ocupado) return;
  ocupado = true;
  try {
    const pendientes = await db.conSistema((con) => con.call('sp_sync_pendientes', []));
    const pos = (c) => { const i = ORDEN.indexOf(c); return i < 0 ? ORDEN.length : i; };
    pendientes.sort((a, b) => pos(a.clave) - pos(b.clave));
    for (const f of pendientes) {
      try {
        const ultima = await db.conSistema((con) => con.uno(
          `SELECT estado, iniciada_en > NOW() - INTERVAL ${ESPERA_TRAS_FALLA_HORAS} HOUR AS reciente
           FROM sincronizaciones WHERE fuente_id = ? ORDER BY id DESC LIMIT 1`, [f.id]));
        if (ultima && ultima.estado === 'fallida' && Number(ultima.reciente)) continue;
        const r = await sincronizarFuente(f, 'programada', null);
        log.info(`Sincronización ${f.clave}:`, r && r.estado, r && r.motivo ? `(${r.motivo})` : '');
      } catch (e) {
        log.aviso(`Sincronización ${f.clave} no realizada:`, e.sqlMessage || e.message);
      }
    }
  } catch (e) {
    log.aviso('No se pudieron revisar las fuentes externas:', e.message);
  } finally {
    ocupado = false;
  }
}

module.exports = {
  sincronizarFuente, sincronizarPendientes, PERFILES,
  _campo: campo, _deCsv: deCsv, _punto: punto, _titulo: titulo, _norm: norm, _base: base, _resolutorAlcaldias: resolutorAlcaldias,
};
