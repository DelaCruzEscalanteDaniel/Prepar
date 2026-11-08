(function () {
  'use strict';
  var P = window.Prepar;
  var TAREAS = [
    { cuenta: 'dictaminar', funcion: 'dictaminacion', titulo: 'Proyectos por dictaminar', detalle: 'Revisa los criterios y emite viable o no viable.', url: '/funcionario/dictaminacion.html', cta: 'Dictaminar', fases: ['dictaminacion'] },
    { cuenta: 'registros', funcion: 'revision_registros', titulo: 'Registros por revisar', detalle: 'Confirma que estén completos o pide una corrección.', url: '/funcionario/registros.html', cta: 'Revisar registros', fases: ['diagnostico_registro', 'dictaminacion'] },
    { cuenta: 'ideas_recientes', funcion: 'moderacion', titulo: 'Ideas nuevas en el foro', detalle: 'Publicadas en los últimos 7 días. Revisa que respeten las reglas.', url: '/funcionario/registros.html#moderacion', cta: 'Moderar foro', fases: ['diagnostico_registro'] },
    { cuenta: 'sorteos_pendientes', funcion: 'dictaminacion', titulo: 'Sorteos pendientes', detalle: 'Colonias sin boleta sorteada.', url: '/funcionario/sorteo.html', cta: 'Ir al sorteo', fases: ['sorteo_difusion'], soloFase: true },
    { cuenta: 'casos', funcion: 'consulta', titulo: 'Casos especiales', detalle: 'Empates, un solo proyecto o sin votos.', url: '/funcionario/sorteo.html#casos', cta: 'Resolver casos', fases: ['consulta', 'resultados'] },
    { cuenta: 'sin_ubicar', funcion: null, titulo: 'Proyectos sin ubicar', detalle: 'El sistema no encontró su dirección en el mapa.', url: '/funcionario/mapa.html', cta: 'Corregir ubicación', fases: ['diagnostico_registro', 'dictaminacion'] },
    { cuenta: 'reportes', funcion: 'seguimiento', titulo: 'Reportes de obra', detalle: 'Irregularidades y avances enviados por vecinos.', url: '/funcionario/seguimiento.html', cta: 'Ver reportes', fases: ['ejecucion_seguimiento', 'evaluacion'], rojo: true },
  ];
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MESES_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var TOCA = {
    convocatoria: ['Revisa la convocatoria y prepara a tu equipo. Puedes publicar avisos para los vecinos.', null],
    diagnostico_registro: ['Revisa que los registros de proyectos estén completos, modera el foro y corrige ubicaciones.', ['/funcionario/registros.html', 'Ir a registros']],
    dictaminacion: ['Dictamina cada proyecto como viable o no viable con los criterios del órgano dictaminador.', ['/funcionario/dictaminacion.html', 'Ir a dictaminación']],
    sorteo_difusion: ['Realiza el sorteo de cada colonia para asignar el número de los proyectos en la boleta.', ['/funcionario/sorteo.html', 'Ir al sorteo']],
    consulta: ['Los vecinos votan. Cuando el Administrador cuente los votos, resuelve los casos especiales de tu alcaldía.', ['/funcionario/sorteo.html#casos', 'Ver casos especiales']],
    resultados: ['Resuelve los casos especiales que falten para que el Administrador publique a los ganadores.', ['/funcionario/sorteo.html#casos', 'Ver casos especiales']],
    ejecucion_seguimiento: ['Registra el avance de las obras ganadoras y atiende los reportes de los vecinos.', ['/funcionario/seguimiento.html', 'Ir a seguimiento']],
    evaluacion: ['Revisa los reportes finales y la evaluación de los vecinos.', ['/funcionario/seguimiento.html', 'Ir a seguimiento']],
  };
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
  function lineaFases(estado) {
    var fases = (estado && estado.fases) || [];
    var act = P.faseActiva(estado);
    var activa = act ? act.orden : 0;
    if (!fases.length) { P.$('#linea').hidden = true; return; }
    var sel = activa || 1;
    var pintar = function () {
      P.poner(P.$('#linea-fases'), fases.map(function (f) {
        var est = !activa ? '' : (f.orden < activa ? 'Concluida' : (f.orden === activa ? 'Fase activa' : 'Próxima'));
        var clase = (f.orden === activa ? 'activa ' : '') + (f.orden < activa ? 'pasada ' : '') + (f.orden === sel ? 'elegida' : '');
        return P.html`<button type="button" class="fase-btn ${clase}" data-fase="${f.orden}" aria-pressed="${f.orden === sel ? 'true' : 'false'}">
          <span class="estado-fase">${est ? P.t(est) : ''}</span><strong>${f.orden}. ${P.nombre(f)}</strong><span class="tenue" style="font-size:12px">${rango(f)}</span></button>`;
      }));
      var f = fases.find(function (x) { return x.orden === sel; });
      if (!f) { P.poner(P.$('#detalle-fase'), ''); return; }
      var toca = TOCA[f.clave] || ['', null];
      var en = P.idioma() === 'en';
      P.poner(P.$('#detalle-fase'), P.html`<div class="crece"><div class="antetitulo gris">${P.t('En la vida real')}</div><p>${en ? f.que_ocurre_en : f.que_ocurre_es}</p></div>
        <div class="crece"><div class="antetitulo gris">${P.t('Lo que te toca como funcionario')}</div><p>${P.t(toca[0])}</p>${toca[1] && f.orden === activa ? P.html`<a class="btn" href="${toca[1][0]}">${P.t(toca[1][1])}</a>` : ''}</div>`);
    };
    pintar();
    P.$('#linea-fases').addEventListener('click', function (e) {
      var b = e.target.closest('[data-fase]');
      if (!b) return;
      sel = Number(b.getAttribute('data-fase'));
      pintar();
    });
  }
  function saludo() {
    var h = new Date().getHours();
    return h < 12 ? 'Buenos días, {n}' : (h < 19 ? 'Buenas tardes, {n}' : 'Buenas noches, {n}');
  }
  function haceDias(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    if (!m) return null;
    var d = Math.floor((Date.now() - new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()) / 86400000);
    return Math.max(0, d);
  }
  function cargarAvisos() {
    return P.get('/api/avisos').then(function (lista) {
      P.poner(P.$('#avisos'), lista.length ? lista.slice(0, 6).map(function (a) {
        return P.html`<div class="aviso-mini"><div class="fila entre"><strong>${a.titulo}</strong>
          <span class="fila" style="gap:6px">${a.activo ? '' : P.html`<span class="etq">Retirado</span>`}<span class="etq">${a.alcaldia || P.t('Todas las alcaldías')}</span></span></div>
          <span class="texto-2" style="font-size:14px;white-space:pre-wrap">${a.mensaje}</span>
          <span class="tenue" style="font-size:12px">${a.autor} · ${P.fechaHora(a.publicado_en)}${a.vigente_hasta ? ' · ' + P.t('vigente hasta el {f}', { f: P.fechaLarga(a.vigente_hasta) }) : ''}
          ${a.es_mio && a.activo ? P.html` · <button type="button" class="enlace-boton" data-retirar="${a.id}">Retirar</button>` : ''}</span></div>`;
      }) : P.html`<p class="tenue" style="margin:0">No hay avisos publicados en este ciclo.</p>`);
    }, function (e) { P.poner(P.$('#avisos'), P.html`<p class="mensaje error">${e.message}</p>`); });
  }
  P.pagina(function (ctx) {
    var u = ctx.usuario;
    P.poner(P.$('#chip-fase'), P.chipFase(ctx.estado));
    lineaFases(ctx.estado);
    P.$('#saludo').textContent = P.t(saludo(), { n: u.nombre.split(' ')[0] });
    P.$('#sub-inicio').textContent = P.t('Esto es lo que tienes pendiente en {a}. Empieza por lo marcado como prioridad.', { a: u.alcaldia });
    P.poner(P.$('#alcance'), P.html`<option value="mi_alcaldia">${u.alcaldia}</option><option value="todas">${P.t('Todas las alcaldías')}</option>`);
    P.$('#vigente').min = P.hoy();
    P.$('#dir-enlace').textContent = P.t('Editar datos de {a}', { a: u.alcaldia });
    var form = P.$('#form-aviso');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = P.datosForm(form);
      var msg = P.$('#msg-aviso');
      if (Array.from(d.titulo).length < 3 || Array.from(d.mensaje).length < 5) { P.poner(msg, P.html`<div class="mensaje error" role="alert">${P.t('Escribe el título y el mensaje del aviso')}</div>`); return; }
      P.accion(form.querySelector('button'), function () {
        return P.post('/api/avisos', { titulo: d.titulo, mensaje: d.mensaje, alcance: d.alcance, vigente_hasta: d.vigente_hasta || null }).then(function () {
          form.reset();
          P.$$('textarea, input', form).forEach(function (x) { x.dispatchEvent(new Event('input')); });
          P.poner(msg, P.html`<div class="mensaje ok" role="status">${d.alcance === 'todas' ? P.t('Aviso publicado. Ya aparece en el inicio de los ciudadanos de todas las alcaldías.') : P.t('Aviso publicado. Ya aparece en el inicio de los ciudadanos de {a}.', { a: u.alcaldia })}</div>`);
          cargarAvisos();
          return null;
        });
      }, { destino: msg });
    });
    P.$('#avisos').addEventListener('click', function (e) {
      var b = e.target.closest('[data-retirar]');
      if (!b) return;
      P.confirmar(P.t('¿Retirar el aviso?'), P.t('Dejará de mostrarse a los ciudadanos.'), { si: 'Retirar', peligro: true }).then(function (ok) {
        if (ok) P.accion(b, function () { return P.post('/api/avisos/' + b.getAttribute('data-retirar') + '/retirar').then(function (r) { cargarAvisos(); return r; }); });
      });
    });
    cargarAvisos();
    return P.get('/api/func/panel').then(function (d) {
      var dir = d.directorio;
      var dias = dir && haceDias(dir.ultima);
      P.$('#dir-fecha').textContent = dias === null || dias === undefined ? P.t('Aún no hay datos capturados')
        : (dias === 0 ? P.t('Última actualización: hoy') : P.t('Última actualización: hace {n} días', { n: dias }));
      if (!d.ciclo) { P.poner(P.$('#tareas'), P.html`<div class="mensaje info" style="grid-column:1/-1">No hay un ciclo activo. Cuando el Administrador active uno verás aquí tus pendientes.</div>`); return; }
      var c = d.conteos || {};
      var fase = d.ciclo.fase;
      var lista = TAREAS.filter(function (t) { return !t.funcion || u.funciones.indexOf(t.funcion) >= 0; })
        .filter(function (t) { return !t.soloFase || t.fases.indexOf(fase) >= 0; })
        .map(function (t, i) { return { t: t, n: Number(c[t.cuenta] || 0), rel: t.fases.indexOf(fase) >= 0 ? 1 : 0, i: i }; })
        .sort(function (a, b) { return (b.rel - a.rel) || ((b.n > 0) - (a.n > 0)) || (a.i - b.i); })
        .slice(0, 4);
      var prio = lista.find(function (x) { return x.n > 0 && x.rel; }) || lista.find(function (x) { return x.n > 0; });
      P.poner(P.$('#tareas'), lista.map(function (x) {
        var esPrio = x === prio;
        return P.html`<article class="tarjeta tarea ${esPrio ? 'prioridad' : ''}">
          <div class="fila entre"><span class="h num-tarea ${esPrio ? 'acento' : (x.t.rojo && x.n ? 'rojo' : 'amarillo')}">${x.n}</span>${esPrio ? P.html`<span class="etq acento">Prioridad</span>` : ''}</div>
          <strong style="font-size:16px">${x.t.titulo}</strong>
          <span class="tenue" style="font-size:14px;line-height:1.45">${x.t.detalle}</span>
          <a class="btn2" href="${x.t.url}" style="margin-top:auto">${x.t.cta}</a></article>`;
      }));
    });
  });
}());
