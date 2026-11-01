'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('./ayuda');

const CLAVERIA = 3;
const SAN_ALVARO = 4;
const DEL_CARMEN = 7;
const AZC = 2;
const COY = 4;

const ok = (r, msg) => assert.ok(r.estado >= 200 && r.estado < 300, `${msg || ''} → ${r.estado} ${JSON.stringify(r.datos).slice(0, 300)}`);
const falla = (r, estado, msg) => assert.equal(r.estado, estado, `${msg || ''} → ${r.estado} ${JSON.stringify(r.datos).slice(0, 300)}`);

const estado = {};

test.before(async () => { await A.iniciar(); await A.crearAdmin(); });
test.after(async () => { await A.detener(); });

test('registro de ciudadanos y reglas de la cuenta', async () => {
  const datos = (n, ut, extra = {}) => ({
    nombre: `Vecina Número ${n}`.replace(/\d/g, (d) => 'ABCDEFGHIJ'[d]), correo: `vecino${n}@correo.mx`, password: 'Prepar2026',
    fecha_nacimiento: '1990-05-1' + (n % 9), genero: ['mujer', 'hombre', 'no_binario', 'prefiero_no_decir'][n % 4],
    unidad_territorial_id: ut, acepta_aviso: true, ...extra,
  });
  estado.c = [];
  for (let i = 1; i <= 6; i += 1) {
    const c = A.cliente();
    const ut = i <= 4 ? CLAVERIA : (i === 5 ? SAN_ALVARO : DEL_CARMEN);
    const r = await c.post('/api/auth/registro', datos(i, ut));
    ok(r, `registro ${i}`);
    assert.equal(r.datos.destino, '/ciudadano/inicio.html');
    estado.c.push(c);
  }
  const anon = A.cliente();
  falla(await anon.post('/api/auth/registro', datos(1, CLAVERIA)), 409, 'correo repetido');
  falla(await anon.post('/api/auth/registro', datos(9, CLAVERIA, { fecha_nacimiento: '2015-01-01' })), 400, 'menor de edad');
  falla(await anon.post('/api/auth/registro', datos(9, CLAVERIA, { acepta_aviso: false })), 400, 'sin aviso');
  falla(await anon.post('/api/auth/registro', datos(9, 99999)), 400, 'unidad inexistente');
  falla(await anon.post('/api/auth/registro', datos(9, CLAVERIA, { password: 'corta' })), 400, 'contraseña corta');
  falla(await anon.post('/api/auth/registro', datos(9, CLAVERIA, { nombre: 'x'.repeat(51) })), 400, 'nombre largo');
  falla(await anon.post('/api/auth/registro', datos(9, CLAVERIA, { genero: 'otro' })), 400, 'género no válido');
  falla(await anon.post('/api/auth/registro', datos(9, CLAVERIA, { fecha_nacimiento: '1990-02-30' })), 400, 'fecha imposible');

  const yo = await estado.c[0].get('/api/auth/yo');
  ok(yo);
  assert.equal(yo.datos.rol, 'ciudadano');
  assert.equal(yo.datos.unidadId, CLAVERIA);
  falla(await anon.get('/api/auth/yo'), 401);
  falla(await estado.c[0].get('/api/admin/resumen'), 403, 'ciudadano no entra al panel de admin');
});

test('registro: confirmar contraseña y aceptar Términos y condiciones', async () => {
  const anon = A.cliente();
  const base = { nombre: 'Vecina Términos', correo: 'terminos@correo.mx', password: 'Prepar2026', fecha_nacimiento: '1991-04-04',
    genero: 'mujer', unidad_territorial_id: CLAVERIA, acepta_aviso: true };
  falla(await anon.post('/api/auth/registro', { ...base, acepta_terminos: true }, { crudo: true }), 400, 'sin confirmar');
  falla(await anon.post('/api/auth/registro', { ...base, acepta_terminos: true, confirmar: 'Prepar2027' }, { crudo: true }), 400, 'no coinciden');
  falla(await anon.post('/api/auth/registro', { ...base, confirmar: 'Prepar2026' }, { crudo: true }), 400, 'sin términos');
  falla(await anon.post('/api/auth/registro', { ...base, confirmar: 'Prepar2026', acepta_terminos: true }, { crudo: true }), 400, 'sin captcha');
  const r = await anon.post('/api/auth/registro', { ...base, confirmar: 'Prepar2026', acepta_terminos: true, ...(await A.captchaResuelto()) }, { crudo: true });
  ok(r, 'registro completo');
  assert.equal(r.datos.debeAceptarTerminos, false, 'al registrarse ya aceptó la versión vigente');
  const fila = await A.db.conSistema((con) => con.uno("SELECT terminos_version, terminos_aceptados_en FROM usuarios WHERE correo = 'terminos@correo.mx'"));
  assert.equal(fila.terminos_version, '1.0');
  assert.ok(fila.terminos_aceptados_en);
  const t = await anon.get('/api/publico/terminos');
  ok(t);
  assert.equal(t.datos.version, '1.0');
  assert.match(t.datos.texto_es, /simulador/);

  await A.db.conSistema((con) => con.q("INSERT INTO terminos_condiciones (version, texto_es, texto_en, vigente_desde) VALUES ('1.1', 'Términos nuevos del simulador', 'New terms', CURDATE())"));
  A.olvidarSesiones();
  const c = A.cliente();
  const l = await c.post('/api/auth/login', { correo: 'terminos@correo.mx', password: 'Prepar2026' }, { crudo: true });
  ok(l);
  assert.equal(l.datos.debeAceptarTerminos, true);
  assert.match(l.datos.destino, /^\/terminos\.html\?aceptar=1/);
  const bloqueada = await c.get('/api/ciudadano/panel');
  falla(bloqueada, 403, 'sin aceptar la versión nueva');
  assert.equal(bloqueada.datos.codigo, 'aceptar_terminos');
  const pag = await c.get('/ciudadano/inicio.html');
  falla(pag, 302, 'la página manda a aceptar los términos');
  assert.match(pag.headers.get('location'), /^\/terminos\.html\?aceptar=1/);
  falla(await c.post('/api/auth/aceptar-terminos', { acepto: false }), 400, 'sin marcar la casilla');
  falla(await c.post('/api/auth/aceptar-terminos', { acepto: true, version: '1.0' }), 409, 'versión vieja');
  ok(await c.post('/api/auth/aceptar-terminos', { acepto: true, version: '1.1' }));
  ok(await c.get('/api/ciudadano/panel'), 'ya puede usar el sistema');
  await A.db.conSistema((con) => con.q("UPDATE usuarios SET terminos_version = '1.1' WHERE terminos_version = '1.0'"));
  A.olvidarSesiones();
});

test('las páginas privadas exigen sesión del rol correcto (no basta copiar la dirección)', async () => {
  const anon = A.cliente();
  const rutas = ['/admin/inicio.html', '/funcionario/registros.html', '/ciudadano/mapa.html', '/admin/inicio', '/ADMIN/inicio.html',
    '/%61dmin/inicio.html', '//admin/usuarios.html', '/./funcionario/inicio.html', '/admin/../admin/inicio.html', '/Funcionario%2Finicio.html'];
  for (const r of rutas) {
    const x = await anon.pedir('GET', r, undefined, { crudo: true });
    falla(x, 302, `sin sesión ${r}`);
    assert.match(x.headers.get('location'), /^\/login\.html\?volver=/, r);
    assert.match(x.headers.get('cache-control') || '', /no-store/, r);
  }
  const cAdm = await estado.c[0].get('/admin/inicio.html');
  falla(cAdm, 302);
  assert.equal(cAdm.headers.get('location'), '/ciudadano/inicio.html');
  const propia = await estado.c[0].get('/ciudadano/inicio.html');
  ok(propia);
  assert.match(propia.headers.get('cache-control') || '', /no-store/, 'las páginas privadas no se guardan en caché');
  ok(await anon.get('/login.html'), 'las páginas públicas siguen abiertas');
  ok(await anon.get('/terminos.html'));
  const raro = await anon.pedir('GET', '/admin/%E0%A4%A', undefined, { crudo: true });
  falla(raro, 400, 'ruta mal codificada');
});

test('inicio de sesión, bloqueo por intentos y cierre de sesión', async () => {
  const c = A.cliente();
  falla(await c.post('/api/auth/login', { correo: 'vecino1@correo.mx', password: 'Equivocada1' }), 401);
  falla(await c.post('/api/auth/login', { correo: 'nadie@correo.mx', password: 'Equivocada1' }), 401);
  ok(await c.post('/api/auth/login', { correo: 'VECINO1@correo.mx', password: 'Prepar2026' }), 'correo sin importar mayúsculas');
  ok(await c.post('/api/auth/logout'));
  falla(await c.get('/api/auth/yo'), 401, 'tras cerrar sesión');
  const b = A.cliente();
  for (let i = 0; i < 6; i += 1) await b.post('/api/auth/login', { correo: 'vecino6@correo.mx', password: 'Equivocada1' });
  const bloqueada = await b.post('/api/auth/login', { correo: 'vecino6@correo.mx', password: 'Prepar2026' });
  falla(bloqueada, 401, 'una cuenta bloqueada responde igual que una contraseña incorrecta, aunque la contraseña sea la correcta');
  assert.equal(bloqueada.datos.error, 'Correo o contraseña incorrectos');
  await A.db.conSistema((con) => con.q("UPDATE usuarios SET bloqueado_hasta = NULL, intentos_fallidos = 0 WHERE correo = 'vecino6@correo.mx'"));
  ok(await b.post('/api/auth/login', { correo: 'vecino6@correo.mx', password: 'Prepar2026' }));
});

test('administrador registra un funcionario y este cambia su contraseña temporal', async () => {
  estado.admin = A.cliente();
  ok(await estado.admin.post('/api/auth/login', { correo: 'admin@prepar.mx', password: 'Admin12345' }));
  const r = await estado.admin.post('/api/admin/funcionarios', {
    nombre: 'Carlos Méndez Ruiz', correo: 'carlos@prepar.mx', alcaldia_id: AZC,
    funciones: ['directorio', 'moderacion', 'revision_registros', 'dictaminacion', 'consulta', 'seguimiento'],
  });
  ok(r, 'alta de funcionario');
  assert.match(r.datos.passwordTemporal, /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/);
  falla(await estado.admin.post('/api/admin/funcionarios', { nombre: 'Otra Persona', correo: 'carlos@prepar.mx', alcaldia_id: AZC, funciones: ['moderacion'] }), 409);
  falla(await estado.admin.post('/api/admin/funcionarios', { nombre: 'Otra Persona', correo: 'otra@prepar.mx', alcaldia_id: AZC, funciones: ['volar'] }), 400);
  const f2 = await estado.admin.post('/api/admin/funcionarios', { nombre: 'Lucía Torres', correo: 'lucia@prepar.mx', alcaldia_id: COY, funciones: ['moderacion'] });
  ok(f2);
  estado.idLucia = f2.datos.id;

  const f = A.cliente();
  const login = await f.post('/api/auth/login', { correo: 'carlos@prepar.mx', password: r.datos.passwordTemporal });
  ok(login);
  assert.equal(login.datos.debeCambiarPassword, true);
  assert.match(decodeURIComponent(login.datos.destino), /temporal=1/, 'tras aceptar los términos, va a cambiar su contraseña');
  const bloqueada = await f.get('/api/func/panel');
  falla(bloqueada, 403, 'debe cambiar contraseña antes de usar el panel');
  assert.equal(bloqueada.datos.codigo, 'cambiar_password');
  falla(await f.post('/api/auth/cambiar-password', { actual: 'incorrecta', nueva: 'Funcionario2026' }), 400);
  ok(await f.post('/api/auth/cambiar-password', { actual: r.datos.passwordTemporal, nueva: 'Funcionario2026', confirmar: 'Funcionario2026' }));
  ok(await f.get('/api/func/panel'), 'ya puede usar el panel');
  estado.func = f;

  const lista = await estado.admin.get('/api/admin/funcionarios');
  ok(lista);
  assert.equal(lista.datos.length, 2);
  ok(await estado.admin.put(`/api/admin/funcionarios/${estado.idLucia}`, { alcaldia_id: COY, funciones: ['moderacion', 'directorio'] }));
  ok(await estado.admin.post(`/api/admin/funcionarios/${estado.idLucia}/estado`, { estado: 'desactivada' }));
  ok(await estado.admin.post(`/api/admin/funcionarios/${estado.idLucia}/estado`, { estado: 'activa' }));
  const rp = await estado.admin.post(`/api/admin/funcionarios/${estado.idLucia}/restablecer`);
  ok(rp);
  assert.ok(rp.datos.passwordTemporal);
});

test('perfil: nombre, foto y contraseña', async () => {
  const c = estado.c[0];
  ok(await c.put('/api/perfil', { nombre: 'Ana María López', genero: 'mujer', unidad_territorial_id: CLAVERIA, idioma: 'es' }));
  falla(await c.put('/api/perfil', { nombre: 'Ana123' }), 400, 'nombre con números');
  const foto = await c.put('/api/perfil/foto', A.png(20, 20), { headers: { 'Content-Type': 'image/png' } });
  ok(foto, 'subir foto');
  const ver = await c.get(`/api/archivos/${foto.datos.fotoUuid}`);
  ok(ver);
  assert.equal(ver.headers.get('content-type'), 'image/png');
  falla(await c.put('/api/perfil/foto', Buffer.from('no es imagen, solo texto'), { headers: { 'Content-Type': 'image/png' } }), 400);
  falla(await c.put('/api/perfil/foto', Buffer.alloc(3 * 1024 * 1024, 1), { headers: { 'Content-Type': 'image/png' } }), 413);
  ok(await c.del('/api/perfil/foto'));
  falla(await c.get(`/api/archivos/${foto.datos.fotoUuid}`), 404, 'la foto anterior ya no se sirve');
  ok(await estado.func.put('/api/perfil', { nombre: 'Carlos Méndez' }), 'el funcionario edita su perfil');
  ok(await estado.admin.put('/api/perfil', { nombre: 'Administración Prepar' }), 'el administrador edita su perfil');
  ok(await estado.func.put('/api/perfil/foto', A.jpegFalso(), { headers: { 'Content-Type': 'image/jpeg' } }), 'foto del funcionario');
  ok(await estado.admin.put('/api/perfil/idioma', { idioma: 'en' }));
  ok(await estado.admin.put('/api/perfil/idioma', { idioma: 'es' }));
});

test('administrador crea y activa el ciclo', async () => {
  const a = estado.admin;
  falla(await a.post('/api/admin/ciclos', { nombre: 'X', anio_simulado: 2026, presupuesto_total: 100 }), 400, 'sin participantes');
  const r = await a.post('/api/admin/ciclos', {
    nombre: 'Ciclo de prueba 2026', anio_simulado: 2026, presupuesto_total: 10000000, alcaldias: [AZC, COY], origen_indices: 'aleatorio',
  });
  ok(r, 'crear ciclo');
  estado.ciclo = r.datos.id;
  const det = await a.get(`/api/admin/ciclos/${estado.ciclo}`);
  ok(det);
  assert.equal(det.datos.unidades.length, 4);
  const suma = det.datos.unidades.reduce((s, u) => s + Number(u.presupuesto_asignado), 0);
  assert.equal(Math.round(suma), 10000000, 'la distribución suma el presupuesto total');
  ok(await a.put(`/api/admin/ciclos/${estado.ciclo}/unidades/${CLAVERIA}`, { poblacion: 15000, poblacion_flotante: 3000, indice_pobreza: 0.4, indice_delictivo: 0.3, es_pueblo_originario: false }));
  ok(await a.post(`/api/admin/ciclos/${estado.ciclo}/presupuesto`));
  const fases = det.datos.fases.map((f, i) => ({ fase_id: f.fase_id, fecha_inicio: `2026-0${i + 1}-01`, fecha_fin: `2026-0${i + 1}-25` }));
  ok(await a.put(`/api/admin/ciclos/${estado.ciclo}/fases`, { fases }));
  falla(await a.put(`/api/admin/ciclos/${estado.ciclo}/fases`, { fases: [{ fase_id: 1, fecha_inicio: '2026-05-01', fecha_fin: '2026-04-01' }] }), 400);
  ok(await a.put(`/api/admin/ciclos/${estado.ciclo}`, { nombre: 'Ciclo de prueba 2026', anio_simulado: 2026, presupuesto_total: 12000000, porcentaje_partes_iguales: 60 }));
  ok(await a.post(`/api/admin/ciclos/${estado.ciclo}/fase`, { fase: 'diagnostico_registro' }), 'activar en diagnóstico');
  const r2 = await a.post('/api/admin/ciclos', { nombre: 'Otro ciclo', anio_simulado: 2027, presupuesto_total: 500000, unidades: [1, 2] });
  ok(r2);
  ok(await a.del(`/api/admin/ciclos/${r2.datos.id}`), 'borrar ciclo en borrador');
  falla(await a.del(`/api/admin/ciclos/${estado.ciclo}`), 409, 'no se borra un ciclo activo');
  const pdfConv = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
  ok(await a.put(`/api/admin/ciclos/${estado.ciclo}/convocatoria`, pdfConv, { headers: { 'Content-Type': 'application/pdf' } }));
  const pub = await A.cliente().get('/api/publico/estado');
  ok(pub);
  assert.equal(pub.datos.ciclo.fase, 'diagnostico_registro');
  assert.ok(pub.datos.ciclo.convocatoria_uuid);
});

test('foro vecinal: ideas, comentarios y apoyos', async () => {
  const [c1, c2, c3] = estado.c;
  const i1 = await c1.post('/api/foro/ideas', { rubro_id: 1, contenido: 'Rehabilitar el parque de la calle Norte 45 con luminarias' });
  ok(i1);
  ok(await c2.post('/api/foro/ideas', { rubro_id: 3, contenido: 'Talleres de música para jóvenes en el deportivo' }));
  falla(await c1.post('/api/foro/ideas', { rubro_id: 1, contenido: 'x'.repeat(501) }), 400, 'idea de más de 500');
  falla(await c1.post('/api/foro/ideas', { rubro_id: 999, contenido: 'Idea con rubro inexistente aquí' }), 400);
  ok(await c2.post(`/api/foro/ideas/${i1.datos.id}/comentarios`, { contenido: 'Totalmente de acuerdo, hace falta luz' }));
  ok(await c3.post(`/api/foro/ideas/${i1.datos.id}/comentarios`, { contenido: 'Comentario fuera de lugar' }));
  ok(await c2.post(`/api/foro/ideas/${i1.datos.id}/apoyo`));
  ok(await c2.post(`/api/foro/ideas/${i1.datos.id}/apoyo`), 'apoyar dos veces no duplica');
  ok(await c3.post(`/api/foro/ideas/${i1.datos.id}/apoyo`));
  falla(await c1.post(`/api/foro/ideas/${i1.datos.id}/apoyo`), 409, 'no puede apoyar su propia idea');
  const foro = await c1.get('/api/foro?orden=apoyos');
  ok(foro);
  assert.equal(foro.datos.ideas[0].total_apoyos, 2);
  ok(await c3.del(`/api/foro/ideas/${i1.datos.id}/apoyo`));
  const filtrado = await c1.get('/api/foro?q=parque&rubro=1&min_apoyos=1');
  assert.equal(filtrado.datos.ideas.length, 1);
  assert.equal(filtrado.datos.ideas[0].total_apoyos, 1);
  const otro = await estado.c[5].get(`/api/foro/ideas/${i1.datos.id}/comentarios`);
  falla(otro, 404, 'un vecino de otra unidad no ve el foro ajeno');
  const com = await c1.get(`/api/foro/ideas/${i1.datos.id}/comentarios`);
  assert.equal(com.datos.length, 2);
  estado.idea = i1.datos.id;
});

test('registro, edición y retiro de proyectos con folio automático', async () => {
  const [c1, c2, c3, c4, c5] = estado.c;
  const sub = await c1.post('/api/archivos?categoria=imagen_proyecto', A.png(30, 20), { headers: { 'Content-Type': 'image/png', 'X-Nombre-Archivo': encodeURIComponent('parque ñ.png') } });
  ok(sub, 'subir imagen');
  const base = (t) => ({ titulo: t, descripcion: `Descripción del proyecto ${t} para la colonia`, rubro_id: 1, costo_estimado: 800000, calle: 'Norte 45', numero: '12', referencias: 'Frente al mercado' });
  const p1 = await c1.post('/api/proyectos', { ...base('Parque Norte 45'), imagen_uuid: sub.datos.uuid, idea_id: estado.idea, latitud: 19.4712, longitud: -99.1851 });
  ok(p1);
  assert.match(p1.datos.folio, /^PP-2026-AZC-\d{4}$/);
  const p2 = await c2.post('/api/proyectos', base('Luminarias Clavería'));
  ok(p2);
  assert.equal(p2.datos.estado_ubicacion, 'no_ubicado', 'sin geocodificación queda pendiente de ubicar');
  const p3 = await c3.post('/api/proyectos', base('Talleres culturales'));
  const p4 = await c4.post('/api/proyectos', base('Banquetas accesibles'));
  const p5 = await c5.post('/api/proyectos', base('Cancha San Álvaro'));
  const p6 = await c4.post('/api/proyectos', base('Proyecto a retirar'));
  [p3, p4, p5, p6].forEach((p) => ok(p));
  const folios = new Set([p1, p2, p3, p4, p5, p6].map((p) => p.datos.folio));
  assert.equal(folios.size, 6, 'los folios no se repiten');
  falla(await c1.post('/api/proyectos', { ...base('Sin costo'), costo_estimado: 0 }), 400);
  falla(await c1.post('/api/proyectos', { ...base('Imagen ajena'), imagen_uuid: '00000000-0000-0000-0000-000000000000' }), 400);
  falla(await c1.post('/api/proyectos', { ...base('Coordenadas fuera'), latitud: 40, longitud: -3 }), 400);
  falla(await c1.post('/api/proyectos', { ...base('T'.repeat(101)) }), 400);
  ok(await c2.put(`/api/proyectos/${p2.datos.id}`, { ...base('Luminarias Clavería (editado)'), latitud: 19.47, longitud: -99.18 }));
  falla(await c1.put(`/api/proyectos/${p2.datos.id}`, base('Robo de proyecto')), 404, 'no puede editar el proyecto de otro');
  ok(await c4.post(`/api/proyectos/${p6.datos.id}/retirar`));
  falla(await c4.post(`/api/proyectos/${p6.datos.id}/retirar`), 409);
  const mios = await c2.get('/api/proyectos/mios');
  assert.equal(mios.datos[0].titulo, 'Luminarias Clavería (editado)');
  assert.equal(mios.datos[0].folio, p2.datos.folio, 'el folio no cambia al editar');
  const unidad = await c1.get('/api/proyectos/unidad');
  assert.equal(unidad.datos.length, 4);
  estado.p = { p1: p1.datos.id, p2: p2.datos.id, p3: p3.datos.id, p4: p4.datos.id, p5: p5.datos.id };
});

test('funcionario revisa registros, modera y gestiona directorio y avisos', async () => {
  const f = estado.func;
  const panel = await f.get('/api/func/panel');
  ok(panel);
  assert.equal(Number(panel.datos.conteos.registros), 5);
  const reg = await f.get('/api/func/registros');
  assert.equal(reg.datos.length, 5);
  ok(await f.post(`/api/func/registros/${estado.p.p4}/revision`, { resultado: 'correccion_solicitada', observacion: 'Falta el número exterior exacto' }));
  falla(await f.post(`/api/func/registros/${estado.p.p4}/revision`, { resultado: 'correccion_solicitada', observacion: 'Otra corrección' }), 409, 'corrección solo una vez');
  falla(await f.post(`/api/func/registros/${estado.p.p4}/revision`, { resultado: 'correccion_solicitada' }), 400, 'observación obligatoria');
  for (const id of Object.values(estado.p)) ok(await f.post(`/api/func/registros/${id}/revision`, { resultado: 'completo' }), `revisión ${id}`);
  const notif = await estado.c[3].get('/api/notificaciones');
  assert.ok(notif.datos.notificaciones.some((n) => n.tipo === 'correccion_solicitada'));
  ok(await estado.c[3].post('/api/notificaciones/leidas', {}));
  const coms = await f.get('/api/func/moderacion?tipo=comentario_idea');
  ok(coms);
  const malo = coms.datos.find((x) => x.texto === 'Comentario fuera de lugar');
  ok(await f.post('/api/func/moderacion', { tipo_objeto: 'comentario_idea', objeto_id: malo.id, accion: 'ocultar', motivo: 'No aporta a la discusión' }));
  const com = await estado.c[0].get(`/api/foro/ideas/${estado.idea}/comentarios`);
  assert.equal(com.datos.length, 1, 'el comentario oculto ya no aparece');
  falla(await f.post('/api/func/moderacion', { tipo_objeto: 'idea', objeto_id: 999999, accion: 'ocultar', motivo: 'No existe' }), 409);
  const d = await f.post('/api/func/directorio', { tipo: 'titular', cargo: 'Alcaldesa', nombre_titular: 'Nombre Titular', telefono: '55 5354 9994', correo: 'alcaldia@azc.mx', sitio_web: 'azcapotzalco.cdmx.gob.mx' });
  ok(d);
  falla(await f.post('/api/func/directorio', { alcaldia_id: COY, tipo: 'titular', cargo: 'Otro' }), 403, 'directorio de otra alcaldía');
  falla(await f.post('/api/func/directorio', { tipo: 'titular', cargo: 'X', telefono: '123' }), 400);
  ok(await f.put(`/api/func/directorio/${d.datos.id}`, { tipo: 'titular', cargo: 'Alcaldesa de Azcapotzalco', telefono: '5553549994' }));
  const dir = await A.cliente().get('/api/directorio?q=alcaldesa&alcaldia=2');
  assert.equal(dir.datos.length, 2, 'la titular oficial y la captura del funcionario');
  assert.ok(dir.datos.some((x) => x.nombre_titular === 'Nancy Marlene Núñez Reséndiz' && /^https:\/\//.test(x.fuente_url) && x.consultado_en === '2026-10-31'));
  assert.ok(dir.datos.some((x) => x.id === d.datos.id && x.fuente_nombre === 'Captura de un funcionario de la alcaldía' && x.fuente_url === null));
  const ciudad = await A.cliente().get('/api/directorio/ciudad');
  assert.equal(ciudad.datos[0].nombre_titular, 'Clara Marina Brugada Molina');
  assert.ok(ciudad.datos.every((x) => x.fuente_nombre && x.consultado_en));
  const titulares = await A.cliente().get('/api/directorio');
  assert.equal(titulares.datos.filter((x) => x.tipo === 'titular' && x.fuente_url).length, 16, 'las 16 personas titulares con su fuente');
  const dir2 = await A.cliente().get(`/api/directorio?q=${encodeURIComponent('100%_')}`);
  ok(dir2, 'comodines escapados');
  ok(await f.del(`/api/func/directorio/${d.datos.id}`));
  ok(await f.post('/api/avisos', { titulo: 'Cierre próximo', mensaje: 'El registro de proyectos cierra el viernes', alcance: 'mi_alcaldia' }));
  const panelC = await estado.c[0].get('/api/ciudadano/panel');
  assert.equal(panelC.datos.avisos.length, 1);
  assert.equal(panelC.datos.avisos[0].titulo, 'Cierre próximo');
  const panelCoy = await estado.c[5].get('/api/ciudadano/panel');
  assert.equal(panelCoy.datos.avisos.length, 0, 'el aviso de AZC no llega a COY');
});

test('dictaminación: criterios y dictamen definitivo', async () => {
  const a = estado.admin;
  const f = estado.func;
  falla(await f.post(`/api/func/dictamenes/${estado.p.p1}`, { criterios: [], emitir: false }), 409, 'fuera de fase el trigger lo rechaza');
  ok(await a.post(`/api/admin/ciclos/${estado.ciclo}/fase`, { fase: 'dictaminacion' }));
  falla(await estado.c[0].post('/api/foro/ideas', { rubro_id: 1, contenido: 'Idea fuera de la fase de registro' }), 409);
  const cat = await A.cliente().get('/api/catalogos');
  const criterios = cat.datos.criterios.map((c) => ({ criterio_id: c.id, cumple: true }));
  const lista = await f.get('/api/func/dictamenes');
  assert.equal(lista.datos.pendientes.length, 5);
  ok(await f.post(`/api/func/dictamenes/${estado.p.p1}`, { criterios: criterios.slice(0, 3), emitir: false }), 'borrador');
  falla(await f.post(`/api/func/dictamenes/${estado.p.p1}`, { criterios: criterios.slice(0, 3), emitir: true, resultado: 'viable', justificacion: 'Cumple con todo lo necesario' }), 400, 'faltan criterios');
  for (const k of ['p1', 'p2', 'p3', 'p5']) {
    ok(await f.post(`/api/func/dictamenes/${estado.p[k]}`, { criterios, emitir: true, resultado: 'viable', justificacion: 'Cumple con todos los criterios de viabilidad' }), `dictamen ${k}`);
  }
  const noCumple = criterios.map((c, i) => ({ ...c, cumple: i !== 1, observacion: i === 1 ? 'Uso de suelo no permitido' : null }));
  falla(await f.post(`/api/func/dictamenes/${estado.p.p4}`, { criterios: noCumple, emitir: true, resultado: 'viable', justificacion: 'Intento inconsistente' }), 400);
  ok(await f.post(`/api/func/dictamenes/${estado.p.p4}`, { criterios: noCumple, emitir: true, resultado: 'no_viable', justificacion: 'No cumple la viabilidad jurídica' }));
  falla(await f.post(`/api/func/dictamenes/${estado.p.p4}`, { criterios, emitir: true, resultado: 'viable', justificacion: 'Cambiar de opinión' }), 409, 'dictamen definitivo');
  const mios = await estado.c[0].get('/api/proyectos/mios');
  assert.equal(mios.datos[0].estatus, 'viable');
  assert.equal(mios.datos[0].dictamen, 'viable');
});

test('sorteo y boleta', async () => {
  const a = estado.admin;
  const f = estado.func;
  falla(await f.post(`/api/func/sorteos/${CLAVERIA}`), 409, 'fuera de fase');
  ok(await a.post(`/api/admin/ciclos/${estado.ciclo}/fase`, { fase: 'sorteo_difusion' }));
  const s = await f.post(`/api/func/sorteos/${CLAVERIA}`);
  ok(s);
  assert.equal(s.datos.boleta.length, 3);
  assert.deepEqual(s.datos.boleta.map((b) => b.numero_sorteo), [1, 2, 3]);
  falla(await f.post(`/api/func/sorteos/${CLAVERIA}`), 409, 'el sorteo no se repite');
  ok(await f.post(`/api/func/sorteos/${SAN_ALVARO}`));
  falla(await f.post(`/api/func/sorteos/${DEL_CARMEN}`), 403, 'no puede sortear otra alcaldía');
  const lista = await f.get('/api/func/sorteos');
  assert.equal(lista.datos.unidades.length, 2);
});

test('votación: voto único y secreto, comprobante y cómputo', async () => {
  const a = estado.admin;
  const [c1, c2, c3, c4, c5, c6] = estado.c;
  ok(await a.post(`/api/admin/ciclos/${estado.ciclo}/fase`, { fase: 'consulta' }));
  const bol = await c1.get('/api/votacion');
  assert.equal(bol.datos.boleta.length, 3);
  falla(await c1.post('/api/votacion', { proyecto_id: estado.p.p1 }), 409, 'votación cerrada');
  ok(await a.post(`/api/admin/ciclos/${estado.ciclo}/votacion`, { accion: 'abrir' }));
  falla(await a.post(`/api/admin/ciclos/${estado.ciclo}/fase`, { fase: 'resultados' }), 409, 'no cambia de fase con la votación abierta');
  const v1 = await c1.post('/api/votacion', { proyecto_id: estado.p.p1 });
  ok(v1);
  assert.match(v1.datos.folio_comprobante, /^CP-2026-[0-9A-F]{10}$/);
  falla(await c1.post('/api/votacion', { proyecto_id: estado.p.p2 }), 409, 'segundo voto');
  const simult = await Promise.all(Array.from({ length: 8 }, () => c2.post('/api/votacion', { proyecto_id: estado.p.p1 })));
  assert.equal(simult.filter((r) => r.estado === 201).length, 1, 'solo un voto entre peticiones simultáneas');
  ok(await c3.post('/api/votacion', { proyecto_id: estado.p.p2 }));
  falla(await c4.post('/api/votacion', { proyecto_id: estado.p.p5 }), 409, 'proyecto de otra unidad');
  ok(await c4.post('/api/votacion', { proyecto_id: estado.p.p1 }));
  ok(await c5.post('/api/votacion', { proyecto_id: estado.p.p5 }));
  falla(await c6.post('/api/votacion', { proyecto_id: estado.p.p5 }), 409, 'COY no tiene ese proyecto');
  const comp = await c1.get('/api/votacion/comprobante');
  ok(comp);
  assert.equal(comp.headers.get('content-type'), 'application/pdf');
  assert.equal(comp.datos.subarray(0, 5).toString(), '%PDF-');
  assert.ok(comp.datos.includes(Buffer.from(v1.datos.folio_comprobante)), 'el PDF lleva el folio');
  assert.ok(!comp.datos.includes(Buffer.from('Parque Norte')), 'el PDF no revela el proyecto');
  falla(await c6.get('/api/votacion/comprobante'), 404);
  const cols = await A.db.conSistema((con) => con.q("SELECT column_name AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'votos'"));
  assert.ok(!cols.some((x) => /ciudadano|usuario|fecha|creado/i.test(x.c)));
  const cierre = await a.post(`/api/admin/ciclos/${estado.ciclo}/votacion`, { accion: 'cerrar' });
  ok(cierre);
  assert.equal(Number(cierre.datos.computo.unidades), 2);
});

test('casos especiales y publicación de ganadores', async () => {
  const a = estado.admin;
  const f = estado.func;
  falla(await a.post(`/api/admin/ciclos/${estado.ciclo}/ganadores`), 409, 'hay un caso especial sin resolver');
  const casos = await f.get('/api/func/casos');
  ok(casos);
  assert.equal(casos.datos.casos.length, 1);
  assert.equal(casos.datos.casos[0].caso_especial, 'unico_viable');
  falla(await f.post(`/api/func/casos/${SAN_ALVARO}`, { metodo: 'asamblea_seleccion', justificacion: 'Justificación suficiente', proyecto_id: estado.p.p1 }), 409);
  ok(await f.post(`/api/func/casos/${SAN_ALVARO}`, { metodo: 'asamblea_seleccion', justificacion: 'La asamblea aprobó el único proyecto viable', proyecto_id: estado.p.p5 }));
  ok(await a.post(`/api/admin/ciclos/${estado.ciclo}/ganadores`));
  const res = await estado.c[0].get('/api/votacion');
  assert.ok(res.datos.resultados.some((r) => r.ganador && r.folio));
  const ganador = res.datos.resultados.find((r) => r.ganador);
  assert.equal(ganador.total_votos, 3);
  const csv = await a.get(`/api/admin/ciclos/${estado.ciclo}/resultados.csv`);
  ok(csv);
  assert.match(csv.datos.toString('utf8'), /Parque Norte 45/);
  const pdf = await a.get(`/api/admin/ciclos/${estado.ciclo}/reporte.pdf`);
  ok(pdf);
  assert.equal(pdf.datos.subarray(0, 5).toString(), '%PDF-');
});

test('seguimiento, foto denuncia, calificación y mapa', async () => {
  const a = estado.admin;
  const f = estado.func;
  const [c1, c2] = estado.c;
  ok(await a.post(`/api/admin/ciclos/${estado.ciclo}/fase`, { fase: 'resultados' }));
  ok(await a.post(`/api/admin/ciclos/${estado.ciclo}/fase`, { fase: 'ejecucion_seguimiento' }));
  ok(await f.post(`/api/func/seguimiento/${estado.p.p1}/avance`, { porcentaje: 40, monto_ejercido: 250000, estatus: 'en_ejecucion', nota: 'Inicio de obra' }));
  falla(await f.post(`/api/func/seguimiento/${estado.p.p1}/avance`, { porcentaje: 80, monto_ejercido: 1, estatus: 'concluido' }), 400);
  falla(await f.post(`/api/func/seguimiento/${estado.p.p1}/avance`, { porcentaje: 80, monto_ejercido: 1, estatus: 'inejecutable' }), 400, 'falta justificación');
  falla(await f.post(`/api/func/seguimiento/${estado.p.p2}/avance`, { porcentaje: 10, monto_ejercido: 1, estatus: 'en_ejecucion' }), 409, 'no es ganador');
  const seg = await f.get('/api/func/seguimiento');
  assert.equal(seg.datos.proyectos.length, 2);
  const fotos = [];
  for (let i = 0; i < 2; i += 1) {
    const s = await c2.post('/api/archivos?categoria=foto_reporte', A.png(10 + i, 10), { headers: { 'Content-Type': 'image/png' } });
    ok(s);
    fotos.push(s.datos.uuid);
  }
  falla(await c2.post('/api/foto-denuncia/reportes', { proyecto_id: estado.p.p1, tipo: 'irregularidad', descripcion: 'La obra está detenida', fotos: [] }), 400);
  const rep = await c2.post('/api/foto-denuncia/reportes', { proyecto_id: estado.p.p1, tipo: 'irregularidad', descripcion: 'La obra está detenida desde hace dos semanas', fotos });
  ok(rep);
  falla(await c1.post('/api/foto-denuncia/reportes', { proyecto_id: estado.p.p1, tipo: 'avance', descripcion: 'Uso fotos de otra persona', fotos }), 400, 'fotos ajenas');
  falla(await c2.post('/api/foto-denuncia/reportes', { proyecto_id: estado.p.p2, tipo: 'avance', descripcion: 'Proyecto que no ganó la consulta', fotos: [fotos[0]] }), 409);
  ok(await c1.post(`/api/foto-denuncia/reportes/${rep.datos.id}/comentarios`, { contenido: 'Confirmo, no hay trabajadores' }));
  const lista = await c1.get('/api/foto-denuncia/reportes?tipo=irregularidad&estatus=pendiente');
  assert.equal(lista.datos.reportes.length, 1);
  assert.equal(lista.datos.reportes[0].fotos.length, 2);
  const det = await c1.get(`/api/foto-denuncia/reportes/${rep.datos.id}`);
  assert.equal(det.datos.comentarios.length, 1);
  const fr = await f.get('/api/func/reportes?estatus=pendiente');
  assert.equal(fr.datos.length, 1);
  ok(await f.post(`/api/func/reportes/${rep.datos.id}`, { accion: 'atender', texto: 'Se reanudó la obra el lunes' }));
  falla(await f.post(`/api/func/reportes/${rep.datos.id}`, { accion: 'eliminar', texto: 'Ya no aplica' }), 409);
  falla(await c1.post(`/api/foto-denuncia/proyectos/${estado.p.p1}/calificacion`, { puntuacion: 4 }), 409, 'calificar solo en Evaluación');
  ok(await a.post(`/api/admin/ciclos/${estado.ciclo}/fase`, { fase: 'evaluacion' }));
  ok(await c1.post(`/api/foto-denuncia/proyectos/${estado.p.p1}/calificacion`, { puntuacion: 4, comentario: 'Buen trabajo' }));
  ok(await c1.post(`/api/foto-denuncia/proyectos/${estado.p.p1}/calificacion`, { puntuacion: 5 }), 'cambiar la calificación');
  falla(await c1.post(`/api/foto-denuncia/proyectos/${estado.p.p1}/calificacion`, { puntuacion: 6 }), 400);
  falla(await estado.c[4].post(`/api/foto-denuncia/proyectos/${estado.p.p1}/calificacion`, { puntuacion: 3 }), 409, 'solo su unidad');
  const ranking = await c1.get('/api/foto-denuncia/proyectos');
  assert.equal(ranking.datos.proyectos[0].id, estado.p.p1);
  assert.equal(Number(ranking.datos.proyectos[0].calificacion_promedio), 5);
  const mapa = await c1.get('/api/mapa/proyectos?estatus=en_ejecucion');
  assert.equal(mapa.datos.proyectos.length, 1);
  const ficha = await c1.get(`/api/mapa/proyectos/${estado.p.p1}`);
  assert.equal(ficha.datos.galeria.length, 2);
  assert.equal(ficha.datos.avances.length, 1);
  ok(await c1.get('/api/mapa/unidades'));
  ok(await c1.get('/api/ciclos'));
  const ub = await f.get('/api/func/ubicaciones');
  ok(ub);
  ok(await f.put(`/api/func/ubicaciones/${estado.p.p3}`, { calle: 'Norte 45', numero: '20', latitud: 19.4701, longitud: -99.1849 }));
  const p3 = (await f.get('/api/func/ubicaciones?estado=corregido')).datos;
  assert.ok(p3.some((p) => p.id === estado.p.p3));
});

test('estadísticas, bitácora e integraciones', async () => {
  const a = estado.admin;
  for (const tipo of ['participacion', 'demograficas', 'proyectos', 'seguimiento']) {
    const r = await a.get(`/api/admin/estadisticas?tipo=${tipo}&ciclo=${estado.ciclo}`);
    ok(r, tipo);
  }
  const p = await a.get(`/api/admin/estadisticas?tipo=participacion&ciclo=${estado.ciclo}`);
  assert.equal(Number(p.datos.total.votantes), 5);
  const d = await a.get(`/api/admin/estadisticas?tipo=demograficas&ciclo=${estado.ciclo}&alcaldia=${AZC}&genero=mujer`);
  ok(d);
  const pr = await a.get(`/api/admin/estadisticas?tipo=proyectos&ciclo=${estado.ciclo}&rubro=1&desde=2020-01-01&hasta=2099-12-31`);
  assert.equal(Number(pr.datos.total.ganadores), 2);
  falla(await a.get('/api/admin/estadisticas?tipo=otra'), 400);
  const b = await a.get('/api/admin/bitacora?accion=dictamen_emitir');
  ok(b);
  assert.equal(b.datos.total, 5);
  ok(await a.get('/api/admin/bitacora.csv'));
  const integ = await a.get('/api/admin/integraciones');
  ok(integ);
  ok(await a.put('/api/admin/integraciones/datos_cdmx_unidades', { activa: true }));
  falla(await a.put('/api/admin/integraciones/inegi_poblacion', { activa: true }), 400, 'sin recurso (no es del portal)');
  ok(await a.put('/api/admin/integraciones/datos_cdmx_unidades', { activa: false, recurso: 'abc-123' }));
  ok(await a.put('/api/admin/integraciones/datos_cdmx_unidades', { activa: true, recurso: null }));
  ok(await a.get('/api/admin/resumen'));
  const ciud = await a.get('/api/admin/ciudadanos?q=vecino&alcaldia=2');
  ok(ciud);
  assert.equal(ciud.datos.total, 5);
});

test('suspensión de cuentas y recuperación de contraseña', async () => {
  const a = estado.admin;
  const idC6 = (await estado.c[5].get('/api/auth/yo')).datos.id;
  falla(await a.post(`/api/admin/ciudadanos/${idC6}/suspension`, { accion: 'suspender' }), 400, 'motivo obligatorio');
  ok(await a.post(`/api/admin/ciudadanos/${idC6}/suspension`, { accion: 'suspender', motivo: 'Publicaciones ofensivas' }));
  falla(await estado.c[5].get('/api/auth/yo'), 401, 'su sesión se cerró');
  falla(await A.cliente().post('/api/auth/login', { correo: 'vecino6@correo.mx', password: 'Prepar2026' }), 403);
  ok(await a.post(`/api/admin/ciudadanos/${idC6}/suspension`, { accion: 'reactivar' }));
  ok(await A.cliente().post('/api/auth/login', { correo: 'vecino6@correo.mx', password: 'Prepar2026' }));

  const log = require('../server/lib/log');
  const original = log.info;
  let enlace = '';
  log.info = (...x) => { const s = x.join(' '); const m = /#token=([A-Za-z0-9_-]+)/.exec(s); if (m) [, enlace] = m; };
  const r = await A.cliente().post('/api/auth/recuperar', { correo: 'vecino5@correo.mx' });
  ok(r);
  ok(await A.cliente().post('/api/auth/recuperar', { correo: 'noexiste@correo.mx' }), 'misma respuesta si no existe');
  log.info = original;
  assert.ok(enlace, 'se generó el token');
  falla(await A.cliente().post('/api/auth/restablecer', { token: 'x'.repeat(43), password: 'NuevaClave1' }), 409);
  ok(await A.cliente().post('/api/auth/restablecer', { token: enlace, password: 'NuevaClave1' }));
  falla(await A.cliente().post('/api/auth/restablecer', { token: enlace, password: 'OtraClave22' }), 409, 'el enlace es de un solo uso');
  falla(await estado.c[4].get('/api/auth/yo'), 401, 'se cerraron sus sesiones');
  ok(await A.cliente().post('/api/auth/login', { correo: 'vecino5@correo.mx', password: 'NuevaClave1' }));
});

test('cierre del ciclo y solo lectura', async () => {
  const a = estado.admin;
  ok(await a.post(`/api/admin/ciclos/${estado.ciclo}/cerrar`));
  falla(await a.post(`/api/admin/ciclos/${estado.ciclo}/fase`, { fase: 'consulta' }), 409);
  falla(await estado.c[0].post('/api/foro/ideas', { rubro_id: 1, contenido: 'Una idea en un ciclo cerrado' }), 409);
  const hist = await estado.c[0].get(`/api/mapa/proyectos?ciclo=${estado.ciclo}`);
  ok(hist);
  assert.ok(hist.datos.proyectos.length >= 4, 'el histórico sigue consultable');
  const comp = await estado.c[0].get(`/api/votacion/comprobante?ciclo=${estado.ciclo}`);
  ok(comp, 'comprobante de un ciclo cerrado');
  const nuevo = await a.post('/api/admin/ciclos', { nombre: 'Ciclo 2027', anio_simulado: 2027, presupuesto_total: 5000000, alcaldias: [AZC], origen_indices: 'manual' });
  ok(nuevo, 'se puede crear un ciclo nuevo');
  ok(await a.post(`/api/admin/ciclos/${nuevo.datos.id}/fase`, { fase: 'convocatoria' }), 'y activarlo');
});

test('el administrador agrega tipos de proyecto y aparecen solos en mapas, formularios y simbología', async () => {
  const anon = A.cliente();
  falla(await anon.get('/api/admin/categorias'), 401, 'sin sesión no entra');
  const a = A.cliente();
  ok(await a.post('/api/auth/login', { correo: 'admin@prepar.mx', password: 'Admin12345' }));
  const lista = await a.get('/api/admin/categorias');
  ok(lista);
  assert.ok(lista.datos.tipos.some((t) => t.clave === 'agua' && t.color === '#3B9EDB'));
  assert.ok(lista.datos.iconos.includes('gota'));

  const nuevo = { nombre_es: 'Desazolve y pozos', nombre_en: 'Well cleaning', color: '#1e6fd9', icono: 'gota', palabras: 'desazolve,  pozo de visita ,limpieza de pozos' };
  falla(await a.post('/api/admin/categorias', { ...nuevo, color: 'azul' }), 400, 'color inválido');
  falla(await a.post('/api/admin/categorias', { ...nuevo, icono: '<script>' }), 400, 'dibujo inválido');
  falla(await a.post('/api/admin/categorias', { ...nuevo, nombre_es: 'Otro' }), 409, 'nombre repetido');
  const r = await a.post('/api/admin/categorias', nuevo);
  ok(r, 'crea el tipo');
  assert.equal(r.datos.clave, 'desazolve_y_pozos');

  const pub = await anon.get('/api/categorias');
  const t = pub.datos.find((x) => x.clave === 'desazolve_y_pozos');
  assert.deepEqual([t.color, t.icono, t.palabras, Number(t.activa)], ['#1E6FD9', 'gota', 'desazolve, pozo de visita, limpieza de pozos', 1]);
  const categorias = require('../server/lib/categorias');
  await categorias.refrescar(true);
  assert.equal(categorias.adivinar('Desazolve de la colonia', ''), 'desazolve_y_pozos');

  ok(await a.put('/api/admin/categorias/desazolve_y_pozos', { ...nuevo, activa: false }), 'se desactiva');
  await categorias.refrescar(true);
  assert.ok(!categorias.claves().includes('desazolve_y_pozos'));
  falla(await a.put('/api/admin/categorias/otro', { nombre_es: 'Otro', color: '#5F7387', icono: 'proyecto', activa: false }), 400, '«Otro» siempre activo');
  falla(await a.del('/api/admin/categorias/otro'), 400);
  falla(await a.put('/api/admin/categorias/no_existe', nuevo), 404);
  ok(await a.post('/api/admin/categorias/reclasificar', {}));
  const usado = (await a.get('/api/admin/categorias')).datos.tipos.find((x) => x.proyectos > 0);
  if (usado && usado.clave !== 'otro') falla(await a.del(`/api/admin/categorias/${usado.clave}`), 409);
  ok(await a.del('/api/admin/categorias/desazolve_y_pozos'), 'uno sin proyectos sí');
  await categorias.refrescar(true);
});

test('captcha: imagen sin texto legible, un solo uso, y se pide tras dos intentos fallidos', async () => {
  const captcha = require('../server/lib/captcha');
  const anon = A.cliente();
  const c1 = await anon.get('/api/captcha');
  ok(c1);
  assert.match(c1.datos.imagen, /^data:image\/svg\+xml;base64,/);
  const svg = Buffer.from(c1.datos.imagen.split(',')[1], 'base64').toString();
  assert.ok(!/<text/i.test(svg), 'el código no viene como texto dentro de la imagen');
  const resp = captcha._respuesta(c1.datos.id);
  assert.match(resp, /^[A-Z2-9]{5}$/);
  assert.equal(captcha.verificar(c1.datos.id, resp.toLowerCase()), true, 'no importan mayúsculas');
  assert.equal(captcha.verificar(c1.datos.id, resp), false, 'cada código sirve una sola vez');
  assert.equal(captcha.verificar('x', 'y'), false);
  const c2 = (await anon.get('/api/captcha')).datos;
  assert.equal(captcha.verificar(c2.id, 'ZZZZZ'), false, 'un código equivocado se descarta');
  falla(await anon.post('/api/auth/recuperar', { correo: 'nadie@correo.mx' }, { crudo: true }), 400, 'recuperar pide captcha');

  const c = A.cliente();
  const malo = { correo: 'maria@correo.mx', password: 'Equivocada1' };
  const f1 = await c.post('/api/auth/login', malo, { crudo: true });
  falla(f1, 401);
  const f2 = await c.post('/api/auth/login', malo, { crudo: true });
  falla(f2, 401);
  assert.equal(f2.datos.codigo, 'captcha', 'al segundo fallo avisa que hace falta el captcha');
  const sin = await c.post('/api/auth/login', { ...malo, password: 'Prepar2026' }, { crudo: true });
  falla(sin, 400, 'sin captcha ya no deja intentar');
  assert.equal(sin.datos.codigo, 'captcha');
  const mal = await c.post('/api/auth/login', { ...malo, captcha_id: (await c.get('/api/captcha')).datos.id, captcha: 'AAAAA' }, { crudo: true });
  falla(mal, 400, 'captcha equivocado');
  captcha._reiniciar();
});

test('inicio de sesión con Google: sin configurar, estado, identidad y registro', async () => {
  const config = require('../server/config');
  const google = require('../server/lib/google');
  const anon = A.cliente();
  const sin = await anon.get('/api/auth/google');
  falla(sin, 302);
  assert.equal(sin.headers.get('location'), '/login.html?google=sin_configurar');
  assert.equal((await anon.get('/api/auth/opciones')).datos.google, false);
  Object.assign(config.google, { clientId: 'cliente-prueba.apps.googleusercontent.com', clientSecret: 'secreto' });
  try {
    const ir = await anon.get('/api/auth/google');
    falla(ir, 302);
    const destino = new URL(ir.headers.get('location'));
    assert.equal(destino.hostname, 'accounts.google.com');
    assert.equal(destino.searchParams.get('client_id'), 'cliente-prueba.apps.googleusercontent.com');
    assert.match(destino.searchParams.get('redirect_uri'), /\/api\/auth\/google\/callback$/);
    assert.match(ir.headers.get('set-cookie'), /prepar_google=.*HttpOnly/i);
    falla(await anon.get('/api/auth/google/callback?code=x&state=otro'), 302, 'sin la cookie de estado no entra');
    const ok1 = { iss: 'https://accounts.google.com', aud: 'cliente-prueba.apps.googleusercontent.com', exp: Math.floor(Date.now() / 1000) + 600, nonce: 'n1', email: 'Vecino.Google@gmail.com', email_verified: true, name: 'Vecino Google' };
    assert.deepEqual(google.validarIdentidad(ok1, 'n1'), { correo: 'vecino.google@gmail.com', nombre: 'Vecino Google' });
    assert.throws(() => google.validarIdentidad({ ...ok1, aud: 'otra-app' }, 'n1'), /no es para esta aplicación/);
    assert.throws(() => google.validarIdentidad({ ...ok1, iss: 'https://evil.example' }, 'n1'), /no viene de Google/);
    assert.throws(() => google.validarIdentidad(ok1, 'n2'), /no coincide/);
    assert.throws(() => google.validarIdentidad({ ...ok1, email_verified: false }, 'n1'), /verificado/);
    assert.throws(() => google.validarIdentidad({ ...ok1, exp: 1 }, 'n1'), /expiró/);
    const jwt = ['e30', Buffer.from(JSON.stringify(ok1)).toString('base64url'), 'firma'].join('.');
    const falso = async () => ({ ok: true, json: async () => ({ id_token: jwt }) });
    assert.equal((await google.canjearCodigo('c', 'n1', { pedir: falso })).correo, 'vecino.google@gmail.com');
    const rechazo = async () => ({ ok: false, json: async () => ({ error: 'invalid_grant' }) });
    await assert.rejects(google.canjearCodigo('c', 'n1', { pedir: rechazo }), /no confirmó/);
    assert.equal(google.leerFirmado(google.firmar({ a: 1 }, 1)).a, 1);
    assert.equal(google.leerFirmado(google.firmar({ a: 1 }, 1).replace(/.$/, 'x')), null, 'una firma alterada no sirve');
    assert.equal(google.leerFirmado(google.firmar({ a: 1 }, -1)), null, 'expirada');

    const c = A.cliente();
    const pendiente = google.firmar({ correo: 'vecino.google@gmail.com', nombre: 'Vecino Google' }, 30);
    const pend = await c.get('/api/auth/google/pendiente', { headers: { Cookie: `prepar_google_reg=${pendiente}` } });
    ok(pend);
    assert.equal(pend.datos.correo, 'vecino.google@gmail.com');
    falla(await c.get('/api/auth/google/pendiente'), 404);
    const base = { nombre: 'Vecino Google', fecha_nacimiento: '1990-01-01', genero: 'hombre', unidad_territorial_id: CLAVERIA, acepta_aviso: true, acepta_terminos: true, google: true };
    falla(await c.post('/api/auth/registro', { ...base, correo: 'otro@gmail.com' }, { crudo: true, headers: { Cookie: `prepar_google_reg=${pendiente}` } }), 400, 'el correo debe ser el de Google');
    falla(await c.post('/api/auth/registro', { ...base, correo: 'vecino.google@gmail.com' }, { crudo: true }), 400, 'sin la cookie de Google no');
    const r = await c.post('/api/auth/registro', { ...base, correo: 'vecino.google@gmail.com' }, { crudo: true, headers: { Cookie: `prepar_google_reg=${pendiente}` } });
    ok(r, 'registro con Google sin contraseña ni captcha');
    assert.equal(r.datos.rol, 'ciudadano');
    assert.ok(!r.datos.verificarCorreo, 'con Google el correo ya viene verificado');
    assert.equal((await c.get('/api/auth/yo')).datos.debeVerificarCorreo, false);
  } finally {
    Object.assign(config.google, { clientId: '', clientSecret: '' });
  }
});
