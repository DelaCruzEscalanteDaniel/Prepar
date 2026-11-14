'use strict';
const test = require('node:test');
const assert = require('node:assert');
const v = require('../server/lib/validar');
const { tipoDe } = require('../server/lib/imagenes');

test('la contraseña sigue las reglas', () => {
  assert.strictEqual(v.password('Prepar2026'), 'Prepar2026');
  for (const mala of ['corta1A', 'sinmayuscula1', 'SinNumero', 'Con espacio1', 'Raro!2026A', 'A1' + 'x'.repeat(63)]) {
    assert.throws(() => v.password(mala), mala);
  }
});

test('correo, teléfono y textos', () => {
  assert.strictEqual(v.correo(' Maria@Correo.MX '), 'maria@correo.mx');
  assert.throws(() => v.correo('sin-arroba'));
  assert.strictEqual(v.telefono('55 1234 5678'), '5512345678');
  assert.strictEqual(v.telefono(''), null);
  assert.throws(() => v.telefono('123'));
  assert.throws(() => v.texto('<script>alert(1)</script>', 'el texto', 100));
  assert.throws(() => v.texto('   ', 'el texto', 100));
  assert.throws(() => v.texto('abcdef', 'el texto', 5));
  assert.strictEqual(v.texto('  hola   mundo ', 'el texto', 100), 'hola mundo');
});

test('dinero y números', () => {
  assert.strictEqual(v.dinero('1500.555', 'El monto'), 1500.56);
  assert.throws(() => v.dinero('0', 'El monto'));
  assert.throws(() => v.dinero('abc', 'El monto'));
  assert.throws(() => v.entero('-3', 'El id'));
});

test('solo se aceptan fotos JPG o PNG', () => {
  assert.strictEqual(tipoDe(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.strictEqual(tipoDe(Buffer.from('89504e470d0a1a0a00', 'hex')), 'image/png');
  assert.strictEqual(tipoDe(Buffer.from('GIF89a')), null);
});
