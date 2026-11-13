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

test('moderación: groserías, letras repetidas y textos sin sentido', () => {
  const m = require('../server/lib/moderacion');
  for (const t of ['eres un pendejo', 'p3nd3j0', 'p u t o', 'p.u.t.o', 'pinche proyecto', 'qué mierda', 'chinga tu madre', 'hijo de puta', 'ptm', 'cabrón', 'coño', 'PENDEJOOOO', 'fuck']) assert.ok(m.tieneGroserias(t), t);
  for (const t of ['Un cono de tránsito', 'Me da vergüenza', 'Un vergel con árboles', 'El cálculo del costo', 'La computadora', 'Ampliación Culhuacán', 'Una disputa sobre el putativo dueño']) assert.equal(m.tieneGroserias(t), false, t);
  for (const t of ['holaaaa', '!!!!', 'jajajajajajajaja']) assert.ok(m.tieneRepeticiones(t), t);
  for (const t of ['jajaja', 'Costo de 1000000 pesos', 'leer y creer...']) assert.equal(m.tieneRepeticiones(t), false, t);
  for (const t of ['svgba.ñg{-yhgahbY{t{gb', 'asdfghjkl', 'xkcdqwz', 'mnbvcx']) assert.ok(m.pareceSinSentido(t), t);
  for (const t of ['Reparar banquetas en Xochimilco, Tlalnepantla e Ixtlahuaca', 'Instrucciones de construcción', 'Luminarias LED en la CDMX', 'Visiten www.cdmx.gob.mx', 'Ctrl + C', 'Iztaccíhuatl y Nezahualcóyotl']) assert.equal(m.pareceSinSentido(t), false, t);
  assert.throws(() => v.texto('Esta propuesta es una mierda', { campo: 'tu comentario', letras: 2, multilinea: true }), /ofensivas/);
  assert.throws(() => v.texto('svgba.ñg{-yhgahbY{t{gb', { campo: 'tu comentario', letras: 2, multilinea: true }), /no se entienden/);
  assert.throws(() => v.texto('Me encantaaaaaaa', { campo: 'tu comentario', letras: 2, multilinea: true }), /repetid|válido/);
  assert.equal(v.texto('Me parece muy buena idea para el parque', { campo: 'tu comentario', letras: 2, multilinea: true }), 'Me parece muy buena idea para el parque');
  assert.throws(() => v.nombrePersona('Pendejo Pérez'), /groserías/);
  assert.equal(v.nombrePersona('Ana Culebro Vergara'), 'Ana Culebro Vergara');
});

test('etapas: porcentaje, avance financiero y alerta de gasto', () => {
  const e = require('../server/lib/etapas');
  const lista = [{ peso: 10, cumplida_en: 'x' }, { peso: 20, cumplida_en: 'x' }, { peso: 70, cumplida_en: null }];
  assert.equal(e.porcentaje(lista), 30);
  assert.equal(e.porcentaje(lista.map((x) => ({ ...x, cumplida_en: 'x' }))), 100);
  assert.equal(e.avanceFinanciero(450000, 500000, 1000000), 90);
  assert.equal(e.avanceFinanciero(100, 0, 1000), 10, 'sin costo usa el presupuesto');
  assert.equal(e.avanceFinanciero(100, 0, 0), 0);
  assert.equal(e.alerta(30, 90), true);
  assert.equal(e.alerta(60, 90), false);
});

test('el resumen de votación valida el ciclo y solo es para administradores', async () => {
  falla(await e.admin.get('/api/admin/ciclos/abc/votacion/resumen'), 400);
  falla(await e.admin.get('/api/admin/ciclos/999999/votacion/resumen'), 404);
  falla(await A.cliente().get('/api/admin/ciclos/1/votacion/resumen'), 401);
});
