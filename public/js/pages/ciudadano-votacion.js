'use strict';

function opcion(p, deshabilitada) {
  return `<label class="opcion"><input type="radio" name="proyecto_id" value="${p.id}" required ${deshabilitada ? 'disabled' : ''}>
    <span class="numero-boleta">${p.numero_boleta}</span>
    <span style="flex:1"><b>${P.esc(p.titulo)}</b> <span class="etq">${P.esc(p.rubro)}</span><br>
    <span class="tenue">${P.esc(p.descripcion)}</span></span><b>${P.pesos(p.costo)}</b></label>`;
}

async function resultados() {
  const r = await P.get('/resultados');
  if (!r.proyectos.length) return;
  const maximo = Math.max(1, ...r.proyectos.map((p) => p.votos));
  P.$('#resultados').classList.remove('oculto');
  P.$('#res-grafica').innerHTML = r.proyectos.map((p) => `<div class="fila-g"><span class="nombre">${P.esc(p.titulo)}
      ${p.ganador ? '<span class="etq ganador">Ganador</span>' : ''}</span>
      <div class="fondo-g"><span style="width:${(p.votos / maximo) * 100}%;${p.ganador ? '' : 'background:#94A3B8'}"></span></div><b>${p.votos}</b></div>`).join('');
  P.$('#res-nota').textContent = `${r.total} votos en tu colonia.`;
}

(async () => {
  const u = await P.pagina('Votación');
  P.$('#titulo').textContent = `Votación · ${u.colonia}`;
  const { ciclo, proyectos, voto } = await P.get('/boleta');
  const aviso = P.$('#aviso');
  if (!ciclo) { aviso.textContent = 'No hay un ciclo activo.'; return; }
  if (ciclo.fase_id >= 6) {
    P.$('#subtitulo').textContent = 'Los resultados de la consulta en tu colonia.';
    aviso.classList.add('oculto');
    await resultados();
  }
  if (voto) {
    if (ciclo.fase_id < 6) aviso.classList.add('oculto');
    P.$('#comprobante').classList.remove('oculto');
    P.$('#comp-ciclo').textContent = `${ciclo.nombre} · ${u.colonia}, ${u.alcaldia}`;
    P.$('#folio').textContent = voto.folio;
    P.$('#fecha-voto').textContent = `Votaste el ${P.fecha(voto.fecha)}`;
    P.$('#imprimir').addEventListener('click', () => window.print());
    return;
  }
  if (ciclo.fase_id >= 6) return;
  if (!proyectos.length) {
    aviso.innerHTML = '<div><b>La boleta todavía no está lista</b>Se arma en la fase 4: Sorteo y difusión.</div>';
    return;
  }
  if (ciclo.fase_id !== 5) {
    aviso.innerHTML = '<div><b>Así se ve la boleta de tu colonia</b>La votación se abre en la fase 5: Consulta.</div>';
    P.$('#boleta-vista').classList.remove('oculto');
    P.$('#boleta-vista').innerHTML = `<h2>Boleta</h2>${proyectos.map((p) => opcion(p, true)).join('')}`;
    return;
  }
  aviso.classList.add('oculto');
  P.$('#form').classList.remove('oculto');
  P.$('#opciones').innerHTML = proyectos.map((p) => opcion(p, false)).join('');
  P.formulario(P.$('#form'), async (datos) => {
    if (!confirm('¿Confirmas tu voto? Ya no lo podrás cambiar.')) return '';
    await P.post('/votar', datos);
    location.reload();
    return '';
  });
})();
