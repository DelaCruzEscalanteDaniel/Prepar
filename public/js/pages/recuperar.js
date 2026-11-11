(function () {
  'use strict';
  var P = window.Prepar;
  P.pagina(function () {
    var form = P.$('#form-recuperar');
    var msg = P.$('#mensaje-recuperar');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = P.datosForm(form);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.correo)) {
        P.poner(msg, P.html`<div class="mensaje error" role="alert">El correo electrónico no es válido</div>`);
        return;
      }
      P.accion(form.querySelector('button[type=submit]'), function () {
        return P.post('/api/auth/recuperar', { correo: d.correo }, { sinRedirigir: true }).then(function (r) {
          P.poner(msg, P.html`<div class="mensaje ok" role="status">${P.t(r.mensaje)}</div>`);
          form.reset();
        });
      }, { destino: msg, sinAviso: true });
    });
  });
}());
