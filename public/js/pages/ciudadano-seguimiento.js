(function () {
  'use strict';
  var P = window.Prepar;
  var ganadores = [];
  var fase = null;
  var pagina = 1;
  var reportes = [];
  var total = 0;
  var fotos = [];
  var ESTRELLA = 'm12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z';
  var MEDALLAS = ['#F4C861', '#CBD5E1', '#E08E6D'];

  function corto(nombre) {
    var p = String(nombre || '').trim().split(/\s+/);
    return p.length > 1 ? p[0] + ' ' + p[1].charAt(0) + '.' : (p[0] || '');
  }
  function fechaCorta(s) { var f = P.fecha(s); return f.replace(/ \d{4}$/, ''); }

  function estrellas(p) {
    var puede = fase === 'evaluacion' && Number(p.es_de_mi_unidad) === 1;
    var mi = Number(p.mi_calificacion) || 0;
    return P.html`<span class="estrellas-maq" role="group" aria-label="${P.t('Tu calificación para {t}', { t: p.titulo })}">${[1, 2, 3, 4, 5].map(function (n) {
      return P.html`<button type="button" class="estrella" data-calificar="${p.id}" data-valor="${n}" aria-label="${P.t('{n} de 5', { n: n })}" ${puede ? '' : P.seguro('disabled')}>
        ${P.seguro('<svg width="22" height="22" viewBox="0 0 24 24" fill="' + (n <= mi ? '#F4C861' : 'none') + '" stroke="#F4C861" stroke-width="1.5" aria-hidden="true"><path d="' + ESTRELLA + '"></path></svg>')}</button>`;
    })}</span>`;
  }

  function pintarRanking() {
    P.$('#nota-ranking').textContent = fase === 'evaluacion'
      ? P.t('Toca las estrellas para calificar el proyecto de tu colonia. El ranking se actualiza con tu calificación.')
      : P.t('La calificación se abre en la fase de Evaluación y Rendición de Cuentas. Mientras tanto puedes ver el ranking.');
    P.poner(P.$('#ranking'), ganadores.length ? ganadores.map(function (p, i) {
      var mi = Number(p.mi_calificacion) || 0;
      return P.html`<li class="${mi ? 'calificado' : ''}">
        <div class="fila arriba" style="gap:10px;flex-wrap:nowrap"><span class="pos-rank h" style="background:${MEDALLAS[i] || '#475569'}">#${i + 1}</span>
          <span class="columna" style="gap:2px;min-width:0"><strong style="font-size:15px">${p.titulo}</strong>
            <span class="tenue" style="font-size:12px">${p.unidad_territorial} · ${p.calificacion_promedio ? P.html`<strong class="amarillo">${P.numero(p.calificacion_promedio, 1)} ★</strong> · ${P.t('{n} calificaciones', { n: p.total_calificaciones })}` : P.t('Sin calificaciones')}</span></span></div>
        <div class="fila" style="gap:6px"><span class="tenue" style="font-size:12px">Tu calificación:</span>${estrellas(p)}
          ${mi ? P.html`<span class="ok-texto" style="font-size:12px;font-weight:700">${P.t('✓ {n} de 5 guardada', { n: mi })}</span>` : ''}</div>
        <button type="button" class="enlace-boton pequeno" data-ver-proyecto="${p.id}" style="align-self:flex-start">${P.t('Ver reportes ({n})', { n: p.total_reportes })}</button>
      </li>`;
    }) : P.html`<p class="vacio">Todavía no hay proyectos ganadores. Aparecerán al publicarse los resultados de la consulta.</p>`);
    var ops = ganadores.map(function (p) { return P.html`<option value="${p.id}">${p.folio} · ${p.titulo}</option>`; });
    P.poner(P.$('#f-proyecto'), P.html`<option value="">Todos</option>${ops}`);
    P.poner(P.$('#rep-proyecto'), ganadores.length ? ops : P.html`<option value="">Aún no hay proyectos ganadores</option>`);
    var pre = P.param('proyecto');
    if (pre) { P.$('#f-proyecto').value = pre; P.$('#rep-proyecto').value = pre; }
    P.$('#publicar-rep').disabled = !ganadores.length;
    P.$('#rep-espera').hidden = !!ganadores.length;
    P.$$('#form-rep input, #form-rep select, #form-rep textarea').forEach(function (x) { x.disabled = !ganadores.length || (x.id === 'fotos-rep' && fotos.length >= 5); });
    P.$('#form-rep').classList.toggle('apagado', !ganadores.length);
  }

  function tarjetaReporte(r) {
    var foto = r.fotos[0];
    return P.html`<article class="tarjeta reporte-maq">
      <div class="foto-rep">${foto ? P.html`<a href="${P.img(foto)}" target="_blank" rel="noopener"><img src="${P.img(foto, true)}" alt="${P.t('Fotografía del vecino')}" loading="lazy"></a>` : P.html`<span>${P.t('[sin fotografía]')}</span>`}
        ${r.fotos.length > 1 ? P.html`<span class="mas-fotos">+${r.fotos.length - 1}</span>` : ''}</div>
      <div class="columna crece" style="padding:16px;gap:8px;min-width:0">
        <div class="fila" style="gap:8px">${P.estatus(r.tipo)}<span class="etq oscura">${P.textoEstatus(r.estatus)}</span></div>
        <strong>${r.proyecto}</strong>
        <span class="texto-2" style="line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere">${r.descripcion}</span>
        <span class="tenue" style="font-size:13px">${corto(r.autor)} · ${fechaCorta(r.creado_en)}</span>
        ${r.respuesta ? P.html`<div class="respuesta-func"><strong>Respuesta del funcionario:</strong> ${r.respuesta}</div>` : ''}
        <form class="fila" data-comentar="${r.id}" style="gap:8px;flex-wrap:nowrap" novalidate>
          <input type="text" maxlength="250" placeholder="Escribe un comentario (máx. 250)" aria-label="Comentario" class="crece">
          <button type="submit" class="btn2">Comentar</button></form>
        ${Number(r.total_comentarios) ? P.html`<button type="button" class="enlace-boton pequeno" data-reporte="${r.id}" style="align-self:flex-start">${P.t('Ver comentarios ({n})', { n: r.total_comentarios })}</button>` : ''}
      </div></article>`;
  }

  function cargarReportes(reiniciar) {
    if (reiniciar) { pagina = 1; reportes = []; }
    var f = P.datosForm(P.$('#filtros-rep'));
    f.pagina = pagina;
    return P.get('/api/foto-denuncia/reportes' + P.qs(f)).then(function (d) {
      total = d.total;
      reportes = reportes.concat(d.reportes);
      P.poner(P.$('#reportes'), reportes.length ? reportes.map(tarjetaReporte) : P.html`<p class="vacio">No hay reportes con estos filtros</p>`);
      P.$('#total-rep').textContent = P.t('{n} reporte(s)', { n: total });
      P.$('#mas-rep').hidden = reportes.length >= total;
    }, function (e) { P.poner(P.$('#reportes'), P.html`<p class="mensaje error">${e.message}</p>`); });
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
    P.$('#cuenta-fotos').textContent = P.t('{n} de 5 fotos · mínimo 1, máximo 5', { n: n });
    P.$('#cuenta-fotos').className = 'ayuda ' + (lleno ? 'alerta-texto' : (n ? 'ok-texto' : ''));
    P.$('#texto-zona').textContent = P.t(lleno ? 'Ya tienes 5 fotos (el máximo). Quita una para cambiarla.' : (n ? 'Agregar más fotos' : 'Toca aquí para elegir fotos'));
    P.$('#fotos-rep').disabled = lleno;
    P.$('#zona-fotos').classList.toggle('lleno', lleno);
  }
  function mostrarRechazos(lista) {
    P.poner(P.$('#rechazos-rep'), lista.length ? P.html`<div class="mensaje error" role="alert"><span><strong>${P.t('No se agregaron {n} archivo(s):', { n: lista.length })}</strong>
      <ul style="margin:4px 0 0;padding-left:18px">${lista.map(function (x) { return P.html`<li>${x}</li>`; })}</ul></span></div>` : '');
  }

  function cargarGanadores() {
    return P.get('/api/foto-denuncia/proyectos').then(function (d) { ganadores = d.proyectos; fase = d.fase; pintarRanking(); },
      function (e) { P.poner(P.$('#ranking'), P.html`<p class="mensaje error">${e.message}</p>`); });
  }

  P.pagina(function () {
    P.catalogos().then(function (cat) {
      P.poner(P.$('#f-alcaldia'), P.html`<option value="">Todas</option>${cat.alcaldias.map(function (a) { return P.html`<option value="${a.id}">${a.nombre}</option>`; })}`);
    });
    var filtros = P.$('#filtros-rep');
    filtros.addEventListener('change', function () { cargarReportes(true); });
    filtros.addEventListener('submit', function (e) { e.preventDefault(); cargarReportes(true); });
    P.$('#limpiar-rep').addEventListener('click', function () { filtros.reset(); cargarReportes(true); });
    P.$('#mas-rep').addEventListener('click', function () { pagina += 1; cargarReportes(false); });

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
      var err = !d.proyecto_id ? 'Elige el proyecto' : (!fotos.length ? 'Agrega al menos una fotografía'
        : (fotos.some(function (f) { return !f.uuid; }) ? 'Espera a que terminen de subir las fotos'
          : (Array.from(d.descripcion).length < 10 ? 'La descripción debe tener al menos 10 caracteres' : null)));
      if (err) { P.poner(msg, P.html`<div class="mensaje error" role="alert">${P.t(err)}</div>`); return; }
      P.poner(msg, '');
      P.accion(P.$('#publicar-rep'), function () {
        return P.post('/api/foto-denuncia/reportes', { proyecto_id: Number(d.proyecto_id), tipo: d.tipo, descripcion: d.descripcion, fotos: fotos.map(function (f) { return f.uuid; }) })
          .then(function (r) {
            fotos = []; pintarPrevias(); mostrarRechazos([]);
            form.querySelector('textarea').value = '';
            form.querySelector('textarea').dispatchEvent(new Event('input'));
            cargarReportes(true); cargarGanadores();
            return r;
          });
      }, { destino: msg });
    });

    document.addEventListener('click', function (e) {
      var est = e.target.closest('[data-calificar]');
      if (est && !est.disabled) {
        var id = est.getAttribute('data-calificar');
        var valor = Number(est.getAttribute('data-valor'));
        P.accion(est, function () {
          return P.post('/api/foto-denuncia/proyectos/' + id + '/calificacion', { puntuacion: valor, comentario: null }).then(function (r) { cargarGanadores(); return r; });
        });
        return;
      }
      var r = e.target.closest('[data-reporte]');
      if (r) { verReporte(r.getAttribute('data-reporte')); return; }
      var v = e.target.closest('[data-ver-proyecto]');
      if (v) { P.$('#f-proyecto').value = v.getAttribute('data-ver-proyecto'); cargarReportes(true); P.$('#filtros-rep').scrollIntoView({ behavior: 'smooth' }); }
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
    return cargarGanadores().then(function () { return cargarReportes(true); });
  });
}());
