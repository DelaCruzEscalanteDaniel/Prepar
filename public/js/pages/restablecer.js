'use strict';
const token = new URLSearchParams(location.search).get('token') || '';
P.formulario(P.$('#form'), async (datos) => {
  if (datos.password !== datos.confirmar) throw new Error('Las contraseñas no son iguales');
  await P.post('/restablecer', { token, password: datos.password });
  P.$('#form').innerHTML = '<p class="mensaje ok">Listo, ya puedes <a href="/login.html">iniciar sesión</a> con tu contraseña nueva.</p>';
});
