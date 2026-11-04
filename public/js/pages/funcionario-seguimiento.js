(function () {
  'use strict';
  var P = window.Prepar;
  var faseOk = false;
  var obras = [];
  var sel = null;
  var COLOR = { ganador: '#F4C861', en_ejecucion: '#F4C861', concluido: '#2A9D8F', inejecutable: '#E55E54' };

  function pestana(n) {
    P.$$('[data-pestana]').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-pestana') === n ? 'true' : 'false'); });
    P.$$('[data-panel]').forEach(function (s) { s.hidden = s.getAttribute('data-panel') !== n; });
  }
  function pintarObras() {
    P.poner(P.$('#obras'), obras.length ? obras.map(function (o) {
      var av = Math.min(100, Number(o.avance_porcentaje));
      return P.html`<button type="button" class="item-dict ${sel && sel.id === o.id ? 'elegido' : ''}" data-obra="${o.id}">
        <span class="tenue" style="font-size:12px">${o.folio} · ${o.unidad_territorial}</span><strong>${o.titulo}</strong>
        <span class="barra-obra"><span style="width:${av}%;background:${COLOR[o.estatus] || '#F4C861'}"></span></span>
        <span class="tenue" style="font-size:13px">${P.numero(av, 0)} % · ${P.textoEstatus(o.estatus)}${o.reportes_pendientes ? ' · ' + P.t('{n} reporte(s) pendiente(s)', { n: o.reportes_pendientes }) : ''}</span></button>`;
    }) : P.html`<p class="vacio">No hay proyectos ganadores en tu alcaldía todavía</p>`);
  }
  function pintarPanel() {
    var pn = P.$('#panel-avance');
    pn.hidden = !sel;
    if (!sel) return;
    var av = Number(sel.avance_porcentaje);
    P.poner(pn, P.html`<h2 class="h" style="margin:0;font-size:22px">${sel.titulo}</h2>
      <form class="columna" id="form-avance" style="gap:14px" novalidate>
        <label>${P.t('Porcentaje de avance:')} <output id="av-num" class="monto-avance">${P.numero(av, 0)} %</output>
          <input type="range" name="porcentaje" min="0" max="100" step="5" value="${av}" ${faseOk ? '' : P.seguro('disabled')}></label>
        <div class="fila arriba" style="gap:12px">
          <label style="flex:1 1 180px">Monto ejercido<input type="number" name="monto_ejercido" min="0" step="0.01" value="${Number(sel.monto_ejercido)}" ${faseOk ? '' : P.seguro('disabled')}><span class="tenue" style="font-weight:400;font-size:13px">${P.t('Asignado')}: ${P.dinero(sel.presupuesto_asignado)}</span></label>
          <label style="flex:1 1 180px">Estatus<select name="estatus" ${faseOk ? '' : P.seguro('disabled')}>${['ganador', 'en_ejecucion', 'concluido', 'inejecutable'].map(function (e) { return P.html`<option value="${e}" ${e === sel.estatus ? P.seguro('selected') : ''}>${P.textoEstatus(e)}</option>`; })}</select></label>
        </div>
        <label>Nota para los vecinos <span class="opcional">(opcional)</span><textarea name="nota" rows="2" maxlength="250" placeholder="Ej.: se terminó la colocación de gradas" ${faseOk ? '' : P.seguro('disabled')}></textarea></label>
        <label data-just hidden>Justificación de por qué es inejecutable<textarea name="justificacion_inejecutable" maxlength="500" rows="3"></textarea></label>
        ${sel.ultima_nota ? P.html`<span class="pequeno texto-2">${P.t('Última nota')} (${P.fecha(sel.ultimo_avance)}): ${sel.ultima_nota}</span>` : ''}
        <div class="fila" style="gap:10px"><button type="submit" class="btn" ${faseOk ? '' : P.seguro('disabled')}>Guardar avance</button><span id="msg-av" aria-live="polite"></span></div>
      </form>`);
  }
  function elegir(id) {
    sel = obras.find(function (o) { return String(o.id) === String(id); }) || null;
    pintarObras();
    pintarPanel();
  }
  function cargarObras() {
    return P.get('/api/func/seguimiento').then(function (d) {
      faseOk = !!(d.ciclo && d.ciclo.fase_orden >= 7);
      P.poner(P.$('#estado-seg'), !d.ciclo ? P.html`<div class="mensaje info">No hay un ciclo activo.</div>`
        : (!faseOk ? P.html`<div class="mensaje info">El avance se registra a partir de la fase de Ejecución y Seguimiento.</div>` : ''));
      obras = d.proyectos;
      var antes = sel && sel.id;
      sel = null;
      if (obras.length) elegir(antes && obras.some(function (o) { return o.id === antes; }) ? antes : obras[0].id);
      else { pintarObras(); pintarPanel(); }
    }, function (e) { P.poner(P.$('#estado-seg'), P.html`<p class="mensaje error">${e.message}</p>`); });
  }
  function contarPendientes() {
    return P.get('/api/func/reportes?estatus=pendiente').then(function (l) { P.$('[data-n="reportes"]').textContent = l.length; }, function () {});
  }
  function cargarReportes() {
    contarPendientes();
    return P.get('/api/func/reportes' + P.qs({ estatus: P.$('#f-rep').value })).then(function (lista) {
      P.poner(P.$('#reportes'), lista.length ? lista.map(function (r) {
        var irr = r.tipo === 'irregularidad';
        return P.html`<article class="tarjeta reporte-maq">
          <div class="foto-rep">${r.fotos.length ? P.html`<a href="${P.img(r.fotos[0])}" target="_blank" rel="noopener"><img src="${P.img(r.fotos[0], true)}" alt="${P.t('Foto del reporte')}" loading="lazy"></a>${r.fotos.length > 1 ? P.html`<span class="mas-fotos">+${r.fotos.length - 1}</span>` : ''}` : P.t('Sin foto')}</div>
          <div class="columna" style="padding:16px;gap:8px;min-width:0">
            <div class="fila" style="gap:8px"><span class="etq ${irr ? 'error' : 'info'}">${P.t(irr ? 'Irregularidad' : 'Avance')}</span><span class="tenue" style="font-size:13px">${r.autor} · ${P.fecha(r.creado_en)} · ${r.proyecto}</span></div>
            <span class="texto" style="line-height:1.5">${r.descripcion}</span>
            ${r.estatus === 'pendiente' ? P.html`<div class="columna" style="gap:8px"><textarea rows="2" maxlength="250" data-resp="${r.id}" aria-label="${P.t('Respuesta al vecino')}" placeholder="${P.t('Escribe la respuesta para el vecino (obligatoria para marcar como atendido)')}"></textarea>
              <div class="fila" style="gap:8px"><button type="button" class="btn" data-atender="${r.id}">Marcar como atendido</button><button type="button" class="btn2" data-eliminar="${r.id}">Eliminar por falso</button></div></div>`
              : P.html`<span class="ok-texto" style="font-weight:700">✓ ${P.t('Atendido')}</span>${r.respuesta ? P.html`<div class="respuesta-func"><strong>${P.t('Respuesta')}:</strong> ${r.respuesta}</div>` : ''}`}
          </div></article>`;
      }) : P.html`<p class="vacio">No hay reportes con este filtro</p>`);
    }, function (e) { P.poner(P.$('#reportes'), P.html`<p class="mensaje error">${e.message}</p>`); });
  }

  P.pagina(function (ctx) {
    if (ctx.usuario.funciones.indexOf('seguimiento') < 0) {
      P.poner(P.$('#estado-seg'), P.html`<div class="mensaje alerta">No tienes asignada la función de Seguimiento.</div>`);
      P.$$('[data-panel]').forEach(function (s) { s.hidden = true; });
      return null;
    }
    P.$$('[data-pestana]').forEach(function (b) { b.addEventListener('click', function () { pestana(b.getAttribute('data-pestana')); }); });
    if (location.hash === '#reportes') pestana('reportes');
    P.$('#obras').addEventListener('click', function (e) { var b = e.target.closest('[data-obra]'); if (b) elegir(b.getAttribute('data-obra')); });
    var pn = P.$('#panel-avance');
    pn.addEventListener('input', function (e) {
      if (e.target.name === 'porcentaje') P.$('#av-num').textContent = P.numero(Number(e.target.value), 0) + ' %';
    });
    pn.addEventListener('change', function (e) {
      if (e.target.name !== 'estatus') return;
      var f = e.target.form;
      P.$('[data-just]', f).hidden = e.target.value !== 'inejecutable';
      if (e.target.value === 'concluido') { f.porcentaje.value = 100; P.$('#av-num').textContent = '100 %'; }
    });
    pn.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      var d = P.datosForm(f);
      var pct = Number(d.porcentaje);
      var err = !(Number(d.monto_ejercido) >= 0) || d.monto_ejercido === '' ? 'Indica el monto ejercido'
        : (d.estatus === 'concluido' && pct < 100 ? 'Un proyecto concluido debe tener 100 % de avance'
          : (d.estatus === 'inejecutable' && Array.from(d.justificacion_inejecutable || '').length < 10 ? 'Escribe la justificación (al menos 10 caracteres)' : null));
      if (err) { P.poner(P.$('#msg-av'), P.html`<span class="error-campo">${P.t(err)}</span>`); return; }
      if (Number(d.monto_ejercido) > Number(sel.presupuesto_asignado)) P.aviso('Aviso: el monto ejercido supera el presupuesto asignado', 'error');
      var id = sel.id;
      P.accion(f.querySelector('[type=submit]'), function () {
        return P.post('/api/func/seguimiento/' + id + '/avance', {
          porcentaje: pct, monto_ejercido: Number(d.monto_ejercido), estatus: d.estatus, nota: d.nota || null,
          justificacion_inejecutable: d.estatus === 'inejecutable' ? d.justificacion_inejecutable : null,
        }).then(function () {
          return cargarObras().then(function () {
            P.poner(P.$('#msg-av'), P.html`<span role="status" class="ok-texto" style="font-weight:600">✓ ${P.t('Guardado. Los vecinos ya ven el nuevo avance en el mapa.')}</span>`);
            return null;
          });
        });
      }, { destino: P.$('#msg-av') });
    });
    P.$('#reportes').addEventListener('click', function (e) {
      var a = e.target.closest('[data-atender]');
      var x = e.target.closest('[data-eliminar]');
      if (a) {
        var id = a.getAttribute('data-atender');
        var t = P.$('[data-resp="' + id + '"]').value.trim();
        if (Array.from(t).length < 5) { P.aviso('Escribe la respuesta para el vecino (al menos 5 caracteres)', 'error'); P.$('[data-resp="' + id + '"]').focus(); return; }
        P.accion(a, function () { return P.post('/api/func/reportes/' + id, { accion: 'atender', texto: t }).then(function (r) { cargarReportes(); cargarObras(); P.actualizarCuentas(); return r; }); });
      } else if (x) {
        var idx = x.getAttribute('data-eliminar');
        P.pedirTexto(P.t('Eliminar reporte'), P.t('Motivo de la eliminación'), { max: 250, min: 5, si: 'Eliminar', peligro: true }).then(function (m) {
          if (m) P.accion(x, function () { return P.post('/api/func/reportes/' + idx, { accion: 'eliminar', texto: m }).then(function (r) { cargarReportes(); cargarObras(); P.actualizarCuentas(); return r; }); });
        });
      }
    });
    P.$('#f-rep').addEventListener('change', cargarReportes);
    return Promise.all([cargarObras(), cargarReportes()]);
  });
}());
