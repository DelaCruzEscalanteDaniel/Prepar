'use strict';

class ErrorApp extends Error {
  constructor(estado, mensaje, extra) {
    super(mensaje);
    this.estado = estado;
    this.extra = extra;
  }
}

const peticionInvalida = (m) => new ErrorApp(400, m);
const noAutorizado = (m = 'Inicia sesión para continuar') => new ErrorApp(401, m);
const prohibido = (m = 'No tienes permiso para realizar esta acción') => new ErrorApp(403, m);
const noEncontrado = (m = 'No se encontró lo que buscas') => new ErrorApp(404, m);
const conflicto = (m) => new ErrorApp(409, m);

const DUPLICADOS = [
  [/usuarios\.correo|for key 'correo'/i, 'Ya existe una cuenta con ese correo'],
  [/participaciones\.PRIMARY/i, 'Ya emitiste tu voto en este ciclo'],
  [/apoyos_idea\.PRIMARY/i, 'Ya apoyaste esta idea'],
  [/calificaciones\.PRIMARY/i, 'Ya calificaste este proyecto'],
  [/uk_un_ciclo_activo/i, 'Ya hay un ciclo activo. Ciérralo antes de activar otro'],
  [/uk_una_correccion/i, 'Ya se solicitó una corrección para este proyecto (solo se permite una vez)'],
  [/uk_una_aprobacion/i, 'Este proyecto ya fue revisado'],
  [/dictamenes\.proyecto_id/i, 'Este proyecto ya tiene un dictamen'],
  [/uk_sorteo/i, 'El sorteo de esta unidad territorial ya se realizó'],
  [/reporte_fotos\.archivo_id/i, 'Esa fotografía ya está en otro reporte'],
  [/uk_ut_nombre|unidades_territoriales/i, 'Ya existe una unidad territorial con ese nombre o clave'],
  [/folio/i, 'No se pudo generar el folio. Intenta de nuevo'],
];

function traducir(err) {
  if (!err) return { estado: 500, mensaje: 'Error desconocido', interno: true };
  if (err instanceof ErrorApp) return { estado: err.estado, mensaje: err.message, extra: err.extra };
  if (err.type === 'entity.parse.failed') return { estado: 400, mensaje: 'El cuerpo de la petición no es JSON válido' };
  if (err.type === 'entity.too.large') return { estado: 413, mensaje: 'La información enviada es demasiado grande' };
  if (err.type === 'encoding.unsupported' || err.type === 'charset.unsupported') {
    return { estado: 415, mensaje: 'Codificación no soportada' };
  }
  if (err.status && err.status >= 400 && err.status < 500 && err.expose) {
    return { estado: err.status, mensaje: 'Petición no válida' };
  }
  if (/Queue limit reached/i.test(String(err.message || ''))) {
    return { estado: 503, mensaje: 'El sistema está ocupado. Intenta de nuevo en unos segundos', interno: true };
  }
  if (err.sqlState === '45000' && err.sqlMessage) {
    const permiso = /^(Solo el Administrador|No tienes la función|Sin permiso|Solo un Ciudadano con cuenta activa)/.test(err.sqlMessage);
    return { estado: permiso ? 403 : 409, mensaje: err.sqlMessage };
  }
  switch (err.code) {
    case 'ER_DUP_ENTRY': {
      const texto = String(err.sqlMessage || '');
      for (const [patron, mensaje] of DUPLICADOS) if (patron.test(texto)) return { estado: 409, mensaje };
      return { estado: 409, mensaje: 'Ese registro ya existe' };
    }
    case 'ER_CHECK_CONSTRAINT_VIOLATED':
      return { estado: 400, mensaje: 'Algún dato no cumple las reglas del sistema. Revisa la información' };
    case 'ER_NO_REFERENCED_ROW':
    case 'ER_NO_REFERENCED_ROW_2':
      return { estado: 400, mensaje: 'Alguno de los datos seleccionados no existe o no participa en el ciclo activo' };
    case 'ER_ROW_IS_REFERENCED':
    case 'ER_ROW_IS_REFERENCED_2':
      return { estado: 409, mensaje: 'No se puede eliminar porque otros registros dependen de él' };
    case 'ER_DATA_TOO_LONG':
      return { estado: 400, mensaje: 'Un texto supera el número máximo de caracteres' };
    case 'ER_TRUNCATED_WRONG_VALUE':
    case 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD':
    case 'ER_WRONG_VALUE':
    case 'ER_WRONG_VALUE_FOR_TYPE':
    case 'ER_WARN_DATA_OUT_OF_RANGE':
    case 'ER_DATA_OUT_OF_RANGE':
    case 'ER_BAD_NULL_ERROR':
    case 'ER_INVALID_JSON_TEXT':
      return { estado: 400, mensaje: 'Algún dato tiene un formato o valor no válido' };
    case 'ER_LOCK_DEADLOCK':
    case 'ER_LOCK_WAIT_TIMEOUT':
      return { estado: 503, mensaje: 'El sistema está ocupado. Intenta de nuevo en unos segundos', interno: true };
    case 'ER_NET_PACKET_TOO_LARGE':
      return { estado: 413, mensaje: 'El archivo es demasiado grande para la base de datos' };
    case 'ENOENT':
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
    case 'EAI_AGAIN':
    case 'ER_SERVER_SHUTDOWN':
    case 'ER_CONNECTION_KILLED':
    case 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR':
    case 'PROTOCOL_ENQUEUE_AFTER_QUIT':
    case 'ER_QUERY_INTERRUPTED':
    case 'ECONNREFUSED':
    case 'ENOTFOUND':
    case 'ETIMEDOUT':
    case 'PROTOCOL_CONNECTION_LOST':
    case 'PROTOCOL_SEQUENCE_TIMEOUT':
    case 'ER_CON_COUNT_ERROR':
    case 'ER_ACCESS_DENIED_ERROR':
    case 'ER_BAD_DB_ERROR':
    case 'POOL_CLOSED':
    case 'ECONNRESET':
    case 'EPIPE':
      return { estado: 503, mensaje: 'La base de datos no está disponible en este momento. Intenta más tarde', interno: true };
    default:
      if (err.fatal || (err.syscall && /connect|read|write/.test(err.syscall))) {
        return { estado: 503, mensaje: 'La base de datos no está disponible en este momento. Intenta más tarde', interno: true };
      }
      return { estado: 500, mensaje: 'Ocurrió un error inesperado. Intenta de nuevo', interno: true };
  }
}

const CONEXION = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'ECONNRESET', 'EPIPE',
  'PROTOCOL_CONNECTION_LOST', 'PROTOCOL_SEQUENCE_TIMEOUT', 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR', 'ER_CONNECTION_KILLED', 'ER_CON_COUNT_ERROR',
  'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR', 'ER_SERVER_SHUTDOWN', 'POOL_CLOSED']);
const esErrorConexion = (e) => !!e && (CONEXION.has(e.code) || (!!e.syscall && /connect|read|write|getaddrinfo/.test(e.syscall) && !e.sqlState));
const conexionCaida = (e) => !!e && ['ECONNRESET', 'EPIPE', 'PROTOCOL_CONNECTION_LOST', 'ER_CONNECTION_KILLED', 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR'].includes(e.code);

module.exports = { esErrorConexion, conexionCaida, ErrorApp, peticionInvalida, noAutorizado, prohibido, noEncontrado, conflicto, traducir };
