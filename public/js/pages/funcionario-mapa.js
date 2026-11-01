(function () {
  'use strict';
  var P = window.Prepar;
  var u = null;
  var mapa = null;
  var simbologia = { poner: function () {} };
  var capa = null;
  var lista = [];
  var sel = null;
  var punto = null;
  var moviendo = false;
  var EST = {
    ubicado: ['Ubicación correcta', 'ok-texto', '#76BDD7'],
    corregido: ['Ubicación corregida', 'ok-texto', '#2A9D8F'],
    pendiente: ['Ubicación pendiente', 'alerta-texto', '#F4C861'],
    no_ubicado: ['⚠ Sin ubicar en el mapa', 'error-texto', '#E55E54'],
  };

  function pintarLista() {
    P.poner(P.$('#lista-ub'), lista.length ? lista.map(function (p) {
      var e = EST[p.estado_ubicacion] || EST.pendiente;
      return P.html`<button type="button" class="item-dict ${sel && sel.id === p.id ? 'elegido' : ''}" data-proyecto="${p.id}">
        <span class="tenue" style="font-size:12px">${p.folio} · ${p.unidad_territorial}</span><strong>${p.titulo}</strong>
        <span class="${e[1]}" style="font-size:13px;font-weight:700">${P.t(e[0])}</span></button>`;
    }) : P.html`<p class="vacio">No hay proyectos registrados en tu alcaldía.</p>`);
  }
  function pintarMapa() {
    if (!capa) return;
    capa.clearLayers();
    lista.forEach(function (p) {
      var esSel = sel && sel.id === p.id;
      var lat = esSel && punto ? punto.latitud : p.latitud;
      var lng = esSel && punto ? punto.longitud : p.longitud;
      if (lat === null || lat === undefined) return;
      var e = EST[p.estado_ubicacion] || EST.pendiente;
      var m = window.L.marker([Number(lat), Number(lng)], { icon: P.iconoPin(P.colorCategoria(p), esSel, P.glifoCategoria(p)), title: p.titulo + ' · ' + P.t(e[0]), alt: p.titulo, zIndexOffset: esSel ? 1000 : 0, draggable: esSel && moviendo });
      m.on('click', function () { if (!moviendo) elegir(p.id); });
      if (esSel) m.on('dragend', function (ev) { var ll = ev.target.getLatLng(); colocar(ll.lat, ll.lng); });
      m.addTo(capa);
    });
  }
  function pista() {
    var t = P.$('#pista-ub');
    if (!sel) { t.textContent = ''; return; }
    if (moviendo) { t.textContent = P.t('Toca el mapa o arrastra el punto para moverlo'); t.className = 'alerta-texto'; }
    else if (punto) { t.textContent = P.t('Punto nuevo colocado · falta guardar'); t.className = 'alerta-texto'; }
    else t.textContent = '';
    P.$('#modo-mover').textContent = P.t(moviendo ? 'Listo, dejar de mover' : 'Cambiar ubicación en el mapa');
    P.$('#modo-mover').setAttribute('aria-pressed', moviendo ? 'true' : 'false');
    P.$('#mapa-func').classList.toggle('moviendo', moviendo);
  }
  function llenarForm() {
    var f = P.$('#form-ub');
    f.calle.value = sel ? sel.calle || '' : '';
    f.numero.value = sel ? sel.numero || '' : '';
    f.referencias.value = sel ? sel.referencias || '' : '';
    P.$$('input, button', f).forEach(function (x) { x.disabled = !sel; });
  }
  function elegir(id) {
    sel = lista.find(function (x) { return String(x.id) === String(id); }) || null;
    punto = null;
    moviendo = false;
    P.poner(P.$('#msg-ub'), '');
    pintarLista();
    llenarForm();
    pintarMapa();
    pista();
    if (mapa && sel) {
      var lat = sel.latitud !== null ? sel.latitud : sel.ut_latitud;
      var lng = sel.longitud !== null ? sel.longitud : sel.ut_longitud;
      if (lat !== null && lat !== undefined) mapa.setView([Number(lat), Number(lng)], 16);
    }
  }
  function colocar(lat, lng) {
    if (lat < 18.9 || lat > 19.8 || lng < -99.5 || lng > -98.8) { P.aviso('El punto debe estar dentro de la Ciudad de México', 'error'); return; }
    punto = { latitud: Number(lat.toFixed(6)), longitud: Number(lng.toFixed(6)) };
    pintarMapa();
    pista();
  }
  function cargar() {
    return P.get('/api/func/ubicaciones').then(function (d) {
      lista = d;
      var ubicados = lista.filter(function (x) { return x.latitud !== null; });
      simbologia.poner([P.filasCategorias(ubicados.length ? ubicados : null)]);
      var antes = sel && sel.id;
      sel = null;
      if (antes) elegir(antes);
      else if (lista.length) elegir((lista.find(function (x) { return x.estado_ubicacion === 'no_ubicado'; }) || lista[0]).id);
      else { pintarLista(); llenarForm(); }
      if (mapa && !antes) {
        var pts = lista.filter(function (x) { return x.latitud !== null; }).map(function (x) { return [Number(x.latitud), Number(x.longitud)]; });
        if (pts.length > 1 && !(sel && sel.latitud !== null)) mapa.fitBounds(pts, { maxZoom: 15, padding: [40, 40] });
      }
    }, function (e) { P.poner(P.$('#lista-ub'), P.html`<p class="mensaje error">${e.message}</p>`); });
  }

  P.pagina(function (ctx) {
    u = ctx.usuario;
    mapa = P.mapa(P.$('#mapa-func'), { zoom: 13 });
    if (mapa) {
      capa = window.L.layerGroup().addTo(mapa);
      simbologia = P.simbologia(mapa, [P.filasCategorias()]);
      mapa.on('click', function (e) { if (moviendo && sel) colocar(e.latlng.lat, e.latlng.lng); });
      var alc = ctx.usuario.alcaldiaId;
      P.catalogos().then(function (cat) {
        var a = cat.alcaldias.find(function (x) { return x.id === alc; });
        if (a && a.latitud && !sel) mapa.setView([Number(a.latitud), Number(a.longitud)], 13);
      });
    }
    P.$('#lista-ub').addEventListener('click', function (e) {
      var b = e.target.closest('[data-proyecto]');
      if (b) elegir(b.getAttribute('data-proyecto'));
    });
    P.$('#modo-mover').addEventListener('click', function () {
      if (!sel) { P.aviso('Elige primero un proyecto de la lista', 'error'); return; }
      moviendo = !moviendo;
      pintarMapa();
      pista();
    });
    var puedeModerar = u.funciones.indexOf('moderacion') >= 0;
    var oc = P.$('#ocultar-mapa');
    if (!puedeModerar) { oc.disabled = true; oc.title = P.t('Necesitas la función de Moderación'); }
    oc.addEventListener('click', function () {
      if (!sel) return;
      P.pedirTexto(P.t('Ocultar del mapa público'), P.t('Motivo (se guarda en la bitácora y se notifica al proponente)'), { max: 250, min: 3, si: 'Ocultar', peligro: true }).then(function (motivo) {
        if (motivo === null) return;
        P.accion(oc, function () {
          return P.post('/api/func/moderacion', { tipo_objeto: 'proyecto', objeto_id: sel.id, accion: 'ocultar', motivo: motivo }).then(function (r) { sel = null; return cargar().then(function () { return r; }); });
        });
      });
    });
    P.$('#deshacer-ub').addEventListener('click', function () { if (sel) elegir(sel.id); });
    P.$('#form-ub').addEventListener('submit', function (e) {
      e.preventDefault();
      if (!sel) return;
      var d = P.datosForm(e.target);
      if (Array.from(d.calle).length < 2) { P.poner(P.$('#msg-ub'), P.html`<span class="error-campo">${P.t('Escribe la calle')}</span>`); return; }
      var cambioDir = d.calle !== (sel.calle || '') || (d.numero || '') !== (sel.numero || '');
      var coords = punto || (!cambioDir && sel.latitud !== null ? { latitud: Number(sel.latitud), longitud: Number(sel.longitud) } : null);
      P.accion(P.$('#guardar-ub'), function () {
        return P.put('/api/func/ubicaciones/' + sel.id, { calle: d.calle, numero: d.numero || null, referencias: d.referencias || null, latitud: coords ? coords.latitud : null, longitud: coords ? coords.longitud : null })
          .then(function (r) {
            moviendo = false; punto = null;
            P.poner(P.$('#msg-ub'), P.html`<span role="status" class="${r.ubicado ? 'ok-texto' : 'alerta-texto'}" style="font-weight:600">${r.ubicado ? '✓ ' + P.t('Guardado. Quedó registrado en la bitácora.') : P.t(r.mensaje)}</span>`);
            P.actualizarCuentas();
            return cargar().then(function () { return null; });
          });
      }, { destino: P.$('#msg-ub') });
    });
    llenarForm();
    return cargar();
  });
}());
