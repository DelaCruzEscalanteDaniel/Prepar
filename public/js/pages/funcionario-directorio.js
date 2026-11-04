(function () {
  'use strict';
  var P = window.Prepar;
  var u = null;
  var lista = [];
  var puede = false;
  var sel = null;
  var confirmando = null;

  function pintar() {
    P.poner(P.$('#directorio'), lista.length ? lista.map(function (x) {
      var elegido = sel && sel.id === x.id;
      return P.html`<article class="tarjeta registro-dir ${elegido ? 'elegido' : ''}">
        <strong>${x.cargo}</strong>${x.nombre_titular ? P.html`<span class="texto-2" style="font-size:14px">${x.nombre_titular}</span>` : ''}
        ${x.telefono ? P.html`<span class="tenue" style="font-size:13px">${P.t('Tel.')} ${x.telefono}</span>` : ''}
        ${x.origen === 'api' ? P.html`<span class="etq info" style="align-self:flex-start">${P.t('Dato de API')}</span>` : ''}
        ${puede ? (confirmando === x.id ? P.html`<div class="confirma-borrar"><span style="font-size:14px">${P.t('¿Eliminar este registro? Dejará de verse en el directorio público.')}</span>
            <div class="fila" style="gap:8px"><button type="button" class="btn btn-rojo" data-borrar="${x.id}">Sí, eliminar</button><button type="button" class="btn2" data-cancelar>Cancelar</button></div></div>`
          : P.html`<div class="fila" style="gap:8px;margin-top:4px"><button type="button" class="btn2" data-editar="${x.id}">Editar</button><button type="button" class="btn2" data-pedir="${x.id}">Eliminar</button></div>`) : ''}
      </article>`;
    }) : P.html`<p class="vacio">Tu alcaldía todavía no tiene registros en el directorio.</p>`);
  }
  function validarTel() {
    var t = P.$('#form-dir').telefono.value.trim();
    var m = P.$('#tel-msg');
    if (!t) { m.textContent = ''; return true; }
    var ok = /^\d{10}$/.test(t);
    m.textContent = ok ? '✓ ' + P.t('Teléfono válido') : P.t('Faltan dígitos: deben ser 10');
    m.className = 'nota-campo ' + (ok ? 'ok-texto' : 'error-texto');
    return ok;
  }
  function editar(x) {
    sel = x || null;
    var f = P.$('#form-dir');
    f.hidden = !puede;
    P.$('#tit-form').textContent = P.t(sel ? 'Editar registro' : 'Agregar registro');
    ['cargo', 'nombre_titular', 'temas', 'direccion', 'telefono', 'correo', 'sitio_web'].forEach(function (k) { f[k].value = sel && sel[k] ? sel[k] : ''; });
    f.tipo.value = sel ? sel.tipo : 'sede_atencion';
    P.poner(P.$('#msg-dir'), '');
    validarTel();
    pintar();
  }
  function cargar(idElegir) {
    return P.get('/api/directorio' + P.qs({ alcaldia: u.alcaldiaId })).then(function (d) {
      lista = d.filter(function (x) { return x.alcaldia_id === u.alcaldiaId; });
      var e = lista.find(function (x) { return x.id === idElegir; }) || lista[0] || null;
      if (puede) editar(e); else pintar();
    }, function (e) { P.poner(P.$('#directorio'), P.html`<p class="mensaje error">${e.message}</p>`); });
  }
  P.pagina(function (ctx) {
    u = ctx.usuario;
    puede = u.funciones.indexOf('directorio') >= 0;
    P.$('#nuevo').hidden = !puede;
    if (!puede) P.poner(P.$('#aviso-dir'), P.html`<div class="mensaje info">Puedes consultar el directorio. Para editarlo necesitas la función de Directorio.</div>`);
    P.$('#nuevo').addEventListener('click', function () { confirmando = null; editar(null); P.$('#form-dir').cargo.focus(); });
    P.$('#cancelar-dir').addEventListener('click', function () { editar(lista[0] || null); });
    P.$('#form-dir').telefono.addEventListener('input', function (e) { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10); validarTel(); });
    P.$('#directorio').addEventListener('click', function (e) {
      var ed = e.target.closest('[data-editar]');
      var pe = e.target.closest('[data-pedir]');
      var bo = e.target.closest('[data-borrar]');
      if (ed) { confirmando = null; editar(lista.find(function (x) { return String(x.id) === ed.getAttribute('data-editar'); })); }
      else if (pe) { confirmando = Number(pe.getAttribute('data-pedir')); pintar(); }
      else if (e.target.closest('[data-cancelar]')) { confirmando = null; pintar(); }
      else if (bo) {
        P.accion(bo, function () {
          return P.del('/api/func/directorio/' + bo.getAttribute('data-borrar')).then(function (r) { confirmando = null; sel = null; return cargar().then(function () { return r; }); });
        });
      }
    });
    P.$('#form-dir').addEventListener('submit', function (e) {
      e.preventDefault();
      var d = P.datosForm(e.target);
      if (Array.from(d.cargo).length < 2) { P.poner(P.$('#msg-dir'), P.html`<span class="error-campo">${P.t('Escribe el cargo o área')}</span>`); return; }
      if (!validarTel()) { P.poner(P.$('#msg-dir'), P.html`<span class="error-campo">${P.t('El teléfono debe tener 10 dígitos')}</span>`); return; }
      d.alcaldia_id = u.alcaldiaId;
      var id = sel && sel.id;
      P.accion(P.$('#guardar-dir'), function () {
        return (id ? P.put('/api/func/directorio/' + id, d) : P.post('/api/func/directorio', d)).then(function (r) {
          return cargar(id || r.id).then(function () {
            P.poner(P.$('#msg-dir'), P.html`<span role="status" class="ok-texto" style="font-weight:600">✓ ${P.t('Guardado y visible en el directorio público.')}</span>`);
            return null;
          });
        });
      }, { destino: P.$('#msg-dir') });
    });
    return P.catalogos().then(function (cat) {
      var a = cat.alcaldias.find(function (x) { return x.id === u.alcaldiaId; });
      if (a) P.$('#tit-dir').textContent = P.t('Directorio de {a}', { a: a.nombre });
      return cargar();
    });
  });
}());
