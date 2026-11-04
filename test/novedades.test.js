'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('./ayuda');
const v = require('../server/lib/validar');

const ok = (r, msg) => assert.ok(r.estado >= 200 && r.estado < 300, `${msg || ''} → ${r.estado} ${JSON.stringify(r.datos).slice(0, 200)}`);
const falla = (r, estado, msg) => assert.equal(r.estado, estado, `${msg || ''} → ${r.estado} ${JSON.stringify(r.datos).slice(0, 200)}`);
const e = {};

test.before(async () => {
  await A.iniciar();
  await A.crearAdmin();
  e.admin = A.cliente();
  ok(await e.admin.post('/api/auth/login', { correo: 'admin@prepar.mx', password: 'Admin12345' }));
});
test.after(async () => { await A.detener(); });

test('código postal: solo 5 dígitos de la Ciudad de México', () => {
  for (const cp of ['01000', '02080', '16999', ' 06700 ']) assert.equal(v.codigoPostal(cp), cp.trim());
  assert.equal(v.codigoPostal(''), null);
  assert.equal(v.codigoPostal(undefined), null);
  for (const cp of ['00999', '17000', '99999', '1234', '123456', '0208a', '02 80', "02080' OR 1=1"]) assert.throws(() => v.codigoPostal(cp), /código postal/, cp);
  assert.throws(() => v.codigoPostal('', true), /código postal/);
});

test('textos: se aceptan signos comunes y se bloquea HTML o código', () => {
  for (const t of ['Calle #5 & Av. Juárez', 'Costo de $300 [aprox]', 'Niños < 12 años y > 3', "O'Higgins; 50% más", 'Usar 2 < 3 y 5 > 4', 'Jardín (zona norte) {etapa}']) {
    assert.equal(v.pareceCodigo(t), false, t);
  }
  for (const t of ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', 'javascript:alert(1)', '<a href="x">y</a>', 'texto onmouseover=hack()',
    '&lt;script&gt;', '${process.env}', '{{constructor}}', 'data:text/html,hola', '</p>', '<!-- x -->', '<?php echo 1 ?>', 'JaVaScRiPt :alert(1)']) {
    assert.equal(v.pareceCodigo(t), true, t);
  }
});

test('el resumen de votación valida el ciclo y solo es para administradores', async () => {
  falla(await e.admin.get('/api/admin/ciclos/abc/votacion/resumen'), 400);
  falla(await e.admin.get('/api/admin/ciclos/999999/votacion/resumen'), 404);
  falla(await A.cliente().get('/api/admin/ciclos/1/votacion/resumen'), 401);
});
