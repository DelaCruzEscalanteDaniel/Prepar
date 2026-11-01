'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('./ayuda');
const { crearApp } = require('../server/app');

const RARO = [
  null, true, false, -1, 0, 1.5, 2 ** 53, '', ' ', 'abc', '-1', '0', '1e999', 'NaN', '99999999999999999999999',
  "1' OR '1'='1", "'; DROP TABLE usuarios; --", '<script>alert(1)</script>', '\u0000\u0001', '٣٤', '😀'.repeat(300),
  'x'.repeat(5000), [], [1, 2], {}, { $gt: '' }, ['a', { b: 1 }], '2026-13-45', '../../etc/passwd', '%00', '__proto__',
];
const CAMPOS = [
  'correo', 'password', 'nombre', 'fecha_nacimiento', 'genero', 'unidad_territorial_id', 'acepta_aviso', 'actual', 'nueva',
  'confirmar', 'idioma', 'recibir_correos', 'token', 'contenido', 'rubro_id', 'titulo', 'descripcion', 'costo_estimado',
  'calle', 'numero', 'referencias', 'latitud', 'longitud', 'imagen_uuid', 'idea_id', 'proyecto_id', 'ids', 'tipo', 'fotos',
  'puntuacion', 'comentario', 'resultado', 'observacion', 'tipo_objeto', 'objeto_id', 'accion', 'motivo', 'criterios', 'emitir',
  'justificacion', 'metodo', 'porcentaje', 'monto_ejercido', 'estatus', 'nota', 'justificacion_inejecutable', 'texto',
  'alcaldia_id', 'cargo', 'nombre_titular', 'temas', 'direccion', 'telefono', 'sitio_web', 'mensaje', 'alcance',
  'anio_simulado', 'presupuesto_total', 'alcaldias', 'unidades', 'origen_indices', 'porcentaje_partes_iguales', 'fases',
  'poblacion', 'poblacion_flotante', 'indice_pobreza', 'indice_delictivo', 'es_pueblo_originario', 'fase', 'funciones',
  'recurso', 'activa', 'frecuencia_minutos', 'quitar_imagen',
];
const PARAMS = ['abc', '-1', '0', '1', '2', '999999999', '99999999999999999999', "1'--", '%2e%2e', '00000000-0000-0000-0000-000000000000'];
const QUERIES = ['', '?q=%25%25%25', '?ciclo=abc', '?alcaldia=-5', '?pagina=0&limite=100000', '?estatus=hackeado', '?desde=2026-02-31',
  '?tipo[]=x', '?q=a&q=b', '?min_apoyos=-1', '?mini=1', `?q=${'z'.repeat(200)}`, '?orden=apoyos;DROP', '?categoria=imagen_proyecto'];

let semilla = 20261023;
const azar = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648; };
const elige = (arr) => arr[Math.floor(azar() * arr.length)];

function cuerpoRaro() {
  const o = {};
  const n = 1 + Math.floor(azar() * 8);
  for (let i = 0; i < n; i += 1) o[elige(CAMPOS)] = elige(RARO);
  return o;
}

function rutasApi() {
  const app = crearApp();
  const rutas = [];
  const api = app._router.stack.find((c) => c.name === 'router' && String(c.regexp).includes('api'));
  for (const capa of api.handle.stack) {
    if (capa.name !== 'router') continue;
    for (const c of capa.handle.stack) {
      if (!c.route) continue;
      for (const m of Object.keys(c.route.methods)) rutas.push({ metodo: m.toUpperCase(), ruta: c.route.path });
    }
  }
  return rutas;
}

const visitantes = {};

test.before(async () => {
  await A.iniciar();
  await A.crearAdmin();
  const admin = A.cliente();
  await admin.post('/api/auth/login', { correo: 'admin@prepar.mx', password: 'Admin12345' });
  const f = await admin.post('/api/admin/funcionarios', { nombre: 'Funcionaria Prueba', correo: 'f@prepar.mx', alcaldia_id: 2,
    funciones: ['directorio', 'moderacion', 'revision_registros', 'dictaminacion', 'consulta', 'seguimiento'] });
  const func = A.cliente();
  await func.post('/api/auth/login', { correo: 'f@prepar.mx', password: f.datos.passwordTemporal });
  await func.post('/api/auth/cambiar-password', { actual: f.datos.passwordTemporal, nueva: 'PruebaSegura#26' });
  const c = await admin.post('/api/admin/ciclos', { nombre: 'Ciclo robustez', anio_simulado: 2026, presupuesto_total: 1000000, alcaldias: [2] });
  await admin.post(`/api/admin/ciclos/${c.datos.id}/fase`, { fase: 'diagnostico_registro' });
  const ciu = A.cliente();
  await ciu.post('/api/auth/registro', { nombre: 'Vecino Prueba', correo: 'v@correo.mx', password: 'Prepar2026', fecha_nacimiento: '1990-01-01',
    genero: 'hombre', unidad_territorial_id: 3, acepta_aviso: true });
  Object.assign(visitantes, { anonimo: A.cliente(), ciudadano: ciu, funcionario: func, administrador: admin });
  visitantes.cicloId = c.datos.id;
});
test.after(async () => { await A.detener(); });

test('ninguna ruta responde 500 con datos basura', async () => {
  const rutas = rutasApi();
  assert.ok(rutas.length > 60, `se encontraron ${rutas.length} rutas`);
  const fallos = [];
  let total = 0;
  for (const quien of ['anonimo', 'ciudadano', 'funcionario', 'administrador']) {
    const c = visitantes[quien];
    for (const { metodo, ruta } of rutas) {
      if (ruta === '/auth/logout' || ruta.includes('/cerrar') || ruta.includes('/restablecer')) continue;
      for (let i = 0; i < 6; i += 1) {
        const r = ruta.replace(/:[a-z]+/gi, () => elige(PARAMS)) + elige(QUERIES);
        const cuerpo = i === 0 ? undefined : (i === 1 ? '{"roto": ' : (i === 2 ? [1, 2, 3] : cuerpoRaro()));
        const res = await c.pedir(metodo, `/api${r}`, metodo === 'GET' ? undefined : cuerpo);
        total += 1;
        if (res.estado >= 500) fallos.push(`${quien} ${metodo} ${r} → ${res.estado} ${JSON.stringify(res.datos).slice(0, 120)}`);
      }
    }
  }
  assert.deepEqual(fallos, [], `Errores 500 (${fallos.length} de ${total}):\n${fallos.slice(0, 20).join('\n')}`);
  const salud = await A.cliente().get('/salud');
  assert.equal(salud.estado, 200, 'el servidor sigue vivo');
});

test('cuerpos malformados, enormes o con tipo equivocado', async () => {
  const c = visitantes.ciudadano;
  assert.equal((await c.pedir('POST', '/api/foro/ideas', '{"contenido": "sin cerrar')).estado, 400);
  assert.equal((await c.pedir('POST', '/api/foro/ideas', JSON.stringify({ contenido: 'x'.repeat(200000) }))).estado, 413);
  assert.equal((await c.pedir('POST', '/api/foro/ideas', 'texto plano', { headers: { 'Content-Type': 'text/plain' } })).estado, 400);
  assert.equal((await c.pedir('POST', '/api/archivos?categoria=imagen_proyecto', Buffer.alloc(6 * 1024 * 1024, 255), { headers: { 'Content-Type': 'image/jpeg' } })).estado, 413);
  assert.equal((await c.pedir('POST', '/api/archivos?categoria=imagen_proyecto', Buffer.from('%PDF-1.4 falso'), { headers: { 'Content-Type': 'image/png' } })).estado, 400);
  assert.equal((await c.pedir('POST', '/api/archivos?categoria=convocatoria', A.png(), { headers: { 'Content-Type': 'image/png' } })).estado, 400);
  assert.equal((await c.pedir('GET', '/api/archivos/..%2F..%2Fpackage.json')).estado, 404);
  const r = await fetch(`${A.base}/api/foro/ideas`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: c.cookie }, body: '{}' });
  assert.equal(r.status, 403);
  const r2 = await fetch(`${A.base}/api/foro/ideas`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Prepar': '1', Origin: 'https://malicioso.com', Cookie: c.cookie }, body: '{}' });
  assert.equal(r2.status, 403);
  const r3 = await fetch(`${A.base}/api/auth/yo`, { headers: { Cookie: 'prepar_sesion=' + 'A'.repeat(43) } });
  assert.equal(r3.status, 401);
  const r4 = await fetch(`${A.base}/api/auth/yo`, { headers: { Cookie: 'prepar_sesion=%E0%A4%A' } });
  assert.equal(r4.status, 401);
  assert.equal((await c.get('/api/no/existe')).estado, 404);
  const pag = await fetch(`${A.base}/no-existe.html`, { headers: { Accept: 'text/html' } });
  assert.equal(pag.status, 404);
});

test('inyección SQL y XSS se guardan como texto, sin efecto', async () => {
  const c = visitantes.ciudadano;
  const texto = "<img src=x onerror=alert(1)> '; DROP TABLE ideas; --";
  const r = await c.post('/api/foro/ideas', { rubro_id: 1, contenido: texto });
  assert.equal(r.estado, 201);
  const foro = await c.get(`/api/foro?q=${encodeURIComponent("' OR 1=1 --")}`);
  assert.equal(foro.estado, 200);
  assert.equal(foro.datos.ideas.length, 0, 'la búsqueda no se puede inyectar');
  const todo = await c.get('/api/foro');
  assert.equal(todo.datos.ideas[0].contenido, texto, 'se guarda literal (el frontend lo escapa)');
  const tablas = await A.db.conSistema((con) => con.uno("SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'ideas'"));
  assert.equal(tablas.n, 1);
});

test('peticiones simultáneas: folios únicos y apoyos consistentes', async () => {
  const ciudadanos = [];
  for (let i = 0; i < 25; i += 1) {
    const c = A.cliente();
    const r = await c.post('/api/auth/registro', { nombre: 'Vecina Simultanea', correo: `sim${i}@correo.mx`, password: 'Prepar2026',
      fecha_nacimiento: '1985-06-15', genero: 'mujer', unidad_territorial_id: i % 2 ? 3 : 4, acepta_aviso: true });
    assert.equal(r.estado, 201);
    ciudadanos.push(c);
  }
  const res = await Promise.all(ciudadanos.map((c, i) => c.post('/api/proyectos', {
    titulo: `Proyecto simultáneo ${i}`, descripcion: 'Proyecto creado al mismo tiempo que otros', rubro_id: 1, costo_estimado: 1000 + i, calle: 'Calle Prueba',
  })));
  res.forEach((r) => assert.equal(r.estado, 201, JSON.stringify(r.datos)));
  const folios = new Set(res.map((r) => r.datos.folio));
  assert.equal(folios.size, 25, 'ningún folio repetido');
  const idea = await ciudadanos[1].post('/api/foro/ideas', { rubro_id: 1, contenido: 'Idea para probar apoyos simultáneos' });
  const mismos = ciudadanos.filter((_, i) => i % 2 === 1 && i !== 1);
  await Promise.all([...mismos, ...mismos].map((c) => c.post(`/api/foro/ideas/${idea.datos.id}/apoyo`)));
  const total = await A.db.conSistema((con) => con.uno('SELECT total_apoyos, (SELECT COUNT(*) FROM apoyos_idea WHERE idea_id = ?) AS reales FROM ideas WHERE id = ?', [idea.datos.id, idea.datos.id]));
  assert.equal(total.total_apoyos, total.reales, 'el contador coincide con los apoyos reales');
  assert.equal(total.reales, mismos.length);
  const lecturas = await Promise.all(Array.from({ length: 200 }, (_, i) => ciudadanos[i % 25].get(i % 2 ? '/api/foro' : '/api/publico/estado')));
  assert.ok(lecturas.every((r) => r.estado === 200), 'todas las lecturas respondieron');
});

test('las variables de sesión no se filtran entre peticiones del pool', async () => {
  const res = await Promise.all(Array.from({ length: 60 }, (_, i) => {
    const quien = ['ciudadano', 'funcionario', 'administrador'][i % 3];
    const ruta = { ciudadano: '/api/ciudadano/panel', funcionario: '/api/func/panel', administrador: '/api/admin/resumen' }[quien];
    return visitantes[quien].get(ruta);
  }));
  assert.ok(res.every((r) => r.estado === 200), res.map((r) => r.estado).join(','));
  const vals = await Promise.all(Array.from({ length: 12 }, () => A.db.conSistema((con) => con.uno('SELECT @usuario_id AS u, @interno AS i'))));
  for (const v of vals) {
    assert.equal(v.u, null);
    assert.equal(Number(v.i), 0);
  }
});

test('el limitador bloquea al superar el máximo y lo indica con 429', async () => {
  const { limitador } = require('../server/lib/seguridad');
  const lim = limitador({ ventanaMs: 60000, maximo: 3, clave: () => 'prueba' });
  const resultados = [];
  for (let i = 0; i < 5; i += 1) {
    const res = { setHeader() {}, on() {} };
    await new Promise((r) => lim({ ip: '1.1.1.1' }, res, (e) => { resultados.push(e ? e.estado : 200); r(); }));
  }
  assert.ok(resultados.every((x) => x === 200 || x === 429));
  const lim2 = limitador({ ventanaMs: 60000, maximo: 1, clave: () => 'p2', contarSi: (e) => e === 401 });
  let fin;
  const res2 = { setHeader() {}, statusCode: 401, on: (_, f) => { fin = f; } };
  await new Promise((r) => lim2({}, res2, () => r()));
  fin();
  for (let i = 0; i < 120; i += 1) {
    await new Promise((r) => lim2({}, { setHeader() {}, statusCode: 401, on: (_, f) => f() }, () => r()));
  }
  const bloqueado = await new Promise((r) => lim2({}, { setHeader() {}, on() {} }, (e) => r(e && e.estado)));
  assert.equal(bloqueado, 429);
  lim.reiniciar();
  lim2.reiniciar();
});

test('si MySQL corta las conexiones abiertas, el sistema se reconecta solo y no responde 503', async () => {
  const pool = A.db.obtenerPool();
  await Promise.all(Array.from({ length: 6 }, () => A.db.conSistema((con) => con.q('SELECT SLEEP(0.05)'))));
  const ids = await A.db.conSistema((con) => con.q('SELECT ID AS id FROM information_schema.PROCESSLIST WHERE DB = DATABASE() AND ID <> CONNECTION_ID()'));
  assert.ok(ids.length > 0);
  const mysql = require('mysql2/promise');
  const cfg = pool.pool.config.connectionConfig;
  const admin = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, socketPath: cfg.socketPath });
  try {
    for (const { id } of ids) await admin.query('KILL CONNECTION ?', [id]).catch(() => {});
  } finally {
    await admin.end();
  }
  const r = await Promise.all(Array.from({ length: 8 }, () => A.db.conSistema((con) => con.uno('SELECT 1 AS uno'))));
  assert.ok(r.every((x) => Number(x.uno) === 1), 'todas las consultas responden tras el corte');
  const c = A.cliente();
  const pub = await c.get('/api/publico/estado');
  assert.equal(pub.estado, 200);
});

test('una conexión que murió en silencio (ECONNRESET al usarla) se descarta y se reintenta con otra', async () => {
  const pool = A.db.obtenerPool();
  const original = pool.getConnection.bind(pool);
  let destruidas = 0;
  let pendientes = 2;
  pool.getConnection = async () => {
    if (pendientes > 0) {
      pendientes -= 1;
      const e = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET', fatal: true, syscall: 'read' });
      return { query: () => Promise.reject(e), destroy: () => { destruidas += 1; }, release: () => {} };
    }
    return original();
  };
  try {
    const r = await A.db.conSistema((con) => con.uno('SELECT 2 AS dos'));
    assert.equal(Number(r.dos), 2);
    assert.equal(destruidas, 2, 'las conexiones muertas se destruyen, no vuelven al pool');
    pendientes = 5;
    await assert.rejects(A.db.conSistema((con) => con.uno('SELECT 1')), /ECONNRESET/, 'si sigue fallando, se rinde y avisa');
  } finally {
    pool.getConnection = original;
  }
  const ok = await A.db.conSistema((con) => con.uno('SELECT 3 AS tres'));
  assert.equal(Number(ok.tres), 3);
});

test('sin conexión con MySQL las tareas automáticas dan un solo aviso claro', async () => {
  const log = require('../server/lib/log');
  const config = require('../server/config');
  const antes = config.registrarEnConsola;
  const salida = [];
  const original = console.log;
  config.registrarEnConsola = true;
  console.log = (...a) => salida.push(a.join(' '));
  try {
    const e = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT', syscall: 'connect' });
    for (let i = 0; i < 6; i += 1) log.tarea('No se pudo procesar la cola de correos:', e);
    log.tarea('No se pudo procesar la cola de correos:', new Error('otra cosa'));
  } finally {
    console.log = original;
    config.registrarEnConsola = antes;
  }
  const deBd = salida.filter((x) => /Sin conexión con MySQL \(ETIMEDOUT\)/.test(x));
  assert.equal(deBd.length, 1, salida.join('\n'));
  assert.match(deBd[0], /DB_HOST/);
  assert.ok(salida.some((x) => /cola de correos: otra cosa/.test(x)), 'los demás errores se siguen mostrando');
  const { esErrorConexion } = require('../server/lib/errores');
  assert.equal(esErrorConexion({ code: 'ECONNRESET' }), true);
  assert.equal(esErrorConexion({ code: 'ER_DUP_ENTRY', sqlState: '23000' }), false);
});

test('si MySQL no se alcanza, se responde 503 al instante en lugar de esperar en cada petición', async () => {
  const pool = A.db.obtenerPool();
  const original = pool.getConnection.bind(pool);
  let intentos = 0;
  pool.getConnection = async () => {
    intentos += 1;
    await new Promise((r) => setTimeout(r, 300));
    throw Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT', syscall: 'connect' });
  };
  try {
    const c = A.cliente();
    require('../server/routes/publico').invalidarEstado();
    const primera = await c.get('/api/publico/estado');
    assert.equal(primera.estado, 503);
    assert.match(primera.datos.error, /base de datos no está disponible/);
    const t = Date.now();
    const otras = await Promise.all(Array.from({ length: 10 }, () => c.get('/salud')));
    assert.ok(otras.every((r) => r.estado === 503), otras.map((r) => r.estado).join(','));
    assert.ok(Date.now() - t < 250, `las siguientes no esperan el tiempo de conexión (${Date.now() - t} ms)`);
    assert.equal(intentos, 1, 'no se insiste mientras la base sigue caída');
  } finally {
    pool.getConnection = original;
    A.db._reiniciarCaida();
  }
  require('../server/routes/publico').invalidarEstado();
  const ok = await A.cliente().get('/api/publico/estado');
  assert.equal(ok.estado, 200, 'se recupera cuando la base vuelve');
  assert.equal((await A.cliente().get('/salud')).estado, 200);
});

