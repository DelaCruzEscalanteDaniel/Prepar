'use strict';
const { invalido } = require('./errores');

function texto(valor, campo, max, requerido = true) {
  const s = typeof valor === 'string' ? valor.replace(/\s+/g, ' ').trim() : '';
  if (!s) {
    if (requerido) throw invalido(`Escribe ${campo}`);
    return null;
  }
  if (/<\s*[a-z!/]/i.test(s) || /javascript\s*:/i.test(s)) throw invalido(`${campo} no puede llevar código`);
  if (s.length > max) throw invalido(`${campo} admite hasta ${max} caracteres`);
  return s;
}

function entero(valor, campo) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 1) throw invalido(`${campo} no es válido`);
  return n;
}

function dinero(valor, campo) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n <= 0 || n > 999999999999) throw invalido(`${campo} debe ser una cantidad mayor que cero`);
  return Math.round(n * 100) / 100;
}

function correo(valor) {
  const c = texto(valor, 'tu correo', 60).toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(c)) throw invalido('El correo no es válido');
  return c;
}

function password(valor) {
  if (typeof valor !== 'string' || valor.length < 8 || valor.length > 64) throw invalido('La contraseña debe tener de 8 a 64 caracteres');
  if (!/^[A-Za-z0-9@#$%&]+$/.test(valor)) throw invalido('La contraseña solo puede llevar letras, números y @ # $ % &');
  if (!/[A-Z]/.test(valor) || !/[0-9]/.test(valor)) throw invalido('La contraseña necesita al menos una mayúscula y un número');
  return valor;
}

function telefono(valor) {
  const t = String(valor || '').replace(/\D/g, '');
  if (!t) return null;
  if (t.length !== 10) throw invalido('El teléfono debe tener 10 dígitos');
  return t;
}

function coordenada(valor, min, max) {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = Number(valor);
  if (!Number.isFinite(n) || n < min || n > max) throw invalido('La ubicación no es válida');
  return Math.round(n * 1000000) / 1000000;
}

module.exports = { texto, entero, dinero, correo, password, telefono, coordenada };
