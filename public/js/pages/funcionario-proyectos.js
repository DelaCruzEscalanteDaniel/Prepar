'use strict';
let proyectos = [];
let fase = 0;
let mapa = null;
let marcador = null;

async function cargar() {
  const datos = await P.get('/func/proyectos');
  proyectos = datos.proyectos;
  fase = datos.ciclo ? datos.ciclo.id_fase : 0;
  P.$('#ayuda').textContent = fase === 3 ? 'Estamos en la fase de Dictaminación: revisa los proyectos registrados.'
    : 'Los dictámenes se hacen en la fase 3: Dictaminación.';
  const filtro = P.$('#filtro').value;
  const visibles = proyectos.filter((p) => !filtro || p.estatus === filtro);
  P.$('#lista').innerHTML = visibles.length ? visibles.map((p) => `<tr>
      <td><b>${P.esc(p.titulo)}</b>${p.latitud === null ? ` ${P.sinUbicacion}` : ''}<br><span class="tenue">${P.esc(p.rubro)} · ${P.esc(p.proponente)}</span>
        ${p.justificacion ? `<br><span class="tenue">Dictamen: ${p.motivo ? `${P.esc(P.motivos[p.motivo])}. ` : ''}${P.esc(p.justificacion)}</span>` : ''}</td>
      <td>${P.esc(p.colonia)}</td><td class="num">${P.pesos(p.costo)}</td><td>${P.etiqueta(p.estatus)}</td>
      <td>${p.estatus === 'registrado' && fase === 3 ? `<button class="btn" data-id="${p.id_proyecto}">Dictaminar</button>` : ''}</td></tr>`).join('')
    : '<tr><td colspan="5" class="tenue">No hay proyectos con ese estatus.</td></tr>';
}

(async () => {
  await P.pagina('Proyectos');
  P.$('#filtro').addEventListener('change', cargar);
  const form = P.$('#form');
  P.$('#lista').addEventListener('click', (e) => {
    const boton = e.target.closest('[data-id]');
    if (!boton) return;
    const p = proyectos.find((x) => x.id_proyecto === Number(boton.dataset.id));
    form.reset();
    P.$('#campo-motivo').classList.add('oculto');
    P.$('#motivo').required = false;
    form.dataset.id = p.id_proyecto;
    P.$('#form-titulo').textContent = `Dictamen · ${p.titulo}`;
    P.$('#form-detalle').innerHTML = `${P.esc(p.descripcion)}<br><span class="tenue">${P.esc(p.calle)} ${P.esc(p.numero || '')}, ${P.esc(p.colonia)} · Costo ${P.pesos(p.costo)} · Presupuesto de la colonia ${P.pesos(p.presupuesto)}</span>`
      + (p.id_imagen ? `<br><img src="/api/imagenes/${p.id_imagen}" alt="" style="max-height:180px;margin-top:8px;border-radius:6px">` : '');
    form.classList.remove('oculto');
    const conUbicacion = p.latitud !== null && p.longitud !== null;
    P.$('#mapa-dictamen').classList.toggle('oculto', !conUbicacion);
    P.$('#sin-ubicacion').classList.toggle('oculto', conUbicacion);
    if (conUbicacion) {
      if (!mapa) mapa = P.mapa('mapa-dictamen', p.latitud, p.longitud, 16);
      else mapa.setView([p.latitud, p.longitud], 16);
      mapa.invalidateSize();
      if (marcador) marcador.setLatLng([p.latitud, p.longitud]);
      else marcador = L.circleMarker([p.latitud, p.longitud], { radius: 9, color: '#1F5FD1', fillOpacity: 0.8 }).addTo(mapa);
    }
    form.scrollIntoView({ behavior: 'smooth' });
  });
  P.$('#motivo').innerHTML = '<option value="">Elige un motivo</option>'
    + Object.entries(P.motivos).map(([clave, texto]) => `<option value="${clave}">${P.esc(texto)}</option>`).join('');
  form.addEventListener('change', (e) => {
    if (e.target.name !== 'resultado') return;
    const noViable = e.target.value === 'no_viable';
    P.$('#campo-motivo').classList.toggle('oculto', !noViable);
    P.$('#motivo').required = noViable;
    if (!noViable) P.$('#motivo').value = '';
  });
  P.$('#cancelar').addEventListener('click', () => form.classList.add('oculto'));
  P.formulario(form, async (datos) => {
    await P.post(`/func/proyectos/${form.dataset.id}/dictamen`, datos);
    form.reset();
    P.$('#campo-motivo').classList.add('oculto');
    P.$('#motivo').required = false;
    form.classList.add('oculto');
    await cargar();
  });
  await cargar();
})();
