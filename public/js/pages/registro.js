'use strict';
(async () => {
  const { alcaldias, colonias } = await P.get('/catalogos');
  const alcaldia = P.$('#alcaldia');
  const colonia = P.$('#colonia');
  alcaldia.innerHTML = '<option value="">Elige tu alcaldía</option>' + alcaldias.map((a) => `<option value="${a.id}">${P.esc(a.nombre)}</option>`).join('');
  alcaldia.addEventListener('change', () => {
    colonia.innerHTML = '<option value="">Elige tu colonia</option>' + colonias.filter((c) => c.alcaldia_id === Number(alcaldia.value))
      .map((c) => `<option value="${c.id}">${P.esc(c.nombre)}</option>`).join('');
  });
  alcaldia.dispatchEvent(new Event('change'));
})();

P.formulario(P.$('#form'), async (datos) => {
  if (datos.password !== datos.confirmar) throw new Error('Las contraseñas no son iguales');
  await P.post('/registro', { ...datos, acepto: datos.acepto === 'on' });
  location.href = '/ciudadano/inicio.html';
});
