(function () {
  'use strict';
  var P = window.Prepar;
  var lista = [];
  var alcaldias = [];
  var tipo = '';
  function mosaico() {
    var cuenta = {};
    lista.forEach(function (d) { cuenta[d.alcaldia_id] = (cuenta[d.alcaldia_id] || 0) + 1; });
    P.$('#total-dir').textContent = P.t('{n} alcaldías', { n: alcaldias.length });
    P.poner(P.$('#directorio'), P.html`<p class="texto-2" style="margin:0">${P.t('Toca una alcaldía para ver sus contactos, o escribe arriba lo que buscas.')}</p>
      <div class="mosaico-alc">${alcaldias.map(function (a) {
        return P.html`<button type="button" class="tile-alc" data-alc="${a.id}" style="--c:${P.colorAlcaldia(a.id)}">
          <span class="grupo-dir-sello" aria-hidden="true">${P.seguro(P.iconoDir('alcaldia', 22))}</span>
          <strong>${a.nombre}</strong><span class="tenue">${P.t('{n} contacto(s)', { n: cuenta[a.id] || 0 })}</span></button>`;
      })}</div>`);
  }
  function pintar() {
    var f = P.datosForm(P.$('#filtros-dir'));
    if (!f.alcaldia && !f.q && !tipo) { mosaico(); return; }
    var vis = lista.filter(function (d) { return !tipo || d.tipo === tipo; });
    P.$('#total-dir').textContent = P.t('{n} resultados', { n: vis.length });
    if (!vis.length) {
      P.poner(P.$('#directorio'), P.html`<div class="tarjeta vacio-dir"><span aria-hidden="true">🔎</span><strong>${P.t('No encontramos contactos con esos filtros')}</strong>
        <span class="tenue">${P.t('Prueba con otra palabra (por ejemplo «participación») o elige «Todas» en alcaldía.')}</span></div>`);
      return;
    }
    var grupos = [];
    var idx = {};
    vis.forEach(function (d) {
      if (!(d.alcaldia_id in idx)) { idx[d.alcaldia_id] = grupos.length; grupos.push({ id: d.alcaldia_id, nombre: d.alcaldia, items: [] }); }
      grupos[idx[d.alcaldia_id]].items.push(d);
    });
    P.poner(P.$('#directorio'), grupos.map(function (g) {
      return P.html`<section class="grupo-dir" style="--c:${P.colorAlcaldia(g.id)}" aria-label="${g.nombre}">
        <div class="grupo-dir-cabeza"><span class="grupo-dir-sello" aria-hidden="true">${P.seguro(P.iconoDir('alcaldia', 20))}</span>
          <h2 class="h" style="margin:0;font-size:20px">${g.nombre}</h2><span class="tenue" style="font-size:13px">${P.t('{n} contacto(s)', { n: g.items.length })}</span></div>
        <div class="rejilla-chips">${g.items.map(function (d) { return P.tarjetaDirectorioCompacta(d); })}</div></section>`;
    }));
  }
  function recordar(alc) {
    try {
      var url = location.pathname + (alc ? '?alcaldia=' + encodeURIComponent(alc) : '');
      if (url !== location.pathname + location.search) history.pushState({ alcaldia: alc || '' }, '', url);
    } catch (e) { }
  }
  function cargar() {
    var f = P.datosForm(P.$('#filtros-dir'));
    P.$('#volver-dir').hidden = !f.alcaldia;
    P.poner(P.$('#directorio'), P.esqueleto(3, 80));
    return P.get('/api/directorio' + P.qs(f)).then(function (d) { lista = d; pintar(); },
      function (e) { P.poner(P.$('#directorio'), P.html`<p class="mensaje error">${e.message}</p>`); });
  }
  P.pagina(function (ctx) {
    return P.catalogos().then(function (cat) {
      alcaldias = cat.alcaldias;
      P.$('#directorio').addEventListener('click', function (e) {
        var t = e.target.closest('[data-alc]');
        if (!t) return;
        P.$('#f-alcaldia').value = t.getAttribute('data-alc');
        recordar(t.getAttribute('data-alc'));
        cargar().then(function () { P.$('#directorio').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      });
      P.poner(P.$('#f-alcaldia'), P.html`<option value="">Todas</option>${cat.alcaldias.map(function (a) { return P.html`<option value="${a.id}">${a.nombre}</option>`; })}`);
      var form = P.$('#filtros-dir');
      form.addEventListener('submit', function (e) { e.preventDefault(); cargar(); });
      form.addEventListener('input', P.debounce(function (e) { if (e.target.name === 'q') cargar(); }, 350));
      P.$('#f-alcaldia').addEventListener('change', function () { recordar(P.$('#f-alcaldia').value); cargar(); });
      P.$('#volver-dir').addEventListener('click', function () {
        if (history.state && history.state.alcaldia) { history.back(); return; }
        P.$('#f-alcaldia').value = ''; recordar(''); cargar();
      });
      window.addEventListener('popstate', function () {
        P.$('#f-alcaldia').value = P.param('alcaldia') || '';
        cargar();
      });
      var inicial = P.param('alcaldia');
      P.$('#limpiar-dir').addEventListener('click', function () {
        form.reset(); P.$('#f-alcaldia').value = ''; tipo = ''; recordar('');
        P.$$('[data-tipo]', P.$('#chips-tipo')).forEach(function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-tipo') === '' ? 'true' : 'false'); });
        cargar();
      });
      P.$('#chips-tipo').addEventListener('click', function (e) {
        var b = e.target.closest('[data-tipo]');
        if (!b) return;
        tipo = b.getAttribute('data-tipo');
        P.$$('[data-tipo]', P.$('#chips-tipo')).forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        pintar();
      });
      var u = ctx.usuario;
      if (u && u.alcaldiaId) {
        var b = P.$('#mi-alcaldia');
        b.hidden = false;
        b.textContent = P.t('Ver {a}', { a: u.alcaldia || P.t('mi alcaldía') });
        b.addEventListener('click', function () { P.$('#f-alcaldia').value = String(u.alcaldiaId); recordar(String(u.alcaldiaId)); cargar(); });
      }
      if (inicial && cat.alcaldias.some(function (a) { return String(a.id) === inicial; })) P.$('#f-alcaldia').value = inicial;
      try { history.replaceState({ alcaldia: P.$('#f-alcaldia').value || '' }, '', location.href); } catch (e) { }
      return cargar();
    });
  });
}());
