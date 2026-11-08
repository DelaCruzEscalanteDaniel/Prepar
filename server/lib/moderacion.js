'use strict';

const EXACTAS = new Set([
  'puto', 'puta', 'putos', 'putas', 'putito', 'putita', 'putitos', 'putitas', 'putazo', 'putazos', 'putiza', 'putero', 'putamadre', 'putisima',
  'verga', 'vergas', 'vergazo', 'vergazos', 'verguiza', 'vergudo', 'vergota',
  'culo', 'culos', 'culero', 'culera', 'culeros', 'culeras', 'culerada',
  'joto', 'jotos', 'jotito', 'pinche', 'pinches', 'zorra', 'zorras', 'idiota', 'idiotas', 'imbecil', 'imbeciles',
  'mamada', 'mamadas', 'mamon', 'mamona', 'mamones', 'mamonas', 'ojete', 'ojetes', 'conyo', 'carajo', 'carajos',
  'gilipolas', 'hijueputa', 'hijueputas', 'malparido', 'malparida', 'chingon', 'chingona',
  'hdp', 'ptm', 'alv', 'vrg', 'ctm', 'pndj', 'pndjo', 'hdtpm', 'csm', 'ptmr',
  'shit', 'shits', 'shity', 'bulshit', 'asshole', 'assholes', 'cunt', 'cunts', 'fag', 'fags', 'faggot', 'faggots', 'dumbass', 'bastard',
]);

const PREFIJOS = ['pendej', 'ching', 'cabron', 'mierd', 'maric', 'estupid', 'culer', 'fuck', 'bitch', 'nigg', 'motherf'];

const EN_TODO = ['pendej', 'chingad', 'chingue', 'mierd', 'fuck', 'hijueput', 'hijodeput', 'putamadr', 'hijodelachingad'];

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's' };

function normalizar(s) {
  return String(s).toLowerCase()
    .replace(/ñ/g, 'ny')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[a-z0-9@$]+/g, (t) => (/[a-z]/.test(t) && /[0-9@$]/.test(t) ? t.replace(/[0-9@$]/g, (c) => LEET[c] || c) : t));
}

const colapsar = (t) => t.replace(/([a-z])\1+/g, '$1');

function palabrasDe(s) {
  const crudas = normalizar(s).split(/[^a-z]+/).filter(Boolean);
  const salida = [];
  let sueltas = [];
  const vaciar = () => { if (sueltas.length >= 3) salida.push(sueltas.join('')); sueltas = []; };
  for (const p of crudas) {
    if (p.length === 1) sueltas.push(p);
    else { vaciar(); salida.push(p); }
  }
  vaciar();
  return salida;
}

const PERMITIDAS = /^(chinguer|chingol)/;

function esOfensiva(p) {
  const c = colapsar(p);
  if (PERMITIDAS.test(c)) return false;
  if (EXACTAS.has(p) || EXACTAS.has(c)) return true;
  return PREFIJOS.some((x) => c.startsWith(x)) || EN_TODO.some((x) => c.includes(x));
}

function tieneGroserias(s) {
  if (!s) return false;
  if (palabrasDe(s).some(esOfensiva)) return true;
  const corrido = colapsar(normalizar(s).replace(/[^a-z]+/g, ''));
  return EN_TODO.some((x) => corrido.includes(x));
}

function tieneRepeticiones(s) {
  if (!s) return false;
  if (/([^\d\s])\1{3,}/u.test(s)) return true;
  return /(\p{L}{1,3})\1{5,}/iu.test(s);
}

const TECLADO = /qwer|wert|asdf|sdfg|dfgh|fghj|ghjk|hjkl|zxcv|xcvb|cvbn|vbnm|uiop|poiu|lkjh|mnbv/;
const VOCAL = /[aeiouy]/;
const TECNICAS = new Set(['ctrl', 'http', 'https', 'html', 'shtml', 'xhtml', 'json', 'jpeg', 'mpeg', 'html', 'wifi', 'pdfs', 'pngs']);

function palabraSinSentido(original) {
  const sinMarcas = original.normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!/^[A-Za-z]+$/.test(sinMarcas)) return false;
  if (sinMarcas.length >= 2 && sinMarcas === sinMarcas.toUpperCase()) return false;
  const p = sinMarcas.toLowerCase();
  if (p.length < 4 || TECNICAS.has(p)) return false;
  if (TECLADO.test(p)) return true;
  const inicio = p.match(/^[^aeiouy]+/);
  if (inicio && inicio[0].length >= 4) return true;
  const grupos = p.match(/[^aeiouy]+/g) || [];
  if (grupos.some((g) => g.length >= 5)) return true;
  if (p.length >= 6 && !VOCAL.test(p)) return true;
  return false;
}

function pareceSinSentido(s) {
  if (!s) return false;
  if (/\p{L}[{}[\]|\\^~`]+\p{L}/u.test(s)) return true;
  const limpio = s.replace(/(?:https?:\/\/|www\.)\S+|\S+@\S+\.\S+|\S+\.(?:com|mx|org|net|gob|edu|io)\b\S*/giu, ' ');
  const palabras = limpio.split(/[^\p{L}]+/u).filter(Boolean);
  return palabras.some(palabraSinSentido);
}

module.exports = { tieneGroserias, tieneRepeticiones, pareceSinSentido };
