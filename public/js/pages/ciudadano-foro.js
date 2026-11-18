'use strict';
let usuario;

function pintarIdea(i) {
  const comentarios = i.comentarios.map((c) => `<p><b>${P.esc(c.autor)}</b> ${P.esc(c.texto)} <span class="tenue">· ${P.fecha(c.creado_en)}</span></p>`).join('');
  return `<div class="idea">
    <div class="cabeza"><b class="avatar">${P.esc(P.iniciales(i.autor))}</b>
      <div><b>${P.esc(i.autor)}</b><div class="tenue">${P.esc(i.colonia)}${i.id_colonia === usuario.id_colonia ? ' (tu colonia)' : ''} · ${P.fecha(i.creada_en)}</div></div>
      <span class="etq" style="margin-left:auto">${P.esc(i.rubro)}</span></div>
    <p>${P.esc(i.texto)}</p>
    <button class="btn2 ${i.yo_apoyo ? 'activo' : ''}" data-apoyo="${i.id_idea}">${i.yo_apoyo ? '✓ Apoyaste' : 'Apoyar'} · ${i.apoyos}</button>
    <div class="comentarios">${comentarios}
      <form data-comentar="${i.id_idea}"><input name="texto" maxlength="250" placeholder="Escribe un comentario" required><button class="btn2">Comentar</button></form>
    </div>
  </div>`;
}

async function cargar() {
  const filtro = `?colonia=${P.$('#filtro-colonia').value}&rubro=${P.$('#filtro-rubro').value}`;
  const { ciclo, ideas } = await P.get('/foro' + filtro);
  P.$('#nueva').classList.toggle('oculto', !ciclo || ciclo.id_fase !== 2);
  P.$('#ideas').innerHTML = ideas.length ? ideas.map(pintarIdea).join('')
    : '<p class="tenue">Todavía no hay ideas. ¡Publica la primera!</p>';
}

(async () => {
  usuario = await P.pagina('Foro');
  P.$('#titulo').textContent = `Foro vecinal · ${usuario.alcaldia}`;
  const { colonias, rubros } = await P.get('/catalogos');
  P.$('#filtro-colonia').innerHTML += colonias.filter((c) => c.id_alcaldia === usuario.id_alcaldia)
    .map((c) => `<option value="${c.id_colonia}">${P.esc(c.nombre)}</option>`).join('');
  const opcionesRubro = rubros.map((r) => `<option value="${r.id_rubro}">${P.esc(r.nombre)}</option>`).join('');
  P.$('#filtro-rubro').innerHTML += opcionesRubro;
  P.$('#rubro').innerHTML = opcionesRubro;
  P.$('#filtro-colonia').addEventListener('change', cargar);
  P.$('#filtro-rubro').addEventListener('change', cargar);
  P.$('#nueva').addEventListener('click', () => P.$('#form').classList.toggle('oculto'));

  P.formulario(P.$('#form'), async (datos) => {
    await P.post('/ideas', datos);
    P.$('#form').reset();
    P.$('#form').classList.add('oculto');
    await cargar();
  });

  P.$('#ideas').addEventListener('click', async (e) => {
    const boton = e.target.closest('[data-apoyo]');
    if (!boton) return;
    await P.post(`/ideas/${boton.dataset.apoyo}/apoyo`);
    await cargar();
  });

  P.$('#ideas').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    try {
      await P.post(`/ideas/${form.dataset.comentar}/comentarios`, { texto: form.texto.value });
      await cargar();
    } catch (err) {
      alert(err.message);
    }
  });

  await cargar();
})();
