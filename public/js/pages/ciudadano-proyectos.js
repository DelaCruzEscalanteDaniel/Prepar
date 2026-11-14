'use strict';
let punto = null;

async function cargar() {
  const { ciclo, proyectos } = await P.get('/mis-proyectos');
  P.$('#lista').innerHTML = proyectos.length ? proyectos.map((p) => `<tr>
      <td><b>${P.esc(p.titulo)}</b></td><td>${P.esc(p.rubro)}</td><td>${P.pesos(p.costo)}</td>
      <td>${P.estatus(p.estatus)}</td><td class="tenue">${P.esc(p.justificacion || 'Pendiente')}</td></tr>`).join('')
    : '<tr><td colspan="5" class="tenue">Todavía no registras proyectos en este ciclo.</td></tr>';
  return ciclo;
}

(async () => {
  const u = await P.pagina('Proyectos');
  const ciclo = await cargar();
  if (!ciclo || ciclo.fase_id !== 2) {
    P.$('#form').classList.add('oculto');
    P.$('#cerrado').classList.remove('oculto');
    P.$('#cerrado').textContent = 'Los proyectos solo se registran en la fase 2: Diagnóstico y registro.';
    return;
  }
  const { rubros, colonias } = await P.get('/catalogos');
  const { ciclo: c } = await P.get('/ciclo');
  P.$('#rubro').innerHTML = rubros.map((r) => `<option value="${r.id}">${P.esc(r.nombre)}</option>`).join('');
  P.$('#tope').textContent = `El costo no puede pasar de ${P.pesos(c.presupuesto_colonia)}, el presupuesto de tu colonia.`;

  const colonia = colonias.find((x) => x.id === u.colonia_id);
  const mapa = P.mapa('mapa', colonia.latitud, colonia.longitud, 15);
  let marcador = null;
  mapa.on('click', (e) => {
    punto = e.latlng;
    if (marcador) marcador.setLatLng(punto);
    else marcador = L.circleMarker(punto, { radius: 9, color: '#1F5FD1', fillOpacity: 0.8 }).addTo(mapa);
  });

  const form = P.$('#form');
  P.formulario(form, async (datos) => {
    const foto = await P.leerFoto(form.foto.files[0]);
    await P.post('/proyectos', {
      ...datos, foto,
      latitud: punto ? punto.lat : colonia.latitud,
      longitud: punto ? punto.lng : colonia.longitud,
    });
    form.reset();
    await cargar();
    return 'Tu proyecto se registró. La alcaldía lo revisará en la fase de Dictaminación.';
  });
})();
