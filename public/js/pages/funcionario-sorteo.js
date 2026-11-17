'use strict';
async function cargar() {
  const { ciclo, colonias } = await P.get('/func/sorteo');
  const fase = ciclo ? ciclo.fase_id : 0;
  P.$('#lista').innerHTML = colonias.map((c) => `<tr>
      <td><b>${P.esc(c.nombre)}</b></td><td>${c.viables}</td>
      <td>${c.boleta.length ? c.boleta.map((b) => `<span class="numero-boleta" style="display:inline-grid;width:24px;height:24px;font-size:12px;margin:0 6px 4px 0">${b.numero_boleta}</span>${P.esc(b.titulo)}`).join('<br>') : '<span class="etq">Sin sorteo</span>'}</td>
      <td>${fase === 4 && c.viables > 0 && !c.boleta.length ? `<button class="btn" data-id="${c.id}">Hacer sorteo</button>` : ''}</td></tr>`).join('');
  if (fase !== 4) P.mensaje(P.$('#mensaje'), 'El sorteo se hace en la fase 4: Sorteo y difusión.', 'tenue');
}

(async () => {
  await P.pagina('Sorteo');
  P.$('#lista').addEventListener('click', async (e) => {
    const boton = e.target.closest('[data-id]');
    if (!boton) return;
    boton.disabled = true;
    try {
      await P.post(`/func/sorteo/${boton.dataset.id}`);
      P.mensaje(P.$('#mensaje'), 'Sorteo hecho. La boleta ya está lista.', 'ok');
    } catch (err) {
      P.mensaje(P.$('#mensaje'), err.message);
    }
    await cargar();
  });
  await cargar();
})();
