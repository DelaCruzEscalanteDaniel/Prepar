'use strict';
(async () => {
  const [{ fases }, cifras] = await Promise.all([P.get('/catalogos'), P.get('/cifras')]);
  const actual = cifras.ciclo ? cifras.ciclo.fase_id : 0;
  if (cifras.ciclo) P.$('#fase-portada').textContent = `${cifras.ciclo.nombre} · Fase ${actual}: ${cifras.ciclo.fase}`;
  P.$('#fases').innerHTML = fases.map((f) => `<div class="fase-tarjeta ${f.id === actual ? 'actual' : ''}"><span class="n">${f.id}</span>
    <div><b>${P.esc(f.nombre)}</b>${f.id === actual ? ' <span class="etq fase">En curso</span>' : ''}<p>${P.esc(f.descripcion)}</p></div></div>`).join('');
  P.$('#cifras').innerHTML = [['Colonias participando', cifras.colonias], ['Ciudadanos registrados', cifras.ciudadanos], ['Proyectos propuestos', cifras.proyectos]]
    .map(([t, n]) => `<div class="caja dato-caja"><p class="tenue">${t}</p><div class="dato">${Number(n).toLocaleString('es-MX')}</div></div>`).join('');
})();
