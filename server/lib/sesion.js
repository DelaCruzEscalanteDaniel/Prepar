'use strict';
const crypto = require('crypto');
const config = require('../config');
const db = require('../db');
const { ErrorApp } = require('./errores');

const COOKIE = 'prepar_sesion';
const RE_TOKEN = /^[A-Za-z0-9_-]{43}$/;

const crearToken = () => crypto.randomBytes(32).toString('base64url');
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

function establecerCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSegura,
    path: '/',
    maxAge: 12 * 60 * 60 * 1000,
  });
}

function borrarCookie(res) {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: config.cookieSegura, path: '/' });
}

const SQL_PERFIL = `
  SELECT u.id, u.rol, u.nombre_completo, u.correo, u.idioma, u.recibir_correos, u.estado, u.telefono, u.correo_verificado_en,
         u.terminos_version,
         (SELECT tc.version FROM terminos_condiciones tc WHERE tc.vigente_desde <= CURDATE()
           ORDER BY tc.vigente_desde DESC LIMIT 1) AS terminos_vigente,
         (SELECT a.uuid FROM archivos a WHERE a.id = u.foto_archivo_id AND a.eliminado_en IS NULL) AS foto_uuid,
         c.unidad_territorial_id, c.genero, c.fecha_nacimiento,
         ut.nombre AS unidad_territorial, ut.alcaldia_id AS ciudadano_alcaldia_id,
         f.alcaldia_id AS funcionario_alcaldia_id, f.debe_cambiar_password,
         (SELECT GROUP_CONCAT(ff.funcion ORDER BY ff.funcion) FROM funcionario_funciones ff
           WHERE ff.funcionario_id = u.id) AS funciones,
         al.nombre AS alcaldia
  FROM usuarios u
  LEFT JOIN ciudadanos c ON c.usuario_id = u.id
  LEFT JOIN unidades_territoriales ut ON ut.id = c.unidad_territorial_id
  LEFT JOIN funcionarios f ON f.usuario_id = u.id
  LEFT JOIN alcaldias al ON al.id = COALESCE(f.alcaldia_id, ut.alcaldia_id)
  WHERE u.id = ? AND u.estado = 'activa'`;

function normalizarPerfil(p) {
  if (!p) return null;
  return {
    id: p.id,
    rol: p.rol,
    nombre: p.nombre_completo,
    correo: p.correo,
    telefono: p.telefono || null,
    idioma: p.idioma,
    recibirCorreos: !!p.recibir_correos,
    fotoUuid: p.foto_uuid || null,
    unidadId: p.unidad_territorial_id || null,
    unidad: p.unidad_territorial || null,
    genero: p.genero || null,
    fechaNacimiento: p.fecha_nacimiento || null,
    alcaldiaId: p.funcionario_alcaldia_id || p.ciudadano_alcaldia_id || null,
    alcaldia: p.alcaldia || null,
    funciones: p.funciones ? String(p.funciones).split(',') : [],
    debeCambiarPassword: p.rol === 'funcionario' && !!p.debe_cambiar_password,
    debeAceptarTerminos: !!p.terminos_vigente && p.terminos_version !== p.terminos_vigente,
    terminosVigentes: p.terminos_vigente || null,
    debeVerificarCorreo: p.rol === 'ciudadano' && !p.correo_verificado_en && require('./verificacion').activa(),
  };
}

async function cargarPerfil(con, usuarioId) {
  return normalizarPerfil(await con.uno(SQL_PERFIL, [usuarioId]));
}

const CACHE_MS = 10 * 1000;
const cache = new Map();
const limpiar = setInterval(() => {
  const ahora = Date.now();
  for (const [k, x] of cache) if (x.hasta <= ahora) cache.delete(k);
}, 30 * 1000);
limpiar.unref();
function olvidar({ tokenHash, usuarioId } = {}) {
  if (tokenHash) cache.delete(tokenHash);
  if (usuarioId) for (const [k, x] of cache) if (x.usuario.id === usuarioId) cache.delete(k);
  if (!tokenHash && !usuarioId) cache.clear();
}

async function leerSesion(req, res, next) {
  req.usuario = null;
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) return next();
  if (!RE_TOKEN.test(token)) { borrarCookie(res); return next(); }
  try {
    const hash = hashToken(token);
    const guardada = cache.get(hash);
    if (guardada && guardada.hasta > Date.now()) {
      req.usuario = guardada.usuario;
      req.tokenHash = hash;
      return next();
    }
    const usuario = await db.conSistema(async (con) => {
      const filas = await con.call('sp_validar_sesion', [hash]);
      if (!filas.length) return null;
      return cargarPerfil(con, filas[0].usuario_id);
    });
    if (usuario) {
      if (cache.size > 20000) cache.clear();
      cache.set(hash, { usuario, hasta: Date.now() + CACHE_MS });
    } else cache.delete(hash);
    if (usuario) {
      req.usuario = usuario;
      req.tokenHash = hash;
    } else {
      req.sesionExpirada = true;
      borrarCookie(res);
    }
    return next();
  } catch (e) {
    return next(e);
  }
}

const PERMITIDAS_TEMPORAL = /^\/api\/(auth\/|perfil|publico\/|catalogos|notificaciones)/;
const PERMITIDAS_TERMINOS = /^\/api\/(auth\/|publico\/|catalogos)/;
const PERMITIDAS_SIN_VERIFICAR = /^\/api\/(auth\/|perfil|publico\/|catalogos|notificaciones)/;

function requiere(...roles) {
  return (req, res, next) => {
    if (!req.usuario) {
      return next(new ErrorApp(401, req.sesionExpirada
        ? 'Tu sesión se cerró por inactividad. Inicia sesión de nuevo'
        : 'Inicia sesión para continuar'));
    }
    if (roles.length && !roles.includes(req.usuario.rol)) {
      return next(new ErrorApp(403, 'Esta sección no corresponde a tu tipo de cuenta'));
    }
    if (req.usuario.debeAceptarTerminos && !PERMITIDAS_TERMINOS.test(req.originalUrl)) {
      return next(new ErrorApp(403, 'Acepta los Términos y condiciones para continuar', { codigo: 'aceptar_terminos' }));
    }
    if (req.usuario.debeCambiarPassword && !PERMITIDAS_TEMPORAL.test(req.originalUrl)) {
      return next(new ErrorApp(403, 'Cambia tu contraseña temporal para continuar', { codigo: 'cambiar_password' }));
    }
    if (req.usuario.debeVerificarCorreo && req.method !== 'GET' && !PERMITIDAS_SIN_VERIFICAR.test(req.originalUrl)) {
      return next(new ErrorApp(403, 'Confirma tu correo para participar: abre el enlace que te enviamos', { codigo: 'verificar_correo' }));
    }
    return next();
  };
}

function requiereFuncion(funcion) {
  return (req, res, next) => {
    const u = req.usuario;
    if (u && u.rol === 'funcionario' && !u.funciones.includes(funcion)) {
      return next(new ErrorApp(403, `No tienes asignada la función "${NOMBRES_FUNCION[funcion] || funcion}"`));
    }
    return next();
  };
}

const NOMBRES_FUNCION = {
  directorio: 'Directorio', moderacion: 'Moderación', revision_registros: 'Revisión de registros',
  dictaminacion: 'Dictaminación', consulta: 'Consulta', seguimiento: 'Seguimiento',
};

module.exports = {
  olvidar, COOKIE, crearToken, hashToken, establecerCookie, borrarCookie, leerSesion, requiere, requiereFuncion,
  cargarPerfil, NOMBRES_FUNCION,
};
