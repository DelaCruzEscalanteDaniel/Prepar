(function () {
  'use strict';
  var P = window.Prepar;
  var criterios = [];
  var lista = [];
  var actual = null;
  var marcas = {};
  var puedeEmitir = false;
  var CHECK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>';

  function corto(n) { return P.dinero(n).replace(/\.00$/, ''); }
  function estadoDe(p) {
    if (p.emitido_en) return { t: P.t('Dictaminado: {r}', { r: P.textoEstatus(p.resultado) }), c: 'ok-texto' };
    if (p.dictamen_id) return { t: P.t('Borrador guardado'), c: 'info-texto' };
    return { t: P.t('Pendiente'), c: 'alerta-texto' };
  }

  function pintarLista() {
    var f = P.$('#f-unidad').value;
    var vis = lista.filter(function (p) { return !f || p.unidad_territorial === f; });
    P.poner(P.$('#lista-dict'), vis.length ? vis.map(function (p) {
      var e = estadoDe(p);
      return P.html`<button type="button" class="item-dict ${actual && actual.id === p.id ? 'elegido' : ''} ${p.emitido_en ? 'dictaminado' : ''}" data-proyecto="${p.id}">
        <span class="tenue" style="font-size:12px">${p.folio} · ${p.unidad_territorial}</span><strong>${p.titulo}</strong>
        <span class="${e.c}" style="font-size:13px;font-weight:700">${e.t}</span></button>`;
    }) : P.html`<p class="vacio">No hay proyectos por dictaminar</p>`);
  }

  function cargar() {
    return P.get('/api/func/dictamenes').then(function (d) {
      puedeEmitir = !!(d.ciclo && d.ciclo.fase === 'dictaminacion');
      var est = P.$('#estado-dict');
      if (!d.ciclo) P.poner(est, P.html`<div class="mensaje info">No hay un ciclo activo.</div>`);
      else if (!puedeEmitir) P.poner(est, P.html`<div class="mensaje info">Los dictámenes se emiten en la fase de Dictaminación. Puedes consultar los proyectos, pero no emitir.</div>`);
      else P.poner(est, '');
      var vistos = {};
      lista = d.pendientes.concat(d.emitidos).filter(function (p) { if (vistos[p.id]) return false; vistos[p.id] = 1; return true; });
      var uts = Array.from(new Set(lista.map(function (p) { return p.unidad_territorial; }))).sort();
      var sel = P.$('#f-unidad');
      var antes = sel.value;
      P.poner(sel, P.html`<option value="">Todas</option>${uts.map(function (x) { return P.html`<option value="${x}">${x}</option>`; })}`);
      sel.value = uts.indexOf(antes) >= 0 ? antes : '';
      if (actual) actual = lista.find(function (x) { return x.id === actual.id; }) || null;
      if (!actual) actual = d.pendientes[0] || lista[0] || null;
      pintarLista();
      if (actual) abrir(actual.id);
      else P.poner(P.$('#panel-dictamen'), P.html`<p class="tenue" style="margin:0">No hay proyectos en dictaminación.</p>`);
    }, function (e) { P.poner(P.$('#lista-dict'), P.html`<p class="mensaje error">${e.message}</p>`); });
  }

  function resultado(m) { return criterios.every(function (c) { return m[c.id] !== false; }) ? 'viable' : 'no_viable'; }

  function abrir(id) {
    var p = lista.find(function (x) { return String(x.id) === String(id); });
    if (!p) return;
    actual = p;
    pintarLista();
    var caja = P.$('#panel-dictamen');
    var cab = P.html`<div><span class="tenue" style="font-size:13px">${p.folio} · ${p.unidad_territorial} · ${P.t(p.rubro)}</span>
        <h2 class="h2-maq" style="margin:4px 0 6px;font-size:24px">${p.titulo}</h2><p class="texto-2" style="margin:0;line-height:1.5;white-space:pre-wrap">${p.descripcion}</p></div>
      ${p.imagen_uuid ? P.html`<img class="miniatura" src="${P.img(p.imagen_uuid)}" alt="Imagen del proyecto">` : ''}
      <div class="fila" style="gap:10px;font-size:14px">
        <span class="pastilla ${Number(p.costo_estimado) > Number(p.presupuesto_asignado) ? 'mala' : ''}">${P.t('Costo')}: <strong>${corto(p.costo_estimado)}</strong></span>
        <span class="pastilla">${P.t('Presupuesto UT')}: <strong>${corto(p.presupuesto_asignado)}</strong></span>
        <span class="pastilla">${P.t('Dirección')}: ${p.calle} ${p.numero || 'S/N'}</span></div>`;
    if (p.emitido_en) {
      var v = p.resultado === 'viable';
      P.poner(caja, P.html`${cab}<div role="status" class="resultado-dict ${v ? 'si' : 'no'}" style="padding:18px">
        <strong class="h" style="font-size:22px">${P.t('Dictamen emitido: {r}', { r: P.textoEstatus(p.resultado) })}</strong>
        <span class="texto-2">${P.t('El proyecto cambió a estatus {r} y se notificó al proponente. El dictamen es definitivo.', { r: P.textoEstatus(p.resultado) })}</span>
        <span class="texto-2" style="font-size:14px"><strong>${P.t('Justificación')}:</strong> ${p.justificacion}</span></div>`);
      return;
    }
    if (!marcas[p.id]) {
      marcas[p.id] = {};
      criterios.forEach(function (c) {
        var prev = (p.criterios || []).find(function (x) { return x.criterio_id === c.id; });
        marcas[p.id][c.id] = prev ? !!prev.cumple : true;
      });
    }
    var m = marcas[p.id];
    var r = resultado(m);
    P.poner(caja, P.html`${cab}
      <div class="columna" style="gap:8px">
        <strong style="font-size:15px">Criterios de evaluación</strong>
        ${criterios.map(function (c) {
          var on = m[c.id] !== false;
          return P.html`<button type="button" class="criterio ${on ? 'si' : 'no'}" data-criterio="${c.id}" aria-pressed="${on ? 'true' : 'false'}" ${puedeEmitir ? '' : P.seguro('disabled')} title="${c.descripcion || ''}">
            <span class="caja-check">${P.seguro(CHECK)}</span><span>${P.nombre(c)}</span></button>`;
        })}
        <div class="resultado-dict ${r === 'viable' ? 'si' : 'no'}" style="font-weight:700">${P.t('Resultado: {r}', { r: P.textoEstatus(r) })}</div>
        <label>Justificación (obligatoria)<textarea id="justificacion" rows="3" maxlength="500" placeholder="${r === 'viable' ? P.t('Ej.: Cumple todos los criterios y su costo está dentro del presupuesto de la unidad territorial.') : P.t('Explica al proponente qué criterio no se cumple y por qué.')}">${p.justificacion || ''}</textarea></label>
        <div id="msg-dict"></div>
        <div class="fila" style="justify-content:flex-end;gap:10px">
          <button type="button" class="btn2" id="borrador" ${puedeEmitir ? '' : P.seguro('disabled')}>Guardar borrador</button>
          <button type="button" class="btn" id="emitir" ${puedeEmitir ? '' : P.seguro('disabled')}>Emitir dictamen</button></div>
      </div>`);
    P.$('#borrador').addEventListener('click', function (e) { enviar(false, e.currentTarget); });
    P.$('#emitir').addEventListener('click', function (e) { enviar(true, e.currentTarget); });
  }

  function enviar(emitir, boton) {
    var m = marcas[actual.id];
    var msg = P.$('#msg-dict');
    var just = P.$('#justificacion').value.trim();
    var r = resultado(m);
    var lista2 = criterios.map(function (c) { return { criterio_id: c.id, cumple: m[c.id] !== false, observacion: null }; });
    if (emitir && Array.from(just).length < 10) { P.poner(msg, P.html`<div class="mensaje error" role="alert">${P.t('Escribe una justificación de al menos 10 caracteres')}</div>`); return; }
    P.poner(msg, '');
    var mandar = function () {
      return P.accion(boton, function () {
        return P.post('/api/func/dictamenes/' + actual.id, { criterios: lista2, emitir: emitir, resultado: emitir ? r : null, justificacion: just || null })
          .then(function (x) { cargar(); P.actualizarCuentas(); return x; });
      }, { destino: msg });
    };
    if (!emitir) { mandar(); return; }
    P.confirmar(P.t('¿Emitir el dictamen?'), P.t('El dictamen "{r}" es definitivo: no podrá modificarse y se notificará al proponente.', { r: P.textoEstatus(r) }), { si: 'Emitir dictamen' })
      .then(function (ok) { if (ok) mandar(); });
  }

  P.pagina(function (ctx) {
    P.poner(P.$('#chip-fase'), P.chipFase(ctx.estado));
    P.$('#lista-dict').addEventListener('click', function (e) {
      var b = e.target.closest('[data-proyecto]');
      if (b) abrir(b.getAttribute('data-proyecto'));
    });
    P.$('#f-unidad').addEventListener('change', pintarLista);
    P.$('#panel-dictamen').addEventListener('click', function (e) {
      var b = e.target.closest('[data-criterio]');
      if (!b || b.disabled || !actual) return;
      var id = Number(b.getAttribute('data-criterio'));
      var just = P.$('#justificacion') ? P.$('#justificacion').value : '';
      marcas[actual.id][id] = marcas[actual.id][id] === false;
      abrir(actual.id);
      if (P.$('#justificacion')) P.$('#justificacion').value = just;
    });
    return P.catalogos().then(function (cat) { criterios = cat.criterios; return cargar(); });
  });
}());
