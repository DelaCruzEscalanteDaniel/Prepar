'use strict';
const zlib = require('zlib');
const bcrypt = require('bcryptjs');
const db = require('../db');
const config = require('../config');

const PRACTICA = 'Ciclo de práctica';
const DEMOSTRACION = 'Ciclo de demostración';

const CIUDADANOS = [
  ['maria.lopez', 'María López Hernández', 'AZC-001'],
  ['jose.ramirez', 'José Ramírez Cruz', 'AZC-001'],
  ['ana.gutierrez', 'Ana Sofía Gutiérrez', 'AZC-001'],
  ['luis.hernandez', 'Luis Hernández Soto', 'AZC-001'],
  ['alex.moreno', 'Alex Moreno Díaz', 'AZC-001'],
  ['patricia.flores', 'Patricia Flores Ruiz', 'AZC-002'],
  ['jorge.castillo', 'Jorge Castillo Peña', 'AZC-002'],
  ['rosa.martinez', 'Rosa Martínez León', 'AZC-002'],
  ['daniel.ortega', 'Daniel Ortega Lima', 'COY-001'],
  ['fernanda.reyes', 'Fernanda Reyes Mora', 'COY-001'],
  ['miguel.torres', 'Miguel Ángel Torres', 'COY-002'],
  ['carmen.aguilar', 'Carmen Aguilar Ríos', 'COY-002'],
];

const PROYECTOS = [
  ['AZC-001', 'maria.lopez', 1, 'Rehabilitación del parque de la colonia', 'Cambiar los juegos rotos, poner luminarias y pintar las bancas del parque.', 850000, 'Av. Clavería', 'viable', ['jose.ramirez', 'ana.gutierrez', 'maria.lopez']],
  ['AZC-001', 'alex.moreno', 3, 'Taller de futbol para niños', 'Clases gratuitas los sábados en la cancha de la colonia durante un año.', 120000, 'Calle Egipto', 'viable', ['luis.hernandez']],
  ['AZC-001', 'luis.hernandez', 2, 'Banquetas en la calle Lerdo', 'Arreglar las banquetas rotas y poner rampas para sillas de ruedas.', 600000, 'Calle Lerdo', 'viable', ['alex.moreno']],
  ['AZC-001', 'jose.ramirez', 2, 'Bodega para la alcaldía', 'Construir una bodega para guardar herramientas de la alcaldía.', 400000, 'Calle Nilo', 'no_viable', []],
  ['AZC-002', 'patricia.flores', 1, 'Plaza con mobiliario urbano', 'Poner bancas, botes de basura y jardineras en la plaza de la colonia.', 700000, 'Calle Nogal', 'viable', ['patricia.flores', 'rosa.martinez']],
  ['AZC-002', 'jorge.castillo', 2, 'Luminarias en la calle Nogal', 'Instalar luminarias LED en toda la calle, que está muy oscura.', 450000, 'Calle Nogal', 'viable', ['jorge.castillo']],
  ['COY-001', 'daniel.ortega', 1, 'Huerto comunitario', 'Hacer un huerto en el camellón para que los vecinos siembren y aprendan.', 300000, 'Calle Francisco Sosa', 'viable', ['daniel.ortega']],
  ['COY-001', 'fernanda.reyes', 3, 'Clases de danza para adultos mayores', 'Clases dos veces por semana en la casa de cultura.', 150000, 'Calle Higuera', 'viable', ['fernanda.reyes']],
  ['COY-002', 'miguel.torres', 2, 'Cambio de drenaje en la calle Rey Moctezuma', 'Cambiar la tubería del drenaje que se tapa cada vez que llueve.', 900000, 'Calle Rey Moctezuma', 'viable', ['miguel.torres', 'carmen.aguilar']],
  ['COY-002', 'carmen.aguilar', 1, 'Cancha de basquetbol', 'Arreglar el piso de la cancha y poner tableros nuevos.', 650000, 'Calle Tepetlapa', 'viable', []],
];

const IDEAS = [
  ['AZC-001', 'maria.lopez', 1, 'El parque tiene juegos rotos y poca luz en la noche. Hay que arreglarlo.', ['jose.ramirez', 'ana.gutierrez', 'luis.hernandez'], [['jose.ramirez', 'Yo apoyo, mis hijos juegan ahí.']]],
  ['AZC-001', 'alex.moreno', 3, 'Un taller de futbol los sábados para que los niños tengan algo que hacer.', ['luis.hernandez'], []],
  ['AZC-002', 'jorge.castillo', 2, 'La calle Nogal está muy oscura y es peligroso caminar en la noche.', ['patricia.flores', 'rosa.martinez'], [['rosa.martinez', 'Sí, yo regreso tarde del trabajo y da miedo.']]],
  ['COY-001', 'daniel.ortega', 1, 'Podríamos hacer un huerto en el camellón.', ['fernanda.reyes'], []],
  ['COY-002', 'miguel.torres', 2, 'Cada vez que llueve se inunda la calle Rey Moctezuma.', ['carmen.aguilar'], []],
];

const OBRAS = {
  'Rehabilitación del parque de la colonia': { pasos: 6, gastos: [[250000, 'Compra de juegos infantiles'], [320000, 'Contratación de la obra'], [237500, 'Luminarias y pintura']], fotos: [['maria.lopez', 'Ya quedó el parque, se ve muy bien.']] },
  'Plaza con mobiliario urbano': { pasos: 3, gastos: [[180000, 'Compra de bancas'], [119250, 'Preparación de la plaza']], fotos: [['patricia.flores', 'Hay material de construcción tirado en la banqueta.'], ['rosa.martinez', 'Ya pusieron las primeras bancas.']] },
  'Huerto comunitario': { pasos: 2, gastos: [[60000, 'Tierra, semillas y herramientas']], fotos: [] },
  'Cambio de drenaje en la calle Rey Moctezuma': { pasos: 0, gastos: [], fotos: [['miguel.torres', 'Todavía no empiezan la obra.']] },
};

function foto(cielo, suelo) {
  const ancho = 320;
  const alto = 200;
  const tabla = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = tabla[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const bloque = (tipo, datos) => {
    const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length);
    const td = Buffer.concat([Buffer.from(tipo), datos]);
    const suma = Buffer.alloc(4); suma.writeUInt32BE(crc(td));
    return Buffer.concat([largo, td, suma]);
  };
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(ancho, 0); cabecera.writeUInt32BE(alto, 4); cabecera[8] = 8; cabecera[9] = 2;
  const filas = Buffer.alloc((ancho * 3 + 1) * alto);
  for (let y = 0; y < alto; y += 1) {
    const color = y < alto * 0.6 ? cielo : suelo;
    for (let x = 0; x < ancho; x += 1) color.forEach((v, i) => { filas[y * (ancho * 3 + 1) + 1 + x * 3 + i] = v; });
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloque('IHDR', cabecera),
    bloque('IDAT', zlib.deflateSync(filas)), bloque('IEND', Buffer.alloc(0))]);
}

async function adminPruebas() {
  const { correo, password } = config.adminPruebas;
  if (!correo) return;
  const u = await db.uno('SELECT id, rol FROM usuarios WHERE correo = ?', [correo]);
  if (u && u.rol !== 'administrador') return console.error(`ADMIN_PRUEBAS_CORREO (${correo}) ya pertenece a otra cuenta`);
  if (!password) {
    if (u) {
      await db.q('UPDATE usuarios SET activo = FALSE WHERE id = ?', [u.id]);
      await db.q('DELETE FROM sesiones WHERE usuario_id = ?', [u.id]);
    }
    return undefined;
  }
  const hash = await bcrypt.hash(password, 10);
  if (u) await db.q('UPDATE usuarios SET activo = TRUE, password_hash = ? WHERE id = ?', [hash, u.id]);
  else await db.q("INSERT INTO usuarios (rol, nombre, correo, password_hash) VALUES ('administrador', 'Administrador de pruebas', ?, ?)", [correo, hash]);
  return undefined;
}

async function cuentasDePrueba() {
  const ids = {};
  const hashFuncionario = await bcrypt.hash('Funcionario2026', 10);
  for (const [clave, alcaldia] of [['azc', 'Azcapotzalco'], ['coy', 'Coyoacán']]) {
    const email = `funcionario.demo.${clave}@prepar.mx`;
    if (!(await db.uno('SELECT id FROM usuarios WHERE correo = ?', [email]))) {
      await db.q(`INSERT INTO usuarios (rol, nombre, correo, password_hash, alcaldia_id)
                  SELECT 'funcionario', ?, ?, ?, id FROM alcaldias WHERE nombre = ?`,
        [`Funcionario de demostración ${alcaldia}`, email, hashFuncionario, alcaldia]);
    }
    ids[clave] = (await db.uno('SELECT id FROM usuarios WHERE correo = ?', [email])).id;
  }
  const hashCiudadano = await bcrypt.hash('Ciudadano2026', 10);
  for (const [usuario, nombre, colonia] of CIUDADANOS) {
    const email = `${usuario}@correo.mx`;
    if (!(await db.uno('SELECT id FROM usuarios WHERE correo = ?', [email]))) {
      await db.q(`INSERT INTO usuarios (rol, nombre, correo, password_hash, colonia_id)
                  SELECT 'ciudadano', ?, ?, ?, id FROM colonias WHERE clave = ?`, [nombre, email, hashCiudadano, colonia]);
    }
    ids[usuario] = (await db.uno('SELECT id FROM usuarios WHERE correo = ?', [email])).id;
  }
  return ids;
}

async function cicloDemostracion(ids) {
  const colonias = Object.fromEntries((await db.q("SELECT id, clave, latitud, longitud FROM colonias WHERE clave LIKE 'AZC%' OR clave LIKE 'COY%'"))
    .map((c) => [c.clave, c]));
  const ciclo = (await db.llamar('sp_crear_ciclo', [DEMOSTRACION, new Date().getFullYear(), 120000000]))[0].ciclo_id;
  const fase = (n) => db.q('UPDATE ciclos SET fase_id = ? WHERE id = ?', [n, ciclo]);
  const funcionarioDe = (clave) => (clave.startsWith('AZC') ? ids.azc : ids.coy);

  await fase(2);
  for (const [colonia, autor, rubro, texto, apoyos, comentarios] of IDEAS) {
    const idea = (await db.q('INSERT INTO ideas (ciclo_id, colonia_id, autor_id, rubro_id, texto) VALUES (?, ?, ?, ?, ?)',
      [ciclo, colonias[colonia].id, ids[autor], rubro, texto])).insertId;
    for (const quien of apoyos) await db.q('INSERT INTO apoyos (idea_id, usuario_id) VALUES (?, ?)', [idea, ids[quien]]);
    for (const [quien, t] of comentarios) await db.q('INSERT INTO comentarios (idea_id, autor_id, texto) VALUES (?, ?, ?)', [idea, ids[quien], t]);
  }
  const proyectos = {};
  for (const [n, [colonia, autor, rubro, titulo, descripcion, costo, calle]] of PROYECTOS.entries()) {
    const c = colonias[colonia];
    proyectos[titulo] = (await db.q(
      `INSERT INTO proyectos (ciclo_id, colonia_id, proponente_id, rubro_id, titulo, descripcion, costo, calle, latitud, longitud)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ciclo, c.id, ids[autor], rubro, titulo, descripcion, costo, calle,
        Number(c.latitud) + ((n % 3) - 1) * 0.003, Number(c.longitud) + ((n % 2) ? 0.003 : -0.002)])).insertId;
  }

  await fase(3);
  for (const [colonia, , , titulo, , , , resultado] of PROYECTOS) {
    await db.q('INSERT INTO dictamenes (proyecto_id, funcionario_id, resultado, justificacion) VALUES (?, ?, ?, ?)',
      [proyectos[titulo], funcionarioDe(colonia), resultado,
        resultado === 'viable' ? 'Cumple con los requisitos técnicos y el costo está dentro del presupuesto.' : 'No beneficia a los vecinos: es para uso de la alcaldía.']);
  }

  await fase(4);
  for (const clave of Object.keys(colonias)) {
    if (PROYECTOS.some((p) => p[0] === clave)) await db.llamar('sp_sorteo', [ciclo, colonias[clave].id]);
  }

  await fase(5);
  for (const [colonia, , , titulo, , , , , votantes] of PROYECTOS) {
    for (const quien of votantes) {
      await db.q('INSERT INTO participaciones (ciclo_id, usuario_id, folio) VALUES (?, ?, ?)', [ciclo, ids[quien], `VOTO-${ciclo}-${ids[quien]}DEMO`]);
      await db.q('INSERT INTO votos (ciclo_id, colonia_id, proyecto_id) VALUES (?, ?, ?)', [ciclo, colonias[colonia].id, proyectos[titulo]]);
    }
  }

  await fase(6);
  await db.llamar('sp_calcular_ganadores', [ciclo]);

  await fase(7);
  const colores = [[[118, 189, 215], [120, 150, 110]], [[150, 200, 230], [150, 150, 150]], [[244, 200, 140], [130, 140, 120]]];
  let n = 0;
  for (const [titulo, obra] of Object.entries(OBRAS)) {
    const p = await db.uno('SELECT p.id, p.rubro_id, p.colonia_id FROM proyectos p WHERE p.id = ?', [proyectos[titulo]]);
    const clave = Object.keys(colonias).find((k) => colonias[k].id === p.colonia_id);
    const pasos = await db.q('SELECT id, nombre FROM pasos_rubro WHERE rubro_id = ? ORDER BY orden LIMIT ?', [p.rubro_id, obra.pasos]);
    for (const paso of pasos) {
      await db.q('INSERT INTO pasos_proyecto (proyecto_id, paso_id, que_se_hizo, funcionario_id) VALUES (?, ?, ?, ?)',
        [p.id, paso.id, `Se terminó: ${paso.nombre.toLowerCase()}.`, funcionarioDe(clave)]);
    }
    for (const [monto, concepto] of obra.gastos) {
      await db.q('INSERT INTO gastos (proyecto_id, funcionario_id, monto, concepto) VALUES (?, ?, ?, ?)', [p.id, funcionarioDe(clave), monto, concepto]);
    }
    for (const [quien, comentario] of obra.fotos) {
      const [cielo, suelo] = colores[n % colores.length];
      n += 1;
      const imagen = (await db.q("INSERT INTO imagenes (tipo, contenido) VALUES ('image/png', ?)", [foto(cielo, suelo)])).insertId;
      await db.q('INSERT INTO fotos_denuncia (proyecto_id, autor_id, imagen_id, comentario) VALUES (?, ?, ?, ?)', [p.id, ids[quien], imagen, comentario]);
    }
  }
  console.log(`Se creó el «${DEMOSTRACION}» (fase 7). Actívalo desde el panel del administrador para verlo.`);
}

async function asegurar() {
  await adminPruebas();
  const ids = await cuentasDePrueba();
  if (!(await db.uno('SELECT id FROM ciclos WHERE nombre = ?', [PRACTICA]))) {
    const id = (await db.llamar('sp_crear_ciclo', [PRACTICA, new Date().getFullYear(), 120000000]))[0].ciclo_id;
    const hayActivo = await db.uno("SELECT id FROM ciclos WHERE estado = 'activo'");
    await db.q(`UPDATE ciclos SET fase_id = 2, estado = ? WHERE id = ?`, [hayActivo ? 'borrador' : 'activo', id]);
    console.log(`Se creó el «${PRACTICA}» en la fase 2.`);
  }
  if (!(await db.uno('SELECT id FROM ciclos WHERE nombre = ?', [DEMOSTRACION]))) await cicloDemostracion(ids);
}

module.exports = { asegurar, PRACTICA, DEMOSTRACION };
