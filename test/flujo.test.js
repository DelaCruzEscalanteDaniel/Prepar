'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { iniciar, detener, cliente, entrar, db, FOTO_PNG } = require('./ayuda');

const ok = (r) => assert.ok(r.estado < 300, JSON.stringify(r.datos));
const falla = (r, estado = 400) => assert.strictEqual(r.estado, estado, JSON.stringify(r.datos));

test.before(iniciar);
test.after(detener);

const estado = {};

test('registro y login', async () => {
  const anon = cliente();
  const { datos } = await anon.get('/catalogos');
  const clav = datos.colonias.find((c) => c.nombre === 'Clavería');
  const alv = datos.colonias.find((c) => c.nombre === 'San Álvaro');
  estado.clav = clav.id;
  falla(await anon.post('/registro', { nombre: 'Ana', correo: 'ana@correo.mx', password: 'Prepar2026', colonia_id: clav.id }));
  falla(await anon.post('/registro', { nombre: 'Ana', correo: 'ana@correo.mx', password: 'debil', colonia_id: clav.id, acepto: true }));
  for (const [n, c] of [['ana', clav.id], ['beto', clav.id], ['caro', clav.id], ['dani', alv.id]]) {
    ok(await cliente().post('/registro', { nombre: `Vecino ${n}`, correo: `${n}@correo.mx`, password: 'Prepar2026', colonia_id: c, acepto: true }));
  }
  falla(await anon.post('/registro', { nombre: 'Otra', correo: 'ana@correo.mx', password: 'Prepar2026', colonia_id: clav.id, acepto: true }));
  const r1 = await anon.post('/login', { correo: 'ana@correo.mx', password: 'Incorrecta1' });
  const r2 = await anon.post('/login', { correo: 'nadie@correo.mx', password: 'Incorrecta1' });
  falla(r1); falla(r2);
  assert.strictEqual(r1.datos.error, r2.datos.error);
  const ana = await entrar('ana@correo.mx', 'Prepar2026');
  assert.strictEqual((await ana.get('/yo')).datos.colonia, 'Clavería');
});

test('seguridad: sesión, roles y encabezado anti-CSRF', async () => {
  falla(await cliente().get('/foro'), 401);
  const ana = await entrar('ana@correo.mx', 'Prepar2026');
  falla(await ana.get('/admin/ciclos'), 403);
  falla(await ana.post('/ideas', { texto: 'x', rubro_id: 1 }, {}), 403);
  const pagina = await ana.pagina('/admin/inicio.html');
  assert.strictEqual(pagina.status, 302);
  const sinSesion = await cliente().pagina('/ciudadano/inicio.html');
  assert.strictEqual(sinSesion.headers.get('location'), '/login.html');
});

test('el administrador crea y activa un ciclo', async () => {
  const admin = await entrar('admin@prueba.mx', 'Admin2026');
  const r = await admin.post('/admin/ciclos', { nombre: 'Ciclo de prueba', anio: 2026, presupuesto: 32000000 });
  ok(r);
  estado.ciclo = r.datos.id;
  const suma = await db.uno('SELECT SUM(presupuesto) AS s FROM ciclo_colonias WHERE ciclo_id = ?', [estado.ciclo]);
  assert.strictEqual(Number(suma.s), 32000000);
  ok(await admin.post(`/admin/ciclos/${estado.ciclo}/activar`));
  const ana = await entrar('ana@correo.mx', 'Prepar2026');
  falla(await ana.post('/ideas', { texto: 'Arreglar el parque', rubro_id: 1 }));
  ok(await admin.post(`/admin/ciclos/${estado.ciclo}/siguiente-fase`));
  estado.admin = admin;
});

test('foro: ideas, apoyos, comentarios y moderación', async () => {
  const ana = await entrar('ana@correo.mx', 'Prepar2026');
  const beto = await entrar('beto@correo.mx', 'Prepar2026');
  ok(await ana.post('/ideas', { texto: 'Arreglar el parque de la colonia', rubro_id: 1 }));
  ok(await ana.post('/ideas', { texto: 'Una idea que se va a borrar', rubro_id: 2 }));
  const { ideas } = (await beto.get('/foro')).datos;
  assert.strictEqual(ideas.length, 2);
  const parque = ideas.find((i) => i.texto.includes('parque'));
  ok(await beto.post(`/ideas/${parque.id}/apoyo`));
  ok(await beto.post(`/ideas/${parque.id}/comentarios`, { texto: 'Yo apoyo' }));
  const otra = (await beto.get('/foro')).datos.ideas.find((i) => i.id === parque.id);
  assert.strictEqual(otra.apoyos, 1);
  assert.strictEqual(otra.yo_apoyo, true);
  assert.strictEqual(otra.comentarios.length, 1);
  ok(await beto.post(`/ideas/${parque.id}/apoyo`));
  assert.strictEqual((await beto.get('/foro')).datos.ideas.find((i) => i.id === parque.id).apoyos, 0);

  const admin = estado.admin;
  const r = await admin.post('/admin/funcionarios', { nombre: 'Funcionaria Azcapotzalco', correo: 'func@prepar.mx', alcaldia_id: 2 });
  ok(r);
  const func = await entrar('func@prepar.mx', r.datos.temporal);
  falla(await func.get('/func/foro'), 403);
  ok(await func.put('/password', { actual: r.datos.temporal, nueva: 'Funcionario2026' }));
  const { ideas: lista } = (await func.get('/func/foro')).datos;
  ok(await func.del(`/func/comentarios/${lista.find((i) => i.id === parque.id).comentarios[0].id}`));
  ok(await func.del(`/func/ideas/${lista.find((i) => i.id !== parque.id).id}`));
  assert.strictEqual((await ana.get('/foro')).datos.ideas.length, 1);
  estado.func = func;
});

test('registro de proyectos con tope del presupuesto', async () => {
  const ana = await entrar('ana@correo.mx', 'Prepar2026');
  const beto = await entrar('beto@correo.mx', 'Prepar2026');
  const dani = await entrar('dani@correo.mx', 'Prepar2026');
  const base = { descripcion: 'Descripción del proyecto', rubro_id: 1, calle: 'Calle 1', costo: 500000 };
  ok(await ana.post('/proyectos', { ...base, titulo: 'Parque nuevo', foto: FOTO_PNG }));
  ok(await beto.post('/proyectos', { ...base, titulo: 'Banquetas', rubro_id: 2 }));
  ok(await beto.post('/proyectos', { ...base, titulo: 'Bodega' }));
  ok(await dani.post('/proyectos', { ...base, titulo: 'Plaza de San Álvaro' }));
  falla(await ana.post('/proyectos', { ...base, titulo: 'Carísimo', costo: 999999999 }));
  falla(await ana.post('/proyectos', { ...base, titulo: 'Foto mala', foto: Buffer.from('GIF89a').toString('base64') }));
  assert.strictEqual((await ana.get('/mis-proyectos')).datos.proyectos.length, 1);
});

test('dictamen, sorteo y votación', async () => {
  const { admin, func } = estado;
  const siguiente = () => admin.post(`/admin/ciclos/${estado.ciclo}/siguiente-fase`);
  const { proyectos } = (await func.get('/func/proyectos')).datos;
  const id = (t) => proyectos.find((p) => p.titulo === t).id;
  falla(await func.post(`/func/proyectos/${id('Parque nuevo')}/dictamen`, { resultado: 'viable', justificacion: 'Bien' }));
  ok(await siguiente());
  ok(await func.post(`/func/proyectos/${id('Parque nuevo')}/dictamen`, { resultado: 'viable', justificacion: 'Cumple' }));
  ok(await func.post(`/func/proyectos/${id('Banquetas')}/dictamen`, { resultado: 'viable', justificacion: 'Cumple' }));
  ok(await func.post(`/func/proyectos/${id('Bodega')}/dictamen`, { resultado: 'no_viable', justificacion: 'Es para la alcaldía' }));
  ok(await func.post(`/func/proyectos/${id('Plaza de San Álvaro')}/dictamen`, { resultado: 'viable', justificacion: 'Cumple' }));
  falla(await func.post(`/func/proyectos/${id('Bodega')}/dictamen`, { resultado: 'viable', justificacion: 'Otra vez' }));

  ok(await siguiente());
  ok(await func.post(`/func/sorteo/${estado.clav}`));
  falla(await func.post(`/func/sorteo/${estado.clav}`));
  const sanAlvaro = (await func.get('/func/sorteo')).datos.colonias.find((c) => c.nombre === 'San Álvaro');
  ok(await func.post(`/func/sorteo/${sanAlvaro.id}`));
  const ana = await entrar('ana@correo.mx', 'Prepar2026');
  const boleta = (await ana.get('/boleta')).datos.proyectos;
  assert.deepStrictEqual(boleta.map((p) => p.numero_boleta).sort(), [1, 2]);
  falla(await ana.post('/votar', { proyecto_id: boleta[0].id }));

  ok(await siguiente());
  const parque = boleta.find((p) => p.titulo === 'Parque nuevo').id;
  const r = await ana.post('/votar', { proyecto_id: parque });
  ok(r);
  assert.match(r.datos.folio, /^VOTO-/);
  falla(await ana.post('/votar', { proyecto_id: parque }));
  falla(await ana.post('/votar', { proyecto_id: id('Plaza de San Álvaro') }));
  const beto = await entrar('beto@correo.mx', 'Prepar2026');
  ok(await beto.post('/votar', { proyecto_id: parque }));
  const caro = await entrar('caro@correo.mx', 'Prepar2026');
  ok(await caro.post('/votar', { proyecto_id: boleta.find((p) => p.titulo === 'Banquetas').id }));
  const voto = await db.q('SELECT * FROM votos WHERE ciclo_id = ?', [estado.ciclo]);
  assert.ok(voto.every((x) => !('usuario_id' in x)));

  ok(await siguiente());
  const ganadores = await db.q("SELECT titulo FROM proyectos WHERE ciclo_id = ? AND estatus = 'ganador' ORDER BY titulo", [estado.ciclo]);
  assert.deepStrictEqual(ganadores.map((g) => g.titulo), ['Parque nuevo', 'Plaza de San Álvaro']);
  const resumen = (await admin.get(`/admin/ciclos/${estado.ciclo}/resumen`)).datos;
  assert.strictEqual(resumen.votos.find((v) => v.colonia === 'Clavería').votos, 3);
  estado.parque = parque;
});

test('seguimiento de obras: pasos, tope de gasto y foto denuncia', async () => {
  const { admin, func } = estado;
  falla(await func.post(`/func/obras/${estado.parque}/gastos`, { monto: 100, concepto: 'Antes de tiempo' }));
  ok(await admin.post(`/admin/ciclos/${estado.ciclo}/siguiente-fase`));
  ok(await func.post(`/func/obras/${estado.parque}/pasos`, { que_se_hizo: 'Se pidieron los permisos' }));
  ok(await func.post(`/func/obras/${estado.parque}/gastos`, { monto: 300000, concepto: 'Materiales' }));
  const r = await func.post(`/func/obras/${estado.parque}/gastos`, { monto: 250000, concepto: 'Demasiado' });
  falla(r);
  assert.match(r.datos.error, /costo aprobado/);
  await assert.rejects(db.q('INSERT INTO gastos (proyecto_id, funcionario_id, monto, concepto) VALUES (?, 1, 300000, ?)', [estado.parque, 'Directo']), /costo aprobado/);
  let obra = (await func.get(`/func/obras/${estado.parque}`)).datos;
  assert.strictEqual(obra.estatus, 'en_ejecucion');
  assert.strictEqual(obra.avance, 10);
  assert.strictEqual(obra.gastado, 300000);
  for (let i = 0; i < 5; i += 1) ok(await func.post(`/func/obras/${estado.parque}/pasos`, { que_se_hizo: `Paso ${i + 2}` }));
  obra = (await func.get(`/func/obras/${estado.parque}`)).datos;
  assert.strictEqual(obra.estatus, 'concluido');
  assert.strictEqual(obra.avance, 100);
  falla(await func.post(`/func/obras/${estado.parque}/gastos`, { monto: 10, concepto: 'Cerrada' }));

  const ana = await entrar('ana@correo.mx', 'Prepar2026');
  ok(await ana.post(`/obras/${estado.parque}/fotos`, { comentario: 'Así quedó', foto: FOTO_PNG }));
  falla(await ana.post(`/obras/${estado.parque}/fotos`, { comentario: 'Sin foto' }));
  const fotos = (await ana.get(`/obras/${estado.parque}`)).datos.fotos;
  assert.strictEqual(fotos.length, 1);
  const img = await fetch(`${(await ana.pagina('/')).url.replace(/\/$/, '')}/api/imagenes/${fotos[0].imagen_id}`);
  assert.strictEqual(img.headers.get('content-type'), 'image/png');
  ok(await func.del(`/func/fotos/${fotos[0].id}`));
  assert.strictEqual((await ana.get(`/obras/${estado.parque}`)).datos.fotos.length, 0);

  const plaza = (await func.get('/func/obras')).datos.obras.find((o) => o.titulo.startsWith('Plaza'));
  falla(await func.post(`/func/obras/${plaza.id}/inejecutable`, {}));
  ok(await func.post(`/func/obras/${plaza.id}/inejecutable`, { motivo: 'El terreno es privado' }));
  assert.strictEqual((await func.get(`/func/obras/${plaza.id}`)).datos.estatus, 'inejecutable');
});

test('perfil, cambio de contraseña, recuperación y eliminar cuenta', async () => {
  const caro = await entrar('caro@correo.mx', 'Prepar2026');
  ok(await caro.put('/perfil', { nombre: 'Carolina Pérez', telefono: '5512345678', colonia_id: estado.clav }));
  assert.strictEqual((await caro.get('/yo')).datos.nombre, 'Carolina Pérez');
  falla(await caro.put('/password', { actual: 'Mala12345', nueva: 'Nueva2026' }));
  ok(await caro.put('/password', { actual: 'Prepar2026', nueva: 'Nueva2026' }));
  await entrar('caro@correo.mx', 'Nueva2026');

  ok(await cliente().post('/recuperar', { correo: 'nadie@correo.mx' }));
  ok(await cliente().post('/recuperar', { correo: 'caro@correo.mx' }));
  assert.strictEqual((await db.q('SELECT * FROM recuperaciones')).length, 1);
  falla(await cliente().post('/restablecer', { token: 'falso', password: 'Otra2026A' }));

  falla(await caro.del('/cuenta', { password: 'Mala12345' }));
  ok(await caro.del('/cuenta', { password: 'Nueva2026' }));
  falla(await cliente().post('/login', { correo: 'caro@correo.mx', password: 'Nueva2026' }));
  ok(await estado.admin.post(`/admin/ciclos/${estado.ciclo}/siguiente-fase`));
  ok(await estado.admin.post(`/admin/ciclos/${estado.ciclo}/cerrar`));
  falla(await estado.admin.post(`/admin/ciclos/${estado.ciclo}/activar`));
});

test('el login se bloquea 15 minutos después de 5 intentos', async () => {
  const c = cliente();
  for (let i = 0; i < 5; i += 1) falla(await c.post('/login', { correo: 'dani@correo.mx', password: 'Mala12345' }));
  falla(await c.post('/login', { correo: 'dani@correo.mx', password: 'Prepar2026' }));
  await db.q("UPDATE usuarios SET bloqueado_hasta = NULL WHERE correo = 'dani@correo.mx'");
  await entrar('dani@correo.mx', 'Prepar2026');
});
