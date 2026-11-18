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
  estado.clav = clav.id_colonia;
  falla(await anon.post('/registro', { nombre: 'Ana', correo: 'ana@correo.mx', password: 'Prepar2026', id_colonia: clav.id_colonia }));
  falla(await anon.post('/registro', { nombre: 'Ana', correo: 'ana@correo.mx', password: 'debil', id_colonia: clav.id_colonia, acepto: true }));
  for (const [n, c] of [['ana', clav.id_colonia], ['beto', clav.id_colonia], ['caro', clav.id_colonia], ['dani', alv.id_colonia]]) {
    ok(await cliente().post('/registro', { nombre: `Vecino ${n}`, correo: `${n}@correo.mx`, password: 'Prepar2026', id_colonia: c, acepto: true }));
  }
  falla(await anon.post('/registro', { nombre: 'Otra', correo: 'ana@correo.mx', password: 'Prepar2026', id_colonia: clav.id_colonia, acepto: true }));
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
  falla(await ana.post('/ideas', { texto: 'x', id_rubro: 1 }, {}), 403);
  const pagina = await ana.pagina('/admin/inicio.html');
  assert.strictEqual(pagina.status, 302);
  const sinSesion = await cliente().pagina('/ciudadano/inicio.html');
  assert.strictEqual(sinSesion.headers.get('location'), '/login.html');
});

test('el administrador crea y activa un ciclo', async () => {
  const admin = await entrar('admin@prueba.mx', 'Admin2026');
  const { alcaldias } = (await cliente().get('/catalogos')).datos;
  const fechas = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ fecha_inicio: `2027-0${n}-01`, fecha_fin: `2027-0${n}-20` }));
  const base = { nombre: 'Ciclo de prueba', anio: 2026, presupuesto: 32000000 };
  falla(await admin.post('/admin/ciclos', { ...base, alcaldias: [], fechas }));
  falla(await admin.post('/admin/ciclos', { ...base, alcaldias: [2], fechas: fechas.slice(0, 7) }));
  falla(await admin.post('/admin/ciclos', { ...base, alcaldias: [2], fechas: [...fechas.slice(0, 7), { fecha_inicio: '2027-07-05', fecha_fin: '2027-07-30' }] }));
  const chico = await admin.post('/admin/ciclos', { ...base, nombre: 'Solo Azcapotzalco', alcaldias: [alcaldias.find((a) => a.nombre === 'Azcapotzalco').id_alcaldia], fechas });
  ok(chico);
  const colonias = await db.q('SELECT presupuesto FROM ciclo_colonias WHERE id_ciclo = ?', [chico.datos.id_ciclo]);
  assert.strictEqual(colonias.length, 2);
  assert.strictEqual(colonias.reduce((s, c) => s + Number(c.presupuesto), 0), 32000000);
  const r = await admin.post('/admin/ciclos', { ...base, alcaldias: alcaldias.map((a) => a.id_alcaldia), fechas });
  ok(r);
  estado.ciclo = r.datos.id_ciclo;
  const suma = await db.uno('SELECT SUM(presupuesto) AS s, COUNT(*) AS n FROM ciclo_colonias WHERE id_ciclo = ?', [estado.ciclo]);
  assert.strictEqual(Number(suma.s), 32000000);
  assert.strictEqual(suma.n, 32);
  const nuevas = fechas.map((f, i) => (i === 0 ? { fecha_inicio: '2026-12-01', fecha_fin: '2026-12-31' } : f));
  ok(await admin.put(`/admin/ciclos/${estado.ciclo}/fechas`, { fechas: nuevas }));
  const resumen = (await admin.get(`/admin/ciclos/${estado.ciclo}/resumen`)).datos;
  assert.strictEqual(resumen.fases[0].fecha_inicio, '2026-12-01');
  assert.strictEqual(resumen.fases[7].fecha_fin, '2027-08-20');
  ok(await admin.post(`/admin/ciclos/${estado.ciclo}/activar`));
  const ana = await entrar('ana@correo.mx', 'Prepar2026');
  falla(await ana.post('/ideas', { texto: 'Arreglar el parque', id_rubro: 1 }));
  ok(await admin.post(`/admin/ciclos/${estado.ciclo}/siguiente-fase`));
  estado.admin = admin;
});

test('foro: ideas, apoyos, comentarios y moderación', async () => {
  const ana = await entrar('ana@correo.mx', 'Prepar2026');
  const beto = await entrar('beto@correo.mx', 'Prepar2026');
  ok(await ana.post('/ideas', { texto: 'Arreglar el parque de la colonia', id_rubro: 1 }));
  ok(await ana.post('/ideas', { texto: 'Una idea que se va a borrar', id_rubro: 2 }));
  const { ideas } = (await beto.get('/foro')).datos;
  assert.strictEqual(ideas.length, 2);
  const parque = ideas.find((i) => i.texto.includes('parque'));
  ok(await beto.post(`/ideas/${parque.id_idea}/apoyo`));
  ok(await beto.post(`/ideas/${parque.id_idea}/comentarios`, { texto: 'Yo apoyo' }));
  const otra = (await beto.get('/foro')).datos.ideas.find((i) => i.id_idea === parque.id_idea);
  assert.strictEqual(otra.apoyos, 1);
  assert.strictEqual(otra.yo_apoyo, true);
  assert.strictEqual(otra.comentarios.length, 1);
  ok(await beto.post(`/ideas/${parque.id_idea}/apoyo`));
  assert.strictEqual((await beto.get('/foro')).datos.ideas.find((i) => i.id_idea === parque.id_idea).apoyos, 0);

  const admin = estado.admin;
  const r = await admin.post('/admin/funcionarios', { nombre: 'Funcionaria Azcapotzalco', correo: 'func@prepar.mx', id_alcaldia: 2 });
  ok(r);
  const func = await entrar('func@prepar.mx', r.datos.temporal);
  falla(await func.get('/func/foro'), 403);
  ok(await func.put('/password', { actual: r.datos.temporal, nueva: 'Funcionario2026' }));
  const { ideas: lista } = (await func.get('/func/foro')).datos;
  ok(await func.del(`/func/comentarios/${lista.find((i) => i.id_idea === parque.id_idea).comentarios[0].id_comentario}`));
  ok(await func.del(`/func/ideas/${lista.find((i) => i.id_idea !== parque.id_idea).id_idea}`));
  assert.strictEqual((await ana.get('/foro')).datos.ideas.length, 1);
  estado.func = func;
});

test('registro de proyectos con tope del presupuesto', async () => {
  const ana = await entrar('ana@correo.mx', 'Prepar2026');
  const beto = await entrar('beto@correo.mx', 'Prepar2026');
  const dani = await entrar('dani@correo.mx', 'Prepar2026');
  const base = { descripcion: 'Descripción del proyecto', id_rubro: 1, calle: 'Calle 1', costo: 500000 };
  ok(await ana.post('/proyectos', { ...base, titulo: 'Parque nuevo', foto: FOTO_PNG }));
  ok(await beto.post('/proyectos', { ...base, titulo: 'Banquetas', id_rubro: 2 }));
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
  const id = (t) => proyectos.find((p) => p.titulo === t).id_proyecto;
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
  ok(await func.post(`/func/sorteo/${sanAlvaro.id_colonia}`));
  const ana = await entrar('ana@correo.mx', 'Prepar2026');
  const boleta = (await ana.get('/boleta')).datos.proyectos;
  assert.deepStrictEqual(boleta.map((p) => p.numero_boleta).sort(), [1, 2]);
  falla(await ana.post('/votar', { id_proyecto: boleta[0].id_proyecto }));

  ok(await siguiente());
  const parque = boleta.find((p) => p.titulo === 'Parque nuevo').id_proyecto;
  const r = await ana.post('/votar', { id_proyecto: parque });
  ok(r);
  assert.match(r.datos.folio, /^VOTO-/);
  falla(await ana.post('/votar', { id_proyecto: parque }));
  falla(await ana.post('/votar', { id_proyecto: id('Plaza de San Álvaro') }));
  const beto = await entrar('beto@correo.mx', 'Prepar2026');
  ok(await beto.post('/votar', { id_proyecto: parque }));
  const caro = await entrar('caro@correo.mx', 'Prepar2026');
  ok(await caro.post('/votar', { id_proyecto: boleta.find((p) => p.titulo === 'Banquetas').id_proyecto }));
  const voto = await db.q('SELECT * FROM votos WHERE id_ciclo = ?', [estado.ciclo]);
  assert.ok(voto.every((x) => !('id_usuario' in x)));

  ok(await siguiente());
  const ganadores = await db.q("SELECT titulo FROM proyectos WHERE id_ciclo = ? AND estatus = 'ganador' ORDER BY titulo", [estado.ciclo]);
  assert.deepStrictEqual(ganadores.map((g) => g.titulo), ['Parque nuevo', 'Plaza de San Álvaro']);
  const resumen = (await admin.get(`/admin/ciclos/${estado.ciclo}/resumen`)).datos;
  assert.strictEqual(resumen.votos.find((v) => v.colonia === 'Clavería').votos, 3);
  assert.strictEqual(resumen.totales.votos, 3);
  const res = (await ana.get('/resultados')).datos;
  assert.strictEqual(res.total, 3);
  assert.deepStrictEqual(res.proyectos.map((p) => [p.titulo, p.votos, p.ganador]), [['Parque nuevo', 2, true], ['Banquetas', 1, false]]);
  const mapa = (await func.get('/func/mapa')).datos.proyectos;
  assert.ok(Array.isArray(mapa) && mapa.every((p) => p.estatus !== 'no_viable'));
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
  await assert.rejects(db.q('INSERT INTO gastos (id_proyecto, id_funcionario, monto, concepto) VALUES (?, 1, 300000, ?)', [estado.parque, 'Directo']), /costo aprobado/);
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
  const img = await fetch(`${(await ana.pagina('/')).url.replace(/\/$/, '')}/api/imagenes/${fotos[0].id_imagen}`);
  assert.strictEqual(img.headers.get('content-type'), 'image/png');
  ok(await func.del(`/func/fotos/${fotos[0].id_foto_denuncia}`));
  assert.strictEqual((await ana.get(`/obras/${estado.parque}`)).datos.fotos.length, 0);

  const plaza = (await func.get('/func/obras')).datos.obras.find((o) => o.titulo.startsWith('Plaza'));
  falla(await func.post(`/func/obras/${plaza.id_proyecto}/inejecutable`, {}));
  ok(await func.post(`/func/obras/${plaza.id_proyecto}/inejecutable`, { motivo: 'El terreno es privado' }));
  assert.strictEqual((await func.get(`/func/obras/${plaza.id_proyecto}`)).datos.estatus, 'inejecutable');
});

test('portada, inicio y usuarios por tipo', async () => {
  const cifras = (await cliente().get('/cifras')).datos;
  assert.strictEqual(cifras.colonias, 32);
  assert.strictEqual(cifras.ciclo.nombre, 'Ciclo de prueba');
  const ana = await entrar('ana@correo.mx', 'Prepar2026');
  const inicio = (await ana.get('/ciclo')).datos;
  assert.strictEqual(inicio.fases.length, 8);
  assert.strictEqual(inicio.resumen.mios, 1);
  const lista = (await estado.admin.get('/admin/usuarios?rol=funcionario')).datos;
  assert.deepStrictEqual(lista.usuarios.map((u) => u.correo), ['func@prepar.mx']);
  assert.strictEqual(lista.conteo.ciudadano, 4);
  assert.strictEqual((await estado.admin.get('/admin/usuarios?rol=ciudadano&q=beto')).datos.usuarios.length, 1);
  const bcrypt = require('bcryptjs');
  const otro = await db.q("INSERT INTO usuarios (rol, nombre, correo, password_hash) VALUES ('administrador', 'Otro admin', 'otro@prueba.mx', ?)", [await bcrypt.hash('Admin2026', 10)]);
  falla(await estado.admin.put(`/admin/usuarios/${otro.insertId}/activo`, { activo: false }));
  const otroAdmin = await entrar('otro@prueba.mx', 'Admin2026');
  const yo = (await estado.admin.get('/yo')).datos;
  falla(await otroAdmin.put(`/admin/usuarios/${yo.id_usuario}/activo`, { activo: false }));
  const beto = (await estado.admin.get('/admin/usuarios?rol=ciudadano&q=beto')).datos.usuarios[0];
  ok(await otroAdmin.put(`/admin/usuarios/${beto.id_usuario}/activo`, { activo: false }));
  ok(await otroAdmin.put(`/admin/usuarios/${beto.id_usuario}/activo`, { activo: true }));
});

test('perfil, cambio de contraseña, recuperación y eliminar cuenta', async () => {
  const caro = await entrar('caro@correo.mx', 'Prepar2026');
  ok(await caro.put('/perfil', { nombre: 'Carolina Pérez', telefono: '5512345678', id_colonia: estado.clav }));
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
