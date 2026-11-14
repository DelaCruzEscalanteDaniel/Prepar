'use strict';
P.formulario(P.$('#form'), async (datos) => {
  const r = await P.post('/login', datos);
  location.href = INICIO[r.rol];
});
