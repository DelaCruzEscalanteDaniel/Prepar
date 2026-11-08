(function () {
  'use strict';
  var P = window.Prepar;
  var mapa = null;
  var capa = null;
  var cat = null;
  var simbologia = { poner: function () {} };
  var todos = [];
  var visibles = [];
  var elegido = null;
  var GANADORES = ['ganador', 'en_ejecucion', 'concluido', 'inejecutable'];
  var CDMX = [19.39, -99.13];

  function filtros() { return P.datosForm(P.$('#filtros-mapa')); }
  function corto(n) { return P.dinero(n).replace(/\.00$/, ''); }

  function chip(estatus) {
    return P.html`<span class="chip-estatus" style="--c:${P.COLOR_ESTATUS[estatus] || '#94A3B8'}">${P.textoEstatus(estatus)}</span>`;
  }

  function ficha(id) {
    elegido = Number(id);
    pintarMarcadores();
    var caja = P.$('#ficha');
    P.poner(caja, P.html`<div class="cargando-bloque">Cargando…</div>`);
    P.get('/api/mapa/proyectos/' + id).then(function (p) {
      var fotos = p.galeria || [];
      var avance = Math.min(100, Math.max(0, Number(p.avance_porcentaje) || 0));
      var gan = GANADORES.indexOf(p.estatus) >= 0;
      P.poner(caja, P.html`${p.estatus === 'en_consulta' && p.total_votos !== null && p.total_votos !== undefined ? P.html`<span class="chip-estatus">${P.t('No ganó')}</span>` : chip(p.estatus)}
        <h2 class="h2-maq" style="margin:0;font-size:24px;line-height:1.15">${p.titulo}</h2>
        <span class="tenue" style="font-size:14px">${p.unidad_territorial} · ${P.t('Folio {f}', { f: p.folio })}</span>
        <div class="dos-datos">
          <div><div class="tenue" style="font-size:12px">${gan ? P.t('Presupuesto asignado') : P.t('Costo estimado')}</div><strong>${corto(gan ? p.costo_estimado : p.costo_estimado)}</strong></div>
          <div><div class="tenue" style="font-size:12px">Ejercido</div><strong>${corto(p.monto_ejercido || 0)}</strong></div>
        </div>
        <div><div class="fila entre" style="font-size:14px"><span>${P.t('Avance')}</span><strong>${P.numero(avance, 0)} %</strong></div><div class="barra" style="margin-top:6px"><span style="width:${avance}%"></span></div></div>
        <div style="font-size:14px;font-weight:700">${P.t('Fotos de vecinos ({n})', { n: fotos.length })}</div>
        ${fotos.length ? P.html`<div class="galeria-3">${fotos.slice(0, 6).map(function (g) {
          return P.html`<a href="${P.img(g.archivo_uuid)}" target="_blank" rel="noopener" title="${g.descripcion}"><img src="${P.img(g.archivo_uuid, true)}" alt="${P.textoEstatus(g.tipo)}" loading="lazy"></a>`;
        })}</div>` : P.html`<p class="tenue pequeno" style="margin:0">Aún no hay fotografías de este proyecto.</p>`}
        <details class="mas-detalle"><summary>Más información</summary>
          <p class="texto-2" style="white-space:pre-wrap">${p.descripcion}</p>
          <div class="pequeno columna" style="gap:4px"><span><strong>${P.t('Ubicación')}:</strong> ${p.calle} ${p.numero || ''}${p.referencias ? ' (' + p.referencias + ')' : ''}, ${p.alcaldia}</span>
            <span><strong>${P.t('Rubro')}:</strong> ${P.t(p.rubro)}</span>
            <span><strong>${P.t('Presupuesto de la colonia')}:</strong> ${corto(p.presupuesto_asignado)}</span>
            ${p.total_votos !== null && p.total_votos !== undefined ? P.html`<span><strong>${P.t('Votos')}:</strong> ${p.total_votos}</span>` : ''}
            ${p.calificacion_promedio ? P.html`<span><strong>${P.t('Calificación')}:</strong> ${P.numero(p.calificacion_promedio, 1)} / 5</span>` : ''}</div>
          ${p.etapas && p.etapas.length ? P.html`<div class="columna" style="gap:8px;margin-top:10px"><strong class="pequeno">${P.t('Etapas de la obra')}</strong>
            <ol class="etapas-obra">${p.etapas.map(function (e) {
              return P.html`<li class="${e.cumplida_en ? 'hecha' : 'pendiente'}" style="padding:8px 10px"><span class="etapa-marca" aria-hidden="true">${e.cumplida_en ? '✓' : e.orden}</span>
                <div class="columna" style="gap:2px;min-width:0;flex:1"><span class="pequeno"><strong>${P.idioma() === 'en' && e.nombre_en ? e.nombre_en : e.nombre_es}</strong> · ${P.numero(e.peso, 0)} %</span>
                ${e.cumplida_en ? P.html`<span class="pequeno texto-2">${P.fecha(e.cumplida_en)} · ${e.evidencia}</span>` : ''}</div></li>`;
            })}</ol></div>` : ''}
          ${p.avances.length ? P.html`<div class="columna" style="gap:6px;margin-top:8px">${p.avances.slice(0, 4).map(function (a) {
            return P.html`<div class="pequeno"><strong>${P.fecha(a.registrado_en)} · ${P.numero(a.porcentaje, 0)}%</strong><br><span class="texto-2">${a.nota || a.justificacion_inejecutable || ''}</span></div>`;
          })}</div>` : ''}
        </details>
        ${gan ? P.html`<a class="btn" href="/ciudadano/seguimiento.html?proyecto=${p.id}">Ver reportes y subir foto</a>` : ''}`);
      if (mapa && p.latitud !== null) mapa.panTo([Number(p.latitud), Number(p.longitud)]);
    }, function (e) { P.poner(caja, P.html`<p class="mensaje error">${e.message}</p>`); });
  }

  function pintarMarcadores() {
    if (!capa) return;
    capa.clearLayers();
    visibles.forEach(function (p) {
      if (p.latitud === null || p.longitud === null) return;
      window.L.marker([Number(p.latitud), Number(p.longitud)], { icon: P.iconoPin(P.colorCategoria(p), p.id === elegido, P.glifoCategoria(p)), title: p.titulo + ' · ' + P.t(P.CATEGORIAS[P.categoriaDe(p)][0]) + ' · ' + P.textoEstatus(p.estatus), alt: p.titulo, keyboard: true, zIndexOffset: p.id === elegido ? 1000 : 0 })
        .on('click', function () { ficha(p.id); }).addTo(capa);
    });
  }

  function encuadrar() {
    if (!mapa) return;
    var f = filtros();
    var pts = visibles.filter(function (p) { return p.latitud !== null; }).map(function (p) { return [Number(p.latitud), Number(p.longitud)]; });
    var u = f.unidad && cat.unidades.find(function (x) { return String(x.id) === f.unidad; });
    if (u && u.latitud && !pts.length) mapa.setView([Number(u.latitud), Number(u.longitud)], 15);
    else if (pts.length) mapa.fitBounds(pts, { maxZoom: 16, padding: [50, 50] });
    else mapa.setView(CDMX, 11);
  }

  function pintar() {
    var f = filtros();
    var modo = f.estatus || 'ganadores';
    var soloGanadores = todos.filter(function (p) { return GANADORES.indexOf(p.estatus) >= 0; });
    var aviso = '';
    if (modo === 'ganadores') {
      if (soloGanadores.length || !todos.length) visibles = soloGanadores;
      else { visibles = todos; aviso = P.t('Aún no hay proyectos ganadores en este ciclo; se muestran todos los proyectos registrados.'); }
    } else if (modo === 'todos') visibles = todos;
    else visibles = todos.filter(function (p) { return p.estatus === modo; });
    P.$('#titulo-mapa').textContent = P.t(modo === 'ganadores' && !aviso ? 'Mapa de proyectos ganadores' : 'Mapa de proyectos');
    P.poner(P.$('#aviso-mapa'), aviso ? P.html`<div class="mensaje info">${aviso}</div>` : '');
    var estados = modo === 'ganadores' && !aviso ? ['ganador', 'en_ejecucion', 'concluido'] : Object.keys(P.COLOR_ESTATUS).filter(function (e) { return visibles.some(function (p) { return p.estatus === e; }); });
    void estados;
    simbologia.poner([P.filasCategorias(visibles.filter(function (p) { return p.latitud !== null; }))]);
    pintarMarcadores();
    encuadrar();
    P.$('#titulo-lista').textContent = P.t('Proyectos ({n})', { n: visibles.length });
    P.poner(P.$('#lista-mapa'), visibles.length ? P.html`<table><thead><tr><th>Folio</th><th>Proyecto</th><th>Colonia</th><th>Estatus</th><th class="num">Avance</th></tr></thead><tbody>
      ${visibles.map(function (p) {
        return P.html`<tr><td>${p.folio}</td><td><button type="button" class="enlace-boton" data-ficha="${p.id}">${p.titulo}</button>${p.latitud === null ? P.html` <span class="etq">${P.t('Sin ubicar')}</span>` : ''}</td>
          <td>${p.unidad_territorial}, ${p.alcaldia}</td><td>${P.estatusProyecto(p)}</td><td class="num">${P.numero(p.avance_porcentaje, 0)}%</td></tr>`;
      })}</tbody></table>` : P.html`<p class="vacio" style="margin:12px">No hay proyectos con estos filtros</p>`);
    if (!elegido && visibles.length) ficha(visibles[0].id);
  }

  function cargar() {
    var f = filtros();
    var q = { ciclo: f.ciclo, alcaldia: f.alcaldia, unidad: f.unidad, rubro: f.rubro };
    return P.get('/api/mapa/proyectos' + P.qs(q)).then(function (d) {
      todos = d.proyectos;
      if (!f.ciclo && d.ciclo_id) P.$('#f-ciclo').value = String(d.ciclo_id);
      if (elegido && !todos.some(function (p) { return p.id === elegido; })) elegido = null;
      pintar();
    }, function (e) { P.poner(P.$('#lista-mapa'), P.html`<p class="mensaje error">${e.message}</p>`); });
  }

  P.pagina(function (ctx) {
    mapa = P.mapa(P.$('#mapa'), { zoom: 12 });
    if (mapa) {
      capa = window.L.layerGroup().addTo(mapa);
      mapa.zoomControl.remove();
      simbologia = P.simbologia(mapa, []);
      P.$('#leyenda').hidden = true;
    }
    P.poner(P.$('#f-estatus'), P.html`<option value="ganadores">Ganadores</option>${['ganador', 'en_ejecucion', 'concluido', 'inejecutable'].map(function (e) {
      return P.html`<option value="${e}">${P.textoEstatus(e)}</option>`;
    })}<option value="todos">Todos los proyectos</option>`);
    return Promise.all([P.catalogos(), P.get('/api/ciclos')]).then(function (r) {
      cat = r[0];
      P.poner(P.$('#f-ciclo'), r[1].map(function (c) { return P.html`<option value="${c.id}">${c.nombre}${c.estado === 'activo' ? ' · ' + P.t('activo') : ''}</option>`; }));
      P.$('#caja-ciclo').hidden = r[1].length < 2;
      P.poner(P.$('.sel-rubro-filtro'), P.html`<option value="">Todos</option>${cat.rubros.map(function (x) { return P.html`<option value="${x.id}">${P.nombre(x)}</option>`; })}`);
      var sel = P.selectoresUbicacion(P.$('#f-alcaldia'), P.$('#f-unidad'), cat, { textoAlcaldia: P.t('Todas'), textoUnidad: P.t('Todas'), siempreActivo: false, sinAviso: true });
      var u = ctx.usuario;
      if (u.alcaldiaId) sel.fijar(u.alcaldiaId, null);
      var form = P.$('#filtros-mapa');
      form.addEventListener('change', function (e) { if (e.target.name === 'estatus') pintar(); else cargar(); });
      P.$('#limpiar-mapa').addEventListener('click', function () {
        var ciclo = P.$('#f-ciclo').value;
        form.reset();
        P.$('#f-alcaldia').dispatchEvent(new Event('change'));
        P.$('#f-ciclo').value = ciclo;
        cargar();
      });
      P.$('#lista-mapa').addEventListener('click', function (e) {
        var b = e.target.closest('[data-ficha]');
        if (b) { ficha(b.getAttribute('data-ficha')); P.$('#ficha').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
      });
      document.querySelector('.mapa-maq').addEventListener('click', function (e) {
        if (!mapa) return;
        var z = e.target.closest('[data-zoom]');
        if (z) { mapa.setZoom(mapa.getZoom() + Number(z.getAttribute('data-zoom'))); return; }
        if (e.target.closest('[data-centrar]')) { encuadrar(); return; }
        var m = e.target.closest('[data-mover]');
        if (m) { var d = m.getAttribute('data-mover').split(','); mapa.panBy([Number(d[0]) * 120, Number(d[1]) * 120]); }
      });
      return cargar();
    });
  });
}());
