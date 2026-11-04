(function () {
  'use strict';
  var P = window.Prepar;
  P.pagina(function () {
    var form = P.$('#form-recuperar');
    var msg = P.$('#mensaje-recuperar');
    var captcha = P.captcha(P.$('#captcha-recuperar'));
    captcha.cargar();
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = P.datosForm(form);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.correo)) {
        P.poner(msg, P.html`<div class="mensaje error" role="alert">El correo electrónico no es válido</div>`);
        return;
      }
      if (captcha.vacio()) {
        P.poner(msg, P.html`<div class="mensaje error" role="alert">${P.t('Escribe el código que aparece en la imagen')}</div>`);
        captcha.enfocar();
        return;
      }
      P.accion(form.querySelector('button[type=submit]'), function () {
        return P.post('/api/auth/recuperar', Object.assign({ correo: d.correo }, captcha.datos()), { sinRedirigir: true }).then(function (r) {
          P.poner(msg, P.html`<div class="mensaje ok" role="status">${P.t(r.mensaje)}</div>`);
          form.reset();
          captcha.cargar();
        }, function (e) { captcha.cargar(); throw e; });
      }, { destino: msg, sinAviso: true });
    });
  });
}());
