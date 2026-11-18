'use strict';
let ciclos = [];
let editando = null;
const form = P.$('#form');

function sumarDias(fecha, dias) {
  const d = new Date(`${fecha}T12:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function fechasSugeridas() {
  const duracion = [7, 21, 14, 7, 7, 3, 90, 14];
  let inicio = new Date().toISOString().slice(0, 10);
  duracion.forEach((dias, i) => {
    form[`inicio_${i + 1}`].value = inicio;
    form[`fin_${i + 1}`].value = sumarDias(inicio, dias - 1);
    inicio = sumarDias(inicio, dias);
  });
}

async function cargar() {
  ciclos = await P.get('/admin/ciclos');
  P.$('#lista').innerHTML = ciclos.map((c) => `<tr><td><b>${P.esc(c.nombre)}</b></td><td>${c.anio}</td><td class="num">${P.pesos(c.presupuesto_total)}</td>
    <td>${c.id_fase}. ${P.esc(c.fase)}</td><td><span class="etq ${c.estado}">${P.esc(c.estado)}</span></td>
    <td>${c.estado === 'cerrado' ? '' : `<button class="btn2" data-id="${c.id_ciclo}">Cambiar fechas</button>`}</td></tr>`).join('');
}

function modoNuevo() {
  editando = null;
  form.reset();
  P.$('#form-titulo').textContent = 'Nuevo ciclo';
  P.$('#guardar').textContent = 'Crear ciclo';
  P.$('#cancelar').classList.add('oculto');
  ['nombre', 'anio', 'presupuesto'].forEach((n) => { form[n].disabled = false; });
  P.$('#bloque-alcaldias').classList.remove('oculto');
  P.$('#alcaldias').querySelectorAll('input').forEach((i) => { i.checked = true; });
  form.anio.value = new Date().getFullYear() + 1;
  fechasSugeridas();
}

async function modoEditar(id) {
  const c = ciclos.find((x) => x.id_ciclo === id);
  const { fases } = await P.get(`/admin/ciclos/${id}/resumen`);
  editando = id;
  P.$('#form-titulo').textContent = `Cambiar fechas · ${c.nombre}`;
  P.$('#guardar').textContent = 'Guardar fechas';
  P.$('#cancelar').classList.remove('oculto');
  form.nombre.value = c.nombre;
  form.anio.value = c.anio;
  form.presupuesto.value = c.presupuesto_total;
  ['nombre', 'anio', 'presupuesto'].forEach((n) => { form[n].disabled = true; });
  P.$('#bloque-alcaldias').classList.add('oculto');
  fases.forEach((f) => { form[`inicio_${f.id_fase}`].value = f.fecha_inicio; form[`fin_${f.id_fase}`].value = f.fecha_fin; });
  form.scrollIntoView({ behavior: 'smooth' });
}

(async () => {
  await P.pagina('Ciclos');
  const { alcaldias } = await P.get('/catalogos');
  P.$('#alcaldias').innerHTML = alcaldias.map((a) => `<label><input type="checkbox" name="alcaldia" value="${a.id_alcaldia}" checked>${P.esc(a.nombre)}</label>`).join('');
  P.$('#lista').addEventListener('click', (e) => { if (e.target.dataset.id) modoEditar(Number(e.target.dataset.id)); });
  P.$('#cancelar').addEventListener('click', modoNuevo);
  P.formulario(form, async (datos) => {
    const fechas = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id_fase: n, fecha_inicio: datos[`inicio_${n}`], fecha_fin: datos[`fin_${n}`] }));
    if (editando) {
      await P.put(`/admin/ciclos/${editando}/fechas`, { fechas });
      await cargar();
      return 'Las fechas se guardaron';
    }
    const alcaldiasElegidas = [...form.querySelectorAll('input[name=alcaldia]:checked')].map((i) => Number(i.value));
    await P.post('/admin/ciclos', { nombre: datos.nombre, anio: datos.anio, presupuesto: datos.presupuesto, alcaldias: alcaldiasElegidas, fechas });
    await cargar();
    modoNuevo();
    return 'El ciclo se creó. Actívalo desde Inicio cuando quieras empezar.';
  });
  modoNuevo();
  await cargar();
})();
