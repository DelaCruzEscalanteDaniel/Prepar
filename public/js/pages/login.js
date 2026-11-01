(function () {
  'use strict';
  var P = window.Prepar;
  P.pagina(function () {
    var msg = P.$('#mensaje-login');
    if (P.param('expirada') === '1') P.poner(msg, P.html`<div class="mensaje alerta" role="status">Tu sesión se cerró por inactividad o expiró. Inicia sesión de nuevo.</div>`);
    if (P.param('registrado') === '1') P.poner(msg, P.html`<div class="mensaje ok" role="status">Tu contraseña se actualizó. Ya puedes iniciar sesión.</div>`);
    var AVISOS_GOOGLE = {
      sin_configurar: ['alerta', 'El inicio de sesión con Google todavía no está activado en este servidor. Usa tu correo y contraseña.'],
      cancelado: ['alerta', 'Cancelaste el inicio de sesión con Google.'],
      error: ['error', 'No se pudo iniciar sesión con Google. Intenta de nuevo o usa tu correo y contraseña.'],
      suspendida: ['error', 'Tu cuenta está suspendida. Comunícate con el Administrador'],
      inactiva: ['error', 'Tu cuenta está desactivada'],
    };
    var g = AVISOS_GOOGLE[P.param('google')];
    if (g) P.poner(msg, P.html`<div class="mensaje ${g[0]}" role="alert">${P.t(g[1])}</div>`);
    var captcha = P.captcha(P.$('#captcha-login'));
    var form = P.$('#form-login');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = P.datosForm(form);
      if (!d.correo || !d.password) {
        P.poner(msg, P.html`<div class="mensaje error" role="alert">Escribe tu correo y tu contraseña</div>`);
        return;
      }
      if (captcha.vacio()) {
        P.poner(msg, P.html`<div class="mensaje error" role="alert">${P.t('Escribe el código que aparece en la imagen')}</div>`);
        captcha.enfocar();
        return;
      }
      P.accion(form.querySelector('button[type=submit]'), function () {
        return P.post('/api/auth/login', Object.assign({ correo: d.correo, password: d.password }, captcha.datos()), { sinRedirigir: true }).catch(function (e) {
          if (e.codigo === 'captcha' || captcha.visible()) captcha.mostrar();
          throw e;
        }).then(function (r) {
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
