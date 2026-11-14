'use strict';
(async () => {
  const u = await P.pagina('Votación');
  P.$('#titulo').textContent = `Votación · ${u.colonia}`;
  const { ciclo, proyectos, voto } = await P.get('/boleta');
  const aviso = P.$('#aviso');
  if (voto) {
    aviso.classList.add('oculto');
    P.$('#comprobante').classList.remove('oculto');
    P.$('#folio').textContent = voto.folio;
    P.$('#fecha-voto').textContent = `Votaste el ${P.fecha(voto.fecha)}.`;
    P.$('#imprimir').addEventListener('click', () => window.print());
    return;
  }
  if (!ciclo) { aviso.textContent = 'No hay un ciclo activo.'; return; }
  if (!proyectos.length) { aviso.textContent = 'La boleta de tu colonia todavía no está lista. Se arma en la fase 4: Sorteo y difusión.'; return; }
  const lista = proyectos.map((p) => `<label class="opcion"><input type="radio" name="proyecto_id" value="${p.id}" required>
    <span><b>${p.numero_boleta}. ${P.esc(p.titulo)}</b> · ${P.pesos(p.costo)}<br><span class="tenue">${P.esc(p.descripcion)}</span></span></label>`).join('');
  if (ciclo.fase_id !== 5) {
    aviso.innerHTML = `Así se ve la boleta de tu colonia. La votación se abre en la fase 5: Consulta.<div style="margin-top:12px">${lista}</div>`;
    aviso.querySelectorAll('input').forEach((i) => { i.disabled = true; });
    return;
  }
  aviso.classList.add('oculto');
  P.$('#form').classList.remove('oculto');
  P.$('#opciones').innerHTML = lista;
  P.formulario(P.$('#form'), async (datos) => {
    if (!confirm('¿Confirmas tu voto? Ya no lo podrás cambiar.')) return '';
    await P.post('/votar', datos);
    location.reload();
    return '';
  });
})();
