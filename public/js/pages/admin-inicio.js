(function () {
  'use strict';
  var P = window.Prepar;
  var cat = null;
  var cicloId = null;
  var listaCiclos = null;
  var det = null;

  var resumen = null;
  function cargarResumen() {
    return P.get('/api/admin/resumen').then(function (r) { resumen = r; pintarResumen(); });
  }
  function pintarResumen() {
    if (!resumen) return;
    var t = resumen.totales;
    var proyectos = det ? det.estatus.reduce(function (s, e) { return s + Number(e.n); }, 0) : null;
    P.poner(P.$('#resumen'), P.html`
      <div class="tarjeta kpi-maq"><span>Ciudadanos registrados</span><strong class="h" data-contar="${Number(t.ciudadanos) || 0}">${P.numero(t.ciudadanos, 0)}</strong></div>
      <div class="tarjeta kpi-maq"><span>Proyectos registrados</span>${proyectos === null ? P.html`<strong class="h">—</strong>` : P.html`<strong class="h" data-contar="${proyectos}">${P.numero(proyectos, 0)}</strong>`}</div>
      <div class="tarjeta kpi-maq"><span>Funcionarios activos</span><strong class="h" data-contar="${Number(t.funcionarios) || 0}">${P.numero(t.funcionarios, 0)}</strong></div>
      <a class="tarjeta kpi-maq enlace" href="/admin/estadisticas.html">${P.t('Ver todas las estadísticas')} →</a>`);
    P.animarNumeros(P.$('#resumen'));
  }

  function cargarCiclos(seleccion) {
    return P.get('/api/admin/ciclos').then(function (lista) {
      listaCiclos = lista;
      if (!lista.length) {
        P.$('#sub-ciclo').textContent = P.t('Sin ciclos de simulación');
        P.poner(P.$('#detalle'), '');
        P.poner(P.$('#control'), P.html`<div class="tarjeta columna" style="align-items:flex-start"><h2>Aún no hay ciclos</h2><p class="texto-2">Crea el primer ciclo de simulación con sus alcaldías participantes y su presupuesto.</p><button class="btn" data-nuevo>Crear ciclo</button></div>`);
        return;
      }
      var activo = lista.find(function (c) { return c.estado === 'activo'; });
      cicloId = seleccion || (activo || lista[0]).id;
      if (modoDatos) pintarModo();
      return cargarDetalle();
    });
  }

  function etiquetaEstado(c) {
    if (c.estado === 'borrador' && c.pausado_en) return P.t('Pausado');
    return P.textoEstatus(c.estado);
  }

  var modoDatos = null;
  var modoElegido = null;
  function cargarModo() {
    return P.get('/api/admin/modo').then(function (m) { modoDatos = m; modoElegido = 'practica'; pintarModo(); },
      function (e) { P.poner(P.$('#modo'), P.html`<p class="mensaje error">${e.message}</p>`); });
  }
  function nombreFase(c) { return c && c.fase ? (P.idioma() === 'en' ? c.fase_en : c.fase_es) : P.t('Sin iniciar'); }
  function faseDe(c) { return (P.idioma() === 'en' ? c.fase_en : c.fase_es) || P.t('Sin iniciar'); }
  function pintarModo() {
    var m = modoDatos;
    var act = m.activo;
    var opciones = listaCiclos || m.practicas;
    var elegidoId = cicloId || (act ? act.id : (opciones[0] ? opciones[0].id : null));
    var elegidoC = opciones.find(function (c) { return c.id === elegidoId; });
    P.poner(P.$('#modo'), P.html`
      <div><h2 class="h" id="t-modo" style="margin:0;font-size:22px">Ciclo activo</h2>
        <p class="tenue" style="margin:4px 0 0;font-size:14px">${act ? P.html`${P.t('Activo ahora:')} <strong>${act.nombre}</strong> · ${nombreFase(act)}` : P.t('No hay ningún ciclo activo.')}</p></div>
      <div class="fila" style="gap:10px;align-items:flex-end">
        ${opciones.length ? P.html`<label style="flex:1 1 280px">${P.t('Ciclo')}<select id="ciclo-practica">${opciones.map(function (c) {
          return P.html`<option value="${c.id}" ${c.id === elegidoId ? P.seguro('selected') : ''}>${c.nombre} · ${etiquetaEstado(c)} · ${faseDe(c)}</option>`;
        })}</select></label>` : P.html`<span class="error-texto" style="font-size:13px">${P.t('Aún no hay ciclos.')}</span>`}
        <button type="button" class="btn" id="aplicar-modo" ${elegidoC && elegidoC.estado === 'cerrado' ? P.seguro('disabled') : ''}>${P.t('Activar')}</button>
        <button type="button" class="btn2" data-nuevo>${P.t('Nuevo ciclo')}</button>
      </div>
      <span class="tenue" style="font-size:13px">${P.t('Elige un ciclo para verlo abajo. «Activar» lo pone en marcha para todos; el que estaba activo queda pausado con sus datos.')}</span>`);
  }
  function aplicarModo(boton) {
    var cuerpo = { modo: modoElegido };
    if (modoElegido === 'practica') {
      var s = P.$('#ciclo-practica');
      if (!s) { P.aviso('Primero crea un ciclo de práctica', 'error'); return; }
      cuerpo.ciclo_id = Number(s.value);
    }
    var destino = modoDatos.practicas.find(function (c) { return c.id === cuerpo.ciclo_id; });
    if (modoDatos.activo && destino && modoDatos.activo.id === destino.id) { P.aviso(P.t('Ese ciclo ya es el activo'), 'info'); return; }
    P.confirmar(P.t('¿Cambiar el ciclo activo?'), P.t('«{c}» será el ciclo que vean todos los usuarios.{p}', {
      c: destino ? destino.nombre : '', p: modoDatos.activo ? ' ' + P.t('«{a}» quedará pausado.', { a: modoDatos.activo.nombre }) : '',
    }), { si: 'Cambiar' }).then(function (ok) {
      if (ok) P.accion(boton, function () { return P.post('/api/admin/modo', cuerpo).then(function (r) { setTimeout(function () { location.reload(); }, 700); return r; }); });
    });
  }

  function fechaCorta(f) {
    var p = String(f || '').split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : f;
  }

  function diaSiguiente(f) {
    var d = new Date(f + 'T00:00:00Z');
    if (isNaN(d)) return '';
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  function revisarFechas(alGuardar) {
    var errores = [];
    var fases = [];
    if (!det || !det.fases) return { errores: errores, fases: fases };
    var anio = Number(det.ciclo && det.ciclo.anio_simulado) || new Date().getFullYear();
    var minimo = (anio - 1) + '-01-01';
    var maximo = (anio + 2) + '-12-31';
    var previo = null;
    var ordenadas = det.fases.slice().sort(function (a, b) { return a.orden - b.orden; });
    ordenadas.forEach(function (x) {
      var ei = P.$('[data-inicio="' + x.fase_id + '"]');
      var ef = P.$('[data-fin="' + x.fase_id + '"]');
      if (!ei || !ef) return;
      var i = ei.value;
      var fn = ef.value;
      var nombre = '«' + x.orden + '. ' + P.nombre(x) + '»';
      var malI = '';
      var malF = '';
      ei.min = minimo;
      ei.max = maximo;
      ef.min = i || minimo;
      ef.max = maximo;
      if (previo && previo.fin) ei.min = diaSiguiente(previo.fin);
      if ((ei.validity && ei.validity.badInput) || (ef.validity && ef.validity.badInput)) {
        malI = ei.validity.badInput ? P.t('{f}: la fecha de inicio no es válida', { f: nombre }) : '';
        malF = ef.validity.badInput ? P.t('{f}: la fecha de fin no es válida', { f: nombre }) : '';
      } else if (i || fn) {
        if (!i) malI = P.t('{f}: falta la fecha de inicio', { f: nombre });
        if (!fn) malF = P.t('{f}: falta la fecha de fin', { f: nombre });
        if (i && (i < minimo || i > maximo)) malI = P.t('{f}: la fecha de inicio debe estar entre {a} y {b}', { f: nombre, a: fechaCorta(minimo), b: fechaCorta(maximo) });
        if (fn && (fn < minimo || fn > maximo)) malF = P.t('{f}: la fecha de fin debe estar entre {a} y {b}', { f: nombre, a: fechaCorta(minimo), b: fechaCorta(maximo) });
        if (i && fn && fn < i) malF = P.t('{f}: termina el {fin}, antes de empezar el {ini}. La fecha de fin no puede ser anterior a la de inicio', { f: nombre, fin: fechaCorta(fn), ini: fechaCorta(i) });
        if (i && fn && !malF && (Date.parse(fn) - Date.parse(i)) / 86400000 > 366) malF = P.t('{f}: no puede durar más de un año', { f: nombre });
        if (i && previo && previo.fin && i <= previo.fin && !malI) malI = P.t('{f} empieza el {ini}, pero {p} termina el {fin}. Las fases no pueden encimarse: cada una debe empezar después de que termine la anterior', { f: nombre, ini: fechaCorta(i), p: previo.nombre, fin: fechaCorta(previo.fin) });
        fases.push({ fase_id: x.fase_id, fecha_inicio: i, fecha_fin: fn });
      }
      [[ei, malI], [ef, malF]].forEach(function (par) {
        par[0].classList.toggle('fecha-mal', !!par[1]);
        if (par[1]) { par[0].setAttribute('aria-invalid', 'true'); par[0].title = par[1]; } else { par[0].removeAttribute('aria-invalid'); par[0].removeAttribute('title'); }
      });
      if (malI) errores.push(malI);
      if (malF) errores.push(malF);
      if (i || fn) previo = { fin: fn || i, nombre: nombre };
    });
    var caja = P.$('#fechas-error');
    if (caja) {
      P.poner(caja, errores.length ? P.html`<div class="mensaje error" role="alert"><span>${errores.slice(0, 3).map(function (m, k) { return P.html`${k ? P.html`<br>` : ''}${m}`; })}${errores.length > 3 ? P.html`<br>${P.t('y {n} más', { n: errores.length - 3 })}` : ''}</span></div>` : '');
    }
    var boton = P.$('#guardar-fechas');
    if (boton) boton.classList.toggle('deshabilitado', errores.length > 0);
    return { errores: errores, fases: fases, alGuardar: alGuardar };
  }

  function cargarDetalle() {
    return P.get('/api/admin/ciclos/' + cicloId).then(function (d) { det = d; pintar(); },
      function (e) { P.poner(P.$('#control'), P.html`<p class="mensaje error">${e.message}</p>`); });
  }

  var abiertos = {};
  function pintar() {
    var c = det.ciclo;
    var pen = det.pendientes;
    var cerrado = c.estado === 'cerrado';
    var borrador = c.estado === 'borrador';
    var fase = c.fase;
    var est = {};
    det.estatus.forEach(function (e) { est[e.estatus] = e.n; });
    var faseOrden = c.fase_orden || 0;
    pintarControl();
    pintarResumen();
    P.poner(P.$('#detalle'), P.html`
      <h2 class="h" style="margin:8px 0 0;font-size:20px">${P.t('Más opciones del ciclo')}</h2>
      <p class="tenue" style="margin:-12px 0 0;font-size:14px">${P.t('Toca un apartado para abrirlo.')}</p>
      <details class="tarjeta plegable"${abiertos.datos ? P.seguro(' open') : ''} data-plegable="datos">
        <summary><span class="plegable-titulo">${P.t('Datos del ciclo')}</span><span class="tenue">${P.t('Presupuesto, convocatoria en PDF y reportes')}</span></summary>
        <div class="columna" style="gap:12px">
        <div class="fila entre arriba"><div class="crece"><div class="fila">${P.estatus(c.estado)}<span class="etq acento">${P.textoFase(c)}</span>${Number(c.votacion_abierta) ? P.html`<span class="etq ok">${P.t('Votación abierta')}</span>` : ''}</div>
          <h2 style="margin:8px 0 4px">${c.nombre}</h2>
          <span class="texto-2">${P.t('Año simulado {a} · Presupuesto total {p} · {pct}% en partes iguales · Índices: {o}', { a: c.anio_simulado, p: P.dinero(c.presupuesto_total), pct: P.numero(c.porcentaje_partes_iguales, 0), o: P.t({ api: 'datos abiertos', aleatorio: 'aleatorios', manual: 'captura manual' }[c.origen_indices]) })}</span></div>
          <div class="fila">
            ${borrador ? P.html`<button class="btn2 chico" data-editar-ciclo>Editar datos</button><button class="btn-peligro chico" data-eliminar-ciclo>Eliminar borrador</button>` : ''}
            ${!cerrado ? P.html`<label class="btn2 chico" style="flex-direction:row;cursor:pointer">${c.convocatoria_uuid ? P.t('Reemplazar convocatoria') : P.t('Subir convocatoria (PDF)')}<input type="file" accept="application/pdf" class="solo-lector" id="pdf-conv"></label>` : ''}
            ${c.convocatoria_uuid ? P.html`<a class="btn2 chico" href="${P.img(c.convocatoria_uuid)}" target="_blank" rel="noopener">Ver convocatoria</a>` : ''}
            <button class="btn2 chico" data-descargar="/api/admin/ciclos/${c.id}/reporte.pdf">Reporte (PDF)</button>
            ${c.computo_realizado_en ? P.html`<button class="btn2 chico" data-descargar="/api/admin/ciclos/${c.id}/resultados.csv">Resultados (CSV)</button>` : ''}
          </div></div>
        <div class="rejilla tres">
          <div class="kpi"><span class="valor">${(est.registrado || 0) + (est.en_dictaminacion || 0)}</span><span class="nombre">Por revisar o dictaminar</span></div>
          <div class="kpi"><span class="valor">${(est.viable || 0) + (est.en_consulta || 0)}</span><span class="nombre">Viables / en consulta</span></div>
          <div class="kpi"><span class="valor">${pen.votos}</span><span class="nombre">Votos emitidos</span></div>
          <div class="kpi"><span class="valor">${(est.ganador || 0) + (est.en_ejecucion || 0) + (est.concluido || 0) + (est.inejecutable || 0)}</span><span class="nombre">Ganadores</span></div>
        </div>
        ${!cerrado && (pen.sin_dictamen || (fase === 'sorteo_difusion' && pen.sorteos_pendientes) || pen.casos_sin_resolver) ? P.html`<div class="mensaje alerta"><span>
          ${pen.sin_dictamen ? P.t('{n} proyecto(s) sin dictamen. ', { n: pen.sin_dictamen }) : ''}${fase === 'sorteo_difusion' && pen.sorteos_pendientes ? P.t('{n} sorteo(s) pendiente(s). ', { n: pen.sorteos_pendientes }) : ''}${pen.casos_sin_resolver ? P.t('{n} caso(s) especial(es) sin resolver.', { n: pen.casos_sin_resolver }) : ''}</span></div>` : ''}
      </div></details>

      <details class="tarjeta plegable" id="calendario"${abiertos.calendario ? P.seguro(' open') : ''} data-plegable="calendario">
        <summary><span class="plegable-titulo">${P.t('Fases y calendario')}</span><span class="tenue">${P.t('Fechas de inicio y fin de cada fase')}</span></summary>
        <div class="columna" style="gap:12px">
        <div class="fila entre"><span></span>${!cerrado ? P.html`<button class="btn2 chico" id="guardar-fechas">Guardar fechas</button>` : ''}</div>
        <p class="tenue pequeno" style="margin:0">Para fines de demostración puedes cambiar la fase manualmente; el sistema pide confirmación.</p>
        <div id="fechas-error" aria-live="polite"></div>
        <div class="tabla-cont"><table><thead><tr><th>#</th><th>Fase</th><th>Inicio</th><th>Fin</th><th></th></tr></thead><tbody>
          ${det.fases.map(function (f) {
            var activa = Number(f.es_fase_activa) === 1 && !borrador;
            return P.html`<tr><td>${f.orden}</td><td><strong>${P.nombre(f)}</strong> ${activa ? P.html`<span class="etq acento">${P.t('Activa')}</span>` : (f.orden < faseOrden ? P.html`<span class="etq ok">✓</span>` : '')}</td>
              <td><input type="date" data-inicio="${f.fase_id}" value="${f.fecha_inicio || ''}" ${cerrado ? P.seguro('disabled') : ''} aria-label="Inicio"></td>
              <td><input type="date" data-fin="${f.fase_id}" value="${f.fecha_fin || ''}" ${cerrado ? P.seguro('disabled') : ''} aria-label="Fin"></td>
              <td>${!cerrado && !activa ? P.html`<button class="btn2 chico" data-fase="${f.clave}" data-nombre="${P.nombre(f)}">${borrador ? P.t('Activar en esta fase') : P.t('Cambiar a esta fase')}</button>` : ''}</td></tr>`;
          })}</tbody></table></div>
      </div></details>

      <details class="tarjeta plegable" id="unidades"${abiertos.unidades ? P.seguro(' open') : ''} data-plegable="unidades">
        <summary><span class="plegable-titulo">${P.t('Unidades territoriales y presupuesto')}</span><span class="tenue">${P.t('Cuánto dinero le toca a cada colonia')}</span></summary>
        <div class="columna" style="gap:12px">
        <div class="fila entre"><span></span>${borrador ? P.html`<button class="btn2 chico" id="recalcular">Recalcular presupuesto</button>` : ''}</div>
        <p class="tenue pequeno" style="margin:0">${P.t('{pct}% del presupuesto se reparte en partes iguales y el resto según pobreza, incidencia delictiva, población, población flotante y si es pueblo originario.', { pct: P.numero(c.porcentaje_partes_iguales, 0) })}</p>
        <div class="tabla-cont"><table><thead><tr><th>Unidad</th><th>Alcaldía</th><th class="num">Población</th><th class="num">Flotante</th><th class="num">Pobreza</th><th class="num">Delictivo</th><th>Pueblo orig.</th><th class="num">Presupuesto</th>${borrador ? P.html`<th></th>` : ''}</tr></thead><tbody>
          ${det.unidades.map(function (u) {
            return P.html`<tr><td>${u.nombre}</td><td>${u.alcaldia}</td><td class="num">${P.numero(u.poblacion, 0)}</td><td class="num">${P.numero(u.poblacion_flotante, 0)}</td>
              <td class="num">${P.numero(u.indice_pobreza, 3)}</td><td class="num">${P.numero(u.indice_delictivo, 3)}</td><td>${u.es_pueblo_originario ? P.t('Sí') : P.t('No')}</td>
              <td class="num"><strong>${P.dinero(u.presupuesto_asignado)}</strong></td>${borrador ? P.html`<td><button class="btn2 chico" data-indices="${u.unidad_territorial_id}">Índices</button></td>` : ''}</tr>`;
          })}</tbody></table></div>
      </div></details>

      ${c.estado === 'activo' ? P.html`<details class="tarjeta plegable"${abiertos.avisos ? P.seguro(' open') : ''} data-plegable="avisos">
        <summary><span class="plegable-titulo">${P.t('Avisos del ciclo')}</span><span class="tenue">${P.t('Mensajes para todos los ciudadanos o una alcaldía')}</span></summary>
        <div class="columna" style="gap:12px">
        <form id="form-aviso" class="formulario" novalidate>
          <label>Título<input name="titulo" maxlength="100" data-contador required></label>
          <label>Dirigido a<select name="alcaldia_id"><option value="">Todas las alcaldías</option>${cat.alcaldias.map(function (a) { return P.html`<option value="${a.id}">${a.nombre}</option>`; })}</select></label>
          <label class="completo">Mensaje<textarea name="mensaje" maxlength="500" rows="2" required></textarea></label>
          <div class="completo"><button class="btn" type="submit">Publicar aviso</button></div></form>
        <div id="avisos" class="lista"></div></div></details>` : ''}`);
    if (c.estado === 'activo') cargarAvisos();
    revisarFechas(false);
    var pdf = P.$('#pdf-conv');
    if (pdf) pdf.addEventListener('change', function (e) {
      var a = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!a) return;
      if (a.type !== 'application/pdf' || a.size > 10 * 1024 * 1024) { P.aviso('Elige un PDF de hasta 10 MB', 'error'); return; }
      P.accion(pdf.parentNode, function () { return P.api('PUT', '/api/admin/ciclos/' + c.id + '/convocatoria', a, { tipo: 'application/pdf', tiempo: 60000 }).then(function (r) { cargarDetalle(); return r; }); });
    });
  }

  var pidiendo = null;
  function accionesFase() {
    var c = det.ciclo;
    var pen = det.pendientes;
    var activo = c.estado === 'activo';
    var abierta = Number(c.votacion_abierta) === 1;
    var contado = !!c.computo_realizado_en;
    var conFechas = det.fases.every(function (f) { return f.fecha_inicio && f.fecha_fin; });
    var l = [];
    if (c.estado === 'borrador') {
      l.push({ t: 'Configurar fechas de las fases', d: 'Define inicio y fin de cada fase.', cta: 'Configurar', hecha: conFechas, ir: '#calendario' });
      l.push({ t: 'Revisar unidades y presupuesto', d: 'Ajusta los índices de cada colonia y recalcula el presupuesto.', cta: 'Revisar', hecha: false, ir: '#unidades' });
      l.push({ t: 'Activar el ciclo', d: 'Empieza la simulación en la fase 1 · Convocatoria.', cta: 'Activar', hecha: false, accion: 'activar' });
      return l;
    }
    switch (c.fase) {
      case 'convocatoria':
        l.push({ t: 'Configurar fechas de las fases', d: 'Define inicio y fin de cada fase.', cta: 'Configurar', hecha: conFechas, ir: '#calendario' });
        l.push({ t: 'Publicar la convocatoria', d: 'Sube el PDF con las reglas para que los vecinos lo consulten.', cta: 'Subir PDF', hecha: !!c.convocatoria_uuid, accion: 'pdf' });
        break;
      case 'dictaminacion':
        if (pen.sin_dictamen) l.push({ t: P.t('{n} proyecto(s) sin dictamen', { n: pen.sin_dictamen }), d: 'Los funcionarios de cada alcaldía los están revisando.', hecha: false, info: true });
        break;
      case 'sorteo_difusion':
        if (pen.sorteos_pendientes) l.push({ t: P.t('{n} sorteo(s) pendiente(s)', { n: pen.sorteos_pendientes }), d: 'Los funcionarios asignan el número de cada proyecto en la boleta.', hecha: false, info: true });
        break;
      case 'consulta':
        l.push({ t: 'Abrir la votación', d: 'Los ciudadanos podrán votar en la boleta de su colonia.', cta: 'Abrir', hecha: abierta || contado, accion: 'abrir', off: !activo });
        l.push({ t: 'Cerrar la votación', d: 'Deja de recibir votos al terminar el plazo.', cta: 'Cerrar', hecha: contado, accion: 'cerrar', off: !abierta });
        l.push({ t: 'Contar votos', d: contado ? 'Ya se contaron: revisa cuántos votaron, por qué proyecto y quién ganó en cada colonia.' : 'El sistema cuenta y marca ganadores y casos especiales.', cta: 'Contar', hecha: contado, accion: 'cerrar', off: !abierta, resumen: contado });
        break;
      case 'resultados':
        if (!contado && abierta) l.push({ t: 'Cerrar la votación y contar votos', d: 'Deja de recibir votos y calcula el ganador de cada colonia.', cta: 'Cerrar y contar', hecha: false, accion: 'cerrar' });
        if (contado) l.push({ t: 'Resumen de la votación', d: 'Cuántos votaron, votos de cada proyecto, ganadores y casos especiales por colonia.', hecha: true, resumen: true });
        l.push({ t: 'Publicar ganadores', d: pen.casos_sin_resolver ? P.t('Se habilita cuando los funcionarios resuelven los casos especiales (faltan {n}).', { n: pen.casos_sin_resolver }) : 'Los proyectos ganadores cambian a estatus Ganador y se avisa a sus proponentes.', cta: 'Publicar', hecha: !!c.resultados_publicados_en, accion: 'ganadores', off: !contado || pen.casos_sin_resolver > 0 });
        break;
      case 'evaluacion':
        l.push({ t: 'Cerrar ciclo', d: 'Guarda el ciclo como histórico de solo lectura.', cta: 'Cerrar', hecha: c.estado === 'cerrado', accion: 'cerrar-ciclo', off: !activo });
        break;
      default:
    }
    if (c.estado === 'cerrado') l.forEach(function (a) { a.off = true; });
    return l;
  }
  function pintarControl() {
    var c = det.ciclo;
    var orden = c.estado === 'borrador' ? 0 : (c.fase_orden || 0);
    var fases = det.fases.slice().sort(function (a, b) { return a.orden - b.orden; });
    var actual = fases.find(function (f) { return f.orden === orden; });
    var sig = fases.find(function (f) { return f.orden === orden + 1; });
    var ant = fases.find(function (f) { return f.orden === orden - 1; });
    var alcaldias = {};
    det.unidades.forEach(function (x) { alcaldias[x.alcaldia] = 1; });
    P.$('#sub-ciclo').textContent = P.t('{c} · {a} alcaldía(s) · {u} unidades territoriales', { c: c.nombre, a: Object.keys(alcaldias).length, u: det.unidades.length });
    var acc = accionesFase();
    var pendientes = acc.filter(function (a) { return !a.hecha && !a.info; }).length;
    var cerrado = c.estado === 'cerrado';
    var destino = pidiendo === 'ant' ? ant : sig;
    P.poner(P.$('#control'), P.html`
      <section class="tarjeta columna control-fase">
        <div class="barra-fases">${fases.map(function (f) {
          var e = f.orden < orden || cerrado ? 'hecha' : (f.orden === orden ? 'actual' : '');
          return P.html`<div class="${e}"><span></span><small>${f.orden}. ${P.nombre(f)}</small></div>`;
        })}</div>
        <div class="fila entre fase-actual-fila">
          <div><span class="alerta-texto" style="font-size:13px;font-weight:700">${P.t(cerrado ? 'Ciclo cerrado' : (c.estado === 'borrador' ? (c.pausado_en ? 'Ciclo pausado' : 'Ciclo en borrador') : 'Fase actual'))}</span>
            <h2 class="h" style="margin:2px 0 0;font-size:28px;font-weight:800">${actual ? P.html`${actual.orden} · ${P.nombre(actual)}` : P.t(c.estado === 'borrador' ? 'Sin iniciar' : 'Histórico')}</h2>
            ${Number(c.votacion_abierta) ? P.html`<span class="etq ok" style="margin-top:6px">${P.t('Votación abierta')}</span>` : ''}</div>
          ${!cerrado && c.estado !== 'borrador' ? P.html`<div class="fila" style="gap:8px">
            <button type="button" class="btn2" data-pedir-fase="ant" ${ant ? '' : P.seguro('disabled')}>← ${P.t('Fase anterior')}</button>
            <button type="button" class="btn" data-pedir-fase="sig" ${sig ? '' : P.seguro('disabled')}>${P.t('Avanzar a la siguiente fase')} →</button></div>` : ''}
        </div>
        ${pidiendo && destino ? P.html`<div role="alertdialog" aria-label="${P.t('Confirmar cambio de fase')}" class="confirma-fase">
          <strong style="font-size:17px">${P.t(pidiendo === 'ant' ? '¿Regresar a la fase {n} · {f}?' : '¿Pasar a la fase {n} · {f}?', { n: destino.orden, f: P.nombre(destino) })}</strong>
          <span class="texto-2" style="line-height:1.5">${P.t('Todos los ciudadanos y funcionarios verán la nueva fase de inmediato. Las acciones de la fase actual se cerrarán.')}</span>
          ${pidiendo === 'sig' && pendientes ? P.html`<span class="error-texto" style="font-weight:600">⚠ ${P.t('Todavía tienes {n} acción(es) sin hacer en esta fase.', { n: pendientes })}</span>` : ''}
          <div class="fila" style="gap:8px"><button type="button" class="btn" data-cambiar-fase="${destino.clave}">${P.t(pidiendo === 'ant' ? 'Sí, regresar' : 'Sí, avanzar')}</button><button type="button" class="btn2" data-cancelar-fase>Cancelar</button></div>
        </div>` : ''}
      </section>
      <section class="tarjeta columna" style="gap:12px">
        <div><h2 class="h" style="margin:0;font-size:22px">Qué hacer en esta fase</h2><p class="tenue" style="margin:4px 0 0;font-size:14px">Completa estas acciones antes de avanzar. Los funcionarios se encargan de lo demás.</p></div>
        ${acc.length ? acc.map(function (a, i) {
          return P.html`<div class="accion-fase" data-i="${i}"><div class="fila" style="gap:12px;flex-wrap:nowrap"><span class="num-accion ${a.hecha ? 'hecha' : ''}">${a.hecha ? '✓' : (a.info ? '!' : '')}</span><span><strong>${P.t(a.t)}</strong><br><span class="tenue" style="font-size:13px">${P.t(a.d)}</span></span></div>
            ${a.resumen ? P.html`<button type="button" class="btn" data-ver-resumen>${P.t('Ver resumen')}</button>` : a.hecha ? P.html`<span class="ok-texto" style="font-weight:700">${P.t('Hecho')}</span>` : (a.cta ? P.html`<button type="button" class="btn" ${a.ir ? P.seguro('data-ir="' + a.ir + '"') : P.seguro('data-accion-ciclo="' + a.accion + '"')} ${a.off ? P.seguro('disabled') : ''}>${P.t(a.cta)}</button>` : '')}</div>`;
        }) : P.html`<span class="tenue">${P.t(cerrado ? 'El ciclo está cerrado y es de solo lectura.' : 'En esta fase no hay acciones del administrador; los ciudadanos y funcionarios están trabajando.')}</span>`}
        ${(Number(c.votacion_abierta) || c.computo_realizado_en || Number(det.pendientes.votos)) && !acc.some(function (a) { return a.resumen; }) ? P.html`<div class="accion-fase"><div class="fila" style="gap:12px;flex-wrap:nowrap"><span class="num-accion">${P.numero(det.pendientes.votos, 0)}</span><span><strong>${P.t('Votación en curso')}</strong><br><span class="tenue" style="font-size:13px">${P.t('Mira cuántos ciudadanos han votado y en qué colonias. Los votos por proyecto se muestran al contar.')}</span></span></div><button type="button" class="btn2" data-ver-resumen>${P.t('Ver participación')}</button></div>` : ''}
        ${orden >= 7 ? P.html`<div class="accion-fase"><div class="fila" style="gap:12px;flex-wrap:nowrap"><span class="num-accion">⚒</span><span><strong>${P.t('Avance de las obras')}</strong><br><span class="tenue" style="font-size:13px">${P.t('Etapas cumplidas de cada proyecto ganador y alertas cuando el gasto va muy por delante del avance.')}</span></span></div><button type="button" class="btn2" data-ver-obras>${P.t('Ver obras')}</button></div>` : ''}
      </section>`);
  }

  function cargarAvisos() {
    return P.get('/api/avisos').then(function (lista) {
      P.poner(P.$('#avisos'), lista.length ? lista.map(function (a) {
        return P.html`<div class="item"><div class="fila entre"><strong>${a.titulo}</strong><span class="fila">${a.activo ? '' : P.html`<span class="etq">Retirado</span>`}<span class="etq">${a.alcaldia || P.t('Todas las alcaldías')}</span></span></div>
          <div class="texto">${a.mensaje}</div><div class="meta"><span>${a.autor}</span><span>${P.fechaHora(a.publicado_en)}</span>${a.activo ? P.html`<button class="enlace-boton" data-retirar-aviso="${a.id}">Retirar</button>` : ''}</div></div>`;
      }) : P.html`<p class="vacio">No hay avisos</p>`);
    }).catch(function () { return null; });
  }

  function formCiclo(c) {
    var editar = !!c;
    var anio = new Date().getFullYear();
    var m = P.modal({
      titulo: editar ? P.t('Editar ciclo') : P.t('Nuevo ciclo de simulación'), ancho: true,
      contenido: P.html`<form class="formulario" id="form-ciclo" novalidate>
        <label class="completo">Nombre del ciclo<input name="nombre" maxlength="50" data-contador required value="${c ? c.nombre : P.t('Ciclo {a}', { a: anio })}"></label>
        <label>Año simulado<input name="anio_simulado" type="number" min="2000" max="2100" required value="${c ? c.anio_simulado : anio}"></label>
        <label>Presupuesto total (MXN)<input name="presupuesto_total" type="number" min="1" step="0.01" required value="${c ? c.presupuesto_total : 10000000}"></label>
        <label>Porcentaje en partes iguales<input name="porcentaje_partes_iguales" type="number" min="0" max="100" step="1" value="${c ? c.porcentaje_partes_iguales : 50}"></label>
        ${editar ? '' : P.html`<label>Índices de las colonias<select name="origen_indices"><option value="aleatorio">Aleatorios (demostración)</option><option value="api">Datos abiertos sincronizados</option><option value="manual">Captura manual</option></select></label>
          <fieldset class="completo"><legend>Alcaldías participantes</legend><div class="rejilla tres" style="gap:6px">${cat.alcaldias.map(function (a) {
            return P.html`<label class="casilla"><input type="checkbox" name="alcaldias" value="${a.id}" data-lista> ${a.nombre}</label>`;
          })}</div></fieldset>
          <details class="completo"><summary>O elige unidades territoriales específicas</summary><div class="rejilla tres" style="gap:6px">${cat.unidades.map(function (u) {
            var a = cat.alcaldias.find(function (x) { return x.id === u.alcaldia_id; });
            return P.html`<label class="casilla"><input type="checkbox" name="unidades" value="${u.id}" data-lista> ${u.nombre} <span class="tenue pequeno">(${a ? a.clave : ''})</span></label>`;
          })}</div></details>`}
        <div class="completo" id="msg-ciclo"></div></form>`,
      botones: [{ texto: 'Cancelar' }, {
        texto: editar ? 'Guardar' : 'Crear ciclo', clase: 'btn', accion: function (cerrar, el, btn) {
          var d = P.datosForm(P.$('#form-ciclo', el));
          var cuerpo = { nombre: d.nombre, anio_simulado: Number(d.anio_simulado), presupuesto_total: Number(d.presupuesto_total), porcentaje_partes_iguales: Number(d.porcentaje_partes_iguales) };
          var err = Array.from(d.nombre).length < 3 ? 'Escribe el nombre del ciclo' : (!(cuerpo.presupuesto_total > 0) ? 'Indica el presupuesto total' : null);
          if (!editar) {
            cuerpo.origen_indices = d.origen_indices;
            cuerpo.alcaldias = (d.alcaldias || []).map(Number);
            cuerpo.unidades = (d.unidades || []).map(Number);
            if (!err && !cuerpo.alcaldias.length && !cuerpo.unidades.length) err = 'Selecciona al menos una alcaldía o unidad territorial';
          }
          if (err) { P.poner(P.$('#msg-ciclo', el), P.html`<div class="mensaje error">${P.t(err)}</div>`); return; }
          P.accion(btn, function () {
            return (editar ? P.put('/api/admin/ciclos/' + c.id, cuerpo) : P.post('/api/admin/ciclos', cuerpo)).then(function (r) {
              cerrar(); cargarCiclos(editar ? c.id : r.id); cargarModo(); return r;
            });
          }, { destino: P.$('#msg-ciclo', el) });
        },
      }],
    });
    return m;
  }

  function formIndices(utId) {
    var u = det.unidades.find(function (x) { return x.unidad_territorial_id === Number(utId); });
    P.modal({
      titulo: P.t('Índices de {u}', { u: u.nombre }),
      contenido: P.html`<form class="formulario" id="form-ind" novalidate>
        <label>Población<input name="poblacion" type="number" min="0" step="1" value="${u.poblacion}"></label>
        <label>Población flotante<input name="poblacion_flotante" type="number" min="0" step="1" value="${u.poblacion_flotante}"></label>
        <label>Índice de pobreza (0 a 1)<input name="indice_pobreza" type="number" min="0" max="1" step="0.0001" value="${u.indice_pobreza}"></label>
        <label>Índice delictivo (0 a 1)<input name="indice_delictivo" type="number" min="0" max="1" step="0.0001" value="${u.indice_delictivo}"></label>
        <label class="casilla completo"><input type="checkbox" name="es_pueblo_originario" ${u.es_pueblo_originario ? P.seguro('checked') : ''}> Es pueblo originario</label>
        <div class="completo" id="msg-ind"></div></form>`,
      botones: [{ texto: 'Cancelar' }, {
        texto: 'Guardar y recalcular', clase: 'btn', accion: function (cerrar, el, btn) {
          var d = P.datosForm(P.$('#form-ind', el));
          P.accion(btn, function () {
            return P.put('/api/admin/ciclos/' + cicloId + '/unidades/' + utId, d)
              .then(function () { return P.post('/api/admin/ciclos/' + cicloId + '/presupuesto'); })
              .then(function (r) { cerrar(); cargarDetalle(); return r; });
          }, { destino: P.$('#msg-ind', el) });
        },
      }],
    });
  }

  var TEXTOS_ACCION = {
    abrir: ['¿Abrir la votación?', 'Los ciudadanos podrán votar por un proyecto de su colonia.', 'Abrir votación', false],
    cerrar: ['¿Cerrar la votación?', 'Ya no se recibirán votos y el sistema contará los resultados. No se puede volver a abrir.', 'Cerrar y contar', true],
    ganadores: ['¿Publicar los ganadores?', 'Los proyectos ganadores cambian a estatus Ganador y se notifica a sus proponentes.', 'Publicar', false],
    'cerrar-ciclo': ['¿Cerrar el ciclo?', 'El ciclo quedará como histórico de solo lectura y podrás crear uno nuevo.', 'Cerrar ciclo', true],
  };
  function accionCiclo(a, boton) {
    if (a === 'pdf') { var inp = P.$('#pdf-conv'); if (inp) inp.click(); return; }
    if (a === 'activar') {
      var f1 = det.fases.find(function (f) { return f.orden === 1; });
      P.confirmar(P.t('¿Activar el ciclo?'), P.t('El ciclo empieza en la fase 1 · Convocatoria y todos los usuarios lo verán.'), { si: 'Activar' }).then(function (ok) {
        if (ok) P.accion(boton, function () { return P.post('/api/admin/ciclos/' + cicloId + '/fase', { fase: f1.clave }).then(function (r) { setTimeout(function () { location.reload(); }, 700); return r; }); });
      });
      return;
    }
    var t = TEXTOS_ACCION[a];
    P.confirmar(P.t(t[0]), P.t(t[1]), { si: t[2], peligro: t[3] }).then(function (ok) {
      if (!ok) return;
      var url = '/api/admin/ciclos/' + cicloId;
      var pet = a === 'abrir' ? P.post(url + '/votacion', { accion: 'abrir' }) : a === 'cerrar' ? P.post(url + '/votacion', { accion: 'cerrar' })
        : a === 'ganadores' ? P.post(url + '/ganadores') : P.post(url + '/cerrar');
      P.accion(boton, function () { return pet.then(function (r) { cargarCiclos(cicloId); cargarResumen(); if (a === 'cerrar') setTimeout(function () { resumenVotacion(cicloId); }, 400); return r; }); });
    });
  }

  var GENEROS = { mujer: 'Mujer', hombre: 'Hombre', no_binario: 'No binario', prefiero_no_decir: 'Prefiere no decir' };
  var CASOS = { empate: 'Empate', unico_viable: 'Un solo proyecto', sin_votos: 'Sin votos' };
  function barras(lista, etiqueta) {
    var max = Math.max.apply(null, lista.map(function (x) { return Number(x.votantes) || 0; }).concat([1]));
    return lista.map(function (x) {
      var vot = Number(x.votantes) || 0;
      var reg = Number(x.registrados) || 0;
      return P.html`<div class="voto-barra"><span class="voto-etq">${P.t(etiqueta ? etiqueta(x) : x.etiqueta)}</span>
        <span class="voto-pista"><span style="width:${Math.round((100 * vot) / max)}%"></span></span>
        <span class="voto-num">${P.numero(vot, 0)}${reg ? P.html` <small class="tenue">/ ${P.numero(reg, 0)}</small>` : ''}</span></div>`;
    });
  }
  function nombreEtapa(e) { return P.idioma() === 'en' && e.nombre_en ? e.nombre_en : e.nombre_es; }
  function pintarObras(m, id, r) {
    var cuerpo = m.el.querySelector('.cuerpo-modal');
    P.poner(cuerpo, P.html`
      <p class="texto-2" style="margin-top:0">${P.t('El avance se calcula con las etapas que marca el funcionario. Hay alerta cuando el dinero ejercido supera al avance por {u} puntos o más.', { u: r.umbral })}</p>
      ${r.alertas ? P.html`<div class="mensaje alerta" role="status">${P.t('{n} obra(s) con alerta de gasto', { n: r.alertas })}</div>` : ''}
      ${r.obras.length ? r.obras.map(function (o) {
        var av = Number(o.avance_porcentaje);
        var fin = Number(o.avance_financiero);
        var hechas = o.etapas.filter(function (e) { return e.cumplida_en; });
        var ultima = hechas[hechas.length - 1];
        return P.html`<details class="tarjeta" style="padding:14px 16px;margin-top:10px">
          <summary style="cursor:pointer"><strong>${o.titulo}</strong> <span class="tenue">· ${o.folio} · ${o.colonia}, ${o.alcaldia}</span>
            ${o.alerta_gasto ? P.html` <span class="etq error">${P.t('Revisar gasto')}</span>` : ''}
            <div class="columna" style="gap:6px;margin-top:8px">
              <div class="voto-barra"><span class="voto-etq">${P.t('Avance de la obra')}</span><span class="voto-pista"><span style="width:${Math.min(100, av)}%;background:var(--ok)"></span></span><span class="voto-num">${P.numero(av, 0)} %</span></div>
              <div class="voto-barra"><span class="voto-etq">${P.t('Dinero ejercido')}</span><span class="voto-pista"><span style="width:${Math.min(100, fin)}%;background:var(--tenue)"></span></span><span class="voto-num">${P.numero(fin, 0)} %</span></div>
            </div></summary>
          <ol class="etapas-obra" style="margin-top:12px">${o.etapas.map(function (e) {
            return P.html`<li class="${e.cumplida_en ? 'hecha' : 'pendiente'}"><span class="etapa-marca" aria-hidden="true">${e.cumplida_en ? '✓' : e.orden}</span>
              <div class="columna" style="gap:4px;min-width:0;flex:1"><div class="fila entre" style="gap:8px"><strong>${nombreEtapa(e)}</strong><span class="etq">+${P.numero(e.peso, 0)} %</span></div>
              ${e.cumplida_en ? P.html`<span class="pequeno texto-2">${P.t('Cumplida el {f}', { f: P.fecha(e.cumplida_en) })} · ${e.evidencia}</span>` : ''}
              ${ultima && ultima.id === e.id ? P.html`<form class="columna" style="gap:8px;margin-top:6px" data-desmarcar="${o.id}" data-etapa="${e.id}" novalidate>
                <textarea name="motivo" rows="2" maxlength="250" aria-label="${P.t('Motivo de la corrección')}" placeholder="${P.t('Motivo de la corrección (queda en la bitácora)')}"></textarea>
                <div><button type="submit" class="btn2 chico">${P.t('Corregir: desmarcar esta etapa')}</button></div></form>` : ''}
              </div></li>`;
          })}</ol></details>`;
      }) : P.html`<p class="vacio">${P.t('Todavía no hay proyectos ganadores en este ciclo.')}</p>`}`);
  }
  function verObras(id) {
    var m = P.modal({ titulo: P.t('Avance de las obras'), ancho: true, contenido: P.esqueleto(3) });
    var cargar = function () {
      return P.get('/api/admin/ciclos/' + id + '/obras').then(function (r) { pintarObras(m, id, r); },
        function (e) { P.poner(m.el.querySelector('.cuerpo-modal'), P.html`<p class="mensaje error">${e.message}</p>`); });
    };
    m.el.addEventListener('submit', function (e) {
      var f = e.target.closest('[data-desmarcar]');
      if (!f) return;
      e.preventDefault();
      var motivo = f.motivo.value.trim();
      if (Array.from(motivo).length < 10) { P.aviso('Escribe el motivo de la corrección (al menos 10 caracteres)', 'error'); P.sacudir(f); f.motivo.focus(); return; }
      P.accion(f.querySelector('[type=submit]'), function () {
        return P.post('/api/admin/proyectos/' + f.getAttribute('data-desmarcar') + '/etapas/' + f.getAttribute('data-etapa') + '/desmarcar', { motivo: motivo })
          .then(function (r) { return cargar().then(function () { return r; }); });
      });
    });
    cargar();
  }
  function resumenVotacion(id) {
    var m = P.modal({ titulo: P.t('Resumen de la votación'), ancho: true, contenido: P.html`<p class="tenue">${P.t('Cargando…')}</p>` });
    P.get('/api/admin/ciclos/' + id + '/votacion/resumen').then(function (r) {
      var t = r.totales;
      var c = r.ciclo;
      var contado = !!c.computo_realizado_en;
      var estado = contado ? P.t('Votos contados el {f}', { f: P.fechaHora(c.computo_realizado_en) })
        : (c.votacion_abierta ? P.t('La votación sigue abierta: los votos por proyecto se muestran al contar.') : P.t('La votación todavía no se abre.'));
      var colonias = r.colonias.map(function (u) {
        var maxV = Math.max.apply(null, u.proyectos.map(function (p) { return p.votos; }).concat([1]));
        var pct = Number(u.padron) ? Math.round((1000 * Number(u.participantes)) / Number(u.padron)) / 10 : 0;
        return P.html`<details class="tarjeta plegable voto-colonia"${r.colonias.length <= 3 ? P.seguro(' open') : ''}>
          <summary><span class="plegable-titulo">${u.colonia} <small class="tenue">· ${u.alcaldia}</small></span>
            <span class="fila" style="gap:6px">${u.caso_especial && !u.ganador ? P.html`<span class="etq alerta">${P.t(CASOS[u.caso_especial] || u.caso_especial)}</span>` : ''}${u.ganador ? P.html`<span class="etq ok">${P.t('Ganador definido')}</span>` : ''}
            <span class="etq">${P.t('{v} de {p} votaron ({x}%)', { v: P.numero(u.participantes, 0), p: P.numero(u.padron, 0), x: P.numero(pct, 1) })}</span></span></summary>
          ${contado ? (u.proyectos.length ? P.html`<div class="columna" style="gap:8px">${u.proyectos.map(function (p) {
            return P.html`<div class="voto-barra ${p.ganador ? 'ganador' : ''}"><span class="voto-etq"><strong>${p.numero ? p.numero + '. ' : ''}${p.titulo}</strong><br><small class="tenue">${p.folio}${p.ganador ? P.html` · <span class="ok-texto">${P.t('Ganador')}</span>` : ''}</small></span>
              <span class="voto-pista"><span style="width:${Math.round((100 * p.votos) / maxV)}%"></span></span>
              <span class="voto-num">${P.numero(p.votos, 0)} ${P.t(p.votos === 1 ? 'voto' : 'votos')}</span></div>`;
          })}</div>` : P.html`<p class="tenue">${P.t('Sin proyectos en la boleta.')}</p>`) : P.html`<p class="tenue">${P.t('Los votos por proyecto se muestran cuando se cuentan.')}</p>`}
        </details>`;
      });
      P.poner(m.el.querySelector('.cuerpo-modal'), P.html`
        <p class="tenue" style="margin:0 0 12px">${r.ciclo.nombre} · ${estado}</p>
        <div class="rejilla tres" style="margin-bottom:14px">
          <div class="kpi"><span class="valor" data-contar="${Number(t.participantes) || 0}">${P.numero(t.participantes, 0)}</span><span class="nombre">${P.t('Personas que votaron')}</span></div>
          <div class="kpi"><span class="valor" data-contar="${Number(t.porcentaje) || 0}" data-decimales="1" data-sufijo="%">${P.numero(t.porcentaje, 1)}%</span><span class="nombre">${P.t('Participación ({p} registrados)', { p: P.numero(t.padron, 0) })}</span></div>
          <div class="kpi"><span class="valor">${P.numero(t.colonias_con_votos, 0)} / ${P.numero(t.colonias_con_boleta, 0)}</span><span class="nombre">${P.t('Colonias con votos / con boleta')}</span></div>
          ${contado ? P.html`<div class="kpi"><span class="valor">${P.numero(t.ganadores, 0)}</span><span class="nombre">${P.t('Colonias con ganador')}</span></div>
          <div class="kpi"><span class="valor">${P.numero(t.casos_especiales, 0)}</span><span class="nombre">${P.t('Casos especiales por resolver')}</span></div>` : ''}
        </div>
        <h3 class="h" style="font-size:17px;margin:6px 0">${P.t('Resultados por colonia')}</h3>
        ${colonias.length ? P.html`<div class="columna" style="gap:10px">${colonias}</div>` : P.html`<p class="vacio">${P.t('Todavía no hay colonias con boleta.')}</p>`}
        <div class="rejilla dos" style="margin-top:16px;gap:16px">
          <div><h3 class="h" style="font-size:17px;margin:6px 0">${P.t('Quién votó por género')}</h3>${r.por_genero.length ? barras(r.por_genero, function (x) { return GENEROS[x.etiqueta] || x.etiqueta; }) : P.html`<p class="tenue">${P.t('Sin datos')}</p>`}</div>
          <div><h3 class="h" style="font-size:17px;margin:6px 0">${P.t('Quién votó por edad')}</h3>${r.por_edad.length ? barras(r.por_edad, function (x) { return P.t('{e} años', { e: x.etiqueta }); }) : P.html`<p class="tenue">${P.t('Sin datos')}</p>`}</div>
        </div>
        ${r.por_dia.length ? P.html`<h3 class="h" style="font-size:17px;margin:16px 0 6px">${P.t('Votos por día')}</h3>${barras(r.por_dia, function (x) { return P.fecha(x.dia); })}` : ''}
        <h3 class="h" style="font-size:17px;margin:16px 0 6px">${P.t('Personas que votaron ({n})', { n: P.numero(r.participantes_total, 0) })}</h3>
        <p class="tenue" style="margin:0 0 8px;font-size:13px">${P.t('El voto es secreto: aquí se ve quién participó, pero nunca por qué proyecto votó.')}</p>
        ${r.participantes.length ? P.html`<input type="search" class="campo-buscar" data-buscar-votante placeholder="${P.t('Buscar por nombre o colonia')}" maxlength="60" style="margin-bottom:8px;width:100%">
          <div class="tabla-cont" style="max-height:320px;overflow:auto"><table><thead><tr><th>${P.t('Nombre')}</th><th>${P.t('Colonia')}</th><th>${P.t('Alcaldía')}</th><th>${P.t('Fecha y hora')}</th></tr></thead>
          <tbody>${r.participantes.map(function (x) { return P.html`<tr data-fila-votante="${(x.nombre + ' ' + x.colonia + ' ' + x.alcaldia).toLowerCase()}"><td>${x.nombre}</td><td>${x.colonia}</td><td>${x.alcaldia}</td><td>${P.fechaHora(x.fecha)}</td></tr>`; })}</tbody></table></div>` : P.html`<p class="vacio">${P.t('Nadie ha votado todavía.')}</p>`}
        ${contado ? P.html`<div class="fila" style="margin-top:14px"><button type="button" class="btn2 chico" data-descargar="/api/admin/ciclos/${c.id}/resultados.csv">${P.t('Descargar resultados (CSV)')}</button></div>` : ''}`);
      P.animarNumeros(m.el);
      var buscar = m.el.querySelector('[data-buscar-votante]');
      if (buscar) buscar.addEventListener('input', function () {
        var q = buscar.value.trim().toLowerCase();
        P.$$('[data-fila-votante]', m.el).forEach(function (f) { f.hidden = q && f.getAttribute('data-fila-votante').indexOf(q) < 0; });
      });
    }).catch(function (e) { P.poner(m.el.querySelector('.cuerpo-modal'), P.html`<p class="mensaje error">${e.message}</p>`); });
  }

  function cargarActividad() {
    return P.get('/api/admin/bitacora' + P.qs({ limite: 10 })).then(function (d) {
      P.poner(P.$('#actividad'), d.registros.length ? P.html`<div class="tabla-cont"><table><thead><tr><th>Fecha</th><th>Quién</th><th>Alcaldía</th><th>Qué hizo</th></tr></thead>
        <tbody>${d.registros.map(function (r) {
          return P.html`<tr><td>${P.fechaHora(r.realizada_en)}</td><td>${r.responsable || '—'}</td><td>${r.alcaldia || '—'}</td><td>${r.accion.replace(/_/g, ' ')}</td></tr>`;
        })}</tbody></table></div>` : P.html`<p class="vacio">Todavía no hay acciones registradas</p>`);
    }, function (e) { P.poner(P.$('#actividad'), P.html`<p class="mensaje error">${e.message}</p>`); });
  }

  P.pagina(function () {
    P.$('#csv-actividad').addEventListener('click', function (e) { P.descargar('/api/admin/bitacora.csv', e.currentTarget); });
    document.addEventListener('toggle', function (e) {
      var d = e.target;
      if (d && d.getAttribute && d.getAttribute('data-plegable')) abiertos[d.getAttribute('data-plegable')] = d.open;
    }, true);
    P.$('#modo').addEventListener('change', function (e) {
      if (e.target.id !== 'ciclo-practica') return;
      cicloId = Number(e.target.value);
      var c = (listaCiclos || []).find(function (x) { return x.id === cicloId; });
      P.$('#aplicar-modo').disabled = !!(c && c.estado === 'cerrado');
      cargarDetalle();
    });
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('[data-nuevo]')) { formCiclo(null); return; }
      if (t.closest('#aplicar-modo')) { aplicarModo(t.closest('#aplicar-modo')); return; }
      if (t.closest('[data-editar-ciclo]')) { formCiclo(det.ciclo); return; }
      var d = t.closest('[data-descargar]');
      if (d) { P.descargar(d.getAttribute('data-descargar'), d); return; }
      var pf = t.closest('[data-pedir-fase]');
      if (pf) { pidiendo = pf.getAttribute('data-pedir-fase'); pintarControl(); var cf = P.$('[data-cambiar-fase]'); if (cf) cf.focus(); return; }
      if (t.closest('[data-cancelar-fase]')) { pidiendo = null; pintarControl(); return; }
      var cfa = t.closest('[data-cambiar-fase]');
      if (cfa) { P.accion(cfa, function () { return P.post('/api/admin/ciclos/' + cicloId + '/fase', { fase: cfa.getAttribute('data-cambiar-fase') }).then(function (r) { pidiendo = null; setTimeout(function () { location.reload(); }, 700); return r; }); }); return; }
      var ir = t.closest('[data-ir]');
      if (ir) { var dest = P.$(ir.getAttribute('data-ir')); if (dest) { if (dest.tagName === 'DETAILS') dest.open = true; dest.scrollIntoView({ behavior: 'smooth', block: 'start' }); } return; }
      if (t.closest('[data-ver-resumen]')) { resumenVotacion(cicloId); return; }
      if (t.closest('[data-ver-obras]')) { verObras(cicloId); return; }
      var ac = t.closest('[data-accion-ciclo]');
      if (ac) { accionCiclo(ac.getAttribute('data-accion-ciclo'), ac); return; }
      var ind = t.closest('[data-indices]');
      if (ind) { formIndices(ind.getAttribute('data-indices')); return; }
      var ra = t.closest('[data-retirar-aviso]');
      if (ra) { P.accion(ra, function () { return P.post('/api/avisos/' + ra.getAttribute('data-retirar-aviso') + '/retirar').then(function (r) { cargarAvisos(); return r; }); }); return; }
      if (t.closest('#recalcular')) { P.accion(t.closest('#recalcular'), function () { return P.post('/api/admin/ciclos/' + cicloId + '/presupuesto').then(function (r) { cargarDetalle(); return r; }); }); return; }
      if (t.closest('[data-eliminar-ciclo]')) {
        P.confirmar(P.t('¿Eliminar el ciclo en borrador?'), P.t('Se borrarán sus fechas y unidades participantes.'), { si: 'Eliminar', peligro: true }).then(function (ok) {
          if (ok) P.accion(null, function () { return P.del('/api/admin/ciclos/' + cicloId).then(function (r) { cargarCiclos(); return r; }); });
        });
        return;
      }
      var f = t.closest('[data-fase]');
      if (f) {
        P.confirmar(P.t('¿Cambiar de fase?'), P.t('El ciclo pasará a la fase "{f}". Todos los usuarios verán el cambio de inmediato.', { f: f.getAttribute('data-nombre') }), { si: 'Cambiar fase' }).then(function (ok) {
          if (ok) P.accion(f, function () { return P.post('/api/admin/ciclos/' + cicloId + '/fase', { fase: f.getAttribute('data-fase') }).then(function (r) { cargarCiclos(cicloId); setTimeout(function () { location.reload(); }, 700); return r; }); });
        });
        return;
      }
      var g = t.closest('#guardar-fechas');
      if (g) {
        var rev = revisarFechas(true);
        var fases = rev.fases;
        var err = rev.errores[0] || null;
        if (err || !fases.length) {
          P.aviso(err || 'Indica al menos las fechas de una fase', 'error');
          var mal = P.$('#calendario input.fecha-mal');
          if (mal) mal.focus();
          return;
        }
        P.accion(g, function () { return P.put('/api/admin/ciclos/' + cicloId + '/fases', { fases: fases }).then(function (r) { cargarDetalle(); return r; }); });
      }
    });
    document.addEventListener('input', function (e) {
      if (e.target.matches && e.target.matches('#calendario [data-inicio], #calendario [data-fin]')) revisarFechas(false);
    });
    document.addEventListener('change', function (e) {
      if (e.target.matches && e.target.matches('#calendario [data-inicio], #calendario [data-fin]')) revisarFechas(false);
    });
    document.addEventListener('submit', function (e) {
      if (e.target.id !== 'form-aviso') return;
      e.preventDefault();
      var d = P.datosForm(e.target);
      if (Array.from(d.titulo).length < 3 || Array.from(d.mensaje).length < 5) { P.aviso('Escribe el título y el mensaje del aviso', 'error'); return; }
      P.accion(e.target.querySelector('button'), function () {
        return P.post('/api/avisos', { titulo: d.titulo, mensaje: d.mensaje, alcaldia_id: d.alcaldia_id ? Number(d.alcaldia_id) : null })
          .then(function (r) { e.target.reset(); cargarAvisos(); return r; });
      });
    });
    return P.catalogos().then(function (c) { cat = c; return Promise.all([cargarResumen(), cargarCiclos(), cargarModo(), cargarActividad()]); });
  });
}());
