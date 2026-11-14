(function () {
  'use strict';
  var P = window.Prepar;
  var IR = {
    convocatoria: ['#presupuesto', 'Ver presupuesto'],
    diagnostico_registro: ['/ciudadano/foro.html', 'Ir al foro vecinal'],
    dictaminacion: ['/ciudadano/proyectos.html', 'Ver mis proyectos'],
    sorteo_difusion: ['/ciudadano/votacion.html', 'Ver boleta'],
    consulta: ['/ciudadano/votacion.html', 'Ir a votar'],
    resultados: ['/ciudadano/mapa.html', 'Abrir mapa'],
    ejecucion_seguimiento: ['/ciudadano/seguimiento.html', 'Ir a seguimiento'],
    evaluacion: ['/ciudadano/seguimiento.html', 'Calificar proyecto'],
  };
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MESES_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function corta(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    if (!m) return '';
    var mes = Number(m[2]) - 1;
    return P.idioma() === 'en' ? MESES_EN[mes] + ' ' + Number(m[3]) : Number(m[3]) + ' ' + MESES[mes];
  }
  function rango(f) {
    if (!f.fecha_inicio) return '';
    return f.fecha_inicio === f.fecha_fin ? corta(f.fecha_inicio) : corta(f.fecha_inicio) + ' – ' + corta(f.fecha_fin);
  }

  function siguientePaso(d, fin) {
    var c = d.ciclo;
    var cierre = fin ? P.fechaLarga(fin) : '';
    if (!c) return { t: 'Por ahora no hay un ciclo activo', p: 'Cuando el Administrador active un ciclo de simulación verás aquí lo que te toca hacer.', a: [['/ciudadano/mapa.html', 'Ver el mapa de proyectos']] };
    if (!d.participa) return { t: 'Tu colonia no participa en este ciclo', p: 'Puedes consultar el mapa de proyectos y el directorio de tu alcaldía mientras tanto.', a: [['/ciudadano/mapa.html', 'Ver el mapa'], ['/ciudadano/directorio.html', 'Directorio']] };
    var proy = d.misProyectos || [];
    var idea = d.miIdea || { ideas: 0, apoyos: 0 };
    switch (c.fase) {
      case 'convocatoria':
        return { t: 'Conoce el presupuesto de tu colonia', p: 'Se publicó la convocatoria. Revisa cuánto dinero le toca a tu colonia y prepara tu idea para la siguiente fase.', a: [['#presupuesto', 'Ver presupuesto']] };
      case 'diagnostico_registro':
        if (proy.length) return { t: 'Tu proyecto ya está registrado', p: P.t('Folio {f}. Mientras cierra el registro, apoya y comenta las ideas de tus vecinos en el foro.', { f: proy[0].folio }), a: [['/ciudadano/foro.html', 'Ir al foro vecinal'], ['/ciudadano/proyectos.html', 'Ver mis proyectos']] };
        return {
          t: cierre ? P.t('Registra tu proyecto antes del {f}', { f: cierre }) : 'Registra tu proyecto',
          p: idea.ideas ? P.t('Ya tienes una idea en el foro con {n} apoyos. Conviértela en proyecto: escribe el costo y la dirección, y el sistema te da tu folio.', { n: idea.apoyos })
            : 'Publica una idea en el foro o registra directamente tu proyecto: escribe el costo y la dirección, y el sistema te da tu folio.',
          a: [['/ciudadano/foro.html#registrar', 'Registrar mi proyecto']],
        };
      case 'dictaminacion':
        return { t: 'Espera el dictamen de tu proyecto', p: proy.length ? 'Los funcionarios de tu alcaldía están revisando si los proyectos son viables. Te avisaremos cuando tengan dictamen.' : 'Los funcionarios de tu alcaldía están revisando si los proyectos registrados son viables.', a: [['/ciudadano/proyectos.html', 'Ver mis proyectos']] };
      case 'sorteo_difusion':
        return { t: 'Conoce la boleta de tu colonia', p: 'Cada proyecto viable ya tiene su número en la boleta. Platica con tus vecinos sobre el que más les conviene.', a: [['/ciudadano/votacion.html', 'Ver boleta']] };
      case 'consulta':
        if (d.voto) return { t: 'Ya votaste en este ciclo', p: P.t('Gracias por participar. Tu comprobante es el {f}.', { f: d.voto.folio_comprobante }), a: [['/ciudadano/votacion.html', 'Ver mi comprobante']] };
        return { t: cierre ? P.t('Vota antes del {f}', { f: cierre }) : 'Vota por un proyecto', p: 'Elige un proyecto en la boleta de tu colonia. Tu voto es único y secreto, y al final descargas tu comprobante.', a: [['/ciudadano/votacion.html', 'Ir a votar']] };
      case 'resultados':
        return { t: 'Conoce el proyecto ganador', p: 'Ya se publicaron los resultados de la consulta. Revisa en el mapa qué proyecto ganó en tu colonia.', a: [['/ciudadano/mapa.html', 'Abrir mapa'], ['/ciudadano/votacion.html', 'Ver resultados']] };
      case 'ejecucion_seguimiento':
        return { t: 'Vigila la obra ganadora', p: d.ganador ? P.t('El proyecto {p} lleva {n} % de avance. Sube fotos del avance o reporta irregularidades.', { p: d.ganador.titulo, n: P.numero(d.ganador.avance_porcentaje, 0) }) : 'Sube fotos del avance de las obras o reporta irregularidades para que se atiendan.', a: [['/ciudadano/seguimiento.html', 'Ir a seguimiento']] };
      case 'evaluacion':
        return { t: 'Califica si el proyecto se cumplió', p: 'Tu opinión ayuda a evaluar el trabajo de la alcaldía y cierra el ciclo de participación.', a: [['/ciudadano/seguimiento.html', 'Calificar proyecto']] };
      default:
        return { t: c.nombre, p: '', a: [] };
    }
  }

  P.pagina(function (ctx) {
    var u = ctx.usuario;
    var nombre = u.nombre.split(' ')[0];
    var saludo = 'Bienvenida o bienvenido, ' + nombre;
    if (u.genero === 'mujer') saludo = 'Bienvenida, ' + nombre;
    if (u.genero === 'hombre') saludo = 'Bienvenido, ' + nombre;
    P.$('#saludo').textContent = saludo;
    if (P.param('bienvenida') === '1') {
      P.poner(P.$('#bienvenida'), u.debeVerificarCorreo ? '' : P.html`<div class="mensaje ok" role="status">${P.t('¡Tu cuenta quedó lista! Ya puedes participar en el simulador.')}</div>`);
    }
    var fases = (ctx.estado && ctx.estado.fases) || [];
    return P.get('/api/ciudadano/panel').then(function (d) {
      var c = d.ciclo;
      var activa = c ? c.fase_orden : 0;
      var faseActiva = fases.find(function (x) { return x.orden === activa; });
      var fin = faseActiva && faseActiva.fecha_fin;
      var sp = siguientePaso(d, fin);
      P.poner(P.$('#siguiente'), P.html`<span class="antetitulo">Tu siguiente paso</span>
        <h2>${P.t(sp.t)}</h2>${sp.p ? P.html`<p>${P.t(sp.p)}</p>` : ''}
        <div class="fila" style="gap:10px;margin-top:4px">${sp.a.map(function (a, i) {
          return i === 0 ? P.html`<a class="btn" href="${a[0]}">${a[1]}</a>` : P.html`<a href="${a[0]}" class="enlace-sp">${a[1]}</a>`;
        })}${sp.a.length < 2 && c ? P.html`<a href="#linea" class="enlace-sp">¿Qué sigue después?</a>` : ''}</div>`);
      var sel = activa || 1;
      var pintarLinea = function () {
        P.poner(P.$('#linea-fases'), fases.map(function (f) {
          var estado = !activa ? '' : (f.orden < activa ? 'Concluida' : (f.orden === activa ? 'Fase activa' : 'Próxima'));
          var clase = (f.orden === activa ? 'activa ' : '') + (f.orden < activa ? 'pasada ' : '') + (f.orden === sel ? 'elegida' : '');
          return P.html`<button type="button" class="fase-btn ${clase}" data-fase="${f.orden}" aria-pressed="${f.orden === sel ? 'true' : 'false'}">
            <span class="estado-fase">${estado ? P.t(estado) : ''}</span><strong>${f.orden}. ${P.nombre(f)}</strong><span class="tenue" style="font-size:12px">${rango(f)}</span></button>`;
        }));
        var f = fases.find(function (x) { return x.orden === sel; });
        if (!f) { P.poner(P.$('#detalle-fase'), ''); return; }
        var ir = IR[f.clave] || ['/ciudadano/inicio.html', 'Inicio'];
        var en = P.idioma() === 'en';
        P.poner(P.$('#detalle-fase'), P.html`<div class="crece"><div class="antetitulo gris">En la vida real</div><p>${en ? f.que_ocurre_en : f.que_ocurre_es}</p></div>
          <div class="crece"><div class="antetitulo gris">En el simulador puedes</div><p>${en ? f.que_puedes_hacer_en : f.que_puedes_hacer_es}</p><a class="btn" href="${ir[0]}">${ir[1]}</a></div>`);
      };
      pintarLinea();
      P.$('#linea-fases').addEventListener('click', function (e) {
        var b = e.target.closest('[data-fase]');
        if (!b) return;
        sel = Number(b.getAttribute('data-fase'));
        pintarLinea();
      });
      var pr = d.presupuesto;
      var nombreUt = (d.unidad && d.unidad.nombre) || u.unidad || '';
      if (pr) {
        var pIgual = pr.total ? Math.round(pr.igual / pr.total * 100) : 0;
        P.poner(P.$('#presupuesto'), P.html`<h2 class="h2-maq" style="margin:0">${P.t('Presupuesto de {u}', { u: nombreUt })}</h2>
          <div class="monto-grande">${P.dinero(pr.total).replace(/\.00$/, '')}</div>
          <div class="barra-doble" role="img" aria-label="${P.t('Parte igualitaria {a} %, parte por índices {b} %', { a: pIgual, b: 100 - pIgual })}"><span style="width:${pIgual}%"></span><span style="width:${100 - pIgual}%"></span></div>
          <div class="columna" style="gap:8px;font-size:15px">
            <div class="fila entre" style="flex-wrap:nowrap"><span><i class="cuadro a"></i>${P.t('Parte igualitaria ({p} % del total ÷ {n} colonias)', { p: P.numero(pr.porcentaje, 0), n: pr.unidades })}</span><strong>${P.dinero(pr.igual).replace(/\.00$/, '')}</strong></div>
            <div class="fila entre" style="flex-wrap:nowrap"><span><i class="cuadro b"></i>Parte por índices (pobreza, delitos, población)</span><strong>${P.dinero(pr.indices).replace(/\.00$/, '')}</strong></div>
          </div>
          <span class="tenue" style="font-size:13px">Montos ficticios calculados por el simulador.</span>
          ${c && c.convocatoria_uuid ? P.html`<a class="btn2 chico" style="align-self:flex-start" href="${P.img(c.convocatoria_uuid)}" target="_blank" rel="noopener">Ver convocatoria (PDF)</a>` : ''}`);
      } else {
        P.poner(P.$('#presupuesto'), P.html`<h2 class="h2-maq" style="margin:0">${P.t('Presupuesto de {u}', { u: nombreUt })}</h2>
          <p class="vacio">${c ? P.html`${P.t('Tu colonia no participa en el ciclo activo.')} <a href="/ciudadano/perfil.html#residencia">${P.t('Cambia tu colonia en Mi perfil')}</a> ${P.t('por una marcada con ✓ para practicar (solo antes de la Consulta).')}}` : P.t('Se mostrará cuando haya un ciclo activo.')}</p>`);
      }
      var av = d.avisos || [];
      P.poner(P.$('#avisos'), P.html`<h2 class="h2-maq" style="margin:0">Avisos</h2>
        ${av.length ? av.slice(0, 3).map(function (a, i) {
          return P.html`<div class="columna aviso-panel ${i ? 'separado' : ''}" style="gap:6px">
            <div class="fila entre"><strong>${a.titulo}</strong><span class="etq ok">${a.alcaldia ? P.t('Funcionario · {a}', { a: a.alcaldia }) : P.t('Administración · todas las alcaldías')}</span></div>
            <span class="texto-2" style="font-size:15px;line-height:1.5;white-space:pre-wrap">${a.mensaje}</span>
            <span class="tenue" style="font-size:12px">${P.fechaHora(a.publicado_en)}</span></div>`;
        }) : P.html`<p class="tenue" style="margin:0">No hay avisos por ahora.</p>`}`);
      var mp = d.misProyectos || [];
      P.poner(P.$('#mis-proyectos'), P.html`<div class="fila entre"><h2 class="h2-maq" style="margin:0">Mis proyectos</h2>
        <a href="/ciudadano/proyectos.html" style="font-size:14px;font-weight:600">${mp.length ? P.t('Ver todos') : P.t('Ver historial')}</a></div>
        ${mp.length ? mp.map(function (p) {
          return P.html`<a class="fila entre proyecto-mini" href="/ciudadano/proyectos.html#p${p.id}"><span><strong>${p.titulo}</strong><br><span class="tenue" style="font-size:13px">${P.t('Folio {f}', { f: p.folio })}</span></span>${P.estatus(p.estatus)}</a>`;
        }) : P.html`<p class="tenue" style="margin:0">${c && c.fase === 'diagnostico_registro' ? P.t('Aún no registras proyectos en este ciclo.') : P.t('No registraste proyectos en este ciclo.')}</p>`}`);
      if (location.hash === '#linea' || location.hash === '#presupuesto') {
        var dest = P.$(location.hash);
        if (dest) dest.scrollIntoView();
      }
    });
  });
}());
