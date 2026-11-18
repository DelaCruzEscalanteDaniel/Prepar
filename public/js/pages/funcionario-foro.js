'use strict';
async function cargar() {
  const { ideas } = await P.get(`/func/foro?colonia=${P.$('#filtro-colonia').value}`);
  const filas = [];
  for (const i of ideas) {
    filas.push(`<tr><td><span class="etq fase">Idea</span> ${P.esc(i.texto)}</td><td>${P.esc(i.colonia)}</td><td>${P.esc(i.autor)}</td>
      <td class="tenue">${P.fecha(i.creada_en)}</td><td><button class="peligro" data-idea="${i.id_idea}">Borrar</button></td></tr>`);
    for (const c of i.comentarios) {
      filas.push(`<tr><td style="padding-left:34px"><span class="etq">Comentario</span> ${P.esc(c.texto)}</td><td>${P.esc(i.colonia)}</td><td>${P.esc(c.autor)}</td>
        <td class="tenue">${P.fecha(c.creado_en)}</td><td><button class="peligro" data-comentario="${c.id_comentario}">Borrar</button></td></tr>`);
    }
  }
  P.$('#lista').innerHTML = filas.join('') || '<tr><td colspan="5" class="tenue">Todavía no hay publicaciones en el foro de tu alcaldía.</td></tr>';
}

(async () => {
  const u = await P.pagina('Foro');
  const { colonias } = await P.get('/catalogos');
  P.$('#filtro-colonia').innerHTML += colonias.filter((c) => c.id_alcaldia === u.id_alcaldia).map((c) => `<option value="${c.id_colonia}">${P.esc(c.nombre)}</option>`).join('');
  P.$('#filtro-colonia').addEventListener('change', cargar);
  P.$('#lista').addEventListener('click', async (e) => {
    const idea = e.target.closest('[data-idea]');
    const comentario = e.target.closest('[data-comentario]');
    if (idea && confirm('¿Borrar esta idea y sus comentarios?')) await P.del(`/func/ideas/${idea.dataset.idea}`);
    else if (comentario && confirm('¿Borrar este comentario?')) await P.del(`/func/comentarios/${comentario.dataset.comentario}`);
    else return;
    await cargar();
  });
  await cargar();
})();
