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
        <span class="tenue" style="font-size:13px">${o.alerta_gasto ? P.html`<span class="etq error">${P.t('Revisar gasto')}</span> ` : ''}${P.numero(av, 0)} % · ${P.textoEstatus(o.estatus)}${o.reportes_pendientes ? ' · ' + P.t('{n} reporte(s) pendiente(s)', { n: o.reportes_pendientes }) : ''}</span></button>`;
    }) : P.html`<p class="vacio">No hay proyectos ganadores en tu alcaldía todavía</p>`);
  }
  function nombreEtapa(e) { return P.idioma() === 'en' && e.nombre_en ? e.nombre_en : e.nombre_es; }
  function listaEtapas(o, editable) {
    var siguiente = o.etapas.find(function (e) { return !e.cumplida_en; });
    var abierta = editable && faseOk && o.estatus !== 'concluido' && o.estatus !== 'inejecutable';
    return P.html`<ol class="etapas-obra">${o.etapas.map(function (e) {
      var hecha = !!e.cumplida_en;
      var toca = !hecha && siguiente && siguiente.id === e.id;
      return P.html`<li class="${hecha ? 'hecha' : (toca ? 'siguiente' : 'pendiente')}">
        <span class="etapa-marca" aria-hidden="true">${hecha ? '✓' : e.orden}</span>
        <div class="columna" style="gap:4px;min-width:0;flex:1">
          <div class="fila entre" style="gap:8px"><strong>${nombreEtapa(e)}</strong><span class="etq">+${P.numero(e.peso, 0)} %</span></div>
          ${hecha ? P.html`<span class="pequeno texto-2">${P.t('Cumplida el {f}', { f: P.fecha(e.cumplida_en) })} · ${e.evidencia}</span>` : ''}
          ${toca && abierta ? P.html`<div class="columna" style="gap:8px;margin-top:4px">
            <textarea rows="2" maxlength="250" data-evidencia="${e.id}" aria-label="${P.t('Evidencia de la etapa')}" placeholder="${P.t('¿Qué se hizo? Ej.: se firmó el contrato con la empresa y se compró el material')}"></textarea>
            <div class="fila" style="gap:8px"><button type="button" class="btn" data-cumplir="${e.id}">Marcar como cumplida</button><span class="pequeno tenue">${P.t('Las etapas se cumplen en orden.')}</span></div></div>` : ''}
        </div></li>`;
    })}</ol>`;
  }
  function pintarPanel() {
    var pn = P.$('#panel-avance');
    pn.hidden = !sel;
    if (!sel) return;
    var av = Number(sel.avance_porcentaje);
    var fin = Number(sel.avance_financiero);
    P.poner(pn, P.html`<h2 class="h" style="margin:0;font-size:22px">${sel.titulo}</h2>
      <div class="columna" style="gap:10px">
        <div class="fila entre" style="gap:8px"><span>${P.t('Avance de la obra')}</span><strong class="monto-avance" style="margin:0" data-contar="${av}" data-sufijo=" %">${P.numero(av, 0)} %</strong></div>
        <span class="barra-obra grande"><span class="crecer" style="width:${Math.min(100, av)}%;background:${COLOR[sel.estatus] || '#F4C861'}"></span></span>
        <div class="fila entre pequeno texto-2" style="gap:8px"><span>${P.t('Dinero ejercido')}</span><span>${P.numero(fin, 0)} %</span></div>
        <span class="barra-obra"><span class="crecer" style="width:${Math.min(100, fin)}%;background:var(--tenue)"></span></span>
        ${sel.alerta_gasto ? P.html`<div class="mensaje alerta" role="status">${P.t('Alerta: ya se ejerció el {g} % del dinero, pero la obra va en {a} %. Revisa que el avance esté al día.', { g: P.numero(fin, 0), a: P.numero(av, 0) })}</div>` : ''}
        <p class="pequeno tenue" style="margin:0">${P.t('El avance se calcula solo con las etapas cumplidas. Cada etapa tiene un peso fijo según el rubro del proyecto.')}</p>
      </div>
      <h3 class="h" style="margin:4px 0 0;font-size:17px">${P.t('Etapas de la obra')}</h3>
      ${listaEtapas(sel, true)}
      <form class="columna" id="form-avance" style="gap:14px" novalidate>
        <div class="fila arriba" style="gap:12px">
          <label style="flex:1 1 180px">Monto ejercido<input type="number" name="monto_ejercido" min="0" step="0.01" value="${Number(sel.monto_ejercido)}" ${faseOk ? '' : P.seguro('disabled')}><span class="tenue" style="font-weight:400;font-size:13px">${P.t('Asignado')}: ${P.dinero(sel.presupuesto_asignado)}</span></label>
          <label style="flex:1 1 180px">Estatus<select name="estatus" ${faseOk ? '' : P.seguro('disabled')}>${['ganador', 'en_ejecucion', 'concluido', 'inejecutable'].map(function (e) { return P.html`<option value="${e}" ${e === sel.estatus ? P.seguro('selected') : ''} ${e === 'concluido' && av < 100 && sel.estatus !== 'concluido' ? P.seguro('disabled') : ''}>${P.textoEstatus(e)}</option>`; })}</select></label>
        </div>
        <label>Nota para los vecinos <span class="opcional">(opcional)</span><textarea name="nota" rows="2" maxlength="250" placeholder="Ej.: se terminó la colocación de gradas" ${faseOk ? '' : P.seguro('disabled')}></textarea></label>
        <label data-just hidden>Justificación de por qué es inejecutable<textarea name="justificacion_inejecutable" maxlength="500" rows="3"></textarea></label>
        ${sel.ultima_nota ? P.html`<span class="pequeno texto-2">${P.t('Última nota')} (${P.fecha(sel.ultimo_avance)}): ${sel.ultima_nota}</span>` : ''}
        <div class="fila" style="gap:10px"><button type="submit" class="btn" ${faseOk ? '' : P.seguro('disabled')}>Guardar avance</button><span id="msg-av" aria-live="polite"></span></div>
      </form>`);
    P.animarNumeros(pn);
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
    pn.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cumplir]');
      if (!b) return;
      var etapa = b.getAttribute('data-cumplir');
      var caja = P.$('[data-evidencia="' + etapa + '"]', pn);
      var t = caja.value.trim();
      if (Array.from(t).length < 10) { P.aviso('Escribe la evidencia de la etapa (al menos 10 caracteres)', 'error'); P.sacudir(caja); caja.focus(); return; }
      var id = sel.id;
      P.accion(b, function () {
        return P.post('/api/func/seguimiento/' + id + '/etapa', { etapa_id: Number(etapa), evidencia: t }).then(function (r) {
          return cargarObras().then(function () { P.aviso(r.mensaje, 'ok'); return null; });
        });
      });
    });
    pn.addEventListener('change', function (e) {
      if (e.target.name !== 'estatus') return;
      var f = e.target.form;
      P.$('[data-just]', f).hidden = e.target.value !== 'inejecutable';
    });
    pn.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      var d = P.datosForm(f);
      var pct = Number(sel.avance_porcentaje);
      var err = !(Number(d.monto_ejercido) >= 0) || d.monto_ejercido === '' ? 'Indica el monto ejercido'
        : (d.estatus === 'concluido' && pct < 100 ? 'Para marcar el proyecto como concluido deben estar cumplidas todas sus etapas'
          : (d.estatus === 'inejecutable' && Array.from(d.justificacion_inejecutable || '').length < 10 ? 'Escribe la justificación (al menos 10 caracteres)' : null));
      if (err) { P.poner(P.$('#msg-av'), P.html`<span class="error-campo">${P.t(err)}</span>`); P.sacudir(f); return; }
      if (Number(d.monto_ejercido) > Number(sel.presupuesto_asignado)) P.aviso('Aviso: el monto ejercido supera el presupuesto asignado', 'error');
      var id = sel.id;
      P.accion(f.querySelector('[type=submit]'), function () {
        return P.post('/api/func/seguimiento/' + id + '/avance', {
          monto_ejercido: Number(d.monto_ejercido), estatus: d.estatus, nota: d.nota || null,
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
