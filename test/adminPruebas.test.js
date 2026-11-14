'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('./ayuda');
const config = require('../server/config');
const adminPruebas = require('../server/lib/adminPruebas');

test.before(async () => { await A.iniciar(); await A.crearAdmin(); });
test.after(async () => { Object.assign(config.adminPruebas, { correo: '', password: '' }); await A.detener(); });

const entrar = async (pass) => {
  const c = A.cliente();
  const r = await c.post('/api/auth/login', { correo: 'pruebas@prepar.mx', password: pass });
  return { c, r };
};

test('segundo administrador para otro equipo: se crea, cambia de contraseña, se desactiva y no toca al principal', async () => {
  assert.equal((await adminPruebas.asegurar()).motivo, 'sin configurar');
  Object.assign(config.adminPruebas, { correo: 'pruebas@prepar.mx', password: 'corta' });
  assert.equal((await adminPruebas.asegurar()).motivo, 'contraseña no válida');

  Object.assign(config.adminPruebas, { password: 'EquipoB2026' });
  assert.ok((await adminPruebas.asegurar()).creada);
  assert.equal((await adminPruebas.asegurar()).motivo, 'al día', 'no se repite');
  const u = await A.db.conSistema((c) => c.uno("SELECT rol, nombre_completo, estado FROM usuarios WHERE correo = 'pruebas@prepar.mx'"));
  assert.deepEqual(u, { rol: 'administrador', nombre_completo: 'Administrador de pruebas', estado: 'activa' });
  const { c, r } = await entrar('EquipoB2026');
  assert.ok(r.estado >= 200 && r.estado < 300, JSON.stringify(r.datos));
  assert.equal((await A.db.conSistema((x) => x.uno("SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'administrador' AND estado = 'activa'"))).n, 2);

  config.adminPruebas.password = 'OtraClave2026';
  assert.ok((await adminPruebas.asegurar()).actualizada);
  assert.ok((await entrar('EquipoB2026')).r.estado >= 400, 'la contraseña anterior ya no sirve');
  assert.ok((await entrar('OtraClave2026')).r.estado < 300);

  config.adminPruebas.password = '';
  assert.ok((await adminPruebas.asegurar()).desactivada);
  assert.ok((await c.get('/api/admin/ciclos')).estado >= 400, 'su sesión abierta se cierra');
  assert.ok((await entrar('OtraClave2026')).r.estado >= 400, 'ya no puede entrar');
  const principal = A.cliente();
  assert.ok((await principal.post('/api/auth/login', { correo: 'admin@prepar.mx', password: 'Admin12345' })).estado < 300, 'el administrador principal sigue igual');

  config.adminPruebas.password = 'OtraClave2026';
  assert.ok((await adminPruebas.asegurar()).actualizada, 'se puede volver a activar');
  assert.ok((await entrar('OtraClave2026')).r.estado < 300);

  await A.db.conSistema((x) => x.q("INSERT INTO usuarios (rol, nombre_completo, correo, password_hash) VALUES ('ciudadano', 'Vecina Ocupada', 'ocupada@correo.mx', 'x')"));
  Object.assign(config.adminPruebas, { correo: 'ocupada@correo.mx', password: 'EquipoB2026' });
  assert.equal((await adminPruebas.asegurar()).motivo, 'correo ocupado', 'no convierte en admin una cuenta de ciudadano');
  assert.equal((await A.db.conSistema((x) => x.uno("SELECT rol FROM usuarios WHERE correo = 'ocupada@correo.mx'"))).rol, 'ciudadano');
});
