'use strict';
let proyectos = [];
let fase = 0;

async function cargar() {
  const datos = await P.get('/func/proyectos');
  proyectos = datos.proyectos;
  fase = datos.ciclo ? datos.ciclo.fase_id : 0;
  P.$('#ayuda').textContent = fase === 3 ? 'Estamos en la fase de Dictaminación: revisa los proyectos registrados.'
    : 'Los dictámenes se hacen en la fase 3: Dictaminación.';
  P.$('#lista').innerHTML = proyectos.length ? proyectos.map((p) => `<tr>
      <td><b>${P.esc(p.titulo)}</b><br><span class="tenue">${P.esc(p.rubro)} · ${P.esc(p.proponente)}</span>
        ${p.justificacion ? `<br><span class="tenue">Dictamen: ${P.esc(p.justificacion)}</span>` : ''}</td>
      <td>${P.esc(p.colonia)}</td><td>${P.pesos(p.costo)}</td><td>${P.estatus(p.estatus)}</td>
      <td>${p.estatus === 'registrado' && fase === 3 ? `<button class="btn2" data-id="${p.id}">Dictaminar</button>` : ''}</td></tr>`).join('')
    : '<tr><td colspan="5" class="tenue">Todavía no hay proyectos registrados en tu alcaldía.</td></tr>';
}

(async () => {
  await P.pagina('Proyectos');
  const form = P.$('#form');
  P.$('#lista').addEventListener('click', (e) => {
    const boton = e.target.closest('[data-id]');
    if (!boton) return;
    const p = proyectos.find((x) => x.id === Number(boton.dataset.id));
    form.dataset.id = p.id;
    P.$('#form-titulo').textContent = `Dictamen · ${p.titulo}`;
    P.$('#form-detalle').innerHTML = `${P.esc(p.descripcion)}<br><span class="tenue">${P.esc(p.calle)} ${P.esc(p.numero || '')}, ${P.esc(p.colonia)} · Costo ${P.pesos(p.costo)} · Presupuesto de la colonia ${P.pesos(p.presupuesto)}</span>`
      + (p.imagen_id ? `<br><img src="/api/imagenes/${p.imagen_id}" alt="" style="max-height:180px;margin-top:8px;border-radius:6px">` : '');
    form.classList.remove('oculto');
    form.scrollIntoView({ behavior: 'smooth' });
  });
  P.$('#cancelar').addEventListener('click', () => form.classList.add('oculto'));
  P.formulario(form, async (datos) => {
    await P.post(`/func/proyectos/${form.dataset.id}/dictamen`, datos);
    form.reset();
    form.classList.add('oculto');
    await cargar();
  });
  await cargar();
})();
