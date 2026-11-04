'use strict';

function tipoReal(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 8) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  return null;
}

function dimensiones(buf) {
  try {
    const tipo = tipoReal(buf);
    if (tipo === 'image/png' && buf.length >= 24) {
      return { ancho: buf.readUInt32BE(16), alto: buf.readUInt32BE(20) };
    }
    if (tipo === 'image/jpeg') {
      let i = 2;
      let vueltas = 0;
      while (i + 9 < buf.length && vueltas < 10000) {
        vueltas += 1;
        if (buf[i] !== 0xff) { i += 1; continue; }
        const marca = buf[i + 1];
        if (marca === 0xd8 || marca === 0x01 || (marca >= 0xd0 && marca <= 0xd7)) { i += 2; continue; }
        const largo = buf.readUInt16BE(i + 2);
        if ((marca >= 0xc0 && marca <= 0xcf) && ![0xc4, 0xc8, 0xcc].includes(marca)) {
          return { alto: buf.readUInt16BE(i + 5), ancho: buf.readUInt16BE(i + 7) };
        }
        if (largo < 2) break;
        i += 2 + largo;
      }
    }
  } catch { }
  return null;
}

const acotar = (n) => (Number.isInteger(n) && n > 0 && n <= 32767 ? n : null);

function aCsv(columnas, filas) {
  const celda = (v) => {
    if (v === null || v === undefined) return '';
    let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lineas = [columnas.map((c) => celda(c.titulo)).join(',')];
  for (const f of filas) lineas.push(columnas.map((c) => celda(typeof c.valor === 'function' ? c.valor(f) : f[c.campo])).join(','));
  return Buffer.from(`\uFEFF${lineas.join('\r\n')}\r\n`, 'utf8');
}

function nombreSeguro(nombre, defecto = 'archivo') {
  const limpio = String(nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/\.{2,}/g, '.').replace(/^[._]+/, '').slice(0, 120);
  return limpio || defecto;
}

module.exports = { tipoReal, dimensiones, acotar, aCsv, nombreSeguro };
