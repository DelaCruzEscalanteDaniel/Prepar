'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('./ayuda');

const AZC = 2;
const COY = 4;
const CLAVERIA = 3;

const ok = (r, msg) => assert.ok(r.estado >= 200 && r.estado < 300, `${msg || ''} → ${r.estado} ${JSON.stringify(r.datos).slice(0, 300)}`);
const falla = (r, estado, msg) => assert.equal(r.estado, estado, `${msg || ''} → ${r.estado} ${JSON.stringify(r.datos).slice(0, 300)}`);

const e = {};

test.before(async () => {
  await A.iniciar();
  await A.crearAdmin();
  e.admin = A.cliente();
  ok(await e.admin.post('/api/auth/login', { correo: 'admin@prepar.mx', password: 'Admin12345' }));
});
test.after(async () => { await A.detener(); });

async function cicloConFechas(nombre, alcaldias) {
  const r = await e.admin.post('/api/admin/ciclos', { nombre, anio_simulado: 2026, presupuesto_total: 5000000, alcaldias, origen_indices: 'aleatorio' });
  ok(r, `crear ${nombre}`);
  const det = await e.admin.get(`/api/admin/ciclos/${r.datos.id}`);
  const fases = det.datos.fases.map((f, i) => ({ fase_id: f.fase_id, fecha_inicio: `2026-0${i + 1}-01`, fecha_fin: `2026-0${i + 1}-25` }));
  ok(await e.admin.put(`/api/admin/ciclos/${r.datos.id}/fases`, { fases }), `fechas de ${nombre}`);
  return r.datos.id;
}

const cicloEnBd = (id) => A.db.conSistema((con) => con.uno(
  'SELECT c.estado, c.tipo, c.pausado_en, f.clave AS fase FROM ciclos c LEFT JOIN fases f ON f.id = c.fase_actual_id WHERE c.id = ?', [id]));
const activos = () => A.db.conSistema((con) => con.uno("SELECT COUNT(*) AS n FROM ciclos WHERE estado = 'activo'"));

test('un ciclo de práctica nuevo se activa en la fase pedida (botón «Activar el ciclo»)', async () => {
  e.a = await cicloConFechas('Práctica A', [AZC]);
  ok(await e.admin.post(`/api/admin/ciclos/${e.a}/fase`, { fase: 'convocatoria' }), 'activar A');
  const c = await cicloEnBd(e.a);
  assert.equal(c.estado, 'activo');
  assert.equal(c.fase, 'convocatoria');
  ok(await e.admin.post(`/api/admin/ciclos/${e.a}/fase`, { fase: 'diagnostico_registro' }), 'avanzar A');
  const pub = await A.cliente().get('/api/publico/estado');
  assert.equal(pub.datos.ciclo.id, e.a);
  assert.equal(pub.datos.ciclo.fase, 'diagnostico_registro');
});

test('modo práctica: cambiar de ciclo pausa el anterior y conserva su fase y sus datos', async () => {
  const sinFechas = await e.admin.post('/api/admin/ciclos', { nombre: 'Práctica sin fechas', anio_simulado: 2026, presupuesto_total: 100000, alcaldias: [COY], origen_indices: 'aleatorio' });
  ok(sinFechas);
  falla(await e.admin.post('/api/admin/modo', { modo: 'practica', ciclo_id: sinFechas.datos.id }), 409, 'sin fechas no se activa');
  ok(await e.admin.del(`/api/admin/ciclos/${sinFechas.datos.id}`));

  e.b = await cicloConFechas('Práctica B', [COY]);
  const r = await e.admin.post('/api/admin/modo', { modo: 'practica', ciclo_id: e.b });
  ok(r, 'activar B desde el modo');
  const b = await cicloEnBd(e.b);
  assert.equal(b.estado, 'activo');
  assert.ok(b.fase, 'B queda con una fase');
  const a = await cicloEnBd(e.a);
  assert.equal(a.estado, 'borrador');
  assert.ok(a.pausado_en, 'A queda pausado');
  assert.equal(a.fase, 'diagnostico_registro', 'A conserva su fase');
  assert.equal((await activos()).n, 1, 'solo un ciclo activo');

  const pub = await A.cliente().get('/api/publico/estado');
  assert.equal(pub.datos.ciclo.id, e.b, 'el público ve el ciclo nuevo de inmediato');

  const m = await e.admin.get('/api/admin/modo');
  ok(m);
  assert.equal(m.datos.modo, 'practica');
  assert.equal(m.datos.activo.id, e.b);
  assert.ok(m.datos.practicas.some((c) => c.id === e.a && c.pausado_en));

  const lista = await e.admin.get('/api/admin/ciclos');
  assert.ok(lista.datos.some((c) => c.id === e.a && c.pausado_en), 'la lista de ciclos marca el pausado');

  falla(await e.admin.del(`/api/admin/ciclos/${e.a}`), 409, 'un pausado no se borra');
  falla(await e.admin.put(`/api/admin/ciclos/${e.a}/unidades/${CLAVERIA}`, { poblacion: 1, poblacion_flotante: 0, indice_pobreza: 0.1, indice_delictivo: 0.1, es_pueblo_originario: false }), 409);
  falla(await e.admin.post(`/api/admin/ciclos/${e.a}/presupuesto`), 409, 'un pausado no recalcula');
  ok(await e.admin.put(`/api/admin/ciclos/${e.a}`, { nombre: 'Práctica A (renombrada)', anio_simulado: 2026, presupuesto_total: 1 }), 'solo cambia el nombre');
  const det = await e.admin.get(`/api/admin/ciclos/${e.a}`);
  assert.equal(det.datos.ciclo.nombre, 'Práctica A (renombrada)');
  assert.equal(Number(det.datos.ciclo.presupuesto_total), 5000000, 'el presupuesto de un pausado no cambia');

  const igual = await e.admin.post('/api/admin/modo', { modo: 'practica', ciclo_id: e.b });
  ok(igual);
  assert.ok(igual.datos.sinCambio);

  ok(await e.admin.post('/api/admin/modo', { modo: 'practica', ciclo_id: e.a }), 'volver a A');
  const a2 = await cicloEnBd(e.a);
  assert.equal(a2.estado, 'activo');
  assert.equal(a2.fase, 'diagnostico_registro', 'A regresa en la fase donde se quedó');
  assert.equal(a2.pausado_en, null);
  assert.equal((await cicloEnBd(e.b)).estado, 'borrador');

  ok(await e.admin.post(`/api/admin/ciclos/${e.b}/fase`, { fase: 'sorteo_difusion' }), '«Activar en esta fase» sobre un pausado');
  assert.equal((await cicloEnBd(e.b)).fase, 'sorteo_difusion', 'respeta la fase elegida');
  assert.ok((await cicloEnBd(e.a)).pausado_en);
  ok(await e.admin.post('/api/admin/modo', { modo: 'practica', ciclo_id: e.a }));
  assert.equal((await cicloEnBd(e.a)).fase, 'diagnostico_registro');
});

test('con la votación abierta no se puede cambiar de ciclo', async () => {
  ok(await e.admin.post(`/api/admin/ciclos/${e.a}/fase`, { fase: 'consulta' }));
  ok(await e.admin.post(`/api/admin/ciclos/${e.a}/votacion`, { accion: 'abrir' }));
  falla(await e.admin.post('/api/admin/modo', { modo: 'practica', ciclo_id: e.b }), 409);
  falla(await e.admin.post(`/api/admin/ciclos/${e.b}/fase`, { fase: 'convocatoria' }), 409);
  assert.equal((await cicloEnBd(e.a)).estado, 'activo');
  ok(await e.admin.post(`/api/admin/ciclos/${e.a}/votacion`, { accion: 'cerrar' }));
});

test('calendario de práctica', async () => {
  const modo = require('../server/lib/modo');
  const ini = require('../server/lib/ciclosIniciales');
  assert.match(modo.hoyLocal(), /^\d{4}-\d{2}-\d{2}$/);

  const hoy = new Date(2026, 9, 31);
  const cal = ini.calendarioPractica(hoy);
  const claves = Object.keys(cal);
  assert.equal(claves.length, 8);
  for (let i = 1; i < claves.length; i += 1) {
    const fin = new Date(`${cal[claves[i - 1]][1]}T12:00:00`);
    const sig = new Date(`${cal[claves[i]][0]}T12:00:00`);
    assert.equal(Math.round((sig - fin) / 86400000), 1, `sin huecos entre ${claves[i - 1]} y ${claves[i]}`);
  }
  assert.ok(cal.diagnostico_registro[0] <= '2026-10-31' && '2026-10-31' <= cal.diagnostico_registro[1], 'hoy cae en diagnóstico');
});

test('ciclos iniciales: no se duplican y la limpieza no toca ciclos usados', async () => {
  const ini = require('../server/lib/ciclosIniciales');
  const roto = await A.db.conSistema((con) => con.q(
    "INSERT INTO ciclos (nombre, anio_simulado, presupuesto_total, estado) VALUES (?, 2026, 1, 'borrador')", [ini.PRACTICA.nombre]));
  await ini.asegurar();
  await ini.asegurar();
  const q = await A.db.conSistema((con) => con.q('SELECT id, tipo FROM ciclos WHERE nombre = ?', [ini.PRACTICA.nombre]));
  assert.ok(!q.some((c) => c.id === roto.insertId), 'se borró el borrador incompleto');
  assert.ok(await A.db.conSistema((con) => con.uno('SELECT id FROM ciclos WHERE id = ?', [e.a])), 'los ciclos del Administrador siguen ahí');
  assert.ok(await A.db.conSistema((con) => con.uno('SELECT id FROM ciclos WHERE id = ?', [e.b])));
  assert.equal((await activos()).n, 1);
});

test('rutas del modo: solo el Administrador, y nunca 500 con datos basura', async () => {
  const anon = A.cliente();
  falla(await anon.get('/api/admin/modo'), 401);
  falla(await anon.post('/api/admin/modo', { modo: 'oficial' }), 401);
  const c = A.cliente();
  ok(await c.post('/api/auth/registro', {
    nombre: 'Vecina de Prueba', correo: 'vecina.modo@correo.mx', password: 'Prepar2026', fecha_nacimiento: '1990-01-01', genero: 'mujer', unidad_territorial_id: CLAVERIA, acepta_aviso: true,
  }));
  falla(await c.get('/api/admin/modo'), 403);
  falla(await c.post('/api/admin/modo', { modo: 'practica', ciclo_id: e.b }), 403);

  const basura = [
    {}, { modo: 'x' }, { modo: null }, { modo: ['oficial'] }, { modo: { $ne: 1 } }, { modo: 'practica' }, { modo: 'practica', ciclo_id: 'abc' },
    { modo: 'practica', ciclo_id: -1 }, { modo: 'practica', ciclo_id: 1e30 }, { modo: 'practica', ciclo_id: 999998 }, { modo: 'practica', ciclo_id: 999999 },
    { modo: 'oficial', ciclo_id: e.a }, { modo: 'oficial', ciclo_id: "1' OR '1'='1" }, { modo: 'practica', ciclo_id: { a: 1 } }, { modo: 'x'.repeat(100000) },
  ];
  for (const b of basura) {
    const r = await e.admin.post('/api/admin/modo', b);
    assert.ok(r.estado < 500, `${JSON.stringify(b).slice(0, 80)} → ${r.estado}`);
  }
  const r = await e.admin.post('/api/admin/modo', { modo: 'oficial', ciclo_id: e.a });
  assert.ok(r.estado === 409 || r.estado === 200);
  for (const ruta of ['/api/admin/ciclos/abc/fase', '/api/admin/ciclos/-1/fase', '/api/admin/ciclos/999999/fase']) {
    const x = await e.admin.post(ruta, { fase: 'convocatoria' });
    assert.ok(x.estado >= 400 && x.estado < 500, `${ruta} → ${x.estado}`);
  }
  assert.equal((await activos()).n, 1, 'la basura no cambió el ciclo activo');
});

test('cambios de ciclo simultáneos dejan un solo ciclo activo', async () => {
  const intentos = [];
  for (let i = 0; i < 6; i += 1) {
    intentos.push(e.admin.post('/api/admin/modo', { modo: 'practica', ciclo_id: i % 2 ? e.a : e.b }));
    intentos.push(e.admin.post('/api/admin/modo', { modo: 'oficial' }));
  }
  const rs = await Promise.all(intentos);
  for (const r of rs) assert.ok(r.estado < 500, `→ ${r.estado} ${JSON.stringify(r.datos).slice(0, 200)}`);
  assert.equal((await activos()).n, 1);
  const pausados = await A.db.conSistema((con) => con.uno("SELECT COUNT(*) AS n FROM ciclos WHERE estado = 'activo' AND pausado_en IS NOT NULL"));
  assert.equal(pausados.n, 0);
});

test('la contraseña temporal no se guarda en la cola si no hay correo, y se oculta tras enviarse', async () => {
  const correo = require('../server/lib/correo');
  assert.equal(correo.configurado(), false);
  const r = await e.admin.post('/api/admin/funcionarios', { nombre: 'Funcionaria Modo', correo: 'func.modo@prepar.mx', alcaldia_id: AZC, funciones: ['moderacion'] });
  ok(r);
  const fila = await A.db.conSistema((con) => con.uno("SELECT COUNT(*) AS n FROM correos_salida WHERE destinatario = 'func.modo@prepar.mx' AND plantilla = 'contrasena_temporal'"));
  assert.equal(fila.n, 0);
  await A.db.conSistema(async (con) => {
    const ins = await con.q(`INSERT INTO correos_salida (destinatario, asunto, cuerpo, plantilla, estado)
      VALUES ('x@prepar.mx', 'a', 'Correo: x@prepar.mx\nContraseña temporal: Ab3#kP9z!\n\nTu nueva contraseña temporal es: Zz9@xY1q\nfin', 'contrasena_temporal', 'enviado')`);
    await con.q(`${correo.SQL_OCULTAR_TEMPORAL} WHERE id = ?`, [ins.insertId]);
    const c = await con.uno('SELECT cuerpo FROM correos_salida WHERE id = ?', [ins.insertId]);
    assert.ok(!c.cuerpo.includes('Ab3#kP9z!') && !c.cuerpo.includes('Zz9@xY1q'), c.cuerpo);
    assert.ok(c.cuerpo.includes('temporal: [oculta]') && c.cuerpo.includes('temporal es: [oculta]'));
    assert.ok(c.cuerpo.includes('fin'));
  });
});
