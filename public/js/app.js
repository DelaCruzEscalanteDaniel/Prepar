(function () {
  'use strict';

  var P = window.Prepar = {};

  try {
    if (/\.html$/.test(location.pathname) && window.history && history.replaceState) {
      var limpia = location.pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
      history.replaceState(history.state, '', limpia + location.search + location.hash);
    }
  } catch (e) { }
  var doc = document;

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
  P.esc = function (v) { return String(v === null || v === undefined ? '' : v).replace(/[&<>"'`]/g, function (c) { return ESC[c]; }); };

  function Seguro(s) { this.s = s; }
  Seguro.prototype.toString = function () { return this.s; };
  P.seguro = function (s) { return new Seguro(String(s)); };

  function aTexto(v) {
    if (v instanceof Seguro) return v.s;
    if (Array.isArray(v)) return v.map(aTexto).join('');
    if (v === null || v === undefined || v === false) return '';
    return P.esc(v);
  }
  P.html = function (partes) {
    var vals = Array.prototype.slice.call(arguments, 1);
    var s = '';
    for (var i = 0; i < partes.length; i += 1) {
      s += partes[i];
      if (i < vals.length) s += aTexto(vals[i]);
    }
    return new Seguro(s);
  };
  P.poner = function (el, contenido) {
    if (!el) return;
    el.innerHTML = aTexto(contenido);
    P.i18n.aplicar(el);
    P.contadores(el);
  };
  P.$ = function (sel, raiz) { return (raiz || doc).querySelector(sel); };
  P.$$ = function (sel, raiz) { return Array.prototype.slice.call((raiz || doc).querySelectorAll(sel)); };
  P.qs = function (obj) {
    var p = new URLSearchParams();
    Object.keys(obj || {}).forEach(function (k) {
      var v = obj[k];
      if (v !== undefined && v !== null && v !== '') p.append(k, v);
    });
    var s = p.toString();
    return s ? '?' + s : '';
  };
  P.debounce = function (fn, ms) {
    var t;
    return function () {
      var args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(null, args); }, ms || 300);
    };
  };
  P.param = function (nombre) { return new URLSearchParams(location.search).get(nombre); };
  P.iniciales = function (nombre) {
    return String(nombre || '?').trim().split(/\s+/).slice(0, 2).map(function (x) { return x.charAt(0).toUpperCase(); }).join('') || '?';
  };
  P.img = function (uuid, mini) { return uuid ? '/api/archivos/' + encodeURIComponent(uuid) + (mini ? '?mini=1' : '') : ''; };
  P.avatar = function (nombre, fotoUuid, clase) {
    return fotoUuid
      ? P.html`<span class="avatar ${clase || ''}"><img src="${P.img(fotoUuid)}" alt=""></span>`
      : P.html`<span class="avatar ${clase || ''}" aria-hidden="true">${P.iniciales(nombre)}</span>`;
  };

  var idioma = doc.documentElement.getAttribute('lang') === 'en' ? 'en' : 'es';
  P.idioma = function () { return idioma; };
  var ATRIBUTOS = ['placeholder', 'title', 'aria-label', 'alt'];
  P.i18n = {
    t: function (texto, vars) {
      var s = String(texto);
      if (idioma === 'en' && window.PREPAR_EN && Object.prototype.hasOwnProperty.call(window.PREPAR_EN, s)) s = window.PREPAR_EN[s];
      if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m; });
      return s;
    },
    aplicar: function (raiz) {
      if (idioma !== 'en' || !window.PREPAR_EN || !raiz) return;
      var dic = window.PREPAR_EN;
      var w = doc.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, null);
      var n;
      var lista = [];
      while ((n = w.nextNode())) lista.push(n);
      lista.forEach(function (nodo) {
        var p = nodo.parentNode;
        if (!p || p.nodeName === 'SCRIPT' || p.nodeName === 'STYLE' || (p.closest && p.closest('[data-sin-traducir]'))) return;
        var original = nodo.nodeValue;
        var limpio = original.trim();
        if (limpio && Object.prototype.hasOwnProperty.call(dic, limpio)) nodo.nodeValue = original.replace(limpio, dic[limpio]);
      });
      var els = raiz.querySelectorAll ? raiz.querySelectorAll('[placeholder],[title],[aria-label],[alt]') : [];
      Array.prototype.forEach.call(els, function (el) {
        ATRIBUTOS.forEach(function (a) {
          var v = el.getAttribute(a);
          if (v && Object.prototype.hasOwnProperty.call(dic, v.trim())) el.setAttribute(a, dic[v.trim()]);
        });
      });
    },
  };
  P.t = P.i18n.t;
  var dicEn = function () { return window.PREPAR_EN || {}; };
  function campoEn(c) {
    var d = dicEn();
    var k = 'campo:' + c.charAt(0).toLowerCase() + c.slice(1);
    var v = Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null;
    return v;
  }
  var mayusEn = function (t) { return t.charAt(0).toUpperCase() + t.slice(1); };
  var PATRONES_EN = [
    [/^Escribe (.+)$/, function (m, c) { return 'Enter ' + c(m[1]); }],
    [/^Indica (.+)$/, function (m, c) { return 'Enter ' + c(m[1]); }],
    [/^(?:Elige|Selecciona) (.+)$/, function (m, c) { return 'Choose ' + c(m[1]); }],
    [/^(.+) admite hasta (\d+) caracteres \(escribiste (\d+)\)$/, function (m, c) { return mayusEn(c(m[1])) + ' allows up to ' + m[2] + ' characters (you typed ' + m[3] + ')'; }],
    [/^(.+) admite hasta (\d+) caracteres$/, function (m, c) { return mayusEn(c(m[1])) + ' allows up to ' + m[2] + ' characters'; }],
    [/^(.+) debe tener al menos (\d+) caracteres$/, function (m, c) { return mayusEn(c(m[1])) + ' must have at least ' + m[2] + ' characters'; }],
    [/^(.+) debe tener de (\d+) a (\d+) caracteres$/, function (m, c) { return mayusEn(c(m[1])) + ' must have ' + m[2] + ' to ' + m[3] + ' characters'; }],
    [/^(.+) debe ser un número$/, function (m, c) { return mayusEn(c(m[1])) + ' must be a number'; }],
    [/^(.+) debe estar entre (.+) y (.+)$/, function (m, c) { return mayusEn(c(m[1])) + ' must be between ' + m[2] + ' and ' + m[3]; }],
    [/^(.+) no es válid[oa] \(usa AAAA-MM-DD\)$/, function (m, c) { return mayusEn(c(m[1])) + ' is not valid (use YYYY-MM-DD)'; }],
    [/^(.+) no es una dirección válida$/, function (m, c) { return mayusEn(c(m[1])) + ' is not a valid address'; }],
    [/^(.+) no es válid[oa]$/, function (m, c) { return mayusEn(c(m[1])) + ' is not valid'; }],
    [/^(.+) no existe$/, function (m, c) { return mayusEn(c(m[1])) + ' does not exist'; }],
    [/^(.+) debe tener palabras, no solo números o símbolos$/, function (m, c) { return mayusEn(c(m[1])) + ' must contain words, not just numbers or symbols'; }],
    [/^(.+) no parece un texto válido$/, function (m, c) { return mayusEn(c(m[1])) + " doesn't look like valid text"; }],
    [/^El costo estimado no puede ser mayor al presupuesto de tu colonia \((.+)\)$/, function (m) { return 'The estimated cost cannot exceed your neighborhood budget (' + m[1] + ')'; }],
    [/^(.+) solo puede tener letras, números y estos símbolos: (.+)$/, function (m, c) { return mayusEn(c(m[1])) + ' can only contain letters, numbers and these symbols: ' + m[2]; }],
    [/^(.+) no puede tener espacios$/, function (m, c) { return mayusEn(c(m[1])) + ' cannot contain spaces'; }],
    [/^(.+) debe tener al menos una letra mayúscula$/, function (m, c) { return mayusEn(c(m[1])) + ' must have at least one uppercase letter'; }],
    [/^(.+) debe tener al menos un número$/, function (m, c) { return mayusEn(c(m[1])) + ' must have at least one number'; }],
    [/^(.+) es demasiado larga: usa menos acentos o símbolos especiales$/, function (m, c) { return mayusEn(c(m[1])) + ' is too long: use fewer accents or special symbols'; }],
    [/^(.+) contiene caracteres no permitidos$/, function (m, c) { return mayusEn(c(m[1])) + ' contains characters that are not allowed'; }],
    [/^(.+) tiene demasiados elementos$/, function (m, c) { return mayusEn(c(m[1])) + ' has too many items'; }],
    [/^No tienes asignada la función "(.+)"$/, function (m) { return 'You have not been assigned the "' + P.t(m[1]) + '" function'; }],
    [/^Esta acción solo está disponible en la fase (.+)$/, function (m) { return 'This action is only available in the ' + m[1].replace(/"([^"]+)"/g, function (x, f) { return '"' + P.t(f) + '"'; }).replace(/ o /g, ' or ') + ' phase'; }],
    [/^Se agregó «(.+)»\. Ya aparece en los formularios, los mapas y la simbología\.$/, function (m) { return '“' + m[1] + '” was added. It now appears in forms, maps and the legend.'; }],
    [/^Hay (\d+) proyecto\(s\) con este tipo\. Desactívalo en lugar de borrarlo: los proyectos conservan su color\.$/, function (m) { return 'There are ' + m[1] + ' project(s) with this type. Deactivate it instead of deleting it: projects keep their color.'; }],
    [/^No se pudo enviar el correo de prueba: (.+)$/, function (m) { return 'The test email could not be sent: ' + m[1]; }],
    [/^Se envió un correo de prueba a (.+)\. Revisa la bandeja de entrada \(y la de spam\)\.$/, function (m) { return 'A test email was sent to ' + m[1] + '. Check the inbox (and spam).'; }],
    [/^Se asignó un tipo a (\d+) de (\d+) proyecto\(s\) que estaban como «Otro»\.$/, function (m) { return 'A type was assigned to ' + m[1] + ' of ' + m[2] + ' project(s) marked as “Other”.'; }],
    [/^Te enviamos un nuevo enlace a (.+)\. Revisa también la carpeta de spam\.$/, function (m) { return 'We sent a new link to ' + m[1] + '. Check your spam folder too.'; }],
    [/^Te enviamos un enlace a (.+) para confirmar tu correo\. Ábrelo para poder participar\.$/, function (m) { return 'We sent a link to ' + m[1] + ' to confirm your email. Open it to take part.'; }],
    [/^El ciclo se activó; «(.+)» quedó pausado$/, function (m) { return 'The cycle was activated; “' + m[1] + '” was paused'; }],
    [/^Modo (oficial|práctica): «(.+?)» está activo y «(.+)» quedó pausado$/, function (m) { return (m[1] === 'oficial' ? 'Official' : 'Practice') + ' mode: “' + m[2] + '” is active and “' + m[3] + '” was paused'; }],
    [/^Modo (oficial|práctica): «(.+)» está activo$/, function (m) { return (m[1] === 'oficial' ? 'Official' : 'Practice') + ' mode: “' + m[2] + '” is active'; }],
    [/^Cierra la votación de «(.+)» antes de cambiar de ciclo$/, function (m) { return 'Close voting in “' + m[1] + '” before switching cycles'; }],
  ];
  P.tMensaje = function (msg) {
    var t = P.t(msg);
    if (idioma !== 'en' || t !== msg || !msg) return t;
    var s = String(msg);
    for (var i = 0; i < PATRONES_EN.length; i += 1) {
      var m = PATRONES_EN[i][0].exec(s);
      if (!m) continue;
      var todos = true;
      var c = function (x) { var v = campoEn(x); if (v === null) { todos = false; return x; } return v; };
      var r = PATRONES_EN[i][1](m, c);
      if (todos) return r;
    }
    return t;
  };
  P.cambiarIdioma = function () {
    var nuevo = idioma === 'es' ? 'en' : 'es';
    try { localStorage.setItem('prepar_idioma', nuevo); } catch (e) { }
    var fin = function () { location.reload(); };
    if (P.usuario) P.put('/api/perfil/idioma', { idioma: nuevo }, { silencioso: true }).then(fin, fin);
    else fin();
  };
  P.nombre = function (o, campo) {
    if (!o) return '';
    var c = campo || 'nombre';
    return (idioma === 'en' && o[c + '_en']) ? o[c + '_en'] : (o[c + '_es'] || o[c] || '');
  };

  P.cambiarTema = function () {
    var actual = doc.documentElement.getAttribute('data-tema') === 'claro' ? 'claro' : 'oscuro';
    var nuevo = actual === 'claro' ? 'oscuro' : 'claro';
    doc.documentElement.setAttribute('data-tema', nuevo);
    try { localStorage.setItem('prepar_tema', nuevo); } catch (e) { }
    P.$$('[data-accion="tema"]').forEach(pintarBotonTema);
    doc.dispatchEvent(new CustomEvent('prepar:tema', { detail: nuevo }));
  };
  P.temaActual = function () { return doc.documentElement.getAttribute('data-tema') === 'claro' ? 'claro' : 'oscuro'; };
  function pintarBotonTema(b) {
    var claro = P.temaActual() === 'claro';
    P.poner(b, P.html`${P.seguro(ICONOS[claro ? 'luna' : 'sol'])}<span>${claro ? 'Modo oscuro' : 'Modo claro'}</span>`);
    b.setAttribute('aria-label', P.t(claro ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'));
  }

  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MESES_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function partesFecha(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(String(s || ''));
    return m ? { a: m[1], m: Number(m[2]) - 1, d: Number(m[3]), h: m[4], mi: m[5] } : null;
  }
  P.fecha = function (s) {
    var f = partesFecha(s);
    if (!f) return '—';
    return idioma === 'en' ? MESES_EN[f.m] + ' ' + f.d + ', ' + f.a : f.d + ' ' + MESES[f.m] + ' ' + f.a;
  };
  P.fechaHora = function (s) {
    var f = partesFecha(s);
    if (!f) return '—';
    return P.fecha(s) + (f.h ? ' · ' + f.h + ':' + f.mi : '');
  };
  P.dinero = function (n) {
    var x = Number(n);
    if (!isFinite(x)) return '—';
    return '$' + x.toLocaleString(idioma === 'en' ? 'en-US' : 'es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  P.numero = function (n, dec) {
    var x = Number(n);
    if (!isFinite(x)) return '—';
    return x.toLocaleString(idioma === 'en' ? 'en-US' : 'es-MX', { maximumFractionDigits: dec === undefined ? 2 : dec });
  };
  P.hoy = function () {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  var ESTATUS = {
    registrado: ['Registrado', 'alerta'], en_dictaminacion: ['En dictaminación', 'info'], viable: ['Viable', 'ok'], no_viable: ['No viable', 'error'],
    en_consulta: ['En consulta', 'acento'], ganador: ['Ganador', 'ok'], en_ejecucion: ['En ejecución', 'alerta'], concluido: ['Concluido', 'ok'],
    inejecutable: ['Inejecutable', 'error'], retirado: ['Retirado', ''], pendiente: ['Pendiente', 'alerta'], atendido: ['Atendido', 'ok'],
    eliminado: ['Eliminado', 'error'], visible: ['Visible', 'ok'], oculto: ['Oculto', 'alerta'], ubicado: ['Ubicado', 'ok'],
    no_ubicado: ['Sin ubicar', 'error'], corregido: ['Corregido', 'info'], activa: ['Activa', 'ok'], suspendida: ['Suspendida', 'error'],
    desactivada: ['Desactivada', ''], borrador: ['Borrador', ''], activo: ['Activo', 'ok'], cerrado: ['Cerrado', ''],
    avance: ['Avance', 'info'], irregularidad: ['Irregularidad', 'error'],
  };
  P.estatus = function (clave) {
    var e = ESTATUS[clave] || [String(clave || '').replace(/_/g, ' '), ''];
    return P.html`<span class="etq ${e[1]}">${P.t(e[0])}</span>`;
  };
  P.estatusProyecto = function (p) {
    if (p && p.estatus === 'en_consulta' && p.total_votos !== null && p.total_votos !== undefined) return P.html`<span class="etq">${P.t('No ganó')}</span>`;
    return P.estatus(p && p.estatus);
  };
  P.textoEstatus = function (clave) { return P.t((ESTATUS[clave] || [String(clave || '').replace(/_/g, ' ')])[0]); };
  P.COLOR_ESTATUS = {
    registrado: '#94A3B8', en_dictaminacion: '#A78BFA', viable: '#5FD3C4', no_viable: '#E55E54', en_consulta: '#E08E6D',
    ganador: '#F4C861', en_ejecucion: '#76BDD7', concluido: '#2A9D8F', inejecutable: '#E55E54',
  };
  P.GENEROS = { mujer: 'Mujer', hombre: 'Hombre', no_binario: 'No binario', prefiero_no_decir: 'Prefiero no decir' };
  P.FUNCIONES = {
    directorio: 'Directorio', moderacion: 'Moderación', revision_registros: 'Revisión de registros',
    dictaminacion: 'Dictaminación', consulta: 'Consulta', seguimiento: 'Seguimiento',
  };

  P.aviso = function (mensaje, tipo) {
    var cont = P.$('.avisos-flotantes');
    if (!cont) {
      cont = doc.createElement('div');
      cont.className = 'avisos-flotantes';
      cont.setAttribute('aria-live', 'polite');
      doc.body.appendChild(cont);
    }
    var t = doc.createElement('div');
    t.className = 'toast ' + (tipo || 'ok');
    t.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
    t.textContent = P.tMensaje(mensaje);
    cont.appendChild(t);
    if (P.mascota) { try { P.mascota.aviso(mensaje, tipo || 'ok'); } catch (e) { } }
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, tipo === 'error' ? 7000 : 4500);
  };

  function ErrorApi(estado, mensaje) { this.estado = estado; this.message = mensaje; }
  ErrorApi.prototype = Object.create(Error.prototype);
  P.ErrorApi = ErrorApi;

  P.api = function (metodo, url, cuerpo, opciones) {
    opciones = opciones || {};
    var headers = { 'X-Prepar': '1', Accept: 'application/json' };
    var body;
    if (typeof Blob !== 'undefined' && cuerpo instanceof Blob) {
      body = cuerpo;
      headers['Content-Type'] = opciones.tipo || cuerpo.type || 'application/octet-stream';
    } else if (cuerpo !== undefined) {
      body = JSON.stringify(cuerpo);
      headers['Content-Type'] = 'application/json';
    }
    if (opciones.nombreArchivo) headers['X-Nombre-Archivo'] = encodeURIComponent(String(opciones.nombreArchivo).slice(0, 150));
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var limite = setTimeout(function () { if (ctrl) ctrl.abort(); }, opciones.tiempo || 30000);
    var lento = false;
    var relojLento = opciones.sinRedirigir ? null : setTimeout(function () { lento = true; if (P.mascota) P.mascota.ocupado(1); }, 700);
    var listo = function () { clearTimeout(relojLento); if (lento && P.mascota) P.mascota.ocupado(-1); lento = false; };
    return fetch(url, { method: metodo, headers: headers, body: body, credentials: 'same-origin', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        clearTimeout(limite);
        listo();
        var tipo = r.headers.get('content-type') || '';
        var lectura = tipo.indexOf('application/json') >= 0 ? r.json().catch(function () { return null; }) : Promise.resolve(null);
        return lectura.then(function (datos) {
          if (r.ok) {
            if (metodo !== 'GET') ultimoPing = Date.now();
            return datos;
          }
          var msg = (datos && datos.error) || 'Ocurrió un error inesperado. Intenta de nuevo';
          if (r.status === 401 && !opciones.sinRedirigir) irALogin(true);
          if (r.status === 403 && datos && datos.codigo === 'aceptar_terminos' && location.pathname.indexOf('/terminos') !== 0) {
            location.href = '/terminos.html?aceptar=1&volver=' + encodeURIComponent(location.pathname + location.search);
          }
          if (r.status === 403 && datos && datos.codigo === 'cambiar_password' && location.pathname.indexOf('/funcionario/perfil') !== 0) {
            location.href = '/funcionario/perfil.html?temporal=1';
          }
          var err = new ErrorApi(r.status, P.tMensaje(msg));
          err.codigo = datos && datos.codigo ? datos.codigo : null;
          throw err;
        });
      }, function (e) {
        clearTimeout(limite);
        listo();
        throw new ErrorApi(0, P.t(e && e.name === 'AbortError'
          ? 'El servidor tardó demasiado en responder. Intenta de nuevo'
          : 'No hay conexión con el servidor. Revisa tu internet e intenta de nuevo'));
      });
  };
  P.get = function (u, o) { return P.api('GET', u, undefined, o); };
  P.post = function (u, c, o) { return P.api('POST', u, c === undefined ? {} : c, o); };
  P.put = function (u, c, o) { return P.api('PUT', u, c === undefined ? {} : c, o); };
  P.del = function (u, o) { return P.api('DELETE', u, undefined, o); };

  function irALogin(expirada) {
    if (P.olvidarMarco) P.olvidarMarco();
    if (/\/(login|registro|recuperar|restablecer)(\.html)?$/.test(location.pathname)) return;
    var volver = encodeURIComponent(location.pathname + location.search);
    location.href = '/login.html?' + (expirada ? 'expirada=1&' : '') + 'volver=' + volver;
  }

  var cacheCat = null;
  P.catalogos = function () {
    if (!cacheCat) cacheCat = P.get('/api/catalogos').catch(function (e) { cacheCat = null; throw e; });
    return cacheCat;
  };

  P.accion = function (boton, fn, opciones) {
    opciones = opciones || {};
    if (boton) {
      if (boton.classList.contains('cargando')) return Promise.resolve();
      boton.classList.add('cargando');
      boton.setAttribute('aria-busy', 'true');
    }
    return Promise.resolve().then(fn).then(function (r) {
      if (r && r.mensaje && !opciones.sinAviso) P.aviso(r.mensaje, 'ok');
      return r;
    }, function (e) {
      var msg = (e && e.message) || P.t('Ocurrió un error inesperado. Intenta de nuevo');
      if (opciones.destino) P.poner(opciones.destino, P.html`<div class="mensaje error" role="alert">${msg}</div>`);
      else P.aviso(msg, 'error');
      return undefined;
    }).then(function (r) {
      if (boton) {
        boton.classList.remove('cargando');
        boton.removeAttribute('aria-busy');
      }
      return r;
    });
  };

  P.correoValido = function (c) {
    return /^(?!\.)(?!.*\.\.)[A-Za-z0-9._%+-]{1,64}(?<!\.)@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$/.test(String(c || '').trim());
  };
  P.errorNombre = function (valor) {
    var s = String(valor || '').trim().replace(/\s+/g, ' ');
    if (Array.from(s).length < 3) return P.t('Escribe tu nombre completo');
    if (!/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñÀ-ÿ][A-Za-zÁÉÍÓÚÜÑáéíóúüñÀ-ÿ .'’-]*$/.test(s)) return P.t('El nombre solo puede tener letras y espacios');
    var palabras = s.split(' ');
    if (palabras.length < 2) return P.t('Escribe tu nombre y al menos un apellido');
    if (palabras.some(function (p) { return !/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñÀ-ÿ]+(?:['’-][A-Za-zÁÉÍÓÚÜÑáéíóúüñÀ-ÿ]+)*\.?$/.test(p); })) return P.t('El nombre tiene signos fuera de lugar');
    if (palabras.filter(function (p) { return (p.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñÀ-ÿ]/g) || []).length >= 2; }).length < 2) return P.t('Escribe tu nombre y al menos un apellido completos');
    if (/([A-Za-zÁÉÍÓÚÜÑáéíóúüñÀ-ÿ])\1{2,}/i.test(s)) return P.t('El nombre no parece válido: tiene letras repetidas');
    return null;
  };
  var SIMBOLOS_PASS = '@ # $ % &';
  var RE_PASS_SIMBOLOS = /^[A-Za-z0-9ÑñÁÉÍÓÚÜáéíóúü@#$%&]*$/;
  P.reglasPassword = function (valor) {
    var v = String(valor || '');
    var n = Array.from(v).length;
    return [
      { ok: n >= 8 && n <= 64, texto: 'De 8 a 64 caracteres' },
      { ok: /[A-ZÁÉÍÓÚÜÑ]/.test(v), texto: 'Una letra mayúscula' },
      { ok: /[0-9]/.test(v), texto: 'Un número' },
      { ok: !!v && !/\s/.test(v), texto: 'Sin espacios' },
      { ok: !!v && RE_PASS_SIMBOLOS.test(v.replace(/\s/g, '')), texto: 'Solo los símbolos @ # $ % &' },
    ];
  };
  P.errorPassword = function (valor, campo) {
    var v = String(valor || '');
    var n = Array.from(v).length;
    var c = campo || 'La contraseña';
    if (n < 8 || n > 64) return P.t('{c} debe tener de 8 a 64 caracteres', { c: P.t(c) });
    if (/\s/.test(v)) return P.t('{c} no puede tener espacios', { c: P.t(c) });
    if (!RE_PASS_SIMBOLOS.test(v)) return P.t('{c} solo puede tener letras, números y estos símbolos: {s}', { c: P.t(c), s: SIMBOLOS_PASS });
    if (!/[A-ZÁÉÍÓÚÜÑ]/.test(v)) return P.t('{c} debe tener al menos una letra mayúscula', { c: P.t(c) });
    if (!/[0-9]/.test(v)) return P.t('{c} debe tener al menos un número', { c: P.t(c) });
    return null;
  };
  P.pintarReglasPassword = function (cont, valor) {
    if (!cont) return;
    if (!valor) { P.poner(cont, P.html`<span class="tenue">${P.t('Con al menos una mayúscula y un número, sin espacios. Símbolos permitidos: {s}', { s: SIMBOLOS_PASS })}</span>`); return; }
    P.poner(cont, P.html`<span class="reglas-pass">${P.reglasPassword(valor).map(function (r) {
      return P.html`<span class="${r.ok ? 'ok-texto' : 'error-texto'}">${r.ok ? '✓' : '✗'} ${P.t(r.texto)}</span>`;
    })}</span>`);
  };

  P.datosForm = function (form) {
    var o = {};
    P.$$('input, select, textarea', form).forEach(function (el) {
      if (!el.name || el.disabled) return;
      if (el.type === 'checkbox') {
        if (el.dataset.lista !== undefined) {
          o[el.name] = o[el.name] || [];
          if (el.checked) o[el.name].push(el.value);
        } else o[el.name] = el.checked;
      } else if (el.type === 'radio') {
        if (el.checked) o[el.name] = el.value;
      } else if (el.type !== 'file') {
        o[el.name] = el.type === 'password' ? el.value : el.value.trim();
      }
    });
    return o;
  };

  P.contadores = function (raiz) {
    P.$$('input[maxlength][data-contador], textarea[maxlength]', raiz || doc).forEach(function (campo) {
      if (campo.dataset.conContador) return;
      campo.dataset.conContador = '1';
      var max = Number(campo.getAttribute('maxlength'));
      var c = doc.createElement('span');
      c.className = 'contador';
      c.setAttribute('aria-live', 'polite');
      var pintar = function () {
        var n = Array.from(campo.value).length;
        c.textContent = n + ' / ' + max;
        c.classList.toggle('lleno', n >= max);
      };
      campo.addEventListener('input', pintar);
      campo.insertAdjacentElement('afterend', c);
      pintar();
    });
  };

  P.ojitos = function (raiz) {
    P.$$('.campo-pass', raiz || doc).forEach(function (c) {
      var b = c.querySelector('button');
      var i = c.querySelector('input');
      if (!b || !i || b.dataset.listo) return;
      b.dataset.listo = '1';
      b.addEventListener('click', function () {
        var ver = i.type === 'password';
        i.type = ver ? 'text' : 'password';
        b.textContent = P.t(ver ? 'Ocultar' : 'Ver');
        b.setAttribute('aria-pressed', ver ? 'true' : 'false');
      });
    });
  };

  P.textoLegal = function (texto) {
    var partes = String(texto || '').split(/\n\s*\n/).map(function (x) { return x.trim(); }).filter(Boolean);
    return P.html`<div class="aviso-legal">${partes.map(function (x, i) {
      if (i === 0 && partes.length > 1 && x.length < 90 && !/\.$/.test(x)) return P.html`<h2 class="h" style="font-size:18px;margin:0 0 10px">${x}</h2>`;
      var m = /^(\d+\.\s[^.]+\.)\s*([\s\S]*)$/.exec(x);
      return m ? P.html`<p><strong>${m[1]}</strong> ${m[2]}</p>` : P.html`<p>${x}</p>`;
    })}</div>`;
  };

  P.modal = function (op) {
    var previo = doc.activeElement;
    var fondo = doc.createElement('div');
    fondo.className = 'modal-fondo';
    var id = 'm' + Math.random().toString(36).slice(2);
    P.poner(fondo, P.html`<div class="modal ${op.ancho ? 'ancho' : ''}" role="dialog" aria-modal="true" aria-labelledby="${id}">
      <div class="fila entre"><h2 id="${id}" style="margin:0">${op.titulo || ''}</h2>
        <button type="button" class="herr cerrar" data-cerrar aria-label="Cerrar">✕</button></div>
      <div class="cuerpo-modal">${op.contenido || ''}</div>
      <div class="botones"></div></div>`);
    var cajaBotones = fondo.querySelector('.botones');
    var cerrado = false;
    var cerrar = function () {
      if (cerrado) return;
      cerrado = true;
      doc.removeEventListener('keydown', teclas);
      if (fondo.parentNode) fondo.parentNode.removeChild(fondo);
      if (previo && previo.focus) previo.focus();
      if (op.alCerrar) op.alCerrar();
    };
    (op.botones || []).forEach(function (b) {
      var btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = b.clase || 'btn2';
      btn.textContent = P.t(b.texto);
      btn.addEventListener('click', function () {
        if (b.accion) b.accion(cerrar, fondo, btn);
        else cerrar();
      });
      cajaBotones.appendChild(btn);
    });
    if (!(op.botones || []).length) cajaBotones.hidden = true;
    var teclas = function (e) {
      if (e.key === 'Escape') cerrar();
      if (e.key === 'Tab') {
        var f = P.$$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', fondo).filter(function (x) { return !x.disabled && x.offsetParent !== null; });
        if (!f.length) return;
        if (e.shiftKey && doc.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && doc.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    doc.addEventListener('keydown', teclas);
    fondo.addEventListener('mousedown', function (e) { if (e.target === fondo) cerrar(); });
    fondo.querySelector('[data-cerrar]').addEventListener('click', cerrar);
    doc.body.appendChild(fondo);
    P.ojitos(fondo);
    var primero = fondo.querySelector('input:not([type=hidden]), select, textarea') || fondo.querySelector('.botones button') || fondo.querySelector('[data-cerrar]');
    if (primero) setTimeout(function () { primero.focus(); }, 30);
    return { el: fondo, cerrar: cerrar };
  };

  P.confirmar = function (titulo, mensaje, op) {
    op = op || {};
    return new Promise(function (resolver) {
      var respondido = false;
      P.modal({
        titulo: titulo,
        contenido: P.html`<p class="texto-2">${mensaje}</p>`,
        alCerrar: function () { if (!respondido) resolver(false); },
        botones: [
          { texto: op.no || 'Cancelar', clase: 'btn2' },
          { texto: op.si || 'Confirmar', clase: op.peligro ? 'btn-peligro' : 'btn', accion: function (cerrar) { respondido = true; resolver(true); cerrar(); } },
        ],
      });
    });
  };

  P.pedirTexto = function (titulo, etiqueta, op) {
    op = op || {};
    return new Promise(function (resolver) {
      var listo = false;
      var m = P.modal({
        titulo: titulo,
        contenido: P.html`<label>${etiqueta}<textarea name="texto" maxlength="${op.max || 250}" rows="4" ${op.requerido === false ? '' : 'required'}
          placeholder="${op.placeholder || ''}"></textarea></label><div class="destino"></div>`,
        alCerrar: function () { if (!listo) resolver(null); },
        botones: [
          { texto: 'Cancelar', clase: 'btn2' },
          {
            texto: op.si || 'Guardar', clase: op.peligro ? 'btn-peligro' : 'btn',
            accion: function (cerrar, el) {
              var v = el.querySelector('textarea').value.trim();
              if (op.requerido !== false && v.length < (op.min || 1)) {
                P.poner(el.querySelector('.destino'), P.html`<div class="mensaje error">${P.t('Escribe al menos {n} caracteres', { n: op.min || 1 })}</div>`);
                return;
              }
              listo = true;
              resolver(v);
              cerrar();
            },
          },
        ],
      });
      return m;
    });
  };

  var svg = function (d) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"></path></svg>';
  };
  var ICONOS = P.ICONOS = {
    ayuda: svg('M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01'),
    inicio: svg('M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z'),
    registros: svg('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6'),
    dictamen: svg('M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11'),
    sorteo: svg('M3 3h18v18H3zM8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01'),
    mapa: svg('M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4zM8 2v16M16 6v16'),
    camara: svg('M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'),
    libro: svg('M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM20 17v4H6.5A2.5 2.5 0 0 1 4 19.5'),
    perfil: svg('M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'),
    ciclo: svg('M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5'),
    grafica: svg('M3 3v18h18M7 15l4-4 3 3 6-6'),
    usuarios: svg('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'),
    nube: svg('M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z'),
    campana: svg('M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0'),
    sol: svg('M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4'),
    luna: svg('M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'),
    globo: svg('M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'),
    salir: svg('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9'),
    menu: svg('M3 12h18M3 6h18M3 18h18'),
    foro: svg('M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'),
    voto: svg('M9 12l2 2 4-4M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z'),
    proyecto: svg('M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5'),
  };

  var NAV_CIUDADANO = [
    ['inicio', '/ciudadano/inicio.html', 'Inicio', 'inicio'],
    ['foro', '/ciudadano/foro.html', 'Foro vecinal', 'foro'],
    ['votacion', '/ciudadano/votacion.html', 'Votación', 'voto'],
    ['mapa', '/ciudadano/mapa.html', 'Mapa de proyectos', 'mapa'],
    ['seguimiento', '/ciudadano/seguimiento.html', 'Foto denuncia', 'camara'],
    ['directorio', '/ciudadano/directorio.html', 'Directorio', 'libro'],
  ];
  var MENU_FUNCIONARIO = [
    { id: 'inicio', url: '/funcionario/inicio.html', icono: 'inicio', texto: 'Inicio', sub: 'Tus pendientes del día' },
    { id: 'registros', url: '/funcionario/registros.html', icono: 'registros', texto: 'Registros y foro', sub: 'Revisar, moderar y ubicar', funciones: ['revision_registros', 'moderacion'], cuenta: 'registros' },
    { id: 'dictaminacion', url: '/funcionario/dictaminacion.html', icono: 'dictamen', texto: 'Dictaminación', sub: 'Decidir si un proyecto es viable', funciones: ['dictaminacion'], cuenta: 'dictaminar' },
    { id: 'sorteo', url: '/funcionario/sorteo.html', icono: 'sorteo', texto: 'Sorteo y casos especiales', sub: 'Boletas, empates y desempates', funciones: ['dictaminacion', 'consulta'], cuenta: 'casos' },
    { id: 'mapa', url: '/funcionario/mapa.html', icono: 'mapa', texto: 'Mapa y ubicaciones', sub: 'Mover y ajustar proyectos en el mapa', cuenta: 'sin_ubicar' },
    { id: 'seguimiento', url: '/funcionario/seguimiento.html', icono: 'camara', texto: 'Seguimiento de obras', sub: 'Avances y reportes de vecinos', funciones: ['seguimiento'], cuenta: 'reportes' },
    { id: 'directorio', url: '/funcionario/directorio.html', icono: 'libro', texto: 'Directorio', sub: 'Datos de contacto de tu alcaldía' },
    { id: 'perfil', url: '/funcionario/perfil.html', icono: 'perfil', texto: 'Mi perfil', sub: 'Foto, datos y contraseña' },
  ];
  var MENU_ADMIN = [
    { id: 'inicio', url: '/admin/inicio.html', icono: 'ciclo', texto: 'Inicio y ciclo', sub: 'Fases y acciones del ciclo' },
    { id: 'estadisticas', url: '/admin/estadisticas.html', icono: 'grafica', texto: 'Estadísticas', sub: 'Gráficas y reportes' },
    { id: 'usuarios', url: '/admin/usuarios.html', icono: 'usuarios', texto: 'Funcionarios y ciudadanos', sub: 'Altas y cuentas' },
    { id: 'mapa', url: '/admin/mapa.html', icono: 'mapa', texto: 'Mapa y tipos de proyecto', sub: 'Colores y simbología' },
    { id: 'integraciones', url: '/admin/integraciones.html', icono: 'nube', texto: 'Datos abiertos', sub: 'APIs y sincronización' },
    { id: 'perfil', url: '/admin/perfil.html', icono: 'perfil', texto: 'Mi perfil', sub: 'Foto, datos y contraseña' },
  ];
  var CONSEJOS = {
    'funcionario/inicio': 'Empieza por la tarjeta marcada como prioridad. Cada tarjeta te lleva directo a la tarea.',
    'funcionario/registros': 'Si al proyecto le falta algo, pide corrección (solo una vez). Si no se encontró su dirección, corrígela en la tercera pestaña.',
    'funcionario/dictaminacion': 'Si un solo criterio no se cumple, el proyecto queda como no viable. Explica siempre el motivo.',
    'funcionario/sorteo': 'El sorteo es al azar: nadie elige el número. En un caso especial siempre explica por qué elegiste ese proyecto.',
    'funcionario/mapa': 'Elige un proyecto, presiona «Cambiar ubicación» y toca el mapa. Los vecinos verán el punto nuevo al guardar.',
    'funcionario/seguimiento': 'Mueve la barra para indicar el avance. Los vecinos lo ven al instante en el mapa.',
    'funcionario/directorio': 'Captura los datos solo de fuentes públicas oficiales y revisa que el teléfono tenga 10 dígitos.',
    'funcionario/perfil': 'Si el administrador te dio una contraseña temporal, cámbiala aquí la primera vez que entres.',
    'administrador/inicio': 'Haz las acciones de la lista antes de avanzar de fase. Los funcionarios se encargan de lo demás.',
    'administrador/estadisticas': 'Elige un tipo de estadística arriba y usa los filtros para comparar grupos.',
    'administrador/usuarios': 'Al registrar un funcionario, elige solo las funciones que necesita.',
    'administrador/mapa': 'Al agregar un tipo nuevo, escribe palabras clave: el sistema lo sugiere solo cuando un vecino las use en su título.',
    'administrador/integraciones': 'Las fuentes se actualizan solas. Usa «Sincronizar ahora» solo si necesitas los datos de inmediato.',
    'administrador/perfil': 'Si el administrador te dio una contraseña temporal, cámbiala aquí la primera vez que entres.',
  };
  var PANEL = { ciudadano: '/ciudadano/inicio.html', funcionario: '/funcionario/inicio.html', administrador: '/admin/inicio.html' };
  P.panelDe = function (rol) { return PANEL[rol] || '/'; };

  P.textoFase = function (ciclo) {
    if (!ciclo) return P.t('Sin ciclo activo');
    return P.t('Fase {n} · {nombre}', { n: ciclo.fase_orden, nombre: P.nombre(ciclo, 'fase') });
  };

  P.faseActiva = function (estado) {
    var c = estado && estado.ciclo;
    if (!c) return null;
    var f = (estado.fases || []).find(function (x) { return x.orden === c.fase_orden; }) || null;
    return { orden: c.fase_orden, nombre: P.nombre(c, 'fase'), fin: f && f.fecha_fin, inicio: f && f.fecha_inicio };
  };
  P.chipFase = function (estado, texto) {
    var f = P.faseActiva(estado);
    return P.html`<span class="chip-sup">${texto || (f ? P.t('Fase activa: {n} · {nombre}', { n: f.orden, nombre: f.nombre }) : P.t('Sin ciclo activo'))}</span>`;
  };
  P.fechaLarga = function (s) {
    var f = partesFecha(s);
    if (!f) return '';
    var LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    var LARGOS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return idioma === 'en' ? LARGOS_EN[f.m] + ' ' + f.d : f.d + ' de ' + LARGOS[f.m];
  };

  function botonesHerramientas() {
    return P.html`<button type="button" class="herr" data-accion="tema"></button>
      <button type="button" class="herr" data-accion="idioma" aria-label="${idioma === 'es' ? 'Switch to English' : 'Cambiar a español'}">${P.seguro(ICONOS.globo)}<span>${idioma === 'es' ? 'EN' : 'ES'}</span></button>`;
  }

  function encabezadoPublico(estado, usuario) {
    var acceso = usuario
      ? P.html`<a class="btn chico" href="${P.panelDe(usuario.rol)}">Ir a mi panel</a>`
      : P.html`<a class="btn2 chico" href="/login.html">Iniciar sesión</a><a class="btn chico" href="/registro.html">Crear cuenta</a>`;
    return P.html`<header class="encabezado"><div class="fila">
      <a class="marca" href="/"><img src="/img/logo.png" alt="Logo de Prepar"><span>Prepar</span></a>
      <div class="acciones">${botonesHerramientas()}${acceso}</div>
    </div></header>`;
  }

  function encabezadoCiudadano(estado, u, pagina) {
    var c = estado && estado.ciclo;
    var f = P.faseActiva(estado);
    var activa = pagina === 'proyectos' ? 'foro' : pagina;
    return P.html`<header class="encabezado"><div class="fila">
      <a class="marca" href="/ciudadano/inicio.html"><img src="/img/logo.png" alt="Logo de Prepar"><span>Prepar</span></a>
      <div class="acciones">
        <div class="campana-c" style="position:relative"><button type="button" class="herr" data-accion="notificaciones" aria-label="Notificaciones" aria-expanded="false">${P.seguro(ICONOS.campana)}<span class="globo" hidden></span></button></div>
        <button type="button" class="herr boton-menu-c" data-accion="menu-c" aria-label="Abrir menú" aria-expanded="false" aria-controls="menu-c">${P.seguro(ICONOS.menu)}</button>
        <div class="acciones-menu" id="menu-c">
          <a class="usuario-mini" href="/ciudadano/perfil.html" title="Editar mi perfil">${P.avatar(u.nombre, u.fotoUuid)}<span class="datos"><strong>${u.nombre}</strong><br><span>${u.unidad || ''}${u.alcaldia ? ', ' + u.alcaldia : ''}</span></span></a>
          <button type="button" class="herr" data-accion="ayuda" title="Ver otra vez la bienvenida">${P.seguro(ICONOS.ayuda)}<span>Ayuda</span></button>
          ${botonesHerramientas()}
          <button type="button" class="herr salir" data-accion="salir">Cerrar sesión</button>
        </div>
      </div></div></header>
      <nav class="navegacion" aria-label="Módulos"><div class="fila">
        ${NAV_CIUDADANO.map(function (n) { return P.html`<a href="${n[1]}" class="${n[0] === activa ? 'activo' : ''}" ${n[0] === activa ? P.seguro('aria-current="page"') : ''}>${P.seguro(ICONOS[n[3]] || '')}<span>${n[2]}</span></a>`; })}
      </div></nav>
      <div class="barra-ciclo"><div class="fila">${c ? P.html`<strong>${c.nombre}</strong><span aria-hidden="true">·</span>
        <span>${P.t('Fase activa:')} <strong>${f.orden} · ${f.nombre}</strong></span>
        ${f.fin ? P.html`<span aria-hidden="true">·</span><span>${P.t('Cierra el {fecha}', { fecha: P.fechaLarga(f.fin) })}</span>` : ''}`
        : P.html`<span>${P.t('Sin ciclo activo')}</span>`}</div></div>`;
  }

  function lateral(estado, u, pagina, menu, rolTexto) {
    var consejo = CONSEJOS[u.rol + '/' + pagina] ? P.t(CONSEJOS[u.rol + '/' + pagina]) : '';
    var perfil = u.rol === 'administrador' ? '/admin/perfil.html' : '/funcionario/perfil.html';
    var items = menu.map(function (m) {
      var permitido = !m.funciones || u.rol === 'administrador' || m.funciones.some(function (f) { return u.funciones.indexOf(f) >= 0; });
      var activo = m.id === pagina;
      return P.html`<a href="${m.url}" class="${activo ? 'activo' : ''} ${permitido ? '' : 'bloqueado'}" ${activo ? P.seguro('aria-current="page"') : ''}
        ${permitido ? '' : P.seguro('title="No tienes asignada esta función"')}>${P.seguro(ICONOS[m.icono])}
        <span><span>${m.texto}</span><span class="sub">${m.sub}</span></span>${m.cuenta ? P.html`<span class="cuenta" data-cuenta="${m.cuenta}" hidden></span>` : ''}</a>`;
    });
    return P.html`<aside class="lateral" aria-label="Menú">
      <div class="fila entre">
        <a class="marca" href="${P.panelDe(u.rol)}"><img src="/img/logo.png" alt="Logo de Prepar"><span style="display:flex;flex-direction:column;line-height:1">
          <span>Prepar</span><span class="rol">${rolTexto}</span></span></a>
        <button type="button" class="herr boton-menu" data-accion="menu" aria-label="Abrir menú" aria-expanded="false">${P.seguro(ICONOS.menu)}</button>
      </div>
      <a class="tarjeta-usuario" href="${perfil}" title="Editar mi perfil">${P.avatar(u.nombre, u.fotoUuid)}
        <span style="line-height:1.3;min-width:0"><strong>${u.nombre}</strong><br><span>${u.rol === 'administrador' ? P.t('Administración del simulador') : P.t('Alcaldía {a}', { a: u.alcaldia || '' })}</span></span></a>
      <nav class="menu">${items}</nav>
      ${consejo && !GUIAS[u.rol + '/' + pagina] ? P.html`<div class="consejo"><strong>Consejo</strong>${consejo}</div>` : ''}
      <div class="pie-lateral"><button type="button" class="btn2 ancho" data-accion="ayuda">${P.seguro(ICONOS.ayuda)} Ayuda: ¿cómo funciona?</button>
        <div class="fila-herr">${botonesHerramientas()}</div>
        <button type="button" class="btn2 ancho" data-accion="salir">Cerrar sesión</button></div>
    </aside>`;
  }

  function pie() {
    return P.html`<footer class="pie"><div class="fila">
      <span>© 2026 Prepar · Simulador del Presupuesto Participativo</span>
      <span><a href="mailto:equipoprepar@gmail.com">equipoprepar@gmail.com</a> · <a href="/privacidad.html">Aviso de privacidad</a></span>
    </div></footer>`;
  }

  function avisoSimulador(estado) {
    var a = estado && estado.aviso;
    var texto = a ? (idioma === 'en' ? a.en : a.es) : 'Simulador educativo sin validez oficial. No tiene relación con el IECM ni con las alcaldías.';
    return P.html`<div class="aviso-sim" role="note">${texto}</div>`;
  }

  P.refrescarHerramientas = function () {
    P.$$('[data-accion="tema"]').forEach(pintarBotonTema);
    P.$$('[data-accion="idioma"]').forEach(function (b) {
      P.poner(b, P.html`${P.seguro(ICONOS.globo)}<span data-largo="${idioma === 'es' ? 'English' : 'Español'}">${idioma === 'es' ? 'EN' : 'ES'}</span>`);
      b.setAttribute('aria-label', idioma === 'es' ? 'Switch to English' : 'Cambiar a español');
    });
  };

  var BIENVENIDA = {
    ciudadano: [
      ['👋', '¡Bienvenida o bienvenido a Prepar!', 'Prepar es un simulador: aquí practicas, paso a paso, cómo se decide en qué se gasta el dinero de tu colonia. Nada de lo que hagas aquí es oficial.'],
      ['🗓️', 'Todo avanza por fases', 'La simulación tiene 8 fases, de la convocatoria a la evaluación. Arriba siempre ves la fase activa y hasta cuándo dura. En cada fase se pueden hacer cosas distintas.'],
      ['🧭', 'Lo que puedes hacer', 'Foro: propones ideas y registras tu proyecto (fase 2). Votación: eliges un proyecto (fase 5). Mapa y Foto denuncia: vigilas las obras (fase 7) y las calificas (fase 8).'],
      ['✅', 'Empieza por aquí', 'En Inicio, «Tu siguiente paso» siempre te dice qué hacer hoy. Cada página tiene un recuadro azul «¿Cómo se usa esta página?». Si te pierdes, toca «Ayuda».'],
    ],
    funcionario: [
      ['👋', 'Bienvenida o bienvenido, funcionario', 'Revisas y acompañas los proyectos de los vecinos de tu alcaldía durante la simulación.'],
      ['📋', 'Tus tareas están a la izquierda', 'Cada opción del menú es una tarea. El número junto a ella son los pendientes. Las opciones en gris son funciones que el administrador no te asignó.'],
      ['🏠', 'Inicio te dice por dónde empezar', 'En Inicio ves tarjetas con tus pendientes; empieza por la marcada como «Prioridad». Cada tarjeta te lleva directo a la tarea.'],
      ['📝', 'Todo queda registrado', 'Dictámenes, sorteos, moderación y cambios quedan en la bitácora. Cada página tiene un recuadro azul con sus pasos y el botón «Ayuda» te trae aquí de nuevo.'],
    ],
    administrador: [
      ['👋', 'Bienvenida o bienvenido, administrador', 'Tú controlas la simulación: el ciclo, las fases, las cuentas de funcionarios y las estadísticas.'],
      ['🗓️', 'Inicio y ciclo', 'Ahí ves la barra de fases, lo que falta hacer en la fase actual (abrir o cerrar la votación, publicar ganadores) y el botón para avanzar de fase.'],
      ['👥', 'Funcionarios y ciudadanos', 'Da de alta a los funcionarios con su alcaldía y lo que podrán hacer. También puedes suspender o reactivar cuentas de ciudadanos.'],
      ['📊', 'Estadísticas y datos abiertos', 'Genera gráficas y exporta la bitácora. En «Datos abiertos» revisas las fuentes que se actualizan solas y la configuración del correo.'],
    ],
  };
  var POSE_TOUR = { '👋': 'celebra', '🗓️': 'plano', '🧭': 'lupa', '✅': 'ok', '📋': 'revisa', '🏠': 'tablero', '📝': 'aviso', '👥': 'revisa', '📊': 'tablero' };
  P.bienvenida = function (forzar) {
    var u = P.usuario;
    if (!u || !BIENVENIDA[u.rol]) return;
    var clave = 'prepar_bienvenida_' + u.id;
    if (!forzar) {
      var vista = false;
      try { vista = localStorage.getItem(clave) === 'vista' || localStorage.getItem('prepar_bienvenida_todas') === 'vista'; } catch (e) { vista = true; }
      if (vista) return;
    }
    var pasos = BIENVENIDA[u.rol];
    var i = 0;
    var m = P.modal({ titulo: P.t('Recorrido rápido'), contenido: P.html`<div id="tour"></div>`, botones: [], alCerrar: function () {
      try { localStorage.setItem(clave, 'vista'); } catch (e) { }
    } });
    var caja = m.el ? m.el.querySelector('#tour') : doc.querySelector('#tour');
    function pintar() {
      var p = pasos[i];
      P.poner(caja, P.html`<div class="tour">
        <div class="tour-icono" aria-hidden="true">${POSE_TOUR[p[0]] ? P.seguro('<img src="/img/mascota/' + POSE_TOUR[p[0]] + '.webp?v=4" alt="" width="150" height="120">') : p[0]}</div>
        <h3 class="h tour-titulo">${P.t(p[1])}</h3>
        <p class="tour-texto">${P.t(p[2])}</p>
        <div class="tour-puntos" aria-label="${P.t('Paso {n} de {t}', { n: i + 1, t: pasos.length })}">${pasos.map(function (x, j) { return P.html`<span class="${j === i ? 'activo' : ''}"></span>`; })}</div>
        <div class="fila entre" style="gap:10px">
          <button type="button" class="enlace-boton" data-tour="saltar">${P.t('Saltar')}</button>
          <span class="fila" style="gap:8px">
            ${i > 0 ? P.html`<button type="button" class="btn2" data-tour="atras">${P.t('Anterior')}</button>` : ''}
            <button type="button" class="btn" data-tour="sig">${P.t(i === pasos.length - 1 ? '¡Empezar!' : 'Siguiente')}</button>
          </span>
        </div></div>`);
      setTimeout(function () { var b = caja.querySelector('[data-tour="sig"]'); if (b) b.focus(); }, 60);
    }
    caja.addEventListener('click', function (e) {
      var b = e.target.closest('[data-tour]');
      if (!b) return;
      var a = b.getAttribute('data-tour');
      if (a === 'atras') { i = Math.max(0, i - 1); pintar(); }
      else if (a === 'sig' && i < pasos.length - 1) { i += 1; pintar(); }
      else m.cerrar();
    });
    pintar();
  };

  var GUIAS = {
    'ciudadano/inicio': ['Aquí ves en qué fase va la simulación y qué te toca hacer.', [
      'Lee «Tu siguiente paso»: es lo que puedes hacer hoy. Su botón te lleva directo.',
      '«Tu recorrido» marca con ✓ lo que ya hiciste en este ciclo.',
      'Toca cualquier fase de la línea de tiempo para ver qué pasa en ella y cuándo.']],
    'ciudadano/foro': ['El foro es para platicar las necesidades de tu colonia y convertirlas en proyectos.', [
      'Escribe una necesidad, elige su rubro y presiona «Publicar».',
      'Apoya las ideas que te gusten y deja comentarios. Los apoyos no son votos.',
      'Cuando tengas una propuesta concreta, llena «Registrar proyecto» (a la derecha): costo y dirección. El sistema te da tu folio.'],
      'Ideas y proyectos solo se publican en la fase 2 · Diagnóstico y registro.'],
    'ciudadano/proyectos': ['Aquí están los proyectos que registraste.', [
      'Cada proyecto muestra su folio y su estatus (registrado, en dictaminación, viable…).',
      'Mientras siga la fase 2 puedes editarlo o retirarlo.',
      'Si un funcionario pidió una corrección, aparece en el proyecto: corrígelo y guarda.']],
    'ciudadano/votacion': ['Vota por un solo proyecto de la boleta de tu colonia.', [
      'Toca la tarjeta del proyecto que prefieras.',
      'Presiona «Continuar» y revisa tu elección.',
      'Presiona «Confirmar voto» y descarga tu comprobante.'],
      'Solo se puede votar una vez y el voto es secreto.'],
    'ciudadano/mapa': ['Ubica los proyectos y revisa cómo van.', [
      'Arriba elige qué ver: ganadores o todos, y la alcaldía.',
      'Toca un punto del mapa para ver su ficha: avance, presupuesto y fotos.',
      'Usa + y − para acercar o alejar, y las flechas para moverte.']],
    'ciudadano/seguimiento': ['Vigila las obras ganadoras y avisa si algo va mal.', [
      'En «Subir foto» elige la obra y si es un avance o una irregularidad.',
      'Agrega de 1 a 5 fotos JPG o PNG (otros archivos se rechazan) y describe lo que se ve.',
      'En la fase de Evaluación califica con estrellas el proyecto de tu colonia.']],
    'ciudadano/directorio': ['Datos de contacto de las alcaldías.', [
      'Escribe una palabra (por ejemplo «participación») o elige una alcaldía.',
      'Toca el teléfono o el correo para comunicarte.']],
    'ciudadano/perfil': ['Tus datos personales y tu contraseña.', [
      'Cambia tu foto, tu nombre o tu colonia (la colonia solo antes de la Consulta).',
      'La contraseña es opcional: llena esos campos solo si quieres cambiarla.',
      'Presiona «Guardar cambios».']],
    'funcionario/inicio': ['Tus pendientes del día en tu alcaldía.', [
      'Cada tarjeta es una tarea con su número de pendientes. Empieza por la marcada como prioridad.',
      'Publica avisos para los vecinos; puedes ponerles fecha de vigencia.',
      '«Herramientas por fase» te dice qué se usa en la fase actual.']],
    'funcionario/registros': ['Revisa proyectos, modera el foro y corrige ubicaciones.', [
      'Pestaña 1: si el proyecto está completo, «Enviar a dictaminación»; si le falta algo, «Pedir corrección» (solo una vez).',
      'Pestaña 2: oculta o elimina publicaciones que no respeten las reglas. Siempre escribe el motivo.',
      'Pestaña 3: coloca en el mapa los proyectos cuya dirección no se encontró.']],
    'funcionario/dictaminacion': ['Decide si cada proyecto es viable.', [
      'Elige un proyecto de la lista de la izquierda.',
      'Toca cada criterio para marcar si se cumple. Si uno no se cumple, el resultado es «No viable».',
      'Escribe la justificación y presiona «Emitir dictamen». Es definitivo.'],
      '«Guardar borrador» te deja terminarlo después.'],
    'funcionario/sorteo': ['Asigna los números de la boleta y resuelve los casos especiales.', [
      'Elige una colonia de la lista.',
      'Presiona «Realizar sorteo»: el sistema asigna los números al azar y publica la boleta.',
      'Después del conteo, en «Casos especiales» resuelve empates o colonias sin votos.']],
    'funcionario/mapa': ['Corrige dónde aparece cada proyecto en el mapa.', [
      'Elige un proyecto de la lista (los marcados en rojo necesitan atención).',
      'Presiona «Cambiar ubicación en el mapa» y toca el lugar correcto, o corrige la dirección.',
      'Presiona «Guardar cambios». Queda registrado en la bitácora.']],
    'funcionario/seguimiento': ['Informa el avance de las obras ganadoras.', [
      'Elige una obra y mueve la barra para marcar el porcentaje de avance.',
      'Escribe el monto ejercido, el estatus y, si quieres, una nota para los vecinos. Guarda.',
      'En «Reportes de vecinos» escribe una respuesta y márcalo como atendido.']],
    'funcionario/directorio': ['Los datos de contacto que ven los ciudadanos.', [
      'Toca «Editar» en un registro o «+ Agregar registro» para uno nuevo.',
      'Revisa que el teléfono tenga 10 dígitos.',
      'Presiona «Guardar»: se publica de inmediato en el Directorio.']],
    'funcionario/perfil': ['Tu foto, tus datos de contacto y tu contraseña.', [
      'Actualiza tu foto, tu nombre y tu teléfono de oficina.',
      'Para cambiar la contraseña escribe la actual y la nueva dos veces.',
      'Presiona «Guardar cambios».']],
    'administrador/inicio': ['Desde aquí se controla todo el ciclo.', [
      'La barra de arriba muestra en qué fase va el ciclo.',
      'Haz las acciones de «Qué hacer en esta fase» (por ejemplo abrir y cerrar la votación).',
      'Cuando termines, presiona «Avanzar a la siguiente fase». El sistema pide confirmación.'],
      'Más abajo están las fechas de cada fase, el presupuesto de las colonias y los avisos.'],
    'administrador/estadisticas': ['Gráficas de la participación y del avance.', [
      'Elige arriba qué quieres analizar.',
      'Ajusta los filtros (alcaldía, género, edad, rubro…).',
      'Presiona «Generar gráficas». En «Bitácora» puedes exportar a CSV.']],
    'administrador/usuarios': ['Cuentas de funcionarios y ciudadanos.', [
      '«+ Registrar funcionario»: nombre, correo, alcaldía y qué podrá hacer.',
      'Si el correo no llega, entrégale la contraseña temporal que aparece en pantalla.',
      'En «Ciudadanos» busca una cuenta para suspenderla (con motivo) o reactivarla.']],
    'administrador/mapa': ['Los tipos de proyecto dan el color y el dibujo de cada punto del mapa.', [
      'Para un tipo nuevo (por ejemplo «Pozos y drenaje» en azul) escribe el nombre, elige el color y el dibujo.',
      'Agrega palabras clave separadas por comas: si un vecino las usa en su título, el sistema sugiere ese tipo.',
      'Presiona «Agregar tipo». Aparece de inmediato en los formularios, los mapas y la simbología.',
      'Si un tipo ya no se usa, desactívalo: los proyectos que ya lo tienen conservan su color.'],
      'Después de agregar un tipo, «Clasificar proyectos» revisa los proyectos marcados como «Otro».'],
    'administrador/integraciones': ['El correo del sistema y las fuentes de datos abiertos.', [
      'Correo: si dice «Sin configurar», sigue los pasos de Gmail y luego envía un correo de prueba.',
      'Las fuentes de datos se actualizan solas; «Sincronizar ahora» trae los datos al momento.',
      '«Configurar» cambia la frecuencia o desactiva una fuente.']],
    'administrador/perfil': ['Tu foto, tus datos de contacto y tu contraseña.', [
      'Actualiza tu foto, tu nombre y tu teléfono.',
      'Para cambiar la contraseña escribe la actual y la nueva dos veces.',
      'Presiona «Guardar cambios».']],
  };
  function guiaDe(rol, pagina) {
    var g = GUIAS[rol + '/' + pagina];
    if (!g) return null;
    var el = doc.createElement('details');
    var titulo = P.t('¿Cómo se usa esta página?');
    P.poner(el, P.html`<summary title="${titulo}"><span class="guia-icono" aria-hidden="true">?</span><strong class="guia-titulo">${titulo}</strong><span class="tenue guia-resumen">${P.t(g[0])}</span></summary>
      <ol class="guia-pasos">${g[1].map(function (x) { return P.html`<li>${P.t(x)}</li>`; })}</ol>
      ${g[2] ? P.html`<p class="guia-nota">💡 ${P.t(g[2])}</p>` : ''}
      <button type="button" class="btn2 chico" data-cerrar-guia>${P.t('Entendido, ocultar')}</button>`);
    var compactar = function (si) { el.className = si ? 'guia compacta' : 'guia'; };
    compactar(true);
    el.open = false;
    el.addEventListener('toggle', function () { compactar(!el.open); });
    el.querySelector('[data-cerrar-guia]').addEventListener('click', function () {
      el.open = false; compactar(true);
      var s = el.querySelector('summary'); if (s) s.focus();
    });
    return el;
  }

  P.abrirGuia = function (soloComprobar) {
    var g = doc.querySelector('details.guia');
    if (!g) return false;
    if (soloComprobar) return true;
    g.open = true;
    g.scrollIntoView({ behavior: 'smooth', block: 'center' });
    var s = g.querySelector('summary'); if (s) s.focus({ preventScroll: true });
    return true;
  };

  P.reiniciarAyuda = function () {
    try {
      var borrar = [];
      for (var i = 0; i < localStorage.length; i += 1) {
        var k = localStorage.key(i);
        if (k && (k.indexOf('prepar_guia_') === 0 || (k.indexOf('prepar_bienvenida_') === 0 && k !== 'prepar_bienvenida_todas'))) borrar.push(k);
      }
      borrar.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) { }
  };

  function montarMarco(rol, pagina, estado, usuario) {
    var main = P.$('#principal');
    var body = doc.body;
    var salto = doc.createElement('a');
    salto.className = 'saltar';
    salto.href = '#principal';
    salto.textContent = P.t('Saltar al contenido');
    body.insertBefore(salto, body.firstChild);
    var aviso = doc.createElement('div');
    P.poner(aviso, avisoSimulador(estado));
    aviso.firstElementChild.setAttribute('data-marco', 'aviso');
    body.insertBefore(aviso.firstElementChild, salto.nextSibling);
    if (rol === 'funcionario' || rol === 'administrador') {
      var cont = doc.createElement('div');
      cont.className = 'con-lateral';
      main.parentNode.insertBefore(cont, main);
      var lat = doc.createElement('div');
      P.poner(lat, lateral(estado, usuario, pagina, rol === 'administrador' ? MENU_ADMIN : MENU_FUNCIONARIO, rol === 'administrador' ? P.t('Administrador') : P.t('Funcionario')));
      cont.appendChild(lat.firstElementChild);
      cont.appendChild(main);
      main.classList.add('principal');
    } else if (rol !== 'invitado') {
      var cab = doc.createElement('div');
      P.poner(cab, rol === 'ciudadano' ? encabezadoCiudadano(estado, usuario, pagina) : encabezadoPublico(estado, usuario));
      Array.prototype.forEach.call(cab.children, function (n) { n.setAttribute('data-marco', 'cabecera'); });
      while (cab.firstChild) main.parentNode.insertBefore(cab.firstChild, main);
      var p = doc.createElement('div');
      P.poner(p, pie());
      body.appendChild(p.firstElementChild);
    }
    var guia = rol !== 'invitado' && usuario ? guiaDe(rol, pagina) : null;
    if (guia) {
      var primero = main.firstElementChild;
      if (primero && primero.nextSibling) main.insertBefore(guia, primero.nextSibling); else main.appendChild(guia);
    }
    P.refrescarHerramientas();
    P.i18n.aplicar(rol === 'invitado' ? body : main);
    P.contadores(main);
    P.ojitos(main);
  }

  function refrescarMarco(rol, pagina, estado, usuario) {
    var main = P.$('#principal');
    var aviso = P.$('[data-marco="aviso"]');
    if (aviso) {
      var a = doc.createElement('div');
      P.poner(a, avisoSimulador(estado));
      a.firstElementChild.setAttribute('data-marco', 'aviso');
      aviso.parentNode.replaceChild(a.firstElementChild, aviso);
    }
    var nuevos = [];
    if (rol === 'funcionario' || rol === 'administrador') {
      var viejo = P.$('.lateral');
      if (viejo) {
        var l = doc.createElement('div');
        P.poner(l, lateral(estado, usuario, pagina, rol === 'administrador' ? MENU_ADMIN : MENU_FUNCIONARIO, rol === 'administrador' ? P.t('Administrador') : P.t('Funcionario')));
        var nl = l.firstElementChild;
        if (viejo.classList.contains('abierto')) {
          nl.classList.add('abierto');
          var bm = nl.querySelector('[data-accion="menu"]'); if (bm) bm.setAttribute('aria-expanded', 'true');
        }
        nl.scrollTop = viejo.scrollTop;
        viejo.parentNode.replaceChild(nl, viejo);
        nuevos.push(nl);
      }
    } else if (rol !== 'invitado' && main && !P.$('#menu-c.abierto') && !P.$('.desplegable')) {
      var viejos = P.$$('[data-marco="cabecera"]');
      if (viejos.length) {
        var c = doc.createElement('div');
        P.poner(c, rol === 'ciudadano' ? encabezadoCiudadano(estado, usuario, pagina) : encabezadoPublico(estado, usuario));
        var ref = viejos[0];
        while (c.firstChild) {
          var n = c.firstChild;
          if (n.nodeType === 1) { n.setAttribute('data-marco', 'cabecera'); nuevos.push(n); }
          ref.parentNode.insertBefore(n, ref);
        }
        viejos.forEach(function (v) { v.parentNode.removeChild(v); });
      }
    }
    P.refrescarHerramientas();
    nuevos.forEach(function (n) { P.i18n.aplicar(n); });
  }

  var MARCO_GUARDADO = 'prepar_marco';
  function leerMarco() {
    try { return JSON.parse(sessionStorage.getItem(MARCO_GUARDADO) || 'null'); } catch (e) { return null; }
  }
  function guardarMarco(estado, usuario) {
    try {
      if (usuario) sessionStorage.setItem(MARCO_GUARDADO, JSON.stringify({ estado: estado, usuario: usuario }));
      else sessionStorage.removeItem(MARCO_GUARDADO);
    } catch (e) { }
  }
  P.olvidarMarco = function () { guardarMarco(null, null); };

  function franjaVerificacion(usuario) {
    var vieja = P.$('#franja-verificar');
    var falta = !!(usuario && usuario.rol === 'ciudadano' && usuario.debeVerificarCorreo);
    if (!falta) { if (vieja) vieja.parentNode.removeChild(vieja); return; }
    var main = P.$('#principal');
    if (vieja || !main) return;
    var d = doc.createElement('div');
    P.poner(d, P.html`<div class="mensaje alerta franja-verificar" id="franja-verificar" role="status">
      <span>${P.t('Confirma tu correo para participar: te enviamos un enlace a {c}. Mientras tanto puedes ver todo, pero no publicar, registrar proyectos ni votar.', { c: usuario.correo })}</span>
      <button type="button" class="btn2 chico" id="reenviar-verificacion">${P.t('Reenviar enlace')}</button></div>`);
    main.insertBefore(d.firstElementChild, main.firstChild);
    P.$('#reenviar-verificacion').addEventListener('click', function (e) {
      P.accion(e.currentTarget, function () { return P.post('/api/auth/reenviar-verificacion', {}); });
    });
  }

  function cerrarMenuC() {
    var mc = P.$('#menu-c');
    if (!mc || !mc.classList.contains('abierto')) return;
    mc.classList.remove('abierto');
    var bm = P.$('[data-accion="menu-c"]');
    if (bm) { bm.setAttribute('aria-expanded', 'false'); bm.setAttribute('aria-label', P.t('Abrir menú')); }
  }
  doc.addEventListener('click', function (e) {
    if (!e.target.closest || e.target.closest('[data-accion="menu-c"]')) return;
    if (!e.target.closest('#menu-c') || e.target.closest('a, [data-accion]')) setTimeout(cerrarMenuC, 0);
  }, true);
  doc.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && P.$('#menu-c.abierto')) { cerrarMenuC(); var bm = P.$('[data-accion="menu-c"]'); if (bm) bm.focus(); }
  });

  doc.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-accion]');
    if (!b) {
      var abierto = P.$('.desplegable');
      if (abierto && !e.target.closest('.desplegable')) cerrarNotificaciones();
      return;
    }
    var a = b.getAttribute('data-accion');
    if (a === 'tema') P.cambiarTema();
    else if (a === 'idioma') P.cambiarIdioma();
    else if (a === 'salir') {
      P.confirmar(P.t('¿Cerrar sesión?'), P.t('¿Seguro que quieres salir? Tendrás que volver a iniciar sesión para entrar.'), { si: 'Cerrar sesión' })
        .then(function (ok) { if (ok) P.salir(); });
    }
    else if (a === 'ayuda') P.bienvenida(true);
    else if (a === 'menu-c') {
      var mc = P.$('#menu-c');
      var menuAbierto = mc.classList.toggle('abierto');
      b.setAttribute('aria-expanded', menuAbierto ? 'true' : 'false');
      b.setAttribute('aria-label', P.t(menuAbierto ? 'Cerrar menú' : 'Abrir menú'));
      if (menuAbierto) { var primero = mc.querySelector('a, button'); if (primero) primero.focus(); }
    } else if (a === 'menu') {
      var lat = P.$('.lateral');
      var ab = lat.classList.toggle('abierto');
      b.setAttribute('aria-expanded', ab ? 'true' : 'false');
    } else if (a === 'notificaciones') {
      e.stopPropagation();
      if (P.$('.desplegable')) cerrarNotificaciones();
      else abrirNotificaciones(b);
    }
  });

  P.actualizarCuentas = function () {
    P.get('/api/func/panel', { sinRedirigir: true }).then(function (d) {
      var c = d.conteos || {};
      P.$$('[data-cuenta]').forEach(function (el) {
        var n = Number(c[el.getAttribute('data-cuenta')] || 0);
        el.hidden = !n;
        el.textContent = n > 99 ? '99+' : String(n);
      });
    }, function () { });
  };

  P.salir = function () {
    P.olvidarMarco();
    P.post('/api/auth/logout', {}, { sinRedirigir: true }).catch(function () { return null; }).then(function () { location.href = '/'; });
  };

  function cerrarNotificaciones() {
    var d = P.$('.desplegable');
    if (d) d.parentNode.removeChild(d);
    var b = P.$('[data-accion="notificaciones"]');
    if (b) b.setAttribute('aria-expanded', 'false');
  }
  function contarNotificaciones() {
    var b = P.$('[data-accion="notificaciones"] .globo');
    if (!b) return;
    P.get('/api/notificaciones', { sinRedirigir: true }).then(function (r) {
      b.hidden = !r.no_leidas;
      b.textContent = r.no_leidas > 99 ? '99+' : String(r.no_leidas);
      if (P.mascota && r.no_leidas) P.mascota.avisosNuevos(r.no_leidas, function () { var bt = P.$('[data-accion="notificaciones"]'); if (bt) bt.click(); });
    }, function () { });
  }
  function abrirNotificaciones(boton) {
    boton.setAttribute('aria-expanded', 'true');
    var d = doc.createElement('div');
    d.className = 'desplegable';
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-label', P.t('Notificaciones'));
    P.poner(d, P.html`<div class="cargando-bloque">Cargando…</div>`);
    boton.parentNode.appendChild(d);
    var caja = d.getBoundingClientRect();
    if (window.innerWidth <= 720 || caja.left < 8 || caja.right > window.innerWidth - 8) {
      var r = boton.getBoundingClientRect();
      d.classList.add('flotante');
      doc.body.appendChild(d);
      d.style.top = Math.round(r.bottom + 8) + 'px';
      d.style.maxHeight = Math.max(220, window.innerHeight - r.bottom - 24) + 'px';
    }
    P.get('/api/notificaciones').then(function (r) {
      var lista = r.notificaciones;
      P.poner(d, P.html`<div class="fila entre" style="padding:6px 8px"><strong>Notificaciones</strong>
        ${r.no_leidas ? P.html`<button type="button" class="enlace-boton pequeno" data-marcar>Marcar todas como leídas</button>` : ''}</div>
        ${lista.length ? lista.map(function (n) {
          return P.html`<div class="notif ${n.leida ? '' : 'nueva'}"><strong>${n.titulo}</strong><div>${n.mensaje}</div><span>${P.fechaHora(n.creada_en)}</span></div>`;
        }) : P.html`<p class="vacio" style="margin:8px">No tienes notificaciones</p>`}`);
      var m = d.querySelector('[data-marcar]');
      if (m) m.addEventListener('click', function () {
        P.post('/api/notificaciones/leidas', {}).then(function () { cerrarNotificaciones(); contarNotificaciones(); });
      });
    }, function (e) { P.poner(d, P.html`<p class="mensaje error">${e.message}</p>`); });
  }

  var ultimoPing = Date.now();
  var ultimaActividad = Date.now();
  var avisoInactividad = null;
  function actividad() {
    ultimaActividad = Date.now();
    if (P.usuario && Date.now() - ultimoPing > 4 * 60 * 1000) {
      ultimoPing = Date.now();
      P.get('/api/auth/yo', { sinRedirigir: true }).catch(function (e) { if (e.estado === 401) irALogin(true); });
    }
  }
  function vigilarInactividad() {
    ['click', 'keydown', 'touchstart', 'scroll'].forEach(function (ev) { doc.addEventListener(ev, P.debounce(actividad, 500), { passive: true }); });
    setInterval(function () {
      var quieto = Date.now() - Math.max(ultimaActividad, ultimoPing);
      if (quieto > 15 * 60 * 1000) { irALogin(true); return; }
      if (quieto > 14 * 60 * 1000 && !avisoInactividad) {
        avisoInactividad = P.modal({
          titulo: P.t('¿Sigues ahí?'),
          contenido: P.html`<p>Por seguridad, tu sesión se cerrará en un minuto por inactividad.</p>`,
          alCerrar: function () { avisoInactividad = null; actividad(); ultimoPing = 0; actividad(); },
          botones: [{ texto: 'Seguir conectado', clase: 'btn' }],
        });
      }
    }, 20000);
    setInterval(contarNotificaciones, 120000);
  }

  var alListo = [];
  P.pagina = function (fn) { alListo.push(fn); };

  function arrancar() {
    var rol = doc.body.getAttribute('data-rol') || 'publico';
    var pagina = doc.body.getAttribute('data-pagina') || '';
    var estado = null;
    var usuario = null;
    var pEstado = P.get('/api/publico/estado', { sinRedirigir: true }).catch(function () { return null; });
    var pYo = P.get('/api/auth/yo', { sinRedirigir: true }).catch(function () { return null; });
    var montado = false;
    var previo = leerMarco();
    var huellaPrevia = previo ? JSON.stringify(previo) : '';
    if (previo && previo.usuario && previo.usuario.rol === rol && !previo.usuario.debeAceptarTerminos && !previo.usuario.debeCambiarPassword
      && !(previo.usuario.idioma && previo.usuario.idioma !== idioma)) {
      try {
        P.estado = previo.estado;
        P.usuario = previo.usuario;
        montarMarco(rol, pagina, previo.estado, previo.usuario);
        montado = true;
      } catch (e) { montado = false; }
    }
    Promise.all([pEstado, pYo]).then(function (r) {
      estado = r[0];
      usuario = r[1];
      if (['ciudadano', 'funcionario', 'administrador'].indexOf(rol) >= 0 || usuario) guardarMarco(estado, usuario);
      P.estado = estado;
      P.usuario = usuario;
      var requiereRol = ['ciudadano', 'funcionario', 'administrador'].indexOf(rol) >= 0;
      if (requiereRol && !usuario) { irALogin(P.param('expirada') === '1'); return; }
      if (requiereRol && usuario.rol !== rol) { location.replace(P.panelDe(usuario.rol)); return; }
      if (rol === 'invitado' && usuario && doc.body.hasAttribute('data-redirigir-sesion')) { location.replace(P.panelDe(usuario.rol)); return; }
      if (usuario && usuario.debeAceptarTerminos && pagina !== 'terminos') { location.replace('/terminos.html?aceptar=1&volver=' + encodeURIComponent(location.pathname + location.search)); return; }
      if (usuario && usuario.debeCambiarPassword && pagina !== 'perfil' && pagina !== 'terminos') { location.replace('/funcionario/perfil.html?temporal=1'); return; }
      if (usuario && usuario.idioma && usuario.idioma !== idioma) {
        var guardado = null;
        var yaIntentado = false;
        try {
          yaIntentado = sessionStorage.getItem('prepar_idioma_sync') === usuario.idioma;
          sessionStorage.setItem('prepar_idioma_sync', usuario.idioma);
          localStorage.setItem('prepar_idioma', usuario.idioma);
          guardado = localStorage.getItem('prepar_idioma');
        } catch (e) { guardado = null; }
        if (guardado === usuario.idioma && !yaIntentado) { location.reload(); return; }
      }
      if (!montado) montarMarco(rol, pagina, estado, usuario);
      else if (JSON.stringify({ estado: estado, usuario: usuario }) !== huellaPrevia) refrescarMarco(rol, pagina, estado, usuario);
      franjaVerificacion(usuario);
      var navActiva = P.$('.navegacion a.activo');
      if (navActiva && navActiva.parentNode.scrollWidth > navActiva.parentNode.clientWidth) {
        var filaNav = navActiva.parentNode;
        filaNav.scrollLeft = Math.max(0, navActiva.offsetLeft - (filaNav.clientWidth - navActiva.offsetWidth) / 2);
      }
      if (!doc.querySelector('script[src="/js/mascota.js"]')) {
        var sm = doc.createElement('script');
        sm.src = '/js/mascota.js';
        sm.defer = true;
        doc.body.appendChild(sm);
      }
      if (usuario && pagina === 'inicio' && !usuario.debeCambiarPassword && !usuario.debeAceptarTerminos) setTimeout(function () { P.bienvenida(false); }, 500);
      doc.title = P.t(doc.title);
      if (usuario) { vigilarInactividad(); contarNotificaciones(); }
      if (rol === 'funcionario') P.actualizarCuentas();
      var corrido = false;
      var correr = function () {
        if (corrido) return;
        corrido = true;
        alListo.forEach(function (fn) {
          try {
            var res = fn({ usuario: usuario, estado: estado });
            if (res && res.catch) res.catch(function (e) { P.aviso((e && e.message) || 'Ocurrió un error inesperado', 'error'); });
          } catch (e) {
            P.aviso((e && e.message) || 'Ocurrió un error inesperado', 'error');
          }
        });
      };
      P.cargarCategorias().then(correr, correr);
      setTimeout(correr, 2500);
      doc.body.classList.add('listo');
    });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', arrancar);
  else setTimeout(arrancar, 0);

  var CDMX = [19.39, -99.13];
  P.mapa = function (el, op) {
    op = op || {};
    if (!el) return null;
    if (typeof window.L === 'undefined') {
      el.classList.add('mapa-sin');
      el.textContent = P.t('El mapa no está disponible en este momento. La lista de abajo tiene la misma información.');
      return null;
    }
    var m = window.L.map(el, { scrollWheelZoom: op.zoomRueda !== false }).setView(op.centro || CDMX, op.zoom || 11);
    var FUENTES = [
      ['https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }],
      ['https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19, subdomains: 'abcd', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>' }],
    ];
    var idx = 0;
    var fallos = 0;
    var cargados = 0;
    var capa = null;
    function poner() {
      if (capa) m.removeLayer(capa);
      capa = window.L.tileLayer(FUENTES[idx][0], FUENTES[idx][1]).addTo(m);
      fallos = 0;
      capa.on('tileload', function () { cargados += 1; el.classList.remove('mapa-sin-calles'); });
      capa.on('tileerror', function () {
        fallos += 1;
        if (fallos < 4) return;
        if (idx + 1 < FUENTES.length) { idx += 1; poner(); return; }
        if (!cargados) el.classList.add('mapa-sin-calles');
      });
    }
    poner();
    el.setAttribute('data-aviso-mapa', P.t('No se pudieron cargar las calles del mapa (revisa tu conexión a internet). Los puntos siguen funcionando.'));
    setTimeout(function () { m.invalidateSize(); }, 200);
    if (window.ResizeObserver) new window.ResizeObserver(function () { m.invalidateSize(); }).observe(el);
    return m;
  };
  var GLIFOS = {
    arbol: '<path d="M12 21v-5M7 16h10l-3-4h2l-3-4h1.5L12 3 9.5 8H11l-3 4h2z"/>',
    obra: '<path d="M4 15a8 8 0 0 1 16 0zM3 15h18v2.5H3zM12 7V4.5M9.5 7.6 8.6 5M14.5 7.6 15.4 5"/>',
    estrella: '<path d="M12 3.5l2.6 5.3 5.8.9-4.2 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.2-4.1 5.8-.9z"/>',
    punto: '<circle cx="12" cy="12" r="3.5"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>',
    colonia: '<path d="M3 21V10l5-4 5 4v11M13 21v-8h8v8M6 21v-4h4v4"/>',
    alerta: '<path d="M12 7v6M12 16.5v.5"/>',
    ok: '<path d="m7 12.5 3.2 3.2L17 9"/>',
    proyecto: '<path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6"/>',
    foco: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
    cono: '<path d="M9.5 4h5l4 15h-13zM7.5 11h9M6.4 15h11.2M3 19h18"/>',
    gota: '<path d="M12 3s-6 6.6-6 11a6 6 0 0 0 12 0c0-4.4-6-11-6-11z"/>',
    escudo: '<path d="M12 3l7 3v5c0 4.4-3 8.3-7 10-4-1.7-7-5.6-7-10V6z"/><path d="m9 12 2 2 4-4"/>',
    banca: '<path d="M4 10h16M5 10V7h14v3M4 14h16M6 14v5M18 14v5"/>',
    balon: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5l3.6 2.6-1.4 4.2H9.8L8.4 10.1zM12 3.5v4M15.6 10.1l4-1.3M14.2 14.3l2.4 3.4M9.8 14.3l-2.4 3.4M8.4 10.1l-4-1.3"/>',
    basura: '<path d="M4 6.5h16M9 6.5V4h6v2.5M6.5 6.5l1 14h9l1-14M10 10.5v6M14 10.5v6"/>',
    bici: '<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-7h5l3 7M10 9l2.5 7H6M13.5 6.5h2.5"/>',
    libro: '<path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5zM12 6.5v13"/>',
    casa: '<path d="M3.5 11 12 4l8.5 7M6 9.5V20h12V9.5M10 20v-5h4v5"/>',
    corazon: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
    persona: '<circle cx="12" cy="7" r="3.5"/><path d="M5 20.5c.5-4 3.3-6.5 7-6.5s6.5 2.5 7 6.5"/>',
  };
  P.GLIFOS_PIN = Object.keys(GLIFOS);
  var GLIFO_RUBRO = { 1: 'arbol', 2: 'obra', 3: 'estrella' };
  P.CATEGORIAS = {
    areas_verdes: ['Parques, huertos y áreas verdes', '#3FA34D', 'arbol'],
    vialidad: ['Calles, bacheo y banquetas', '#8A94A6', 'cono'],
    alumbrado: ['Alumbrado público', '#C9A227', 'foco'],
    recreacion: ['Centros recreativos, deporte y cultura', '#A78BFA', 'estrella'],
    seguridad: ['Cámaras y seguridad', '#E55E54', 'escudo'],
    agua: ['Agua, pozos y drenaje', '#3B9EDB', 'gota'],
    mobiliario: ['Plazas y mobiliario urbano', '#C07F4E', 'banca'],
    otro: ['Otro', '#5F7387', 'proyecto'],
  };
  var CAT_ACTIVAS = Object.keys(P.CATEGORIAS);
  var PALABRAS_CAT = {
    areas_verdes: 'parque, jardin, huerto, arbol, arbolado, area verde, areas verdes, reforest, pasto, vivero, composta, camellon',
    vialidad: 'bache, bacheo, banqueta, pavimen, calle, vialidad, rampa, guarnici, asfalto, paso peatonal, ciclovia, tope',
    alumbrado: 'alumbrad, luminari, lampara, ilumina, foco, poste de luz, luz',
    recreacion: 'deportiv, cancha, gimnasio, juegos, recreativ, cultural, taller, musica, pintura, teatro, biblioteca, centro comunitario, skate, alberca, ludoteca',
    seguridad: 'camara, videovigil, seguridad, alarma, vigilancia',
    agua: 'agua, drenaje, pozo, bebedero, coladera, cisterna, tinaco, potable, fuga, inundaci, alcantarill',
    mobiliario: 'plaza, mobiliario, banca, bote de basura, botes de basura, jardinera, kiosco, techumbre, senaletica, parada',
  };
  P.normalizar = function (t) {
    return String(t || '').toLowerCase().replace(/ñ/g, '\u0001').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0001/g, 'ñ');
  };
  var RE_CAT = {};
  function compilarPalabras() {
    RE_CAT = {};
    Object.keys(PALABRAS_CAT).forEach(function (k) {
      RE_CAT[k] = String(PALABRAS_CAT[k] || '').split(',').map(function (p) { return P.normalizar(p).trim().replace(/\s+/g, ' '); })
        .filter(Boolean).map(function (p) { return new RegExp('(^|[^a-z0-9ñ])' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); });
    });
  }
  compilarPalabras();
  P.usarCategorias = function (lista) {
    if (!Array.isArray(lista) || !lista.length) return;
    var en = idioma === 'en';
    var nuevas = {};
    var activas = [];
    PALABRAS_CAT = {};
    lista.forEach(function (c) {
      if (!c || !/^#[0-9a-fA-F]{6}$/.test(c.color || '')) return;
      nuevas[c.clave] = [(en && c.nombre_en) || c.nombre_es, c.color, GLIFOS[c.icono] ? c.icono : 'proyecto'];
      if (Number(c.activa)) { activas.push(c.clave); PALABRAS_CAT[c.clave] = c.palabras || ''; }
    });
    if (!nuevas.otro) nuevas.otro = ['Otro', '#5F7387', 'proyecto'];
    if (activas.indexOf('otro') < 0) activas.push('otro');
    P.CATEGORIAS = nuevas;
    CAT_ACTIVAS = activas;
    compilarPalabras();
  };
  var cacheTipos = null;
  P.cargarCategorias = function (forzar) {
    if (!cacheTipos || forzar) {
      cacheTipos = P.get('/api/categorias', { sinRedirigir: true }).then(function (l) { P.usarCategorias(l); return l; })
        .catch(function () { cacheTipos = null; return null; });
    }
    return cacheTipos;
  };
  function buscarCategoria(texto) {
    var gana = null;
    var pos = -1;
    CAT_ACTIVAS.forEach(function (k) {
      (RE_CAT[k] || []).forEach(function (re) {
        var m = re.exec(texto);
        if (!m) return;
        var p = m.index + m[1].length;
        if (pos < 0 || p < pos) { gana = k; pos = p; }
      });
    });
    return gana;
  }
  P.adivinarCategoria = function (titulo, descripcion) {
    return buscarCategoria(P.normalizar(titulo)) || buscarCategoria(P.normalizar((titulo || '') + ' ' + (descripcion || ''))) || 'otro';
  };
  P.categoriaDe = function (p) { var c = p && p.categoria; return P.CATEGORIAS[c] ? c : P.adivinarCategoria(p && p.titulo, p && p.descripcion); };
  P.colorCategoria = function (p) { return P.CATEGORIAS[P.categoriaDe(p)][1]; };
  P.glifoCategoria = function (p) { return P.CATEGORIAS[P.categoriaDe(p)][2]; };
  P.filasCategorias = function (lista) {
    var usadas = {};
    (lista || []).forEach(function (p) { usadas[P.categoriaDe(p)] = true; });
    var filtrar = lista && lista.length > 0;
    var claves = Object.keys(P.CATEGORIAS).filter(function (k) { return !filtrar || usadas[k]; });
    return { titulo: 'Tipo de proyecto', filas: claves.map(function (k) { return { color: P.CATEGORIAS[k][1], glifo: P.CATEGORIAS[k][2], texto: P.CATEGORIAS[k][0] }; }) };
  };
  P.selectorCategoria = function (form) {
    var sel = form.querySelector('[name=categoria]');
    if (!sel) return;
    P.poner(sel, CAT_ACTIVAS.map(function (k) { return P.html`<option value="${k}">${P.t(P.CATEGORIAS[k][0])}</option>`; }));
    var tocado = false;
    var muestra = form.querySelector('.muestra-categoria');
    var pintar = function () {
      if (!muestra) return;
      var c = P.CATEGORIAS[sel.value] || P.CATEGORIAS.otro;
      P.poner(muestra, P.html`${P.seguro('<span class="simbolo-pin">' + svgPin(c[1], c[2], false) + '</span>')}<span>${P.t('Así se verá en el mapa')}</span>`);
    };
    sel.addEventListener('change', function () { tocado = true; pintar(); });
    var sugerir = function () {
      if (tocado) return;
      sel.value = P.adivinarCategoria(form.titulo && form.titulo.value, form.descripcion && form.descripcion.value);
      pintar();
    };
    ['titulo', 'descripcion'].forEach(function (n) { var el = form.querySelector('[name=' + n + ']'); if (el) el.addEventListener('input', sugerir); });
    form.addEventListener('reset', function () { tocado = false; setTimeout(sugerir, 0); });
    sugerir();
    return { fijar: function (v) {
      if (!P.CATEGORIAS[v]) return;
      if (!sel.querySelector('option[value="' + v + '"]')) { var o = doc.createElement('option'); o.value = v; o.textContent = P.t(P.CATEGORIAS[v][0]); sel.appendChild(o); }
      sel.value = v; tocado = true; pintar();
    } };
  };
  P.glifoRubro = function (rubroId) { return GLIFO_RUBRO[rubroId] || 'proyecto'; };
  P.glifo = function (clave, color, tam) {
    return '<svg viewBox="0 0 24 24" width="' + (tam || 16) + '" height="' + (tam || 16) + '" fill="none" stroke="' + P.esc(color || 'currentColor') +
      '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (GLIFOS[clave] || GLIFOS.proyecto) + '</svg>';
  };
  function svgPin(color, glifo, elegido) {
    var c = P.esc(color || '#E08E6D');
    return '<svg viewBox="0 0 36 46" width="36" height="46" aria-hidden="true">' +
      '<path d="M18 44.5C11 35.6 3 27.4 3 18A15 15 0 0 1 33 18c0 9.4-8 17.6-15 26.5z" fill="' + c + '" stroke="' + (elegido ? 'var(--texto)' : 'rgba(15,23,42,.65)') + '" stroke-width="' + (elegido ? 2.5 : 1.5) + '"/>' +
      '<circle cx="18" cy="17.5" r="10.5" fill="#fff"/>' +
      '<g transform="translate(9.6 9.1) scale(.7)" fill="none" stroke="' + c + '" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' + (GLIFOS[glifo] || GLIFOS.proyecto) + '</g></svg>';
  }
  P.svgPin = function (color, glifo, elegido) { return svgPin(color, glifo, elegido); };
  P.iconoPin = function (color, elegido, glifo) {
    return window.L.divIcon({
      className: 'pin-maq' + (elegido ? ' elegido' : ''),
      html: svgPin(color, glifo || 'proyecto', elegido), iconSize: [36, 46], iconAnchor: [18, 45], popupAnchor: [0, -38],
    });
  };
  P.marcador = function (lat, lng, color, opciones) {
    opciones = opciones || {};
    return window.L.marker([lat, lng], Object.assign({ icon: P.iconoPin(color, false, opciones.glifo) }, opciones));
  };
  P.simbologia = function (mapa, secciones, op) {
    if (!mapa || !window.L) return { poner: function () {} };
    op = op || {};
    var caja = null;
    var abierta = !(window.innerWidth < 640) && op.abierta !== false;
    var control = window.L.control({ position: op.posicion || 'bottomleft' });
    var pintarCaja = function (secs) {
      if (!caja) return;
      P.poner(caja, P.html`<button type="button" class="simbologia-boton" aria-expanded="${abierta ? 'true' : 'false'}">${P.seguro(P.glifo('proyecto', 'currentColor', 15))}<span>${P.t('Simbología')}</span><span aria-hidden="true">${abierta ? '▾' : '▴'}</span></button>
        <div class="simbologia-cuerpo" ${abierta ? '' : P.seguro('hidden')}>${secs.map(function (sec) {
          return P.html`<div class="simbologia-seccion">${sec.titulo ? P.html`<strong>${P.t(sec.titulo)}</strong>` : ''}
            <ul>${sec.filas.map(function (f) {
              return P.html`<li>${f.glifo && f.color ? P.seguro('<span class="simbolo-pin">' + svgPin(f.color, f.glifo, false) + '</span>')
                : (f.glifo ? P.seguro('<span class="simbolo-glifo">' + P.glifo(f.glifo, 'currentColor', 16) + '</span>') : P.html`<i style="background:${f.color}"></i>`)}<span>${P.t(f.texto)}</span></li>`;
            })}</ul></div>`;
        })}</div>`);
    };
    var actuales = secciones || [];
    control.onAdd = function () {
      caja = window.L.DomUtil.create('div', 'simbologia');
      window.L.DomEvent.disableClickPropagation(caja);
      window.L.DomEvent.disableScrollPropagation(caja);
      caja.addEventListener('click', function (e) {
        if (!e.target.closest('.simbologia-boton')) return;
        abierta = !abierta;
        pintarCaja(actuales);
      });
      pintarCaja(actuales);
      return caja;
    };
    control.addTo(mapa);
    return { poner: function (secs) { actuales = secs || []; pintarCaja(actuales); } };
  };
  P.filasRubros = function (cat) {
    var rubros = (cat && cat.rubros) || [{ id: 1, nombre_es: 'Mejoramiento de espacios públicos' }, { id: 2, nombre_es: 'Infraestructura urbana, obras y servicios' }, { id: 3, nombre_es: 'Actividades recreativas, deportivas y culturales' }];
    return { titulo: 'Rubro (dibujo dentro del punto)', filas: rubros.map(function (r) { return { glifo: P.glifoRubro(r.id), texto: P.nombre ? P.nombre(r) : r.nombre_es }; }) };
  };

  P.selectoresUbicacion = function (selAlc, selUt, cat, op) {
    op = op || {};
    var hayCiclo = cat.unidades.some(function (u) { return Number(u.participa) === 1; });
    var alcConCiclo = {};
    cat.unidades.forEach(function (u) { if (Number(u.participa) === 1) alcConCiclo[u.alcaldia_id] = true; });
    var marcar = hayCiclo && !op.sinMarcas;
    var alcs = cat.alcaldias.slice();
    if (marcar) alcs.sort(function (a, b) { return (alcConCiclo[b.id] ? 1 : 0) - (alcConCiclo[a.id] ? 1 : 0) || a.nombre.localeCompare(b.nombre, 'es'); });
    P.poner(selAlc, P.html`<option value="">${op.textoAlcaldia || P.t('Elige tu alcaldía')}</option>${alcs.map(function (a) {
      return P.html`<option value="${a.id}">${a.nombre}${marcar && alcConCiclo[a.id] ? ' · ' + P.t('participa en el ciclo') : ''}</option>`;
    })}`);
    var llenar = function () {
      var alc = Number(selAlc.value);
      var lista = cat.unidades.filter(function (u) { return u.alcaldia_id === alc; });
      if (marcar) lista.sort(function (a, b) { return Number(b.participa) - Number(a.participa) || a.nombre.localeCompare(b.nombre, 'es'); });
      P.poner(selUt, P.html`<option value="">${alc ? (op.textoUnidad || P.t('Elige tu colonia, barrio o pueblo')) : P.t('Primero elige la alcaldía')}</option>
        ${lista.map(function (u) { return P.html`<option value="${u.id}">${marcar && Number(u.participa) === 1 ? '✓ ' : ''}${u.nombre}${marcar && Number(u.participa) === 1 ? ' · ' + P.t('participa') : ''}</option>`; })}`);
      selUt.disabled = !alc && !op.siempreActivo;
      avisar();
    };
    var aviso = null;
    if (marcar && !op.sinAviso && selUt.parentNode) {
      aviso = doc.createElement('span');
      aviso.className = 'ayuda aviso-colonia';
      aviso.setAttribute('aria-live', 'polite');
      selUt.parentNode.appendChild(aviso);
    }
    function avisar() {
      if (!aviso) return;
      var u = cat.unidades.find(function (x) { return String(x.id) === selUt.value; });
      if (!u) {
        var nombres = cat.unidades.filter(function (x) { return Number(x.participa) === 1; }).map(function (x) { return x.nombre; });
        aviso.textContent = P.t('En el ciclo actual participan {n} colonias: {l}. Las marcadas con ✓ ya pueden participar.', { n: nombres.length, l: nombres.slice(0, 8).join(', ') + (nombres.length > 8 ? '…' : '') });
        aviso.className = 'ayuda aviso-colonia';
      } else if (Number(u.participa) === 1) {
        aviso.textContent = '✓ ' + P.t('Tu colonia participa en el ciclo actual: podrás proponer, votar y vigilar las obras.');
        aviso.className = 'ayuda aviso-colonia ok-texto';
      } else {
        aviso.textContent = P.t('Esta colonia no participa en el ciclo actual. Puedes registrarte, pero no tendrás foro, boleta ni presupuesto hasta que el administrador la incluya en un ciclo.');
        aviso.className = 'ayuda aviso-colonia alerta-texto';
      }
    }
    selAlc.addEventListener('change', llenar);
    selUt.addEventListener('change', avisar);
    llenar();
    return {
      fijar: function (alcaldiaId, unidadId) {
        selAlc.value = alcaldiaId ? String(alcaldiaId) : '';
        llenar();
        selUt.value = unidadId ? String(unidadId) : '';
        avisar();
      },
    };
  };

  P.validarImagen = function (archivo, maxMb) {
    if (!archivo) return P.t('Elige una imagen');
    if (['image/jpeg', 'image/png', 'image/jpg'].indexOf(archivo.type) < 0) return P.t('Solo se aceptan imágenes JPG o PNG');
    if (archivo.size > maxMb * 1024 * 1024) return P.t('La imagen pesa más de {n} MB', { n: maxMb });
    return null;
  };
  P.revisarImagen = function (archivo, maxMb) {
    var basico = P.validarImagen(archivo, maxMb);
    var nombre = archivo && archivo.name ? archivo.name : P.t('el archivo');
    if (archivo && ['image/jpeg', 'image/png', 'image/jpg', ''].indexOf(archivo.type) < 0) {
      return Promise.resolve(P.t('«{a}» no es una imagen JPG o PNG (es un archivo de tipo {t}).', { a: nombre, t: archivo.type || '?' }));
    }
    if (basico && archivo && archivo.size > maxMb * 1024 * 1024) return Promise.resolve(P.t('«{a}» pesa más de {n} MB.', { a: nombre, n: maxMb }));
    if (!archivo || !archivo.size) return Promise.resolve(P.t('«{a}» está vacío.', { a: nombre }));
    var leer = archivo.slice(0, 12);
    var p = leer.arrayBuffer ? leer.arrayBuffer() : new Promise(function (ok, mal) {
      var fr = new FileReader();
      fr.onload = function () { ok(fr.result); };
      fr.onerror = function () { mal(fr.error); };
      fr.readAsArrayBuffer(leer);
    });
    return p.then(function (buf) {
      var b = new Uint8Array(buf);
      var jpg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
      var png = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a;
      if (!jpg && !png) return P.t('«{a}» no es una imagen JPG o PNG válida (su contenido no corresponde a una foto).', { a: nombre });
      return null;
    }, function () { return P.t('No se pudo leer «{a}».', { a: nombre }); });
  };
  P.subirImagen = function (archivo, categoria) {
    return P.api('POST', '/api/archivos' + P.qs({ categoria: categoria }), archivo, { tipo: archivo.type === 'image/png' ? 'image/png' : 'image/jpeg', nombreArchivo: archivo.name, tiempo: 60000 });
  };

  P.perfil = function (ctx) {
    var u = ctx.usuario;
    var temporal = u.debeCambiarPassword || P.param('temporal') === '1';
    var cont = P.$('#perfil-comun');
    var est = ctx.estado;
    var fase = est && est.ciclo;
    var bloqueoResidencia = !!(fase && fase.fase_orden >= 5);
    var foto = u.fotoUuid;
    var esCiudadano = u.rol === 'ciudadano';
    var inicio = P.panelDe(u.rol);
    var f4 = est && (est.fases || []).find(function (x) { return x.orden === 4; });
    var limiteRes = fase && !bloqueoResidencia && f4 && f4.fecha_fin ? P.t('Puedes cambiarla hasta el {f}', { f: P.fechaLarga(f4.fecha_fin) }) : '';
    function pintarFoto() {
      P.poner(P.$('#caja-foto'), P.avatar(u.nombre, foto, 'grande'));
      P.$('#quitar-foto').hidden = !foto;
    }
    var seccionPass = P.html`<section class="tarjeta seccion-perfil" id="sec-pass">
        <div class="completo"><h2 class="h2-maq" style="margin:0 0 4px;font-size:20px">${temporal ? P.t('Crea tu contraseña') : P.t('Cambiar contraseña')}</h2>
          <span class="tenue" style="font-size:14px">${temporal ? P.t('Tu contraseña es temporal. Cámbiala para poder usar el sistema. Debe tener de 8 a 64 caracteres, con al menos una mayúscula y un número, sin espacios.') : P.t('Opcional. Déjalo vacío si no quieres cambiarla. Debe tener de 8 a 64 caracteres, con al menos una mayúscula y un número, sin espacios.')}</span></div>
        <label>${temporal ? P.t('Contraseña temporal') : P.t('Contraseña actual')}<span class="campo-pass"><input type="password" name="actual" maxlength="72" autocomplete="current-password" placeholder="••••••••"><button type="button">Ver</button></span></label>
        <label>Nueva contraseña<span class="campo-pass"><input type="password" name="nueva" maxlength="64" autocomplete="new-password" placeholder="8 a 64 caracteres"><button type="button">Ver</button></span><span class="ayuda" id="reglas-perfil" aria-live="polite"></span></label>
        <label>Confirmar nueva<span class="campo-pass"><input type="password" name="confirmar" maxlength="64" autocomplete="new-password" placeholder="Repite la contraseña"><button type="button">Ver</button></span></label>
        <div class="completo" id="msg-pass"></div>
      </section>`;
    P.poner(cont, P.html`
      ${temporal ? P.html`<div class="mensaje alerta" role="alert">Tu contraseña es temporal. Cámbiala para poder usar el sistema.</div>` : ''}
      <section class="tarjeta foto-perfil" ${temporal ? P.seguro('hidden') : ''}>
        <div id="caja-foto"></div>
        <div class="columna" style="flex:1 1 280px;gap:10px">
          <h2 class="h2-maq" style="margin:0;font-size:20px">Foto de perfil</h2>
          <span class="tenue" style="font-size:14px">${esCiudadano ? P.t('JPG o PNG de hasta 2 MB. Se verá en el foro y en tus comentarios.') : P.t('JPG o PNG de hasta 2 MB. Se verá en el menú y en los avisos que publiques.')}</span>
          <div class="fila"><label class="btn" style="flex-direction:row;cursor:pointer">Cambiar foto<input type="file" accept="image/jpeg,image/png" class="solo-lector" id="archivo-foto"></label>
            <button type="button" class="btn2" id="quitar-foto">Quitar foto</button></div>
          <span id="msg-foto" aria-live="polite"></span>
        </div>
      </section>
      <form id="form-perfil" class="columna" style="gap:20px" novalidate>
        <section class="tarjeta seccion-perfil" ${temporal ? P.seguro('hidden') : ''}>
          <h2 class="h2-maq completo" style="margin:0;font-size:20px">${esCiudadano ? P.t('Datos personales') : P.t('Datos de la cuenta')}</h2>
          <label class="completo">Nombre completo <span class="opcional">(hasta 50 caracteres)</span><input type="text" name="nombre" maxlength="50" required value="${u.nombre}"><span class="ayuda" id="cuenta-nombre"></span></label>
          ${!esCiudadano ? P.html`<label>Teléfono de oficina <span class="opcional">(10 dígitos)</span><input type="tel" name="telefono" inputmode="numeric" maxlength="10" value="${u.telefono || ''}" placeholder="5512345678"><span class="ayuda" id="msg-tel"></span></label>` : ''}
          <label>Correo electrónico<input type="email" value="${u.correo}" disabled><span class="ayuda">${esCiudadano ? P.t('El correo es tu usuario y no se puede cambiar.') : P.t('Es tu usuario y no se puede cambiar.')}</span></label>
          ${esCiudadano ? P.html`
            <label>Fecha de nacimiento<input type="text" value="${P.fecha(u.fechaNacimiento)}" disabled><span class="ayuda">No se puede modificar.</span></label>
            <label>Género<select name="genero">${Object.keys(P.GENEROS).map(function (g) { return P.html`<option value="${g}" ${g === u.genero ? P.seguro('selected') : ''}>${P.t(P.GENEROS[g])}</option>`; })}</select></label>` : ''}
          ${u.rol === 'funcionario' ? P.html`<label>Alcaldía asignada<input type="text" value="${u.alcaldia}" disabled><span class="ayuda">La asigna el administrador.</span></label>
            <div class="completo columna" style="gap:6px"><span class="etiqueta">Funciones asignadas</span><div class="fila">${u.funciones.map(function (f) { return P.html`<span class="etq acento">${P.t(P.FUNCIONES[f] || f)}</span>`; })}</div></div>` : ''}
          ${u.rol === 'administrador' ? P.html`<label>Rol<input type="text" value="${P.t('Administrador')}" disabled><span class="ayuda">Cuenta principal del simulador.</span></label>` : ''}
          <label class="casilla completo"><input type="checkbox" name="recibir_correos" ${u.recibirCorreos ? P.seguro('checked') : ''}> Recibir una copia de mis notificaciones por correo</label>
        </section>
        ${esCiudadano ? P.html`<section class="tarjeta seccion-perfil" id="residencia" ${temporal ? P.seguro('hidden') : ''}>
          <div class="completo fila entre"><h2 class="h2-maq" style="margin:0;font-size:20px">¿Dónde vives?</h2>
            <span class="chip-sup" style="align-self:center">${bloqueoResidencia ? P.t('Bloqueada hasta que termine el ciclo') : (limiteRes || P.t('Puedes cambiarla mientras no inicie la Consulta'))}</span></div>
          <label>Alcaldía<select id="perfil-alcaldia" ${bloqueoResidencia ? P.seguro('disabled') : ''}></select></label>
          <label>Colonia, barrio o pueblo<select name="unidad_territorial_id" id="perfil-unidad" ${bloqueoResidencia ? P.seguro('disabled') : ''}></select></label>
          <p class="completo tenue" style="margin:0;font-size:14px">Cuando inicie la fase de Consulta tu residencia queda bloqueada hasta que termine el ciclo, para que nadie vote en una colonia que no es la suya.</p>
        </section>` : ''}
        ${seccionPass}
        <div class="fila"><button type="submit" class="btn" id="guardar-perfil">${temporal ? P.t('Guardar y continuar') : P.t('Guardar cambios')}</button>
          ${temporal ? '' : P.html`<a class="btn2" href="${inicio}">Cancelar</a>`}<span id="msg-perfil" aria-live="polite"></span></div>
      </form>
      ${esCiudadano && !temporal ? P.html`<section class="tarjeta columna zona-privacidad" style="gap:10px" aria-labelledby="t-privacidad">
        <h2 class="h2-maq" id="t-privacidad" style="margin:0;font-size:20px">Tus datos y privacidad</h2>
        <p class="tenue" style="margin:0;font-size:14px">Puedes ver y corregir tus datos en esta página. Si eliminas tu cuenta se borran tu nombre, correo, fecha de nacimiento, género y foto; tus votos ya son anónimos y se conservan para no alterar los resultados. Más detalles en el <a href="/privacidad.html" target="_blank" rel="noopener">Aviso de privacidad</a>.</p>
        <div><button type="button" class="btn-peligro" id="eliminar-cuenta">Eliminar mi cuenta</button></div>
      </section>` : ''}`);
    P.ojitos(cont);
    if (!temporal) pintarFoto();
    var campoNueva = cont.querySelector('[name=nueva]');
    if (campoNueva) {
      var reglasPerfil = P.$('#reglas-perfil');
      campoNueva.addEventListener('input', function () { P.pintarReglasPassword(reglasPerfil, campoNueva.value); });
    }
    var btnEliminar = P.$('#eliminar-cuenta');
    if (btnEliminar) btnEliminar.addEventListener('click', function () {
      P.modal({
        titulo: P.t('Eliminar mi cuenta'),
        contenido: P.html`<div class="columna" style="gap:12px">
          <p class="texto-2" style="margin:0">${P.t('Esta acción no se puede deshacer. Se borrarán tus datos personales y cerrarás sesión en todos tus dispositivos.')}</p>
          <p class="tenue pequeno" style="margin:0">${P.t('¿Entraste con Google y no tienes contraseña? Crea una con «¿Olvidaste tu contraseña?» en la página de inicio de sesión.')}</p>
          <label>${P.t('Tu contraseña')}<span class="campo-pass"><input type="password" id="el-pass" maxlength="72" autocomplete="current-password"><button type="button">Ver</button></span></label>
          <label>${P.t('Escribe ELIMINAR para confirmar')}<input type="text" id="el-confirmar" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>
          <div id="msg-eliminar" aria-live="polite"></div></div>`,
        botones: [
          { texto: 'Cancelar', clase: 'btn2' },
          {
            texto: 'Eliminar definitivamente', clase: 'btn-peligro',
            accion: function (cerrar, fondo, btn) {
              var pass = P.$('#el-pass', fondo).value;
              var conf = P.$('#el-confirmar', fondo).value.trim().toUpperCase();
              var msg = P.$('#msg-eliminar', fondo);
              if (!pass) { P.poner(msg, P.html`<div class="mensaje error" role="alert">${P.t('Escribe tu contraseña para confirmar')}</div>`); return; }
              if (conf !== 'ELIMINAR') { P.poner(msg, P.html`<div class="mensaje error" role="alert">${P.t('Escribe ELIMINAR para confirmar')}</div>`); return; }
              P.accion(btn, function () {
                return P.post('/api/perfil/eliminar', { password: pass, confirmar: conf }).then(function (r) {
                  if (P.olvidarMarco) P.olvidarMarco();
                  cerrar();
                  P.aviso(r.mensaje, 'ok');
                  setTimeout(function () { location.href = '/'; }, 2200);
                  return null;
                });
              }, { destino: msg });
            },
          },
        ],
      });
      var fondoM = P.$$('.modal-fondo').pop();
      if (fondoM) { P.ojitos(fondoM); var ip = P.$('#el-pass', fondoM); if (ip) ip.focus(); }
    });
    var form = P.$('#form-perfil');
    var nom = form.querySelector('[name=nombre]');
    var contar = function () {
      var n = Array.from(nom.value).length;
      var errNom = P.errorNombre(nom.value);
      var ok = !errNom;
      var c = P.$('#cuenta-nombre');
      c.textContent = n + '/50' + (ok ? '' : ' · ' + errNom);
      c.classList.toggle('error-campo', !ok);
    };
    nom.addEventListener('input', contar);
    contar();
    if (esCiudadano) {
      P.catalogos().then(function (cat) {
        var sel = P.selectoresUbicacion(P.$('#perfil-alcaldia'), P.$('#perfil-unidad'), cat);
        if (location.hash === '#residencia') setTimeout(function () { var r = P.$('#residencia'); if (r) { r.scrollIntoView({ block: 'center' }); P.$('#perfil-alcaldia').focus(); } }, 300);
        var ut = cat.unidades.find(function (x) { return x.id === u.unidadId; });
        sel.fijar(ut ? ut.alcaldia_id : null, u.unidadId);
        if (bloqueoResidencia) { P.$('#perfil-alcaldia').disabled = true; P.$('#perfil-unidad').disabled = true; }
      });
    }
    var msgFoto = P.$('#msg-foto');
    P.$('#archivo-foto').addEventListener('change', function (e) {
      var a = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!a) return;
      P.revisarImagen(a, 2).then(function (err) {
      if (err) { P.poner(msgFoto, P.html`<span class="error-campo" role="alert">${err}</span>`); return; }
      P.poner(msgFoto, '');
      P.accion(P.$('#archivo-foto').parentNode, function () {
        return P.api('PUT', '/api/perfil/foto', a, { tipo: a.type === 'image/png' ? 'image/png' : 'image/jpeg' }).then(function (r) {
          foto = r.fotoUuid;
          pintarFoto();
          P.$$('.avatar:not(.grande)').forEach(function (av) { P.poner(av, P.html`<img src="${P.img(foto)}" alt="">`); });
          P.poner(msgFoto, P.html`<span class="ok-texto" style="font-size:14px;font-weight:600">✓ ${P.t('Tu foto de perfil se actualizó')}</span>`);
          return null;
        });
      }, { destino: msgFoto });
      });
    });
    P.$('#quitar-foto').addEventListener('click', function (e) {
      P.accion(e.currentTarget, function () {
        return P.del('/api/perfil/foto').then(function () {
          foto = null; pintarFoto();
          P.$$('.avatar:not(.grande)').forEach(function (av) { av.textContent = P.iniciales(u.nombre); });
          P.poner(msgFoto, P.html`<span class="ok-texto" style="font-size:14px;font-weight:600">✓ ${P.t('Se quitó tu foto de perfil')}</span>`);
          return null;
        });
      });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = P.datosForm(form);
      var msg = P.$('#msg-perfil');
      var msgPass = P.$('#msg-pass');
      P.poner(msgPass, '');
      P.poner(msg, '');
      var quierePass = temporal || d.actual || d.nueva || d.confirmar;
      if (quierePass) {
        var errP = !d.actual ? 'Escribe tu contraseña actual' : (P.errorPassword(d.nueva, 'La nueva contraseña')
          || (d.nueva !== d.confirmar ? 'Las contraseñas nuevas no coinciden' : (d.nueva === d.actual ? 'La nueva contraseña debe ser diferente de la actual' : null)));
        if (errP) { P.poner(msgPass, P.html`<div class="mensaje error" role="alert">${P.t(errP)}</div>`); return; }
      }
      var pasos = [];
      if (!temporal) {
        if (P.errorNombre(d.nombre)) { P.poner(msg, P.html`<span class="error-campo" role="alert">${P.errorNombre(d.nombre)}</span>`); return; }
        var cuerpo = { nombre: d.nombre, recibir_correos: d.recibir_correos };
        if (!esCiudadano) {
          var tel = String(d.telefono || '').replace(/\D/g, '');
          if (tel && tel.length !== 10) { P.poner(P.$('#msg-tel'), P.html`<span class="error-campo">${P.t('El teléfono debe tener 10 dígitos')}</span>`); return; }
          P.poner(P.$('#msg-tel'), '');
          cuerpo.telefono = tel || null;
        }
        if (esCiudadano) {
          cuerpo.genero = d.genero;
          cuerpo.unidad_territorial_id = bloqueoResidencia ? u.unidadId : Number(d.unidad_territorial_id || u.unidadId);
          if (!cuerpo.unidad_territorial_id) { P.poner(msg, P.html`<span class="error-campo">${P.t('Elige tu colonia, barrio o pueblo')}</span>`); return; }
        }
        pasos.push(function () { return P.put('/api/perfil', cuerpo); });
      }
      if (quierePass) pasos.push(function () { return P.post('/api/auth/cambiar-password', { actual: d.actual, nueva: d.nueva, confirmar: d.confirmar }); });
      P.accion(P.$('#guardar-perfil'), function () {
        var ultimo = null;
        return pasos.reduce(function (pr, fn) { return pr.then(function () { return fn().then(function (r) { ultimo = r; }); }); }, Promise.resolve()).then(function () {
          ['actual', 'nueva', 'confirmar'].forEach(function (k) { form.querySelector('[name=' + k + ']').value = ''; });
          P.poner(msg, P.html`<span class="ok-texto" role="status" style="font-weight:600">✓ ${P.t('Tus datos se guardaron.')}</span>`);
          if (temporal && ultimo && ultimo.destino) { setTimeout(function () { location.href = ultimo.destino; }, 900); return null; }
          if (ultimo && ultimo.usuario && (ultimo.usuario.nombre !== u.nombre || ultimo.usuario.unidadId !== u.unidadId)) setTimeout(function () { location.reload(); }, 900);
          return null;
        });
      }, { destino: quierePass && !pasos.length ? msgPass : msg });
    });
  };

  var TIPOS = { alcaldia: 'Alcaldía', titular: 'Titular', sede_atencion: 'Sede de atención' };
  var ICONOS_DIR = {
    alcaldia: '<path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6M9 11h.01M15 11h.01"/>',
    sede_atencion: '<path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14a2 2 0 0 0 2 2h1v-5H6a2 2 0 0 0-2 2zm16 0a2 2 0 0 1-2 2h-1v-5h1a2 2 0 0 1 2 2zM17 16v1a3 3 0 0 1-3 3h-2"/>',
    titular: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0"/>',
    tel: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    correo: '<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6"/>',
    lugar: '<path d="M12 22s-7-6.3-7-12a7 7 0 0 1 14 0c0 5.7-7 12-7 12zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/>',
    web: '<path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
    temas: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8zM7 7h.01"/>',
    ruta: '<path d="M3 11l19-9-9 19-2-8z"/>',
  };
  var COLORES_ALCALDIA = ['#E08E6D', '#2A9D8F', '#76BDD7', '#A78BFA', '#F4C861', '#5FA8E8', '#E5739B', '#7BC67E'];
  P.colorAlcaldia = function (id) { return COLORES_ALCALDIA[(Number(id) || 0) % COLORES_ALCALDIA.length]; };
  function iconoDir(clave, tam) {
    return '<svg viewBox="0 0 24 24" width="' + (tam || 16) + '" height="' + (tam || 16) + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONOS_DIR[clave] + '</svg>';
  }
  P.iconoDir = iconoDir;
  function enlaceSeguro(u) { try { return encodeURI(decodeURI(u)); } catch (e) { return u; } }
  P.tarjetaDirectorio = function (d, acciones, agrupada) {
    var tel = d.telefono ? (/^800/.test(d.telefono) ? String(d.telefono).replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3') : String(d.telefono).replace(/(\d{2})(\d{4})(\d{4})/, '$1 $2 $3')) : '';
    var web = d.sitio_web ? (/^https?:\/\//i.test(d.sitio_web) ? d.sitio_web : 'https://' + d.sitio_web) : '';
    var color = P.colorAlcaldia(d.alcaldia_id);
    var titularReal = d.nombre_titular && !/^\[|dato de ejemplo/i.test(d.nombre_titular) ? d.nombre_titular : '';
    var avatar = d.tipo === 'titular' && titularReal
      ? P.html`<span class="dir-avatar iniciales" aria-hidden="true">${P.iniciales(titularReal)}</span>`
      : P.html`<span class="dir-avatar" aria-hidden="true">${P.seguro(iconoDir(ICONOS_DIR[d.tipo] ? d.tipo : 'alcaldia', 24))}</span>`;
    var mapa = d.direccion ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(d.direccion + ', ' + (d.alcaldia || '') + ', Ciudad de México') : '';
    var temas = d.temas ? String(d.temas).split(/\s*[,;]\s*/).filter(Boolean).slice(0, 4) : [];
    return P.html`<article class="tarjeta tarjeta-dir tipo-${d.tipo || 'alcaldia'}" style="--c:${color}">
      <div class="dir-cabeza">${avatar}
        <div class="columna" style="gap:2px;min-width:0">
          <span class="dir-tipo">${d.etiqueta || P.t(TIPOS[d.tipo] || 'Contacto')}</span>
          <strong class="h dir-cargo">${P.t(d.cargo)}</strong>
          ${agrupada && d.cargo.indexOf(d.alcaldia) >= 0 ? '' : P.html`<span class="tenue" style="font-size:13px">${P.t('Alcaldía {a}', { a: d.alcaldia })}</span>`}
        </div></div>
      <ul class="dir-datos">
        ${d.nombre_titular ? P.html`<li>${P.seguro(iconoDir('titular'))}<span>${d.nombre_titular}</span></li>` : ''}
        ${tel ? P.html`<li>${P.seguro(iconoDir('tel'))}<a href="tel:${d.telefono}">${tel}</a></li>` : ''}
        ${d.correo ? P.html`<li>${P.seguro(iconoDir('correo'))}<a href="mailto:${d.correo}">${d.correo}</a></li>` : ''}
        ${d.direccion ? P.html`<li>${P.seguro(iconoDir('lugar'))}<span>${d.direccion}</span></li>` : ''}
        ${web ? P.html`<li>${P.seguro(iconoDir('web'))}<a href="${web}" target="_blank" rel="noopener noreferrer">${d.sitio_web.replace(/^https?:\/\//, '')}</a></li>` : ''}
      </ul>
      ${!tel && !d.correo && !d.direccion && !web ? P.html`<p class="tenue dir-sin-datos">${P.t('Aún no hay teléfono ni correo capturados para este contacto.')}</p>` : ''}
      ${temas.length ? P.html`<div class="dir-temas" aria-label="${P.t('Temas que atiende')}">${temas.map(function (t) { return P.html`<span>${P.t(t)}</span>`; })}</div>` : ''}
      ${d.fuente_nombre ? P.html`<p class="dir-fuente">${P.t('Fuente')}: ${d.fuente_url && /^https?:\/\//i.test(d.fuente_url)
        ? P.html`<a href="${enlaceSeguro(d.fuente_url)}" target="_blank" rel="noopener noreferrer">${P.t(d.fuente_nombre)}</a>` : P.t(d.fuente_nombre)}${d.consultado_en ? P.html` · ${P.t('consultado el {f}', { f: P.fechaLarga(d.consultado_en) })}` : ''}</p>` : ''}
      <div class="dir-acciones">
        ${tel ? P.html`<a class="btn2 chico" href="tel:${d.telefono}">${P.seguro(iconoDir('tel', 14))} ${P.t('Llamar')}</a>` : ''}
        ${d.correo ? P.html`<a class="btn2 chico" href="mailto:${d.correo}">${P.seguro(iconoDir('correo', 14))} ${P.t('Escribir')}</a>` : ''}
        ${mapa ? P.html`<a class="btn2 chico" href="${mapa}" target="_blank" rel="noopener noreferrer">${P.seguro(iconoDir('ruta', 14))} ${P.t('Cómo llegar')}</a>` : ''}
      </div>
      ${acciones || ''}</article>`;
  };

  var idChip = 0;
  P.tarjetaDirectorioCompacta = function (d) {
    idChip += 1;
    var id = 'burbuja-dir-' + idChip;
    var color = P.colorAlcaldia(d.alcaldia_id);
    var titularReal = d.nombre_titular && !/^\[|dato de ejemplo/i.test(d.nombre_titular) ? d.nombre_titular : '';
    var avatar = d.tipo === 'titular' && titularReal
      ? P.html`<span class="dir-avatar iniciales" aria-hidden="true">${P.iniciales(titularReal)}</span>`
      : P.html`<span class="dir-avatar" aria-hidden="true">${P.seguro(iconoDir(ICONOS_DIR[d.tipo] ? d.tipo : 'alcaldia', 22))}</span>`;
    return P.html`<div class="dir-chip tipo-${d.tipo || 'alcaldia'}" style="--c:${color}">
      <button type="button" class="dir-chip-boton" aria-expanded="false" aria-controls="${id}">${avatar}
        <span class="columna dir-chip-texto"><span class="dir-tipo">${d.etiqueta || P.t(TIPOS[d.tipo] || 'Contacto')}</span><strong class="dir-chip-cargo">${P.t(d.cargo)}</strong></span>
        <span class="dir-chip-flecha" aria-hidden="true">▾</span></button>
      <div class="dir-burbuja" id="${id}" role="dialog" aria-label="${P.t(d.cargo)}" hidden>
        <button type="button" class="dir-burbuja-cerrar" aria-label="${P.t('Cerrar')}">✕</button>
        ${P.tarjetaDirectorio(d, null, true)}</div></div>`;
  };
  function cerrarBurbujas(excepto) {
    P.$$('.dir-chip.abierto').forEach(function (c) {
      if (c === excepto) return;
      c.classList.remove('abierto');
      var b = c.querySelector('.dir-burbuja'); if (b) b.hidden = true;
      var bt = c.querySelector('.dir-chip-boton'); if (bt) bt.setAttribute('aria-expanded', 'false');
    });
  }
  doc.addEventListener('click', function (e) {
    var t = e.target;
    if (!t.closest) return;
    var cerrar = t.closest('.dir-burbuja-cerrar');
    if (cerrar) { var ch = cerrar.closest('.dir-chip'); cerrarBurbujas(); var bt0 = ch && ch.querySelector('.dir-chip-boton'); if (bt0) bt0.focus(); return; }
    var boton = t.closest('.dir-chip-boton');
    if (!boton) { if (!t.closest('.dir-burbuja')) cerrarBurbujas(); return; }
    var chip = boton.closest('.dir-chip');
    var abrir = !chip.classList.contains('abierto');
    cerrarBurbujas(chip);
    var burbuja = chip.querySelector('.dir-burbuja');
    chip.classList.toggle('abierto', abrir);
    burbuja.hidden = !abrir;
    boton.setAttribute('aria-expanded', String(abrir));
    if (abrir) {
      chip.classList.remove('a-la-derecha');
      var r = burbuja.getBoundingClientRect();
      if (r.right > doc.documentElement.clientWidth - 8) chip.classList.add('a-la-derecha');
      var primero = burbuja.querySelector('a, button:not(.dir-burbuja-cerrar)');
      if (primero) primero.focus({ preventScroll: true });
      var rb = burbuja.getBoundingClientRect();
      if (rb.bottom > window.innerHeight) burbuja.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });
  doc.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var abierto = P.$('.dir-chip.abierto');
    if (!abierto) return;
    cerrarBurbujas();
    var bt = abierto.querySelector('.dir-chip-boton'); if (bt) bt.focus();
  });

  var opcionesAcceso = null;
  P.opcionesAcceso = function () {
    if (!opcionesAcceso) opcionesAcceso = P.get('/api/auth/opciones', { sinRedirigir: true }).catch(function () { opcionesAcceso = null; return { captcha: true, google: false }; });
    return opcionesAcceso;
  };
  P.captcha = function (cont) {
    if (!cont) return null;
    var id = null;
    P.poner(cont, P.html`<div class="captcha" role="group" aria-labelledby="captcha-tit">
      <span class="captcha-titulo" id="captcha-tit">${P.t('Verificación: escribe el código de la imagen')}</span>
      <div class="captcha-fila"><span class="captcha-marco"><img class="captcha-img" alt="${P.t('Código de verificación de 5 letras y números')}" width="210" height="72"></span>
        <button type="button" class="btn2 chico captcha-otro">↻ ${P.t('Otro código')}</button></div>
      <input type="text" name="captcha" class="captcha-entrada" maxlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${P.t('Ej.: K7M2P')}" aria-describedby="captcha-tit">
      <span class="ayuda">${P.t('No importan mayúsculas ni minúsculas.')}</span></div>`);
    var img = cont.querySelector('.captcha-img');
    var entrada = cont.querySelector('.captcha-entrada');
    var cargar = function () {
      entrada.value = '';
      return P.opcionesAcceso().then(function (o) {
        if (!o.captcha) { cont.hidden = true; return null; }
        cont.hidden = false;
        return P.get('/api/captcha', { sinRedirigir: true }).then(function (r) { id = r.id; img.src = r.imagen; }, function (e) { P.aviso(e.message, 'error'); });
      });
    };
    cont.querySelector('.captcha-otro').addEventListener('click', function () { cargar().then(function () { entrada.focus(); }); });
    var api = {
      cargar: cargar,
      mostrar: function () { return cargar(); },
      visible: function () { return !cont.hidden; },
      datos: function () { return api.visible() && id ? { captcha_id: id, captcha: entrada.value.trim() } : {}; },
      vacio: function () { return api.visible() && !entrada.value.trim(); },
      enfocar: function () { entrada.focus(); },
    };
    return api;
  };
  P.LOGO_GOOGLE = '<svg class="logo-google" viewBox="0 0 48 48" width="20" height="20" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

  P.descargar = function (url, boton) {
    return P.accion(boton, function () {
      return fetch(url, { credentials: 'same-origin', headers: { 'X-Prepar': '1' } }).then(function (r) {
        if (!r.ok) {
          return r.json().catch(function () { return {}; }).then(function (d) {
            if (r.status === 401) irALogin(true);
            throw new ErrorApi(r.status, P.t((d && d.error) || 'No se pudo descargar el archivo'));
          });
        }
        var disp = r.headers.get('content-disposition') || '';
        var m = /filename="([^"]+)"/.exec(disp);
        return r.blob().then(function (b) {
          var a = doc.createElement('a');
          a.href = URL.createObjectURL(b);
          a.download = m ? m[1] : 'descarga';
          doc.body.appendChild(a);
          a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
        });
      });
    });
  };
}());
