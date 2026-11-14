'use strict';
let proyectos = [];
let capa;

function pintarDetalle(p) {
  P.$('#detalle').innerHTML = `<p class="tenue" style="margin:0">${P.esc(p.rubro)} · ${P.estatus(p.estatus)}</p>
    <h2 style="margin:4px 0 2px">${P.esc(p.titulo)}</h2><p class="tenue" style="margin:0 0 14px">${P.esc(p.colonia)}</p>
    <table><tr><td>Costo</td><td><b>${P.pesos(p.costo)}</b></td></tr>
    <tr><td>Gastado</td><td><b>${P.pesos(p.gastado)}</b></td></tr>
    <tr><td>Avance</td><td><b>${p.avance} %</b></td></tr></table>
    ${['ganador', 'en_ejecucion', 'concluido', 'inejecutable'].includes(p.estatus) ? `<p style="margin:14px 0 0"><a class="btn2" href="/ciudadano/fotos.html#obra-${p.id}">Ver fotos de la obra</a></p>` : ''}`;
}

function pintar() {
  const colonia = Number(P.$('#filtro-colonia').value) || 0;
  const rubro = Number(P.$('#filtro-rubro').value) || 0;
  capa.clearLayers();
  proyectos.filter((p) => (!colonia || p.colonia_id === colonia) && (!rubro || p.rubro_id === rubro)).forEach((p) => {
    L.circleMarker([p.latitud, p.longitud], { radius: 10, color: '#fff', weight: 3, fillColor: p.color, fillOpacity: 1 })
      .addTo(capa).bindTooltip(p.titulo).on('click', () => pintarDetalle(p));
  });
}

(async () => {
  const u = await P.pagina('Mapa');
  const { colonias, rubros, alcaldias } = await P.get('/catalogos');
  const datos = await P.get('/mapa');
  proyectos = datos.proyectos;
  const alcaldia = alcaldias.find((a) => a.id === u.alcaldia_id) || {};
  P.$('#subtitulo').textContent = `${u.alcaldia} · toca un punto para ver el proyecto`;
  P.$('#filtro-colonia').innerHTML += colonias.filter((c) => c.alcaldia_id === u.alcaldia_id)
    .map((c) => `<option value="${c.id}">${P.esc(c.nombre)}</option>`).join('');
  P.$('#filtro-rubro').innerHTML += rubros.map((r) => `<option value="${r.id}">${P.esc(r.nombre)}</option>`).join('');
  P.$('#leyenda').innerHTML = rubros.map((r) => `<span class="punto" style="background:${r.color}"></span>${P.esc(r.nombre)}`).join(' &nbsp; ');
  const propia = colonias.find((c) => c.id === u.colonia_id);
  const mapa = P.mapa('mapa', propia ? propia.latitud : alcaldia.latitud, propia ? propia.longitud : alcaldia.longitud, 14);
  capa = L.layerGroup().addTo(mapa);
  P.$('#filtro-colonia').addEventListener('change', pintar);
  P.$('#filtro-rubro').addEventListener('change', pintar);
  pintar();
  if (!proyectos.length) P.$('#detalle').innerHTML = '<p class="tenue" style="margin:0">Todavía no hay proyectos registrados en tu alcaldía.</p>';
})();
