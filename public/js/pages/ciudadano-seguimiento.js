(function () {
  'use strict';
  var P = window.Prepar;
  var obras = [];
  var fase = null;
  var obra = null;
  var pagina = 1;
  var reportes = [];
  var total = 0;
  var fotos = [];
  var usuario = null;
  var ESTRELLA = 'm12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z';
  var COLOR_AVANCE = { concluido: '#2A9D8F', inejecutable: '#94A3B8' };

  function corto(nombre) {
    var p = String(nombre || '').trim().split(/\s+/);
    return p.length > 1 ? p[0] + ' ' + p[1].charAt(0) + '.' : (p[0] || '');
  }
  function fechaCorta(s) { var f = P.fecha(s); return f.replace(/ \d{4}$/, ''); }

  function pintaEstrellas(valor, tam, id, puede) {
    return P.html`<span class="estrellas-maq" role="group" aria-label="${P.t('Tu calificación')}">${[1, 2, 3, 4, 5].map(function (n) {
      var svg = '<svg width="' + tam + '" height="' + tam + '" viewBox="0 0 24 24" fill="' + (n <= valor ? '#F4C861' : 'none') + '" stroke="#F4C861" stroke-width="1.5" aria-hidden="true"><path d="' + ESTRELLA + '"></path></svg>';
      return id ? P.html`<button type="button" class="estrella" data-calificar="${id}" data-valor="${n}" aria-label="${P.t('{n} de 5', { n: n })}" ${puede ? '' : P.seguro('disabled')}>${P.seguro(svg)}</button>`
        : P.seguro(svg);
    })}</span>`;
  }
  function puedeCalificar(o) { return fase === 'evaluacion' && Number(o.es_de_mi_unidad) === 1; }
  var RUBRO_CORTO = { 1: 'Espacios públicos', 2: 'Infraestructura', 3: 'Actividades' };
  function colorRubro(o) { return P.colorRubro(o); }
  function nombreRubro(o) { return P.t(RUBRO_CORTO[Number(o.rubro_id)] || ''); }

  function tarjetaObra(o) {
    var av = Number(o.avance_porcentaje) || 0;
    var prom = Number(o.calificacion_promedio) || 0;
    var c = colorRubro(o);
    return P.html`<a class="tarjeta obra-card" href="#obra-${o.id}" style="border-top:6px solid ${c}">
      <div class="fila entre" style="gap:8px"><span class="etq" style="background:color-mix(in srgb, ${c} 12%, transparent);color:${c}">${nombreRubro(o)}</span><span class="etq">${P.textoEstatus(o.estatus)}</span></div>
      <strong class="obra-card-titulo">${o.titulo}</strong>
      <span class="tenue" style="font-size:14px">${o.unidad_territorial}${Number(o.es_de_mi_unidad) ? P.html` · <strong class="acento-texto">${P.t('tu colonia')}</strong>` : ''}</span>
      <div class="fila entre"><span class="pequeno">${P.t('Avance')}</span><strong>${P.numero(av, 0)} %</strong></div>
      <span class="barra-obra"><span style="width:${Math.min(100, av)}%;background:${COLOR_AVANCE[o.estatus] || '#F4C861'}"></span></span>
      <div class="fila entre pequeno"><span class="fila" style="gap:6px">${pintaEstrellas(Math.round(prom), 16)}<span class="tenue">${prom ? P.numero(prom, 1) : P.t('Sin calificar')}</span></span>
        <span class="tenue">${P.t(Number(o.total_reportes) === 1 ? '{n} reporte' : '{n} reportes', { n: o.total_reportes })}</span></div>
      <span class="acento-texto" style="font-weight:700;font-size:14px">${P.t('Ver obra')} →</span></a>`;
  }

  function pintarLista() {
    P.poner(P.$('#obras'), obras.length ? obras.map(tarjetaObra)
      : P.html`<div class="mensaje info"><span><strong>Todavía no hay obras ganadoras en tu alcaldía.</strong> Aparecen cuando se publican los resultados de la consulta (fase 6) y se vigilan en la fase 7 · Ejecución y seguimiento.</span></div>`);
  }

  function cargarObras() {
    var q = usuario && usuario.alcaldiaId ? { alcaldia: usuario.alcaldiaId } : {};
    return P.get('/api/foto-denuncia/proyectos' + P.qs(q)).then(function (d) {
      fase = d.fase;
      obras = d.proyectos.slice().sort(function (a, b) {
        return (Number(b.es_de_mi_unidad) - Number(a.es_de_mi_unidad)) || ((Number(b.calificacion_promedio) || 0) - (Number(a.calificacion_promedio) || 0)) || String(a.folio).localeCompare(String(b.folio));
      });
      pintarLista();
    }, function (e) { P.poner(P.$('#obras'), P.html`<p class="mensaje error">${e.message}</p>`); });
  }

  function pintarCalificacion() {
    var o = obra;
    var mi = Number(o.mi_calificacion) || 0;
    var prom = Number(o.calificacion_promedio) || 0;
    P.poner(P.$('#obra-estrellas'), pintaEstrellas(mi, 30, o.id, puedeCalificar(o)));
    var nota = prom ? P.t('Promedio de los vecinos: {p} ({n} calificaciones).', { p: P.numero(prom, 1), n: o.total_calificaciones }) : P.t('Todavía nadie la ha calificado.');
    if (!puedeCalificar(o)) nota += ' ' + P.t(Number(o.es_de_mi_unidad) ? 'Podrás calificarla en la fase 8 · Evaluación y Rendición de Cuentas.' : 'Solo califican los vecinos de esa colonia.');
    else if (mi) nota += ' ' + P.t('Tu calificación: {n} de 5.', { n: mi });
    P.$('#obra-calif-nota').textContent = nota;
  }

  function abrirObra(id) {
    var o = obras.find(function (x) { return x.id === id; });
    if (!o) { location.hash = ''; return; }
    obra = o;
    P.$('#vista-lista').hidden = true;
    P.$('#vista-obra').hidden = false;
    var c = colorRubro(o);
    P.poner(P.$('#obra-rubro'), P.html`<span class="etq" style="align-self:flex-start;background:color-mix(in srgb, ${c} 12%, transparent);color:${c}">${nombreRubro(o)}</span>`);
    P.$('#obra-titulo').textContent = o.titulo;
    P.$('#obra-lugar').textContent = o.unidad_territorial + ', ' + o.alcaldia + ' · ' + P.t('Folio {f}', { f: o.folio });
    var av = Number(o.avance_porcentaje) || 0;
    P.$('#obra-pct').textContent = P.numero(av, 0) + ' %';
    var barra = P.$('#obra-barra');
    barra.style.width = Math.min(100, av) + '%';
    barra.style.background = COLOR_AVANCE[o.estatus] || '#F4C861';
    P.poner(P.$('#obra-pasos'), P.html`<li class="tenue pequeno">${P.t('Cargando…')}</li>`);
    pintarCalificacion();
    P.get('/api/mapa/proyectos/' + id).then(function (f) {
      if (!obra || obra.id !== id) return;
      P.poner(P.$('#obra-pasos'), (f.etapas || []).length ? f.etapas.map(function (e) {
        var hecha = !!e.cumplida_en;
        return P.html`<li class="${hecha ? 'hecha' : ''}"><span class="paso-marca" aria-hidden="true">${hecha ? '✓' : e.orden}</span><span>${P.idioma() === 'en' && e.nombre_en ? e.nombre_en : e.nombre_es}</span></li>`;
      }) : P.html`<li class="tenue pequeno">${P.t('El funcionario aún no registra pasos de esta obra.')}</li>`);
    }, function () { P.poner(P.$('#obra-pasos'), ''); });
    cargarReportes(true);
    window.scrollTo(0, 0);
  }

  function verLista() {
    obra = null;
    P.$('#vista-obra').hidden = true;
    P.$('#vista-lista').hidden = false;
  }

  function segunDireccion() {
    var m = /^#obra-(\d+)$/.exec(location.hash);
    if (m) abrirObra(Number(m[1])); else verLista();
  }

  function cargarReportes(reiniciar) {
    if (!obra) return Promise.resolve();
    if (reiniciar) { pagina = 1; reportes = []; }
    var id = obra.id;
    return P.get('/api/foto-denuncia/reportes' + P.qs({ proyecto: id, pagina: pagina })).then(function (d) {
      if (!obra || obra.id !== id) return;
      total = d.total;
      reportes = reportes.concat(d.reportes);
      P.$('#t-reportes').textContent = P.t('Reportes de vecinos ({n})', { n: total });
      P.poner(P.$('#reportes'), reportes.length ? reportes.map(tarjetaReporte)
        : P.html`<p class="vacio">${P.t('Nadie ha subido fotos de esta obra. ¡Sé la primera persona!')}</p>`);
      P.$('#mas-rep').hidden = reportes.length >= total;
    }, function (e) { P.poner(P.$('#reportes'), P.html`<p class="mensaje error">${e.message}</p>`); });
  }

  function abrirVentana() {
    if (!obra) return;
    P.$('#rep-obra').textContent = obra.titulo;
    P.$('#ventana-foto').hidden = false;
    var t = P.$('#form-rep textarea');
    setTimeout(function () { P.$('#zona-fotos').focus && P.$('#fotos-rep').focus(); }, 30);
    return t;
  }
  function cerrarVentana() {
    P.$('#ventana-foto').hidden = true;
    P.poner(P.$('#msg-rep'), '');
    var b = P.$('#abrir-foto'); if (b) b.focus();
  }

  function tarjetaReporte(r) {
    var foto = r.fotos[0];
    return P.html`<article class="tarjeta reporte-maq">
      <div class="foto-rep">${foto ? P.html`<a href="${P.img(foto)}" target="_blank" rel="noopener"><img src="${P.img(foto, true)}" alt="${P.t('Fotografía del vecino')}" loading="lazy"></a>` : P.html`<span>${P.t('[sin fotografía]')}</span>`}
        ${r.fotos.length > 1 ? P.html`<span class="mas-fotos">+${r.fotos.length - 1}</span>` : ''}</div>
      <div class="columna crece" style="padding:16px;gap:8px;min-width:0">
        <div class="fila" style="gap:8px">${P.estatus(r.tipo)}<span class="etq oscura">${P.textoEstatus(r.estatus)}</span></div>
        <span class="texto-2" style="line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere">${r.descripcion}</span>
        <span class="tenue" style="font-size:13px">${corto(r.autor)} · ${fechaCorta(r.creado_en)}</span>
        ${r.respuesta ? P.html`<div class="respuesta-func"><strong>Respuesta del funcionario:</strong> ${r.respuesta}</div>` : ''}
        <form class="fila" data-comentar="${r.id}" style="gap:8px;flex-wrap:nowrap" novalidate>
          <input type="text" maxlength="250" placeholder="Escribe un comentario (máx. 250)" aria-label="Comentario" class="crece">
          <button type="submit" class="btn2">Comentar</button></form>
        ${Number(r.total_comentarios) ? P.html`<button type="button" class="enlace-boton pequeno" data-reporte="${r.id}" style="align-self:flex-start">${P.t('Ver comentarios ({n})', { n: r.total_comentarios })}</button>` : ''}
      </div></article>`;
  }

  function verReporte(id) {
    P.get('/api/foto-denuncia/reportes/' + id).then(function (r) {
      P.modal({
        titulo: r.proyecto, ancho: true,
        contenido: P.html`<div class="fila">${P.estatus(r.tipo)}${P.estatus(r.estatus)}<span class="tenue pequeno">${r.folio} · ${P.fechaHora(r.creado_en)} · ${P.t('Por {a}', { a: r.autor })}</span></div>
          ${r.fotos.length ? P.html`<div class="galeria" style="margin-top:10px">${r.fotos.map(function (u) { return P.html`<a href="${P.img(u)}" target="_blank" rel="noopener"><img src="${P.img(u, true)}" alt="Foto del reporte"></a>`; })}</div>` : ''}
          <p class="texto" style="margin-top:10px;white-space:pre-wrap">${r.descripcion}</p>
          ${r.respuesta ? P.html`<div class="respuesta-func"><strong>Respuesta del funcionario:</strong> ${r.respuesta}</div>` : ''}
          <h3 style="margin-top:12px">Comentarios</h3>
          <div class="columna" style="gap:8px">${r.comentarios.length ? r.comentarios.map(function (c) {
            return P.html`<div class="comentario-maq"><strong>${corto(c.autor)}</strong> <span class="tenue">· ${P.fechaHora(c.creado_en)}</span><br>${c.contenido}</div>`;
          }) : P.html`<p class="tenue pequeno">Aún no hay comentarios.</p>`}</div>`,
        botones: [{ texto: 'Cerrar', clase: 'btn2' }],
      });
    }, function (e) { P.aviso(e.message, 'error'); });
  }

  var MAX_FOTOS = 5;
  function pintarPrevias() {
    P.poner(P.$('#previas-rep'), fotos.map(function (f, i) {
      return P.html`<div class="previa ${f.uuid ? '' : 'subiendo'}"><img src="${f.url}" alt="${P.t('Foto {n}', { n: i + 1 })}">
        <span class="estado-previa">${f.uuid ? '✓' : P.t('Subiendo…')}</span>
        <button type="button" data-quitar="${i}" aria-label="${P.t('Quitar foto {n}', { n: i + 1 })}">×</button></div>`;
    }));
    var n = fotos.length;
    var lleno = n >= MAX_FOTOS;
    P.$('#cuenta-fotos').textContent = n ? P.t('{n} de 5 fotos', { n: n }) : P.t('de 1 a 5 fotos (JPG o PNG)');
    P.$('#cuenta-fotos').className = 'ayuda ' + (lleno ? 'alerta-texto' : (n ? 'ok-texto' : ''));
    P.$('#texto-zona').textContent = P.t(lleno ? 'Ya tienes 5 fotos (el máximo). Quita una para cambiarla.' : (n ? 'Agregar más fotos' : 'Toca aquí para elegir fotos'));
    P.$('#fotos-rep').disabled = lleno;
    P.$('#zona-fotos').classList.toggle('lleno', lleno);
  }
  function mostrarRechazos(lista) {
    P.poner(P.$('#rechazos-rep'), lista.length ? P.html`<div class="mensaje error" role="alert"><span><strong>${P.t('No se agregaron {n} archivo(s):', { n: lista.length })}</strong>
      <ul style="margin:4px 0 0;padding-left:18px">${lista.map(function (x) { return P.html`<li>${x}</li>`; })}</ul></span></div>` : '');
  }

  P.pagina(function (ctx) {
    usuario = ctx.usuario;
    P.$('#mas-rep').addEventListener('click', function () { pagina += 1; cargarReportes(false); });
    P.$('#volver-obras').addEventListener('click', function (e) { e.preventDefault(); location.hash = ''; history.replaceState(null, '', location.pathname); verLista(); });
    window.addEventListener('hashchange', segunDireccion);
    P.$('#abrir-foto').addEventListener('click', abrirVentana);
    P.$('#cerrar-foto').addEventListener('click', cerrarVentana);
    P.$('#ventana-foto').addEventListener('click', function (e) { if (e.target.id === 'ventana-foto') cerrarVentana(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !P.$('#ventana-foto').hidden) cerrarVentana(); });

    pintarPrevias();
    P.$('#previas-rep').addEventListener('click', function (e) {
      var q = e.target.closest('[data-quitar]');
      if (q) { fotos.splice(Number(q.getAttribute('data-quitar')), 1); pintarPrevias(); mostrarRechazos([]); }
    });
    P.$('#fotos-rep').addEventListener('change', function (e) {
      var archivos = Array.prototype.slice.call(e.target.files || []);
      e.target.value = '';
      var rechazos = [];
      var libres = MAX_FOTOS - fotos.length;
      if (archivos.length > libres) {
        archivos.slice(libres).forEach(function (a) { rechazos.push(P.t('«{a}»: ya llegaste al máximo de 5 fotos por reporte.', { a: a.name })); });
        archivos = archivos.slice(0, Math.max(0, libres));
      }
      archivos.reduce(function (pr, a) {
        return pr.then(function () {
          return P.revisarImagen(a, 5).then(function (err) {
            if (err) { rechazos.push(err); return; }
            if (fotos.length >= MAX_FOTOS) { rechazos.push(P.t('«{a}»: ya llegaste al máximo de 5 fotos por reporte.', { a: a.name })); return; }
            var f = { uuid: null, url: URL.createObjectURL(a) };
            fotos.push(f);
            pintarPrevias();
            P.subirImagen(a, 'foto_reporte').then(function (r) { f.uuid = r.uuid; pintarPrevias(); }, function (er) {
              rechazos.push(P.t('«{a}»: {m}', { a: a.name, m: er.message }));
              mostrarRechazos(rechazos);
              fotos.splice(fotos.indexOf(f), 1);
              pintarPrevias();
            });
          });
        });
      }, Promise.resolve()).then(function () { mostrarRechazos(rechazos); });
    });
    P.$('#form-rep').addEventListener('submit', function (e) {
      e.preventDefault();
      var form = e.target;
      var d = P.datosForm(form);
      var msg = P.$('#msg-rep');
      var err = !obra ? 'Elige una obra' : (!fotos.length ? 'Agrega al menos una fotografía'
        : (fotos.some(function (f) { return !f.uuid; }) ? 'Espera a que terminen de subir las fotos'
          : (Array.from(d.descripcion || '').length < 10 ? 'Escribe qué se ve en la foto (al menos 10 caracteres)' : null)));
      if (err) { P.poner(msg, P.html`<div class="mensaje error" role="alert">${P.t(err)}</div>`); return; }
      P.poner(msg, '');
      P.accion(P.$('#publicar-rep'), function () {
        return P.post('/api/foto-denuncia/reportes', { proyecto_id: obra.id, tipo: d.tipo, descripcion: d.descripcion, fotos: fotos.map(function (f) { return f.uuid; }) })
          .then(function (r) {
            fotos = []; pintarPrevias(); mostrarRechazos([]);
            form.reset();
            cerrarVentana();
            obra.total_reportes = Number(obra.total_reportes) + 1;
            cargarReportes(true);
            cargarObras();
            return r;
          });
      }, { destino: msg });
    });

    document.addEventListener('click', function (e) {
      var est = e.target.closest('[data-calificar]');
      if (est && !est.disabled) {
        var id = Number(est.getAttribute('data-calificar'));
        var valor = Number(est.getAttribute('data-valor'));
        P.accion(est, function () {
          return P.post('/api/foto-denuncia/proyectos/' + id + '/calificacion', { puntuacion: valor, comentario: null }).then(function (r) {
            return cargarObras().then(function () {
              var o = obras.find(function (x) { return x.id === id; });
              if (o && obra && obra.id === id) { obra = o; pintarCalificacion(); }
              return r;
            });
          });
        });
        return;
      }
      var r = e.target.closest('[data-reporte]');
      if (r) verReporte(r.getAttribute('data-reporte'));
    });
    P.$('#reportes').addEventListener('submit', function (e) {
      var f = e.target.closest('[data-comentar]');
      if (!f) return;
      e.preventDefault();
      var t = f.querySelector('input').value.trim();
      if (!t) { P.aviso('Escribe tu comentario', 'error'); return; }
      P.accion(f.querySelector('button'), function () {
        return P.post('/api/foto-denuncia/reportes/' + f.getAttribute('data-comentar') + '/comentarios', { contenido: t }).then(function (x) { cargarReportes(true); return x; });
      });
    });
    return P.catalogos().then(function (cat) {
      var alc = cat.alcaldias.find(function (a) { return a.id === usuario.alcaldiaId; });
      if (alc) P.$('#titulo-obras').textContent = P.t('Obras ganadoras · {a}', { a: alc.nombre });
    }, function () {}).then(cargarObras).then(function () {
      var pre = Number(P.param('proyecto'));
      if (pre && !location.hash) { history.replaceState(null, '', location.pathname + '#obra-' + pre); }
      segunDireccion();
    });
  });
}());
