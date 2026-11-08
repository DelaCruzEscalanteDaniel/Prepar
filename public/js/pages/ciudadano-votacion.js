(function () {
  'use strict';
  var P = window.Prepar;
  var datos = null;
  var elegido = null;
  var paso = 1;
  var CHECK = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>';

  function lugar(d) { return (d.unidad ? d.unidad.nombre + ', ' + d.unidad.alcaldia : ''); }
  function resumen(t) { var s = String(t || ''); return Array.from(s).length > 160 ? Array.from(s).slice(0, 157).join('') + '…' : s; }

  function encabezado(d, titulo, texto) {
    return P.html`<div><span class="antetitulo">${P.t('Boleta · {l}', { l: lugar(d) })}</span>
      <h1 class="titulo-pagina" style="margin:6px 0 4px">${P.t(titulo)}</h1><p class="texto-2" style="margin:0">${P.t(texto)}</p></div>`;
  }

  function opcion(p, activa) {
    var on = elegido && elegido.proyecto_id === p.proyecto_id;
    return P.html`<button type="button" class="opcion-voto ${on ? 'elegida' : ''}" data-elegir="${p.proyecto_id}" aria-pressed="${on ? 'true' : 'false'}" ${activa ? '' : P.seguro('disabled')}>
      <span class="num-boleta h">${p.numero_sorteo}</span>
      <span class="columna crece" style="gap:6px;text-align:left"><strong style="font-size:18px">${p.titulo}</strong><span class="texto-2" style="line-height:1.5">${resumen(p.descripcion)}</span>
        <span class="tenue" style="font-size:13px">${P.t(p.rubro)} · ${P.t('Costo')} ${P.dinero(p.costo_estimado).replace(/\.00$/, '')}</span></span>
      ${p.imagen_uuid ? P.html`<img src="${P.img(p.imagen_uuid)}" alt="" class="img-boleta" loading="lazy">` : ''}
      ${activa ? P.html`<span class="radio-maq"><span></span></span>` : ''}</button>`;
  }

  function comprobante(d) {
    var v = d.voto;
    return P.html`<div role="status" class="tarjeta columna voto-listo">
      <div class="ok-circulo grande">${P.seguro(CHECK)}</div>
      <h1 class="titulo-pagina" style="margin:0;font-size:30px">Tu voto quedó registrado</h1>
      <p class="texto-2" style="margin:0;line-height:1.55">Tu voto es secreto: el comprobante acredita que participaste, pero no dice por qué proyecto votaste.</p>
      <div class="caja-comprobante">
        <div><div class="tenue" style="font-size:13px">Folio de participación</div><div class="h" style="font-size:22px;font-weight:800;overflow-wrap:anywhere">${v.folio_comprobante}</div></div>
        <div><div class="tenue" style="font-size:13px">Fecha</div><div style="font-weight:700">${P.fechaLarga(v.participo_en)}${/\d{2}:\d{2}/.test(v.participo_en || '') ? ', ' + v.participo_en.slice(11, 16) : ''}</div></div>
        <div><div class="tenue" style="font-size:13px">Unidad territorial</div><div style="font-weight:700">${lugar(d)}</div></div>
      </div>
      <div class="fila"><button type="button" class="btn" id="descargar">Descargar comprobante (PDF)</button><a class="btn2" href="/ciudadano/inicio.html">Volver al inicio</a></div>
    </div>`;
  }

  function pintar() {
    var d = datos;
    var c = d.ciclo;
    var caja = P.$('#votacion');
    if (!c) { P.poner(caja, P.html`<h1 class="titulo-pagina">Votación</h1><div class="mensaje info">No hay un ciclo activo.</div>`); return; }
    if (!d.participa) { P.poner(caja, P.html`<h1 class="titulo-pagina">Votación</h1><div class="mensaje alerta"><span>${P.t('Tu colonia no participa en el ciclo activo, por lo que no hay boleta para ti.')} <a href="/ciudadano/perfil.html#residencia">${P.t('Cambia tu colonia en Mi perfil')}</a> ${P.t('por una marcada con ✓ para practicar (solo antes de la Consulta).')}</span></div>`); return; }
    var abierta = c.fase === 'consulta' && Number(c.votacion_abierta) === 1;
    if (d.voto) {
      P.poner(caja, comprobante(d));
      P.$('#descargar').addEventListener('click', function (e) { P.descargar('/api/votacion/comprobante', e.currentTarget); });
      return;
    }
    if (paso === 2 && elegido && abierta) {
      P.poner(caja, P.html`<div class="tarjeta columna" style="padding:28px;gap:16px">
        <h1 class="titulo-pagina" style="margin:0;font-size:30px">Confirma tu voto</h1>
        <p class="texto-2" style="margin:0">Una vez confirmado no podrás cambiarlo.</p>
        <div class="elegido-voto"><span class="num-boleta h lleno">${elegido.numero_sorteo}</span><strong style="font-size:18px">${elegido.titulo}</strong></div>
        <div class="fila"><button type="button" class="btn" id="confirmar">Confirmar voto</button><button type="button" class="btn2" id="volver">Cambiar elección</button></div></div>`);
      P.$('#volver').addEventListener('click', function () { paso = 1; pintar(); });
      P.$('#confirmar').addEventListener('click', function (e) {
        P.accion(e.currentTarget, function () {
          return P.post('/api/votacion', { proyecto_id: elegido.proyecto_id }).then(function () { paso = 3; P.celebrarVoto(); return cargar(); });
        });
      });
      return;
    }
    var aviso = '';
    if (!abierta) {
      if (c.fase === 'consulta') aviso = 'La fase de Consulta inició, pero la recepción de votos aún no está abierta.';
      else if (c.fase_orden < 4) aviso = P.t('La boleta se publica en la fase de Sorteo y Difusión y la votación es en la fase de Consulta. Fase actual: {f}.', { f: P.nombre(c, 'fase') });
      else if (c.fase_orden === 4) aviso = 'Esta es la boleta de tu colonia. Podrás votar cuando inicie la fase de Consulta.';
      else aviso = 'La votación de este ciclo ya terminó.';
    }
    P.poner(caja, P.html`${encabezado(d, abierta ? 'Elige un proyecto' : 'Boleta de tu colonia', 'Solo puedes votar una vez. Los proyectos aparecen en el orden del sorteo.')}
      ${aviso ? P.html`<div class="mensaje info">${P.t(aviso)}</div>` : ''}
      ${d.boleta.length ? d.boleta.map(function (p) { return opcion(p, abierta); })
        : (c.fase_orden >= 4 ? P.html`<p class="vacio">Tu colonia no tiene proyectos en la boleta.</p>` : '')}
      ${abierta && d.boleta.length ? P.html`<div class="fila" style="justify-content:flex-end"><button type="button" class="btn" id="continuar" ${elegido ? '' : P.seguro('disabled')}>Continuar</button></div>` : ''}`);
    var cont = P.$('#continuar');
    if (cont) cont.addEventListener('click', function () { if (elegido) { paso = 2; pintar(); window.scrollTo(0, 0); } });
  }

  function pintarResultados() {
    var res = P.$('#resultados');
    if (!datos.resultados || !datos.resultados.length) { P.poner(res, ''); return; }
    P.poner(res, P.html`<section class="tarjeta"><h2 class="h2-maq">Resultados de tu colonia</h2><div class="tabla-cont"><table>
      <thead><tr><th>Lugar</th><th>Proyecto</th><th class="num">Votos</th><th></th></tr></thead>
      <tbody>${datos.resultados.map(function (r) {
        return P.html`<tr><td>${r.posicion}</td><td>${r.titulo}<br><span class="tenue pequeno">${r.folio}</span></td><td class="num">${r.total_votos}</td>
          <td>${r.ganador ? P.html`<span class="etq ok">Ganador</span>` : ''}${r.caso_especial && r.ganador ? P.html` <span class="etq info">${P.t('Resuelto por asamblea')}</span>` : ''}</td></tr>`;
      })}</tbody></table></div></section>`);
  }

  function cargar() {
    return P.get('/api/votacion').then(function (d) { datos = d; pintar(); pintarResultados(); },
      function (e) { P.poner(P.$('#votacion'), P.html`<p class="mensaje error">${e.message}</p>`); });
  }
  P.pagina(function () {
    P.$('#votacion').addEventListener('click', function (e) {
      var b = e.target.closest('[data-elegir]');
      if (!b || b.disabled) return;
      elegido = datos.boleta.find(function (x) { return String(x.proyecto_id) === b.getAttribute('data-elegir'); }) || null;
      pintar();
      var cont = P.$('#continuar');
      if (cont) cont.focus({ preventScroll: true });
    });
    return cargar();
  });
}());
