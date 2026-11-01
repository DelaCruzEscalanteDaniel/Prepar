(function () {
  'use strict';
  var P = window.Prepar;
  P.pagina(function () {
    return P.get('/api/publico/privacidad').then(function (a) {
      P.$('#version-aviso').textContent = P.t('Versión {v}, vigente desde {f}', { v: a.version || '—', f: P.fecha(a.vigente_desde) });
      P.poner(P.$('#texto-aviso'), P.html`<p>${P.idioma() === 'en' ? (a.texto_en || a.texto_es) : a.texto_es}</p>`);
    });
  });
}());
