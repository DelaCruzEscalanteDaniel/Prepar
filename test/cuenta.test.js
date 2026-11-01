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

test('contraseñas: hasta 64 caracteres, sin contraseñas comunes ni el propio correo (OWASP ASVS)', async () => {
  const intentar = (correo, password) => A.cliente().post('/api/auth/registro', datos(correo, { password }), { sinVerificar: true });
  for (const p of ['Password1', 'Contraseña1', 'Qwerty123', 'Abc12345', 'Mexico2026']) {
    const r = await intentar(`comun${p.length}${p.charCodeAt(0)}@correo.mx`, p);
    falla(r, 400, p);
    assert.match(r.datos.error, /más usadas/);
  }
  const conCorreo = await intentar('rodrigo.leon@correo.mx', 'Rodrigo.leon2026');
  falla(conCorreo, 400);
  assert.match(conCorreo.datos.error, /correo/);
  falla(await intentar('largo65@correo.mx', 'Ab1-'.repeat(16) + 'x'), 400, '65 caracteres');
  falla(await intentar('largo64@correo.mx', 'Ab1-cD2!eF3?gH4_'.repeat(4)), 201, '64 caracteres se aceptan');
  const larga = A.cliente();
  ok(await larga.post('/api/auth/login', { correo: 'largo64@correo.mx', password: 'Ab1-cD2!eF3?gH4_'.repeat(4) }), 'y con ella se inicia sesión');
  falla(await larga.post('/api/auth/cambiar-password', { actual: 'Ab1-cD2!eF3?gH4_'.repeat(4), nueva: 'Password123', confirmar: 'Password123' }), 400, 'tampoco al cambiarla');
  for (const [p, msj] of [['Con Espacio1', /espacios/], ['sinmayuscula1', /mayúscula/], ['SinNumeroAqui', /número/], ['Clave<2026>', /símbolos/], ['Clave2026😀', /símbolos/]]) {
    const r = await intentar(`regla${p.length}${p.charCodeAt(1)}@correo.mx`, p);
    falla(r, 400, p);
    assert.match(r.datos.error, msj, p);
  }
});

test('el servidor lee la URL con el analizador simple (sin objetos anidados ni prototipos)', async () => {
  const { crearApp } = require('../server/app');
  assert.equal(crearApp().get('query parser'), 'simple');
  const r = await A.cliente().get('/api/directorio?__proto__[x]=1&constructor[prototype][y]=2&alcaldia[a]=1');
  assert.ok(r.estado < 500, `→ ${r.estado}`);
  assert.equal({}.x, undefined);
  assert.equal({}.y, undefined);
});

test('los eventos de seguridad quedan registrados sin contraseñas y con el correo enmascarado (A09)', async () => {
  const config = require('../server/config');
  const antes = config.registrarEnConsola;
  const salida = [];
  const original = console.log;
  config.registrarEnConsola = true;
  console.log = (...a) => salida.push(a.join(' '));
  try {
    await A.cliente().post('/api/auth/login', { correo: 'alguien.raro@correo.mx', password: 'NoEsLaClave99' });
    await fetch(`${A.base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    await fetch(`${A.base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Prepar': '1', Origin: 'https://atacante.example' }, body: '{}' });
    const c = A.cliente();
    ok(await c.post('/api/auth/registro', datos('evento.rol@correo.mx'), {}));
    await c.get('/api/admin/resumen');
  } finally {
    console.log = original;
    config.registrarEnConsola = antes;
  }
  const eventos = salida.filter((x) => x.includes('SEGURIDAD')).map((x) => JSON.parse(x.slice(x.indexOf('{'))));
  const tipos = eventos.map((e) => e.evento);
  for (const t of ['login_fallido', 'csrf_rechazado', 'acceso_denegado']) assert.ok(tipos.includes(t), `${t} en ${tipos}`);
  const fallido = eventos.find((e) => e.evento === 'login_fallido');
  assert.equal(fallido.correo, 'al***@correo.mx');
  assert.ok(fallido.ip);
  assert.ok(!salida.join('\n').includes('NoEsLaClave99'), 'nunca se registra la contraseña');
  assert.ok(eventos.filter((e) => e.evento === 'csrf_rechazado').some((e) => e.motivo === 'otro_origen'));
});

test('el inicio de sesión nunca revela si el correo existe, si la cuenta está bloqueada ni qué dato está mal', async () => {
  falla(await A.cliente().post('/api/auth/registro', datos('existe.login@correo.mx'), {}), 201);
  const intento = async (correo, password) => {
    const r = await A.cliente().post('/api/auth/login', { correo, password });
    return `${r.estado} ${r.datos.error}`;
  };
  const esperado = '401 Correo o contraseña incorrectos';
  assert.equal(await intento('no.existe.nunca@correo.mx', 'Cualquiera2026'), esperado, 'correo inexistente');
  assert.equal(await intento('existe.login@correo.mx', 'Equivocada2026'), esperado, 'contraseña incorrecta');
  assert.equal(await intento('existe.login@correo.mx', 'x'.repeat(70)), esperado, 'contraseña demasiado larga');
  assert.equal(await intento('no.existe.nunca@correo.mx', 'x'.repeat(70)), esperado);
  assert.equal(await intento('existe.login@correo.mx', 'corta'), esperado, 'contraseña demasiado corta');
  for (let i = 0; i < 6; i += 1) await intento('existe.login@correo.mx', 'Equivocada2026');
  const fila = await A.db.conSistema((con) => con.uno("SELECT bloqueado_hasta IS NOT NULL AND bloqueado_hasta > NOW() AS b, bloqueado_hasta AS h FROM usuarios WHERE correo = 'existe.login@correo.mx'"));
  assert.equal(Number(fila.b), 1, 'la cuenta sí quedó bloqueada por dentro');
  assert.equal(await intento('existe.login@correo.mx', 'Prepar2026'), esperado, 'bloqueada, aun con la contraseña correcta, responde igual');
  const despues = await A.db.conSistema((con) => con.uno("SELECT bloqueado_hasta AS h FROM usuarios WHERE correo = 'existe.login@correo.mx'"));
  assert.equal(String(despues.h), String(fila.h), 'los intentos durante el bloqueo no lo alargan');
  const rec1 = await A.cliente().post('/api/auth/recuperar', { correo: 'existe.login@correo.mx' });
  const rec2 = await A.cliente().post('/api/auth/recuperar', { correo: 'no.existe.nunca@correo.mx' });
  assert.equal(`${rec1.estado} ${rec1.datos.mensaje}`, `${rec2.estado} ${rec2.datos.mensaje}`, 'recuperar responde igual exista o no');
});
