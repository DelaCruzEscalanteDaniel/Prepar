(function () {
  'use strict';
  var P = window.Prepar;
  P.pagina(function (ctx) {
    var m = /token=([A-Za-z0-9_-]+)/.exec(location.hash || '');
    var token = m ? m[1] : null;
    var msg = P.$('#mensaje-verificar');
    var acciones = P.$('#acciones-verificar');
    var ir = P.$('#ir-verificar');
    var usuario = ctx && ctx.usuario;
    if (usuario) { ir.href = P.panelDe(usuario.rol); ir.textContent = P.t('Ir a mi inicio'); }
    if (!token) {
      P.poner(msg, P.html`<div class="mensaje error" role="alert">${P.t('El enlace no es válido o ya expiró. Inicia sesión y pide uno nuevo')}</div>`);
      acciones.hidden = false;
      return;
    }
    history.replaceState(null, '', location.pathname);
    return P.post('/api/auth/verificar-correo', { token: token }, { sinRedirigir: true }).then(function (r) {
      if (P.olvidarMarco) P.olvidarMarco();
      P.poner(msg, P.html`<div class="mensaje ok" role="status">${P.tMensaje(r.mensaje)}</div>`);
      acciones.hidden = false;
    }, function (e) {
      P.poner(msg, P.html`<div class="mensaje error" role="alert">${e.message}</div>`);
      acciones.hidden = false;
    });
  });
}());
