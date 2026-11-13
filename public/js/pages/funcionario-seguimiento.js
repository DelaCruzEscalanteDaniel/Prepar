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
  function abierta(o) { return faseOk && o.estatus !== 'concluido' && o.estatus !== 'inejecutable'; }
  function listaPasos(o) {
    var siguiente = o.etapas.find(function (e) { return !e.cumplida_en; });
    return P.html`<ol class="pasos-obra">${o.etapas.map(function (e) {
      var hecha = !!e.cumplida_en;
      var toca = !hecha && siguiente && siguiente.id === e.id;
      return P.html`<li class="${hecha ? 'hecha' : (toca ? 'siguiente' : 'pendiente')}">
        <span class="paso-marca" aria-hidden="true">${hecha ? '✓' : e.orden}</span>
        <div class="columna" style="gap:8px;min-width:0;flex:1">
          <div class="fila entre" style="gap:8px"><strong>${nombreEtapa(e)}</strong>${hecha ? P.html`<span class="pequeno tenue">${P.fecha(e.cumplida_en)}</span>` : ''}</div>
          ${hecha && e.evidencia ? P.html`<span class="pequeno texto-2">${e.evidencia}</span>` : ''}
          ${toca && abierta(o) ? P.html`<div class="paso-caja columna">
            <label style="margin:0">¿Qué se hizo?<input type="text" maxlength="250" data-evidencia="${e.id}" placeholder="${P.t('Ej.: se colocaron las bancas y las luminarias')}"></label>
            <button type="button" class="btn" data-cumplir="${e.id}" style="align-self:flex-start">✓ ${P.t('Ya se terminó este paso')}</button></div>` : ''}
        </div></li>`;
    })}</ol>`;
  }
  function tarjetaDinero(o) {
    var limite = Number(o.limite) || 0;
    var gastado = Number(o.monto_ejercido) || 0;
    var pct = limite > 0 ? Math.min(100, (gastado / limite) * 100) : 0;
    var editable = abierta(o);
    return P.html`<form class="dinero-obra columna" id="form-gasto" novalidate>
      <strong>Dinero de la obra</strong>
      <div class="fila entre" style="gap:8px"><span class="texto-2">${P.t('Gastado')} <strong class="texto">${P.dinero(gastado)}</strong> ${P.t('de')} <strong class="texto">${P.dinero(limite)}</strong></span><strong>${P.numero(pct, 0)} %</strong></div>
      <span class="barra-obra"><span style="width:${pct}%;background:var(--acento)"></span></span>
      <span class="pequeno tenue">${P.t('Quedan {r}', { r: P.dinero(Math.max(0, limite - gastado)) })} · ${P.t('El límite es el costo aprobado en el dictamen')}</span>
      ${o.alerta_gasto ? P.html`<div class="mensaje alerta" role="status">${P.t('Ya se gastó el {g} % del dinero, pero la obra va en {a} %. Revisa que los pasos estén al día.', { g: P.numero(pct, 0), a: P.numero(Number(o.avance_porcentaje), 0) })}</div>` : ''}
      ${editable ? P.html`<div class="fila" style="gap:10px;flex-wrap:nowrap;align-items:center">
        <input type="number" name="monto_ejercido" min="0" max="${limite}" step="0.01" value="${gastado}" aria-label="${P.t('Total gastado hasta hoy')}" style="flex:1;margin:0">
        <button type="submit" class="btn2">Actualizar gasto</button></div>
        <span id="msg-gasto" aria-live="polite"></span>` : ''}
    </form>`;
  }
  function pintarPanel() {
    var pn = P.$('#panel-avance');
    pn.hidden = !sel;
    if (!sel) return;
    var av = Number(sel.avance_porcentaje);
    P.poner(pn, P.html`<div class="fila entre" style="gap:8px;align-items:center"><h2 class="h" style="margin:0;font-size:22px">${sel.titulo}</h2><span class="etq">${P.textoEstatus(sel.estatus)}</span></div>
      <div class="columna" style="gap:8px">
        <div class="fila entre" style="gap:8px"><span>${P.t('Avance de la obra')}</span><strong class="monto-avance" style="margin:0" data-contar="${av}" data-sufijo=" %">${P.numero(av, 0)} %</strong></div>
        <span class="barra-obra grande"><span class="crecer" style="width:${Math.min(100, av)}%;background:${COLOR[sel.estatus] || '#F4C861'}"></span></span>
      </div>
      <h3 class="h" style="margin:4px 0 0;font-size:17px">${P.t('Pasos de la obra')}</h3>
      ${listaPasos(sel)}
      ${tarjetaDinero(sel)}
      ${abierta(sel) ? P.html`<button type="button" class="enlace-peligro" id="inejecutable">${P.t('¿La obra no se puede hacer? Márcala como inejecutable')}</button>` : ''}`);
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
      if (Array.from(t).length < 10) { P.aviso('Escribe qué se hizo en este paso (al menos 10 caracteres)', 'error'); P.sacudir(caja); caja.focus(); return; }
      var id = sel.id;
      P.accion(b, function () {
        return P.post('/api/func/seguimiento/' + id + '/etapa', { etapa_id: Number(etapa), evidencia: t }).then(function (r) {
          return cargarObras().then(function () { P.aviso(r.mensaje, 'ok'); return null; });
        });
      });
    });
    pn.addEventListener('click', function (e) {
      var b = e.target.closest('#inejecutable');
      if (!b) return;
      var id = sel.id;
      var monto = Number(sel.monto_ejercido) || 0;
      P.pedirTexto(P.t('Marcar como inejecutable'), P.t('¿Por qué no se puede hacer la obra?'), { max: 500, min: 10, si: 'Marcar como inejecutable', peligro: true }).then(function (t) {
        if (!t) return;
        P.accion(b, function () {
          return P.post('/api/func/seguimiento/' + id + '/avance', { monto_ejercido: monto, estatus: 'inejecutable', justificacion_inejecutable: t })
            .then(function (r) { return cargarObras().then(function () { P.aviso(r.mensaje, 'ok'); return null; }); });
        });
      });
    });
    pn.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      var campo = f.querySelector('[name=monto_ejercido]');
      var msg = P.$('#msg-gasto');
      var monto = campo.value === '' ? NaN : Number(campo.value);
      var limite = Number(sel.limite) || 0;
      campo.classList.remove('invalido');
      if (!(monto >= 0)) { P.poner(msg, P.html`<span class="error-campo">${P.t('Escribe cuánto se ha gastado hasta hoy')}</span>`); campo.classList.add('invalido'); P.sacudir(campo); return; }
      if (limite > 0 && monto > limite) {
        P.poner(msg, P.html`<span class="error-campo" style="font-weight:600">${P.t('No se puede registrar más de {l}, que es el límite de este proyecto. Te quedan {r}.', { l: P.dinero(limite), r: P.dinero(Math.max(0, limite - Number(sel.monto_ejercido))) })}</span>`);
        campo.classList.add('invalido'); P.sacudir(campo); campo.focus(); return;
      }
      var id = sel.id;
      P.accion(f.querySelector('[type=submit]'), function () {
        return P.post('/api/func/seguimiento/' + id + '/avance', { monto_ejercido: monto }).then(function () {
          return cargarObras().then(function () { P.aviso('Gasto actualizado. Los vecinos ya lo ven', 'ok'); return null; });
        });
      }, { destino: msg });
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
