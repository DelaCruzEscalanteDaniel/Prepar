'use strict';

const ANCHO_HELV = (c) => {
  if ('il.,:;\'|!I'.includes(c)) return 278;
  if ('fjtr()[]{}'.includes(c)) return 333;
  if (c === ' ') return 278;
  if ('mwMW'.includes(c)) return c === 'm' ? 833 : (c === 'w' ? 722 : 900);
  if (c >= 'A' && c <= 'Z') return 667;
  if (c >= '0' && c <= '9') return 556;
  return 556;
};

const EXTRA_CP1252 = { '€': 0x80, '‚': 0x82, '„': 0x84, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '™': 0x99 };
function aWinAnsi(texto) {
  const bytes = [];
  for (const ch of String(texto)) {
    const cp = ch.codePointAt(0);
    if (cp >= 32 && cp < 127) bytes.push(cp);
    else if (cp >= 160 && cp <= 255) bytes.push(cp);
    else if (EXTRA_CP1252[ch]) bytes.push(EXTRA_CP1252[ch]);
    else if (cp === 9) bytes.push(32);
    else bytes.push(63);
  }
  return bytes;
}

function literal(texto) {
  let s = '';
  for (const b of aWinAnsi(texto)) {
    if (b === 0x28 || b === 0x29 || b === 0x5c) s += '\\' + String.fromCharCode(b);
    else s += String.fromCharCode(b);
  }
  return `(${s})`;
}

const anchoTexto = (texto, tam) => [...String(texto)].reduce((a, c) => a + ANCHO_HELV(c), 0) * tam / 1000;

function ajustar(texto, tam, ancho) {
  const lineas = [];
  for (const parrafo of String(texto ?? '').split('\n')) {
    const palabras = parrafo.split(/\s+/).filter(Boolean);
    let actual = '';
    for (const p of palabras) {
      const prueba = actual ? `${actual} ${p}` : p;
      if (anchoTexto(prueba, tam) <= ancho) { actual = prueba; continue; }
      if (actual) lineas.push(actual);
      let resto = p;
      while (anchoTexto(resto, tam) > ancho && resto.length > 1) {
        let n = resto.length;
        while (n > 1 && anchoTexto(resto.slice(0, n), tam) > ancho) n -= 1;
        lineas.push(resto.slice(0, n));
        resto = resto.slice(n);
      }
      actual = resto;
    }
    lineas.push(actual);
  }
  return lineas;
}

const color = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const n = m ? parseInt(m[1], 16) : 0;
  return `${((n >> 16) & 255) / 255} ${((n >> 8) & 255) / 255} ${(n & 255) / 255}`;
};

function crearPdf(paginas) {
  const objetos = [];
  const agregar = (contenido) => { objetos.push(contenido); return objetos.length; };

  const catalogo = agregar(null);
  const arbol = agregar(null);
  const fuente = agregar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fuenteN = agregar('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  const idsPaginas = [];
  for (const ops of paginas) {
    let flujo = '';
    for (const op of ops) {
      if (op.t === 'rect') {
        if (op.relleno) flujo += `${color(op.relleno)} rg ${op.x} ${op.y} ${op.w} ${op.h} re f\n`;
        if (op.borde) flujo += `${color(op.borde)} RG 1 w ${op.x} ${op.y} ${op.w} ${op.h} re S\n`;
      } else if (op.t === 'linea') {
        flujo += `${color(op.color || '#cccccc')} RG ${op.grosor || 1} w ${op.x1} ${op.y1} m ${op.x2} ${op.y2} l S\n`;
      } else if (op.t === 'texto') {
        const f = op.negrita ? 'F2' : 'F1';
        flujo += `BT ${color(op.color || '#111827')} rg /${f} ${op.tam || 11} Tf ${op.x} ${op.y} Td ${literal(op.texto)} Tj ET\n`;
      }
    }
    const contenido = agregar(`<< /Length ${Buffer.byteLength(flujo, 'latin1')} >>\nstream\n${flujo}endstream`);
    const pag = agregar(`<< /Type /Page /Parent ${arbol} 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 ${fuente} 0 R /F2 ${fuenteN} 0 R >> >> /Contents ${contenido} 0 R >>`);
    idsPaginas.push(pag);
  }
  objetos[catalogo - 1] = `<< /Type /Catalog /Pages ${arbol} 0 R >>`;
  objetos[arbol - 1] = `<< /Type /Pages /Kids [${idsPaginas.map((i) => `${i} 0 R`).join(' ')}] /Count ${idsPaginas.length} >>`;

  let salida = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [];
  objetos.forEach((o, i) => {
    offsets.push(Buffer.byteLength(salida, 'latin1'));
    salida += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(salida, 'latin1');
  salida += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) salida += `${String(off).padStart(10, '0')} 00000 n \n`;
  salida += `trailer\n<< /Size ${objetos.length + 1} /Root ${catalogo} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(salida, 'latin1');
}

function documento({ titulo, subtitulo, bloques = [], pie }) {
  const paginas = [];
  let ops = [];
  let y = 0;
  const margen = 56;
  const ancho = 612 - margen * 2;
  const nuevaPagina = () => {
    if (ops.length) paginas.push(ops);
    ops = [];
    ops.push({ t: 'rect', x: 0, y: 742, w: 612, h: 50, relleno: '#0F172A' });
    ops.push({ t: 'texto', x: margen, y: 760, texto: 'Prepar', tam: 18, negrita: true, color: '#E08E6D' });
    ops.push({ t: 'texto', x: margen + 70, y: 761, texto: 'Simulador del Presupuesto Participativo', tam: 10, color: '#E2E8F0' });
    ops.push({ t: 'texto', x: margen, y: 24, tam: 8, color: '#64748B',
      texto: pie || 'Simulador educativo sin validez oficial. Sin relación con el IECM ni con las alcaldías.' });
    y = 712;
  };
  const espacio = (alto) => { if (y - alto < 50) nuevaPagina(); };
  nuevaPagina();
  if (titulo) {
    for (const l of ajustar(titulo, 18, ancho)) { espacio(24); ops.push({ t: 'texto', x: margen, y, texto: l, tam: 18, negrita: true }); y -= 24; }
  }
  if (subtitulo) {
    for (const l of ajustar(subtitulo, 11, ancho)) { espacio(16); ops.push({ t: 'texto', x: margen, y, texto: l, tam: 11, color: '#475569' }); y -= 16; }
  }
  y -= 8;
  for (const b of bloques) {
    if (b.tipo === 'titulo') {
      espacio(30); y -= 8;
      ops.push({ t: 'texto', x: margen, y, texto: b.texto, tam: 13, negrita: true, color: '#8F3F22' });
      y -= 8; ops.push({ t: 'linea', x1: margen, y1: y, x2: margen + ancho, y2: y, color: '#E2E8F0' }); y -= 14;
    } else if (b.tipo === 'dato') {
      const lineas = ajustar(b.valor ?? '—', 11, ancho - 170);
      espacio(16 * lineas.length + 4);
      ops.push({ t: 'texto', x: margen, y, texto: b.etiqueta, tam: 10, negrita: true, color: '#475569' });
      lineas.forEach((l, i) => ops.push({ t: 'texto', x: margen + 170, y: y - i * 15, texto: l, tam: 11 }));
      y -= 15 * lineas.length + 5;
    } else if (b.tipo === 'destacado') {
      espacio(64);
      ops.push({ t: 'rect', x: margen, y: y - 40, w: ancho, h: 52, relleno: '#FFF4EF', borde: '#E08E6D' });
      ops.push({ t: 'texto', x: margen + 16, y: y - 6, texto: b.etiqueta, tam: 10, color: '#8F3F22' });
      ops.push({ t: 'texto', x: margen + 16, y: y - 28, texto: b.valor, tam: 20, negrita: true });
      y -= 66;
    } else if (b.tipo === 'tabla') {
      const cols = b.columnas || [];
      const anchos = b.anchos || cols.map(() => ancho / Math.max(cols.length, 1));
      const fila = (celdas, negrita, fondo) => {
        const partes = celdas.map((c, i) => ajustar(c ?? '', 9, anchos[i] - 6));
        const alto = Math.max(...partes.map((p) => p.length), 1) * 12 + 6;
        espacio(alto);
        if (fondo) ops.push({ t: 'rect', x: margen, y: y - alto + 10, w: ancho, h: alto, relleno: fondo });
        let x = margen;
        partes.forEach((p, i) => {
          p.forEach((l, j) => ops.push({ t: 'texto', x: x + 3, y: y - j * 12, texto: l, tam: 9, negrita }));
          x += anchos[i];
        });
        y -= alto;
      };
      fila(cols, true, '#F1F5F9');
      (b.filas || []).forEach((f) => fila(f.map((c) => (c === null || c === undefined ? '' : String(c))), false));
      y -= 6;
    } else {
      const lineas = ajustar(b.texto ?? '', b.tam || 11, ancho);
      for (const l of lineas) { espacio(16); ops.push({ t: 'texto', x: margen, y, texto: l, tam: b.tam || 11, color: b.color }); y -= 15; }
      y -= 6;
    }
  }
  paginas.push(ops);
  return crearPdf(paginas);
}

module.exports = { crearPdf, documento, ajustar, aWinAnsi };
