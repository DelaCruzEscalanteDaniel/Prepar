'use strict';
const express = require('express');
const hash = require('../lib/hash');
const crypto = require('crypto');
const config = require('../config');
const db = require('../db');
const log = require('../lib/log');
const v = require('../lib/validar');
const { asincrono, limitador } = require('../lib/seguridad');
const sesion = require('../lib/sesion');
const { ErrorApp, peticionInvalida } = require('../lib/errores');
const envioCorreo = require('../lib/correo');
const { tipoReal, dimensiones, acotar } = require('../lib/archivos');
const verificacion = require('../lib/verificacion');

const router = express.Router();
const HASH_FALSO = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8.8BJm2Cj5DiYbFQ4dl1dgcZqbIaSu';

const destinoPorRol = (rol, debeCambiar) => {
  if (rol === 'administrador') return '/admin/inicio.html';
  if (rol === 'funcionario') return debeCambiar ? '/funcionario/perfil.html?temporal=1' : '/funcionario/inicio.html';
  return '/ciudadano/inicio.html';
};

const fallo = (e) => e === 401 || e === 400;
const limiteLoginIp = limitador({ ventanaMs: 15 * 60 * 1000, maximo: 60, contarSi: fallo, mensaje: 'Demasiados intentos fallidos desde tu conexión. Espera 15 minutos' });
const limiteLoginCorreo = limitador({
  ventanaMs: 15 * 60 * 1000, maximo: 10, contarSi: fallo,
  clave: (req) => `c:${String((req.body && req.body.correo) || '').toLowerCase().slice(0, 50)}`,
  mensaje: 'Demasiados intentos con este correo. Espera 15 minutos',
});
const limiteRegistro = limitador({ ventanaMs: 60 * 60 * 1000, maximo: 60, contarSi: (e) => e === 201, mensaje: 'Se crearon demasiadas cuentas desde esta conexión. Intenta más tarde' });
const limiteRegistroIntentos = limitador({ ventanaMs: 10 * 60 * 1000, maximo: 120, mensaje: 'Demasiados intentos de registro. Espera unos minutos' });
const limiteRecuperar = limitador({ ventanaMs: 60 * 60 * 1000, maximo: 20, mensaje: 'Demasiadas solicitudes de recuperación. Intenta en una hora' });
const limiteRecuperarCorreo = limitador({
  ventanaMs: 60 * 60 * 1000, maximo: 3,
  clave: (req) => `r:${String((req.body && req.body.correo) || '').toLowerCase().slice(0, 50)}`,
  mensaje: 'Ya enviamos varios enlaces a este correo. Revisa tu bandeja o intenta en una hora',
});
const limiteVerificar = limitador({ ventanaMs: 10 * 60 * 1000, maximo: 30, mensaje: 'Demasiados intentos. Espera unos minutos' });
const limiteReenviar = limitador({ ventanaMs: 15 * 60 * 1000, maximo: 3, clave: (req) => `rv:${req.usuario ? req.usuario.id : req.ip}`,
  mensaje: 'Ya te enviamos varios enlaces. Revisa tu bandeja de entrada y la de spam, o espera 15 minutos' });
const limiteEliminar = limitador({ ventanaMs: 15 * 60 * 1000, maximo: 5, clave: (req) => `el:${req.usuario ? req.usuario.id : req.ip}`,
  mensaje: 'Demasiados intentos. Espera 15 minutos' });
const limiteFoto = limitador({ ventanaMs: 10 * 60 * 1000, maximo: 20, clave: (req) => `f:${req.usuario ? req.usuario.id : req.ip}` });

async function abrirSesion(req, res, con, usuarioId) {
  if (req.tokenHash) sesion.olvidar({ tokenHash: req.tokenHash });
  if (req.tokenHash) await con.call('sp_cerrar_sesion', [req.tokenHash]).catch(() => {});
  const token = sesion.crearToken();
  const filas = await con.call('sp_iniciar_sesion', [usuarioId, sesion.hashToken(token)]);
  const u = filas[0];
  sesion.establecerCookie(res, token);
  const t = await con.uno(SQL_TERMINOS_USUARIO, [usuarioId]);
  const aceptar = !!(t && t.vigente && t.terminos_version !== t.vigente);
  const destino = destinoPorRol(u.rol, !!u.debe_cambiar_password);
  return {
    rol: u.rol, nombre: u.nombre_completo, idioma: u.idioma,
    debeCambiarPassword: !!u.debe_cambiar_password,
    debeAceptarTerminos: aceptar,
    destino: aceptar ? '/terminos.html?aceptar=1&volver=' + encodeURIComponent(destino) : destino,
  };
}

const SQL_VIGENTE = `SELECT version FROM terminos_condiciones WHERE vigente_desde <= CURDATE()
                     ORDER BY vigente_desde DESC LIMIT 1`;
const SQL_TERMINOS_USUARIO = `SELECT u.terminos_version, (${SQL_VIGENTE}) AS vigente FROM usuarios u WHERE u.id = ?`;

router.post('/auth/aceptar-terminos', asincrono(async (req, res) => {
  if (!req.usuario) throw new ErrorApp(401, 'Inicia sesión para continuar');
  const b = v.cuerpo(req);
  if (!v.booleano(b.acepto)) throw peticionInvalida('Marca la casilla para aceptar los Términos y condiciones');
  const r = await db.conSistema(async (con) => {
    const vig = await con.uno(SQL_VIGENTE);
    if (!vig) return { version: null };
    if (b.version !== undefined && String(b.version) !== vig.version) {
      throw new ErrorApp(409, 'Los Términos y condiciones cambiaron mientras los leías. Revisa la versión nueva');
    }
    await con.q('UPDATE usuarios SET terminos_version = ?, terminos_aceptados_en = NOW() WHERE id = ?', [vig.version, req.usuario.id]);
    return { version: vig.version };
  });
  sesion.olvidar({ usuarioId: req.usuario.id });
  res.json({ ok: true, version: r.version, destino: destinoPorRol(req.usuario.rol, req.usuario.debeCambiarPassword), mensaje: 'Gracias. Aceptaste los Términos y condiciones' });
}));

router.post('/auth/login', limiteLoginIp, limiteLoginCorreo, asincrono(async (req, res) => {
  const b = v.cuerpo(req);
  const correo = v.correo(b.correo);
  const pass = typeof b.password === 'string' ? b.password : '';
  if (!pass) throw peticionInvalida('Escribe tu contraseña');
  const credencialesMal = () => {
    log.seguridad('login_fallido', req, { correo });
    return new ErrorApp(401, 'Correo o contraseña incorrectos');
  };
  const u = await db.conSistema((con) => con.uno(
    'SELECT id, password_hash, estado, (bloqueado_hasta IS NOT NULL AND bloqueado_hasta > NOW()) AS bloqueado FROM usuarios WHERE correo = ?',
    [correo]));
  const largoOk = v.largo(pass) >= v.LIMITES.passwordMin && v.largo(pass) <= v.LIMITES.passwordMax;
  const coincide = await hash.comparar(pass, u && largoOk ? u.password_hash : HASH_FALSO);
  const ok = !!u && largoOk && coincide;
  if (u && u.bloqueado) {
    log.seguridad('login_cuenta_bloqueada', req, { correo });
    throw credencialesMal();
  }
  const resultado = await db.conSistema(async (con) => {
    if (!ok) {
      await con.call('sp_login_fallido', [correo]);
      throw credencialesMal();
    }
    if (u.estado !== 'activa') log.seguridad('login_cuenta_no_activa', req, { correo, estado: u.estado });
    if (u.estado === 'suspendida') throw new ErrorApp(403, 'Tu cuenta está suspendida. Comunícate con el Administrador');
    if (u.estado !== 'activa') throw new ErrorApp(403, 'Tu cuenta está desactivada');
    return abrirSesion(req, res, con, u.id);
  });
  log.seguridad('login_ok', req, { usuario: u.id });
  res.json(resultado);
}));

router.post('/auth/logout', asincrono(async (req, res) => {
  if (req.tokenHash) sesion.olvidar({ tokenHash: req.tokenHash });
  if (req.tokenHash) await db.conSistema((con) => con.call('sp_cerrar_sesion', [req.tokenHash]));
  sesion.borrarCookie(res);
  res.json({ ok: true });
}));

router.get('/auth/yo', (req, res) => {
  if (!req.usuario) {
    return res.status(401).json({ error: req.sesionExpirada ? 'Tu sesión se cerró por inactividad' : 'Sin sesión', expirada: !!req.sesionExpirada });
  }
  return res.json(req.usuario);
});

router.post('/auth/registro', limiteRegistroIntentos, limiteRegistro, asincrono(async (req, res) => {
  const b = v.cuerpo(req);
  const nombre = v.nombrePersona(b.nombre);
  const correo = v.correo(b.correo);
  const pass = v.password(b.password);
  v.contrasenaSegura(pass, { correo: b.correo, nombre: b.nombre });
  if (typeof b.confirmar !== 'string' || !b.confirmar) throw peticionInvalida('Escribe tu contraseña otra vez en «Confirmar contraseña»');
  if (b.confirmar !== pass) throw peticionInvalida('Las contraseñas no coinciden: escribe la misma contraseña en los dos campos');
  const nacimiento = v.fecha(b.fecha_nacimiento, { campo: 'tu fecha de nacimiento' });
  const genero = v.opcion(b.genero, ['mujer', 'hombre', 'no_binario', 'prefiero_no_decir'], { campo: 'tu género' });
  const unidad = v.id(b.unidad_territorial_id, 'tu colonia, barrio o pueblo');
  if (!v.booleano(b.acepta_terminos)) throw peticionInvalida('Debes aceptar los Términos y condiciones para crear tu cuenta');
  if (!v.booleano(b.acepta_aviso)) throw peticionInvalida('Debes aceptar el aviso de privacidad para crear tu cuenta');
  const hoy = new Date();
  const limite = new Date(Date.UTC(hoy.getUTCFullYear() - 18, hoy.getUTCMonth(), hoy.getUTCDate()));
  if (new Date(`${nacimiento}T00:00:00Z`) > limite) throw peticionInvalida('Solo pueden registrarse personas mayores de 18 años');
  if (Number(nacimiento.slice(0, 4)) < hoy.getUTCFullYear() - 120) throw peticionInvalida('La fecha de nacimiento no es válida');
  const hashPass = await hash.hash(pass);
  const resultado = await db.conSistema(async (con) => {
    const ut = await con.uno('SELECT id FROM unidades_territoriales WHERE id = ? AND activa', [unidad]);
    if (!ut) throw peticionInvalida('La colonia, barrio o pueblo seleccionado no existe');
    const filas = await con.call('sp_registrar_ciudadano', [nombre, correo, hashPass, nacimiento, genero, unidad, true]);
    const id = filas[0].usuario_id;
    await con.q(`UPDATE usuarios SET terminos_version = (${SQL_VIGENTE}), terminos_aceptados_en = NOW() WHERE id = ?`, [id]);
    const r = await abrirSesion(req, res, con, id);
    if (verificacion.activa()) {
      await verificacion.enviarEnlace(con, { id, correo, nombre });
      r.verificarCorreo = true;
      r.mensaje = `Te enviamos un enlace a ${correo} para confirmar tu correo. Ábrelo para poder participar.`;
    }
    return r;
  });
  res.status(201).json(resultado);
}));

router.post('/auth/recuperar', limiteRecuperar, limiteRecuperarCorreo, asincrono(async (req, res) => {
  const b = v.cuerpo(req);
  const correo = v.correo(b.correo);
  const token = crypto.randomBytes(32).toString('base64url');
  await db.conSistema(async (con) => {
    await con.call('sp_solicitar_recuperacion', [correo, sesion.hashToken(token)]);
    const u = await con.uno("SELECT id, nombre_completo FROM usuarios WHERE correo = ? AND estado = 'activa'", [correo]);
    if (!u) return;
    const enlace = `${config.urlPublica}/restablecer.html#token=${token}`;
    await con.call('sp_encolar_correo', [u.id, correo, 'Prepar · Restablece tu contraseña',
      `Hola, ${u.nombre_completo}.\n\nRecibimos una solicitud para restablecer tu contraseña de Prepar.\n` +
      `Abre este enlace (válido por 1 hora):\n${enlace}\n\nSi no fuiste tú, ignora este mensaje.`, 'recuperacion']);
    if (!config.produccion) log.info(`[Desarrollo] Enlace de recuperación para ${correo}: ${enlace}`);
  });
  envioCorreo.avisar();
  res.json({ ok: true, mensaje: 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.' });
}));

router.post('/auth/restablecer', limiteRecuperar, asincrono(async (req, res) => {
  const b = v.cuerpo(req);
  const token = typeof b.token === 'string' && /^[A-Za-z0-9_-]{20,100}$/.test(b.token) ? b.token : null;
  if (!token) throw peticionInvalida('El enlace no es válido o ya expiró');
  const pass = v.password(b.password, 'la nueva contraseña');
  const dueno = await db.conSistema((con) => con.uno(`SELECT u.correo, u.nombre_completo AS nombre FROM tokens_recuperacion t JOIN usuarios u ON u.id = t.usuario_id
    WHERE t.token_hash = ? AND t.usado_en IS NULL AND t.expira_en > NOW()`, [sesion.hashToken(token)]));
  if (!dueno) throw new ErrorApp(409, 'El enlace no es válido o ya expiró');
  v.contrasenaSegura(pass, dueno);
  const nuevo = await hash.hash(pass);
  await db.conSistema(async (con) => {
    const t = await con.uno('SELECT usuario_id FROM tokens_recuperacion WHERE token_hash = ? AND usado_en IS NULL AND expira_en > NOW()', [sesion.hashToken(token)]);
    await con.call('sp_restablecer_password', [sesion.hashToken(token), nuevo]);
    if (t) {
      await con.q('UPDATE usuarios SET correo_verificado_en = COALESCE(correo_verificado_en, NOW()) WHERE id = ?', [t.usuario_id]);
      await con.q('UPDATE sesiones SET cerrada_en = NOW() WHERE usuario_id = ? AND cerrada_en IS NULL', [t.usuario_id]);
    }
  });
  sesion.olvidar();
  log.seguridad('password_restablecida', req, { correo: dueno.correo });
  res.json({ ok: true, mensaje: 'Tu contraseña se actualizó. Ya puedes iniciar sesión.' });
}));

router.post('/auth/verificar-correo', limiteVerificar, asincrono(async (req, res) => {
  const id = await db.conSistema((con) => con.transaccion(() => verificacion.confirmar(con, v.cuerpo(req).token)));
  if (!id) throw peticionInvalida('El enlace no es válido o ya expiró. Inicia sesión y pide uno nuevo');
  sesion.olvidar({ usuarioId: id });
  res.json({ ok: true, mensaje: 'Tu correo quedó confirmado. Ya puedes participar.', conSesion: !!(req.usuario && req.usuario.id === id) });
}));

router.post('/auth/reenviar-verificacion', sesion.requiere('ciudadano'), limiteReenviar, asincrono(async (req, res) => {
  const u = req.usuario;
  if (!u.debeVerificarCorreo) return res.json({ ok: true, mensaje: 'Tu correo ya está confirmado' });
  await db.conSistema((con) => verificacion.enviarEnlace(con, { id: u.id, correo: u.correo, nombre: u.nombre }));
  return res.json({ ok: true, mensaje: `Te enviamos un nuevo enlace a ${u.correo}. Revisa también la carpeta de spam.` });
}));

router.post('/auth/cambiar-password', sesion.requiere(), asincrono(async (req, res) => {
  const b = v.cuerpo(req);
  const actual = typeof b.actual === 'string' ? b.actual : '';
  if (!actual) throw peticionInvalida('Escribe tu contraseña actual');
  const nueva = v.password(b.nueva, 'la nueva contraseña');
  v.contrasenaSegura(nueva, { correo: req.usuario.correo, nombre: req.usuario.nombre });
  if (b.confirmar !== undefined && b.confirmar !== nueva) throw peticionInvalida('Las contraseñas nuevas no coinciden');
  if (nueva === actual) throw peticionInvalida('La nueva contraseña debe ser diferente de la actual');
  const u = await db.conUsuario(req.usuario.id, (con) => con.uno('SELECT password_hash FROM usuarios WHERE id = ?', [req.usuario.id]));
  if (!u || !(await hash.comparar(actual, u.password_hash))) throw peticionInvalida('La contraseña actual no es correcta');
  const nuevoHash = await hash.hash(nueva);
  await db.conUsuario(req.usuario.id, async (con) => {
    await con.call('sp_cambiar_password', [nuevoHash]);
    await con.q('UPDATE sesiones SET cerrada_en = NOW() WHERE usuario_id = ? AND cerrada_en IS NULL AND token_hash <> ?',
      [req.usuario.id, req.tokenHash]);
  });
  sesion.olvidar({ usuarioId: req.usuario.id });
  log.seguridad('password_cambiada', req);
  res.json({ ok: true, mensaje: 'Tu contraseña se actualizó', destino: destinoPorRol(req.usuario.rol, false) });
}));

router.put('/perfil', sesion.requiere(), asincrono(async (req, res) => {
  const b = v.cuerpo(req);
  const u = req.usuario;
  const nombre = v.nombrePersona(b.nombre);
  const idioma = b.idioma === undefined ? u.idioma : v.opcion(b.idioma, ['es', 'en'], { campo: 'el idioma' });
  const recibir = b.recibir_correos === undefined ? u.recibirCorreos : v.booleano(b.recibir_correos);
  let telefono = u.telefono || null;
  if (u.rol !== 'ciudadano' && b.telefono !== undefined) {
    telefono = b.telefono === null || b.telefono === '' ? null : v.telefono(b.telefono);
  }
  await db.conUsuario(u.id, (con) => con.transaccion(async () => {
    await con.q('UPDATE usuarios SET nombre_completo = ?, idioma = ?, recibir_correos = ?, telefono = ? WHERE id = ?', [nombre, idioma, recibir, telefono, u.id]);
    if (u.rol === 'ciudadano') {
      const genero = v.opcion(b.genero ?? u.genero, ['mujer', 'hombre', 'no_binario', 'prefiero_no_decir'], { campo: 'el género' });
      const unidad = v.id(b.unidad_territorial_id ?? u.unidadId, 'la colonia, barrio o pueblo');
      if (unidad !== u.unidadId) {
        const ut = await con.uno('SELECT id FROM unidades_territoriales WHERE id = ? AND activa', [unidad]);
        if (!ut) throw peticionInvalida('La colonia, barrio o pueblo seleccionado no existe');
      }
      await con.q('UPDATE ciudadanos SET genero = ?, unidad_territorial_id = ? WHERE usuario_id = ?', [genero, unidad, u.id]);
    }
  }));
  sesion.olvidar({ usuarioId: u.id });
  const perfil = await db.conSistema((con) => sesion.cargarPerfil(con, u.id));
  res.json({ ok: true, mensaje: 'Tus datos se guardaron', usuario: perfil });
}));

router.put('/perfil/idioma', sesion.requiere(), asincrono(async (req, res) => {
  const idioma = v.opcion(v.cuerpo(req).idioma, ['es', 'en'], { campo: 'el idioma' });
  await db.conUsuario(req.usuario.id, (con) => con.q('UPDATE usuarios SET idioma = ? WHERE id = ?', [idioma, req.usuario.id]));
  sesion.olvidar({ usuarioId: req.usuario.id });
  res.json({ ok: true });
}));

const TAM_FOTO = 2 * 1024 * 1024;
router.put('/perfil/foto', sesion.requiere(), limiteFoto,
  express.raw({ type: ['image/jpeg', 'image/png', 'image/jpg'], limit: TAM_FOTO + 1024 }),
  asincrono(async (req, res) => {
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || !buf.length) throw peticionInvalida('Elige una imagen JPG o PNG');
    if (buf.length > TAM_FOTO) throw new ErrorApp(413, 'La imagen pesa más de 2 MB');
    const tipo = tipoReal(buf);
    if (!['image/jpeg', 'image/png'].includes(tipo)) throw peticionInvalida('Solo se aceptan imágenes JPG o PNG');
    const dim = dimensiones(buf) || {};
    const uuid = await db.conUsuario(req.usuario.id, async (con) => {
      const anterior = await con.uno('SELECT a.uuid FROM usuarios u JOIN archivos a ON a.id = u.foto_archivo_id WHERE u.id = ?', [req.usuario.id]);
      const filas = await con.call('sp_guardar_archivo', ['foto_perfil', `perfil-${req.usuario.id}`, tipo, buf, acotar(dim.ancho), acotar(dim.alto), null]);
      await con.q('UPDATE usuarios SET foto_archivo_id = ? WHERE id = ?', [filas[0].archivo_id, req.usuario.id]);
      if (anterior) await con.call('sp_eliminar_archivo', [anterior.uuid]);
      return filas[0].uuid;
    });
    sesion.olvidar({ usuarioId: req.usuario.id });
    res.json({ ok: true, fotoUuid: uuid });
  }));

router.post('/perfil/eliminar', sesion.requiere(), limiteEliminar, asincrono(async (req, res) => {
  const u = req.usuario;
  if (u.rol !== 'ciudadano') throw new ErrorApp(403, 'Las cuentas de Funcionario y Administrador las da de baja el Administrador');
  const b = v.cuerpo(req);
  const pass = typeof b.password === 'string' ? b.password : '';
  if (!pass) throw peticionInvalida('Escribe tu contraseña para confirmar');
  if (b.confirmar !== 'ELIMINAR') throw peticionInvalida('Escribe ELIMINAR para confirmar');
  const fila = await db.conSistema((con) => con.uno('SELECT password_hash FROM usuarios WHERE id = ?', [u.id]));
  if (!fila || pass.length > 72 || !(await hash.comparar(pass, fila.password_hash))) throw peticionInvalida('La contraseña no es correcta');
  await require('../lib/cuentas').eliminarCuenta(u.id);
  log.seguridad('cuenta_eliminada', req);
  sesion.olvidar({ usuarioId: u.id });
  sesion.borrarCookie(res);
  res.json({ ok: true, mensaje: 'Tu cuenta se eliminó. Tus datos personales se borraron y tus votos siguen siendo anónimos.' });
}));

router.delete('/perfil/foto', sesion.requiere(), asincrono(async (req, res) => {
  await db.conUsuario(req.usuario.id, async (con) => {
    const anterior = await con.uno('SELECT a.uuid FROM usuarios u JOIN archivos a ON a.id = u.foto_archivo_id WHERE u.id = ?', [req.usuario.id]);
    await con.q('UPDATE usuarios SET foto_archivo_id = NULL WHERE id = ?', [req.usuario.id]);
    if (anterior) await con.call('sp_eliminar_archivo', [anterior.uuid]);
  });
  sesion.olvidar({ usuarioId: req.usuario.id });
  res.json({ ok: true });
}));

module.exports = router;
