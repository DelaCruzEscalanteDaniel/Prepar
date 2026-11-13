(function () {
  'use strict';
  var P = window.Prepar;
  P.pagina(function (ctx) {
    var aceptar = P.param('aceptar') === '1' && !!ctx.usuario;
    var volver = P.param('volver') || '';
    var destinoSeguro = /^\/(ciudadano|funcionario|admin)\/[a-z-]+(\.html)?(\?[\w=&%-]*)?$/.test(volver) ? volver : null;
    var version = null;
    var form = P.$('#form-aceptar');
    P.$('#caja-aceptar').hidden = !aceptar;
    form.hidden = !aceptar;
    if (aceptar) P.$('#volver-terminos').hidden = true;
    form.acepto.addEventListener('change', function () { P.$('#btn-aceptar').disabled = !form.acepto.checked; });
    P.$('#no-acepto').addEventListener('click', function () {
      P.post('/api/auth/logout', {}, { sinRedirigir: true }).catch(function () { return null; }).then(function () { location.href = '/'; });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.acepto.checked) { P.poner(P.$('#msg-aceptar'), P.html`<div class="mensaje error" role="alert">${P.t('Marca la casilla para aceptar los Términos y condiciones')}</div>`); return; }
      P.accion(P.$('#btn-aceptar'), function () {
        return P.post('/api/auth/aceptar-terminos', { acepto: true, version: version }).then(function (r) {
          location.href = destinoSeguro && destinoSeguro.indexOf(P.panelDe(ctx.usuario.rol).split('/')[1]) === 1 ? destinoSeguro : r.destino;
          return null;
        });
      }, { destino: P.$('#msg-aceptar') });
    });
    return P.get('/api/publico/terminos').then(function (t) {
      version = t.version;
      P.$('#version-terminos').textContent = P.t('Versión {v}, vigente desde {f}', { v: t.version || '—', f: P.fecha(t.vigente_desde) });
      var texto = P.idioma() === 'en' ? (t.texto_en || t.texto_es) : t.texto_es;
      var partes = String(texto || '').split(/\n\s*\n/).filter(Boolean);
      if (partes.length > 1) partes.shift();
      P.poner(P.$('#texto-terminos'), partes.map(function (x) {
        var m = /^(\d+\.\s[^.]+\.)\s*([\s\S]*)$/.exec(x);
        return m ? P.html`<p><strong>${m[1]}</strong> ${m[2]}</p>` : P.html`<p>${x}</p>`;
      }));
    }, function (e) { P.poner(P.$('#texto-terminos'), P.html`<p class="mensaje error">${e.message}</p>`); });
  });
}());
