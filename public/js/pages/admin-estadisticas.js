(function () {
  'use strict';
  var P = window.Prepar;
  var tipo = 'participacion';
  var cat = null;
  var graficas = [];
  var ultimo = null;
  var paginaBit = 1;
  var FILTROS = {
    participacion: ['ciclo', 'alcaldia', 'unidad', 'genero', 'rango', 'desde', 'hasta'],
    demograficas: ['ciclo', 'alcaldia', 'unidad', 'genero', 'rango'],
    proyectos: ['ciclo', 'alcaldia', 'unidad', 'rubro', 'desde', 'hasta'],
    seguimiento: ['ciclo', 'alcaldia', 'unidad', 'rubro'],
    bitacora: ['ciclo', 'alcaldia', 'funcionario', 'accion', 'desde', 'hasta'],
  };
  var PALETA = ['#E08E6D', '#2A9D8F', '#76BDD7', '#F4C861', '#E55E54', '#94A3B8', '#B5532F', '#22C55E'];

  function colores() {
    var claro = P.temaActual() === 'claro';
    PALETA[0] = claro ? '#1F5FD1' : '#E08E6D';
    return { texto: claro ? '#1F2937' : '#F1F5F9', tenue: claro ? '#64748B' : '#94A3B8', rejilla: claro ? 'rgba(15,23,42,.08)' : 'rgba(255,255,255,.08)', fondo: claro ? '#FFFFFF' : '#1E293B' };
  }

  var etiquetasValor = {
    id: 'etiquetasValor',
    afterDatasetsDraw: function (chart) {
      var ctx = chart.ctx;
      var c = colores();
      ctx.save();
      ctx.font = '600 11px "Public Sans", system-ui, sans-serif';
      ctx.textAlign = 'center';
      chart.data.datasets.forEach(function (ds, i) {
        var meta = chart.getDatasetMeta(i);
        if (meta.hidden) return;
        meta.data.forEach(function (el, j) {
          var v = ds.data[j];
          if (v === null || v === undefined || (Number(v) === 0 && chart.config.type === 'pie')) return;
          var texto = ds.formato ? ds.formato(v) : P.numero(v, 1);
          var pos;
          if (chart.config.type === 'pie' || chart.config.type === 'doughnut') {
            pos = el.tooltipPosition();
            ctx.fillStyle = '#0F172A';
          } else {
            pos = { x: el.x, y: el.y - 6 };
            ctx.fillStyle = c.texto;
          }
          ctx.fillText(texto, pos.x, pos.y);
        });
      });
      ctx.restore();
    },
  };

  function grafica(lienzo, tipoG, etiquetas, series, op) {
    if (typeof window.Chart === 'undefined') {
      lienzo.parentNode.innerHTML = '<p class="vacio">' + P.esc(P.t('Las gráficas no están disponibles; los datos están en la tabla.')) + '</p>';
      return;
    }
    var c = colores();
    op = op || {};
    window.Chart.defaults.font.family = "'Public Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
    var g = new window.Chart(lienzo, {
      type: tipoG,
      data: {
        labels: etiquetas,
        datasets: series.map(function (s, i) {
          var color = s.color || PALETA[i % PALETA.length];
          return {
            label: s.nombre, data: s.datos, formato: s.formato,
            backgroundColor: tipoG === 'pie' ? etiquetas.map(function (x, j) { return PALETA[j % PALETA.length]; }) : color,
            borderColor: tipoG === 'pie' ? c.fondo : color, borderWidth: tipoG === 'line' ? 3 : 1, tension: 0.25, borderRadius: tipoG === 'bar' ? 6 : 0,
            pointRadius: 4, fill: false,
          };
        }),
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
        layout: { padding: { top: 18 } },
        plugins: {
          legend: { labels: { color: c.texto, font: { family: 'Public Sans' } }, display: series.length > 1 || tipoG === 'pie' },
          tooltip: { callbacks: op.tooltip ? { label: op.tooltip } : {} },
        },
        scales: tipoG === 'pie' ? {} : {
          x: { ticks: { color: c.tenue }, grid: { color: c.rejilla } },
          y: { beginAtZero: true, ticks: { color: c.tenue, precision: 0, callback: op.ejeY }, grid: { color: c.rejilla }, max: op.maxY },
        },
      },
      plugins: [etiquetasValor],
    });
    graficas.push(g);
  }
  function limpiarGraficas() { graficas.forEach(function (g) { try { g.destroy(); } catch (e) { } }); graficas = []; }

  var nomGenero = function (g) { return P.t(P.GENEROS[g] || g); };
  var dineroCorto = function (v) { var n = Number(v); return n >= 1e6 ? '$' + P.numero(n / 1e6, 1) + ' M' : P.dinero(n); };

  function caja(titulo, alto) { return P.html`<figure class="tarjeta figura-estad"><figcaption>${titulo}</figcaption><div class="grafica" style="height:${alto || 300}px"><canvas></canvas></div></figure>`; }
  function kpi(etq, valor, detalle) { return P.html`<div class="tarjeta kpi-maq"><span>${etq}</span><strong class="h">${valor}</strong>${detalle ? P.html`<small class="tenue">${detalle}</small>` : ''}</div>`; }
  var NOMBRES = { participacion: 'participación', demograficas: 'demográficas', proyectos: 'proyectos', seguimiento: 'seguimiento', bitacora: 'bitácora' };
  function estado(d) { return P.html`<div role="status" class="ok-texto" style="font-size:14px">✓ ${P.t('Gráficas de {t} generadas · {c}', { t: P.t(NOMBRES[tipo]), c: d.ciclo_nombre || cicloNombre() })}</div>`; }
  function cicloNombre() { var s = P.$('#f-ciclo'); return s.selectedIndex >= 0 ? s.options[s.selectedIndex].text.split(' · ')[0] : ''; }
  function sinGenerar() {
    limpiarGraficas();
    P.poner(P.$('#resultado'), P.html`<div class="tarjeta vacio-estad">${P.seguro('<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18M7 15l4-4 3 3 6-6"></path></svg>')}
      <strong style="font-size:18px">${P.t('Elegiste: {t}', { t: P.t(NOMBRES[tipo]) })}</strong><span class="tenue">${P.t('Ajusta los filtros si quieres y presiona «Generar gráficas».')}</span></div>`);
  }
  function tabla(columnas, filas) {
    return P.html`<div class="tabla-cont"><table><thead><tr>${columnas.map(function (c) { return P.html`<th class="${c.num ? 'num' : ''}">${c.t}</th>`; })}</tr></thead>
      <tbody>${filas.length ? filas.map(function (f) { return P.html`<tr>${columnas.map(function (c) { return P.html`<td class="${c.num ? 'num' : ''}">${c.v(f)}</td>`; })}</tr>`; }) : P.html`<tr><td colspan="${columnas.length}" class="tenue">Sin datos</td></tr>`}</tbody></table></div>`;
  }

  function pintar(d) {
    limpiarGraficas();
    var res = P.$('#resultado');
    if (!d.ciclo) { P.poner(res, P.html`<p class="vacio">Aún no hay ciclos para generar estadísticas</p>`); return; }
    var lienzos;
    if (d.tipo === 'participacion') {
      var t = d.total;
      P.poner(res, P.html`${estado(d)}<div class="kpis-admin">
          ${kpi(P.t('Ciudadanos registrados'), P.numero(t.registrados, 0))}
          ${kpi(P.t('Votantes'), P.numero(t.votantes, 0))}
          ${kpi(P.t('Participación'), t.porcentaje !== null ? P.numero(t.porcentaje, 1) + '%' : '—')}</div>
        <div class="rejilla dos">${caja('Registrados y votantes por alcaldía')}${caja('Votaron y no votaron')}</div>${caja('Votos recibidos por día', 280)}
        <section class="tarjeta"><h2 style="margin-top:0">Detalle por alcaldía</h2>${tabla([{ t: 'Alcaldía', v: function (f) { return f.etiqueta; } }, { t: 'Registrados', num: 1, v: function (f) { return f.registrados; } },
          { t: 'Votantes', num: 1, v: function (f) { return f.votantes; } }, { t: '%', num: 1, v: function (f) { return f.registrados ? P.numero(100 * f.votantes / f.registrados, 1) + '%' : '—'; } }], d.porAlcaldia)}</section>`);
      lienzos = P.$$('canvas', res);
      grafica(lienzos[0], 'bar', d.porAlcaldia.map(function (x) { return x.etiqueta; }), [{ nombre: P.t('Registrados'), datos: d.porAlcaldia.map(function (x) { return Number(x.registrados); }), formato: function (v) { return P.numero(v, 0); } },
        { nombre: P.t('Votantes'), datos: d.porAlcaldia.map(function (x) { return Number(x.votantes); }), formato: function (v) { return P.numero(v, 0); } }]);
      grafica(lienzos[1], 'pie', [P.t('Votaron'), P.t('No votaron')], [{ nombre: P.t('Ciudadanos'), datos: [Number(t.votantes), Math.max(0, Number(t.registrados) - Number(t.votantes))], formato: function (v) { return P.numero(v, 0); } }]);
      grafica(lienzos[2], 'line', d.porDia.map(function (x) { return P.fecha(x.dia); }), [{ nombre: P.t('Votos'), datos: d.porDia.map(function (x) { return Number(x.votantes); }), formato: function (v) { return P.numero(v, 0); } }]);
    } else if (d.tipo === 'demograficas') {
      P.poner(res, P.html`${estado(d)}<div class="rejilla dos">${caja('Ciudadanos y votantes por género')}${caja('Registrados por género')}</div>
        <div class="rejilla dos">${caja('Ciudadanos y votantes por rango de edad')}${caja('Ciudadanos y votantes por alcaldía')}</div>`);
      lienzos = P.$$('canvas', res);
      var serie = function (lista, campo) { return lista.map(function (x) { return Number(x[campo]); }); };
      var f0 = function (v) { return P.numero(v, 0); };
      grafica(lienzos[0], 'bar', d.porGenero.map(function (x) { return nomGenero(x.etiqueta); }), [{ nombre: P.t('Registrados'), datos: serie(d.porGenero, 'registrados'), formato: f0 }, { nombre: P.t('Votantes'), datos: serie(d.porGenero, 'votantes'), formato: f0 }]);
      grafica(lienzos[1], 'pie', d.porGenero.map(function (x) { return nomGenero(x.etiqueta); }), [{ nombre: P.t('Registrados'), datos: serie(d.porGenero, 'registrados'), formato: f0 }]);
      grafica(lienzos[2], 'bar', d.porEdad.map(function (x) { return x.etiqueta; }), [{ nombre: P.t('Registrados'), datos: serie(d.porEdad, 'registrados'), formato: f0 }, { nombre: P.t('Votantes'), datos: serie(d.porEdad, 'votantes'), formato: f0 }]);
      grafica(lienzos[3], 'bar', d.porAlcaldia.map(function (x) { return x.etiqueta; }), [{ nombre: P.t('Registrados'), datos: serie(d.porAlcaldia, 'registrados'), formato: f0 }, { nombre: P.t('Votantes'), datos: serie(d.porAlcaldia, 'votantes'), formato: f0 }]);
    } else if (d.tipo === 'proyectos') {
      var tt = d.total;
      var cuatro = function (lista) {
        var f0b = function (v) { return P.numero(v, 0); };
        return [['registrados', 'Registrados'], ['viables', 'Viables'], ['no_viables', 'No viables'], ['ganadores', 'Ganadores']].map(function (k) {
          return { nombre: P.t(k[1]), datos: lista.map(function (x) { return Number(x[k[0]] || 0); }), formato: f0b };
        });
      };
      P.poner(res, P.html`${estado(d)}<div class="kpis-admin">${[['registrados', 'Registrados'], ['viables', 'Viables'], ['no_viables', 'No viables'], ['ganadores', 'Ganadores']].map(function (k) {
        return P.html`${kpi(P.t(k[1]), P.numero(tt[k[0]] || 0, 0))}`;
      })}</div>${caja('Proyectos por rubro')}<div class="rejilla dos">${caja('Proyectos por alcaldía')}${caja('Proyectos por estatus')}</div>`);
      lienzos = P.$$('canvas', res);
      grafica(lienzos[0], 'bar', d.porRubro.map(function (x) { return x.etiqueta; }), cuatro(d.porRubro));
      grafica(lienzos[1], 'bar', d.porAlcaldia.map(function (x) { return x.etiqueta; }), cuatro(d.porAlcaldia));
      grafica(lienzos[2], 'pie', d.porEstatus.map(function (x) { return P.textoEstatus(x.etiqueta); }), [{ nombre: P.t('Proyectos'), datos: d.porEstatus.map(function (x) { return Number(x.n); }), formato: function (v) { return P.numero(v, 0); } }]);
    } else {
      var s = d.total;
      P.poner(res, P.html`${estado(d)}<div class="kpis-admin">
          ${kpi(P.t('Avance promedio'), s.avance_promedio !== null ? P.numero(s.avance_promedio, 1) + '%' : '—', P.t('{n} proyecto(s) ganador(es)', { n: s.proyectos }))}
          ${kpi(P.t('Monto ejercido'), dineroCorto(s.monto_ejercido), P.t('de {p} asignados', { p: dineroCorto(s.presupuesto_asignado) }))}
          ${kpi(P.t('Reportes de Foto denuncia'), P.numero(s.reportes, 0), P.t('{i} irregularidades · {a} atendidos', { i: s.irregularidades, a: s.reportes_atendidos }))}
          ${kpi(P.t('Calificación promedio'), s.calificacion_promedio !== null ? P.numero(s.calificacion_promedio, 1) : '—', P.t('de 5'))}</div>
        <div class="rejilla dos">${caja('Avance promedio por alcaldía (%)')}${caja('Monto ejercido frente al asignado')}</div>
        <section class="tarjeta"><h2 style="margin-top:0">Proyectos ganadores</h2>${tabla([{ t: 'Folio', v: function (f) { return f.folio; } }, { t: 'Alcaldía', v: function (f) { return f.alcaldia; } },
          { t: 'Estatus', v: function (f) { return P.estatus(f.estatus); } }, { t: 'Avance', num: 1, v: function (f) { return P.numero(f.avance_porcentaje, 0) + '%'; } },
          { t: 'Ejercido', num: 1, v: function (f) { return P.dinero(f.monto_ejercido); } }, { t: 'Asignado', num: 1, v: function (f) { return P.dinero(f.presupuesto_asignado); } },
          { t: 'Reportes', num: 1, v: function (f) { return f.reportes; } }, { t: 'Calificación', num: 1, v: function (f) { return f.calificacion_promedio !== null ? P.numero(f.calificacion_promedio, 1) : '—'; } }], d.proyectos)}</section>`);
      lienzos = P.$$('canvas', res);
      grafica(lienzos[0], 'bar', d.porAlcaldia.map(function (x) { return x.etiqueta; }), [{ nombre: P.t('Avance'), datos: d.porAlcaldia.map(function (x) { return Number(x.avance_promedio); }), formato: function (v) { return P.numero(v, 0) + '%'; } }], { maxY: 100 });
      grafica(lienzos[1], 'bar', d.porAlcaldia.map(function (x) { return x.etiqueta; }), [
        { nombre: P.t('Ejercido'), datos: d.porAlcaldia.map(function (x) { return Number(x.monto_ejercido); }), formato: dineroCorto },
        { nombre: P.t('Asignado'), datos: d.porAlcaldia.map(function (x) { return Number(x.presupuesto_asignado); }), formato: dineroCorto }], { ejeY: dineroCorto });
    }
  }

  function bitacora() {
    var f = P.datosForm(P.$('#filtros'));
    var q = { ciclo: f.ciclo, alcaldia: f.alcaldia, funcionario: f.funcionario, accion: f.accion, desde: f.desde, hasta: f.hasta, pagina: paginaBit, limite: 50 };
    return P.get('/api/admin/bitacora' + P.qs(q)).then(function (d) {
      var selF = P.$('#f-funcionario');
      if (selF.options.length <= 1) {
        P.poner(selF, P.html`<option value="">Todos</option>${d.responsables.map(function (r) { return P.html`<option value="${r.id}">${r.nombre_completo} (${P.t(r.rol === 'administrador' ? 'Administrador' : 'Funcionario')})</option>`; })}`);
        P.poner(P.$('#f-accion'), P.html`<option value="">Todas</option>${d.acciones.map(function (a) { return P.html`<option value="${a}">${a.replace(/_/g, ' ')}</option>`; })}`);
        selF.value = f.funcionario || '';
        P.$('#f-accion').value = f.accion || '';
      }
      var paginas = Math.max(1, Math.ceil(d.total / 50));
      P.poner(P.$('#resultado'), P.html`<section class="tarjeta"><div class="fila entre"><h2 style="margin:0">Bitácora</h2><span class="tenue pequeno">${P.t('{n} registro(s)', { n: d.total })}</span></div>
        <div style="margin-top:12px">${tabla([{ t: 'Fecha', v: function (r) { return P.fechaHora(r.realizada_en); } }, { t: 'Responsable', v: function (r) { return r.responsable || '—'; } },
          { t: 'Alcaldía', v: function (r) { return r.alcaldia || '—'; } }, { t: 'Acción', v: function (r) { return r.accion.replace(/_/g, ' '); } },
          { t: 'Sobre', v: function (r) { return r.entidad + (r.entidad_id ? ' #' + r.entidad_id : ''); } },
          { t: 'Detalle', v: function (r) { return r.detalle ? (typeof r.detalle === 'string' ? r.detalle : JSON.stringify(r.detalle)).slice(0, 120) : ''; } }], d.registros)}</div>
        <div class="fila" style="justify-content:center;margin-top:12px"><button class="btn2 chico" data-pag="-1" ${paginaBit <= 1 ? P.seguro('disabled') : ''}>← Anterior</button>
          <span class="tenue">${P.t('Página {p} de {t}', { p: paginaBit, t: paginas })}</span><button class="btn2 chico" data-pag="1" ${paginaBit >= paginas ? P.seguro('disabled') : ''}>Siguiente →</button></div></section>`);
    });
  }

  function generar() {
    if (tipo === 'bitacora') { limpiarGraficas(); return bitacora(); }
    var f = P.datosForm(P.$('#filtros'));
    var q = { tipo: tipo };
    FILTROS[tipo].forEach(function (k) { q[k] = f[k]; });
    P.poner(P.$('#resultado'), P.html`<div class="cargando-bloque">Cargando…</div>`);
    return P.get('/api/admin/estadisticas' + P.qs(q)).then(function (d) {
      ultimo = d;
      if (!f.ciclo && d.ciclo) P.$('#f-ciclo').value = String(d.ciclo);
      pintar(d);
    }, function (e) { P.poner(P.$('#resultado'), P.html`<p class="mensaje error">${e.message}</p>`); });
  }

  function elegirTipo(t) {
    tipo = t;
    paginaBit = 1;
    P.$$('[data-tipo]').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-tipo') === t ? 'true' : 'false'); });
    P.$$('[data-f]').forEach(function (l) { l.hidden = FILTROS[t].indexOf(l.getAttribute('data-f')) < 0; });
    P.$('#csv-bitacora').hidden = t !== 'bitacora';
    P.$('#generar').textContent = P.t(t === 'bitacora' ? 'Ver bitácora' : 'Generar gráficas');
    sinGenerar();
  }

  P.pagina(function () {
    document.addEventListener('prepar:tema', function () { if (ultimo && tipo !== 'bitacora') pintar(ultimo); });
    P.$$('[data-tipo]').forEach(function (b) { b.addEventListener('click', function () { elegirTipo(b.getAttribute('data-tipo')); }); });
    P.$('#filtros').addEventListener('submit', function (e) { e.preventDefault(); paginaBit = 1; generar(); });
    P.$('#limpiar').addEventListener('click', function () {
      var ciclo = P.$('#f-ciclo').value;
      P.$('#filtros').reset();
      P.$('#f-alcaldia').dispatchEvent(new Event('change'));
      P.$('#f-ciclo').value = ciclo;
      paginaBit = 1;
      sinGenerar();
    });
    P.$('#csv-bitacora').addEventListener('click', function (e) {
      var f = P.datosForm(P.$('#filtros'));
      P.descargar('/api/admin/bitacora.csv' + P.qs({ ciclo: f.ciclo, alcaldia: f.alcaldia, funcionario: f.funcionario, accion: f.accion, desde: f.desde, hasta: f.hasta }), e.currentTarget);
    });
    P.$('#resultado').addEventListener('click', function (e) {
      var b = e.target.closest('[data-pag]');
      if (b) { paginaBit = Math.max(1, paginaBit + Number(b.getAttribute('data-pag'))); bitacora(); }
    });
    return Promise.all([P.catalogos(), P.get('/api/ciclos')]).then(function (r) {
      cat = r[0];
      P.poner(P.$('#f-ciclo'), r[1].length ? r[1].map(function (c) { return P.html`<option value="${c.id}">${c.nombre} · ${P.textoEstatus(c.estado)}</option>`; }) : P.html`<option value="">Sin ciclos</option>`);
      var activo = r[1].find(function (c) { return c.estado === 'activo'; });
      if (activo) P.$('#f-ciclo').value = String(activo.id);
      P.poner(P.$('#f-rubro'), P.html`<option value="">Todos</option>${cat.rubros.map(function (x) { return P.html`<option value="${x.id}">${P.nombre(x)}</option>`; })}`);
      P.poner(P.$('#f-funcionario'), P.html`<option value="">Todos</option>`);
      P.poner(P.$('#f-accion'), P.html`<option value="">Todas</option>`);
      P.selectoresUbicacion(P.$('#f-alcaldia'), P.$('#f-unidad'), cat, { textoAlcaldia: P.t('Todas'), textoUnidad: P.t('Todas'), sinMarcas: true });
      elegirTipo('participacion');
    });
  });
}());
