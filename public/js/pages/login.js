(function () {
  'use strict';
  var P = window.Prepar;
  P.pagina(function () {
    var msg = P.$('#mensaje-login');
    if (P.param('expirada') === '1') P.poner(msg, P.html`<div class="mensaje alerta" role="status">Tu sesión se cerró por inactividad o expiró. Inicia sesión de nuevo.</div>`);
    if (P.param('registrado') === '1') P.poner(msg, P.html`<div class="mensaje ok" role="status">Tu contraseña se actualizó. Ya puedes iniciar sesión.</div>`);
    var form = P.$('#form-login');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = P.datosForm(form);
      if (!d.correo || !d.password) {
        P.poner(msg, P.html`<div class="mensaje error" role="alert">Escribe tu correo y tu contraseña</div>`);
        P.sacudir(form);
        return;
      }
      P.accion(form.querySelector('button[type=submit]'), function () {
        return P.post('/api/auth/login', { correo: d.correo, password: d.password }, { sinRedirigir: true }).then(function (r) {
          P.reiniciarAyuda();
          var volver = P.param('volver');
          var seguro = volver && /^\/(ciudadano|funcionario|admin)\/[a-z-]+(\.html)?(\?[\w=&%-]*)?(#[\w-]*)?$/.test(volver) && volver.indexOf(P.panelDe(r.rol).split('/')[1]) === 1;
          if (r.debeAceptarTerminos) location.href = '/terminos.html?aceptar=1&volver=' + encodeURIComponent(seguro && !r.debeCambiarPassword ? volver : (r.debeCambiarPassword ? '/funcionario/perfil.html?temporal=1' : P.panelDe(r.rol)));
          else location.href = r.debeCambiarPassword ? r.destino : (seguro ? volver : r.destino);
        });
      }, { destino: msg });
    });
  });
}());
