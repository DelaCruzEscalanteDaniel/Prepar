(function () {
  'use strict';
  var P = window.Prepar;
  var cat = null;
  var funcionarios = [];
  var paginaC = 1;
  var totalC = 0;

  function pestana(n) {
    P.$$('[data-pestana]').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-pestana') === n ? 'true' : 'false'); });
    P.$$('[data-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== n; });
    if (n === 'ciudadanos') cargarCiudadanos();
  }

  function chipEstado(e) {
    var ok = e === 'activa';
    return P.html`<span class="${ok ? 'chip-ok' : 'chip-no'}">${P.textoEstatus(e)}</span>`;
  }
  function cargarFuncionarios() {
    return P.get('/api/admin/funcionarios').then(function (lista) {
      funcionarios = lista;
      P.$('[data-n="funcionarios"]').textContent = P.numero(lista.length, 0);
      P.poner(P.$('#funcionarios'), lista.length ? P.html`<table><thead><tr><th>Nombre</th><th>Alcaldía</th><th>Funciones</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
        ${lista.map(function (f) {
          return P.html`<tr><td><strong>${f.nombre_completo}</strong><br><span class="tenue pequeno">${f.correo}</span>${f.debe_cambiar_password ? P.html`<br><span class="etq alerta">${P.t('Contraseña temporal')}</span>` : ''}</td><td>${f.alcaldia}</td>
            <td class="texto-2">${f.funciones.map(function (x) { return P.t(P.FUNCIONES[x] || x); }).join(', ')}</td>
            <td>${chipEstado(f.estado)}<br><span class="tenue pequeno">${P.t('Último acceso')}: ${f.ultimo_acceso ? P.fechaHora(f.ultimo_acceso) : P.t('Nunca')}</span></td>
            <td><div class="fila" style="gap:6px"><button type="button" class="btn2 chico" data-editar="${f.id}">Editar</button>
              ${f.estado === 'activa' ? P.html`<button type="button" class="btn2 chico" data-estado="desactivada" data-id="${f.id}">Desactivar</button>` : P.html`<button type="button" class="btn2 chico" data-estado="activa" data-id="${f.id}">Reactivar</button>`}
              <button type="button" class="btn2 chico" data-restablecer="${f.id}">Nueva contraseña</button></div></td></tr>`;
        })}</tbody></table>` : P.html`<p class="vacio" style="margin:12px">Aún no hay funcionarios registrados</p>`);
    }, function (e) { P.poner(P.$('#funcionarios'), P.html`<p class="mensaje error">${e.message}</p>`); });
  }

  function mostrarTemporal(nombre, pass) {
    P.modal({
      titulo: P.t('Contraseña temporal'),
      contenido: P.html`<p>${P.t('Entrégale a {n} esta contraseña temporal. Solo se muestra una vez; el sistema le pedirá cambiarla al entrar.', { n: nombre })}</p>
        <div class="kpi"><span class="valor" style="font-size:28px;user-select:all" data-sin-traducir>${pass}</span></div>
        <p class="tenue pequeno">También se dejó en la cola de correos para enviársela.</p>`,
      botones: [{ texto: 'Copiar', clase: 'btn2', accion: function () { if (navigator.clipboard) navigator.clipboard.writeText(pass).then(function () { P.aviso('Copiada'); }, function () { return null; }); } },
        { texto: 'Listo', clase: 'btn' }],
    });
  }

  var editando = null;
  var elegidas = [];
  function pintarChips() {
    P.poner(P.$('#chips-func'), Object.keys(P.FUNCIONES).map(function (k) {
      var on = elegidas.indexOf(k) >= 0;
      return P.html`<button type="button" class="chk-func ${on ? 'on' : ''}" aria-pressed="${on ? 'true' : 'false'}" data-funcion="${k}"><span class="caja-check" aria-hidden="true">✓</span>${P.t(P.FUNCIONES[k])}</button>`;
    }));
  }
  function formFuncionario(f) {
    editando = f || null;
    var form = P.$('#form-func');
    form.reset();
    form.hidden = false;
    P.$('#nuevo-func').hidden = true;
    P.poner(P.$('#msg-func'), '');
    P.poner(P.$('#ok-func'), '');
    P.$('#tit-func').textContent = P.t(f ? 'Editar funcionario' : 'Nuevo funcionario');
    P.$$('[data-nuevo]', form).forEach(function (x) { x.hidden = !!f; });
    var dato = P.$('#dato-func');
    dato.hidden = !f;
    dato.textContent = f ? f.nombre_completo + ' · ' + f.correo : '';
    P.$('#guardar-func').textContent = P.t(f ? 'Guardar cambios' : 'Registrar y enviar acceso');
    form.alcaldia_id.value = f ? String(f.alcaldia_id) : '';
    elegidas = f ? f.funciones.slice() : [];
    pintarChips();
    (f ? form.alcaldia_id : form.nombre).focus();
  }
  function cerrarForm() { P.$('#form-func').hidden = true; P.$('#nuevo-func').hidden = false; editando = null; }

  function cargarCiudadanos() {
    var f = P.datosForm(P.$('#filtros-ciu'));
    f.pagina = paginaC;
    f.limite = 50;
    return P.get('/api/admin/ciudadanos' + P.qs(f)).then(function (d) {
      totalC = d.total;
      var paginas = Math.max(1, Math.ceil(totalC / 50));
      if (!f.q && !f.estado && !f.alcaldia) P.$('[data-n="ciudadanos"]').textContent = P.numero(totalC, 0);
      P.$('#pag-ciu').textContent = P.t('Página {p} de {t}', { p: paginaC, t: paginas });
      P.$('#ant-ciu').disabled = paginaC <= 1;
      P.$('#sig-ciu').disabled = paginaC >= paginas;
      P.poner(P.$('#ciudadanos'), d.ciudadanos.length ? P.html`<table><thead><tr><th>Nombre</th><th>Residencia</th><th>Rango de edad</th><th>Estado</th><th>Acción</th></tr></thead><tbody>
        ${d.ciudadanos.map(function (c) {
          return P.html`<tr><td><strong>${c.nombre_completo}</strong><br><span class="tenue pequeno">${c.correo}</span></td><td>${c.unidad_territorial}, ${c.alcaldia}</td>
            <td>${P.t({ '18-29': '18 a 29', '30-44': '30 a 44', '45-59': '45 a 59', '60+': '60 o más' }[c.rango_edad] || '—')}</td><td>${chipEstado(c.estado)}${c.estado === 'suspendida' && c.ultimo_motivo ? P.html`<br><span class="tenue pequeno">${c.ultimo_motivo}</span>` : ''}</td>
            <td>${c.estado === 'suspendida' ? P.html`<button type="button" class="btn2 chico" data-reactivar="${c.id}">Reactivar</button>` : P.html`<button type="button" class="btn2 chico" data-suspender="${c.id}" data-nombre="${c.nombre_completo}">Suspender</button>`}</td></tr>`;
        })}</tbody></table>` : P.html`<p class="vacio" style="margin:12px">No hay ciudadanos con estos filtros</p>`);
    }, function (e) { P.poner(P.$('#ciudadanos'), P.html`<p class="mensaje error">${e.message}</p>`); });
  }

  P.pagina(function () {
    P.$$('[data-pestana]').forEach(function (b) { b.addEventListener('click', function () { pestana(b.getAttribute('data-pestana')); }); });
    P.$('#nuevo-func').addEventListener('click', function () { formFuncionario(null); });
    P.$('#cancelar-func').addEventListener('click', cerrarForm);
    P.$('#chips-func').addEventListener('click', function (e) {
      var b = e.target.closest('[data-funcion]');
      if (!b) return;
      var k = b.getAttribute('data-funcion');
      var i = elegidas.indexOf(k);
      if (i >= 0) elegidas.splice(i, 1); else elegidas.push(k);
      pintarChips();
      P.$('[data-funcion="' + k + '"]').focus();
    });
    P.$('#form-func').addEventListener('submit', function (e) {
      e.preventDefault();
      var f = editando;
      var d = P.datosForm(e.target);
      var err = !f && Array.from(d.nombre).length < 3 ? 'Escribe el nombre completo' : (!f && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.correo) ? 'El correo electrónico no es válido'
        : (!d.alcaldia_id ? 'Elige la alcaldía' : (!elegidas.length ? 'Selecciona al menos una función' : null)));
      if (err) { P.poner(P.$('#msg-func'), P.html`<div class="mensaje error">${P.t(err)}</div>`); return; }
      var cuerpo = { alcaldia_id: Number(d.alcaldia_id), funciones: elegidas.slice() };
      if (!f) { cuerpo.nombre = d.nombre; cuerpo.correo = d.correo; }
      P.accion(P.$('#guardar-func'), function () {
        return (f ? P.put('/api/admin/funcionarios/' + f.id, cuerpo) : P.post('/api/admin/funcionarios', cuerpo)).then(function (r) {
          cerrarForm();
          cargarFuncionarios();
          if (!f) {
            P.poner(P.$('#ok-func'), r.correoEnviado
              ? P.html`<div role="status" class="caja-ok">${P.t('{n} quedó registrado. Se está enviando su contraseña temporal a su correo.', { n: d.nombre })}
                <span class="texto-2" style="font-weight:400">${P.t('Si el correo no llega, entrégale esta contraseña temporal (solo se muestra una vez):')} <code data-sin-traducir style="user-select:all">${r.passwordTemporal}</code></span></div>`
              : P.html`<div role="status" class="mensaje alerta"><span><strong>${P.t('{n} quedó registrado, pero el correo no se envió', { n: d.nombre })}</strong>
                ${P.t('porque el envío de correos aún no está configurado. Entrégale tú esta contraseña temporal (solo se muestra una vez):')} <code data-sin-traducir style="user-select:all;font-size:16px">${r.passwordTemporal}</code>
                <br><a href="/admin/integraciones.html#correo">${P.t('Configurar el envío de correos')}</a></span></div>`);
          } else P.poner(P.$('#ok-func'), P.html`<div role="status" class="caja-ok">${P.t('Los cambios de {n} se guardaron.', { n: f.nombre_completo })}</div>`);
          return null;
        });
      }, { destino: P.$('#msg-func') });
    });
    P.$('#filtros-ciu').addEventListener('submit', function (e) { e.preventDefault(); paginaC = 1; cargarCiudadanos(); });
    P.$('#limpiar-ciu').addEventListener('click', function () { P.$('#filtros-ciu').reset(); paginaC = 1; cargarCiudadanos(); });
    P.$('#ant-ciu').addEventListener('click', function () { paginaC = Math.max(1, paginaC - 1); cargarCiudadanos(); });
    P.$('#sig-ciu').addEventListener('click', function () { paginaC += 1; cargarCiudadanos(); });
    document.addEventListener('click', function (e) {
      var t = e.target;
      var ed = t.closest('[data-editar]');
      if (ed) { formFuncionario(funcionarios.find(function (f) { return String(f.id) === ed.getAttribute('data-editar'); })); return; }
      var rs = t.closest('[data-restablecer]');
      if (rs) {
        var f = funcionarios.find(function (x) { return String(x.id) === rs.getAttribute('data-restablecer'); });
        P.confirmar(P.t('¿Generar una nueva contraseña temporal?'), P.t('Se cerrarán las sesiones de {n} y deberá cambiarla al entrar.', { n: f.nombre_completo }), { si: 'Generar' }).then(function (ok) {
          if (ok) P.accion(rs, function () { return P.post('/api/admin/funcionarios/' + f.id + '/restablecer').then(function (r) { cargarFuncionarios(); mostrarTemporal(f.nombre_completo, r.passwordTemporal); return r; }); });
        });
        return;
      }
      var es = t.closest('[data-estado]');
      if (es) {
        var desact = es.getAttribute('data-estado') === 'desactivada';
        P.confirmar(P.t(desact ? '¿Desactivar la cuenta?' : '¿Reactivar la cuenta?'), P.t(desact ? 'El funcionario ya no podrá iniciar sesión.' : 'El funcionario podrá volver a iniciar sesión.'), { si: desact ? 'Desactivar' : 'Reactivar', peligro: desact })
          .then(function (ok) { if (ok) P.accion(es, function () { return P.post('/api/admin/funcionarios/' + es.getAttribute('data-id') + '/estado', { estado: es.getAttribute('data-estado') }).then(function (r) { cargarFuncionarios(); return r; }); }); });
        return;
      }
      var su = t.closest('[data-suspender]');
      if (su) {
        P.pedirTexto(P.t('Suspender a {n}', { n: su.getAttribute('data-nombre') }), P.t('Motivo de la suspensión'), { max: 250, min: 5, si: 'Suspender', peligro: true }).then(function (m) {
          if (m) P.accion(su, function () { return P.post('/api/admin/ciudadanos/' + su.getAttribute('data-suspender') + '/suspension', { accion: 'suspender', motivo: m }).then(function (r) { cargarCiudadanos(); return r; }); });
        });
        return;
      }
      var re = t.closest('[data-reactivar]');
      if (re) P.accion(re, function () { return P.post('/api/admin/ciudadanos/' + re.getAttribute('data-reactivar') + '/suspension', { accion: 'reactivar' }).then(function (r) { cargarCiudadanos(); return r; }); });
    });
    return P.catalogos().then(function (c) {
      cat = c;
      P.poner(P.$('#f-alcaldia-func'), P.html`<option value="">Elige la alcaldía</option>${cat.alcaldias.map(function (a) { return P.html`<option value="${a.id}">${a.nombre}</option>`; })}`);
      P.get('/api/admin/resumen').then(function (r) { P.$('[data-n="ciudadanos"]').textContent = P.numero(r.totales.ciudadanos, 0); }, function () { return null; });
      P.poner(P.$('#f-alcaldia-ciu'), P.html`<option value="">Todas</option>${cat.alcaldias.map(function (a) { return P.html`<option value="${a.id}">${a.nombre}</option>`; })}`);
      return cargarFuncionarios();
    });
  });
}());
