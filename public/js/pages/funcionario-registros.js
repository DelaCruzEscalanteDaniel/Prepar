(function () {
  'use strict';
  var P = window.Prepar;
  var u = null;
  var registros = [];
  var ubicaciones = [];
  var ubSel = null;
  var mapa = null;
  var pin = null;
  var punto = null;

  function pestana(n) {
    P.$$('[data-pestana]').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-pestana') === n ? 'true' : 'false'); });
    P.$$('[data-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== n; });
    if (n === 'moderacion') cargarModeracion();
    if (n === 'ubicaciones') { iniciarMapa(); setTimeout(function () { if (mapa) mapa.invalidateSize(); }, 60); }
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
          <span><strong>${P.t('Dirección')}:</strong> ${p.calle} ${p.numero || 's/n'}${p.referencias ? ' · ' + p.referencias : ''} ${P.estatus(p.estado_ubicacion)}</span></div>`,
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

  function iniciarMapa() {
    if (mapa) return;
    mapa = P.mapa(P.$('#mapa-ub'), { zoom: 14 });
    if (!mapa) return;
    mapa.on('click', function (e) { colocar(e.latlng.lat, e.latlng.lng); });
    P.simbologia(mapa, [{ titulo: '', filas: [
      { color: '#8A94A6', glifo: 'punto', texto: 'Punto del proyecto (su color es el de su tipo): arrástralo o toca el mapa para moverlo' },
    ] }], { abierta: true });
    if (ubSel) centrarEn(ubSel);
  }
  function colocar(lat, lng) {
    if (!ubSel) return;
    if (lat < 18.9 || lat > 19.8 || lng < -99.5 || lng > -98.8) { P.aviso('El punto debe estar dentro de la Ciudad de México', 'error'); return; }
    punto = { latitud: Number(lat.toFixed(6)), longitud: Number(lng.toFixed(6)) };
    if (pin) pin.setLatLng([lat, lng]);
    else if (mapa) pin = P.marcador(lat, lng, P.colorCategoria(ubSel), { draggable: true, glifo: P.glifoCategoria(ubSel), title: P.t('Ubicación del proyecto (arrástrala para moverla)') }).addTo(mapa).on('dragend', function (ev) { var ll = ev.target.getLatLng(); colocar(ll.lat, ll.lng); });
    P.$('#guardar-ub').disabled = false;
    pintarEstadoUb('Punto colocado · falta guardar', 'alerta-texto');
  }
  function centrarEn(p) {
    if (!mapa) return;
    var lat = p.latitud !== null ? Number(p.latitud) : (p.ut_latitud !== null ? Number(p.ut_latitud) : null);
    var lng = p.longitud !== null ? Number(p.longitud) : (p.ut_longitud !== null ? Number(p.ut_longitud) : null);
    if (lat !== null && lng !== null) mapa.setView([lat, lng], 16);
  }
  function pintarEstadoUb(t, clase) { var e = P.$('#estado-ub'); if (e) { e.textContent = P.t(t); e.className = clase; } }
  function elegirUbicacion(id) {
    ubSel = ubicaciones.find(function (x) { return String(x.id) === String(id); }) || null;
    punto = null;
    if (pin && mapa) { mapa.removeLayer(pin); pin = null; }
    P.$('#guardar-ub').disabled = true;
    var caja = P.$('#caja-ubicacion');
    if (!ubSel) { P.poner(caja, P.html`<p class="vacio">No hay ubicaciones por corregir.</p>`); return; }
    P.$('#texto-mapa-ub').textContent = P.t('O toca el mapa para colocar el punto exacto dentro de {u}:', { u: ubSel.unidad_territorial });
    P.poner(caja, P.html`${ubicaciones.length > 1 ? P.html`<label>Proyecto<select id="sel-ub">${ubicaciones.map(function (x) { return P.html`<option value="${x.id}" ${x.id === ubSel.id ? P.seguro('selected') : ''}>${x.folio} · ${x.titulo}</option>`; })}</select></label>` : ''}
      <span class="tenue" style="font-size:13px">${ubSel.folio} · ${ubSel.unidad_territorial}</span>
      <strong style="font-size:18px">${ubSel.titulo}</strong>
      <span id="estado-ub" class="${ubSel.estado_ubicacion === 'no_ubicado' ? 'error-texto' : 'alerta-texto'}" style="font-size:13px;font-weight:700">${ubSel.estado_ubicacion === 'no_ubicado' ? P.t('✗ El sistema no encontró la dirección') : P.t('Ubicación pendiente de revisar')}</span>
      <form id="form-ub" class="columna" style="gap:12px" novalidate>
        <label>Calle <span class="opcional">(hasta 100)</span><input type="text" name="calle" maxlength="100" value="${ubSel.calle || ''}" required></label>
        <label>Número <span class="opcional">(hasta 10)</span><input type="text" name="numero" maxlength="10" value="${ubSel.numero || ''}"></label>
        <label>Referencias <span class="opcional">(hasta 100)</span><input type="text" name="referencias" maxlength="100" value="${ubSel.referencias || ''}"></label>
        <button type="button" class="btn2" id="buscar-ub">Buscar dirección otra vez</button>
      </form>`);
    centrarEn(ubSel);
    var s = P.$('#sel-ub');
    if (s) s.addEventListener('change', function () { elegirUbicacion(s.value); });
    P.$('#buscar-ub').addEventListener('click', function (e) {
      var d = P.datosForm(P.$('#form-ub'));
      if (Array.from(d.calle).length < 2) { P.aviso('Escribe la calle', 'error'); return; }
      P.accion(e.currentTarget, function () {
        return P.post('/api/geocodificar', { direccion: d.calle + (d.numero ? ' ' + d.numero : '') + ', ' + ubSel.unidad_territorial + ', ' + (u.alcaldia || '') }).then(function (r) {
          if (r.encontrado) { colocar(r.latitud, r.longitud); if (mapa) mapa.setView([r.latitud, r.longitud], 17); pintarEstadoUb('✓ Dirección encontrada · falta guardar', 'ok-texto'); }
          else P.aviso('No encontramos la dirección. Toca el mapa para colocar el punto', 'error');
        });
      });
    });
  }
  function cargarUbicaciones() {
    return P.get('/api/func/ubicaciones').then(function (lista) {
      ubicaciones = lista.filter(function (x) { return ['no_ubicado', 'pendiente'].indexOf(x.estado_ubicacion) >= 0; });
      cuenta('ubicaciones', ubicaciones.length);
      elegirUbicacion(ubicaciones[0] && ubicaciones[0].id);
    }, function (e) { P.poner(P.$('#caja-ubicacion'), P.html`<p class="mensaje error">${e.message}</p>`); });
  }

  P.pagina(function (ctx) {
    u = ctx.usuario;
    P.$$('[data-pestana]').forEach(function (b) { b.addEventListener('click', function () { pestana(b.getAttribute('data-pestana')); }); });
    P.$('#ver-todos').addEventListener('change', cargarRegistros);
    P.$('#filtros-mod').addEventListener('submit', function (e) { e.preventDefault(); cargarModeracion(); });
    P.$('#filtros-mod').addEventListener('change', cargarModeracion);
    P.$('#filtros-mod').addEventListener('input', P.debounce(function (e) { if (e.target.name === 'q') cargarModeracion(); }, 400));
    P.$('#guardar-ub').addEventListener('click', function (e) {
      if (!ubSel || !punto) return;
      var d = P.datosForm(P.$('#form-ub'));
      if (Array.from(d.calle).length < 2) { P.aviso('Escribe la calle', 'error'); return; }
      P.accion(e.currentTarget, function () {
        return P.put('/api/func/ubicaciones/' + ubSel.id, { calle: d.calle, numero: d.numero || null, referencias: d.referencias || null, latitud: punto.latitud, longitud: punto.longitud })
          .then(function (r) { P.actualizarCuentas(); cargarUbicaciones(); cargarRegistros(); return r; });
      });
    });
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
    cargarUbicaciones();
    if (location.hash === '#moderacion') pestana('moderacion');
    else if (location.hash === '#ubicaciones') pestana('ubicaciones');
    return cargarRegistros();
  });
}());
