'use strict';
const zlib = require('zlib');
const bcrypt = require('bcryptjs');
const db = require('../server/db');

const FASES = ['convocatoria', 'diagnostico_registro', 'dictaminacion', 'sorteo_difusion', 'consulta', 'resultados', 'ejecucion_seguimiento', 'evaluacion'];
const destino = process.argv[2] || 'diagnostico_registro';
if (!FASES.includes(destino)) {
  console.error(`Fase no válida: ${destino}\nUsa una de: ${FASES.join(', ')}`);
  process.exit(1);
}
const llega = (fase) => FASES.indexOf(destino) >= FASES.indexOf(fase);

const TABLA = (() => { const t = []; for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = TABLA[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const bloque = (tipo, datos) => {
  const l = Buffer.alloc(4); l.writeUInt32BE(datos.length);
  const td = Buffer.concat([Buffer.from(tipo), datos]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([l, td, c]);
};
function imagen(ancho, alto, [r1, g1, b1], [r2, g2, b2]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0); ihdr.writeUInt32BE(alto, 4); ihdr[8] = 8; ihdr[9] = 2;
  const filas = Buffer.alloc((ancho * 3 + 1) * alto);
  for (let y = 0; y < alto; y += 1) {
    const o = y * (ancho * 3 + 1);
    for (let x = 0; x < ancho; x += 1) {
      const t = (x / ancho + y / alto) / 2;
      const banda = Math.sin((x + y) / 18) > 0.85 ? 18 : 0;
      filas[o + 1 + x * 3] = Math.min(255, r1 + (r2 - r1) * t + banda);
      filas[o + 2 + x * 3] = Math.min(255, g1 + (g2 - g1) * t + banda);
      filas[o + 3 + x * 3] = Math.min(255, b1 + (b2 - b1) * t + banda);
    }
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloque('IHDR', ihdr), bloque('IDAT', zlib.deflateSync(filas)), bloque('IEND', Buffer.alloc(0))]);
}
const COLORES = [[[42, 157, 143], [118, 189, 215]], [[224, 142, 109], [244, 200, 97]], [[71, 85, 105], [148, 163, 184]], [[181, 83, 47], [240, 163, 130]]];

const como = (id, fn) => db.conUsuario(id, fn);
const idDe = async (correo) => (await db.conSistema((c) => c.uno('SELECT id FROM usuarios WHERE correo = ?', [correo]))).id;

async function principal() {
  const existe = await db.conSistema((c) => c.uno("SELECT COUNT(*) AS n FROM usuarios WHERE correo = 'admin@prepar.mx'"));
  if (existe.n) throw new Error('Los datos de demostración ya existen. Reinstala la base con "npm run bd:instalar" para empezar de cero.');
  console.log(`Creando datos de demostración hasta la fase "${destino}"…`);
  const hAdmin = await bcrypt.hash('Admin2026', 10);
  const hFunc = await bcrypt.hash('Funcionario2026', 10);
  const hCiu = await bcrypt.hash('Ciudadano2026', 10);

  await db.conSistema((c) => c.call('sp_crear_administrador', ['Administración Prepar', 'admin@prepar.mx', hAdmin]));
  const admin = await idDe('admin@prepar.mx');
  const azc = (await db.conSistema((c) => c.uno("SELECT id FROM alcaldias WHERE clave = 'AZC'"))).id;
  const coy = (await db.conSistema((c) => c.uno("SELECT id FROM alcaldias WHERE clave = 'COY'"))).id;
  const todas = 'directorio,moderacion,revision_registros,dictaminacion,consulta,seguimiento';
  await como(admin, (c) => c.call('sp_registrar_funcionario', ['Carlos Méndez Ruiz', 'carlos.mendez@prepar.mx', hFunc, azc, todas]));
  await como(admin, (c) => c.call('sp_registrar_funcionario', ['Lucía Torres Vega', 'lucia.torres@prepar.mx', hFunc, coy, todas]));
  await db.conSistema((c) => c.q("UPDATE funcionarios SET debe_cambiar_password = FALSE WHERE usuario_id IN (SELECT id FROM usuarios WHERE correo IN ('carlos.mendez@prepar.mx','lucia.torres@prepar.mx'))"));
  const carlos = await idDe('carlos.mendez@prepar.mx');
  const lucia = await idDe('lucia.torres@prepar.mx');

  const uts = await db.conSistema((c) => c.q("SELECT id, clave, nombre, latitud, longitud FROM unidades_territoriales WHERE clave IN ('AZC-001','AZC-002','COY-001','COY-002') ORDER BY clave"));
  const ut = Object.fromEntries(uts.map((u) => [u.clave, u]));
  const personas = [
    ['María López Hernández', 'maria.lopez@correo.mx', '1998-04-12', 'mujer', 'AZC-001'],
    ['José Ramírez Cruz', 'jose.ramirez@correo.mx', '1985-09-03', 'hombre', 'AZC-001'],
    ['Ana Sofía Gutiérrez', 'ana.gutierrez@correo.mx', '2001-01-22', 'mujer', 'AZC-001'],
    ['Luis Hernández Soto', 'luis.hernandez@correo.mx', '1972-11-30', 'hombre', 'AZC-001'],
    ['Alex Moreno Díaz', 'alex.moreno@correo.mx', '1995-06-18', 'no_binario', 'AZC-001'],
    ['Patricia Flores Ruiz', 'patricia.flores@correo.mx', '1960-02-14', 'mujer', 'AZC-002'],
    ['Jorge Castillo Peña', 'jorge.castillo@correo.mx', '1990-08-08', 'hombre', 'AZC-002'],
    ['Rosa Martínez León', 'rosa.martinez@correo.mx', '1979-12-01', 'mujer', 'AZC-002'],
    ['Daniel Ortega Lima', 'daniel.ortega@correo.mx', '1988-03-25', 'prefiero_no_decir', 'COY-001'],
    ['Fernanda Reyes Mora', 'fernanda.reyes@correo.mx', '2003-07-07', 'mujer', 'COY-001'],
    ['Miguel Ángel Torres', 'miguel.torres@correo.mx', '1955-05-05', 'hombre', 'COY-002'],
    ['Carmen Aguilar Ríos', 'carmen.aguilar@correo.mx', '1993-10-10', 'mujer', 'COY-002'],
  ];
  const ciu = {};
  for (const [nombre, correo, nac, gen, clave] of personas) {
    await db.conSistema((c) => c.call('sp_registrar_ciudadano', [nombre, correo, hCiu, nac, gen, ut[clave].id, true]));
    ciu[correo.split('@')[0]] = await idDe(correo);
  }
  await db.conSistema((c) => c.q("UPDATE usuarios SET correo_verificado_en = NOW() WHERE rol = 'ciudadano' AND correo_verificado_en IS NULL"));

  const anio = new Date().getFullYear();
  const ciclo = (await como(admin, (c) => c.call('sp_crear_ciclo', [`Ciclo de demostración ${anio}`, anio, 12000000, `${azc},${coy}`, null, 'aleatorio'])))[0].ciclo_id;
  await como(admin, (c) => c.call('sp_calcular_presupuesto', [ciclo]));
  const fases = await db.conSistema((c) => c.q('SELECT id, orden FROM fases ORDER BY orden'));
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - 30);
  for (const f of fases) {
    const a = new Date(inicio); a.setDate(a.getDate() + (f.orden - 1) * 21);
    const b = new Date(a); b.setDate(b.getDate() + 20);
    await como(admin, (c) => c.q('INSERT INTO ciclo_fases (ciclo_id, fase_id, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?)', [ciclo, f.id, a.toISOString().slice(0, 10), b.toISOString().slice(0, 10)]));
  }
  const fase = (clave) => como(admin, (c) => c.call('sp_cambiar_fase', [ciclo, clave]));
  await fase('convocatoria');
  await como(admin, (c) => c.q("INSERT INTO avisos (alcaldia_id, titulo, mensaje) VALUES (NULL, 'Bienvenidos al ciclo de demostración', 'Consulta el calendario y el presupuesto de tu colonia en el panel.')"));
  if (!llega('diagnostico_registro')) return resumen();

  await fase('diagnostico_registro');
  await como(carlos, (c) => c.q("INSERT INTO avisos (alcaldia_id, titulo, mensaje) VALUES (?, 'Registro de proyectos abierto', 'Registra tu proyecto antes del cierre de la fase de Diagnóstico y Registro.')", [azc]));
  const ideas = [
    ['maria.lopez', 1, 'Rehabilitar el parque de la calle Norte 45: faltan luminarias y los juegos están rotos.'],
    ['jose.ramirez', 2, 'Hace falta reparar las banquetas cerca del mercado; hay muchas personas mayores que se tropiezan.'],
    ['ana.gutierrez', 3, 'Talleres gratuitos de música y pintura para jóvenes en el deportivo los fines de semana.'],
    ['patricia.flores', 1, 'Instalar bancas y botes de basura en la plaza de San Álvaro.'],
    ['daniel.ortega', 2, 'Mejorar el alumbrado de la calle Cerro del Agua por las noches.'],
  ];
  const idIdea = {};
  for (const [quien, rubro, texto] of ideas) {
    const r = await como(ciu[quien], (c) => c.q('INSERT INTO ideas (rubro_id, contenido) VALUES (?, ?)', [rubro, texto]));
    idIdea[quien] = r.insertId;
  }
  for (const quien of ['jose.ramirez', 'ana.gutierrez', 'luis.hernandez', 'alex.moreno']) await como(ciu[quien], (c) => c.q('INSERT INTO apoyos_idea (idea_id) VALUES (?)', [idIdea['maria.lopez']]));
  for (const quien of ['maria.lopez', 'luis.hernandez']) await como(ciu[quien], (c) => c.q('INSERT INTO apoyos_idea (idea_id) VALUES (?)', [idIdea['jose.ramirez']]));
  await como(ciu['jose.ramirez'], (c) => c.q('INSERT INTO comentarios_idea (idea_id, contenido) VALUES (?, ?)', [idIdea['maria.lopez'], 'De acuerdo, por las noches está muy oscuro.']));
  await como(ciu['ana.gutierrez'], (c) => c.q('INSERT INTO comentarios_idea (idea_id, contenido) VALUES (?, ?)', [idIdea['maria.lopez'], 'También podrían poner un bebedero.']));

  const subirImagen = async (quien, i) => {
    const [a, b] = COLORES[i % COLORES.length];
    const r = await como(ciu[quien], (c) => c.call('sp_guardar_archivo', ['imagen_proyecto', `proyecto-${i}.png`, 'image/png', imagen(480, 300, a, b), 480, 300, null]));
    return r[0].archivo_id;
  };
  const proyectos = [
    ['maria.lopez', 'AZC-001', 'Rehabilitación del parque Norte 45', 'Nuevas luminarias, juegos infantiles y áreas verdes en el parque de la calle Norte 45.', 1, 850000, 'Norte 45', '12', 'Frente al mercado', [0.0012, -0.0008], idIdea['maria.lopez']],
    ['jose.ramirez', 'AZC-001', 'Banquetas accesibles en Clavería', 'Reparación de banquetas y rampas para sillas de ruedas alrededor del mercado.', 2, 1200000, 'Calle Clavería', '45', null, [-0.0015, 0.0011], idIdea['jose.ramirez']],
    ['ana.gutierrez', 'AZC-001', 'Talleres culturales para jóvenes', 'Equipamiento y talleres de música y pintura en el deportivo de la colonia.', 3, 400000, 'Av. Azcapotzalco', '210', 'Deportivo', [0.0005, 0.0019], idIdea['ana.gutierrez']],
    ['luis.hernandez', 'AZC-001', 'Cámaras y alumbrado en calles oscuras', 'Alumbrado LED en tres calles de la colonia.', 2, 950000, 'Calle Egipto', null, null, null, null],
    ['patricia.flores', 'AZC-002', 'Plaza San Álvaro con mobiliario urbano', 'Bancas, botes de basura y jardineras en la plaza principal.', 1, 700000, 'Plaza San Álvaro', null, 'Junto a la parroquia', [0.0007, -0.0006], idIdea['patricia.flores']],
    ['daniel.ortega', 'COY-001', 'Alumbrado en Cerro del Agua', 'Luminarias LED en la calle Cerro del Agua.', 2, 600000, 'Cerro del Agua', '120', null, [0.001, 0.0005], idIdea['daniel.ortega']],
    ['fernanda.reyes', 'COY-001', 'Huerto comunitario Del Carmen', 'Huerto urbano con talleres de composta para vecinos.', 1, 350000, 'Calle Francisco Sosa', '80', null, [-0.0009, -0.0012], null],
    ['miguel.torres', 'COY-002', 'Cancha de usos múltiples Santa Úrsula', 'Rehabilitación de la cancha y gradas.', 3, 900000, 'Calle Papalotl', '15', null, [0.0011, 0.0004], null],
  ];
  const idP = [];
  for (let i = 0; i < proyectos.length; i += 1) {
    const [quien, clave, titulo, desc, rubro, costo, calle, numero, refs, delta, idea] = proyectos[i];
    const lat = delta ? Number(ut[clave].latitud) + delta[0] : null;
    const lng = delta ? Number(ut[clave].longitud) + delta[1] : null;
    const img = i < 6 ? await subirImagen(quien, i) : null;
    const r = await como(ciu[quien], (c) => c.q(
      `INSERT INTO proyectos (titulo, descripcion, rubro_id, costo_estimado, calle, numero, referencias, latitud, longitud, estado_ubicacion, imagen_archivo_id, idea_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [titulo, desc, rubro, costo, calle, numero, refs, lat, lng, lat === null ? 'no_ubicado' : 'ubicado', img, idea]));
    idP.push(r.insertId);
  }
  if (!llega('dictaminacion')) return resumen();

  for (let i = 0; i < idP.length; i += 1) {
    const f = i < 5 ? carlos : lucia;
    if (i === 3) await como(f, (c) => c.q("INSERT INTO revisiones_registro (proyecto_id, resultado, observacion) VALUES (?, 'correccion_solicitada', 'Indica el número exterior de la calle')", [idP[i]]));
    await como(f, (c) => c.q("INSERT INTO revisiones_registro (proyecto_id, resultado) VALUES (?, 'completo')", [idP[i]]));
  }
  await fase('dictaminacion');
  const criterios = await db.conSistema((c) => c.q('SELECT id FROM criterios_dictamen WHERE activo'));
  for (let i = 0; i < idP.length; i += 1) {
    const f = i < 5 ? carlos : lucia;
    const viable = i !== 3;
    await como(f, async (c) => {
      const d = await c.q('INSERT INTO dictamenes (proyecto_id) VALUES (?)', [idP[i]]);
      for (const cr of criterios) {
        const cumple = viable || cr.id !== criterios[6].id;
        await c.q('INSERT INTO dictamen_criterios (dictamen_id, criterio_id, cumple, observacion) VALUES (?, ?, ?, ?)', [d.insertId, cr.id, cumple, cumple ? null : 'El costo supera el presupuesto disponible para la colonia']);
      }
      await c.q('UPDATE dictamenes SET resultado = ?, justificacion = ?, emitido_en = NOW() WHERE id = ?',
        [viable ? 'viable' : 'no_viable', viable ? 'Cumple con los criterios técnicos, jurídicos, ambientales y financieros.' : 'No sustituye servicios, pero su costo excede el presupuesto de la unidad territorial.', d.insertId]);
    });
  }
  if (!llega('sorteo_difusion')) return resumen();

  await fase('sorteo_difusion');
  for (const clave of ['AZC-001', 'AZC-002']) await como(carlos, (c) => c.call('sp_realizar_sorteo', [ciclo, ut[clave].id]));
  for (const clave of ['COY-001', 'COY-002']) await como(lucia, (c) => c.call('sp_realizar_sorteo', [ciclo, ut[clave].id]));
  if (!llega('consulta')) return resumen();

  await fase('consulta');
  await como(admin, (c) => c.call('sp_abrir_votacion', [ciclo]));
  const votos = [['maria.lopez', 0], ['jose.ramirez', 0], ['ana.gutierrez', 2], ['alex.moreno', 0], ['patricia.flores', 4], ['jorge.castillo', 4], ['daniel.ortega', 5], ['fernanda.reyes', 6], ['miguel.torres', 7]];
  for (const [quien, p] of votos) await como(ciu[quien], (c) => c.call('sp_emitir_voto', [idP[p]]));
  if (destino === 'consulta') return resumen();

  await como(admin, (c) => c.call('sp_cerrar_votacion', [ciclo]));
  const casos = await db.conSistema((c) => c.q('SELECT unidad_territorial_id, caso_especial FROM resultados_unidad WHERE ciclo_id = ? AND proyecto_ganador_id IS NULL', [ciclo]));
  for (const k of casos) {
    const f = [ut['AZC-001'].id, ut['AZC-002'].id].includes(k.unidad_territorial_id) ? carlos : lucia;
    await como(f, (c) => c.call('sp_resolver_caso_especial', [ciclo, k.unidad_territorial_id, 'asamblea_sorteo', 'La asamblea informativa resolvió el caso especial mediante sorteo público.', null]));
  }
  await como(admin, (c) => c.call('sp_publicar_ganadores', [ciclo]));
  await fase('resultados');
  if (!llega('ejecucion_seguimiento')) return resumen();

  await fase('ejecucion_seguimiento');
  const ganadores = await db.conSistema((c) => c.q(
    `SELECT p.id, p.unidad_territorial_id, cu.presupuesto_asignado FROM resultados_unidad ru JOIN proyectos p ON p.id = ru.proyecto_ganador_id
     JOIN ciclo_unidades cu ON cu.ciclo_id = p.ciclo_id AND cu.unidad_territorial_id = p.unidad_territorial_id WHERE ru.ciclo_id = ?`, [ciclo]));
  let n = 0;
  for (const g of ganadores) {
    const f = [ut['AZC-001'].id, ut['AZC-002'].id].includes(g.unidad_territorial_id) ? carlos : lucia;
    const pct = [35, 60, 100, 15][n % 4];
    await como(f, (c) => c.q('INSERT INTO avances_proyecto (proyecto_id, porcentaje, monto_ejercido, estatus, nota) VALUES (?, ?, ?, ?, ?)',
      [g.id, pct, Math.round(Number(g.presupuesto_asignado) * pct / 120), pct === 100 ? 'concluido' : 'en_ejecucion', pct === 100 ? 'Obra entregada a la comunidad.' : 'Trabajos en proceso conforme al calendario.']));
    n += 1;
  }
  const vecinoDe = { [ut['AZC-001'].id]: 'jose.ramirez', [ut['AZC-002'].id]: 'jorge.castillo', [ut['COY-001'].id]: 'fernanda.reyes', [ut['COY-002'].id]: 'carmen.aguilar' };
  let k = 0;
  for (const g of ganadores) {
    const quien = vecinoDe[g.unidad_territorial_id];
    const tipo = k % 2 ? 'irregularidad' : 'avance';
    const rep = await como(ciu[quien], async (c) => {
      const r = await c.q('INSERT INTO reportes (proyecto_id, tipo, descripcion) VALUES (?, ?, ?)', [g.id, tipo,
        tipo === 'avance' ? 'Ya se instalaron las primeras luminarias y se limpió el área.' : 'La obra está detenida desde hace una semana y hay material en la banqueta.']);
      for (let j = 0; j < 2; j += 1) {
        const [a, b] = COLORES[(k + j) % COLORES.length];
        const f = await c.call('sp_guardar_archivo', ['foto_reporte', `reporte-${k}-${j}.png`, 'image/png', imagen(400, 300, a, b), 400, 300, null]);
        await c.q('INSERT INTO reporte_fotos (reporte_id, archivo_id, orden) VALUES (?, ?, ?)', [r.insertId, f[0].archivo_id, j + 1]);
      }
      return r.insertId;
    });
    if (k === 0) {
      await como(ciu['maria.lopez'], (c) => c.q('INSERT INTO comentarios_reporte (reporte_id, contenido) VALUES (?, ?)', [rep, 'Confirmo, ya se ve mucho mejor.']));
      await como(carlos, (c) => c.q("UPDATE reportes SET estatus = 'atendido', respuesta = 'Gracias por tu reporte. La obra sigue el calendario.' WHERE id = ?", [rep]));
    }
    k += 1;
  }
  if (!llega('evaluacion')) return resumen();

  await fase('evaluacion');
  const calif = [['maria.lopez', 5], ['jose.ramirez', 4], ['ana.gutierrez', 4], ['patricia.flores', 3], ['daniel.ortega', 5], ['miguel.torres', 2]];
  for (const [quien, p] of calif) {
    const g = ganadores.find((x) => x.unidad_territorial_id === (personas.find((pp) => pp[1].startsWith(quien)) ? ut[personas.find((pp) => pp[1].startsWith(quien))[4]].id : 0));
    if (g) await como(ciu[quien], (c) => c.q('INSERT INTO calificaciones (proyecto_id, puntuacion, comentario) VALUES (?, ?, ?)', [g.id, p, p >= 4 ? 'Buen trabajo de la alcaldía.' : 'Le faltan detalles.']));
  }
  return resumen();
}

async function resumen() {
  await db.conSistema((c) => c.q(`UPDATE usuarios SET terminos_version = (SELECT version FROM terminos_condiciones
    WHERE vigente_desde <= CURDATE() ORDER BY vigente_desde DESC LIMIT 1), terminos_aceptados_en = NOW() WHERE rol = 'ciudadano'`));
  console.log('\n✔ Datos de demostración listos.\n');
  console.log('  Administrador:  admin@prepar.mx              / Admin2026');
  console.log('  Funcionarios:   carlos.mendez@prepar.mx      / Funcionario2026  (Azcapotzalco)');
  console.log('                  lucia.torres@prepar.mx       / Funcionario2026  (Coyoacán)');
  console.log('  Ciudadanos:     maria.lopez@correo.mx        / Ciudadano2026    (Clavería, Azcapotzalco)');
  console.log('                  patricia.flores@correo.mx    / Ciudadano2026    (San Álvaro, Azcapotzalco)');
  console.log('                  daniel.ortega@correo.mx      / Ciudadano2026    (Del Carmen, Coyoacán)');
  console.log('                  … y 9 ciudadanos más con la misma contraseña.\n');
  console.log('  Nota: al entrar por primera vez, funcionarios y administrador deben aceptar los Términos y condiciones.\n');
}

principal()
  .catch((e) => { console.error('✘ No se pudieron cargar los datos:', e.sqlMessage || e.message); process.exitCode = 1; })
  .finally(() => db.cerrar());
