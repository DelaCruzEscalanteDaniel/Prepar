'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('./ayuda');
const db = require('../server/db');
const ciclosIniciales = require('../server/lib/ciclosIniciales');
const demo = require('../server/lib/cicloDemostracion');

const ok = (r, msg) => assert.ok(r.estado >= 200 && r.estado < 300, `${msg || ''} → ${r.estado} ${JSON.stringify(r.datos).slice(0, 300)}`);

test.before(async () => {
  await A.iniciar();
  await A.crearAdmin();
});
test.after(async () => { await A.detener(); });

test('el ciclo de demostración concluido se crea solo, pausado, y se puede activar y regresar', async () => {
  assert.equal((await demo.asegurar()).motivo, 'Primero se crea el ciclo de práctica');
  await db.conSistema((c) => c.q("UPDATE fuentes_externas SET ultima_sincronizacion_exitosa = NOW() WHERE clave = 'datos_cdmx_unidades'"));
  await ciclosIniciales.asegurar();
  const practica = await db.conSistema((c) => c.uno("SELECT id FROM ciclos WHERE estado = 'activo'"));
  assert.ok(practica, 'hay un ciclo de práctica activo');

  const r = await demo.asegurar();
  assert.ok(r.creado, JSON.stringify(r));
  assert.equal((await demo.asegurar()).motivo, 'ya existe', 'no se repite');

  const ciclos = await db.conSistema((c) => c.q('SELECT c.id, c.nombre, c.estado, f.clave AS fase FROM ciclos c JOIN fases f ON f.id = c.fase_actual_id ORDER BY c.id'));
  const d = ciclos.find((c) => c.nombre === demo.NOMBRE);
  assert.equal(d.estado, 'borrador');
  assert.equal(d.fase, 'evaluacion');
  assert.equal(ciclos.find((c) => c.id === practica.id).estado, 'activo', 'el ciclo de práctica sigue activo');

  const cuenta = async (sql) => Number((await db.conSistema((c) => c.uno(sql, [d.id]))).n);
  assert.ok(await cuenta('SELECT COUNT(*) AS n FROM ideas WHERE ciclo_id = ?') >= 5);
  assert.ok(await cuenta('SELECT COUNT(*) AS n FROM proyectos WHERE ciclo_id = ?') >= 10);
  assert.ok(await cuenta('SELECT COUNT(*) AS n FROM participaciones WHERE ciclo_id = ?') >= 10);
  assert.equal(await cuenta('SELECT COUNT(*) AS n FROM resultados_unidad WHERE ciclo_id = ? AND proyecto_ganador_id IS NOT NULL'), 4, 'un ganador en cada colonia');
  assert.ok(await cuenta('SELECT COUNT(*) AS n FROM reportes r JOIN proyectos p ON p.id = r.proyecto_id WHERE p.ciclo_id = ?') >= 4);
  assert.ok(await cuenta('SELECT resultados_publicados_en IS NOT NULL AS n FROM ciclos WHERE id = ?'));

  const a = A.cliente();
  ok(await a.post('/api/auth/login', { correo: 'admin@prepar.mx', password: 'Admin12345' }));
  ok(await a.post('/api/admin/modo', { ciclo_id: d.id }), 'activar el ciclo de demostración');
  const maria = A.cliente();
  ok(await maria.post('/api/auth/login', { correo: 'maria.lopez@correo.mx', password: 'Ciudadano2026' }));
  const p = await maria.get('/api/ciudadano/panel');
  ok(p);
  assert.equal(p.datos.ciclo.id, d.id);
  const foro = await maria.get('/api/foro');
  assert.ok(foro.datos.ideas.some((i) => !i.de_mi_colonia), 've ideas de otra colonia de su alcaldía');
  ok(await a.post('/api/admin/modo', { ciclo_id: practica.id }), 'regresar al ciclo de práctica');
  assert.equal((await db.conSistema((c) => c.uno("SELECT id FROM ciclos WHERE estado = 'activo'"))).id, practica.id);
});
