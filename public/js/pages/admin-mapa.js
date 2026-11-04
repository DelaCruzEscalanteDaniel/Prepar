(function () {
  'use strict';
  var P = window.Prepar;
  var NOMBRES_ICONO = {
    arbol: 'Árbol', cono: 'Cono de obra', foco: 'Foco', estrella: 'Estrella', escudo: 'Escudo', gota: 'Gota de agua',
    banca: 'Banca', proyecto: 'Documento', obra: 'Casco de obra', colonia: 'Casas', balon: 'Balón', basura: 'Bote de basura',
    bici: 'Bicicleta', libro: 'Libro', casa: 'Casa', corazon: 'Corazón', persona: 'Persona', punto: 'Punto',
  };
  var PALETA = ['#3FA34D', '#8A94A6', '#C9A227', '#A78BFA', '#E55E54', '#3B9EDB', '#C07F4E', '#5F7387',
    '#0E9F8E', '#E07B39', '#D9468F', '#2F4FB0', '#7A5C3E', '#1F2937'];
  var iconos = [];
  var tipos = [];
  var RE_COLOR = /^#[0-9a-fA-F]{6}$/;

  function pin(color, icono) { return P.seguro('<span class="simbolo-pin">' + P.svgPin(color, icono, false) + '</span>'); }

  function prepararForm(form, valores) {
    valores = valores || {};
    var color = form.querySelector('[name=color]');
    var hex = form.querySelector('[name=color_texto]');
    var paleta = form.querySelector('.paleta-tipo');
    var cajaIconos = form.querySelector('.iconos-opciones');
    var nombre = form.querySelector('[name=nombre_es]');
    var unico = 'i' + Math.random().toString(36).slice(2, 7);
    P.poner(cajaIconos, iconos.map(function (k) {
      var id = unico + '-' + k;
      return P.html`<input type="radio" name="icono" value="${k}" id="${id}" class="solo-lector"><label for="${id}" class="icono-opcion" title="${P.t(NOMBRES_ICONO[k] || k)}">${P.seguro(P.glifo(k, 'currentColor', 22))}<span>${P.t(NOMBRES_ICONO[k] || k)}</span></label>`;
    }));
    P.poner(paleta, PALETA.map(function (c) {
      return P.html`<button type="button" class="muestra-color" data-color="${c}" style="background:${c}" aria-label="${P.t('Usar el color {c}', { c: c })}" title="${c}"></button>`;
    }));
    var pintar = function () {
      var c = RE_COLOR.test(hex.value.trim()) ? hex.value.trim() : color.value;
      var marcado = form.querySelector('[name=icono]:checked');
      P.$$('.muestra-color', form).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-color').toLowerCase() === c.toLowerCase())); });
      var vista = form.querySelector('.vista-pin');
      if (vista) P.poner(vista, pin(c, marcado ? marcado.value : 'proyecto'));
      var vn = form.querySelector('.vista-nombre');
      if (vn) vn.textContent = nombre.value.trim() || P.t('Nombre del tipo');
    };
    var fijarColor = function (c) { color.value = c; hex.value = c.toUpperCase(); pintar(); };
    color.addEventListener('input', function () { hex.value = color.value.toUpperCase(); pintar(); });
    hex.addEventListener('input', function () { var v = hex.value.trim(); if (RE_COLOR.test(v)) color.value = v.toLowerCase(); pintar(); });
    paleta.addEventListener('click', function (e) { var b = e.target.closest('[data-color]'); if (b) fijarColor(b.getAttribute('data-color')); });
    cajaIconos.addEventListener('change', pintar);
    nombre.addEventListener('input', pintar);
    fijarColor(valores.color || '#3B9EDB');
    var ic = form.querySelector('[name=icono][value="' + (valores.icono || 'proyecto') + '"]');
    if (ic) ic.checked = true;
    pintar();
    return { reiniciar: function () { form.reset(); fijarColor('#3B9EDB'); var p = form.querySelector('[name=icono][value=proyecto]'); if (p) p.checked = true; pintar(); } };
  }

  function datos(form) {
    var d = P.datosForm(form);
    var c = (d.color_texto || '').trim();
    return {
      nombre_es: d.nombre_es, nombre_en: d.nombre_en || '', color: RE_COLOR.test(c) ? c : d.color,
      icono: d.icono || 'proyecto', palabras: d.palabras || '',
    };
  }

  function pintarTipos() {
    P.poner(P.$('#tipos'), tipos.map(function (t) {
      var esRespaldo = t.clave === 'otro';
      var palabras = (t.palabras || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      return P.html`<article class="tarjeta tipo-proy ${t.activa ? '' : 'inactivo'}">
        <div class="fila" style="gap:12px;flex-wrap:nowrap;align-items:center">${pin(t.color, t.icono)}
          <div class="columna" style="gap:2px;min-width:0"><strong style="font-size:17px">${t.nombre_es}</strong>
            <span class="tenue" style="font-size:13px">${t.nombre_en} · ${t.color}</span></div>
          <span class="${t.activa ? 'chip-ok' : 'etq oscura'}" style="margin-left:auto;flex:none">${P.t(t.activa ? 'Activo' : 'Desactivado')}</span></div>
        <div class="fila" style="gap:6px">${palabras.length ? palabras.slice(0, 12).map(function (w) { return P.html`<span class="etq">${w}</span>`; }) : P.html`<span class="tenue pequeno">${P.t(esRespaldo ? 'Se usa cuando ningún otro tipo coincide.' : 'Sin palabras clave')}</span>`}${palabras.length > 12 ? P.html`<span class="tenue pequeno">+${palabras.length - 12}</span>` : ''}</div>
        <span class="tenue pequeno">${P.t(t.proyectos === 1 ? '1 proyecto con este tipo' : '{n} proyectos con este tipo', { n: t.proyectos })}</span>
        <div class="fila" style="gap:8px;margin-top:auto">
          <button type="button" class="btn2 chico" data-editar="${t.clave}">Editar</button>
          ${esRespaldo ? '' : P.html`<button type="button" class="btn2 chico" data-activar="${t.clave}">${P.t(t.activa ? 'Desactivar' : 'Activar')}</button>`}
          ${!esRespaldo && !t.proyectos ? P.html`<button type="button" class="enlace-boton peligro" data-borrar="${t.clave}">Borrar</button>` : ''}
        </div></article>`;
    }));
  }

  function cargar() {
    return P.get('/api/admin/categorias').then(function (d) {
      tipos = d.tipos;
      if (!iconos.length) { iconos = d.iconos.filter(function (k) { return P.GLIFOS_PIN.indexOf(k) >= 0; }); }
      pintarTipos();
      return d;
    }, function (e) { P.poner(P.$('#tipos'), P.html`<p class="mensaje error">${e.message}</p>`); });
  }
  function recargar() { return Promise.all([cargar(), P.cargarCategorias(true)]); }

  function guardar(t, cambios) {
    var cuerpo = Object.assign({ nombre_es: t.nombre_es, nombre_en: t.nombre_en, color: t.color, icono: t.icono, palabras: t.palabras, activa: !!t.activa }, cambios);
    return P.put('/api/admin/categorias/' + encodeURIComponent(t.clave), cuerpo);
  }

  function editar(clave) {
    var t = tipos.find(function (x) { return x.clave === clave; });
    if (!t) return;
    P.modal({
      titulo: P.t('Editar «{n}»', { n: t.nombre_es }),
      ancho: true,
      contenido: P.html`<form class="columna" id="form-editar-tipo" style="gap:14px" novalidate>
        <div class="form-tipo"><div class="rejilla-form">
          <label>Nombre<input type="text" name="nombre_es" maxlength="60" required value="${t.nombre_es}"></label>
          <label>Nombre en inglés<input type="text" name="nombre_en" maxlength="60" value="${t.nombre_en}"></label>
          <label>Color del punto<span class="fila" style="gap:8px;flex-wrap:nowrap"><input type="color" name="color" class="color-tipo" aria-label="${P.t('Color del punto')}"><input type="text" name="color_texto" maxlength="7" class="color-hex" aria-label="${P.t('Código del color')}" spellcheck="false"></span></label>
        </div><div class="vista-tipo"><span class="tenue pequeno">${P.t('Así se verá')}</span><div class="vista-pin"></div><strong class="vista-nombre"></strong></div></div>
        <div class="paleta-tipo" role="group" aria-label="${P.t('Colores sugeridos')}"></div>
        <fieldset class="iconos-tipo"><legend>${P.t('Dibujo dentro del punto')}</legend><div class="iconos-opciones"></div></fieldset>
        <label>${P.t('Palabras clave')} <span class="tenue">${P.t('(separadas por comas)')}</span><textarea name="palabras" rows="3" maxlength="400">${t.palabras || ''}</textarea></label>
        <div id="msg-editar-tipo" aria-live="polite"></div></form>`,
      botones: [{ texto: 'Cancelar' }, {
        texto: 'Guardar cambios', clase: 'btn', accion: function (cerrar, el, btn) {
          var f = P.$('#form-editar-tipo', el);
          P.accion(btn, function () {
            return guardar(t, datos(f)).then(function (r) { cerrar(); recargar(); return r; });
          }, { destino: P.$('#msg-editar-tipo', el) });
        },
      }],
    });
    prepararForm(P.$('#form-editar-tipo'), t);
  }

  P.pagina(function () {
    return cargar().then(function () {
      var form = P.$('#form-tipo');
      var controles = prepararForm(form);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var d = datos(form);
        var msg = P.$('#msg-tipo');
        P.poner(msg, '');
        if (!d.nombre_es || d.nombre_es.length < 3) { P.poner(msg, P.html`<div class="mensaje error" role="alert">${P.t('Escribe el nombre del tipo (mínimo 3 letras)')}</div>`); form.nombre_es.focus(); return; }
        P.accion(form.querySelector('button[type=submit]'), function () {
          return P.post('/api/admin/categorias', d).then(function (r) { controles.reiniciar(); recargar(); return r; });
        }, { destino: msg });
      });
      P.$('#tipos').addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        var clave = b.getAttribute('data-editar') || b.getAttribute('data-activar') || b.getAttribute('data-borrar');
        var t = tipos.find(function (x) { return x.clave === clave; });
        if (!t) return;
        if (b.hasAttribute('data-editar')) editar(clave);
        else if (b.hasAttribute('data-activar')) {
          P.accion(b, function () { return guardar(t, { activa: !t.activa }).then(function (r) { recargar(); return r; }); });
        } else if (b.hasAttribute('data-borrar')) {
          P.confirmar(P.t('¿Borrar «{n}»?', { n: t.nombre_es }), P.t('Ningún proyecto lo usa. Dejará de aparecer en los formularios y en la simbología.'), { si: 'Borrar', peligro: true }).then(function (si) {
            if (si) P.accion(b, function () { return P.del('/api/admin/categorias/' + encodeURIComponent(clave)).then(function (r) { recargar(); return r; }); });
          });
        }
      });
      P.$('#reclasificar').addEventListener('click', function () {
        var b = this;
        P.accion(b, function () { return P.post('/api/admin/categorias/reclasificar', {}).then(function (r) { cargar(); return r; }); });
      });
    });
  });
}());
