'use strict';
const TAREAS = {
  1: ['Revisa las fechas del ciclo. Pronto empieza el registro de proyectos.', '', ''],
  2: ['Los vecinos están registrando proyectos. Revisa que el foro se mantenga en orden.', '/funcionario/foro.html', 'Moderar el foro'],
  3: ['Revisa cada proyecto y di si es viable o no viable.', '/funcionario/proyectos.html', 'Dictaminar proyectos'],
  4: ['Haz el sorteo de la boleta de cada colonia.', '/funcionario/sorteo.html', 'Ir al sorteo'],
  5: ['Los vecinos están votando.', '/funcionario/sorteo.html', 'Ver las boletas'],
  6: ['Ya se conocen los ganadores. Pronto empiezan las obras.', '/funcionario/obras.html', 'Ver las obras'],
  7: ['Registra los pasos y el dinero de cada obra.', '/funcionario/obras.html', 'Ir a las obras'],
  8: ['Revisa cómo quedaron las obras.', '/funcionario/obras.html', 'Ver las obras'],
};

(async () => {
  const u = await P.pagina('Inicio');
  P.$('#saludo').textContent = `Hola, ${u.nombre.split(' ')[0]}`;
  const [{ ciclo, conteo }, { fases }] = await Promise.all([P.get('/func/resumen'), P.get('/ciclo')]);
  if (!ciclo) { P.$('#aviso').textContent = 'Por ahora no hay un ciclo activo.'; return; }
  P.$('#ciclo-nombre').textContent = `${ciclo.nombre} · Alcaldía ${u.alcaldia}`;
  P.$('#fase-etq').textContent = `Fase ${ciclo.fase_id} de 8 · ${ciclo.fase}`;
  const [texto, url, boton] = TAREAS[ciclo.fase_id];
  P.$('#aviso').innerHTML = `<div><b>Qué toca hacer ahora</b>${P.esc(texto)}</div>${url ? `<a class="btn" href="${url}">${boton}</a>` : ''}`;
  const n = (e) => (conteo.find((c) => c.estatus === e) || { total: 0 }).total;
  const obras = n('ganador') + n('en_ejecucion') + n('concluido') + n('inejecutable');
  P.$('#conteo').innerHTML = [['Por dictaminar', n('registrado')], ['Viables', n('viable')], ['No viables', n('no_viable')], ['Obras', obras]]
    .map(([t, x]) => `<div class="caja dato-caja"><p class="tenue">${t}</p><div class="dato">${x}</div></div>`).join('');
  P.$('#fases').innerHTML = P.tablaFases(fases, ciclo.fase_id);
})();
