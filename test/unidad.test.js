'use strict';
process.env.LOG_SILENCIO = 'true';
const test = require('node:test');
const assert = require('node:assert/strict');
const v = require('../server/lib/validar');
const pdf = require('../server/lib/pdf');
const arch = require('../server/lib/archivos');
const { traducir, ErrorApp } = require('../server/lib/errores');
const seg = require('../server/lib/seguridad');
const { sentencias } = require('../scripts/instalar-bd');
const sinc = require('../server/lib/sincronizar');
const { png, jpegFalso } = require('./ayuda');

const lanza400 = (fn) => assert.throws(fn, (e) => e instanceof ErrorApp && e.estado === 400);

test('validar.texto: límites, limpieza y requeridos', () => {
  assert.equal(v.texto('  hola   mundo ', { campo: 'x', max: 20 }), 'hola mundo');
  assert.equal(v.texto('a\u0000b​c', { campo: 'x', max: 20 }), 'abc');
  assert.equal(v.texto('uno\r\n\r\n\r\n\ndos', { campo: 'x', max: 20, multilinea: true }), 'uno\n\ndos');
  assert.equal(v.texto('', { campo: 'x', requerido: false }), null);
  assert.equal(v.texto('   ', { campo: 'x', requerido: false }), null);
  lanza400(() => v.texto('', { campo: 'el título' }));
  lanza400(() => v.texto('   ', { campo: 'el título' }));
  lanza400(() => v.texto('a'.repeat(11), { campo: 'x', max: 10 }));
  lanza400(() => v.texto('ab', { campo: 'x', min: 3 }));
  lanza400(() => v.texto({ a: 1 }, { campo: 'x' }));
  assert.equal(v.texto('😀'.repeat(10), { campo: 'x', max: 10 }).length, 20, 'cuenta caracteres como MySQL');
  assert.equal(v.texto(123, { campo: 'x' }), '123');
});

test('validar números, fechas, opciones y booleanos', () => {
  assert.equal(v.entero('42', { min: 1, max: 100 }), 42);
  assert.equal(v.entero(7), 7);
  assert.equal(v.entero('', { requerido: false }), null);
  lanza400(() => v.entero('4.5'));
  lanza400(() => v.entero('abc'));
  lanza400(() => v.entero(0));
  lanza400(() => v.entero(1e20));
  lanza400(() => v.entero(''));
  assert.equal(v.id('15'), 15);
  assert.equal(v.id(null, 'x', false), null);
  assert.equal(v.decimal('1234.567'), 1234.57);
  assert.equal(v.decimal(0.12345, { decimales: 4, max: 1 }), 0.1235);
  lanza400(() => v.decimal('1e5'));
  lanza400(() => v.decimal(-1));
  lanza400(() => v.decimal(0, { minExclusivo: true }));
  lanza400(() => v.decimal(Infinity));
  lanza400(() => v.decimal(''));
  assert.equal(v.decimal('', { requerido: false }), null);
  assert.equal(v.fecha('2024-02-29'), '2024-02-29');
  lanza400(() => v.fecha('2023-02-29'));
  lanza400(() => v.fecha('2026-13-01'));
  lanza400(() => v.fecha('01/02/2026'));
  lanza400(() => v.fecha(''));
  assert.equal(v.fecha('', { requerido: false }), null);
  assert.equal(v.opcion('a', ['a', 'b']), 'a');
  assert.equal(v.opcion('', ['a'], { requerido: false }), null);
  lanza400(() => v.opcion('c', ['a', 'b']));
  lanza400(() => v.opcion('', ['a']));
  lanza400(() => v.opcion(['a'], ['a']));
  assert.equal(v.booleano('true'), true);
  assert.equal(v.booleano(1), true);
  assert.equal(v.booleano('0'), false);
  assert.equal(v.booleano('quizá', true), true);
});

test('validar correo, contraseña, nombre, teléfono, URL y coordenadas', () => {
  assert.equal(v.correo('  Ana@Correo.MX '), 'ana@correo.mx');
  lanza400(() => v.correo('sin-arroba'));
  lanza400(() => v.correo('a@b'));
  lanza400(() => v.correo('a..b@c.mx'));
  assert.equal(v.correo('', { requerido: false }), null);
  assert.equal(v.password('Secreta123'), 'Secreta123');
  lanza400(() => v.password('corta'));
  lanza400(() => v.password('x'.repeat(65)));
  lanza400(() => v.password('con\u0000nulo1'));
  lanza400(() => v.password(12345678));
  lanza400(() => v.password('Secreta 123'));
  lanza400(() => v.password('Secreta123 '));
  lanza400(() => v.password('Secreta\u00a0123'));
  lanza400(() => v.password('secreta123'));
  lanza400(() => v.password('SecretaSinNum'));
  assert.equal(v.password('Ñandú#2026'), 'Ñandú#2026');
  assert.equal(v.password('Ab1@#$%&xyz'), 'Ab1@#$%&xyz');
  for (const otro of ['Clave-2026', 'Clave_2026', 'Clave.2026', 'Clave!2026', 'Clave?2026', 'Clave*2026', 'Clave+2026', 'Clave/2026', 'Clave¿2026', 'Clave(2026)']) lanza400(() => v.password(otro));
  for (const raro of ['Clave2026😀', 'Clave"2026', "Clave'2026", 'Clave<2026>', 'Clave\\2026', 'Clave{2026}', 'Clave~2026', 'Clave^2026', 'Clave`2026', 'Clave|2026', 'Clave€2026', 'Clave\u200b2026']) {
    lanza400(() => v.password(raro));
  }
  assert.equal(v.nombrePersona("María O'Neil-López"), "María O'Neil-López");
  lanza400(() => v.nombrePersona('Ana123'));
  lanza400(() => v.nombrePersona('<b>Ana</b>'));
  assert.equal(v.telefono('55 5354-9994'), '5553549994');
  assert.equal(v.telefono(''), null);
  lanza400(() => v.telefono('123'));
  lanza400(() => v.telefono('', true));
  assert.equal(v.url('azcapotzalco.cdmx.gob.mx'), 'https://azcapotzalco.cdmx.gob.mx/');
  assert.equal(v.url(''), null);
  lanza400(() => v.url('javascript:alert(1)'));
  lanza400(() => v.url('ftp://x.mx'));
  lanza400(() => v.url('localhost'));
  assert.deepEqual(v.coordenadas('19.43', '-99.13'), { latitud: 19.43, longitud: -99.13 });
  assert.equal(v.coordenadas(null, null), null);
  lanza400(() => v.coordenadas(40, -3));
  lanza400(() => v.coordenadas(null, null, true));
  assert.deepEqual(v.listaIds('3, 4,3'), [3, 4]);
  assert.deepEqual(v.listaIds([]), []);
  lanza400(() => v.listaIds('a,b'));
  lanza400(() => v.listaIds([], { requerido: true }));
  lanza400(() => v.listaIds(Array.from({ length: 10 }, (_, i) => i + 1), { max: 5 }));
});

test('validar cuerpo, paginación y búsqueda', () => {
  assert.deepEqual(v.cuerpo({ body: { a: 1 } }), { a: 1 });
  assert.deepEqual(v.cuerpo({ body: undefined }), {});
  lanza400(() => v.cuerpo({ body: [1, 2] }));
  lanza400(() => v.cuerpo({ body: 'texto' }));
  assert.deepEqual(v.pagina({}), { limite: 50, desplazamiento: 0, pagina: 1 });
  assert.deepEqual(v.pagina({ pagina: '3', limite: '10' }), { limite: 10, desplazamiento: 20, pagina: 3 });
  lanza400(() => v.pagina({ limite: '100000' }));
  assert.equal(v.busqueda('100%_a\\b'), '%100\\%\\_a\\\\b%');
  assert.equal(v.busqueda(''), null);
});

test('errores: traducción de errores de MySQL y de la app', () => {
  assert.deepEqual(traducir(new ErrorApp(404, 'No')), { estado: 404, mensaje: 'No', extra: undefined });
  assert.equal(traducir({ sqlState: '45000', sqlMessage: 'Regla de negocio' }).estado, 409);
  assert.equal(traducir({ sqlState: '45000', sqlMessage: 'Solo el Administrador puede realizar esta acción' }).estado, 403);
  assert.equal(traducir({ code: 'ER_DUP_ENTRY', sqlMessage: "Duplicate entry for key 'participaciones.PRIMARY'" }).mensaje, 'Ya emitiste tu voto en este ciclo');
  assert.equal(traducir({ code: 'ER_DUP_ENTRY', sqlMessage: 'otra cosa' }).mensaje, 'Ese registro ya existe');
  for (const code of ['ER_CHECK_CONSTRAINT_VIOLATED', 'ER_NO_REFERENCED_ROW_2', 'ER_DATA_TOO_LONG', 'ER_TRUNCATED_WRONG_VALUE', 'ER_BAD_NULL_ERROR']) {
    assert.equal(traducir({ code }).estado, 400, code);
  }
  assert.equal(traducir({ code: 'ER_ROW_IS_REFERENCED_2' }).estado, 409);
  assert.equal(traducir({ code: 'ER_LOCK_DEADLOCK' }).estado, 503);
  assert.equal(traducir({ code: 'ECONNREFUSED' }).estado, 503);
  assert.equal(traducir({ code: 'ER_NET_PACKET_TOO_LARGE' }).estado, 413);
  assert.equal(traducir({ type: 'entity.parse.failed' }).estado, 400);
  assert.equal(traducir({ type: 'entity.too.large' }).estado, 413);
  assert.equal(traducir({ type: 'charset.unsupported' }).estado, 415);
  assert.equal(traducir({ status: 400, expose: true }).estado, 400);
  assert.equal(traducir(new Error('boom')).estado, 500);
  assert.equal(traducir({ code: 'ENOENT', syscall: 'connect' }).estado, 503);
  assert.equal(traducir({ code: 'RARO', fatal: true }).estado, 503);
  assert.equal(traducir(null).estado, 500);
});

test('archivos: tipo real, dimensiones, CSV y nombres seguros', () => {
  assert.equal(arch.tipoReal(png()), 'image/png');
  assert.equal(arch.tipoReal(jpegFalso()), 'image/jpeg');
  assert.equal(arch.tipoReal(Buffer.from('%PDF-1.4 hola')), 'application/pdf');
  assert.equal(arch.tipoReal(Buffer.from('GIF89a......')), null);
  assert.equal(arch.tipoReal('no buffer'), null);
  assert.deepEqual(arch.dimensiones(png(30, 20)), { ancho: 30, alto: 20 });
  assert.deepEqual(arch.dimensiones(jpegFalso(640, 480)), { ancho: 640, alto: 480 });
  assert.equal(arch.dimensiones(Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0])), null);
  assert.equal(arch.acotar(40000), null);
  assert.equal(arch.acotar(120), 120);
  const csv = arch.aCsv([{ titulo: 'A', campo: 'a' }, { titulo: 'B', valor: (f) => f.b * 2 }], [{ a: '=SUMA(1)', b: 2 }, { a: 'x,"y"', b: 1 }, { a: null, b: 0 }, { a: { o: 1 }, b: 3 }]);
  const texto = csv.toString('utf8');
  assert.ok(texto.startsWith('﻿A,B'));
  assert.ok(texto.includes("'=SUMA(1),4"), 'evita fórmulas');
  assert.ok(texto.includes('"x,""y""",2'));
  assert.equal(arch.nombreSeguro('Résultados ñ/../x.csv'), 'Resultados_n_._x.csv');
  assert.equal(arch.nombreSeguro(''), 'archivo');
});

test('pdf: documento válido con acentos, tablas y varias páginas', () => {
  const muchos = Array.from({ length: 80 }, (_, i) => ({ tipo: 'dato', etiqueta: `Dato ${i}`, valor: 'Ñandú en Coyoacán (prueba) \\ ' + 'x'.repeat(i) }));
  const d = pdf.documento({
    titulo: 'Título largo '.repeat(8), subtitulo: 'Sub',
    bloques: [{ tipo: 'titulo', texto: 'Sección' }, { tipo: 'destacado', etiqueta: 'Folio', valor: 'CP-1' },
      { tipo: 'tabla', columnas: ['A', 'B'], filas: [['uno', null], ['palabraextremadamentelargasinespacios'.repeat(4), 2]] },
      { tipo: 'parrafo', texto: 'Línea 1\nLínea 2 € “comillas” • — ✓' }, ...muchos],
  });
  const s = d.toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4'));
  assert.ok(s.trimEnd().endsWith('%%EOF'));
  assert.ok((s.match(/\/Type \/Page /g) || []).length >= 2, 'varias páginas');
  assert.ok(s.includes('Coyoac\xe1n'), 'acentos en WinAnsi');
  assert.ok(s.includes('\\(prueba\\)'), 'paréntesis escapados');
  assert.deepEqual(pdf.aWinAnsi('ñ€✓'), [0xf1, 0x80, 63]);
  assert.ok(pdf.ajustar('a b c', 11, 5).length >= 3);
  const xref = Number(/startxref\n(\d+)/.exec(s)[1]);
  assert.equal(s.slice(xref, xref + 4), 'xref', 'tabla xref en la posición correcta');
});

test('seguridad: encabezados, cookies, CSRF y envoltura async', async () => {
  const h = {};
  seg.encabezados({ secure: true }, { setHeader: (k, x) => { h[k] = x; } }, () => {});
  assert.match(h['Content-Security-Policy'], /default-src 'self'/);
  assert.equal(h['X-Frame-Options'], 'DENY');
  assert.ok(h['Strict-Transport-Security']);
  const req = { headers: { cookie: 'a=1; b="dos"; c=%E0%A4%A; a=3; =x; d' } };
  seg.cookies(req, {}, () => {});
  assert.equal(req.cookies.a, '1');
  assert.equal(req.cookies.b, 'dos');
  assert.equal(req.cookies.c, '%E0%A4%A');
  const csrf = (method, hdrs) => new Promise((r) => seg.antiCsrf({ method, get: (k) => hdrs[k] }, {}, (e) => r(e ? e.estado : 200)));
  assert.equal(await csrf('GET', {}), 200);
  assert.equal(await csrf('POST', {}), 403);
  assert.equal(await csrf('POST', { 'X-Prepar': '1' }), 200);
  assert.equal(await csrf('POST', { 'X-Prepar': '1', Origin: 'http://a.mx', Host: 'a.mx' }), 200);
  assert.equal(await csrf('POST', { 'X-Prepar': '1', Origin: 'http://b.mx', Host: 'a.mx' }), 403);
  assert.equal(await csrf('POST', { 'X-Prepar': '1', Origin: 'no es url', Host: 'a.mx' }), 403);
  const err = await new Promise((r) => seg.asincrono(async () => { throw new Error('x'); })({}, {}, r));
  assert.equal(err.message, 'x');
  const err2 = await new Promise((r) => seg.asincrono(() => { throw new Error('y'); })({}, {}, r));
  assert.equal(err2.message, 'y');
});

test('instalador: divide el script respetando DELIMITER, comillas y comentarios', () => {
  const s = sentencias(`-- comentario
CREATE TABLE a (x VARCHAR(5) DEFAULT 'a;b'); -- final
DELIMITER $$
CREATE PROCEDURE p() BEGIN SELECT 1; SELECT 'x$$y'; END$$
DELIMITER ;
INSERT INTO a VALUES ('it''s'), ("d;q");`);
  assert.equal(s.length, 3);
  assert.ok(s[0].includes("'a;b'"));
  assert.ok(s[1].startsWith('CREATE PROCEDURE') && s[1].includes("'x$$y'"));
  assert.ok(s[2].includes("'it''s'"));
});

test('sincronización: lectura flexible de registros de APIs', () => {
  assert.equal(sinc._campo({ NOMGEO: 'Coyoacán' }, ['nomgeo']), 'Coyoacán');
  assert.equal(sinc._campo({ a: '' }, ['a']), null);
  assert.equal(sinc._campo({ 'Estrato IDS': 'Bajo' }, ['estrato_ids']), 'Bajo');
  assert.deepEqual(sinc._deCsv('a;b\n"x;1";"di ""dos""' + '"\r\n\n3;\n'),[{ _fid: 0, a: 'x;1', b: 'di "dos"' }, { _fid: 1, a: '3', b: '' }]);
  assert.deepEqual(sinc._deCsv('solo'), []);
  assert.deepEqual(sinc._punto({ geo_point_2d: '19.4, -99.1' }), { lat: 19.4, lng: -99.1 });
  assert.deepEqual(sinc._punto({ latitud: '19.5', longitud: '-99.2' }), { lat: 19.5, lng: -99.2 });
  assert.equal(sinc._punto({}), null);
});

test('datos abiertos: nombres, alcaldías, geometría y cliente del portal', async () => {
  const geo = require('../server/lib/geo');
  const ckan = require('../server/lib/ckan');
  assert.equal(sinc._titulo('ROMA NORTE II'), 'Roma Norte II');
  assert.equal(sinc._titulo('SAN JUAN DE ARAGÓN (U HAB)'), 'San Juan de Aragón (U Hab)');
  assert.equal(sinc._titulo('Del Valle'), 'Del Valle', 'no cambia textos que ya vienen bien');
  assert.equal(sinc._norm('  Álvaro  Obregón '), 'ALVARO OBREGON');
  assert.equal(sinc._base('COL. ROMA NORTE III'), 'ROMA NORTE');
  const alc = sinc._resolutorAlcaldias([{ id: 1, clave: 'MAC', nombre: 'La Magdalena Contreras' }, { id: 2, clave: 'GAM', nombre: 'Gustavo A. Madero' }, { id: 3, clave: 'AOB', nombre: 'Álvaro Obregón' }]);
  assert.equal(alc('MAGDALENA CONTRERAS').clave, 'MAC');
  assert.equal(alc('Alcaldía Gustavo A. Madero').clave, 'GAM');
  assert.equal(alc('09010').clave, 'AOB');
  assert.equal(alc('AOB').clave, 'AOB');
  assert.equal(alc('Toluca'), null);
  assert.equal(alc(''), null);
  assert.deepEqual(sinc._punto({ geo_point_2d: { lat: 19.4, lon: -99.1 } }), { lat: 19.4, lng: -99.1 });
  assert.deepEqual(sinc._punto({ geo_point_2d: [19.4, -99.1] }), { lat: 19.4, lng: -99.1 });
  const sq = { type: 'Polygon', coordinates: [[[-99.2, 19.4], [-99.1, 19.4], [-99.1, 19.5], [-99.2, 19.5], [-99.2, 19.4]], [[-99.16, 19.44], [-99.14, 19.44], [-99.14, 19.46], [-99.16, 19.46], [-99.16, 19.44]]] };
  assert.equal(geo.contiene(sq, -99.18, 19.42), true);
  assert.equal(geo.contiene(sq, -99.15, 19.45), false, 'respeta huecos');
  const c = geo.centro(sq);
  assert.ok(Math.abs(c.lat - 19.45) < 1e-6 && Math.abs(c.lng + 99.15) < 1e-6);
  assert.deepEqual(geo.centro({ type: 'Point', coordinates: [-99.1, 19.4] }), { lat: 19.4, lng: -99.1 });
  assert.deepEqual(geo.centro({ type: 'Polygon', coordinates: [[[-99, 19], [-99, 19], [-99, 19]]] }), { lat: 19, lng: -99 });
  assert.equal(geo.geometria('{"type":"Point","coordinates":[500000,2100000]}'), null, 'coordenadas en metros no se aceptan');
  assert.equal(geo.geometria('no es json'), null);
  assert.equal(geo.geometria({ type: 'LineString', coordinates: [[0, 0]] }), null);
  assert.equal(geo.geometria({ type: 'Feature', geometry: sq }).type, 'Polygon');
  const idx = geo.indice([{ id: 7, geom: sq }, { id: 8, geom: { type: 'MultiPolygon', coordinates: [[[[-99, 19.3], [-98.95, 19.3], [-98.95, 19.35], [-99, 19.3]]]] } }, { id: 9, geom: null }]);
  assert.equal(idx.total, 2);
  assert.equal(idx.buscar(-99.18, 19.42), 7);
  assert.equal(idx.buscar(-98.96, 19.31), 8);
  assert.equal(idx.buscar(-50, 10), null);
  assert.equal(idx.buscar(NaN, 1), null);
  assert.ok(Math.abs(geo.distanciaKm({ lat: 19.4, lng: -99.1 }, { lat: 19.5, lng: -99.1 }) - 11.12) < 0.05);
  assert.equal(geo.enCdmx(19.4, -99.1), true);
  assert.equal(geo.enCdmx(40.4, -3.7), false);
  assert.equal(ckan.raizApi('https://datos.cdmx.gob.mx/api/3/action/datastore_search'), 'https://datos.cdmx.gob.mx/api/3/action');
  assert.throws(() => ckan.raizApi('https://www.inegi.org.mx/app/api/'), /CKAN/);
  const real = global.fetch;
  try {
    const flujo = (n) => ({ ok: true, status: 200, headers: { get: () => null }, body: new ReadableStream({ start(ctl) { ctl.enqueue(new Uint8Array(n)); ctl.close(); } }) });
    global.fetch = async () => flujo(10);
    assert.equal((await ckan.descargarTexto('https://x.mx/a', { maxBytes: 100 })).length, 10);
    global.fetch = async () => flujo(200);
    await assert.rejects(ckan.descargarTexto('https://x.mx/a', { maxBytes: 100 }), /demasiado grande/);
    global.fetch = async () => ({ ok: true, status: 200, headers: { get: () => '999999' } });
    await assert.rejects(ckan.descargarTexto('https://x.mx/a', { maxBytes: 100 }), /demasiado grande/);
    global.fetch = async () => ({ ok: false, status: 404, headers: { get: () => null } });
    await assert.rejects(ckan.descargarTexto('https://x.mx/a'), (e) => e.noEncontrado === true);
    global.fetch = async () => ({ ok: true, status: 200, json: async () => { throw new Error('x'); } });
    await assert.rejects(ckan.accion('https://x.mx/api/3/action', 'package_show', { id: 'a', f: { b: 1 } }), /respuesta 200/);
    global.fetch = async () => { throw new Error('sin red'); };
    await assert.rejects(ckan.accion('https://x.mx/api/3/action', 'package_show', {}), /No se pudo conectar/);
  } finally {
    global.fetch = real;
  }
});

