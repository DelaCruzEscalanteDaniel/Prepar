'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { iniciar, detener, entrar, db } = require('./ayuda');
const datosIniciales = require('../server/lib/datosIniciales');

test.before(iniciar);
test.after(detener);

test('al arrancar se crean las cuentas de prueba y los dos ciclos', async () => {
  await datosIniciales.asegurar();
  await datosIniciales.asegurar();
  const ciclos = await db.q('SELECT nombre, estado, fase_id FROM ciclos ORDER BY id');
  assert.deepStrictEqual(ciclos.map((c) => [c.nombre, c.estado, c.fase_id]),
    [['Ciclo de práctica', 'activo', 2], ['Ciclo de demostración', 'borrador', 7]]);
  const ganadores = await db.q("SELECT titulo FROM proyectos WHERE estatus IN ('ganador', 'en_ejecucion', 'concluido') ORDER BY id");
  assert.strictEqual(ganadores.length, 4);
  const maria = await entrar('maria.lopez@correo.mx', 'Ciudadano2026');
  assert.strictEqual((await maria.get('/yo')).datos.colonia, 'Clavería');
  await entrar('funcionario.demo.azc@prepar.mx', 'Funcionario2026');
});

test('admin de pruebas: se crea, cambia contraseña y se desactiva', async () => {
  const config = require('../server/config');
  config.adminPruebas.correo = 'otro.equipo@prepar.mx';
  config.adminPruebas.password = 'Pruebas2026';
  await datosIniciales.asegurar();
  await entrar('otro.equipo@prepar.mx', 'Pruebas2026');
  config.adminPruebas.password = 'Cambiada2026';
  await datosIniciales.asegurar();
  await entrar('otro.equipo@prepar.mx', 'Cambiada2026');
  config.adminPruebas.password = '';
  await datosIniciales.asegurar();
  const u = await db.uno("SELECT activo FROM usuarios WHERE correo = 'otro.equipo@prepar.mx'");
  assert.strictEqual(u.activo, 0);
});
