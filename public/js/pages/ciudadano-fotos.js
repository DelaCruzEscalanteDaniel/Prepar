'use strict';

function barra(avance) {
  return `<div class="barra-av"><span style="width:${avance}%"></span></div>`;
}

async function verLista() {
  P.$('#vista-obra').classList.add('oculto');
  P.$('#vista-lista').classList.remove('oculto');
  const { obras } = await P.get('/obras');
  P.$('#obras').innerHTML = obras.length ? obras.map((o) => `<tr>
      <td><b>${P.esc(o.titulo)}</b></td><td>${P.esc(o.colonia)}</td>
      <td>${barra(o.avance)}<span class="tenue">${o.avance} % · ${P.estatus(o.estatus)}</span></td>
      <td>${o.fotos}</td><td><a class="btn2" href="#obra-${o.id}">Ver</a></td></tr>`).join('')
    : '<tr><td colspan="5" class="tenue">Todavía no hay obras. Las obras aparecen cuando hay proyectos ganadores.</td></tr>';
}

async function verObra(id) {
  const o = await P.get(`/obras/${id}`);
  P.$('#vista-lista').classList.add('oculto');
  P.$('#vista-obra').classList.remove('oculto');
  P.$('#obra-titulo').textContent = o.titulo;
  P.$('#obra-datos').textContent = `${o.colonia} · Avance ${o.avance} % · ${P.estatus(o.estatus)} · Gastado ${P.pesos(o.gastado)} de ${P.pesos(o.costo)}`;
  P.$('#obra-pasos').innerHTML = o.pasos.map((p) => `<tr><td>${p.fecha ? '✅' : '⬜'} ${P.esc(p.nombre)}</td>
    <td class="tenue">${p.fecha ? P.fecha(p.fecha) : ''}</td></tr>`).join('');
  P.$('#obra-fotos').innerHTML = o.fotos.length ? o.fotos.map((f) => `<div class="foto">
      <img src="/api/imagenes/${f.imagen_id}" alt="Foto de ${P.esc(f.autor)}">
      <div><b>${P.esc(f.autor)}</b> <span class="tenue">· ${P.fecha(f.fecha)}</span><p>${P.esc(f.comentario)}</p></div></div>`).join('')
    : '<p class="tenue">Todavía no hay fotos de esta obra.</p>';
  P.$('#form').dataset.obra = id;
}

function segunDireccion() {
  const m = /^#obra-(\d+)$/.exec(location.hash);
  if (m) verObra(m[1]).catch((e) => { alert(e.message); location.hash = ''; });
  else verLista();
}

(async () => {
  await P.pagina('Foto denuncia');
  const form = P.$('#form');
  P.formulario(form, async (datos) => {
    const foto = await P.leerFoto(form.foto.files[0]);
    await P.post(`/obras/${form.dataset.obra}/fotos`, { comentario: datos.comentario, foto });
    form.reset();
    await verObra(form.dataset.obra);
    return 'Tu foto se publicó';
  });
  window.addEventListener('hashchange', segunDireccion);
  segunDireccion();
})();
