'use strict';
const TAREAS = {
  2: ['Los vecinos están registrando proyectos. Puedes revisar el foro.', '/funcionario/foro.html', 'Ir al foro'],
  3: ['Revisa cada proyecto y di si es viable o no viable.', '/funcionario/proyectos.html', 'Dictaminar proyectos'],
  4: ['Haz el sorteo de la boleta de cada colonia.', '/funcionario/sorteo.html', 'Ir al sorteo'],
  5: ['Los vecinos están votando.', '/funcionario/sorteo.html', 'Ver las boletas'],
  7: ['Registra los pasos y el dinero de cada obra.', '/funcionario/obras.html', 'Ir a las obras'],
  8: ['Revisa cómo quedaron las obras.', '/funcionario/obras.html', 'Ver las obras'],
};

(async () => {
  const u = await P.pagina('Inicio');
  P.$('#saludo').textContent = `Hola, ${u.nombre.split(' ')[0]}`;
  const [{ ciclo, conteo }, { fases }] = await Promise.all([P.get('/func/resumen'), P.get('/ciclo')]);
  if (!ciclo) { P.$('#aviso').textContent = 'Por ahora no hay un ciclo activo.'; return; }
  const tarea = TAREAS[ciclo.fase_id];
  P.$('#aviso').innerHTML = `<b>${P.esc(ciclo.nombre)} · Fase ${ciclo.fase_id} de 8: ${P.esc(ciclo.fase)}.</b> `
    + (tarea ? `${tarea[0]} <a class="btn" style="margin-left:8px" href="${tarea[1]}">${tarea[2]}</a>` : P.esc(ciclo.descripcion));
  P.$('#conteo').innerHTML = conteo.length ? conteo.map((c) => `<tr><td>${P.estatus(c.estatus)}</td><td><b>${c.total}</b></td></tr>`).join('')
    : '<tr><td class="tenue">Todavía no hay proyectos en tu alcaldía.</td></tr>';
  P.$('#fases').innerHTML = fases.map((f) => `<li class="${f.id < ciclo.fase_id ? 'hecha' : f.id === ciclo.fase_id ? 'actual' : ''}">${P.esc(f.nombre)}</li>`).join('');
})();
