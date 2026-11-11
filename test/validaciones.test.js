'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('./ayuda');

const AZC = 2;
const CLAVERIA = 3;
const ok = (r, msg) => assert.ok(r.estado >= 200 && r.estado < 300, `${msg || ''} → ${r.estado} ${JSON.stringify(r.datos).slice(0, 200)}`);
const rechazo = (r, patron, msg) => {
  assert.equal(r.estado, 400, `${msg || ''} → ${r.estado} ${JSON.stringify(r.datos).slice(0, 200)}`);
  if (patron) assert.match(r.datos.error, patron, msg);
};
const e = {};
let n = 0;
const registro = (extra) => {
  n += 1;
  return A.cliente().post('/api/auth/registro', {
    nombre: 'Vecina Prueba Uno', correo: `valida${n}@correo.mx`, password: 'Clave#2026', fecha_nacimiento: '1990-01-01', genero: 'mujer',
    unidad_territorial_id: CLAVERIA, acepta_aviso: true, ...extra,
  });
};

test.before(async () => {
  await A.iniciar();
  await A.crearAdmin();
  e.admin = A.cliente();
  ok(await e.admin.post('/api/auth/login', { correo: 'admin@prepar.mx', password: 'Admin12345' }));
});
test.after(async () => { await A.detener(); });

test('nombres: nombre y apellido, solo letras y sin signos fuera de lugar', async () => {
  for (const [nombre, patron] of [['Ana', /apellido/], ['aaa aaa', /repetidas/], ['A B', /apellido/], ['A. .', /signos/], ['Juan---', /apellido/],
    ['Xxxxxxxx Yyyyyyy', /repetidas/], ['Juan P3rez', /letras/], ['Juan  -  Pérez', /signos/], ['.Juan Pérez', /letras/], ['Juan Pérez!', /letras/]]) {
    rechazo(await registro({ nombre }), patron, nombre);
  }
  for (const nombre of ['María José López', "Sinéad O'Connor", 'Ana-Lucía Pérez-Gómez', 'José de la Cruz', 'Ma. Guadalupe Ruiz', 'Xóchitl Ñúñez']) {
    ok(await registro({ nombre }), nombre);
  }
});

test('correos: formato real, sin puntos sueltos, dominio válido', async () => {
  for (const correo of ['a@b.c', 'a@@b.com', 'a@b..com', 'test@localhost', 'año@correo.mx', 'x@correo.m', 'pepe@correo.com.', '.pepe@correo.com',
    'pepe.@correo.com', 'pe..pe@correo.com', 'pepe@-correo.com', 'pepe@correo-.com', 'pe pe@correo.com', 'pepe@correo.c0m', '"pepe"@correo.com']) {
    rechazo(await registro({ correo }), /correo/, correo);
  }
  for (const correo of ['maria.lopez+pp@correo.com.mx', 'jose_luis-90@sub.dominio.gob.mx', 'A.B@CORREO.MX']) ok(await registro({ correo }), correo);
});

test('fechas: no existen, fuera de rango o con formato distinto', async () => {
  for (const f of ['2001-02-30', '1990-02-29', '1990-13-01', '1990-00-10', '1990-04-31', '0005-05-05', '1850-05-05', '9999-12-31', '1990-1-1', '05/05/1990', '1990-05-05T00:00']) {
    rechazo(await registro({ fecha_nacimiento: f }), null, f);
  }
  rechazo(await registro({ fecha_nacimiento: `${new Date().getFullYear() - 10}-01-01` }), /18 años/, 'menor de edad');
  ok(await registro({ fecha_nacimiento: '1992-02-29' }), 'año bisiesto');
});

test('textos libres, proyectos, teléfonos, fases y avisos', async () => {
  const ciclo = await e.admin.post('/api/admin/ciclos', { nombre: 'Ciclo validaciones', anio_simulado: 2026, presupuesto_total: 1000000, alcaldias: [AZC], origen_indices: 'aleatorio' });
  ok(ciclo);
  rechazo(await e.admin.post('/api/admin/ciclos', { nombre: '!!!', anio_simulado: 2026, presupuesto_total: 10, alcaldias: [AZC] }), /palabras/);
  const det = await e.admin.get(`/api/admin/ciclos/${ciclo.datos.id}`);
  const fases = det.datos.fases.map((f, i) => ({ fase_id: f.fase_id, fecha_inicio: `2026-0${i + 1}-01`, fecha_fin: `2026-0${i + 1}-25` }));
  const encimadas = fases.map((f, i) => ({ ...f, fecha_fin: `2026-0${Math.min(i + 2, 9)}-20` }));
  rechazo(await e.admin.put(`/api/admin/ciclos/${ciclo.datos.id}/fases`, { fases: encimadas }), /encimarse/);
  const f1 = fases[0].fase_id;
  rechazo(await e.admin.put(`/api/admin/ciclos/${ciclo.datos.id}/fases`, { fases: [{ fase_id: f1, fecha_inicio: '2026-11-10', fecha_fin: '2026-11-09' }] }), /no puede ser anterior/, 'fin antes del inicio');
  rechazo(await e.admin.put(`/api/admin/ciclos/${ciclo.datos.id}/fases`, { fases: [{ fase_id: f1, fecha_inicio: '2031-01-01', fecha_fin: '2031-01-09' }] }), /cerca del año del ciclo/, 'año lejano');
  rechazo(await e.admin.put(`/api/admin/ciclos/${ciclo.datos.id}/fases`, { fases: [{ fase_id: f1, fecha_inicio: '2025-01-01', fecha_fin: '2026-01-25' }] }), /más de un año/, 'fase de más de un año');
  rechazo(await e.admin.get('/api/admin/estadisticas?tipo=participacion&desde=2026-11-10&hasta=2026-11-09'), /no puede ser anterior/, 'rango de estadísticas invertido');
  ok(await e.admin.put(`/api/admin/ciclos/${ciclo.datos.id}/fases`, { fases }));
  ok(await e.admin.post(`/api/admin/ciclos/${ciclo.datos.id}/fase`, { fase: 'diagnostico_registro' }));

  const c = A.cliente();
  ok(await c.post('/api/auth/registro', { nombre: 'Vecina Textos Prueba', correo: 'textos@correo.mx', password: 'Clave#2026', fecha_nacimiento: '1990-01-01', genero: 'mujer', unidad_territorial_id: CLAVERIA, acepta_aviso: true }));
  for (const t of ['!!!!!!!!!!', '1234567890', 'aaaaaaaaaaaa', '..........']) rechazo(await c.post('/api/foro/ideas', { contenido: t, rubro_id: 1 }), /palabras|válido/, t);
  const idea = await c.post('/api/foro/ideas', { contenido: 'Arreglar las luminarias del parque', rubro_id: 1 });
  ok(idea);
  for (const t of ['a', '.', '!!!', '123']) rechazo(await c.post(`/api/foro/ideas/${idea.datos.id}/comentarios`, { contenido: t }), /palabras/, t);
  ok(await c.post(`/api/foro/ideas/${idea.datos.id}/comentarios`, { contenido: 'Sí, hace mucha falta' }));
  for (const t of ['que onda wey', 'Güey ya arreglen', 'no mames', 'w e y']) rechazo(await c.post(`/api/foro/ideas/${idea.datos.id}/comentarios`, { contenido: t }), /groserías/, t);
  ok(await c.post(`/api/foro/ideas/${idea.datos.id}/comentarios`, { contenido: 'El buey de la granja se ve en el parque' }), 'palabras parecidas permitidas');
  const coms = await c.get(`/api/foro/ideas/${idea.datos.id}/comentarios`);
  const mio = coms.datos.find((x) => x.contenido === 'Sí, hace mucha falta');
  rechazo(await c.put(`/api/foro/comentarios/${mio.id}`, { contenido: 'Sí wey' }), /groserías/, 'editar con groserías');
  ok(await c.put(`/api/foro/comentarios/${mio.id}`, { contenido: 'Sí, hace mucha falta en la colonia' }), 'editar comentario propio');
  rechazo(await c.put(`/api/foro/ideas/${idea.datos.id}`, { contenido: 'Arreglar ya, wey' }), /groserías/, 'editar idea con groserías');
  ok(await c.put(`/api/foro/ideas/${idea.datos.id}`, { contenido: 'Arreglar las luminarias y bancas del parque' }), 'editar idea propia');
  const vecino = A.cliente();
  ok(await vecino.post('/api/auth/registro', { nombre: 'Vecino Ajeno Prueba', correo: 'ajeno@correo.mx', password: 'Clave#2026', fecha_nacimiento: '1990-01-01', genero: 'hombre', unidad_territorial_id: CLAVERIA, acepta_aviso: true }));
  assert.equal((await vecino.put(`/api/foro/ideas/${idea.datos.id}`, { contenido: 'Cambio la idea de otra persona' })).estado, 403, 'no edita ideas ajenas');
  assert.equal((await vecino.del(`/api/foro/comentarios/${mio.id}`)).estado, 403, 'no borra comentarios ajenos');
  const editada = (await c.get('/api/foro')).datos.ideas.find((x) => x.id === idea.datos.id);
  assert.ok(editada.editada_en, 'la idea queda marcada como editada');
  ok(await c.del(`/api/foro/comentarios/${mio.id}`), 'borrar comentario propio');
  const borrar = await c.post('/api/foro/ideas', { contenido: 'Idea que voy a borrar del foro', rubro_id: 1 });
  ok(await c.del(`/api/foro/ideas/${borrar.datos.id}`), 'borrar idea propia');
  assert.ok(!(await c.get('/api/foro')).datos.ideas.some((x) => x.id === borrar.datos.id), 'la idea borrada ya no aparece');

  const tope = await A.db.conSistema((con) => con.uno('SELECT presupuesto_asignado AS p FROM ciclo_unidades WHERE ciclo_id = ? AND unidad_territorial_id = ?', [ciclo.datos.id, CLAVERIA]));
  const base = { titulo: 'Rehabilitar el parque', descripcion: 'Cambiar luminarias y juegos del parque central.', costo_estimado: 50000, calle: 'Norte 45', numero: '12', rubro_id: 1 };
  for (const [extra, patron] of [[{ titulo: '!!!!!!' }, /palabras/], [{ titulo: '123456' }, /palabras/], [{ descripcion: '..........' }, /palabras/],
    [{ costo_estimado: 0.01 }, /entre/], [{ costo_estimado: 999 }, /entre/], [{ costo_estimado: 900000000000 }, /entre/],
    [{ costo_estimado: Number(tope.p) + 1 }, /presupuesto de tu colonia/], [{ calle: '--' }, /palabras/], [{ numero: 'abcdef' }, /número exterior/],
    [{ referencias: '####' }, /palabras/]]) {
    rechazo(await c.post('/api/proyectos', { ...base, ...extra }), patron, JSON.stringify(extra));
  }
  for (const numero of ['S/N', 'sn', '12-B', 'Mz 5 Lt 3']) ok(await c.post('/api/proyectos', { ...base, numero, titulo: `Parque ${numero.replace(/\W/g, '')} arreglado` }), numero);
  ok(await c.post('/api/proyectos', { ...base, costo_estimado: Number(tope.p), titulo: 'Proyecto con todo el presupuesto' }), 'costo igual al presupuesto');
  rechazo(await c.post('/api/proyectos', { ...base, titulo: 'Parque en otra alcaldía', latitud: 19.3467, longitud: -99.19 }), /Solo puedes registrar proyectos dentro de tu colonia/, 'punto en Álvaro Obregón');
  rechazo(await c.post('/api/proyectos', { ...base, titulo: 'Parque en otra colonia', latitud: 19.488, longitud: -99.13 }), /tu colonia/, 'punto en Gustavo A. Madero');
  ok(await c.post('/api/proyectos', { ...base, titulo: 'Parque marcado en mi colonia', latitud: 19.4712, longitud: -99.1851 }), 'punto en Clavería');

  const f = await e.admin.post('/api/admin/funcionarios', { nombre: 'Funcionaria Validaciones', correo: 'fv@prepar.mx', alcaldia_id: AZC, funciones: ['moderacion'] });
  ok(f);
  assert.match(f.datos.passwordTemporal, /[A-Z]/);
  assert.match(f.datos.passwordTemporal, /[0-9]/);
  const fu = A.cliente();
  ok(await fu.post('/api/auth/login', { correo: 'fv@prepar.mx', password: f.datos.passwordTemporal }));
  ok(await fu.post('/api/auth/cambiar-password', { actual: f.datos.passwordTemporal, nueva: 'Valida#2026', confirmar: 'Valida#2026' }));
  for (const t of ['0000000000', '1111111111', '0155555555', '1234567890', '55123', '55-1234-567a']) rechazo(await fu.put('/api/perfil', { nombre: 'Funcionaria Validaciones', telefono: t }), /teléfono/i, t);
  for (const t of ['5512345678', '(55) 1234-5678', '8004333222']) ok(await fu.put('/api/perfil', { nombre: 'Funcionaria Validaciones', telefono: t }), t);

  rechazo(await e.admin.post('/api/avisos', { titulo: '!!!', mensaje: 'Mensaje de prueba normal' }), /palabras/);
  rechazo(await e.admin.post('/api/avisos', { titulo: 'Aviso normal', mensaje: '12345 67890' }), /palabras/);
  rechazo(await e.admin.post('/api/avisos', { titulo: 'Aviso normal', mensaje: 'Mensaje de prueba normal', vigente_hasta: '2099-12-31' }), /más de un año/);
  rechazo(await e.admin.post('/api/avisos', { titulo: 'Aviso normal', mensaje: 'Mensaje de prueba normal', vigente_hasta: '2020-01-01' }), /anterior a hoy/);
  ok(await e.admin.post('/api/avisos', { titulo: 'Aviso normal', mensaje: 'Mensaje de prueba normal' }));
});
