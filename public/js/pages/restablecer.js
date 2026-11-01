(function () {
  'use strict';
  var P = window.Prepar;
  P.pagina(function () {
    var m = /token=([A-Za-z0-9_-]+)/.exec(location.hash || '');
    var token = m ? m[1] : null;
    var form = P.$('#form-restablecer');
    var msg = P.$('#mensaje-restablecer');
    if (!token) {
      P.poner(msg, P.html`<div class="mensaje error" role="alert">El enlace no es válido o ya expiró. Solicita uno nuevo.</div>`);
      form.hidden = true;
      return;
    }
    history.replaceState(null, '', location.pathname);
    var campoPass = form.querySelector('[name=password]');
    var reglas = P.$('#reglas-restablecer');
    P.pintarReglasPassword(reglas, '');
    campoPass.addEventListener('input', function () { P.pintarReglasPassword(reglas, campoPass.value); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = P.datosForm(form);
      var errP = P.errorPassword(d.password);
      if (errP) { P.poner(msg, P.html`<div class="mensaje error" role="alert">${errP}</div>`); return; }
      if (d.password !== d.confirmar) { P.poner(msg, P.html`<div class="mensaje error">Las contraseñas no coinciden</div>`); return; }
      P.accion(form.querySelector('button[type=submit]'), function () {
        return P.post('/api/auth/restablecer', { token: token, password: d.password }, { sinRedirigir: true })
          .then(function () { location.href = '/login.html?registrado=1'; });
      }, { destino: msg });
    });
  });
}());
