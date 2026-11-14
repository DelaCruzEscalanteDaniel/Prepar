'use strict';
(async () => {
  const u = await P.pagina('');
  const form = P.$('#form-datos');
  form.nombre.value = u.nombre;
  form.telefono.value = u.telefono || '';
  P.$('#correo').value = u.correo;
  if (new URLSearchParams(location.search).has('temporal') || u.debe_cambiar_password) P.$('#temporal').classList.remove('oculto');

  if (u.rol === 'ciudadano') {
    P.$('#campos-colonia').classList.remove('oculto');
    P.$('#form-eliminar').classList.remove('oculto');
    const { alcaldias, colonias } = await P.get('/catalogos');
    const alcaldia = P.$('#alcaldia');
    const colonia = P.$('#colonia');
    alcaldia.innerHTML = alcaldias.map((a) => `<option value="${a.id}">${P.esc(a.nombre)}</option>`).join('');
    alcaldia.value = u.alcaldia_id;
    const llenar = () => {
      colonia.innerHTML = colonias.filter((c) => c.alcaldia_id === Number(alcaldia.value))
        .map((c) => `<option value="${c.id}">${P.esc(c.nombre)}</option>`).join('');
    };
    alcaldia.addEventListener('change', llenar);
    llenar();
    colonia.value = u.colonia_id;
  }

  P.formulario(form, async (datos) => {
    await P.put('/perfil', datos);
    return 'Tus datos se guardaron';
  });

  P.formulario(P.$('#form-password'), async (datos) => {
    if (datos.nueva !== datos.confirmar) throw new Error('Las contraseñas nuevas no son iguales');
    await P.put('/password', datos);
    P.$('#form-password').reset();
    if (u.debe_cambiar_password) { location.href = '/funcionario/inicio.html'; return ''; }
    return 'Tu contraseña se cambió';
  });

  P.formulario(P.$('#form-eliminar'), async (datos) => {
    if (!confirm('¿Seguro que quieres eliminar tu cuenta? No se puede deshacer.')) return '';
    await P.del('/cuenta', datos);
    location.href = '/';
    return '';
  });
})();
