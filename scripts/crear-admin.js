'use strict';
const readline = require('readline');
const bcrypt = require('bcryptjs');
const db = require('../server/db');
const v = require('../server/lib/validar');

function preguntar(rl, texto) {
  return new Promise((r) => rl.question(texto, (x) => r(x.trim())));
}

(async () => {
  let [nombre, correo, pass] = process.argv.slice(2);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    if (!nombre) nombre = await preguntar(rl, 'Nombre completo: ');
    if (!correo) correo = await preguntar(rl, 'Correo: ');
    if (!pass) pass = await preguntar(rl, 'Contraseña (8 a 24 caracteres): ');
    nombre = v.nombrePersona(nombre);
    correo = v.correo(correo);
    pass = v.password(pass);
    const hash = await bcrypt.hash(pass, 10);
    const r = await db.conSistema((con) => con.call('sp_crear_administrador', [nombre, correo, hash]));
    console.log(`✔ Administrador creado (id ${r[0].usuario_id}). Ya puedes iniciar sesión con ${correo}.`);
  } catch (e) {
    console.error('✘ No se pudo crear el Administrador:', e.sqlMessage || e.message);
    process.exitCode = 1;
  } finally {
    rl.close();
    await db.cerrar();
  }
})();
