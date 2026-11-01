(function () {
  'use strict';
  var P = window.Prepar;
  var fuentes = [];
  var AUTOMATICAS = ['datos_cdmx_alcaldias', 'datos_cdmx_unidades', 'datos_cdmx_delitos', 'indice_desarrollo_social', 'directorio_alcaldias'];
  var NOTAS = {
    inegi_poblacion: 'La API de INEGI no publica población por colonia. La población se toma del Índice de Desarrollo Social de Evalúa.',
  };
  function origenRecurso(f) {
    if (f.recurso) return ' · ' + f.recurso;
    return AUTOMATICAS.indexOf(f.clave) >= 0 ? ' · ' + P.t('se detecta automáticamente') : '';
  }
  function cargar() {
    return P.get('/api/admin/integraciones').then(function (d) {
      fuentes = d.fuentes;
      P.poner(P.$('#fuentes'), d.fuentes.map(function (f) {
        var est = f.ultimo_estado;
        var tono = est === 'exitosa' ? 'chip-ok' : (est === 'en_curso' ? 'etq info' : 'chip-no');
        return P.html`<article class="tarjeta fuente-maq">
          <div class="fila entre arriba" style="gap:10px"><div class="columna" style="gap:2px;min-width:0"><strong style="font-size:17px">${P.t(f.nombre)}</strong><span class="tenue" style="font-size:13px">${P.t(f.proveedor)}${origenRecurso(f)}</span></div>
            <span class="${f.activa ? 'chip-ok' : 'etq oscura'}">${P.t(f.activa ? 'Activa' : 'Inactiva')}</span></div>
          ${NOTAS[f.clave] ? P.html`<span class="tenue" style="font-size:13px">${P.t(NOTAS[f.clave])}</span>` : ''}
          ${est ? P.html`<div class="fila" style="gap:8px;flex-wrap:nowrap;align-items:flex-start"><span class="${tono}" style="flex:none">${P.t({ exitosa: 'Sincronizada', en_curso: 'En curso', fallida: 'Falló' }[est] || est)}</span>${f.ultimo_mensaje ? P.html`<span class="texto-2" style="font-size:13px">${P.t(f.ultimo_mensaje)}</span>` : ''}</div>` : ''}
          <div class="fila" style="gap:16px;font-size:13px"><span><span class="tenue">${P.t('Última')}:</span> ${f.ultima_sincronizacion_exitosa ? P.fechaHora(f.ultima_sincronizacion_exitosa) : '—'}</span>
            <span><span class="tenue">${P.t('Próxima')}:</span> ${f.activa && f.proxima_pronto ? P.t('En unos minutos') : (f.activa && f.proxima_sincronizacion ? P.fechaHora(f.proxima_sincronizacion) : '—')}</span></div>
          ${f.tipo === 'datos' ? P.html`<div class="fila" style="gap:8px;margin-top:auto"><button type="button" class="btn2 chico" data-config="${f.clave}">Configurar</button>
            ${f.activa ? P.html`<button type="button" class="btn chico" data-sync="${f.clave}">Sincronizar ahora</button>` : ''}</div>` : ''}
        </article>`;
      }));
      P.poner(P.$('#errores'), d.errores.length ? P.html`<table><thead><tr><th>Fecha</th><th>Fuente</th><th>Registro</th><th>Mensaje</th></tr></thead><tbody>
        ${d.errores.map(function (e) { return P.html`<tr><td>${P.fechaHora(e.creado_en)}</td><td>${P.t(e.fuente)}</td><td>${e.id_externo || '—'}</td><td>${e.mensaje}</td></tr>`; })}</tbody></table>`
        : P.html`<p class="vacio" style="margin:12px">Sin errores recientes</p>`);
    }, function (e) { P.poner(P.$('#fuentes'), P.html`<p class="mensaje error">${e.message}</p>`); });
  }
  function configurar(clave) {
    var f = fuentes.find(function (x) { return x.clave === clave; });
    P.modal({
      titulo: P.t(f.nombre),
      contenido: P.html`<form class="columna" id="form-fuente" novalidate>
        <p class="tenue pequeno" style="margin:0">${f.url_base}</p>
        <label>Id del recurso en el portal de datos<input name="recurso" maxlength="255" value="${f.recurso || ''}" placeholder="Ej.: 03368e1e-f05e-4bea-ac17-58fc650f6fee"></label>
        ${AUTOMATICAS.indexOf(f.clave) >= 0 ? P.html`<p class="ayuda" style="margin:0">${P.t('Déjalo vacío para que el sistema lo encuentre solo en el portal. También puedes escribir el nombre del conjunto de datos.')}</p>` : ''}
        <label>Frecuencia (minutos)<input name="frecuencia_minutos" type="number" min="5" value="${f.frecuencia_minutos || ''}"></label>
        <label class="casilla"><input type="checkbox" name="activa" ${f.activa ? P.seguro('checked') : ''}> Fuente activa</label>
        <p class="ayuda" style="margin:0">${f.atribucion || ''}</p><div id="msg-fuente"></div></form>`,
      botones: [{ texto: 'Cancelar' }, {
        texto: 'Guardar', clase: 'btn', accion: function (cerrar, el, btn) {
          var d = P.datosForm(P.$('#form-fuente', el));
          P.accion(btn, function () { return P.put('/api/admin/integraciones/' + encodeURIComponent(clave), { recurso: d.recurso || null, activa: d.activa, frecuencia_minutos: d.frecuencia_minutos || null }).then(function (r) { cerrar(); cargar(); return r; }); },
            { destino: P.$('#msg-fuente', el) });
        },
      }],
    });
  }
  function cargarCorreo() {
    return P.get('/api/admin/correo').then(function (c) {
      P.poner(P.$('#chip-correo'), c.configurado ? P.html`<span class="chip-ok">${P.t('Activo')}</span>` : P.html`<span class="chip-no">${P.t('Sin configurar')}</span>`);
      P.$('#como-correo').open = !c.configurado;
      P.$('#btn-prueba-correo').disabled = !c.configurado;
      P.poner(P.$('#estado-correo'), P.html`
        ${c.configurado
          ? P.html`<div class="mensaje ok"><span>${P.t('Se envía con {p} desde {r}.', { p: c.proveedor === 'gmail' ? 'Gmail' : c.proveedor, r: c.remitente })}</span></div>`
          : P.html`<div class="mensaje alerta"><span><strong>${P.t('Todavía no se envían correos.')}</strong> ${P.t(c.faltante || '')}. ${P.t('Mientras tanto, la contraseña temporal de cada funcionario se muestra en pantalla al crearlo, y el enlace para recuperar contraseña aparece en la terminal donde corre el servidor.')}</span></div>`}
        <div class="fila" style="gap:10px;margin-top:10px">
          <span class="pastilla">${P.t('En cola: {n}', { n: c.pendientes })}</span>
          <span class="pastilla">${P.t('Enviados: {n}', { n: c.enviados })}</span>
          <span class="pastilla">${P.t('Fallidos: {n}', { n: c.fallidos })}</span>
        </div>
        ${c.ultimoError ? P.html`<p class="tenue" style="margin:8px 0 0;font-size:13px">${P.t('Último error:')} ${c.ultimoError}</p>` : ''}`);
    }, function (e) { P.poner(P.$('#estado-correo'), P.html`<p class="mensaje error">${e.message}</p>`); });
  }

  P.pagina(function () {
    cargarCorreo();
    P.$('#form-prueba-correo').addEventListener('submit', function (e) {
      e.preventDefault();
      var d = P.datosForm(e.target);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.destinatario || '')) { P.poner(P.$('#msg-correo'), P.html`<div class="mensaje error">${P.t('Escribe un correo válido')}</div>`); return; }
      P.accion(P.$('#btn-prueba-correo'), function () {
        return P.post('/api/admin/correo/prueba', { destinatario: d.destinatario }, { tiempo: 40000 }).then(function (r) {
          P.poner(P.$('#msg-correo'), P.html`<div class="mensaje ok" role="status">✓ ${r.mensaje}</div>`);
          setTimeout(cargarCorreo, 1500);
          return null;
        });
      }, { destino: P.$('#msg-correo') });
    });
    document.addEventListener('click', function (e) {
      var c = e.target.closest('[data-config]');
      if (c) { configurar(c.getAttribute('data-config')); return; }
      var s = e.target.closest('[data-sync]');
      if (s) P.accion(s, function () { return P.post('/api/admin/integraciones/' + encodeURIComponent(s.getAttribute('data-sync')) + '/sincronizar').then(function (r) { setTimeout(cargar, 3000); return r; }); });
    });
    return cargar();
  });
}());
