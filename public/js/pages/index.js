(function () {
  'use strict';
  var P = window.Prepar;
  var FUNCIONES = [
    { t: 'Foro vecinal', d: 'Comparte las necesidades de tu colonia, comenta y apoya las ideas de tus vecinos.', cta: 'Participar en el foro', href: '/ciudadano/foro.html', icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
    { t: 'Registra proyectos', d: 'Convierte una idea en proyecto: escribe su costo y dirección y recibe tu folio automático.', cta: 'Registrar proyecto', href: '/ciudadano/foro.html#registrar', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 18v-6M9 15h6' },
    { t: 'Vota', d: 'Elige un proyecto en la boleta de tu colonia. Tu voto es secreto y recibes un comprobante.', cta: 'Ir a votar', href: '/ciudadano/votacion.html', icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' },
    { t: 'Mapa de proyectos', d: 'Ubica los proyectos ganadores de cada colonia y revisa su avance y presupuesto.', cta: 'Ver mapa', href: '/ciudadano/mapa.html', icon: 'M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4zM8 2v16M16 6v16' },
    { t: 'Foto denuncia', d: 'Sube fotos del avance de las obras o reporta irregularidades para que se atiendan.', cta: 'Dar seguimiento', href: '/ciudadano/seguimiento.html', icon: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
    { t: 'Directorio público', d: 'Encuentra los datos de contacto de las 16 alcaldías de la Ciudad de México.', cta: 'Consultar directorio', href: '/directorio.html', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
  ];
  var FASES = [
    ['Convocatoria', 'Se publican reglas, fechas y el presupuesto de cada colonia.'],
    ['Diagnóstico y registro', 'Los vecinos debaten en el foro y registran proyectos.'],
    ['Dictaminación', 'Funcionarios revisan si cada proyecto es viable.'],
    ['Sorteo y difusión', 'Cada proyecto viable recibe su número en la boleta.'],
    ['Consulta', 'Votas por un proyecto de tu unidad territorial.'],
    ['Resultados', 'Se publican los proyectos ganadores.'],
    ['Ejecución y seguimiento', 'Se registra el avance y los vecinos suben fotos.'],
    ['Evaluación', 'Calificas si el proyecto se cumplió.'],
  ];
  P.pagina(function (ctx) {
    var u = ctx.usuario;
    var est = ctx.estado || {};
    var activa = est.ciclo ? est.ciclo.fase_orden : 0;
    P.poner(P.$('#lp-funciones'), FUNCIONES.map(function (f) {
      var destino = (!u && f.href.indexOf('/ciudadano/') === 0) ? '/registro.html' : f.href;
      return P.html`<a class="lp-tarjeta" href="${destino}">
        <span class="lp-icono">${P.seguro('<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + f.icon + '"></path></svg>')}</span>
        <strong class="h">${P.t(f.t)}</strong><span class="lp-desc">${P.t(f.d)}</span><span class="lp-cta">${P.t(f.cta)} <span aria-hidden="true">→</span></span></a>`;
    }));
    P.poner(P.$('#lp-fases'), FASES.map(function (f, i) {
      var tono = i < 2 ? 'a' : (i < 6 ? 'b' : 'c');
      return P.html`<li class="${i + 1 === activa ? 'activa' : ''}"><span class="lp-circulo ${tono} h">${i + 1}</span>
        <span class="columna" style="gap:4px"><strong>${P.t(f[0])}</strong><span class="lp-desc">${P.t(f[1])}</span>
        ${i + 1 === activa ? P.html`<span class="etq acento" style="align-self:flex-start">${P.t('Fase activa del simulador')}</span>` : ''}</span></li>`;
    }));
    if (u) {
      var panel = P.panelDe(u.rol);
      P.poner(P.$('#lp-acciones'), P.html`<button type="button" class="herr" data-accion="tema"></button>
        <button type="button" class="herr" data-accion="idioma"></button>
        <a class="btn lp-btn" href="${panel}">Ir a mi panel</a>`);
      var pm = P.$('#lp-principal-movil');
      if (pm) { pm.href = panel; pm.textContent = P.t('Ir a mi panel'); }
      P.poner(P.$('#lp-cta'), P.html`<a class="btn lp-btn" href="${panel}">Continuar mi simulación</a><a class="btn2 lp-btn2" href="#fases">Ver cómo funciona</a>`);
      var c2 = P.$('#lp-cta2');
      c2.href = panel;
      c2.textContent = P.t('Ir a mi panel');
      P.refrescarHerramientas();
    }
  });
}());
