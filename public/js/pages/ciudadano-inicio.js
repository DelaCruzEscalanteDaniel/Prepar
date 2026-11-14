'use strict';
const ACCIONES = {
  2: ['Publica ideas en el foro y registra tu proyecto.', '/ciudadano/proyectos.html', 'Registrar proyecto'],
  3: ['La alcaldía está revisando los proyectos. Revisa el dictamen del tuyo.', '/ciudadano/proyectos.html', 'Ver mis proyectos'],
  4: ['Se está sorteando el orden de los proyectos en la boleta.', '/ciudadano/votacion.html', 'Ver la boleta'],
  5: ['Ya puedes votar por un proyecto de tu colonia.', '/ciudadano/votacion.html', 'Ir a votar'],
  6: ['Ya se conocen los proyectos ganadores.', '/ciudadano/mapa.html', 'Ver el mapa'],
  7: ['Las obras están en marcha. Sube fotos de cómo van.', '/ciudadano/fotos.html', 'Foto denuncia'],
  8: ['Revisa cómo quedaron las obras y cuánto se gastó.', '/ciudadano/fotos.html', 'Ver las obras'],
};

(async () => {
  const u = await P.pagina('Inicio');
  const { ciclo, fases } = await P.get('/ciclo');
  P.$('#saludo').textContent = `Hola, ${u.nombre.split(' ')[0]}`;
  P.$('#colonia').textContent = `${u.colonia}, ${u.alcaldia}`;
  if (!ciclo) {
    P.$('#aviso').textContent = 'Por ahora no hay un ciclo activo.';
    return;
  }
  const accion = ACCIONES[ciclo.fase_id];
  P.$('#aviso').innerHTML = `<b>${P.esc(ciclo.nombre)} · Fase ${ciclo.fase_id} de 8: ${P.esc(ciclo.fase)}.</b> `
    + (accion ? `${accion[0]} <a class="btn" style="margin-left:8px" href="${accion[1]}">${accion[2]}</a>` : P.esc(ciclo.descripcion));
  P.$('#presupuesto').textContent = P.pesos(ciclo.presupuesto_colonia);
  P.$('#fases').innerHTML = fases.map((f) => {
    const clase = f.id < ciclo.fase_id ? 'hecha' : f.id === ciclo.fase_id ? 'actual' : '';
    return `<li class="${clase}">${P.esc(f.nombre)}${f.id === ciclo.fase_id ? ' (fase actual)' : ''}</li>`;
  }).join('');
})();
