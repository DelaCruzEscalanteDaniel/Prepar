'use strict';
const OBRA = ['ganador', 'en_ejecucion', 'concluido', 'inejecutable'];
let proyectos = [];
let capa;
let usuario;

function pintarDetalle(p) {
  const enlace = usuario.rol === 'ciudadano' ? `/ciudadano/fotos.html#obra-${p.id_proyecto}` : `/funcionario/obras.html#obra-${p.id_proyecto}`;
  P.$('#detalle').innerHTML = `<p style="margin:0">${P.etiqueta(p.estatus)} <span class="tenue">${P.esc(p.rubro)}</span></p>
    <h2 style="margin:10px 0 2px">${P.esc(p.titulo)}</h2><p class="tenue" style="margin:0 0 14px">${P.esc(p.colonia)}</p>
    <table><tr><td>Costo</td><td class="num"><b>${P.pesos(p.costo)}</b></td></tr>
    <tr><td>Gastado</td><td class="num"><b>${P.pesos(p.gastado)}</b></td></tr>
    <tr><td>Avance</td><td class="num"><b>${p.avance} %</b></td></tr></table>
    <div class="barra-av" style="margin:12px 0 16px"><span style="width:${p.avance}%"></span></div>
    ${OBRA.includes(p.estatus) ? `<a class="btn2" href="${enlace}">Ver la obra</a>` : ''}`;
}

function pintar() {
  const colonia = Number(P.$('#filtro-colonia').value) || 0;
  const rubro = Number(P.$('#filtro-rubro').value) || 0;
  capa.clearLayers();
  proyectos.filter((p) => (!colonia || p.id_colonia === colonia) && (!rubro || p.id_rubro === rubro)).forEach((p) => {
    L.circleMarker([p.latitud, p.longitud], { radius: 11, color: '#fff', weight: 3, fillColor: p.color, fillOpacity: 1 })
      .addTo(capa).bindTooltip(p.titulo).on('click', () => pintarDetalle(p));
  });
}

(async () => {
  usuario = await P.pagina('Mapa');
  const { colonias, rubros, alcaldias } = await P.get('/catalogos');
  proyectos = (await P.get(usuario.rol === 'ciudadano' ? '/mapa' : '/func/mapa')).proyectos;
  const alcaldia = alcaldias.find((a) => a.id_alcaldia === usuario.id_alcaldia) || {};
  P.$('#subtitulo').textContent = `${usuario.alcaldia} · toca un punto para ver el proyecto.`;
  P.$('#filtro-colonia').innerHTML += colonias.filter((c) => c.id_alcaldia === usuario.id_alcaldia)
    .map((c) => `<option value="${c.id_colonia}">${P.esc(c.nombre)}</option>`).join('');
  P.$('#filtro-rubro').innerHTML += rubros.map((r) => `<option value="${r.id_rubro}">${P.esc(r.nombre)}</option>`).join('');
  P.$('#leyenda').innerHTML = rubros.map((r) => `<span class="punto" style="background:${r.color}"></span>${P.esc(r.nombre)}`).join(' &nbsp; ');
  const propia = colonias.find((c) => c.id_colonia === usuario.id_colonia) || colonias.find((c) => c.id_alcaldia === usuario.id_alcaldia) || alcaldia;
  const mapa = P.mapa('mapa', propia.latitud, propia.longitud, 14);
  capa = L.layerGroup().addTo(mapa);
  P.$('#filtro-colonia').addEventListener('change', pintar);
  P.$('#filtro-rubro').addEventListener('change', pintar);
  pintar();
  if (!proyectos.length) P.$('#detalle').innerHTML = '<p class="tenue" style="margin:0">Todavía no hay proyectos registrados en tu alcaldía.</p>';
})();
