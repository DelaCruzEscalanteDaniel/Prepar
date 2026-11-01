(function () {
  'use strict';
  var P = window.Prepar;
  if (!P || P.mascota) return;
  var doc = document;
  var NOMBRE = 'Inge Prepi';
  var RUTA = '/img/mascota/';
  var VERSION = '4';
  var PAGINAS = {
    'publico/portada': ['base', 'Aquí practicas cómo se decide en qué se gasta el presupuesto de tu colonia. Crea tu cuenta para empezar.'],
    'publico/login': ['senala', 'Escribe tu correo y tu contraseña. Si la olvidaste, usa «¿Olvidaste tu contraseña?».'],
    'publico/registro': ['revisa', 'Son cuatro pasos. Elige bien tu colonia: ahí participarás.'],
    'publico/recuperar': ['aviso', 'Te enviaremos un enlace a tu correo. Revisa también la carpeta de spam.'],
    'publico/restablecer': ['ajustes', 'Escribe tu contraseña nueva dos veces, igual en ambos campos.'],
    'publico/directorio': ['lupa', 'Busca por alcaldía o por tema para saber a quién contactar.'],
    'publico/privacidad': ['revisa', 'Aquí explicamos qué datos guardamos y para qué.'],
    'publico/terminos': ['revisa', 'Lee los términos y, si estás de acuerdo, acéptalos para continuar.'],
    'ciudadano/inicio': ['base', '«Tu siguiente paso» siempre te dice qué hacer hoy.'],
    'ciudadano/foro': ['plano', 'Comparte ideas, apoya las de tus vecinos y registra tu proyecto.'],
    'ciudadano/proyectos': ['plano', 'Aquí ves tus proyectos y en qué etapa va cada uno.'],
    'ciudadano/votacion': ['revisa', 'Elige un proyecto y confirma tu voto. Solo se puede votar una vez.'],
    'ciudadano/mapa': ['plano', 'Toca un punto para ver su ficha. El color indica el tipo de proyecto.'],
    'ciudadano/seguimiento': ['lupa', 'Revisa el avance de las obras y manda fotos si ves algo raro.'],
    'ciudadano/directorio': ['lupa', 'Busca por alcaldía o por tema para saber a quién contactar.'],
    'ciudadano/perfil': ['ajustes', 'Cambia tu foto, tus datos, tu idioma o tu contraseña.'],
    'funcionario/inicio': ['tablero', 'Empieza por la tarjeta marcada como prioridad.'],
    'funcionario/registros': ['revisa', 'Revisa que cada proyecto tenga todo. Si falta algo, pide corrección.'],
    'funcionario/dictaminacion': ['revisa', 'Si un criterio no se cumple, el proyecto no es viable. Explica siempre el motivo.'],
    'funcionario/sorteo': ['celebra', 'El sorteo es al azar: nadie elige el número.'],
    'funcionario/mapa': ['plano', 'Elige un proyecto y corrige su ubicación si hace falta.'],
    'funcionario/seguimiento': ['lupa', 'Actualiza el avance y atiende los reportes de los vecinos.'],
    'funcionario/directorio': ['lupa', 'Captura datos solo de fuentes públicas oficiales.'],
    'funcionario/perfil': ['ajustes', 'Si te dieron una contraseña temporal, cámbiala aquí.'],
    'administrador/inicio': ['tablero', 'Haz las acciones de la fase antes de avanzar a la siguiente.'],
    'administrador/estadisticas': ['tablero', 'Elige qué analizar y usa los filtros para comparar.'],
    'administrador/usuarios': ['revisa', 'Al registrar un funcionario, elige solo las funciones que necesita.'],
    'administrador/mapa': ['plano', 'Un tipo nuevo aparece solo en formularios, mapas y simbología.'],
    'administrador/integraciones': ['ajustes', 'Las fuentes se actualizan solas. Aquí también se prueba el correo.'],
    'administrador/perfil': ['ajustes', 'Actualiza tus datos y tu contraseña.'],
  };
  var DORMIR_MS = 60 * 1000;

  function texto(t, datos) { return P.t(t, datos); }
  var almacen = {
    leer: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    poner: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { return; } },
  };
  var poseFija = null;
  var reducido = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var rol = doc.body.getAttribute('data-rol') || 'publico';
  var pagina = doc.body.getAttribute('data-pagina') || '';
  var datosPagina = PAGINAS[rol + '/' + pagina] || PAGINAS['publico/' + pagina] || [pagina === '-' ? 'duda' : 'base', pagina === '-' ? 'Esta página no existe. Regresa al inicio desde el menú.' : 'Si te pierdes, toca «Ayuda».'];

  poseFija = datosPagina[0];
  var raiz = doc.createElement('div');
  raiz.className = 'mascota';
  P.poner(raiz, P.html`
    <div class="mascota-globo" role="status" aria-live="polite" hidden>
      <button type="button" class="mascota-cerrar-globo" aria-label="${P.t('Cerrar mensaje')}">✕</button>
      <p class="mascota-texto"></p>
      <div class="mascota-acciones"></div>
    </div>
    <button type="button" class="mascota-boton" aria-label="${P.t('{n}, tu guía: toca para ver un consejo', { n: NOMBRE })}" aria-expanded="false">
      <span class="mascota-sombra" aria-hidden="true"></span>
      <span class="mascota-cuerpo"><span class="mascota-espejo"><img class="mascota-img" alt="" width="120" height="110" decoding="async"></span></span>
      <span class="mascota-zzz" aria-hidden="true"><i>z</i><i>z</i><i>Z</i></span>
    </button>
    <button type="button" class="mascota-ocultar" aria-label="${P.t('Ocultar a {n}', { n: NOMBRE })}" title="${P.t('Ocultar a {n}', { n: NOMBRE })}">–</button>`);
  var boton = raiz.querySelector('.mascota-boton');
  var img = raiz.querySelector('.mascota-img');
  var globo = raiz.querySelector('.mascota-globo');
  var parrafo = raiz.querySelector('.mascota-texto');
  var acciones = raiz.querySelector('.mascota-acciones');

  function url(p) { return RUTA + p + '.webp?v=' + VERSION; }
  var cargadas = {};
  function precargar(p) {
    if (cargadas[p]) return;
    cargadas[p] = true;
    var i = new Image();
    i.src = url(p);
  }

  var poseActual = null;
  var temporal = null;
  var ocupados = 0;
  var dormida = false;
  var sinRed = !navigator.onLine;

  function poseQueToca() {
    if (raiz.classList.contains('mini')) return 'cara';
    if (sinRed) return 'espera';
    if (temporal) return temporal.pose;
    if (ocupados > 0) return 'cargando';
    if (dormida) return 'duerme';
    return poseFija === 'senala' && esquina !== 'izq' ? 'base' : poseFija;
  }
  var ANIMS = ['anim-salta', 'anim-sacude', 'anim-pop', 'anim-saluda', 'anim-entra'];
  function pintar(animacion) {
    var p = poseQueToca();
    if (p !== poseActual) {
      poseActual = p;
      precargar(p);
      img.src = url(p);
      raiz.setAttribute('data-pose', p);
    }
    raiz.classList.toggle('durmiendo', p === 'duerme');
    if (animacion && !reducido) {
      ANIMS.forEach(function (c) { raiz.classList.remove(c); });
      void raiz.offsetWidth;
      raiz.classList.add('anim-' + animacion);
    }
  }
  raiz.addEventListener('animationend', function (e) {
    if (e.target === raiz || e.target === boton) ANIMS.forEach(function (c) { raiz.classList.remove(c); });
  });

  var relojTemporal = null;
  function reaccionar(pose, animacion, ms) {
    temporal = { pose: pose };
    despertar(true);
    pintar(animacion || 'pop');
    clearTimeout(relojTemporal);
    relojTemporal = setTimeout(function () { temporal = null; pintar('pop'); }, ms || 2600);
  }

  var relojGlobo = null;
  function decir(mensaje, op) {
    op = op || {};
    if (raiz.classList.contains('mini')) return;
    parrafo.textContent = texto(mensaje, op.datos);
    P.poner(acciones, (op.botones || []).map(function (b, i) {
      return P.html`<button type="button" class="${i === 0 ? 'btn chico' : 'btn2 chico'}" data-i="${i}">${P.t(b.texto)}</button>`;
    }));
    acciones.hidden = !(op.botones || []).length;
    acciones.onclick = function (e) {
      var b = e.target.closest('[data-i]');
      if (!b) return;
      var def = op.botones[Number(b.getAttribute('data-i'))];
      callar();
      if (def && def.accion) def.accion();
    };
    globo.hidden = false;
    raiz.classList.add('hablando');
    boton.setAttribute('aria-expanded', 'true');
    clearTimeout(relojGlobo);
    if (op.ms !== 0) relojGlobo = setTimeout(callar, op.ms || 7000);
  }
  function callar() {
    clearTimeout(relojGlobo);
    globo.hidden = true;
    raiz.classList.remove('hablando');
    boton.setAttribute('aria-expanded', 'false');
  }
  raiz.querySelector('.mascota-cerrar-globo').addEventListener('click', callar);
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !globo.hidden) callar(); });

  var esquina = 'der';
  var moviendo = false;
  var pendiente = null;
  function colocar(lado) {
    esquina = lado;
    raiz.classList.toggle('lado-izq', lado === 'izq');
    poseActual = null;
    pintar();
  }
  function cambiarEsquina(lado) {
    lado = lado || (esquina === 'der' ? 'izq' : 'der');
    if (lado === esquina || raiz.classList.contains('mini')) return;
    if (moviendo) { pendiente = lado; return; }
    callar();
    if (reducido) { colocar(lado); return; }
    moviendo = true;
    raiz.classList.add('se-mueve', 'baja');
    setTimeout(function () {
      colocar(lado);
      raiz.classList.remove('baja');
      void raiz.offsetWidth;
      raiz.classList.add('sube');
      setTimeout(function () {
        raiz.classList.remove('sube', 'se-mueve');
        moviendo = false;
        if (pendiente) { var l = pendiente; pendiente = null; cambiarEsquina(l); }
      }, 560);
    }, 340);
  }

  function tapa(el) {
    if (!el || !el.getBoundingClientRect || raiz.contains(el)) return false;
    var a = el.getBoundingClientRect();
    var b = boton.getBoundingClientRect();
    return a.right > b.left + 10 && a.left < b.right - 10 && a.bottom > b.top + 10 && a.top < b.bottom - 10;
  }
  var celular = window.matchMedia ? window.matchMedia('(max-width: 720px)') : { matches: false };
  doc.addEventListener('focusin', function (e) {
    var el = e.target;
    if (!el || raiz.contains(el) || raiz.classList.contains('mini')) return;
    if (el.matches && el.matches('input[type=search], input[name=q], input[name=buscar], [data-buscar]')) {
      temporal = { pose: 'lupa' };
      pintar('pop');
    }
    if (celular.matches && el.matches && el.matches('input:not([type=checkbox]):not([type=radio]):not([type=file]), textarea, select')) {
      raiz.classList.add('escondida');
      return;
    }
    if (tapa(el)) cambiarEsquina();
  });
  doc.addEventListener('focusout', function (e) {
    if (temporal && temporal.pose === 'lupa' && e.target && e.target.matches && e.target.matches('input')) { temporal = null; pintar(); }
    setTimeout(function () {
      var a = doc.activeElement;
      if (!(a && a.matches && a.matches('input, textarea, select'))) raiz.classList.remove('escondida');
    }, 150);
  });
  var cercaDesde = 0;
  doc.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse' || moviendo || raiz.classList.contains('mini') || raiz.classList.contains('hablando')) { cercaDesde = 0; return; }
    var b = boton.getBoundingClientRect();
    var dentro = e.clientX > b.left && e.clientX < b.right && e.clientY > b.top && e.clientY < b.bottom;
    var debajo = null;
    if (dentro) {
      raiz.style.pointerEvents = 'none';
      boton.style.pointerEvents = 'none';
      debajo = doc.elementFromPoint(e.clientX, e.clientY);
      raiz.style.pointerEvents = '';
      boton.style.pointerEvents = '';
    }
    var hayAlgo = debajo && debajo.closest && debajo.closest('a, button, input, select, textarea, label, [role=button], [tabindex]');
    if (!dentro || !hayAlgo) { cercaDesde = 0; return; }
    if (!cercaDesde) { cercaDesde = Date.now(); return; }
    if (Date.now() - cercaDesde > 1400) { cercaDesde = 0; cambiarEsquina(); }
  }, { passive: true });

  boton.addEventListener('click', function () {
    if (raiz.classList.contains('mini')) { mostrar(true); return; }
    if (!globo.hidden) { callar(); return; }
    despertar(true);
    reaccionar('duda', 'saluda', 2200);
    var botones = [];
    if (P.abrirGuia && P.abrirGuia(true)) botones.push({ texto: 'Ver la ayuda de esta página', accion: function () { P.abrirGuia(); } });
    if (P.usuario && P.bienvenida) botones.push({ texto: 'Recorrido rápido', accion: function () { P.bienvenida(true); } });
    decir(datosPagina[1], { botones: botones, ms: 12000 });
  });

  function ocultar() {
    callar();
    raiz.classList.add('mini');
    doc.body.classList.add('mascota-mini');
    boton.setAttribute('aria-label', P.t('Mostrar a {n}', { n: NOMBRE }));
    almacen.poner('prepar_mascota', 'mini');
    temporal = null;
    colocar('der');
  }
  function mostrar(saludar) {
    raiz.classList.remove('mini');
    doc.body.classList.remove('mascota-mini');
    boton.setAttribute('aria-label', P.t('{n}, tu guía: toca para ver un consejo', { n: NOMBRE }));
    almacen.poner('prepar_mascota', 'visible');
    poseActual = null;
    pintar(saludar ? 'saluda' : null);
    if (saludar && !reducido) { raiz.classList.add('se-mueve', 'sube'); setTimeout(function () { raiz.classList.remove('sube', 'se-mueve'); }, 560); }
    if (saludar) decir('¡Aquí estoy! Tócame cuando necesites un consejo.', { ms: 4000 });
  }
  raiz.querySelector('.mascota-ocultar').addEventListener('click', ocultar);

  var relojSueno = null;
  function programarSueno() {
    clearTimeout(relojSueno);
    relojSueno = setTimeout(function () {
      if (doc.hidden) { programarSueno(); return; }
      dormida = true;
      callar();
      pintar('pop');
    }, DORMIR_MS);
  }
  function despertar(silencioso) {
    var estaba = dormida;
    dormida = false;
    programarSueno();
    if (estaba && !silencioso) pintar('salta');
  }
  var alMoverse = P.debounce ? P.debounce(function () { despertar(false); }, 250) : function () { despertar(false); };
  ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove'].forEach(function (ev) {
    doc.addEventListener(ev, alMoverse, { passive: true });
  });

  window.addEventListener('offline', function () { sinRed = true; pintar('sacude'); decir('Parece que no hay internet. En cuanto vuelva, seguimos.', { ms: 6000 }); });
  window.addEventListener('online', function () { sinRed = false; pintar('salta'); decir('¡Volvió la conexión!', { ms: 2500 }); });

  var LOGROS = /voto|votaste|vote|registr[óo] (tu|el) proyecto|proyecto registrado|project registered|cuenta creada|bienvenid|welcome|publicaron|ganador|winner|calificaci[óo]n|rating/i;
  P.mascota = {
    aviso: function (mensaje, tipo) {
      callar();
      if (tipo === 'error') reaccionar('error', 'sacude', 3200);
      else if (LOGROS.test(String(mensaje || ''))) P.mascota.celebrar();
      else reaccionar('ok', 'pop', 2400);
    },
    celebrar: function () { reaccionar('celebra', 'salta', 3000); },
    ocupado: function (delta) {
      ocupados = Math.max(0, ocupados + delta);
      pintar();
    },
    avisosNuevos: function (n, abrir) {
      if (!n || almacen.leer('prepar_guia_mascota_avisos') === 'visto' || raiz.classList.contains('mini')) return;
      almacen.poner('prepar_guia_mascota_avisos', 'visto');
      var intentos = 0;
      var avisar = function () {
        if ((moviendo || raiz.classList.contains('hablando') || doc.querySelector('.modal-fondo')) && intentos < 40) {
          intentos += 1; setTimeout(avisar, 1500); return;
        }
        reaccionar('aviso', 'saluda', 5000);
        decir(n === 1 ? 'Tienes 1 aviso nuevo.' : 'Tienes {n} avisos nuevos.', { datos: { n: n }, ms: 8000, botones: abrir ? [{ texto: 'Ver avisos', accion: abrir }] : [] });
      };
      setTimeout(avisar, 3500);
    },
    decir: decir,
    reaccionar: reaccionar,
    cambiarEsquina: cambiarEsquina,
  };

  doc.body.appendChild(raiz);
  doc.body.classList.add('con-mascota');
  setTimeout(function () { ['ok', 'error', 'cargando', 'duerme'].forEach(precargar); }, 4000);
  if (almacen.leer('prepar_mascota') === 'mini') ocultar();
  else {
    if (pagina === 'login') colocar('izq');
    pintar();
    if (!reducido) raiz.classList.add('anim-entra');
  }
  programarSueno();

  if (P.usuario && pagina === 'inicio' && almacen.leer('prepar_guia_mascota_saludo') !== 'visto' && !raiz.classList.contains('mini')) {
    var esperas = 0;
    var saludar = function () {
      if (doc.querySelector('.modal-fondo') && esperas < 180) { esperas += 1; setTimeout(saludar, 700); return; }
      almacen.poner('prepar_guia_mascota_saludo', 'visto');
      var nombre = String(P.usuario.nombre || '').split(' ')[0];
      reaccionar('celebra', 'saluda', 2600);
      decir(nombre ? '¡Hola, {nombre}! Soy {n}. Tócame cuando necesites un consejo.' : '¡Hola! Soy {n}. Tócame cuando necesites un consejo.', { datos: { nombre: nombre, n: NOMBRE }, ms: 8000 });
    };
    setTimeout(saludar, 1500);
  }
}());
