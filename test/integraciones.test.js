'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('./ayuda');
const config = require('../server/config');
const { geocodificar } = require('../server/lib/geocodificar');
const sinc = require('../server/lib/sincronizar');
const correo = require('../server/lib/correo');

const fetchReal = global.fetch;
let llamadas = [];
function simular(fn) {
  global.fetch = async (url, op) => {
    const u = String(url);
    if (u.startsWith('http://127.0.0.1')) return fetchReal(url, op);
    llamadas.push(u);
    return fn(u, op);
  };
}
const respuesta = (datos, estado = 200) => ({ ok: estado < 400, status: estado, json: async () => datos });

test.before(async () => { await A.iniciar(); await A.crearAdmin(); });
test.after(async () => { global.fetch = fetchReal; await A.detener(); });

test('geocodificación: consulta, caché, fallas y coordenadas fuera de la CDMX', async () => {
  config.geocodificacion = true;
  simular(async () => respuesta([{ lat: '19.4712', lon: '-99.1851', display_name: 'Norte 45, Clavería', place_id: 9 }]));
  llamadas = [];
  const g = await geocodificar('Norte 45 12, Clavería, Azcapotzalco, Ciudad de México');
  assert.equal(g.latitud, 19.4712);
  assert.equal(llamadas.length, 1);
  const g2 = await geocodificar('  norte 45 12, clavería, azcapotzalco, ciudad de méxico ');
  assert.equal(g2.id, g.id, 'la segunda vez usa la caché');
  assert.equal(llamadas.length, 1, 'sin volver a consultar a Nominatim');
  simular(async () => { throw new Error('sin red'); });
  assert.equal(await geocodificar('Calle que falla 1'), null);
  simular(async () => respuesta([{ lat: '40.4', lon: '-3.7', display_name: 'Madrid' }]));
  assert.equal(await geocodificar('Calle en otro país'), null, 'fuera de la CDMX no se acepta');
  simular(async () => respuesta([], 500));
  assert.equal(await geocodificar('Calle con error 500'), null);
  assert.equal(await geocodificar(''), null);
  config.geocodificacion = false;
  assert.equal(await geocodificar('Calle nueva sin servicio'), null);
});

test('registro de proyecto usa la geocodificación (y si falla queda sin ubicar)', async () => {
  const admin = A.cliente();
  await admin.post('/api/auth/login', { correo: 'admin@prepar.mx', password: 'Admin12345' });
  const c = await admin.post('/api/admin/ciclos', { nombre: 'Ciclo geo', anio_simulado: 2026, presupuesto_total: 1000000, alcaldias: [2] });
  await admin.post(`/api/admin/ciclos/${c.datos.id}/fase`, { fase: 'diagnostico_registro' });
  const v = A.cliente();
  await v.post('/api/auth/registro', { nombre: 'Vecino Geo', correo: 'geo@correo.mx', password: 'Prepar2026', fecha_nacimiento: '1990-01-01', genero: 'hombre', unidad_territorial_id: 3, acepta_aviso: true });
  config.geocodificacion = true;
  simular(async () => respuesta([{ lat: '19.4701', lon: '-99.1840', display_name: 'Calle Real' }]));
  const p = await v.post('/api/proyectos', { titulo: 'Proyecto ubicado', descripcion: 'Proyecto con dirección encontrada', rubro_id: 1, costo_estimado: 1000, calle: 'Calle Real', numero: '5' });
  assert.equal(p.estado, 201);
  assert.equal(p.datos.estado_ubicacion, 'ubicado');
  const prev = await v.post('/api/geocodificar', { direccion: 'Calle Real 5, Clavería' });
  assert.equal(prev.datos.encontrado, true);
  simular(async () => respuesta([]));
  const p2 = await v.post('/api/proyectos', { titulo: 'Proyecto no ubicado', descripcion: 'Proyecto con dirección inexistente', rubro_id: 1, costo_estimado: 1000, calle: 'Calle Inexistente' });
  assert.equal(p2.datos.estado_ubicacion, 'no_ubicado');
  const prev2 = await v.post('/api/geocodificar', { direccion: 'Calle Inexistente, Clavería' });
  assert.equal(prev2.datos.encontrado, false);
  config.geocodificacion = false;
});

const cuadro = (lng1, lat1, lng2, lat2) => ({ type: 'Polygon', coordinates: [[[lng1, lat1], [lng2, lat1], [lng2, lat2], [lng1, lat2], [lng1, lat1]]] });
const AHORA = new Date().getFullYear();
function portal() {
  const geojson = {
    'https://datos.cdmx.gob.mx/colonias.geojson': { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: { nomut: 'CLAVERIA', nomdt: 'AZCAPOTZALCO', cveut: '02-010' }, geometry: cuadro(-99.19, 19.466, -99.18, 19.476) },
      { type: 'Feature', properties: { nomut: 'NUEVA SANTA MARIA', nomdt: 'AZCAPOTZALCO', cveut: '02-050' }, geometry: cuadro(-99.175, 19.46, -99.165, 19.47) },
      { type: 'Feature', properties: { nomut: 'PUEBLO SAN LUCAS', cvedt: '3', cveut: '03-077' }, geometry: cuadro(-99.16, 19.33, -99.15, 19.34) },
      { type: 'Feature', properties: { nomut: 'SIN ALCALDIA', nomdt: 'NO EXISTE', cveut: '99-001' }, geometry: null },
    ] },
    'https://datos.cdmx.gob.mx/alcaldias.geojson': { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: { nomgeo: 'Azcapotzalco', cve_mun: '002' }, geometry: cuadro(-99.22, 19.45, -99.14, 19.51) },
      { type: 'Feature', properties: { nomgeo: 'MAGDALENA CONTRERAS' }, geometry: cuadro(-99.3, 19.2, -99.2, 19.33) },
      { type: 'Feature', properties: { nomgeo: 'Alcaldía Nueva' }, geometry: null },
    ] },
  };
  const t = (a) => String(a);
  const carpetas = [
    ...Array(3).fill({ anio_inicio: t(AHORA - 1), latitud: '19.47', longitud: '-99.185', colonia_catalogo: 'CLAVERIA', alcaldia_catalogo: 'AZCAPOTZALCO' }),
    ...Array(2).fill({ anio_inicio: t(AHORA - 1), latitud: '19.465', longitud: '-99.17', colonia_catalogo: 'NUEVA SANTA MARIA', alcaldia_catalogo: 'AZCAPOTZALCO' }),
    { anio_inicio: t(AHORA - 1), latitud: 'NA', longitud: '', colonia_catalogo: 'SAN ALVARO', alcaldia_catalogo: 'AZCAPOTZALCO' },
    { anio_inicio: t(AHORA - 1), latitud: '', longitud: '', colonia_catalogo: 'COLONIA DESCONOCIDA', alcaldia_catalogo: 'AZCAPOTZALCO' },
    ...Array(4).fill({ anio_inicio: t(AHORA), latitud: '19.47', longitud: '-99.185', colonia_catalogo: 'CLAVERIA', alcaldia_catalogo: 'AZCAPOTZALCO' }),
  ];
  const tablas = {
    'res-carp-nuevo': { campos: [['anio_inicio', 'text'], ['latitud', 'text'], ['longitud', 'text'], ['colonia_catalogo', 'text'], ['alcaldia_catalogo', 'text']], filas: carpetas },
    'res-carp-viejo': { campos: [['anio_inicio', 'text'], ['latitud', 'text'], ['longitud', 'text']], filas: [] },
    'res-ids': { campos: [['nombre', 'text'], ['alcaldia', 'text'], ['ids', 'numeric'], ['pob_tot', 'int']], filas: [
      { nombre: 'Clavería', alcaldia: 'AZCAPOTZALCO', ids: '0.85', pob_tot: 15000 },
      { nombre: 'NUEVA SANTA MARIA', alcaldia: 'Azcapotzalco', ids: 72, pob_tot: 8000 },
      { nombre: 'Sin índice', alcaldia: 'Azcapotzalco', ids: '' },
    ] },
    'res-colonias-csv': { campos: [['nombre', 'text'], ['alcaldia', 'text']], filas: [] },
  };
  const recursos = {
    'aaaaaaaa-0000-4000-8000-000000000001': { id: 'aaaaaaaa-0000-4000-8000-000000000001', name: 'Colonias 2022 (GeoJSON)', format: 'GeoJSON', url: 'https://datos.cdmx.gob.mx/colonias.geojson', datastore_active: false },
  };
  const paquetes = {
    coloniascdmx: { id: 'p1', name: 'coloniascdmx', title: 'Colonias', resources: [
      { id: 'res-colonias-csv', name: 'colonias.csv', format: 'CSV', datastore_active: true },
      recursos['aaaaaaaa-0000-4000-8000-000000000001'],
    ] },
    'limite-de-las-alcaldias': { id: 'p2', name: 'limite-de-las-alcaldias', title: 'Alcaldías', resources: [
      { id: 'res-alc-geo', name: 'alcaldias.geojson', format: 'GeoJSON', url: 'https://datos.cdmx.gob.mx/alcaldias.geojson' }] },
    'carpetas-de-investigacion-fgj-de-la-ciudad-de-mexico': { id: 'p3', name: 'carpetas', title: 'Carpetas FGJ', resources: [
      { id: 'res-pdf', name: 'Diccionario', format: 'PDF' },
      { id: 'res-carp-viejo', name: 'Carpetas 2016-2023', format: 'CSV', datastore_active: true, last_modified: '2024-01-01' },
      { id: 'res-carp-nuevo', name: `Carpetas 2024-${AHORA}`, format: 'CSV', datastore_active: 'True', last_modified: '2026-01-01' }] },
  };
  const busquedas = { 'indice de desarrollo social': [{ id: 'p4', name: 'ids', title: 'Índice de Desarrollo Social 2020', resources: [
    { id: 'res-ids', name: 'IDS 2020 por colonia', format: 'CSV', datastore_active: true }] }] };
  const estado = { sql: false, caido: false };
  const archivos = {};
  const ok = (result) => respuesta({ success: true, result });
  const noHay = () => respuesta({ success: false, error: { message: 'Not found', __type: 'Not Found Error' } }, 404);
  async function atender(u) {
    if (estado.caido) throw new Error('ECONNREFUSED');
    const url = new URL(u);
    if (geojson[u]) { const txt = JSON.stringify(geojson[u]); return { ok: true, status: 200, headers: { get: () => null }, text: async () => txt }; }
    if (archivos[u] !== undefined) { const buf = Buffer.isBuffer(archivos[u]) ? archivos[u] : Buffer.from(archivos[u], 'utf8'); return { ok: true, status: 200, headers: { get: () => null }, arrayBuffer: async () => buf }; }
    const acc = url.pathname.replace('/api/3/action/', '');
    const q = (k) => url.searchParams.get(k);
    switch (acc) {
      case 'package_show': return paquetes[q('id')] ? ok(paquetes[q('id')]) : noHay();
      case 'package_search': return ok({ results: busquedas[q('q')] || [] });
      case 'resource_show': return recursos[q('id')] ? ok(recursos[q('id')]) : noHay();
      case 'datastore_search': {
        const tb = tablas[q('resource_id')];
        if (!tb) return noHay();
        let filas = tb.filas;
        const filtros = q('filters') ? JSON.parse(q('filters')) : {};
        filas = filas.filter((f) => Object.entries(filtros).every(([k, v]) => String(f[k]) === String(v)));
        if (q('sort')) { const [k] = q('sort').split(' '); filas = [...filas].sort((a, b) => String(b[k]).localeCompare(String(a[k]))); }
        const off = Number(q('offset') || 0); const lim = Number(q('limit') || 100);
        filas = filas.slice(off, off + lim);
        if (q('fields')) { const cs = q('fields').split(','); filas = filas.map((f) => Object.fromEntries(cs.map((c) => [c, f[c]]))); }
        return ok({ fields: [{ id: '_id', type: 'int' }, ...tb.campos.map(([id, type]) => ({ id, type }))], records: filas, total: tb.filas.length });
      }
      case 'datastore_search_sql': {
        if (!estado.sql) return respuesta({ success: false, error: { message: 'Access denied', __type: 'Authorization Error' } }, 403);
        const sql = q('sql');
        const filas = tablas['res-carp-nuevo'].filas;
        if (/MAX\(/.test(sql)) return ok({ records: [{ m: filas.reduce((m, f) => (f.anio_inicio > m ? f.anio_inicio : m), '0') }] });
        if (/OFFSET [1-9]/.test(sql)) return ok({ records: [] });
        const anio = /= '(\d{4})'/.exec(sql)[1];
        const g = new Map();
        const n3 = (x) => (/^ *-?[0-9]+(\.[0-9]+)? *$/.test(x) ? Math.round(Number(x) * 1000) / 1000 : null);
        for (const f of filas.filter((x) => x.anio_inicio === anio)) {
          const k = [n3(f.latitud), n3(f.longitud), f.alcaldia_catalogo, f.colonia_catalogo].join('|');
          const a = g.get(k) || { la: n3(f.latitud), lo: n3(f.longitud), a: f.alcaldia_catalogo, c: f.colonia_catalogo, n: 0 };
          a.n += 1; g.set(k, a);
        }
        return ok({ records: [...g.values()].map((x) => ({ ...x, n: String(x.n) })) });
      }
      default: return noHay();
    }
  }
  return { atender, estado, recursos, paquetes, busquedas, tablas, geojson, archivos };
}

const fuente = (clave) => A.db.conSistema((c) => c.uno('SELECT * FROM fuentes_externas WHERE clave = ?', [clave]));
const indicador = (clave, ind, periodo = null) => A.db.conSistema((c) => c.uno(
  `SELECT iu.valor, iu.periodo FROM indicadores_unidad iu JOIN unidades_territoriales ut ON ut.id = iu.unidad_territorial_id
   JOIN indicadores i ON i.id = iu.indicador_id WHERE ut.clave = ? AND i.clave = ? AND (? IS NULL OR iu.periodo = ?)
   ORDER BY iu.periodo DESC LIMIT 1`, [clave, ind, periodo, periodo]));

test('datos abiertos: detecta solo los conjuntos, colonias y alcaldías con polígonos', async () => {
  const p = portal();
  simular(p.atender);
  const activas = await A.db.conSistema((c) => c.q("SELECT clave FROM fuentes_externas WHERE activa AND tipo = 'datos' ORDER BY clave"));
  assert.deepEqual(activas.map((x) => x.clave), ['datos_cdmx_alcaldias', 'datos_cdmx_delitos', 'datos_cdmx_unidades', 'directorio_alcaldias', 'indice_desarrollo_social'],
    'las fuentes del portal vienen activas y sin recurso');
  const ra = await sinc.sincronizarFuente(await fuente('datos_cdmx_alcaldias'), 'programada', null);
  assert.equal(ra.estado, 'parcial');
  assert.equal(Number(ra.con_error), 1, 'la alcaldía que no existe se reporta sin detener nada');
  const azc = await A.db.conSistema((c) => c.uno("SELECT latitud, limite_geojson IS NOT NULL AS poligono, origen FROM alcaldias WHERE clave = 'AZC'"));
  assert.equal(Number(azc.poligono), 1);
  assert.equal(azc.origen, 'api');
  assert.equal((await A.db.conSistema((c) => c.uno('SELECT COUNT(*) AS n FROM alcaldias'))).n, 16, 'no crea alcaldías nuevas');
  const ru = await sinc.sincronizarFuente(await fuente('datos_cdmx_unidades'), 'programada', null);
  assert.equal(ru.estado, 'parcial');
  assert.equal(Number(ru.nuevos), 2);
  assert.equal(Number(ru.actualizados), 1);
  assert.equal((await fuente('datos_cdmx_unidades')).recurso, 'aaaaaaaa-0000-4000-8000-000000000001');
  const clav = await A.db.conSistema((c) => c.uno("SELECT clave, nombre, origen, limite_geojson IS NOT NULL AS poligono FROM unidades_territoriales WHERE clave = 'AZC-001'"));
  assert.deepEqual({ ...clav, poligono: Number(clav.poligono) }, { clave: 'AZC-001', nombre: 'Claveria', origen: 'api', poligono: 1 },
    'Clavería precargada se conserva (misma clave) y se completa con el polígono');
  const nueva = await A.db.conSistema((c) => c.uno("SELECT nombre, tipo, latitud FROM unidades_territoriales WHERE clave = '02-050'"));
  assert.equal(nueva.nombre, 'Nueva Santa Maria');
  assert.ok(Math.abs(Number(nueva.latitud) - 19.465) < 0.001, 'el centro se calcula del polígono');
  assert.equal((await A.db.conSistema((c) => c.uno("SELECT tipo FROM unidades_territoriales WHERE clave = '03-077'"))).tipo, 'pueblo_originario');
  const ru2 = await sinc.sincronizarFuente(await fuente('datos_cdmx_unidades'), 'programada', null);
  assert.equal(Number(ru2.sin_cambios), 3);
  await A.db.conSistema((c) => c.q("UPDATE fuentes_externas SET recurso = 'bbbbbbbb-0000-4000-8000-000000000009' WHERE clave = 'datos_cdmx_unidades'"));
  const ru3 = await sinc.sincronizarFuente(await fuente('datos_cdmx_unidades'), 'programada', null);
  assert.equal(Number(ru3.sin_cambios), 3);
  assert.equal((await fuente('datos_cdmx_unidades')).recurso, 'aaaaaaaa-0000-4000-8000-000000000001');
});

test('datos abiertos: delitos por colonia (con y sin SQL), índice de pobreza y población', async () => {
  const p = portal();
  simular(p.atender);
  const rd = await sinc.sincronizarFuente(await fuente('datos_cdmx_delitos'), 'programada', null);
  assert.equal(rd.estado, 'parcial', 'una carpeta sin colonia identificable se informa');
  assert.equal((await fuente('datos_cdmx_delitos')).recurso, 'res-carp-nuevo', 'elige el recurso más reciente');
  assert.deepEqual(await indicador('AZC-001', 'incidencia_delictiva'), { valor: 3, periodo: AHORA - 1 }, 'cuenta por polígono y solo el año completo');
  assert.equal((await indicador('02-050', 'incidencia_delictiva')).valor, 2);
  assert.equal((await indicador('AZC-002', 'incidencia_delictiva')).valor, 1, 'sin coordenadas usa el nombre de la colonia');
  assert.equal((await indicador('03-077', 'incidencia_delictiva')).valor, 0, 'colonia con polígono y sin carpetas = 0');
  p.estado.sql = true;
  await A.db.conSistema((c) => c.q("DELETE iu FROM indicadores_unidad iu JOIN indicadores i ON i.id = iu.indicador_id WHERE i.clave = 'incidencia_delictiva'"));
  await sinc.sincronizarFuente(await fuente('datos_cdmx_delitos'), 'manual', (await A.db.conSistema((c) => c.uno("SELECT id FROM usuarios WHERE rol = 'administrador' LIMIT 1"))).id);
  assert.equal((await indicador('AZC-001', 'incidencia_delictiva')).valor, 3);
  assert.equal((await indicador('02-050', 'incidencia_delictiva')).valor, 2);
  assert.ok(llamadas.some((u) => u.includes('datastore_search_sql') && u.includes('GROUP')), 'usó la consulta agregada');
  const ri = await sinc.sincronizarFuente(await fuente('indice_desarrollo_social'), 'programada', null);
  assert.ok(['exitosa', 'parcial'].includes(ri.estado), ri.estado);
  assert.deepEqual(await indicador('AZC-001', 'indice_pobreza'), { valor: 0.15, periodo: 2020 }, 'pobreza = 1 − IDS');
  assert.equal((await indicador('02-050', 'indice_pobreza')).valor, 0.28, 'un IDS en escala 0–100 se normaliza');
  assert.equal((await indicador('AZC-001', 'poblacion')).valor, 15000);
  const rdir = await sinc.sincronizarFuente(await fuente('directorio_alcaldias'), 'programada', null);
  assert.equal(rdir.estado, 'fallida');
  const msj = await A.db.conSistema((c) => c.uno("SELECT sy.mensaje FROM sincronizaciones sy JOIN fuentes_externas f ON f.id = sy.fuente_id WHERE f.clave = 'directorio_alcaldias' ORDER BY sy.id DESC LIMIT 1"));
  assert.match(msj.mensaje, /No se encontró en el portal/);
});

test('datos abiertos: directorio e índice con polígonos o puntos', async () => {
  const p = portal();
  p.busquedas['directorio alcaldias'] = [{ id: 'p5', name: 'dir', title: 'Directorio', resources: [{ id: 'res-dir', name: 'directorio', format: 'CSV', datastore_active: true }] }];
  p.tablas['res-dir'] = { campos: [['alcaldia', 'text'], ['area', 'text'], ['direccion', 'text'], ['telefono', 'text'], ['correo', 'text']], filas: [
    { alcaldia: 'AZCAPOTZALCO', area: 'ATENCION CIUDADANA', direccion: 'Castilla Oriente s/n', telefono: '(55) 5354-9994', correo: 'atencion@azc.mx' },
    { alcaldia: 'Lejana', area: 'X', direccion: 'Y', telefono: '1' },
  ] };
  const rdir = await (async () => { simular(p.atender); return sinc.sincronizarFuente(await fuente('directorio_alcaldias'), 'programada', null); })();
  assert.equal(rdir.estado, 'parcial');
  const d = await A.db.conSistema((c) => c.uno("SELECT cargo, telefono, origen FROM directorio WHERE direccion = 'Castilla Oriente s/n'"));
  assert.deepEqual(d, { cargo: 'Atencion Ciudadana', telefono: '5553549994', origen: 'api' });
  const rdir2 = await sinc.sincronizarFuente(await fuente('directorio_alcaldias'), 'programada', null);
  assert.equal(Number(rdir2.sin_cambios), 1, 'id estable: no duplica el directorio');
  p.geojson['https://datos.cdmx.gob.mx/ids.geojson'] = { type: 'FeatureCollection', features: [
    { type: 'Feature', properties: { ids_2020: 0.6, pob_tot: 1000 }, geometry: cuadro(-99.2, 19.45, -99.16, 19.48) },
    { type: 'Feature', properties: { ids_2020: 'n/d' }, geometry: cuadro(0, 0, 1, 1) },
  ] };
  p.busquedas['indice de desarrollo social'] = [{ id: 'p6', name: 'ids-geo', title: 'IDS 2015', resources: [
    { id: 'res-ids-geo', name: 'IDS 2015 GeoJSON', format: 'geojson', url: 'https://datos.cdmx.gob.mx/ids.geojson' }] }];
  await A.db.conSistema((c) => c.q("UPDATE fuentes_externas SET recurso = NULL WHERE clave = 'indice_desarrollo_social'"));
  const r1 = await sinc.sincronizarFuente(await fuente('indice_desarrollo_social'), 'programada', null);
  assert.equal(r1.estado, 'exitosa');
  assert.deepEqual(await indicador('AZC-001', 'indice_pobreza', 2015), { valor: 0.4, periodo: 2015 });
  assert.equal((await indicador('AZC-001', 'poblacion', 2015)).valor, 333, 'la población del área se reparte entre sus 3 colonias');
  p.tablas['res-ids-pt'] = { campos: [['latitud', 'numeric'], ['longitud', 'numeric'], ['ids', 'numeric'], ['anio', 'int']], filas: [
    { latitud: 19.334, longitud: -99.155, ids: 0.9, anio: 2010 }, { latitud: 19.0, longitud: -98.0, ids: 0.1, anio: 2010 }] };
  p.busquedas['indice de desarrollo social'] = [{ id: 'p7', name: 'ids-pt', title: 'IDS', resources: [{ id: 'res-ids-pt', name: 'IDS puntos', format: 'CSV', datastore_active: true }] }];
  await A.db.conSistema((c) => c.q("UPDATE fuentes_externas SET recurso = NULL WHERE clave = 'indice_desarrollo_social'"));
  const r2 = await sinc.sincronizarFuente(await fuente('indice_desarrollo_social'), 'programada', null);
  assert.equal(r2.estado, 'exitosa');
  assert.deepEqual(await A.db.conSistema((c) => c.uno(
    "SELECT iu.valor FROM indicadores_unidad iu JOIN unidades_territoriales ut ON ut.id = iu.unidad_territorial_id JOIN indicadores i ON i.id = iu.indicador_id WHERE ut.clave = '03-077' AND i.clave = 'indice_pobreza' AND iu.periodo = 2010")), { valor: 0.1 });
  p.archivos['https://datos.cdmx.gob.mx/ids2020.csv'] = Buffer.from('CVE_UT;Nombre de la UT;Alcaldía;Estrato IDS;Año\n'
    + '02-050;Nueva Santa María;AZCAPOTZALCO;"Muy bajo";2005\n02-050;Nueva Santa María;AZCAPOTZALCO;Bajo;2005\n;;;;\n', 'latin1');
  p.paquetes['indice-de-desarrollo-social-de-la-ciudad-de-mexico-2020'] = { id: 'p8', name: 'ids-2020', title: 'Índice de Desarrollo Social de la Ciudad de México, 2020', resources: [
    { id: 'res-ids-csv', name: 'IDS 2020 por UT', format: 'CSV', url: 'https://datos.cdmx.gob.mx/ids2020.csv', datastore_active: false }] };
  p.busquedas['indice de desarrollo social'] = [{ id: 'p9', name: 'tel-ids', title: 'Telefonía - Índice de Desarrollo Social en la Ciudad', resources: [] }];
  await A.db.conSistema((c) => c.q("UPDATE fuentes_externas SET recurso = NULL WHERE clave = 'indice_desarrollo_social'"));
  const r3 = await sinc.sincronizarFuente(await fuente('indice_desarrollo_social'), 'programada', null);
  assert.equal(r3.estado, 'exitosa', 'CSV en latin1 con punto y coma, estratos en lugar de valores y conjunto 2020');
  assert.deepEqual(await indicador('02-050', 'indice_pobreza', 2005), { valor: 0.325, periodo: 2005 }, 'estratos promediados por colonia');
});

test('datos abiertos: portal caído, espera antes de reintentar, fuentes que no son CKAN y panel', async () => {
  const p = portal();
  simular(p.atender);
  p.estado.caido = true;
  await A.db.conSistema((c) => c.q("UPDATE fuentes_externas SET ultima_sincronizacion_exitosa = NULL WHERE clave = 'datos_cdmx_alcaldias'"));
  const r = await sinc.sincronizarFuente(await fuente('datos_cdmx_alcaldias'), 'programada', null);
  assert.equal(r.estado, 'fallida');
  const contar = async () => (await A.db.conSistema((c) => c.uno("SELECT COUNT(*) AS n FROM sincronizaciones sy JOIN fuentes_externas f ON f.id = sy.fuente_id WHERE f.clave = 'datos_cdmx_alcaldias'"))).n;
  const antes = await contar();
  await sinc.sincronizarPendientes();
  assert.equal(await contar(), antes, 'tras una falla reciente no vuelve a intentar enseguida');
  p.estado.caido = false;
  await A.db.conSistema((c) => c.q("UPDATE sincronizaciones SET iniciada_en = NOW() - INTERVAL 7 HOUR WHERE estado = 'fallida'"));
  await sinc.sincronizarPendientes();
  assert.equal(await contar(), antes + 1, 'pasadas 6 horas vuelve a intentar');
  await A.db.conSistema((c) => c.q("UPDATE fuentes_externas SET activa = TRUE, recurso = 'x' WHERE clave = 'inegi_poblacion'"));
  const ri = await sinc.sincronizarFuente(await fuente('inegi_poblacion'), 'programada', null);
  assert.equal(ri.estado, 'fallida');
  const admin = A.cliente();
  await admin.post('/api/auth/login', { correo: 'admin@prepar.mx', password: 'Admin12345' });
  const integ = await admin.get('/api/admin/integraciones');
  assert.ok(integ.datos.errores.length >= 1);
  assert.equal((await admin.put('/api/admin/integraciones/directorio_alcaldias', { recurso: null, activa: true })).estado, 200, 'se activa sin recurso: se detecta solo');
  assert.equal((await admin.put('/api/admin/integraciones/inegi_poblacion', { recurso: null, activa: true })).estado, 400);
  const man = await admin.post('/api/admin/integraciones/datos_cdmx_unidades/sincronizar');
  assert.equal(man.estado, 202);
  await new Promise((res) => setTimeout(res, 500));
  assert.equal((await admin.post('/api/admin/integraciones/correo/sincronizar')).estado, 404);
  await A.db.conSistema((c) => c.q("UPDATE fuentes_externas SET activa = FALSE WHERE clave = 'inegi_poblacion'"));
  assert.equal((await admin.post('/api/admin/integraciones/inegi_poblacion/sincronizar')).estado, 409);
});

test('cola de correos: envío correcto, reintentos y sin proveedor', async () => {
  const pendientes = async () => (await A.db.conSistema((c) => c.uno("SELECT COUNT(*) AS n FROM correos_salida WHERE estado = 'pendiente'"))).n;
  await A.db.conSistema((c) => c.call('sp_encolar_correo', [null, 'alguien@correo.mx', 'Prueba', 'Hola', 'prueba']));
  assert.equal(await correo.procesarCola(), 0, 'sin proveedor no envía nada');
  Object.assign(config.correo, { proveedor: 'resend', apiKey: 'clave', remitente: 'Prepar <no-responder@prepar.mx>' });
  simular(async () => respuesta({ id: 'msg-1' }));
  const antes = await pendientes();
  const enviados = await correo.procesarCola();
  assert.ok(enviados >= 1 && enviados <= 20);
  assert.equal(await pendientes(), Math.max(0, antes - enviados));
  await A.db.conSistema((c) => c.q("UPDATE correos_salida SET estado = 'cancelado' WHERE estado = 'pendiente'"));
  await A.db.conSistema((c) => c.call('sp_encolar_correo', [null, 'falla@correo.mx', 'Prueba', 'Hola', 'prueba']));
  Object.assign(config.correo, { proveedor: 'brevo' });
  simular(async () => respuesta({ message: 'error' }, 500));
  for (let i = 0; i < 3; i += 1) await correo.procesarCola();
  const f = await A.db.conSistema((c) => c.uno("SELECT estado, intentos FROM correos_salida WHERE destinatario = 'falla@correo.mx'"));
  assert.deepEqual(f, { estado: 'fallido', intentos: 3 }, 'tras 3 intentos queda como fallido');
  Object.assign(config.correo, { proveedor: 'otro' });
  await A.db.conSistema((c) => c.call('sp_encolar_correo', [null, 'otro@correo.mx', 'Prueba', 'Hola', 'prueba']));
  await correo.procesarCola();
  const o = await A.db.conSistema((c) => c.uno("SELECT intentos, ultimo_error FROM correos_salida WHERE destinatario = 'otro@correo.mx'"));
  assert.match(o.ultimo_error, /no soportado/);
  Object.assign(config.correo, { proveedor: '', apiKey: '', remitente: '' });
});

test('correo por SMTP (Gmail): conversación completa, acentos, error de contraseña y prueba desde el admin', async () => {
  const net = require('net');
  const smtp = require('../server/lib/smtp');
  const recibidos = [];
  let claveBuena = 'abcdabcdabcdabcd';
  const servidor = net.createServer((s) => {
    let modo = 'cmd';
    let datos = '';
    let paso = 0;
    s.write('220 prueba ESMTP\r\n');
    s.on('data', (b) => {
      const t = b.toString('utf8');
      if (modo === 'data') {
        datos += t;
        if (datos.endsWith('\r\n.\r\n')) { recibidos.push(datos); modo = 'cmd'; s.write('250 2.0.0 OK id=prueba123\r\n'); }
        return;
      }
      for (const l of t.split('\r\n').filter(Boolean)) {
        if (paso === 1) { paso = 2; s.write('334 UGFzc3dvcmQ6\r\n'); continue; }
        if (paso === 2) { paso = 0; s.write(Buffer.from(l, 'base64').toString() === claveBuena ? '235 ok\r\n' : '535 5.7.8 Username and Password not accepted\r\n'); continue; }
        if (/^EHLO/.test(l)) s.write('250-prueba\r\n250 AUTH LOGIN\r\n');
        else if (l === 'AUTH LOGIN') { paso = 1; s.write('334 VXNlcm5hbWU6\r\n'); }
        else if (/^MAIL FROM/.test(l) || /^RCPT TO/.test(l)) s.write('250 ok\r\n');
        else if (l === 'DATA') { modo = 'data'; datos = ''; s.write('354 adelante\r\n'); }
        else if (l === 'QUIT') { s.write('221 adiós\r\n'); s.end(); }
        else s.write('500 ?\r\n');
      }
    });
    s.on('error', () => {});
  });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const puerto = servidor.address().port;
  try {
    const base = { host: '127.0.0.1', puerto, sinTls: true, usuario: 'equipo@gmail.com', contrasena: claveBuena,
      remitente: 'Prepar <equipo@gmail.com>', para: 'vecina@correo.mx', asunto: 'Tu contraseña temporal · Prepar', texto: 'Hola, María.\nTu contraseña es: ñandú' };
    const r = await smtp.enviar(base);
    assert.match(r, /id=prueba123/);
    const m = recibidos.pop();
    assert.match(m, /Subject: =\?UTF-8\?B\?/);
    const cuerpo = m.split('\r\n\r\n')[1].replace(/\r\n\.\r\n$/, '');
    assert.match(Buffer.from(cuerpo.replace(/\s+/g, ''), 'base64').toString('utf8'), /ñandú/);
    const inyectado = smtp.armarMensaje({ ...base, asunto: 'Hola\r\nBcc: espia@x.com' });
    assert.ok(!/^Bcc:/m.test(inyectado));
    await assert.rejects(smtp.enviar({ ...base, contrasena: 'equivocada' }), /contraseña de correo incorrectos/);

    Object.assign(config.correo, { proveedor: 'gmail', remitente: 'Prepar <equipo@gmail.com>', apiKey: '' });
    Object.assign(config.correo.smtp, { host: '127.0.0.1', puerto, usuario: 'equipo@gmail.com', contrasena: claveBuena, sinTls: true });
    assert.equal(correo.configurado(), true);
    await A.db.conSistema((c) => c.q("UPDATE correos_salida SET estado = 'cancelado' WHERE estado = 'pendiente'"));
    await A.db.conSistema((c) => c.call('sp_encolar_correo', [null, 'smtp@correo.mx', 'Prueba SMTP', 'Hola', 'prueba']));
    assert.equal(await correo.procesarCola(), 1);
    const enviado = await A.db.conSistema((c) => c.uno("SELECT estado, id_mensaje_externo FROM correos_salida WHERE destinatario = 'smtp@correo.mx'"));
    assert.equal(enviado.estado, 'enviado');

    const admin = A.cliente();
    await admin.post('/api/auth/login', { correo: 'admin@prepar.mx', password: 'Admin12345' });
    const est = await admin.get('/api/admin/correo');
    assert.equal(est.estado, 200);
    assert.equal(est.datos.configurado, true);
    assert.equal(est.datos.proveedor, 'gmail');
    assert.ok(est.datos.enviados >= 1);
    assert.ok(est.datos.recientes.every((x) => !/^smtp@/.test(x.destinatario)), 'los correos se muestran ocultos en parte');
    const pr = await admin.post('/api/admin/correo/prueba', { destinatario: 'yo@correo.mx' });
    assert.equal(pr.estado, 200);
    assert.equal((await admin.post('/api/admin/correo/prueba', { destinatario: 'no-es-correo' })).estado, 400);
    claveBuena = 'otra-clave-distinta';
    const mal = await admin.post('/api/admin/correo/prueba', { destinatario: 'yo@correo.mx' });
    assert.equal(mal.estado, 502);
    assert.match(mal.datos.error, /incorrectos/);
    config.correo.smtp.contrasena = '';
    assert.match(correo.faltante(), /CORREO_SMTP_CONTRASENA/);
    assert.equal((await admin.get('/api/admin/correo')).datos.configurado, false);
  } finally {
    Object.assign(config.correo, { proveedor: '', apiKey: '', remitente: '' });
    Object.assign(config.correo.smtp, { host: '', usuario: '', contrasena: '', sinTls: false, puerto: 465 });
    await new Promise((r) => servidor.close(r));
  }
});

test('una base de una versión anterior se actualiza sola al arrancar (sin reinstalar)', async () => {
  const { migrar } = require('../server/lib/migraciones');
  assert.deepEqual(await migrar(), [], 'una base al día no cambia');
  await A.db.conSistema(async (c) => {
    await c.q('ALTER TABLE proyectos DROP FOREIGN KEY fk_proy_categoria');
    await c.q('DROP TABLE categorias_proyecto');
    await c.q(`ALTER TABLE proyectos MODIFY COLUMN categoria VARCHAR(12) NULL, ADD CONSTRAINT ck_proy_categoria CHECK (categoria IS NULL OR categoria IN
      ('areas_verdes', 'vialidad', 'alumbrado', 'recreacion', 'seguridad', 'agua', 'mobiliario', 'otro'))`);
    await c.q('ALTER TABLE avisos DROP COLUMN vigente_hasta');
  });
  const hechos = await migrar();
  assert.equal(hechos.length, 3, hechos.join(' | '));
  const tipos = await A.db.conSistema((c) => c.uno('SELECT COUNT(*) AS n FROM categorias_proyecto'));
  assert.equal(Number(tipos.n), 8);
  await A.db.conSistema((c) => c.q('ALTER TABLE proyectos DROP FOREIGN KEY fk_proy_categoria, DROP COLUMN categoria'));
  assert.equal((await migrar()).length, 1);
  const col = await A.db.conSistema((c) => c.uno("SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'proyectos' AND COLUMN_NAME = 'categoria'"));
  assert.equal(col.n, 1);
  const admin = A.cliente();
  await admin.post('/api/auth/login', { correo: 'admin@prepar.mx', password: 'Admin12345' });
  assert.equal((await admin.get('/api/mapa/proyectos')).estado, 200);
  await A.db.conSistema(async (c) => {
    await c.q('DROP TABLE directorio_ciudad');
    await c.q("DELETE FROM directorio WHERE fuente_url IS NOT NULL");
    await c.q('ALTER TABLE directorio DROP COLUMN fuente_nombre, DROP COLUMN fuente_url, DROP COLUMN consultado_en');
    await c.q("INSERT INTO directorio (alcaldia_id, tipo, cargo, nombre_titular) SELECT id, 'titular', 'Titular de la Alcaldía', 'Persona Titular (dato de ejemplo)' FROM alcaldias WHERE clave = 'AZC'");
  });
  assert.equal((await migrar()).length, 1, 'el directorio de una versión anterior recibe los datos oficiales');
  const dir = await A.db.conSistema((c) => c.uno("SELECT COUNT(*) AS n, SUM(nombre_titular LIKE '%dato de ejemplo%') AS ejemplo FROM directorio WHERE tipo = 'titular'"));
  assert.deepEqual([Number(dir.n), Number(dir.ejemplo)], [16, 0]);
  assert.deepEqual(await migrar(), [], 'correrla otra vez no hace nada');
});
