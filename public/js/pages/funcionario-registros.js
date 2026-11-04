(function () {
  'use strict';
  var P = window.Prepar;
  var u = null;
  var registros = [];

  function pestana(n) {
    P.$$('[data-pestana]').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-pestana') === n ? 'true' : 'false'); });
    P.$$('[data-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== n; });
    if (n === 'moderacion') cargarModeracion();
  }
  function cuenta(n, v) { var el = P.$('[data-n="' + n + '"]'); if (el) el.textContent = v; }

  function chips(p) {
    var ok = function (t) { return P.html`<span class="chip-ok">✓ ${P.t(t)}</span>`; };
    var no = function (t) { return P.html`<span class="chip-no">✗ ${P.t(t)}</span>`; };
    var ub = ['ubicado', 'corregido'].indexOf(p.estado_ubicacion) >= 0;
    var costo = Number(p.costo_estimado);
    return [
      ub ? ok('Dirección ubicada') : no('Dirección no encontrada'),
      !(costo > 0) ? no('Falta costo') : (p.presupuesto_asignado && costo > Number(p.presupuesto_asignado) ? no('Costo mayor al presupuesto') : ok('Costo')),
      p.rubro ? ok('Rubro') : no('Falta rubro'),
      Array.from(p.descripcion || '').length >= 20 ? ok('Descripción') : no('Descripción muy corta'),
    ];
  }

  function cargarRegistros() {
    var cont = P.$('#registros');
    if (u.funciones.indexOf('revision_registros') < 0) { P.poner(cont, P.html`<div class="mensaje alerta">No tienes asignada la función de Revisión de registros.</div>`); return Promise.resolve(); }
    P.poner(cont, P.html`<div class="cargando-bloque">Cargando…</div>`);
    return P.get('/api/func/registros' + (P.$('#ver-todos').checked ? '?estatus=todos' : '')).then(function (lista) {
      registros = lista;
      cuenta('registros', lista.filter(function (p) { return p.estatus === 'registrado'; }).length);
      P.poner(cont, lista.length ? lista.map(function (p) {
        var pendiente = p.estatus === 'registrado';
        var editado = p.correccion && p.actualizado_en > p.correccion_en;
        return P.html`<article class="tarjeta fila-registro">
          <div class="columna" style="flex:2 1 260px;min-width:0;gap:4px"><span class="tenue" style="font-size:13px">${p.folio} · ${p.unidad_territorial}</span>
            <strong style="font-size:17px">${p.titulo}</strong>
            <div class="fila" style="gap:8px;margin-top:4px">${chips(p)}</div>
            ${p.correccion ? P.html`<span class="alerta-texto" style="font-size:13px;margin-top:4px">↺ ${P.t('Corrección solicitada')}: ${p.correccion}${editado ? ' · ' + P.t('el proponente ya editó el proyecto') : ''}</span>` : ''}
          </div>
          <div class="fila acciones-registro" style="gap:8px;justify-content:flex-end">
            <button type="button" class="enlace-boton" data-detalle="${p.id}">Ver detalle</button>
            ${pendiente ? P.html`${p.correccion ? '' : P.html`<button type="button" class="btn2" data-correccion="${p.id}">Pedir corrección</button>`}
              <button type="button" class="btn" data-completo="${p.id}">Enviar a dictaminación</button>`
              : P.html`<span class="ok-texto" style="font-weight:700">✓ ${P.textoEstatus(p.estatus)}</span>`}
          </div></article>`;
      }) : P.html`<p class="vacio">No hay registros pendientes de revisión</p>`);
    }, function (e) { P.poner(cont, P.html`<p class="mensaje error">${e.message}</p>`); });
  }

  function detalle(id) {
    var p = registros.find(function (x) { return String(x.id) === String(id); });
    if (!p) return;
    P.modal({
      titulo: p.titulo, ancho: true,
      contenido: P.html`<span class="tenue pequeno">${p.folio} · ${p.unidad_territorial} · ${P.t('Registrado el {f}', { f: P.fechaHora(p.creado_en) })} · ${P.t('Propone')}: ${p.proponente}</span>
        ${p.imagen_uuid ? P.html`<img class="miniatura" src="${P.img(p.imagen_uuid)}" alt="Imagen del proyecto">` : ''}
        <p class="texto-2" style="white-space:pre-wrap">${p.descripcion}</p>
        <div class="columna pequeno" style="gap:4px"><span><strong>${P.t('Rubro')}:</strong> ${P.t(p.rubro)}</span>
          <span><strong>${P.t('Costo')}:</strong> ${P.dinero(p.costo_estimado)} · <strong>${P.t('Presupuesto de la colonia')}:</strong> ${P.dinero(p.presupuesto_asignado)}</span>
          <span><strong>${P.t('Dirección')}:</strong> ${p.calle} ${p.numero || 's/n'}${p.codigo_postal ? ', CP ' + p.codigo_postal : ''}${p.referencias ? ' · ' + p.referencias : ''} ${P.estatus(p.estado_ubicacion)}</span></div>`,
      botones: [
        { texto: 'Ocultar o eliminar', clase: 'btn-peligro', accion: function (cerrar) { cerrar(); moderar('proyecto', p.id, 'ocultar', null); } },
        { texto: 'Cerrar', clase: 'btn2' },
      ],
    });
  }

  function moderar(tipo, id, accion, boton) {
    var titulos = { ocultar: 'Ocultar contenido', eliminar: 'Eliminar y notificar', restaurar: 'Restaurar contenido' };
    return P.pedirTexto(P.t(titulos[accion]), P.t('Motivo (se guarda en la bitácora y se notifica al autor)'), { max: 250, min: 3, si: accion === 'eliminar' ? 'Eliminar' : (accion === 'ocultar' ? 'Ocultar' : 'Restaurar'), peligro: accion !== 'restaurar' }).then(function (motivo) {
      if (motivo === null) return null;
      return P.accion(boton, function () {
        return P.post('/api/func/moderacion', { tipo_objeto: tipo, objeto_id: Number(id), accion: accion, motivo: motivo }).then(function (r) { cargarModeracion(); cargarRegistros(); P.actualizarCuentas(); return r; });
      });
    });
  }

  function cargarModeracion() {
    var cont = P.$('#moderacion');
    if (u.funciones.indexOf('moderacion') < 0) { P.poner(cont, P.html`<div class="mensaje alerta">No tienes asignada la función de Moderación.</div>`); return; }
    var f = P.datosForm(P.$('#filtros-mod'));
    P.poner(cont, P.html`<div class="cargando-bloque">Cargando…</div>`);
    P.get('/api/func/moderacion' + P.qs(f)).then(function (lista) {
      if (f.tipo === 'idea' && f.estado === 'visible' && !f.q) cuenta('moderacion', lista.length);
      P.poner(cont, lista.length ? lista.map(function (x) {
        return P.html`<article class="tarjeta columna" style="gap:10px;padding:18px;border-radius:14px">
          <div class="fila entre"><span class="tenue" style="font-size:13px">${x.autor} · ${x.unidad_territorial}${x.contexto ? P.html` · ${P.t('en')} «${P.t(x.contexto)}»` : ''} · ${P.fechaHora(x.fecha)}</span>${P.estatus(x.estado)}</div>
          <p class="texto-mod">${x.texto}</p>
          <div class="fila" style="gap:8px">${x.estado === 'visible' ? P.html`<button type="button" class="btn2" data-mod="ocultar" data-id="${x.id}">Ocultar</button>` : P.html`<button type="button" class="btn2" data-mod="restaurar" data-id="${x.id}">Mantener publicación</button>`}
            ${x.estado !== 'eliminado' ? P.html`<button type="button" class="btn btn-rojo" data-mod="eliminar" data-id="${x.id}">Eliminar y notificar</button>` : ''}</div></article>`;
      }) : P.html`<p class="vacio">No hay contenido con estos filtros</p>`);
    }, function (e) { P.poner(cont, P.html`<p class="mensaje error">${e.message}</p>`); });
  }

  if (location.hash === '#ubicaciones') { location.replace('/funcionario/mapa.html'); return; }
  P.pagina(function (ctx) {
    u = ctx.usuario;
    P.$$('[data-pestana]').forEach(function (b) { b.addEventListener('click', function () { pestana(b.getAttribute('data-pestana')); }); });
    P.$('#ver-todos').addEventListener('change', cargarRegistros);
    P.$('#filtros-mod').addEventListener('submit', function (e) { e.preventDefault(); cargarModeracion(); });
    P.$('#filtros-mod').addEventListener('change', cargarModeracion);
    P.$('#filtros-mod').addEventListener('input', P.debounce(function (e) { if (e.target.name === 'q') cargarModeracion(); }, 400));
    document.addEventListener('click', function (e) {
      var dt = e.target.closest('[data-detalle]');
      if (dt) { detalle(dt.getAttribute('data-detalle')); return; }
      var c = e.target.closest('[data-completo]');
      if (c) {
        P.confirmar(P.t('¿El registro está completo?'), P.t('El proyecto pasará a dictaminación y se notificará al proponente.'), { si: 'Enviar a dictaminación' }).then(function (ok) {
          if (ok) P.accion(c, function () { return P.post('/api/func/registros/' + c.getAttribute('data-completo') + '/revision', { resultado: 'completo' }).then(function (r) { cargarRegistros(); P.actualizarCuentas(); return r; }); });
        });
        return;
      }
      var k = e.target.closest('[data-correccion]');
      if (k) {
        P.pedirTexto(P.t('Pedir corrección'), P.t('¿Qué debe corregir el proponente? Solo se puede pedir una vez.'), { max: 250, min: 5, si: 'Enviar solicitud' }).then(function (t) {
          if (t) P.accion(k, function () { return P.post('/api/func/registros/' + k.getAttribute('data-correccion') + '/revision', { resultado: 'correccion_solicitada', observacion: t }).then(function (r) { cargarRegistros(); return r; }); });
        });
        return;
      }
      var m = e.target.closest('[data-mod]');
      if (m) moderar(P.datosForm(P.$('#filtros-mod')).tipo, m.getAttribute('data-id'), m.getAttribute('data-mod'), m);
    });
    if (u.funciones.indexOf('moderacion') >= 0) P.get('/api/func/moderacion?tipo=idea&estado=visible').then(function (l) { cuenta('moderacion', l.length); }).catch(function () { return null; });
    if (location.hash === '#moderacion') pestana('moderacion');
    return cargarRegistros();
  });
}());
