'use strict';
const zlib = require('zlib');
const bcrypt = require('bcryptjs');
const db = require('../db');
const log = require('./log');
const etapasObra = require('./etapas');

const NOMBRE = 'Ciclo de demostración (concluido)';
const PREPARANDO = 'Ciclo de demostración (preparando)';

const TABLA = (() => { const t = []; for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = TABLA[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const bloque = (tipo, datos) => {
  const l = Buffer.alloc(4); l.writeUInt32BE(datos.length);
  const td = Buffer.concat([Buffer.from(tipo), datos]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([l, td, c]);
};
function foto(ancho, alto, cielo, suelo) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0); ihdr.writeUInt32BE(alto, 4); ihdr[8] = 8; ihdr[9] = 2;
  const filas = Buffer.alloc((ancho * 3 + 1) * alto);
  const horizonte = Math.round(alto * 0.58);
  for (let y = 0; y < alto; y += 1) {
    const o = y * (ancho * 3 + 1);
    for (let x = 0; x < ancho; x += 1) {
      let col;
      if (y < horizonte) {
        const t = y / horizonte;
        col = cielo.map((v) => Math.round(v + (255 - v) * t * 0.35));
      } else {
        const t = (y - horizonte) / (alto - horizonte);
        col = suelo.map((v) => Math.round(v * (1 - t * 0.25)));
      }
      filas[o + 1 + x * 3] = col[0];
      filas[o + 2 + x * 3] = col[1];
      filas[o + 3 + x * 3] = col[2];
    }
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloque('IHDR', ihdr), bloque('IDAT', zlib.deflateSync(filas)), bloque('IEND', Buffer.alloc(0))]);
}
const ESCENAS = [[[118, 189, 215], [120, 150, 110]], [[150, 200, 230], [150, 150, 150]], [[244, 200, 140], [130, 140, 120]], [[170, 205, 225], [160, 130, 100]]];

const PERSONAS = [
  ['maria.lopez', 'María López Hernández', '1998-04-12', 'mujer', 'A1'],
  ['jose.ramirez', 'José Ramírez Cruz', '1985-09-03', 'hombre', 'A1'],
  ['ana.gutierrez', 'Ana Sofía Gutiérrez', '2001-01-22', 'mujer', 'A1'],
  ['luis.hernandez', 'Luis Hernández Soto', '1972-11-30', 'hombre', 'A1'],
  ['alex.moreno', 'Alex Moreno Díaz', '1995-06-18', 'no_binario', 'A1'],
  ['patricia.flores', 'Patricia Flores Ruiz', '1960-02-14', 'mujer', 'A2'],
  ['jorge.castillo', 'Jorge Castillo Peña', '1990-08-08', 'hombre', 'A2'],
  ['rosa.martinez', 'Rosa Martínez León', '1979-12-01', 'mujer', 'A2'],
  ['daniel.ortega', 'Daniel Ortega Lima', '1988-03-25', 'prefiero_no_decir', 'C1'],
  ['fernanda.reyes', 'Fernanda Reyes Mora', '2003-07-07', 'mujer', 'C1'],
  ['miguel.torres', 'Miguel Ángel Torres', '1955-05-05', 'hombre', 'C2'],
  ['carmen.aguilar', 'Carmen Aguilar Ríos', '1993-10-10', 'mujer', 'C2'],
];
const FUNCIONES = 'moderacion,revision_registros,dictaminacion,consulta,seguimiento';

const como = (id, fn) => db.conUsuario(id, fn);
const sis = (fn) => db.conSistema(fn);
const fechaLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function elegirColonias() {
  const alcaldias = await sis((c) => c.q("SELECT id, clave FROM alcaldias WHERE clave IN ('AZC', 'COY')"));
  const porClave = Object.fromEntries(alcaldias.map((a) => [a.clave, a.id]));
  if (!porClave.AZC || !porClave.COY) return null;
  const slots = {};
  for (const [pref, clave] of [['A', 'AZC'], ['C', 'COY']]) {
    const preferidas = await sis((c) => c.q(
      `SELECT DISTINCT ut.id, ut.nombre, ut.latitud, ut.longitud FROM usuarios u
       JOIN ciudadanos ci ON ci.usuario_id = u.id JOIN unidades_territoriales ut ON ut.id = ci.unidad_territorial_id
       WHERE u.correo IN (?) AND ut.alcaldia_id = ? AND ut.activa ORDER BY ut.id`,
      [PERSONAS.map((p) => `${p[0]}@correo.mx`), porClave[clave]]));
    const otras = await sis((c) => c.q(
      `SELECT id, nombre, latitud, longitud FROM unidades_territoriales WHERE alcaldia_id = ? AND activa
       ORDER BY latitud IS NULL, clave LIKE '${clave}-0%' DESC, id LIMIT 6`, [porClave[clave]]));
    const lista = [...preferidas];
    for (const o of otras) if (!lista.some((x) => x.id === o.id)) lista.push(o);
    if (lista.length < 2) return null;
    slots[`${pref}1`] = lista[0];
    slots[`${pref}2`] = lista[1];
  }
  return { alcaldias: porClave, slots };
}

async function funcionarioDe(adminId, alcaldiaId, clave, hash) {
  const f = await sis((c) => c.uno(
    `SELECT f.usuario_id AS id FROM funcionarios f JOIN usuarios u ON u.id = f.usuario_id AND u.estado = 'activa'
     WHERE f.alcaldia_id = ? AND (SELECT COUNT(*) FROM funcionario_funciones ff WHERE ff.funcionario_id = f.usuario_id
       AND ff.funcion IN ('revision_registros', 'dictaminacion', 'consulta', 'seguimiento')) = 4
     ORDER BY u.correo IN ('carlos.mendez@prepar.mx', 'lucia.torres@prepar.mx') DESC, f.usuario_id LIMIT 1`, [alcaldiaId]));
  if (f) return f.id;
  const correo = `funcionario.demo.${clave.toLowerCase()}@prepar.mx`;
  const existe = await sis((c) => c.uno('SELECT id FROM usuarios WHERE correo = ?', [correo]));
  if (existe) throw new Error(`La cuenta ${correo} existe pero no tiene las funciones necesarias`);
  await como(adminId, (c) => c.call('sp_registrar_funcionario', [`Funcionario de demostración ${clave}`, correo, hash, alcaldiaId, FUNCIONES]));
  await sis((c) => c.q('UPDATE funcionarios SET debe_cambiar_password = FALSE WHERE usuario_id = (SELECT id FROM usuarios WHERE correo = ?)', [correo]));
  return (await sis((c) => c.uno('SELECT id FROM usuarios WHERE correo = ?', [correo]))).id;
}

async function ciudadanoDe(usuario, nombre, nac, genero, ut, hash) {
  for (const correo of [`${usuario}@correo.mx`, `${usuario}.demo@correo.mx`]) {
    const u = await sis((c) => c.uno(
      `SELECT u.id, u.rol, u.estado, ci.unidad_territorial_id AS ut FROM usuarios u
       LEFT JOIN ciudadanos ci ON ci.usuario_id = u.id WHERE u.correo = ?`, [correo]));
    if (u && u.rol === 'ciudadano' && u.estado === 'activa' && Number(u.ut) === Number(ut)) return u.id;
    if (u) continue;
    await sis((c) => c.call('sp_registrar_ciudadano', [nombre, correo, hash, nac, genero, ut, true]));
    const id = (await sis((c) => c.uno('SELECT id FROM usuarios WHERE correo = ?', [correo]))).id;
    await sis((c) => c.q(
      `UPDATE usuarios SET correo_verificado_en = COALESCE(correo_verificado_en, NOW()),
         terminos_version = (SELECT version FROM terminos_condiciones WHERE vigente_desde <= CURDATE() ORDER BY vigente_desde DESC LIMIT 1),
         terminos_aceptados_en = NOW() WHERE id = ?`, [id]));
    return id;
  }
  return null;
}

async function construir(adminId, cicloRef) {
  const sel = await elegirColonias();
  if (!sel) throw new Error('No hay colonias suficientes en Azcapotzalco y Coyoacán');
  const { alcaldias, slots } = sel;
  const hFunc = await bcrypt.hash('Funcionario2026', 10);
  const hCiu = await bcrypt.hash('Ciudadano2026', 10);
  const fun = { A: await funcionarioDe(adminId, alcaldias.AZC, 'AZC', hFunc), C: await funcionarioDe(adminId, alcaldias.COY, 'COY', hFunc) };
  const funDe = (slot) => fun[slot[0]];
  const ciu = {};
  for (const [usuario, nombre, nac, gen, slot] of PERSONAS) ciu[usuario] = await ciudadanoDe(usuario, nombre, nac, gen, slots[slot].id, hCiu);
  for (const k of Object.keys(ciu)) if (!ciu[k]) throw new Error(`No se pudo preparar la cuenta de ${k}`);

  const anio = new Date().getFullYear() - 1;
  const uts = Object.values(slots).map((u) => u.id).join(',');
  const ciclo = (await como(adminId, (c) => c.call('sp_crear_ciclo', [PREPARANDO, anio, 12000000, null, uts, 'aleatorio'])))[0].ciclo_id;
  cicloRef.id = ciclo;
  await como(adminId, (c) => c.call('sp_calcular_presupuesto', [ciclo]));
  const fases = await sis((c) => c.q('SELECT id, orden, clave FROM fases ORDER BY orden'));
  const inicioDe = {};
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - 8 * 21 - 10);
  for (const f of fases) {
    const a = new Date(inicio); a.setDate(a.getDate() + (f.orden - 1) * 21);
    const b = new Date(a); b.setDate(b.getDate() + 20);
    inicioDe[f.clave] = new Date(a);
    await como(adminId, (c) => c.q('INSERT INTO ciclo_fases (ciclo_id, fase_id, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?)', [ciclo, f.id, fechaLocal(a), fechaLocal(b)]));
  }
  const fase = (clave) => como(adminId, (c) => c.call('sp_cambiar_fase', [ciclo, clave]));
  await fase('convocatoria');
  await fase('diagnostico_registro');

  const ideas = [
    ['maria.lopez', 1, 'Rehabilitar el parque de la colonia: faltan luminarias y los juegos están rotos.'],
    ['jose.ramirez', 2, 'Hace falta reparar las banquetas cerca del mercado; hay muchas personas mayores que se tropiezan.'],
    ['ana.gutierrez', 3, 'Talleres gratuitos de música y pintura para jóvenes en el deportivo los fines de semana.'],
    ['patricia.flores', 1, 'Instalar bancas y botes de basura en la plaza principal.'],
    ['daniel.ortega', 2, 'Mejorar el alumbrado de las calles por las noches.'],
  ];
  const idIdea = {};
  for (const [quien, rubro, texto] of ideas) {
    const r = await como(ciu[quien], (c) => c.q('INSERT INTO ideas (rubro_id, contenido) VALUES (?, ?)', [rubro, texto]));
    idIdea[quien] = r.insertId;
  }
  for (const quien of ['jose.ramirez', 'ana.gutierrez', 'luis.hernandez', 'alex.moreno', 'patricia.flores']) await como(ciu[quien], (c) => c.q('INSERT INTO apoyos_idea (idea_id) VALUES (?)', [idIdea['maria.lopez']]));
  for (const quien of ['maria.lopez', 'luis.hernandez']) await como(ciu[quien], (c) => c.q('INSERT INTO apoyos_idea (idea_id) VALUES (?)', [idIdea['jose.ramirez']]));
  await como(ciu['maria.lopez'], (c) => c.q('INSERT INTO apoyos_idea (idea_id) VALUES (?)', [idIdea['patricia.flores']]));
  await como(ciu['jose.ramirez'], (c) => c.q('INSERT INTO comentarios_idea (idea_id, contenido) VALUES (?, ?)', [idIdea['maria.lopez'], 'De acuerdo, por las noches está muy oscuro.']));
  await como(ciu['patricia.flores'], (c) => c.q('INSERT INTO comentarios_idea (idea_id, contenido) VALUES (?, ?)', [idIdea['maria.lopez'], 'Desde la otra colonia también lo apoyamos, ahí juegan nuestros nietos.']));

  const proyectos = [
    ['maria.lopez', 'A1', 'Rehabilitación del parque de la colonia', 'Nuevas luminarias, juegos infantiles y áreas verdes en el parque principal.', 1, 850000, 'Calle Norte 45', '12', 'Frente al mercado', [0.0012, -0.0008], idIdea['maria.lopez']],
    ['jose.ramirez', 'A1', 'Banquetas accesibles', 'Reparación de banquetas y rampas para sillas de ruedas alrededor del mercado.', 2, 1200000, 'Calle Clavería', '45', null, [-0.0015, 0.0011], idIdea['jose.ramirez']],
    ['ana.gutierrez', 'A1', 'Talleres culturales para jóvenes', 'Equipamiento y talleres de música y pintura en el deportivo de la colonia.', 3, 400000, 'Av. Azcapotzalco', '210', 'Deportivo', [0.0005, 0.0019], idIdea['ana.gutierrez']],
    ['luis.hernandez', 'A1', 'Alumbrado LED en calles oscuras', 'Alumbrado LED en tres calles de la colonia.', 2, 950000, 'Calle Egipto', '30', null, [-0.0006, -0.0017], null],
    ['patricia.flores', 'A2', 'Plaza con mobiliario urbano', 'Bancas, botes de basura y jardineras en la plaza principal.', 1, 700000, 'Plaza principal', null, 'Junto a la parroquia', [0.0007, -0.0006], idIdea['patricia.flores']],
    ['jorge.castillo', 'A2', 'Cancha de futbol rápido', 'Rehabilitación de la cancha con pasto sintético y alumbrado.', 3, 650000, 'Calle Rosario', '5', null, [-0.0008, 0.0009], null],
    ['daniel.ortega', 'C1', 'Alumbrado en la calle principal', 'Luminarias LED en la calle principal de la colonia.', 2, 600000, 'Cerro del Agua', '120', null, [0.001, 0.0005], idIdea['daniel.ortega']],
    ['fernanda.reyes', 'C1', 'Huerto comunitario', 'Huerto urbano con talleres de composta para vecinos.', 1, 350000, 'Calle Francisco Sosa', '80', null, [-0.0009, -0.0012], null],
    ['miguel.torres', 'C2', 'Cancha de usos múltiples', 'Rehabilitación de la cancha y gradas.', 3, 900000, 'Calle Papalotl', '15', null, [0.0011, 0.0004], null],
    ['carmen.aguilar', 'C2', 'Rampas y señalización', 'Rampas en esquinas y señalización para personas con discapacidad.', 2, 500000, 'Av. Santa Úrsula', '300', null, [-0.0007, 0.001], null],
  ];
  const idP = [];
  for (const [quien, slot, titulo, desc, rubro, costo, calle, numero, refs, delta, idea] of proyectos) {
    const u = slots[slot];
    const lat = delta && u.latitud !== null ? Number(u.latitud) + delta[0] : null;
    const lng = delta && u.longitud !== null ? Number(u.longitud) + delta[1] : null;
    const r = await como(ciu[quien], (c) => c.q(
      `INSERT INTO proyectos (titulo, descripcion, rubro_id, costo_estimado, calle, numero, referencias, latitud, longitud, estado_ubicacion, imagen_archivo_id, idea_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [titulo, desc, rubro, costo, calle, numero, refs, lat, lng, lat === null ? 'no_ubicado' : 'ubicado', null, idea]));
    idP.push({ id: r.insertId, slot });
  }

  for (let i = 0; i < idP.length; i += 1) {
    const f = funDe(idP[i].slot);
    if (i === 3) await como(f, (c) => c.q("INSERT INTO revisiones_registro (proyecto_id, resultado, observacion) VALUES (?, 'correccion_solicitada', 'Indica el número exterior de la calle')", [idP[i].id]));
    await como(f, (c) => c.q("INSERT INTO revisiones_registro (proyecto_id, resultado) VALUES (?, 'completo')", [idP[i].id]));
  }
  await fase('dictaminacion');
  const criterios = await sis((c) => c.q('SELECT id FROM criterios_dictamen WHERE activo ORDER BY id'));
  const noViables = [3, 9];
  for (let i = 0; i < idP.length; i += 1) {
    const viable = !noViables.includes(i);
    await como(funDe(idP[i].slot), async (c) => {
      const d = await c.q('INSERT INTO dictamenes (proyecto_id) VALUES (?)', [idP[i].id]);
      for (let k = 0; k < criterios.length; k += 1) {
        const cumple = viable || k !== Math.min(6, criterios.length - 1);
        await c.q('INSERT INTO dictamen_criterios (dictamen_id, criterio_id, cumple, observacion) VALUES (?, ?, ?, ?)', [d.insertId, criterios[k].id, cumple, cumple ? null : 'El costo supera el presupuesto disponible para la colonia']);
      }
      const emitido = new Date(inicioDe.dictaminacion); emitido.setDate(emitido.getDate() + 5); emitido.setHours(10 + (i % 6), 15 * (i % 4), 0, 0);
      const creado = new Date(emitido); creado.setDate(creado.getDate() - 2);
      await c.q('UPDATE dictamenes SET resultado = ?, justificacion = ?, creado_en = ?, emitido_en = ? WHERE id = ?',
        [viable ? 'viable' : 'no_viable', viable ? 'Cumple con los criterios técnicos, jurídicos, ambientales y financieros.' : 'Su costo excede el presupuesto de la unidad territorial.', creado, emitido, d.insertId]);
    });
  }

  await fase('sorteo_difusion');
  for (const slot of ['A1', 'A2', 'C1', 'C2']) await como(funDe(slot), (c) => c.call('sp_realizar_sorteo', [ciclo, slots[slot].id]));

  await fase('consulta');
  await como(adminId, (c) => c.call('sp_abrir_votacion', [ciclo]));
  const votos = [['maria.lopez', 0], ['jose.ramirez', 0], ['ana.gutierrez', 2], ['alex.moreno', 0], ['luis.hernandez', 1],
    ['patricia.flores', 4], ['jorge.castillo', 4], ['rosa.martinez', 5], ['daniel.ortega', 6], ['fernanda.reyes', 6], ['miguel.torres', 8], ['carmen.aguilar', 8]];
  for (const [quien, p] of votos) await como(ciu[quien], (c) => c.call('sp_emitir_voto', [idP[p].id]));
  await como(adminId, (c) => c.call('sp_cerrar_votacion', [ciclo]));
  const casos = await sis((c) => c.q(
    `SELECT ru.unidad_territorial_id AS ut, ut.alcaldia_id FROM resultados_unidad ru JOIN unidades_territoriales ut ON ut.id = ru.unidad_territorial_id
     WHERE ru.ciclo_id = ? AND ru.proyecto_ganador_id IS NULL`, [ciclo]));
  for (const k of casos) {
    const f = Number(k.alcaldia_id) === Number(alcaldias.AZC) ? fun.A : fun.C;
    await como(f, (c) => c.call('sp_resolver_caso_especial', [ciclo, k.ut, 'asamblea_sorteo', 'La asamblea informativa resolvió el caso especial mediante sorteo público.', null]));
  }
  await como(adminId, (c) => c.call('sp_publicar_ganadores', [ciclo]));
  await fase('resultados');

  await fase('ejecucion_seguimiento');
  const ganadores = await sis((c) => c.q(
    `SELECT p.id, p.unidad_territorial_id AS ut, p.costo_estimado, a.clave FROM resultados_unidad ru JOIN proyectos p ON p.id = ru.proyecto_ganador_id
     JOIN unidades_territoriales u ON u.id = p.unidad_territorial_id JOIN alcaldias a ON a.id = u.alcaldia_id
     WHERE ru.ciclo_id = ? ORDER BY p.id`, [ciclo]));
  const slotDe = (ut) => Object.keys(slots).find((s) => Number(slots[s].id) === Number(ut));
  let n = 0;
  for (const g of ganadores) {
    const f = funDe(slotDe(g.ut));
    const meta = [100, 60, 35, 100][n % 4];
    await como(f, async (c) => {
      const lista = await etapasObra.etapasDe(c, g.id);
      let pct = 0;
      for (const e of lista) {
        if (pct + e.peso > meta) break;
        pct += e.peso;
        await c.q('INSERT INTO etapas_proyecto (proyecto_id, etapa_id, evidencia, usuario_id) VALUES (?, ?, ?, ?)',
          [g.id, e.id, `Se completó la etapa de ${e.nombre_es.toLowerCase()} conforme al calendario.`, f]);
      }
      await c.q('INSERT INTO avances_proyecto (proyecto_id, porcentaje, monto_ejercido, estatus, nota) VALUES (?, ?, ?, ?, ?)',
        [g.id, pct, Math.round(Number(g.costo_estimado) * (pct / 100) * 0.95), pct >= 100 ? 'concluido' : 'en_ejecucion', pct >= 100 ? 'Obra entregada a la comunidad.' : 'Trabajos en proceso conforme al calendario.']);
    });
    n += 1;
  }
  const vecinoDe = { A1: 'jose.ramirez', A2: 'jorge.castillo', C1: 'fernanda.reyes', C2: 'carmen.aguilar' };
  let k = 0;
  for (const g of ganadores) {
    const slot = slotDe(g.ut);
    const quien = vecinoDe[slot];
    const tipo = k % 2 ? 'irregularidad' : 'avance';
    const rep = await como(ciu[quien], async (c) => {
      const r = await c.q('INSERT INTO reportes (proyecto_id, tipo, descripcion) VALUES (?, ?, ?)', [g.id, tipo,
        tipo === 'avance' ? 'Ya se instalaron las primeras luminarias y se limpió el área.' : 'La obra estuvo detenida una semana y había material en la banqueta.']);
      const [cielo, suelo] = ESCENAS[k % ESCENAS.length];
      const f = await c.call('sp_guardar_archivo', ['foto_reporte', `foto-obra-${k + 1}.png`, 'image/png', foto(400, 300, cielo, suelo), 400, 300, null]);
      await c.q('INSERT INTO reporte_fotos (reporte_id, archivo_id, orden) VALUES (?, ?, ?)', [r.insertId, f[0].archivo_id, 1]);
      return r.insertId;
    });
    await como(funDe(slot), (c) => c.q("UPDATE reportes SET estatus = 'atendido', respuesta = ? WHERE id = ?",
      [tipo === 'avance' ? 'Gracias por tu reporte. La obra sigue el calendario.' : 'Gracias. Se retiró el material y la obra se reanudó.', rep]));
    if (slot === 'A1') await como(ciu['maria.lopez'], (c) => c.q('INSERT INTO comentarios_reporte (reporte_id, contenido) VALUES (?, ?)', [rep, 'Confirmo, ya se ve mucho mejor.']));
    k += 1;
  }

  await fase('evaluacion');
  const calif = [['maria.lopez', 5, 'A1'], ['jose.ramirez', 4, 'A1'], ['ana.gutierrez', 4, 'A1'], ['patricia.flores', 3, 'A2'], ['daniel.ortega', 5, 'C1'], ['miguel.torres', 2, 'C2']];
  for (const [quien, p, slot] of calif) {
    const g = ganadores.find((x) => Number(x.ut) === Number(slots[slot].id));
    if (g) await como(ciu[quien], (c) => c.q('INSERT INTO calificaciones (proyecto_id, puntuacion, comentario) VALUES (?, ?, ?)', [g.id, p, p >= 4 ? 'Buen trabajo de la alcaldía.' : 'Le faltan detalles.']));
  }
  return { ciclo, ciudadanos: Object.values(ciu), proyectos: idP.map((p) => p.id) };
}

let ocupado = false;
async function fechar(ciclo) {
  const fs = await sis((c) => c.q('SELECT f.clave, cf.fecha_inicio AS d FROM ciclo_fases cf JOIN fases f ON f.id = cf.fase_id WHERE cf.ciclo_id = ?', [ciclo]));
  const dia = Object.fromEntries(fs.map((f) => [f.clave, f.d instanceof Date ? fechaLocal(f.d) : String(f.d).slice(0, 10)]));
  const t = (fase, dias) => `DATE_ADD(DATE_ADD('${dia[fase]} 09:00:00', INTERVAL ${dias} DAY), INTERVAL FLOOR(RAND() * 600) MINUTE)`;
  const sentencias = [
    `UPDATE ciclos SET creado_en = ${t('convocatoria', 0)}, votacion_abierta_en = ${t('consulta', 0)}, votacion_cerrada_en = ${t('consulta', 20)},
       computo_realizado_en = ${t('resultados', 0)}, resultados_publicados_en = ${t('resultados', 1)} WHERE id = ?`,
    `UPDATE ideas SET creada_en = ${t('diagnostico_registro', 2)} WHERE ciclo_id = ?`,
    `UPDATE apoyos_idea a JOIN ideas i ON i.id = a.idea_id SET a.creado_en = ${t('diagnostico_registro', 4)} WHERE i.ciclo_id = ?`,
    `UPDATE comentarios_idea k JOIN ideas i ON i.id = k.idea_id SET k.creado_en = ${t('diagnostico_registro', 5)} WHERE i.ciclo_id = ?`,
    `UPDATE proyectos SET creado_en = ${t('diagnostico_registro', 8)}, actualizado_en = ${t('ejecucion_seguimiento', 30)} WHERE ciclo_id = ?`,
    `UPDATE revisiones_registro r JOIN proyectos p ON p.id = r.proyecto_id SET r.revisado_en = ${t('diagnostico_registro', 15)} WHERE p.ciclo_id = ?`,
    `UPDATE sorteos SET realizado_en = ${t('sorteo_difusion', 1)}, boleta_publicada_en = ${t('sorteo_difusion', 2)} WHERE ciclo_id = ?`,
    `UPDATE participaciones SET participo_en = ${t('consulta', 3)} WHERE ciclo_id = ?`,
    `UPDATE resultados_unidad SET resuelto_en = ${t('resultados', 0)} WHERE ciclo_id = ? AND resuelto_en IS NOT NULL`,
    `UPDATE etapas_proyecto e JOIN proyectos p ON p.id = e.proyecto_id SET e.cumplida_en = ${t('ejecucion_seguimiento', 10)} WHERE p.ciclo_id = ?`,
    `UPDATE avances_proyecto a JOIN proyectos p ON p.id = a.proyecto_id SET a.registrado_en = ${t('ejecucion_seguimiento', 30)} WHERE p.ciclo_id = ?`,
    `UPDATE reportes r JOIN proyectos p ON p.id = r.proyecto_id SET r.creado_en = ${t('ejecucion_seguimiento', 15)}, r.revisado_en = ${t('ejecucion_seguimiento', 17)} WHERE p.ciclo_id = ?`,
    `UPDATE reporte_fotos f JOIN reportes r ON r.id = f.reporte_id JOIN proyectos p ON p.id = r.proyecto_id SET f.subida_en = ${t('ejecucion_seguimiento', 15)} WHERE p.ciclo_id = ?`,
    `UPDATE comentarios_reporte k JOIN reportes r ON r.id = k.reporte_id JOIN proyectos p ON p.id = r.proyecto_id SET k.creado_en = ${t('ejecucion_seguimiento', 18)} WHERE p.ciclo_id = ?`,
    `UPDATE calificaciones k JOIN proyectos p ON p.id = k.proyecto_id SET k.creada_en = ${t('evaluacion', 3)} WHERE p.ciclo_id = ?`,
  ];
  for (const q of sentencias) {
    await sis(async (c) => {
      await c.q('SET @interno = 1');
      try { await c.q(q, [ciclo]); } finally { await c.q('SET @interno = NULL'); }
    }).catch((e) => log.aviso(`Ciclo de demostración: no se pudo ajustar una fecha (${e.sqlMessage || e.message})`));
  }
}

async function asegurar() {
  if (ocupado) return { motivo: 'en proceso' };
  ocupado = true;
  try {
    const listo = await sis((c) => c.uno('SELECT id FROM ciclos WHERE nombre = ?', [NOMBRE]));
    if (listo) return { motivo: 'ya existe' };
    const practica = await sis((c) => c.uno("SELECT valor FROM parametros_sistema WHERE clave = 'ciclos_iniciales_creados'"));
    if (!practica) return { motivo: 'Primero se crea el ciclo de práctica' };
    const admin = await sis((c) => c.uno("SELECT id FROM usuarios WHERE rol = 'administrador' AND estado = 'activa' ORDER BY id LIMIT 1"));
    if (!admin) return { motivo: 'No hay un Administrador activo' };
    await sis((c) => c.q("UPDATE ciclos SET estado = 'cerrado', cerrado_en = NOW(), votacion_abierta = FALSE WHERE nombre = ? AND estado <> 'cerrado'", [PREPARANDO]));
    const original = await sis((c) => c.uno("SELECT id FROM ciclos WHERE estado = 'activo' ORDER BY id LIMIT 1"));
    const maxNotif = (await sis((c) => c.uno('SELECT COALESCE(MAX(id), 0) AS n FROM notificaciones'))).n;
    if (original) await sis((c) => c.q("UPDATE ciclos SET estado = 'borrador', pausado_en = NOW() WHERE id = ?", [original.id]));
    const ref = { id: null };
    try {
      const r = await construir(admin.id, ref);
      await fechar(r.ciclo);
      await sis((c) => c.q("UPDATE ciclos SET nombre = ?, estado = 'borrador', pausado_en = NOW() WHERE id = ?", [NOMBRE, r.ciclo]));
      await sis((c) => c.q(
        `UPDATE notificaciones SET leida = TRUE WHERE id > ? AND (proyecto_id IN (SELECT id FROM proyectos WHERE ciclo_id = ?) OR usuario_id IN (?))`,
        [maxNotif, r.ciclo, r.ciudadanos]));
      log.info(`Se creó «${NOMBRE}». Actívalo desde el panel del Administrador cuando quieras mostrarlo`);
      return { creado: r.ciclo };
    } catch (e) {
      if (ref.id) await sis((c) => c.q("UPDATE ciclos SET estado = 'cerrado', cerrado_en = NOW(), votacion_abierta = FALSE WHERE id = ?", [ref.id])).catch(() => {});
      throw e;
    } finally {
      if (original) {
        await sis((c) => c.q("UPDATE ciclos SET estado = 'borrador' WHERE estado = 'activo' AND id <> ?", [original.id])).catch(() => {});
        await sis((c) => c.q("UPDATE ciclos SET estado = 'activo', pausado_en = NULL WHERE id = ?", [original.id])).catch(() => {});
      }
    }
  } catch (e) {
    log.aviso(`No se pudo crear el ciclo de demostración: ${e.sqlMessage || e.message}`);
    return { error: e.sqlMessage || e.message };
  } finally {
    ocupado = false;
  }
}

module.exports = { asegurar, NOMBRE };
