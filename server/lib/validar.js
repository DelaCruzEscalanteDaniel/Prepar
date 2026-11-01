'use strict';
const { peticionInvalida } = require('./errores');

const LIMITES = {
  nombre: 50, correo: 50, passwordMin: 8, passwordMax: 64,
  titulo: 100, descripcion: 500, comentario: 250, motivo: 250,
  idea: 500, palabraClave: 50, calle: 100, numero: 10, referencias: 100,
  justificacion: 500, nota: 250, cargo: 50, direccion: 150, sitioWeb: 100,
  avisoTitulo: 100, avisoMensaje: 500, cicloNombre: 50, temas: 100,
};

function limpiarTexto(valor, multilinea) {
  let s = String(valor).normalize('NFC');
  s = s.replace(multilinea ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g
                           : /[\u0000-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g, '');
  if (multilinea) s = s.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n');
  else s = s.replace(/\s+/g, ' ');
  return s.trim();
}

const largo = (s) => [...s].length;

function texto(valor, { campo, max, min = 0, requerido = true, multilinea = false } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (requerido) throw peticionInvalida(`Escribe ${campo}`);
    return null;
  }
  if (typeof valor !== 'string' && typeof valor !== 'number') throw peticionInvalida(`${mayus(campo)} no es válido`);
  const s = limpiarTexto(valor, multilinea);
  if (!s) {
    if (requerido) throw peticionInvalida(`Escribe ${campo}`);
    return null;
  }
  const n = largo(s);
  if (max && n > max) throw peticionInvalida(`${mayus(campo)} admite hasta ${max} caracteres (escribiste ${n})`);
  if (min && n < min) throw peticionInvalida(`${mayus(campo)} debe tener al menos ${min} caracteres`);
  return s;
}

function mayus(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'El dato';
}

function entero(valor, { campo = 'el número', min = 1, max = 2147483647, requerido = true } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (requerido) throw peticionInvalida(`Indica ${campo}`);
    return null;
  }
  const s = typeof valor === 'number' ? valor : (typeof valor === 'string' && /^-?\d{1,12}$/.test(valor.trim()) ? Number(valor.trim()) : NaN);
  if (!Number.isSafeInteger(s) || s < min || s > max) throw peticionInvalida(`${mayus(campo)} no es válido`);
  return s;
}

const id = (valor, campo = 'el identificador', requerido = true) => entero(valor, { campo, min: 1, max: 9007199254740991, requerido });

function decimal(valor, { campo = 'la cantidad', min = 0, max = 999999999999.99, decimales = 2, requerido = true, minExclusivo = false } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (requerido) throw peticionInvalida(`Indica ${campo}`);
    return null;
  }
  let n;
  if (typeof valor === 'number') n = valor;
  else if (typeof valor === 'string' && /^\s*-?\d{1,15}(\.\d+)?\s*$/.test(valor)) n = Number(valor);
  else n = NaN;
  if (!Number.isFinite(n)) throw peticionInvalida(`${mayus(campo)} debe ser un número`);
  const f = 10 ** decimales;
  n = Math.round(n * f) / f;
  if (n < min || n > max || (minExclusivo && n <= min)) {
    throw peticionInvalida(`${mayus(campo)} debe estar entre ${min.toLocaleString('es-MX')} y ${max.toLocaleString('es-MX')}`);
  }
  return n;
}

function fecha(valor, { campo = 'la fecha', requerido = true } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (requerido) throw peticionInvalida(`Indica ${campo}`);
    return null;
  }
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw peticionInvalida(`${mayus(campo)} no es válida (usa AAAA-MM-DD)`);
  const [a, m, d] = valor.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d || a < 1900 || a > 2100) {
    throw peticionInvalida(`${mayus(campo)} no existe`);
  }
  return valor;
}

function opcion(valor, lista, { campo = 'la opción', requerido = true } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (requerido) throw peticionInvalida(`Elige ${campo}`);
    return null;
  }
  if (typeof valor !== 'string' || !lista.includes(valor)) throw peticionInvalida(`${mayus(campo)} no es válida`);
  return valor;
}

function booleano(valor, def = false) {
  if (valor === true || valor === 'true' || valor === 1 || valor === '1' || valor === 'on') return true;
  if (valor === false || valor === 'false' || valor === 0 || valor === '0') return false;
  return def;
}

const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function correo(valor, { requerido = true, campo = 'tu correo electrónico' } = {}) {
  const s = texto(valor, { campo, max: LIMITES.correo, requerido });
  if (s === null) return null;
  const c = s.toLowerCase();
  if (!RE_CORREO.test(c) || c.includes('..') || c.length < 6) throw peticionInvalida('El correo electrónico no es válido');
  return c;
}

function password(valor, campo = 'la contraseña') {
  if (typeof valor !== 'string' || valor.length === 0) throw peticionInvalida(`Escribe ${campo}`);
  const n = largo(valor);
  if (n < LIMITES.passwordMin || n > LIMITES.passwordMax) {
    throw peticionInvalida(`${mayus(campo)} debe tener de ${LIMITES.passwordMin} a ${LIMITES.passwordMax} caracteres`);
  }
  if (/[\u0000-\u001F\u007F]/.test(valor)) throw peticionInvalida(`${mayus(campo)} contiene caracteres no permitidos`);
  if (Buffer.byteLength(valor, 'utf8') > 72) throw peticionInvalida(`${mayus(campo)} es demasiado larga: usa menos acentos o símbolos especiales`);
  return valor;
}

const COMUNES = new Set(`12345678 123456789 1234567890 0123456789 87654321 11111111 00000000 12341234 12121212 11223344 123123123 abc12345 abcd1234
password password1 password123 passw0rd p@ssw0rd p@ssword qwerty123 qwertyui qwerty12 1q2w3e4r 1qaz2wsx asdfghjk asdf1234 zxcvbnm1 iloveyou
contraseña contrasena contrasena1 contrasena123 contraseña1 contraseña123 micontraseña micontrasena teamo123 teamomucho 12345678a a12345678
mexico123 mexico2024 mexico2025 mexico2026 america1 chivas123 pumas123 cruzazul tequila1 superman batman123 pokemon1 futbol123 bienvenido
admin123 admin1234 administrador usuario1 usuario123 prepar123 cdmx2026 holahola hola1234 hola12345 secreto1 welcome1 letmein1
sunshine princess football baseball dragon12 monkey12 master12 shadow12 michael1 jennifer computer internet trustno1 starwars`.split(/\s+/));

function contrasenaSegura(valor, { correo, nombre } = {}) {
  const t = String(valor).toLowerCase();
  const plano = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (COMUNES.has(t) || COMUNES.has(plano) || /^(.)\1+$/.test(t) || /^(0123456789|1234567890|9876543210|abcdefgh|qwertyuiop)/.test(plano)) {
    throw peticionInvalida('Esa contraseña es de las más usadas y fácil de adivinar. Elige otra');
  }
  const usuario = String(correo || '').toLowerCase().split('@')[0];
  if (usuario.length >= 4 && plano.includes(usuario.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) {
    throw peticionInvalida('La contraseña no debe contener tu correo');
  }
  const primero = String(nombre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+/)[0] || '';
  if (primero.length >= 4 && plano.startsWith(primero) && /^[0-9!@#$%&*._-]*$/.test(plano.slice(primero.length))) {
    throw peticionInvalida('La contraseña no debe ser solo tu nombre con números');
  }
  return valor;
}

function nombrePersona(valor, campo = 'el nombre completo') {
  const s = texto(valor, { campo, max: LIMITES.nombre, min: 3 });
  if (!/^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u.test(s)) throw peticionInvalida('El nombre solo puede tener letras y espacios');
  return s;
}

function telefono(valor, requerido = false) {
  if (valor === undefined || valor === null || valor === '') {
    if (requerido) throw peticionInvalida('Escribe el teléfono');
    return null;
  }
  const s = String(valor).replace(/[\s()-]/g, '');
  if (!/^\d{10}$/.test(s)) throw peticionInvalida('El teléfono debe tener 10 dígitos');
  return s;
}

function url(valor, { campo = 'el sitio web', max = LIMITES.sitioWeb, requerido = false } = {}) {
  const s = texto(valor, { campo, max, requerido });
  if (s === null) return null;
  let u;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { throw peticionInvalida(`${mayus(campo)} no es una dirección válida`); }
  if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.')) throw peticionInvalida(`${mayus(campo)} no es una dirección válida`);
  const final = u.toString();
  if (largo(final) > max) throw peticionInvalida(`${mayus(campo)} admite hasta ${max} caracteres`);
  return final;
}

function listaIds(valor, { campo = 'la lista', max = 500, requerido = false } = {}) {
  if (valor === undefined || valor === null || valor === '' || (Array.isArray(valor) && !valor.length)) {
    if (requerido) throw peticionInvalida(`Selecciona ${campo}`);
    return [];
  }
  const arr = Array.isArray(valor) ? valor : String(valor).split(',');
  if (arr.length > max) throw peticionInvalida(`${mayus(campo)} tiene demasiados elementos`);
  const ids = [...new Set(arr.map((x) => id(typeof x === 'string' ? x.trim() : x, campo)))];
  return ids;
}

function coordenadas(lat, lng, requerido = false) {
  if ((lat === undefined || lat === null || lat === '') && (lng === undefined || lng === null || lng === '')) {
    if (requerido) throw peticionInvalida('Marca la ubicación en el mapa');
    return null;
  }
  const la = decimal(lat, { campo: 'la latitud', min: 18.9, max: 19.8, decimales: 6 });
  const lo = decimal(lng, { campo: 'la longitud', min: -99.5, max: -98.8, decimales: 6 });
  return { latitud: la, longitud: lo };
}

function cuerpo(req) {
  const b = req.body;
  if (b === undefined || b === null || b === '') return {};
  if (typeof b !== 'object' || Array.isArray(b)) throw peticionInvalida('El cuerpo de la petición debe ser un objeto JSON');
  return b;
}

function pagina(query, porDefecto = 50, maximo = 200) {
  const lim = entero(query.limite, { campo: 'el límite', min: 1, max: maximo, requerido: false }) || porDefecto;
  const pag = entero(query.pagina, { campo: 'la página', min: 1, max: 100000, requerido: false }) || 1;
  return { limite: lim, desplazamiento: (pag - 1) * lim, pagina: pag };
}

function busqueda(valor) {
  const s = texto(valor, { campo: 'la palabra clave', max: LIMITES.palabraClave, requerido: false });
  if (!s) return null;
  return `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

module.exports = {
  LIMITES, texto, entero, id, decimal, fecha, opcion, booleano, correo, password, contrasenaSegura, nombrePersona,
  telefono, url, listaIds, coordenadas, cuerpo, pagina, busqueda, limpiarTexto, largo,
};
