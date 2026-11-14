'use strict';

async function verLista() {
  P.$('#vista-obra').classList.add('oculto');
  P.$('#vista-lista').classList.remove('oculto');
  const { obras } = await P.get('/func/obras');
  P.$('#obras').innerHTML = obras.length ? obras.map((o) => `<tr>
      <td><b>${P.esc(o.titulo)}</b></td><td>${P.esc(o.colonia)}</td>
      <td><div class="barra-av"><span style="width:${o.avance}%"></span></div><span class="tenue">${o.avance} %</span></td>
      <td>${P.estatus(o.estatus)}</td><td><a class="btn2" href="#obra-${o.id}">Abrir</a></td></tr>`).join('')
    : '<tr><td colspan="5" class="tenue">Todavía no hay obras. Aparecen cuando hay proyectos ganadores.</td></tr>';
}

async function verObra(id) {
  const o = await P.get(`/func/obras/${id}`);
  const abierta = o.estatus === 'ganador' || o.estatus === 'en_ejecucion';
  P.$('#vista-lista').classList.add('oculto');
  P.$('#vista-obra').classList.remove('oculto');
  P.$('#obra-titulo').textContent = o.titulo;
  P.$('#obra-datos').textContent = `${o.colonia} · ${P.estatus(o.estatus)} · Avance ${o.avance} %`
    + (o.motivo_inejecutable ? ` · Motivo: ${o.motivo_inejecutable}` : '');
  const siguiente = o.pasos.find((p) => !p.fecha);
  P.$('#obra-pasos').innerHTML = o.pasos.map((p) => `<tr>
      <td>${p.fecha ? '✅' : '⬜'} ${p === siguiente ? `<b>${P.esc(p.nombre)}</b>` : P.esc(p.nombre)}
        ${p.que_se_hizo ? `<br><span class="tenue">${P.esc(p.que_se_hizo)}</span>` : ''}</td>
      <td class="tenue">${p.fecha ? P.fecha(p.fecha) : `${p.porcentaje} %`}</td></tr>`).join('');
  P.$('#form-paso').classList.toggle('oculto', !abierta || !siguiente);
  if (siguiente) P.$('#paso-nombre').firstChild.textContent = `¿Qué se hizo en «${siguiente.nombre}»?`;

  const resta = o.costo - o.gastado;
  P.$('#dinero').innerHTML = `Gastado <b>${P.pesos(o.gastado)}</b> de <b>${P.pesos(o.costo)}</b> · Quedan ${P.pesos(resta)}`;
  P.$('#dinero-barra').style.width = `${Math.min(100, (o.gastado / o.costo) * 100)}%`;
  P.$('#form-gasto').classList.toggle('oculto', !abierta);
  P.$('#form-gasto').monto.max = resta.toFixed(2);
  P.$('#form-gasto').dataset.resta = resta;
  P.$('#gastos').innerHTML = o.gastos.map((g) => `<tr><td>${P.esc(g.concepto)}</td><td>${P.pesos(g.monto)}</td><td class="tenue">${P.fecha(g.fecha)}</td></tr>`).join('');
  P.$('#form-inejecutable').classList.toggle('oculto', !abierta);

  P.$('#obra-fotos').innerHTML = o.fotos.length ? o.fotos.map((f) => `<div class="foto">
      <img src="/api/imagenes/${f.imagen_id}" alt="">
      <div><b>${P.esc(f.autor)}</b> <span class="tenue">· ${P.fecha(f.fecha)}</span><p>${P.esc(f.comentario)}</p>
      <button class="peligro" data-foto="${f.id}">Borrar</button></div></div>`).join('')
    : '<p class="tenue">Todavía no hay fotos de esta obra.</p>';
}

const obraActual = () => (/^#obra-(\d+)$/.exec(location.hash) || [])[1];

function segunDireccion() {
  if (obraActual()) verObra(obraActual()).catch((e) => { alert(e.message); location.hash = ''; });
  else verLista();
}

(async () => {
  await P.pagina('Obras');
  P.formulario(P.$('#form-paso'), async (datos) => {
    await P.post(`/func/obras/${obraActual()}/pasos`, datos);
    P.$('#form-paso').reset();
    await verObra(obraActual());
  });
  P.formulario(P.$('#form-gasto'), async (datos) => {
    if (Number(datos.monto) > Number(P.$('#form-gasto').dataset.resta)) {
      throw new Error(`No puedes registrar más de ${P.pesos(P.$('#form-gasto').dataset.resta)}, lo que queda del costo aprobado`);
    }
    await P.post(`/func/obras/${obraActual()}/gastos`, datos);
    P.$('#form-gasto').reset();
    await verObra(obraActual());
  });
  P.formulario(P.$('#form-inejecutable'), async (datos) => {
    if (!confirm('¿Seguro? La obra quedará cerrada como inejecutable.')) return '';
    await P.post(`/func/obras/${obraActual()}/inejecutable`, datos);
    await verObra(obraActual());
    return '';
  });
  P.$('#obra-fotos').addEventListener('click', async (e) => {
    const boton = e.target.closest('[data-foto]');
    if (!boton || !confirm('¿Borrar esta foto?')) return;
    await P.del(`/func/fotos/${boton.dataset.foto}`);
    await verObra(obraActual());
  });
  window.addEventListener('hashchange', segunDireccion);
  segunDireccion();
})();
