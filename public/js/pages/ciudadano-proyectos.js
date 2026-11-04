(function () {
  'use strict';
  var P = window.Prepar;
  var mapa = null;
  var selCategoria = null;
  var marcador = null;
  var punto = null;
  var imagenUuid = null;
  var quitarImagen = false;
  var editando = null;
  var faseRegistro = false;
  var centroUnidad = null;

  function pestana(nombre) {
    P.$$('[data-pestana]').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-pestana') === nombre ? 'true' : 'false'); });
    P.$$('[data-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== nombre; });
    if (nombre === 'registrar' && mapa) setTimeout(function () { mapa.invalidateSize(); }, 50);
    if (nombre === 'registrar' && !mapa) iniciarMapa();
  }

  function tarjetaProyecto(p, mio) {
    var editable = mio && p.estatus === 'registrado' && p.fase_ciclo === 'diagnostico_registro' && p.ciclo_estado === 'activo';
    return P.html`<article class="item">
      <div class="fila entre arriba"><div class="crece"><span class="tenue pequeno">${p.folio}${p.ciclo ? ' · ' + p.ciclo : ''}</span><h3 style="margin:2px 0 0">${p.titulo}</h3></div>
        <div class="fila">${P.estatus(p.estatus)}${p.estado_moderacion && p.estado_moderacion !== 'visible' ? P.estatus(p.estado_moderacion) : ''}</div></div>
      ${p.imagen_uuid ? P.html`<img class="miniatura" src="${P.img(p.imagen_uuid)}" alt="Imagen del proyecto" loading="lazy">` : ''}
      <div class="texto texto-2">${p.descripcion}</div>
      <div class="meta"><span>${P.t(p.rubro)}</span><span>${P.dinero(p.costo_estimado)}</span>${p.calle ? P.html`<span>${p.calle} ${p.numero || ''}${p.codigo_postal ? ', CP ' + p.codigo_postal : ''}</span>` : ''}
        ${p.numero_sorteo ? P.html`<span class="etq acento">${P.t('Número en boleta: {n}', { n: p.numero_sorteo })}</span>` : ''}
        ${mio && p.estado_ubicacion ? P.estatus(p.estado_ubicacion) : ''}</div>
      ${p.correccion && p.estatus === 'registrado' ? P.html`<div class="mensaje alerta"><span><strong>Corrección solicitada:</strong> ${p.correccion}</span></div>` : ''}
      ${p.dictamen ? P.html`<div class="mensaje ${p.dictamen === 'viable' ? 'ok' : 'error'}"><span><strong>${P.t('Dictamen')}: ${P.textoEstatus(p.dictamen)}.</strong> ${p.dictamen_justificacion}</span></div>` : ''}
      ${Number(p.avance_porcentaje) > 0 ? P.html`<div><span class="pequeno">${P.t('Avance de la obra')}: ${P.numero(p.avance_porcentaje, 0)}%</span><div class="barra"><span style="width:${Math.min(100, Number(p.avance_porcentaje))}%"></span></div></div>` : ''}
      ${editable ? P.html`<div class="fila"><button type="button" class="btn2 chico" data-editar="${p.id}">Editar</button><button type="button" class="btn-peligro chico" data-retirar="${p.id}">Retirar proyecto</button></div>` : ''}
    </article>`;
  }

  var misProyectos = [];
  var asistente = null;
  function cargarMios() {
    var cont = P.$('#mis-proyectos');
    P.poner(cont, P.html`<div class="cargando-bloque">Cargando…</div>`);
    return P.get('/api/proyectos/mios').then(function (lista) {
      misProyectos = lista;
      P.poner(cont, lista.length ? lista.map(function (p) { return tarjetaProyecto(p, true); })
        : P.html`<div class="vacio">Aún no registras proyectos. ${faseRegistro ? P.html`<button type="button" class="enlace-boton" data-ir="registrar">Registra el primero</button>` : ''}</div>`);
    }, function (e) { P.poner(cont, P.html`<p class="mensaje error">${e.message}</p>`); });
  }
  var datosAlcaldia = null;
  var coloniaSel = '';
  function pintarAlcaldia() {
    var d = datosAlcaldia;
    var cont = P.$('#proyectos-unidad');
    if (!d.colonias.length) { P.poner(P.$('#filtro-alcaldia'), ''); P.poner(cont, P.html`<p class="vacio">${P.t('Tu alcaldía no participa en el ciclo activo.')}</p>`); return; }
    var sel = d.colonias.find(function (c) { return String(c.id) === coloniaSel; });
    var lista = d.proyectos.filter(function (p) { return !coloniaSel || String(p.unidad_territorial_id) === coloniaSel; });
    P.poner(P.$('#filtro-alcaldia'), P.html`<div class="tarjeta columna" style="gap:10px">
      <div class="fila entre"><h2 class="h2-maq" style="margin:0;font-size:19px">${P.t('Proyectos de {a}', { a: d.alcaldia })}</h2>
        <label style="flex:0 1 320px">${P.t('Colonia')}<select id="sel-colonia"><option value="">${P.t('Todas las colonias ({n})', { n: d.colonias.length })}</option>${d.colonias.map(function (c) {
          return P.html`<option value="${c.id}" ${String(c.id) === coloniaSel ? P.seguro('selected') : ''}>${c.nombre}${c.id === d.mi_colonia ? ' · ' + P.t('tu colonia') : ''} (${c.proyectos})</option>`;
        })}</select></label></div>
      <p class="tenue" style="margin:0;font-size:14px">${sel ? P.t('Presupuesto de {c}: {p}. Cada colonia tiene su propio presupuesto y vota solo por los proyectos de su boleta.', { c: sel.nombre, p: P.dinero(sel.presupuesto_asignado) })
        : P.t('El presupuesto se reparte por colonia: cada una tiene su monto y vota solo por sus proyectos. Elige una colonia para ver su presupuesto.')}</p></div>`);
    P.poner(cont, lista.length ? lista.map(function (p) {
      var col = d.colonias.find(function (c) { return c.id === p.unidad_territorial_id; });
      return P.html`<article class="item">
        <div class="fila entre arriba"><div class="crece"><span class="tenue pequeno">${p.folio} · ${p.colonia}${p.de_mi_colonia ? ' · ' + P.t('tu colonia') : ''}</span><h3 style="margin:2px 0 0">${p.titulo}</h3></div>
          <div class="fila">${p.es_mio ? P.html`<span class="etq acento">${P.t('Tu proyecto')}</span>` : ''}${P.estatus(p.estatus)}</div></div>
        ${p.imagen_uuid ? P.html`<img class="miniatura" src="${P.img(p.imagen_uuid)}" alt="Imagen del proyecto" loading="lazy">` : ''}
        <div class="texto texto-2">${p.descripcion}</div>
        <div class="meta"><span>${P.t(p.rubro)}</span><span>${P.t('Costo {c}', { c: P.dinero(p.costo_estimado) })}</span>${col ? P.html`<span>${P.t('Presupuesto de la colonia {p}', { p: P.dinero(col.presupuesto_asignado) })}</span>` : ''}
          ${p.numero_sorteo ? P.html`<span class="etq acento">${P.t('Número en boleta: {n}', { n: p.numero_sorteo })}</span>` : ''}</div>
      </article>`;
    }) : P.html`<p class="vacio">${P.t(coloniaSel ? 'Todavía no hay proyectos registrados en esta colonia' : 'Todavía no hay proyectos registrados en tu alcaldía')}</p>`);
  }
  function cargarUnidad() {
    var cont = P.$('#proyectos-unidad');
    P.poner(cont, P.html`<div class="cargando-bloque">Cargando…</div>`);
    return P.get('/api/proyectos/alcaldia').then(function (d) { datosAlcaldia = d; pintarAlcaldia(); },
      function (e) { P.poner(cont, P.html`<p class="mensaje error">${e.message}</p>`); });
  }
  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'sel-colonia') { coloniaSel = e.target.value; pintarAlcaldia(); }
  });

  function iniciarMapa() {
    mapa = P.mapa(P.$('#mapa-form'), { centro: centroUnidad || undefined, zoom: centroUnidad ? 15 : 11 });
    if (!mapa) return;
    mapa.on('click', function (e) { fijarPunto(e.latlng.lat, e.latlng.lng); if (asistente && punto) asistente.desdePunto(punto.latitud, punto.longitud); });
    P.simbologia(mapa, [{ titulo: '', filas: [{ color: '#E08E6D', glifo: 'punto', texto: 'Tu proyecto: toca el mapa o arrastra el punto' }] }], { abierta: true });
    if (punto) fijarPunto(punto.latitud, punto.longitud, true);
  }
  function fijarPunto(lat, lng, centrar) {
    if (lat < 18.9 || lat > 19.8 || lng < -99.5 || lng > -98.8) { P.aviso('El punto debe estar dentro de la Ciudad de México', 'error'); return; }
    punto = { latitud: Number(lat.toFixed(6)), longitud: Number(lng.toFixed(6)) };
    P.$('#coords-texto').textContent = P.t('Punto marcado: {la}, {lo}', { la: punto.latitud, lo: punto.longitud });
    if (!mapa) return;
    if (marcador) marcador.setLatLng([lat, lng]);
    else marcador = P.marcador(lat, lng, '#E08E6D', { draggable: true, glifo: 'punto', title: P.t('Tu proyecto (arrástralo para moverlo)') }).addTo(mapa).on('dragend', function (ev) { var ll = ev.target.getLatLng(); fijarPunto(ll.lat, ll.lng); });
    if (centrar) mapa.setView([lat, lng], 17);
  }
  function quitarPunto() {
    punto = null;
    if (marcador && mapa) { mapa.removeLayer(marcador); marcador = null; }
    P.$('#coords-texto').textContent = P.t('Haz clic en el mapa para marcar el lugar exacto.');
  }

  function pintarPrevia(url) {
    P.poner(P.$('#previa-imagen'), url ? P.html`<div class="previa"><img src="${url}" alt="Vista previa"></div>` : '');
    P.$('#quitar-imagen').hidden = !url;
  }

  function limpiarForm() {
    if (asistente) asistente.limpiar();
    var f = P.$('#form-proyecto');
    f.reset();
    P.$$('input, textarea', f).forEach(function (x) { x.dispatchEvent(new Event('input')); });
    editando = null;
    imagenUuid = null;
    quitarImagen = false;
    pintarPrevia(null);
    quitarPunto();
    P.$('#titulo-form').textContent = P.t('Registrar proyecto');
    P.$('#guardar-proyecto').textContent = P.t('Registrar proyecto');
    P.$('#cancelar-edicion').hidden = true;
    P.poner(P.$('#mensaje-proyecto'), '');
  }

  function editar(id) {
    var p = misProyectos.find(function (x) { return String(x.id) === String(id); });
    if (!p) return;
    limpiarForm();
    editando = p;
    var f = P.$('#form-proyecto');
    ['titulo', 'descripcion', 'rubro_id', 'costo_estimado', 'calle', 'numero', 'codigo_postal', 'referencias'].forEach(function (k) {
      var el = f.querySelector('[name=' + k + ']');
      if (el) { el.value = p[k] === null || p[k] === undefined ? '' : p[k]; el.dispatchEvent(new Event('input')); }
    });
    if (selCategoria) selCategoria.fijar(p.categoria || P.adivinarCategoria(p.titulo, p.descripcion));
    P.$('#titulo-form').textContent = P.t('Editar proyecto {f}', { f: p.folio });
    P.$('#guardar-proyecto').textContent = P.t('Guardar cambios');
    P.$('#cancelar-edicion').hidden = false;
    if (p.imagen_uuid) pintarPrevia(P.img(p.imagen_uuid));
    pestana('registrar');
    if (p.latitud !== null && p.latitud !== undefined) setTimeout(function () { fijarPunto(Number(p.latitud), Number(p.longitud), true); }, 120);
    P.$('#form-proyecto').scrollIntoView({ behavior: 'smooth' });
  }

  P.pagina(function (ctx) {
    selCategoria = P.selectorCategoria(P.$('#form-proyecto'));
    P.$$('[data-pestana]').forEach(function (b) { b.addEventListener('click', function () { pestana(b.getAttribute('data-pestana')); }); });
    doc_click();
    var c = ctx.estado && ctx.estado.ciclo;
    faseRegistro = !!(c && c.fase === 'diagnostico_registro');
    if (!faseRegistro) {
      P.poner(P.$('#aviso-registro'), P.html`<div class="mensaje info">${c
        ? P.t('El registro de proyectos solo está abierto en la fase de Diagnóstico y Registro. Fase actual: {f}.', { f: P.nombre(c, 'fase') })
        : P.t('No hay un ciclo activo. El registro abrirá cuando inicie un nuevo ciclo.')}</div>`);
      P.$('#form-proyecto').hidden = true;
    }
    P.catalogos().then(function (cat) {
      P.poner(P.$('.sel-rubro'), P.html`<option value="">Elige un rubro</option>${cat.rubros.map(function (r) { return P.html`<option value="${r.id}">${P.nombre(r)}</option>`; })}`);
      var ut = cat.unidades.find(function (x) { return x.id === ctx.usuario.unidadId; });
      if (ut && ut.latitud) centroUnidad = [Number(ut.latitud), Number(ut.longitud)];
    });
    if (faseRegistro) {
      P.get('/api/ciudadano/panel').then(function (d) {
        if (d.unidad) P.$('#ayuda-presupuesto').textContent = P.t('Presupuesto de tu colonia: {p}', { p: P.dinero(d.unidad.presupuesto_asignado) });
      }).catch(function () { return null; });
      P.get('/api/foro?orden=apoyos&limite=100').then(function (d) {
        P.poner(P.$('#sel-idea'), P.html`<option value="">Ninguna</option>${d.ideas.map(function (i) {
          return P.html`<option value="${i.id}">${i.contenido.length > 70 ? i.contenido.slice(0, 70) + '…' : i.contenido}</option>`;
        })}`);
      }).catch(function () { return null; });
    }
    cargarMios();
    cargarUnidad();
    if (location.hash === '#registrar' && faseRegistro) pestana('registrar');

    P.$('#archivo-imagen').addEventListener('change', function (e) {
      var a = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!a) return;
      P.revisarImagen(a, 5).then(function (error) {
        if (error) { P.aviso(error, 'error'); return; }
        pintarPrevia(URL.createObjectURL(a));
        P.accion(P.$('#guardar-proyecto'), function () {
          return P.subirImagen(a, 'imagen_proyecto').then(function (r) { imagenUuid = r.uuid; quitarImagen = false; });
        }).then(function () { if (!imagenUuid) pintarPrevia(null); });
      });
    });
    P.$('#quitar-imagen').addEventListener('click', function () { imagenUuid = null; quitarImagen = true; pintarPrevia(null); });
    P.$('#quitar-punto').addEventListener('click', quitarPunto);
    P.$('#cancelar-edicion').addEventListener('click', function () { limpiarForm(); pestana('mios'); });
    asistente = P.asistenteDireccion(P.$('#form-proyecto'), { alElegir: function (lat, lon) { fijarPunto(lat, lon, true); } });
    P.$('#completar-dir').addEventListener('click', function (e) { asistente.completar(e.currentTarget); });

    var form = P.$('#form-proyecto');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = P.datosForm(form);
      var err = null;
      if (Array.from(d.titulo).length < 5) err = 'El título debe tener al menos 5 caracteres';
      else if (Array.from(d.descripcion).length < 10) err = 'La descripción debe tener al menos 10 caracteres';
      else if (!d.rubro_id) err = 'Elige el rubro';
      else if (!(Number(d.costo_estimado) > 0)) err = 'Indica el costo estimado';
      else if (Array.from(d.calle).length < 2) err = 'Escribe la calle';
      else if (d.codigo_postal && !/^(0[1-9]|1[0-6])\d{3}$/.test(d.codigo_postal)) err = 'El código postal de la Ciudad de México tiene 5 dígitos y va del 01000 al 16999';
      if (err) { P.poner(P.$('#mensaje-proyecto'), P.html`<div class="mensaje error" role="alert">${P.t(err)}</div>`); return; }
      var cuerpo = {
        titulo: d.titulo, descripcion: d.descripcion, rubro_id: Number(d.rubro_id), categoria: d.categoria || undefined, costo_estimado: Number(d.costo_estimado),
        calle: d.calle, numero: d.numero || null, codigo_postal: d.codigo_postal || null, referencias: d.referencias || null,
        latitud: punto ? punto.latitud : null, longitud: punto ? punto.longitud : null,
      };
      if (imagenUuid) cuerpo.imagen_uuid = imagenUuid;
      if (editando && quitarImagen) cuerpo.quitar_imagen = true;
      if (!editando && d.idea_id) cuerpo.idea_id = Number(d.idea_id);
      var eraEdicion = !!editando;
      P.accion(P.$('#guardar-proyecto'), function () {
        var pet = editando ? P.put('/api/proyectos/' + editando.id, cuerpo) : P.post('/api/proyectos', cuerpo);
        return pet.then(function (r) {
          var msg = r.mensaje;
          limpiarForm();
          P.poner(P.$('#mensaje-proyecto'), P.html`<div class="mensaje ok" role="status">${P.t(msg)}</div>`);
          cargarMios();
          cargarUnidad();
          pestana('mios');
          P.modal({ titulo: eraEdicion ? P.t('Cambios guardados') : P.t('¡Proyecto registrado!'), contenido: P.html`<p>${P.t(msg)}</p>`, botones: [{ texto: 'Entendido', clase: 'btn' }] });
          return null;
        });
      }, { destino: P.$('#mensaje-proyecto') });
    });
  });

  function doc_click() {
    document.addEventListener('click', function (e) {
      var ir = e.target.closest('[data-ir]');
      if (ir) { pestana(ir.getAttribute('data-ir')); return; }
      var ed = e.target.closest('[data-editar]');
      if (ed) { editar(ed.getAttribute('data-editar')); return; }
      var re = e.target.closest('[data-retirar]');
      if (re) {
        var id = re.getAttribute('data-retirar');
        P.confirmar(P.t('¿Retirar el proyecto?'), P.t('El proyecto dejará de participar y su folio no se volverá a usar. Esta acción no se puede deshacer.'), { si: 'Retirar', peligro: true })
          .then(function (ok) {
            if (!ok) return;
            P.accion(re, function () { return P.post('/api/proyectos/' + id + '/retirar').then(function (r) { cargarMios(); cargarUnidad(); return r; }); });
          });
      }
    });
  }
}());
