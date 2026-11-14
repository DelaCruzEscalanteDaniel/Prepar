'use strict';

const MENUS = {
  ciudadano: [['Inicio', '/ciudadano/inicio.html'], ['Foro', '/ciudadano/foro.html'], ['Proyectos', '/ciudadano/proyectos.html'],
    ['Votación', '/ciudadano/votacion.html'], ['Mapa', '/ciudadano/mapa.html'], ['Foto denuncia', '/ciudadano/fotos.html']],
  funcionario: [['Inicio', '/funcionario/inicio.html'], ['Proyectos', '/funcionario/proyectos.html'], ['Sorteo', '/funcionario/sorteo.html'],
    ['Obras', '/funcionario/obras.html'], ['Foro', '/funcionario/foro.html']],
  administrador: [['Inicio', '/admin/inicio.html'], ['Usuarios', '/admin/usuarios.html']],
};
const INICIO = { ciudadano: '/ciudadano/inicio.html', funcionario: '/funcionario/inicio.html', administrador: '/admin/inicio.html' };
const ESTATUS = {
  registrado: 'Registrado', viable: 'Viable', no_viable: 'No viable', ganador: 'Ganador',
  en_ejecucion: 'En ejecución', concluido: 'Concluido', inejecutable: 'Inejecutable',
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
  estatus: (e) => ESTATUS[e] || e,

  async pagina(activo) {
    const u = await P.get('/yo');
    const enPerfil = location.pathname === '/perfil.html';
    if (u.debe_cambiar_password && !enPerfil) { location.href = '/perfil.html?temporal=1'; return new Promise(() => {}); }
    const lugar = u.rol === 'ciudadano' ? ` · ${u.colonia}, ${u.alcaldia}` : u.rol === 'funcionario' ? ` · ${u.alcaldia}` : '';
    const menu = MENUS[u.rol].map(([nombre, url]) => `<a href="${url}" class="${nombre === activo ? 'activo' : ''}">${nombre}</a>`).join('');
    P.$('header').innerHTML = `
      <div class="barra">
        <a class="marca" href="${INICIO[u.rol]}"><img src="/img/logo.png" alt="">Prepar</a>
        <span class="usuario">${P.esc(u.nombre + lugar)} · <a href="/perfil.html">Mi perfil</a></span>
        <button class="btn2" id="salir">Cerrar sesión</button>
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
