'use strict';
(async () => {
  const { fases } = await P.get('/catalogos');
  P.$('#fases').innerHTML = fases.map((f) => `<li class="hecha"><b>${P.esc(f.nombre)}.</b> ${P.esc(f.descripcion)}</li>`).join('');
})();
