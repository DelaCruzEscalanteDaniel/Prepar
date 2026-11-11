(function () {
  'use strict';
  var P = window.Prepar;
  P.pagina(function () {
    var form = P.$('#form-registro');
    var msg = P.$('#mensaje-registro');
    var hoy = new Date();
    var max = new Date(hoy.getFullYear() - 18, hoy.getMonth(), hoy.getDate());
    var fecha = form.querySelector('[name=fecha_nacimiento]');
    fecha.max = max.toISOString().slice(0, 10);
    fecha.min = (hoy.getFullYear() - 120) + '-01-01';
    var avisoEdad = P.$('#aviso-edad');
    var btnCrear = P.$('#btn-crear');
    var edadDe = function (v) {
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
      if (!m) return null;
      var e = hoy.getFullYear() - Number(m[1]);
      var dm = (hoy.getMonth() + 1) - Number(m[2]);
      if (dm < 0 || (dm === 0 && hoy.getDate() < Number(m[3]))) e -= 1;
      return e >= 0 && e < 130 ? e : null;
    };
    var errorFecha = function () {
      if (fecha.validity && fecha.validity.badInput) return P.t('Esa fecha no existe. Revisa el día, el mes y el año.');
      if (!fecha.value) return null;
      if (fecha.value < fecha.min || fecha.value.slice(0, 4) > String(hoy.getFullYear())) {
        return P.t('Escribe un año de nacimiento entre {a} y {b}.', { a: fecha.min.slice(0, 4), b: hoy.getFullYear() - 18 });
      }
      return null;
    };
    var pintarEdad = function () {
      var ef = errorFecha();
      if (ef) { btnCrear.disabled = false; P.poner(avisoEdad, P.html`<div class="mensaje error" role="alert"><span>${ef}</span></div>`); return; }
      var e = edadDe(fecha.value);
      btnCrear.disabled = e !== null && e < 18;
      if (e === null) { P.poner(avisoEdad, ''); return; }
      P.poner(avisoEdad, e < 18
        ? P.html`<div class="mensaje error" role="alert"><span><strong>${P.t('No es posible crear la cuenta.')}</strong> ${P.t('Tienes {n} años y el simulador solo admite personas de 18 años o más.', { n: e })}</span></div>`
        : P.html`<div class="mensaje ok"><span>✓ ${P.t('Edad:')} <strong>${P.t('{n} años', { n: e })}</strong>. ${P.t('Solo se usa en estadísticas por grupos, nunca de forma individual.')}</span></div>`);
    };
    var pass = form.querySelector('[name=password]');
    var conf = form.querySelector('[name=confirmar]');
    var revisarPass = function () {
      var n = Array.from(pass.value).length;
      var nivel = P.$('#nivel-pass');
      nivel.className = 'ayuda';
      P.pintarReglasPassword(nivel, n ? pass.value : '');
      var igual = P.$('#igual-pass');
      if (!conf.value) { igual.textContent = ''; igual.className = 'ayuda'; conf.removeAttribute('aria-invalid'); return true; }
      var ok = conf.value === pass.value;
      igual.textContent = ok ? '✓ ' + P.t('Las contraseñas coinciden') : '✗ ' + P.t('No coinciden: escribe exactamente la misma contraseña');
      igual.className = 'ayuda ' + (ok ? 'ok-texto' : 'error-texto');
      if (ok) conf.removeAttribute('aria-invalid'); else conf.setAttribute('aria-invalid', 'true');
      return ok;
    };
    pass.addEventListener('input', revisarPass);
    conf.addEventListener('input', revisarPass);
    fecha.addEventListener('change', pintarEdad);
    fecha.addEventListener('input', pintarEdad);
    fecha.addEventListener('blur', pintarEdad);

    P.catalogos().then(function (cat) {
      P.selectoresUbicacion(P.$('#sel-alcaldia'), P.$('#sel-unidad'), cat);
    }, function (e) { P.poner(msg, P.html`<div class="mensaje error">${e.message}</div>`); });

    P.$('#ver-aviso').addEventListener('click', function () {
      P.get('/api/publico/privacidad').then(function (a) {
        P.modal({
          titulo: P.t('Aviso de privacidad'),
          ancho: true,
          contenido: P.html`<p class="tenue pequeno">${P.t('Versión')} ${a.version || ''}</p><div class="texto-2">${P.textoLegal(P.idioma() === 'en' ? (a.texto_en || a.texto_es) : a.texto_es)}</div>`,
          botones: [{ texto: 'Entendido', clase: 'btn' }],
        });
      }, function (e) { P.aviso(e.message, 'error'); });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = P.datosForm(form);
      var error = null;
      if (!d.nombre || Array.from(d.nombre).length < 3) error = 'Escribe tu nombre completo';
      else if (P.errorNombre(d.nombre)) error = P.errorNombre(d.nombre);
      else if (!P.correoValido(d.correo)) error = 'El correo electrónico no es válido';
      else if (P.errorPassword(d.password)) error = P.errorPassword(d.password);
      else if (!d.confirmar) error = 'Escribe tu contraseña otra vez en «Confirmar contraseña»';
      else if (d.confirmar !== d.password) error = 'Las contraseñas no coinciden: escribe la misma contraseña en los dos campos';
      else if (errorFecha()) error = errorFecha();
      else if (!d.fecha_nacimiento) error = 'Indica tu fecha de nacimiento';
      else if (d.fecha_nacimiento > fecha.max) error = 'Solo pueden registrarse personas mayores de 18 años';
      else if (!d.genero) error = 'Elige tu género';
      else if (!d.unidad_territorial_id) error = 'Elige tu colonia, barrio o pueblo';
      else if (!d.acepta_terminos) error = 'Debes aceptar los Términos y condiciones para crear tu cuenta';
      if (error) {
        P.poner(msg, P.html`<div class="mensaje error" role="alert">${P.t(error)}</div>`);
        msg.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      P.accion(form.querySelector('button[type=submit]'), function () {
        var cuerpo = {
          nombre: d.nombre, correo: d.correo, fecha_nacimiento: d.fecha_nacimiento,
          genero: d.genero, unidad_territorial_id: Number(d.unidad_territorial_id), acepta_terminos: true, acepta_aviso: true,
          password: d.password, confirmar: d.confirmar,
        };
        return P.post('/api/auth/registro', cuerpo, { sinRedirigir: true })
          .then(function (r) { P.reiniciarAyuda(); location.href = r.destino + '?bienvenida=1'; }, function (e) { throw e; });
      }, { destino: msg });
    });
  });
}());
