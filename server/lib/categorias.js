'use strict';
const db = require('../db');

const ICONOS = ['arbol', 'cono', 'foco', 'estrella', 'escudo', 'gota', 'banca', 'proyecto', 'obra', 'colonia',
  'balon', 'basura', 'bici', 'libro', 'casa', 'corazon', 'persona', 'punto'];

const DE_FABRICA = [
  ['areas_verdes', 'Parques, huertos y áreas verdes', 'Parks, gardens and green areas', '#3FA34D', 'arbol', 'parque, jardin, huerto, arbol, arbolado, area verde, areas verdes, reforest, pasto, vivero, composta, camellon', 10],
  ['vialidad', 'Calles, bacheo y banquetas', 'Streets, potholes and sidewalks', '#8A94A6', 'cono', 'bache, bacheo, banqueta, pavimen, calle, vialidad, rampa, guarnici, asfalto, paso peatonal, ciclovia, tope', 20],
  ['alumbrado', 'Alumbrado público', 'Street lighting', '#C9A227', 'foco', 'alumbrad, luminari, lampara, ilumina, foco, poste de luz, luz', 30],
  ['recreacion', 'Centros recreativos, deporte y cultura', 'Recreation, sports and culture centers', '#A78BFA', 'estrella', 'deportiv, cancha, gimnasio, juegos, recreativ, cultural, taller, musica, pintura, teatro, biblioteca, centro comunitario, skate, alberca, ludoteca', 40],
  ['seguridad', 'Cámaras y seguridad', 'Cameras and security', '#E55E54', 'escudo', 'camara, videovigil, seguridad, alarma, vigilancia', 50],
  ['agua', 'Agua, pozos y drenaje', 'Water, wells and drainage', '#3B9EDB', 'gota', 'agua, drenaje, pozo, bebedero, coladera, cisterna, tinaco, potable, fuga, inundaci, alcantarill', 60],
  ['mobiliario', 'Plazas y mobiliario urbano', 'Plazas and street furniture', '#C07F4E', 'banca', 'plaza, mobiliario, banca, bote de basura, botes de basura, jardinera, kiosco, techumbre, senaletica, parada', 70],
  ['otro', 'Otro', 'Other', '#5F7387', 'proyecto', '', 999],
].map(([clave, nombre_es, nombre_en, color, icono, palabras, orden]) => ({ clave, nombre_es, nombre_en, color, icono, palabras, orden, activa: 1 }));

const RESPALDO = 'otro';

function normalizar(t) {
  return String(t || '').toLowerCase().replace(/ñ/g, '\u0001').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\u0001/g, 'ñ');
}
const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compilar(palabras) {
  return String(palabras || '').split(',').map((p) => normalizar(p).trim().replace(/\s+/g, ' ')).filter(Boolean)
    .map((p) => new RegExp(`(^|[^a-z0-9ñ])${escapar(p)}`));
}

let tipos = [];
function usar(filas) {
  tipos = filas.map((f) => ({ ...f, activa: Number(f.activa) ? 1 : 0, orden: Number(f.orden), _re: compilar(f.palabras) }));
}
usar(DE_FABRICA);

let vigenteHasta = 0;
let enCurso = null;
function refrescar(forzar) {
  if (!forzar && Date.now() < vigenteHasta) return Promise.resolve(tipos);
  if (enCurso) return enCurso;
  enCurso = db.conSistema((con) => con.q(
    'SELECT clave, nombre_es, nombre_en, color, icono, palabras, orden, activa FROM categorias_proyecto ORDER BY orden, clave'))
    .then((filas) => { if (filas.length) usar(filas); vigenteHasta = Date.now() + 60 * 1000; return tipos; })
    .catch(() => { vigenteHasta = Date.now() + 10 * 1000; return tipos; })
    .finally(() => { enCurso = null; });
  return enCurso;
}
function invalidar() { vigenteHasta = 0; }

const activas = () => tipos.filter((t) => t.activa);
const claves = () => activas().map((t) => t.clave);
const publicas = () => tipos.map(({ _re, ...t }) => t);

function primeraPosicion(tipo, texto) {
  let mejor = -1;
  for (const re of tipo._re) {
    const m = re.exec(texto);
    if (m) {
      const pos = m.index + m[1].length;
      if (mejor < 0 || pos < mejor) mejor = pos;
    }
  }
  return mejor;
}
function buscar(texto) {
  let gana = null;
  let pos = -1;
  for (const t of activas()) {
    const p = primeraPosicion(t, texto);
    if (p >= 0 && (pos < 0 || p < pos)) { gana = t.clave; pos = p; }
  }
  return gana;
}
function adivinar(titulo, descripcion) {
  return buscar(normalizar(titulo)) || buscar(normalizar(`${titulo || ''} ${descripcion || ''}`)) || RESPALDO;
}

module.exports = { ICONOS, DE_FABRICA, RESPALDO, refrescar, invalidar, claves, publicas, adivinar, normalizar, compilar };
