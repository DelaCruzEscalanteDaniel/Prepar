'use strict';
let ciclos = [];

const elegido = () => ciclos.find((c) => c.id === Number(P.$('#ciclo').value));

async function pintarCiclo() {
  const c = elegido();
  if (!c) return;
  P.$('#activar').disabled = c.estado !== 'borrador';
  let acciones = '';
  if (c.estado === 'activo' && c.fase_id < 8) acciones = `<button class="btn" id="siguiente">Pasar a la fase ${c.fase_id + 1}</button>`;
  if (c.fase_id === 8 && c.estado !== 'cerrado') acciones = '<button class="btn" id="cerrar">Cerrar el ciclo</button>';
  P.$('#estado').innerHTML = `<p style="margin:18px 0 6px"><b>Estado:</b> ${P.esc(c.estado)} · <b>Presupuesto:</b> ${P.pesos(c.presupuesto_total)}</p>
    <p style="margin:0 0 12px"><b>Fase actual:</b> ${c.fase_id} de 8 · ${P.esc(c.fase)}</p>${acciones}`;
  const { votos, totales } = await P.get(`/admin/ciclos/${c.id}/resumen`);
  const maximo = Math.max(1, ...votos.map((v) => v.votos));
  P.$('#grafica').innerHTML = votos.length ? votos.map((v) => `<div class="fila-g"><span class="nombre">${P.esc(v.colonia)}</span>
      <div class="fondo-g"><span style="width:${(v.votos / maximo) * 100}%"></span></div><b>${v.votos}</b></div>`).join('')
    : '<p class="tenue">Todavía no hay votos en este ciclo.</p>';
  P.$('#totales').textContent = `${totales.ideas} ideas · ${totales.proyectos} proyectos · ${totales.votos} votos · ${totales.ciudadanos} ciudadanos registrados`;
}

async function cargar(id) {
  ciclos = await P.get('/admin/ciclos');
  P.$('#ciclo').innerHTML = ciclos.map((c) => `<option value="${c.id}">${P.esc(c.nombre)} (${c.estado})</option>`).join('');
  if (id) P.$('#ciclo').value = id;
  await pintarCiclo();
}

async function hacer(accion) {
  const aviso = P.$('#mensaje');
  aviso.textContent = '';
  try {
    await accion();
  } catch (err) {
    P.mensaje(aviso, err.message);
  }
  await cargar(P.$('#ciclo').value);
}

(async () => {
  await P.pagina('Inicio');
  P.$('#ciclo').addEventListener('change', pintarCiclo);
  P.$('#activar').addEventListener('click', () => hacer(() => P.post(`/admin/ciclos/${elegido().id}/activar`)));
  P.$('#nuevo').addEventListener('click', () => P.$('#form').classList.toggle('oculto'));
  P.$('#estado').addEventListener('click', (e) => {
    if (e.target.id === 'siguiente') {
      const texto = elegido().fase_id === 5 ? '¿Cerrar la votación y calcular los ganadores?' : '¿Pasar a la siguiente fase?';
      if (confirm(texto)) hacer(() => P.post(`/admin/ciclos/${elegido().id}/siguiente-fase`));
    }
    if (e.target.id === 'cerrar' && confirm('¿Cerrar el ciclo? Ya no se podrá activar.')) hacer(() => P.post(`/admin/ciclos/${elegido().id}/cerrar`));
  });
  P.$('#form').anio.value = new Date().getFullYear();
  P.formulario(P.$('#form'), async (datos) => {
    const r = await P.post('/admin/ciclos', datos);
    P.$('#form').reset();
    P.$('#form').classList.add('oculto');
    await cargar(r.id);
  });
  await cargar();
})();
