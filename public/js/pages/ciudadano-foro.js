(function () {
  'use strict';
  var P = window.Prepar;
  var pagina = 1;
  var total = 0;
  var cargadas = [];
  var faseRegistro = false;
  var presupuesto = null;
  var imagenUuid = null;
  var ICO_APOYO = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z"></path></svg>';
  var ICO_COMENTAR = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';

  function hace(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(s || '');
    if (!m) return '';
    var t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])).getTime();
    var min = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (min < 1) return P.t('ahora');
    if (min < 60) return P.t('hace {n} min', { n: min });
    var h = Math.round(min / 60);
    if (h < 24) return P.t('hace {n} h', { n: h });
    var d = Math.round(h / 24);
    if (d === 1) return P.t('ayer');
    if (d < 7) return P.t('hace {n} días', { n: d });
    if (d < 14) return P.t('hace 1 semana');
    if (d < 60) return P.t('hace {n} semanas', { n: Math.round(d / 7) });
    return P.fecha(s);
  }
  function corto(nombre) {
    var p = String(nombre || '').trim().split(/\s+/);
    return p.length > 1 ? p[0] + ' ' + p[1].charAt(0) + '.' : (p[0] || '');
  }
  function dineroCorto(n) { return P.dinero(n).replace(/\.00$/, ''); }

  function tarjetaIdea(i) {
    var titulo = Array.from(i.contenido).length <= 90 && i.contenido.indexOf('\n') < 0;
    return P.html`<article class="tarjeta idea" data-idea="${i.id}">
      <div class="fila entre"><span class="tenue" style="font-size:13px">${corto(i.autor)}${i.es_mia ? P.html` <span class="etq acento">Tu idea</span>` : ''} · ${hace(i.creada_en)}</span><span class="etq ok">${P.t(i.rubro)}</span></div>
      ${titulo ? P.html`<strong class="titulo-idea">${i.contenido}</strong>` : P.html`<span class="texto texto-2">${i.contenido}</span>`}
      <div class="fila" style="gap:8px">
        <button type="button" class="btn2 chico ${i.apoyada ? 'apoyada' : ''}" data-apoyar="${i.id}" ${i.es_mia ? P.seguro('disabled title="No puedes apoyar tu propia idea"') : ''} aria-pressed="${i.apoyada ? 'true' : 'false'}">
          ${P.seguro(ICO_APOYO)}<span data-texto>${i.apoyada ? P.t('Apoyada') : P.t('Apoyar')}</span> · <span data-total>${i.total_apoyos}</span></button>
        <button type="button" class="btn2 chico" data-comentarios="${i.id}" aria-expanded="false">${P.seguro(ICO_COMENTAR)}<span data-texto>${P.t('Comentar')}</span> · <span data-ncom>${i.total_comentarios}</span></button>
      </div>
      <div class="hilo" data-hilo="${i.id}" hidden></div>
    </article>`;
  }

  function filtros() {
    var d = P.datosForm(P.$('#form-filtros'));
    return { q: d.q, rubro: d.rubro, desde: d.desde, hasta: d.hasta, min_apoyos: d.min_apoyos, orden: d.orden };
  }

  function cargar(reiniciar) {
    if (reiniciar) { pagina = 1; cargadas = []; }
    var cont = P.$('#ideas');
    if (reiniciar) P.poner(cont, P.esqueleto(3));
    var q = filtros();
    q.pagina = pagina;
    return P.get('/api/foro' + P.qs(q)).then(function (d) {
      total = d.total;
      cargadas = cargadas.concat(d.ideas);
      faseRegistro = !!(d.ciclo && d.ciclo.fase === 'diagnostico_registro' && d.participa);
      pintarEstado(d);
      P.poner(cont, cargadas.length ? cargadas.map(tarjetaIdea) : P.html`<p class="vacio">No hay ideas que coincidan con la búsqueda</p>`);
      P.$('#total-ideas').textContent = P.t('{n} idea(s) encontrada(s)', { n: total });
      P.$('#mas').hidden = cargadas.length >= total;
    }, function (e) { P.poner(cont, P.html`<p class="mensaje error">${e.message}</p>`); });
  }

  function pintarEstado(d) {
    var caja = P.$('#estado-foro');
    var msg = '';
    if (!d.ciclo) msg = P.html`<div class="mensaje info">No hay un ciclo activo. El foro abrirá cuando inicie un nuevo ciclo.</div>`;
    else if (!d.participa) msg = P.html`<div class="mensaje alerta"><span>${P.t('Tu colonia no participa en el ciclo activo.')} <a href="/ciudadano/perfil.html#residencia">${P.t('Cambia tu colonia en Mi perfil')}</a> ${P.t('por una marcada con ✓ para practicar (solo antes de la Consulta).')}}</span></div>`;
    else if (!faseRegistro) msg = P.html`<div class="mensaje info">${P.t('Las ideas y los proyectos se registran en la fase de Diagnóstico y Registro. Fase actual: {f}. Puedes leer y comentar lo que ya se publicó.', { f: P.nombre(d.ciclo, 'fase') })}</div>`;
    P.poner(caja, msg);
    P.$('#form-idea').hidden = !faseRegistro;
    if (!faseRegistro && !P.$('#caja-registro').dataset.cerrado) {
      P.$('#caja-registro').dataset.cerrado = '1';
      P.poner(P.$('#caja-registro'), P.html`<div class="columna" style="gap:12px">
        <div><span class="antetitulo">5.5 Registrar proyecto</span><h2 class="h2-maq" style="margin:4px 0 0;font-size:24px">Registra tu proyecto</h2></div>
        <p class="texto-2" style="margin:0">${d.ciclo ? P.t('El registro de proyectos solo está abierto en la fase 2 · Diagnóstico y Registro. Fase actual: {f}.', { f: P.nombre(d.ciclo, 'fase') }) : P.t('No hay un ciclo activo.')}</p>
        <a class="btn2" href="/ciudadano/proyectos.html">Ver mis proyectos</a></div>`);
    }
  }

  function abrirHilo(id, boton, forzar) {
    var hilo = P.$('[data-hilo="' + id + '"]');
    var abrir = forzar || hilo.hidden;
    hilo.hidden = !abrir;
    boton.setAttribute('aria-expanded', abrir ? 'true' : 'false');
    boton.querySelector('[data-texto]').textContent = abrir ? P.t('Ocultar comentarios') : P.t('Comentar');
    if (!abrir) return;
    P.poner(hilo, P.esqueleto(2, 64));
    P.get('/api/foro/ideas/' + id + '/comentarios').then(function (lista) {
      boton.querySelector('[data-ncom]').textContent = lista.length;
      P.poner(hilo, P.html`${lista.map(function (c) {
        return P.html`<div class="comentario-maq"><strong>${corto(c.autor)}</strong> <span class="tenue">· ${hace(c.creado_en)}</span><br><span style="white-space:pre-wrap;overflow-wrap:anywhere">${c.contenido}</span></div>`;
      })}${!lista.length ? P.html`<p class="tenue pequeno" style="margin:0">Aún no hay comentarios. ¡Sé la primera persona en opinar!</p>` : ''}
        <form class="fila arriba" data-comentar="${id}" style="gap:8px;flex-wrap:nowrap" novalidate>
          <label style="flex:1;font-weight:500;gap:4px"><input type="text" name="contenido" maxlength="250" required placeholder="Escribe un comentario" aria-label="Comentario">
            <span class="tenue" style="font-size:12px" data-cuenta>0/250 caracteres</span></label>
          <button class="btn" type="submit" disabled>Publicar</button></form>`);
    }, function (e) { P.poner(hilo, P.html`<p class="mensaje error">${e.message}</p>`); });
  }

  function leerCosto(v) {
    var n = Number(String(v || '').replace(/[$,\s]/g, ''));
    return isFinite(n) ? n : NaN;
  }
  function pintarPrevia(url) {
    P.poner(P.$('#previa-imagen'), url ? P.html`<div class="previa"><img src="${url}" alt="Vista previa"><button type="button" id="quitar-imagen" aria-label="Quitar imagen">×</button></div>` : '');
  }
  function registrado(r, d, u) {
    P.$('#caja-registro').hidden = true;
    var caja = P.$('#caja-registrado');
    caja.hidden = false;
    var ub = r.estado_ubicacion === 'ubicado' && r.latitud !== null && r.latitud !== undefined;
    P.poner(caja, P.html`<div role="status" class="columna" style="gap:14px">
      <div class="ok-circulo" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"></path></svg></div>
      <h2 class="h2-maq" style="margin:0;font-size:24px">¡Proyecto registrado!</h2>
      <div class="caja-folio"><span class="tenue" style="font-size:13px">Folio generado automáticamente</span><span class="folio-grande">${r.folio}</span></div>
      <div class="columna" style="gap:6px;font-size:15px">
        <span>${P.t('Estatus:')} <strong>${P.t('Registrado')}</strong> · ${P.t('pasa a revisión del funcionario')}</span>
        ${ub ? P.html`<span>${P.t('Ubicación encontrada: {d}', { d: d.calle + ' ' + (d.numero || 'S/N') + ', ' + (u.unidad || '') })}</span>
          <span class="tenue" style="font-size:13px">${P.t('Coordenadas: {la}, {lo}', { la: Number(r.latitud).toFixed(4), lo: Number(r.longitud).toFixed(4) })}</span>`
          : P.html`<span class="alerta-texto">No pudimos ubicar la dirección en el mapa; un funcionario la revisará.</span>`}
      </div>
      ${ub ? P.html`<div class="mapa mini" id="mapa-registrado"></div>` : ''}
      <button type="button" class="btn2" id="otro-proyecto">Editar o registrar otro</button>
    </div>`);
    if (ub) {
      var m = P.mapa(P.$('#mapa-registrado'), { centro: [Number(r.latitud), Number(r.longitud)], zoom: 16, zoomRueda: false });
      if (m) {
        var cp = { categoria: d.categoria, titulo: d.titulo };
        P.marcador(Number(r.latitud), Number(r.longitud), P.colorCategoria(cp), { glifo: P.glifoCategoria(cp), title: d.titulo }).addTo(m);
        P.simbologia(m, [{ titulo: '', filas: [{ color: P.colorCategoria(cp), glifo: P.glifoCategoria(cp), texto: P.t('Tu proyecto · {c}', { c: P.t(P.CATEGORIAS[P.categoriaDe(cp)][0]) }) }] }], { abierta: false });
      }
    }
    P.$('#otro-proyecto').addEventListener('click', function () {
      P.modal({
        titulo: P.t('¿Qué quieres hacer?'),
        contenido: P.html`<p class="texto-2">Puedes corregir el proyecto que acabas de registrar (mientras siga abierta la fase de registro) o registrar uno nuevo.</p>`,
        botones: [
          { texto: 'Editar este proyecto', clase: 'btn2', accion: function () { location.href = '/ciudadano/proyectos.html#p' + r.id; } },
          { texto: 'Registrar otro', clase: 'btn', accion: function (cerrar) { cerrar(); caja.hidden = true; P.$('#caja-registro').hidden = false; P.$('#form-proyecto').reset(); imagenUuid = null; pintarPrevia(null); P.$('#form-proyecto [name=titulo]').focus(); } },
        ],
      });
    });
  }

  P.pagina(function (ctx) {
    var u = ctx.usuario;
    P.$('#titulo-foro').textContent = P.t('Foro vecinal · {u}', { u: u.unidad || '' });
    P.catalogos().then(function (cat) {
      var ops = cat.rubros.map(function (r) { return P.html`<option value="${r.id}">${P.nombre(r)}</option>`; });
      P.$$('.sel-rubro').forEach(function (s) { P.poner(s, P.html`<option value="">Elige un rubro</option>${ops}`); });
      P.$$('.sel-rubro-filtro').forEach(function (s) { P.poner(s, P.html`<option value="">Todos</option>${ops}`); });
    });
    P.get('/api/ciudadano/panel').then(function (d) {
      if (d.unidad && d.unidad.presupuesto_asignado !== null) {
        presupuesto = Number(d.unidad.presupuesto_asignado);
        P.$('#ayuda-costo').textContent = P.t('Máximo: {m} (presupuesto de {u})', { m: dineroCorto(presupuesto), u: d.unidad.nombre });
      }
    }).catch(function () { return null; });
    cargar(true).then(function () {
      if (location.hash === '#registrar') { var r = P.$('#registrar'); if (r) r.scrollIntoView({ behavior: 'smooth' }); }
    });

    var recargar = P.debounce(function () { cargar(true); }, 350);
    var ff = P.$('#form-filtros');
    ff.addEventListener('submit', function (e) { e.preventDefault(); cargar(true); });
    ff.addEventListener('input', function (e) { if (e.target.name === 'q') recargar(); });
    ff.addEventListener('change', function (e) { if (['rubro', 'orden'].indexOf(e.target.name) >= 0) cargar(true); });
    P.$('#limpiar').addEventListener('click', function () { ff.reset(); cargar(true); });
    P.$('#mas').addEventListener('click', function () { pagina += 1; cargar(false); });

    var formIdea = P.$('#form-idea');
    formIdea.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = P.datosForm(formIdea);
      if (Array.from(d.contenido).length < 5) { P.aviso('Escribe tu idea (al menos 5 caracteres)', 'error'); return; }
      if (!d.rubro_id) { P.aviso('Elige el rubro de tu idea', 'error'); return; }
      P.accion(formIdea.querySelector('button[type=submit]'), function () {
        return P.post('/api/foro/ideas', { contenido: d.contenido, rubro_id: Number(d.rubro_id) }).then(function (r) {
          formIdea.reset();
          formIdea.querySelector('textarea').dispatchEvent(new Event('input'));
          cargar(true);
          return r;
        });
      });
    });

    var ideas = P.$('#ideas');
    ideas.addEventListener('click', function (e) {
      var ap = e.target.closest('[data-apoyar]');
      if (ap) {
        var id = ap.getAttribute('data-apoyar');
        var apoyada = ap.getAttribute('aria-pressed') === 'true';
        P.accion(ap, function () {
          return (apoyada ? P.del('/api/foro/ideas/' + id + '/apoyo') : P.post('/api/foro/ideas/' + id + '/apoyo')).then(function (r) {
            ap.setAttribute('aria-pressed', r.apoyada ? 'true' : 'false');
            ap.classList.toggle('apoyada', !!r.apoyada);
            ap.querySelector('[data-texto]').textContent = r.apoyada ? P.t('Apoyada') : P.t('Apoyar');
            ap.querySelector('[data-total]').textContent = r.total_apoyos;
            if (r.apoyada) { ap.classList.remove('pop'); void ap.offsetWidth; ap.classList.add('pop'); setTimeout(function () { ap.classList.remove('pop'); }, 450); }
          });
        });
        return;
      }
      var com = e.target.closest('[data-comentarios]');
      if (com) abrirHilo(com.getAttribute('data-comentarios'), com);
    });
    ideas.addEventListener('input', function (e) {
      var f = e.target.closest('[data-comentar]');
      if (!f) return;
      var n = Array.from(e.target.value).length;
      f.querySelector('[data-cuenta]').textContent = P.t('{n}/250 caracteres', { n: n });
      f.querySelector('button').disabled = !e.target.value.trim();
    });
    ideas.addEventListener('submit', function (e) {
      var f = e.target.closest('[data-comentar]');
      if (!f) return;
      e.preventDefault();
      var id = f.getAttribute('data-comentar');
      var texto = f.querySelector('input').value.trim();
      if (!texto) return;
      P.accion(f.querySelector('button'), function () {
        return P.post('/api/foro/ideas/' + id + '/comentarios', { contenido: texto }).then(function () {
          abrirHilo(id, P.$('[data-comentarios="' + id + '"]'), true);
        });
      });
    });

    var form = P.$('#form-proyecto');
    P.selectorCategoria(form);
    P.$('#archivo-imagen').addEventListener('change', function (e) {
      var a = e.target.files && e.target.files[0];
      if (!a) return;
      P.revisarImagen(a, 5).then(function (error) {
        if (error) { e.target.value = ''; P.poner(P.$('#mensaje-proyecto'), P.html`<div class="mensaje error" role="alert">${error} ${P.t('Elige una foto JPG o PNG.')}</div>`); return; }
        P.poner(P.$('#mensaje-proyecto'), '');
        pintarPrevia(URL.createObjectURL(a));
        imagenUuid = null;
        P.accion(P.$('#guardar-proyecto'), function () {
          return P.subirImagen(a, 'imagen_proyecto').then(function (r) { imagenUuid = r.uuid; });
        }).then(function () { if (!imagenUuid) { pintarPrevia(null); e.target.value = ''; } });
      });
    });
    P.$('#previa-imagen').addEventListener('click', function (e) {
      if (!e.target.closest('#quitar-imagen')) return;
      imagenUuid = null;
      P.$('#archivo-imagen').value = '';
      pintarPrevia(null);
    });
    form.querySelector('[name=costo_estimado]').addEventListener('blur', function (e) {
      var n = leerCosto(e.target.value);
      if (n > 0) e.target.value = dineroCorto(n);
    });
    var asistente = P.asistenteDireccion(form);
    P.$('#completar-dir').addEventListener('click', function (e) { asistente.completar(e.currentTarget); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = P.datosForm(form);
      var costo = leerCosto(d.costo_estimado);
      var err = null;
      if (Array.from(d.titulo).length < 5) err = 'El título debe tener al menos 5 caracteres';
      else if (Array.from(d.descripcion).length < 10) err = 'La descripción debe tener al menos 10 caracteres';
      else if (!d.rubro_id) err = 'Elige el rubro';
      else if (!(costo > 0)) err = 'Indica el costo estimado';
      else if (presupuesto && costo > presupuesto) err = P.t('El costo no puede ser mayor que el presupuesto de tu colonia ({m})', { m: dineroCorto(presupuesto) });
      else if (Array.from(d.calle).length < 2) err = 'Escribe la calle';
      else if (d.codigo_postal && !/^(0[1-9]|1[0-6])\d{3}$/.test(d.codigo_postal)) err = 'El código postal de la Ciudad de México tiene 5 dígitos y va del 01000 al 16999';
      if (err) { P.poner(P.$('#mensaje-proyecto'), P.html`<div class="mensaje error" role="alert">${P.t(err)}</div>`); return; }
      P.poner(P.$('#mensaje-proyecto'), '');
      var cuerpo = {
        titulo: d.titulo, descripcion: d.descripcion, rubro_id: Number(d.rubro_id), categoria: d.categoria || undefined, costo_estimado: costo,
        calle: d.calle, numero: d.numero || null, codigo_postal: d.codigo_postal || null, referencias: d.referencias || null,
      };
      if (form.dataset.lat) { cuerpo.latitud = Number(form.dataset.lat); cuerpo.longitud = Number(form.dataset.lon); }
      if (imagenUuid) cuerpo.imagen_uuid = imagenUuid;
      P.accion(P.$('#guardar-proyecto'), function () {
        return P.post('/api/proyectos', cuerpo, { tiempo: 45000 }).then(function (r) { registrado(r, d, u); asistente.limpiar(); return null; });
      }, { destino: P.$('#mensaje-proyecto') });
    });
  });
}());
