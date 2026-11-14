'use strict';
let yo;

async function cargar() {
  const usuarios = await P.get(`/admin/usuarios?rol=${P.$('#filtro-rol').value}`);
  P.$('#lista').innerHTML = usuarios.map((u) => `<tr>
      <td><b>${P.esc(u.nombre)}</b>${u.activo ? '' : ' <span class="tenue">(desactivada)</span>'}</td>
      <td>${P.esc(u.correo)}</td><td>${P.esc(u.rol)}</td>
      <td>${P.esc([u.colonia, u.alcaldia].filter(Boolean).join(', '))}</td>
      <td>${u.id === yo.id ? '' : `<button class="btn2" data-id="${u.id}" data-activo="${u.activo ? '0' : '1'}">${u.activo ? 'Desactivar' : 'Activar'}</button>`}</td></tr>`).join('');
}

(async () => {
  yo = await P.pagina('Usuarios');
  const { alcaldias } = await P.get('/catalogos');
  P.$('#alcaldia').innerHTML = alcaldias.map((a) => `<option value="${a.id}">${P.esc(a.nombre)}</option>`).join('');
  P.$('#filtro-rol').addEventListener('change', cargar);
  P.$('#lista').addEventListener('click', async (e) => {
    const boton = e.target.closest('[data-id]');
    if (!boton) return;
    await P.put(`/admin/usuarios/${boton.dataset.id}/activo`, { activo: boton.dataset.activo === '1' });
    await cargar();
  });
  P.formulario(P.$('#form'), async (datos) => {
    const r = await P.post('/admin/funcionarios', datos);
    P.$('#form').reset();
    await cargar();
    return `Cuenta creada. Contraseña temporal: ${r.temporal}${r.enviado ? ' (también se envió por correo)' : ''}`;
  });
  await cargar();
})();
