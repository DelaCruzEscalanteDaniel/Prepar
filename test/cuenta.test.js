'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('./ayuda');

const CLAVERIA = 3;
const AZC = 2;
const ok = (r, msg) => assert.ok(r.estado >= 200 && r.estado < 300, `${msg || ''} → ${r.estado} ${JSON.stringify(r.datos).slice(0, 300)}`);
const falla = (r, estado, msg) => assert.equal(r.estado, estado, `${msg || ''} → ${r.estado} ${JSON.stringify(r.datos).slice(0, 300)}`);
const datos = (correo, extra = {}) => ({
  nombre: 'Vecina de Prueba', correo, password: 'Prepar2026', fecha_nacimiento: '1985-07-20', genero: 'mujer',
  unidad_territorial_id: CLAVERIA, acepta_aviso: true, ...extra,
});
const fila = (sql, p) => A.db.conSistema((con) => con.uno(sql, p));

test.before(async () => { await A.iniciar(); await A.crearAdmin(); });
test.after(async () => { await A.detener(); });

test('verificación de correo: sin confirmar se puede ver pero no participar', async () => {
  const c = A.cliente();
  const r = await c.post('/api/auth/registro', datos('sin.confirmar@correo.mx'), { sinVerificar: true });
  falla(r, 201);
  assert.equal(r.datos.verificarCorreo, true);
  assert.match(r.datos.mensaje, /sin\.confirmar@correo\.mx/);
  const yo = await c.get('/api/auth/yo');
  assert.equal(yo.datos.debeVerificarCorreo, true);
  ok(await c.get('/api/ciudadano/panel'), 'puede ver su panel');
  ok(await c.get('/api/foro'), 'puede leer el foro');
  for (const [ruta, cuerpo] of [['/api/foro/ideas', { titulo: 'Idea de prueba', descripcion: 'Una descripción suficientemente larga.' }],
    ['/api/proyectos', { titulo: 'x' }], ['/api/votacion', { proyecto_id: 1 }], ['/api/foto-denuncia/reportes', {}]]) {
    const x = await c.post(ruta, cuerpo);
    falla(x, 403, ruta);
    assert.equal(x.datos.codigo, 'verificar_correo', ruta);
  }
  ok(await c.put('/api/perfil', { nombre: 'Vecina Corregida' }), 'puede corregir su perfil');

  const t1 = await A.tokenVerificacion('sin.confirmar@correo.mx');
  assert.ok(t1);
  const fuera = A.cliente();
  for (const malo of [undefined, null, '', 'corto', 'x'.repeat(500), { $ne: 1 }, ['a'], 12345, `${t1}X`, "' OR 1=1 -- aaaaaaaaaaaaaa"]) {
    const x = await fuera.post('/api/auth/verificar-correo', { token: malo });
    falla(x, 400, JSON.stringify(malo));
  }
  ok(await c.post('/api/auth/reenviar-verificacion'));
  const t2 = await A.tokenVerificacion('sin.confirmar@correo.mx');
  assert.notEqual(t1, t2);
  falla(await fuera.post('/api/auth/verificar-correo', { token: t1 }), 400, 'el enlace anterior deja de servir');
  ok(await fuera.post('/api/auth/verificar-correo', { token: t2 }), 'se confirma sin sesión');
  falla(await fuera.post('/api/auth/verificar-correo', { token: t2 }), 400, 'un solo uso');
  assert.equal((await c.get('/api/auth/yo')).datos.debeVerificarCorreo, false);
  const idea = await c.post('/api/foro/ideas', { titulo: 'Idea de prueba', descripcion: 'Una descripción suficientemente larga.' });
  assert.notEqual(idea.datos && idea.datos.codigo, 'verificar_correo');
  const re = await c.post('/api/auth/reenviar-verificacion');
  ok(re);
  assert.match(re.datos.mensaje, /ya está confirmado/);
});

test('verificación: enlace vencido, reenvíos y solo para ciudadanos', async () => {
  const c = A.cliente();
  falla(await c.post('/api/auth/registro', datos('vencido@correo.mx'), { sinVerificar: true }), 201);
  const t = await A.tokenVerificacion('vencido@correo.mx');
  await A.db.conSistema((con) => con.q('UPDATE tokens_verificacion SET expira_en = DATE_SUB(NOW(), INTERVAL 1 MINUTE)'));
  falla(await A.cliente().post('/api/auth/verificar-correo', { token: t }), 400, 'vencido');
  const estados = [];
  for (let i = 0; i < 5; i += 1) estados.push((await c.post('/api/auth/reenviar-verificacion')).estado);
  assert.ok(estados.every((x) => x === 200 || x === 429), `reenvíos: ${estados}`);
  assert.ok((await fila("SELECT COUNT(*) AS n FROM tokens_verificacion tv JOIN usuarios u ON u.id = tv.usuario_id WHERE u.correo = 'vencido@correo.mx' AND tv.usado_en IS NULL")).n === 1, 'solo el último enlace sigue vivo');
  falla(await A.cliente().post('/api/auth/reenviar-verificacion'), 401);
  const admin = A.cliente();
  ok(await admin.post('/api/auth/login', { correo: 'admin@prepar.mx', password: 'Admin12345' }));
  falla(await admin.post('/api/auth/reenviar-verificacion'), 403);
  assert.equal((await admin.get('/api/auth/yo')).datos.debeVerificarCorreo, false);
});

test('restablecer la contraseña confirma el correo y cierra las demás sesiones', async () => {
  const a = A.cliente();
  falla(await a.post('/api/auth/registro', datos('olvido@correo.mx'), { sinVerificar: true }), 201);
  const b = A.cliente();
  ok(await b.post('/api/auth/login', { correo: 'olvido@correo.mx', password: 'Prepar2026' }));
  ok(await A.cliente().post('/api/auth/recuperar', { correo: 'olvido@correo.mx' }));
  const correo = await fila("SELECT cuerpo FROM correos_salida WHERE destinatario = 'olvido@correo.mx' AND plantilla = 'recuperacion' ORDER BY id DESC LIMIT 1");
  const token = /token=([A-Za-z0-9_-]+)/.exec(correo.cuerpo)[1];
  A.olvidarSesiones && A.olvidarSesiones();
  ok(await A.cliente().post('/api/auth/restablecer', { token, password: 'Nueva2026x' }));
  falla(await a.get('/api/auth/yo'), 401, 'sesión A cerrada');
  falla(await b.get('/api/auth/yo'), 401, 'sesión B cerrada');
  const n = A.cliente();
  ok(await n.post('/api/auth/login', { correo: 'olvido@correo.mx', password: 'Nueva2026x' }));
  assert.equal((await n.get('/api/auth/yo')).datos.debeVerificarCorreo, false, 'el enlace por correo prueba que el correo es suyo');
});

test('eliminar mi cuenta: borra los datos personales y conserva la participación anónima', async () => {
  const c = A.cliente();
  falla(await c.post('/api/auth/registro', datos('me.voy@correo.mx'), {}), 201);
  const yo = (await c.get('/api/auth/yo')).datos;
  ok(await c.put('/api/perfil/foto', A.png(), { headers: { 'Content-Type': 'image/png' } }));
  const foto = await fila('SELECT foto_archivo_id AS id FROM usuarios WHERE id = ?', [yo.id]);
  assert.ok(foto.id);

  const admin = A.cliente();
  ok(await admin.post('/api/auth/login', { correo: 'admin@prepar.mx', password: 'Admin12345' }));
  const ciclo = await admin.post('/api/admin/ciclos', { nombre: 'Ciclo baja', anio_simulado: 2026, presupuesto_total: 1000000, alcaldias: [AZC], origen_indices: 'aleatorio' });
  ok(ciclo);
  await A.db.conSistema((con) => con.q('INSERT INTO participaciones (ciclo_id, ciudadano_id, unidad_territorial_id, folio_comprobante) VALUES (?, ?, ?, ?)',
    [ciclo.datos.id, yo.id, CLAVERIA, 'PRUEBA-BAJA-1']));
  const antes = await fila('SELECT COUNT(*) AS n FROM participaciones');

  falla(await admin.post('/api/perfil/eliminar', { password: 'Admin12345', confirmar: 'ELIMINAR' }), 403, 'el admin no se da de baja solo');
  falla(await c.post('/api/perfil/eliminar', { password: 'Prepar2026' }), 400, 'falta ELIMINAR');
  falla(await c.post('/api/perfil/eliminar', { password: 'otra', confirmar: 'ELIMINAR' }), 400, 'contraseña incorrecta');
  for (const b of [{}, { password: null, confirmar: 'ELIMINAR' }, { password: { a: 1 }, confirmar: 'ELIMINAR' }, { password: 'x'.repeat(5000), confirmar: 'ELIMINAR' }]) {
    const x = await c.post('/api/perfil/eliminar', b);
    assert.ok(x.estado >= 400 && x.estado < 500, `${JSON.stringify(b).slice(0, 40)} → ${x.estado}`);
  }
  const otro = A.cliente();
  ok(await otro.post('/api/auth/login', { correo: 'me.voy@correo.mx', password: 'Prepar2026' }));
  const r = await c.post('/api/perfil/eliminar', { password: 'Prepar2026', confirmar: 'ELIMINAR' });
  ok(r, 'eliminar');
  falla(await c.get('/api/auth/yo'), 401, 'se cerró esta sesión');
  falla(await otro.get('/api/auth/yo'), 401, 'y las demás');
  falla(await A.cliente().post('/api/auth/login', { correo: 'me.voy@correo.mx', password: 'Prepar2026' }), 401);

  const u = await fila('SELECT nombre_completo, correo, estado, telefono, foto_archivo_id, eliminado_en, recibir_correos FROM usuarios WHERE id = ?', [yo.id]);
  assert.equal(u.nombre_completo, 'Cuenta eliminada');
  assert.equal(u.correo, `eliminada-${yo.id}@prepar.invalid`);
  assert.equal(u.estado, 'desactivada');
  assert.equal(u.foto_archivo_id, null);
  assert.ok(u.eliminado_en);
  const ci = await fila("SELECT genero, DATE_FORMAT(fecha_nacimiento, '%Y-%m-%d') AS f FROM ciudadanos WHERE usuario_id = ?", [yo.id]);
  assert.equal(ci.genero, 'prefiero_no_decir');
  assert.equal(ci.f, '1985-01-01', 'solo queda el año, para estadísticas por edad');
  assert.equal((await fila('SELECT COUNT(*) AS n FROM archivos_contenido WHERE archivo_id = ?', [foto.id])).n, 0, 'la foto se borró');
  assert.equal((await fila('SELECT COUNT(*) AS n FROM correos_salida WHERE usuario_id = ?', [yo.id])).n, 0);
  assert.equal((await fila('SELECT COUNT(*) AS n FROM participaciones')).n, antes.n, 'la participación anónima se conserva');
  assert.ok(await fila("SELECT 1 AS si FROM bitacora WHERE accion = 'cuenta_eliminar' AND entidad_id = ?", [String(yo.id)]));

  falla(await A.cliente().post('/api/auth/registro', datos('me.voy@correo.mx'), {}), 201, 'el correo queda libre');
});

test('aviso de privacidad 2.0 con derechos ARCO y versión aceptada al registrarse', async () => {
  const a = await A.cliente().get('/api/publico/privacidad');
  ok(a);
  assert.equal(a.datos.version, '2.0');
  for (const t of ['Derechos ARCO', 'Eliminar mi cuenta', 'Responsable', 'Finalidades', 'Transferencias', '20 de marzo de 2025']) assert.ok(a.datos.texto_es.includes(t), t);
  for (const t of ['ARCO rights', 'Delete my account']) assert.ok(a.datos.texto_en.includes(t), t);
  const u = await fila("SELECT c.aviso_privacidad_version AS v FROM ciudadanos c JOIN usuarios u ON u.id = c.usuario_id WHERE u.correo = 'sin.confirmar@correo.mx'");
  assert.equal(u.v, '2.0');
});
