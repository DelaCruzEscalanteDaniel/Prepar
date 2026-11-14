'use strict';
const config = require('./config');
const db = require('./db');
const { crearApp } = require('./app');
const datosIniciales = require('./lib/datosIniciales');

const app = crearApp();

app.listen(config.puerto, async () => {
  console.log(`Prepar escuchando en ${config.urlPublica}`);
  try {
    await db.q('SELECT 1');
    await datosIniciales.asegurar();
  } catch (e) {
    console.error('No se pudo preparar la base de datos. Revisa las variables DB_* del archivo .env:', e.message);
  }
});
