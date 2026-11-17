'use strict';
let ciclos = [];

const elegido = () => ciclos.find((c) => c.id === Number(P.$('#ciclo').value));

async function pintarCiclo() {
  const c = elegido();
  if (!c) return;
  const { votos, totales, fases } = await P.get(`/admin/ciclos/${c.id}/resumen`);
  P.$('#c-nombre').innerHTML = `${P.esc(c.nombre)} <span class="etq ${c.estado}">${P.esc(c.estado)}</span>`;
  P.$('#c-datos').textContent = `Año ${c.anio} · Presupuesto ${P.pesos(c.presupuesto_total)} · Fase ${c.fase_id} de 8: ${c.fase}`;
  let acciones = '';
  if (c.estado === 'borrador') acciones = '<button class="btn2" id="activar">Activar este ciclo</button> ';
  if (c.estado === 'activo' && c.fase_id < 8) acciones += `<button class="btn" id="siguiente">Pasar a la fase ${c.fase_id + 1}</button>`;
  if (c.fase_id === 8 && c.estado !== 'cerrado') acciones += '<button class="btn" id="cerrar">Cerrar el ciclo</button>';
  P.$('#acciones').innerHTML = acciones;
  P.$('#fases').innerHTML = P.tablaFases(fases, c.fase_id);
  P.$('#totales').innerHTML = [['Ciudadanos registrados', totales.ciudadanos.toLocaleString('es-MX')], ['Ideas en el foro', totales.ideas.toLocaleString('es-MX')], ['Proyectos', totales.proyectos.toLocaleString('es-MX')],
    ['Participación', `${totales.votos.toLocaleString('es-MX')} votos · ${totales.participacion} %`]]
    .map(([t, n]) => `<div class="caja dato-caja"><p class="tenue">${t}</p><div class="dato" style="font-size:24px">${n}</div></div>`).join('');
  const maximo = Math.max(1, ...votos.map((v) => v.votos));
  P.$('#grafica').innerHTML = votos.length ? votos.map((v) => `<div class="fila-g"><span class="nombre">${P.esc(v.colonia)}<br><span class="tenue" style="font-size:12px">${P.esc(v.alcaldia)}</span></span>
      <div class="fondo-g"><span style="width:${(v.votos / maximo) * 100}%"></span></div><b>${v.votos}</b></div>`).join('')
    : '<p class="tenue">Todavía no hay votos en este ciclo.</p>';
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
  P.$('#acciones').addEventListener('click', (e) => {
    const c = elegido();
    if (e.target.id === 'activar') hacer(() => P.post(`/admin/ciclos/${c.id}/activar`));
    if (e.target.id === 'siguiente') {
      const texto = c.fase_id === 5 ? '¿Cerrar la votación y calcular los ganadores?' : `¿Pasar a la fase ${c.fase_id + 1}?`;
      if (confirm(texto)) hacer(() => P.post(`/admin/ciclos/${c.id}/siguiente-fase`));
    }
    if (e.target.id === 'cerrar' && confirm('¿Cerrar el ciclo? Ya no se podrá activar.')) hacer(() => P.post(`/admin/ciclos/${c.id}/cerrar`));
  });
  await cargar();
})();
