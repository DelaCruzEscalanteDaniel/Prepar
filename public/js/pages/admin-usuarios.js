'use strict';
let yo;
let rol = 'ciudadano';

async function cargar() {
  const { usuarios, conteo } = await P.get(`/admin/usuarios?rol=${rol}&q=${encodeURIComponent(P.$('#buscar').value)}`);
  for (const r of ['ciudadano', 'funcionario', 'administrador']) P.$(`#n-${r}`).textContent = conteo[r] || 0;
  P.$('#col-lugar').textContent = rol === 'ciudadano' ? 'Colonia' : rol === 'funcionario' ? 'Alcaldía' : '';
  P.$('#form').classList.toggle('oculto', rol !== 'funcionario');
  P.$('#lista').innerHTML = usuarios.length ? usuarios.map((u) => `<tr>
      <td><div style="display:flex;gap:10px;align-items:center"><b class="avatar">${P.esc(P.iniciales(u.nombre))}</b><b>${P.esc(u.nombre)}</b></div></td>
      <td>${P.esc(u.correo)}</td>
      <td>${P.esc(rol === 'ciudadano' ? `${u.colonia}, ${u.alcaldia}` : u.alcaldia || '')}</td>
      <td><span class="etq ${u.activo ? 'activo' : 'cerrado'}">${u.activo ? 'Activa' : 'Desactivada'}</span></td>
      <td>${u.id === yo.id ? '' : `<button class="btn2" data-id="${u.id}" data-activo="${u.activo ? '0' : '1'}">${u.activo ? 'Desactivar' : 'Activar'}</button>`}</td></tr>`).join('')
    : '<tr><td colspan="5" class="tenue">No hay cuentas que coincidan.</td></tr>';
}

(async () => {
  yo = await P.pagina('Usuarios');
  const { alcaldias } = await P.get('/catalogos');
  P.$('#alcaldia').innerHTML = alcaldias.map((a) => `<option value="${a.id}">${P.esc(a.nombre)}</option>`).join('');
  P.$('#pestanas').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    rol = b.dataset.rol;
    P.$('#pestanas').querySelectorAll('button').forEach((x) => x.classList.toggle('activo', x === b));
    cargar();
  });
  let espera;
  P.$('#buscar').addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(cargar, 250); });
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
