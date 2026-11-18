'use strict';

const MENUS = {
  ciudadano: [['Inicio', '/ciudadano/inicio.html'], ['Foro', '/ciudadano/foro.html'], ['Proyectos', '/ciudadano/proyectos.html'],
    ['Votación', '/ciudadano/votacion.html'], ['Mapa', '/ciudadano/mapa.html'], ['Foto denuncia', '/ciudadano/fotos.html']],
  funcionario: [['Inicio', '/funcionario/inicio.html'], ['Proyectos', '/funcionario/proyectos.html'], ['Sorteo', '/funcionario/sorteo.html'],
    ['Obras', '/funcionario/obras.html'], ['Foro', '/funcionario/foro.html'], ['Mapa', '/funcionario/mapa.html']],
  administrador: [['Inicio', '/admin/inicio.html'], ['Ciclos', '/admin/ciclos.html'], ['Usuarios', '/admin/usuarios.html']],
};
const INICIO = { ciudadano: '/ciudadano/inicio.html', funcionario: '/funcionario/inicio.html', administrador: '/admin/inicio.html' };
const ESTATUS = {
  registrado: 'Registrado', viable: 'Viable', no_viable: 'No viable', ganador: 'Ganador',
  en_ejecucion: 'En ejecución', concluido: 'Concluido', inejecutable: 'Inejecutable',
};
const MOTIVOS = {
  ubicacion: 'Ubicación faltante o incorrecta', costo: 'Costo fuera de lo razonable', competencia: 'No le corresponde a la alcaldía',
  repetido: 'Proyecto repetido', beneficio: 'No beneficia a la colonia', otro: 'Otro motivo',
};

const P = {
  async api(ruta, metodo = 'GET', datos) {
    const opciones = { method: metodo, headers: { 'X-Prepar': '1' }, credentials: 'same-origin' };
    if (datos !== undefined) {
      opciones.headers['Content-Type'] = 'application/json';
      opciones.body = JSON.stringify(datos);
    }
    const r = await fetch('/api' + ruta, opciones);
    const respuesta = await r.json().catch(() => ({}));
    if (r.status === 401 && !ruta.startsWith('/login')) location.href = '/login.html';
    if (!r.ok) throw new Error(respuesta.error || 'Ocurrió un error. Intenta de nuevo');
    return respuesta;
  },
  get: (ruta) => P.api(ruta),
  post: (ruta, datos = {}) => P.api(ruta, 'POST', datos),
  put: (ruta, datos = {}) => P.api(ruta, 'PUT', datos),
  del: (ruta, datos) => P.api(ruta, 'DELETE', datos),

  $: (selector) => document.querySelector(selector),
  esc: (texto) => String(texto == null ? '' : texto).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  pesos: (n) => Number(n || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }),
  fecha: (f) => (f ? new Date(String(f).replace(' ', 'T')).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : ''),
  fechaCorta: (f) => (f ? new Date(`${String(f).slice(0, 10)}T12:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : ''),
  estatus: (e) => ESTATUS[e] || e,
  etiqueta: (e) => `<span class="etq ${e}">${ESTATUS[e] || e}</span>`,
  motivos: MOTIVOS,
  sinUbicacion: '<span class="etq alerta">Sin ubicación</span>',
  iniciales: (n) => String(n || '').split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase(),

  tablaFases(fases, actual) {
    const filas = fases.map((f) => {
      const estado = f.id_fase < actual ? 'Terminada' : f.id_fase === actual ? '<span class="etq en_ejecucion">En curso</span>' : 'Pendiente';
      const fechas = f.fecha_inicio ? `${P.fechaCorta(f.fecha_inicio)} – ${P.fechaCorta(f.fecha_fin)}` : '';
      const nombre = f.id_fase === actual ? `<b>${f.id_fase}. ${P.esc(f.nombre)}</b>` : `${f.id_fase}. ${P.esc(f.nombre)}`;
      return `<tr><td>${nombre}</td><td>${fechas}</td><td>${estado}</td></tr>`;
    }).join('');
    return `<table><thead><tr><th>Fase</th><th>Fechas</th><th>Estado</th></tr></thead><tbody>${filas}</tbody></table>`;
  },

  async pagina(activo) {
    const u = await P.get('/yo');
    const enPerfil = location.pathname === '/perfil.html';
    if (u.debe_cambiar_password && !enPerfil) { location.href = '/perfil.html?temporal=1'; return new Promise(() => {}); }
    const lugar = u.rol === 'ciudadano' ? `${u.colonia}, ${u.alcaldia}` : u.rol === 'funcionario' ? `Funcionario · ${u.alcaldia}` : 'Administrador';
    const menu = MENUS[u.rol].map(([nombre, url]) => `<a href="${url}" class="${nombre === activo ? 'activo' : ''}">${nombre}</a>`).join('');
    P.$('header').innerHTML = `
      <div class="barra">
        <a class="marca" href="${INICIO[u.rol]}"><img src="/img/logo.png" alt="">Prepar</a>
        <a class="usuario" href="/perfil.html" title="Mi perfil"><span>${P.esc(u.nombre)}<small>${P.esc(lugar)}</small></span><b class="avatar">${P.esc(P.iniciales(u.nombre))}</b></a>
        <button class="btn2" id="salir">Salir</button>
      </div>
      <nav>${menu}</nav>`;
    P.$('#salir').addEventListener('click', async () => {
      await P.post('/logout');
      location.href = '/login.html';
    });
    return u;
  },

  mensaje(elemento, texto, tipo = 'error') {
    elemento.textContent = texto;
    elemento.className = `mensaje ${tipo}`;
  },

  formulario(form, enviar) {
    const aviso = form.querySelector('.mensaje');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const boton = form.querySelector('button[type=submit], button:not([type])');
      if (boton) boton.disabled = true;
      if (aviso) aviso.textContent = '';
      try {
        const texto = await enviar(Object.fromEntries(new FormData(form)));
        if (aviso && texto) P.mensaje(aviso, texto, 'ok');
      } catch (err) {
        if (aviso) P.mensaje(aviso, err.message);
        else alert(err.message);
      } finally {
        if (boton) boton.disabled = false;
      }
    });
  },

  leerFoto(archivo) {
    return new Promise((resolver, rechazar) => {
      if (!archivo) return resolver(null);
      if (!['image/jpeg', 'image/png'].includes(archivo.type)) return rechazar(new Error('La foto debe ser JPG o PNG'));
      if (archivo.size > 5 * 1024 * 1024) return rechazar(new Error('La foto no puede pesar más de 5 MB'));
      const lector = new FileReader();
      lector.onload = () => resolver(String(lector.result).split(',')[1]);
      lector.onerror = () => rechazar(new Error('No se pudo leer la foto'));
      return lector.readAsDataURL(archivo);
    });
  },

  mapa(id, lat = 19.4326, lng = -99.1332, zoom = 13) {
    const mapa = L.map(id).setView([lat, lng], zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapa);
    return mapa;
  },
};
