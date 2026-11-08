(function () {
  'use strict';
  var P = window.Prepar;
  var u = null;
  var sorteo = null;
  var casos = null;
  var utSel = null;
  var casoSel = null;
  var elegido = {};
  var CASOS = { empate: 'Empate en primer lugar', unico_viable: 'Un solo proyecto viable', sin_votos: 'Sin votos' };
  var DESC = {
    empate: 'Dos o más proyectos terminaron empatados en el primer lugar.',
    unico_viable: 'No hubo competencia porque solo un proyecto resultó viable.',
    sin_votos: 'Nadie votó en esta colonia durante la consulta.',
  };

  function pestana(n) {
    P.$$('[data-pestana]').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-pestana') === n ? 'true' : 'false'); });
    P.$$('[data-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== n; });
  }
  function cuenta(n, v) { var el = P.$('[data-n="' + n + '"]'); if (el) el.textContent = v; }

  function estadoUt(x) {
    if (x.realizado_en) return [P.t('Boleta publicada'), 'ok-texto'];
    if (x.sin_dictamen > 0) return [P.t('{n} proyecto(s) sin dictamen', { n: x.sin_dictamen }), 'error-texto'];
    return [P.t('Pendiente de sorteo'), 'tenue'];
  }
  function pintarSorteo() {
    var d = sorteo;
    var fase = d.ciclo && d.ciclo.fase;
    var uts = d.unidades || [];
    cuenta('sorteo', uts.filter(function (x) { return !x.realizado_en; }).length);
    P.poner(P.$('#estado-sorteo'), !d.ciclo ? P.html`<div class="mensaje info">No hay un ciclo activo.</div>`
      : P.html`${fase !== 'sorteo_difusion' ? P.html`<div class="mensaje info">El sorteo solo se realiza en la fase de Sorteo y Difusión. Puedes consultar las boletas.</div>` : ''}${d.sin_proyectos ? P.html`<p class="tenue" style="margin:0;font-size:14px">${P.t('Solo se muestran las colonias con proyectos. Otras {n} colonia(s) de tu alcaldía no registraron proyectos y no necesitan sorteo.', { n: d.sin_proyectos })}</p>` : ''}`);
    if (!utSel || !uts.some(function (x) { return x.id === utSel; })) utSel = (uts.find(function (x) { return !x.realizado_en; }) || uts[0] || {}).id;
    P.poner(P.$('#lista-uts'), uts.length ? uts.map(function (x) {
      var e = estadoUt(x);
      return P.html`<button type="button" class="item-dict ${x.id === utSel ? 'elegido' : ''}" data-ut="${x.id}"><strong>${x.nombre}</strong>
        <span class="tenue" style="font-size:13px">${P.t('{n} proyectos viables', { n: x.viables })}</span><span class="${e[1]}" style="font-size:13px;font-weight:700">${e[0]}</span></button>`;
    }) : P.html`<p class="vacio">No hay colonias de tu alcaldía en el ciclo.</p>`);
    var x = uts.find(function (y) { return y.id === utSel; });
    if (!x) { P.poner(P.$('#panel-sorteo'), ''); return; }
    var hecho = !!x.realizado_en;
    var lista = hecho ? x.boleta.map(function (b) { return { num: b.numero_sorteo, t: b.titulo, f: b.folio }; })
      : x.proyectos_viables.map(function (b) { return { num: '?', t: b.titulo, f: b.folio }; });
    P.poner(P.$('#panel-sorteo'), P.html`<h2 class="h2-maq" style="margin:0">${P.t('Boleta de {u}', { u: x.nombre })}</h2>
      ${!hecho ? P.html`<p class="texto-2" style="margin:0">Estos son los proyectos viables. Al realizar el sorteo, el sistema les asigna un número al azar que no se puede repetir ni cambiar, y publica la boleta.</p>` : ''}
      ${lista.length ? P.html`<ol class="boleta-sorteo">${lista.map(function (b) {
        return P.html`<li><span class="num-boleta h ${hecho ? 'lleno' : 'vacio-num'}">${b.num}</span><span><strong>${b.t}</strong><br><span class="tenue" style="font-size:13px">${b.f}</span></span></li>`;
      })}</ol>` : P.html`<p class="vacio">${P.t('Esta colonia no tiene proyectos viables.')}</p>`}
      <div class="fila">${hecho ? P.html`<span role="status" class="ok-texto" style="font-weight:600">✓ ${P.t('Boleta publicada el {f}. Los vecinos ya ven el número de cada proyecto.', { f: P.fechaHora(x.realizado_en) })}</span>`
        : (fase === 'sorteo_difusion' && u.funciones.indexOf('dictaminacion') >= 0 ? P.html`<button type="button" class="btn" data-sortear="${x.id}" ${x.sin_dictamen > 0 ? P.seguro('disabled') : ''}>Realizar sorteo</button>
          <span class="tenue" style="font-size:14px">${x.sin_dictamen > 0 ? P.t('Primero deben dictaminarse todos los proyectos.') : P.t('El número se asigna al azar y la boleta se publica en ese momento.')}</span>` : '')}</div>`);
  }
  function cargarSorteos() {
    if (u.funciones.indexOf('dictaminacion') < 0) { P.poner(P.$('#estado-sorteo'), P.html`<div class="mensaje alerta">El sorteo lo realiza quien tiene la función de Dictaminación.</div>`); return Promise.resolve(); }
    return P.get('/api/func/sorteos').then(function (d) { sorteo = d; pintarSorteo(); },
      function (e) { P.poner(P.$('#estado-sorteo'), P.html`<p class="mensaje error">${e.message}</p>`); });
  }

  function pintarCasos() {
    var d = casos;
    var c = d.ciclo;
    var lista = d.casos || [];
    cuenta('casos', lista.filter(function (k) { return !k.metodo; }).length);
    P.poner(P.$('#estado-casos'), !c ? P.html`<div class="mensaje info">No hay un ciclo activo.</div>`
      : (!c.computo ? P.html`<div class="mensaje info">Los casos especiales aparecen cuando el Administrador cierra la votación y se cuentan los votos.</div>`
        : (c.publicados ? P.html`<div class="mensaje ok">Los resultados ya se publicaron.</div>` : (!lista.length ? P.html`<p class="vacio">No hay casos especiales en tu alcaldía.</p>` : ''))));
    if (!lista.length) { P.poner(P.$('#lista-casos'), ''); P.poner(P.$('#panel-caso'), ''); P.$('#panel-caso').hidden = true; return; }
    P.$('#panel-caso').hidden = false;
    if (!casoSel || !lista.some(function (k) { return k.unidad_territorial_id === casoSel; })) casoSel = (lista.find(function (k) { return !k.metodo; }) || lista[0]).unidad_territorial_id;
    P.poner(P.$('#lista-casos'), lista.map(function (k) {
      return P.html`<button type="button" class="item-dict ${k.unidad_territorial_id === casoSel ? 'elegido' : ''}" data-caso-ut="${k.unidad_territorial_id}"><strong>${k.unidad_territorial}</strong>
        <span class="error-texto" style="font-size:13px;font-weight:700">${P.t(CASOS[k.caso_especial] || k.caso_especial)}</span>
        <span class="${k.metodo ? 'ok-texto' : 'alerta-texto'}" style="font-size:13px;font-weight:700">${k.metodo ? P.t('Resuelto') : P.t('Pendiente')}</span></button>`;
    }));
    var k = lista.find(function (y) { return y.unidad_territorial_id === casoSel; });
    var cab = P.html`<div><span class="error-texto" style="font-size:13px;font-weight:700">${P.t(CASOS[k.caso_especial] || k.caso_especial)}</span>
      <h2 class="h2-maq" style="margin:4px 0">${k.unidad_territorial}</h2><p class="texto-2" style="margin:0">${P.t(DESC[k.caso_especial] || '')} ${P.t('Votos totales: {n}.', { n: k.total_votos })}</p></div>`;
    if (k.metodo) {
      P.poner(P.$('#panel-caso'), P.html`${cab}<div role="status" class="respuesta-func ok-texto" style="font-weight:600">✓ ${P.t('Caso resuelto: gana «{p}» ({m}).', { p: k.ganador_titulo, m: k.metodo === 'asamblea_sorteo' ? P.t('por sorteo') : P.t('por selección de la asamblea') })}
        <br><span class="texto-2" style="font-weight:400">${k.justificacion}</span></div>`);
      return;
    }
    var sel = elegido[k.unidad_territorial_id];
    P.poner(P.$('#panel-caso'), P.html`${cab}
      <fieldset class="sin-marco columna" style="gap:8px"><legend style="font-weight:700;margin-bottom:8px">1. Elige el proyecto que gana</legend>
        ${k.candidatos.map(function (x) {
          var on = sel === x.proyecto_id;
          return P.html`<button type="button" class="item-dict fila-opcion ${on ? 'elegido' : ''}" data-candidato="${x.proyecto_id}" aria-pressed="${on ? 'true' : 'false'}">
            <span class="radio-maq"><span style="${on ? 'background:var(--acento)' : ''}"></span></span>
            <span><strong>${x.titulo}</strong><br><span class="tenue" style="font-size:13px">${k.caso_especial === 'unico_viable' ? P.t('Único proyecto viable') : P.t('{n} votos', { n: x.total_votos })}</span></span></button>`;
        })}</fieldset>
      <label>2. Justificación <span class="opcional">(hasta 500 caracteres)</span><textarea id="just-caso" rows="3" maxlength="500" placeholder="${P.t('Ej.: en la asamblea simulada los vecinos acordaron priorizar el proyecto con mayor beneficio colectivo.')}"></textarea></label>
      <div id="msg-caso"></div>
      <div class="fila"><button type="button" class="btn" id="confirmar-caso" ${c.publicados ? P.seguro('disabled') : ''}>Confirmar ganador</button>
        ${k.candidatos.length > 1 ? P.html`<button type="button" class="btn2" id="sortear-caso" ${c.publicados ? P.seguro('disabled') : ''}>O resolver por sorteo</button>` : ''}</div>`);
  }
  function cargarCasos() {
    if (u.funciones.indexOf('consulta') < 0) { P.poner(P.$('#estado-casos'), P.html`<div class="mensaje alerta">Los casos especiales los resuelve quien tiene la función de Consulta.</div>`); return Promise.resolve(); }
    return P.get('/api/func/casos').then(function (d) { casos = d; pintarCasos(); },
      function (e) { P.poner(P.$('#estado-casos'), P.html`<p class="mensaje error">${e.message}</p>`); });
  }
  function resolverCaso(metodo, boton) {
    var k = casos.casos.find(function (y) { return y.unidad_territorial_id === casoSel; });
    var just = P.$('#just-caso').value.trim();
    var msg = P.$('#msg-caso');
    var proyecto = elegido[casoSel];
    if (metodo === 'asamblea_seleccion' && !proyecto) { P.poner(msg, P.html`<div class="mensaje error" role="alert">${P.t('Elige el proyecto que gana')}</div>`); return; }
    if (Array.from(just).length < 10) { P.poner(msg, P.html`<div class="mensaje error" role="alert">${P.t('Escribe una justificación de al menos 10 caracteres')}</div>`); return; }
    P.confirmar(P.t('¿Resolver el caso especial?'), metodo === 'asamblea_sorteo' ? P.t('El sistema elegirá al azar entre los proyectos empatados. La decisión es definitiva.') : P.t('La decisión de la asamblea es definitiva.'), { si: 'Resolver' }).then(function (ok) {
      if (!ok) return;
      P.accion(boton, function () {
        return P.post('/api/func/casos/' + k.unidad_territorial_id, { metodo: metodo, justificacion: just, proyecto_id: metodo === 'asamblea_seleccion' ? proyecto : null })
          .then(function (r) { cargarCasos(); P.actualizarCuentas(); return r; });
      }, { destino: msg });
    });
  }

  P.pagina(function (ctx) {
    u = ctx.usuario;
    P.$$('[data-pestana]').forEach(function (b) { b.addEventListener('click', function () { pestana(b.getAttribute('data-pestana')); }); });
    document.addEventListener('click', function (e) {
      var ut = e.target.closest('[data-ut]');
      if (ut) { utSel = Number(ut.getAttribute('data-ut')); pintarSorteo(); return; }
      var s = e.target.closest('[data-sortear]');
      if (s && !s.disabled) {
        var x = sorteo.unidades.find(function (y) { return String(y.id) === s.getAttribute('data-sortear'); });
        P.confirmar(P.t('¿Realizar el sorteo?'), P.t('Se asignará al azar el número de cada proyecto viable de {u} y se publicará la boleta. No se puede repetir.', { u: x.nombre }), { si: 'Realizar sorteo' })
          .then(function (ok) { if (ok) P.accion(s, function () { return P.post('/api/func/sorteos/' + x.id).then(function (r) { cargarSorteos(); P.actualizarCuentas(); return r; }); }); });
        return;
      }
      var cu = e.target.closest('[data-caso-ut]');
      if (cu) { casoSel = Number(cu.getAttribute('data-caso-ut')); pintarCasos(); return; }
      var cand = e.target.closest('[data-candidato]');
      if (cand) {
        var just = P.$('#just-caso') ? P.$('#just-caso').value : '';
        elegido[casoSel] = Number(cand.getAttribute('data-candidato'));
        pintarCasos();
        if (P.$('#just-caso')) P.$('#just-caso').value = just;
        return;
      }
      if (e.target.closest('#confirmar-caso')) { resolverCaso('asamblea_seleccion', e.target.closest('#confirmar-caso')); return; }
      if (e.target.closest('#sortear-caso')) resolverCaso('asamblea_sorteo', e.target.closest('#sortear-caso'));
    });
    var fase = ctx.estado && ctx.estado.ciclo && ctx.estado.ciclo.fase;
    if (location.hash === '#casos' || ['consulta', 'resultados'].indexOf(fase) >= 0) pestana('casos');
    return Promise.all([cargarSorteos(), cargarCasos()]);
  });
}());
