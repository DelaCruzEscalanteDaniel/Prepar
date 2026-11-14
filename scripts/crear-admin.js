'use strict';
const readline = require('readline');
const bcrypt = require('bcryptjs');
const db = require('../server/db');
const v = require('../server/lib/validar');

function preguntar(rl, texto) {
  return new Promise((r) => rl.question(texto, (x) => r(x.trim())));
}

(async () => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    let [nombre, correo, password] = process.argv.slice(2);
    if (!nombre) nombre = await preguntar(rl, 'Nombre completo: ');
    if (!correo) correo = await preguntar(rl, 'Correo: ');
    if (!password) password = await preguntar(rl, 'Contraseña (8 a 64, con mayúscula y número): ');
    nombre = v.texto(nombre, 'el nombre', 60);
    correo = v.correo(correo);
    password = v.password(password);
    await db.q("INSERT INTO usuarios (rol, nombre, correo, password_hash) VALUES ('administrador', ?, ?, ?)",
      [nombre, correo, await bcrypt.hash(password, 10)]);
    console.log(`✔ Administrador creado. Ya puedes entrar con ${correo}`);
  } catch (e) {
    console.error('✘ No se pudo crear el administrador:', e.sqlMessage || e.message);
    process.exitCode = 1;
  } finally {
    rl.close();
    await db.pool.end();
  }
})();
