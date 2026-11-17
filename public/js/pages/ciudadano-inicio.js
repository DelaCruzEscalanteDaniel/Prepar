'use strict';
const ACCIONES = {
  1: ['Revisa el presupuesto de tu colonia y las fechas del ciclo.', '', ''],
  2: ['Publica ideas en el foro y registra tu proyecto.', '/ciudadano/proyectos.html', 'Registrar proyecto'],
  3: ['La alcaldía está revisando los proyectos.', '/ciudadano/proyectos.html', 'Ver mis proyectos'],
  4: ['Se está sorteando el orden de los proyectos en la boleta.', '/ciudadano/votacion.html', 'Ver la boleta'],
  5: ['Ya puedes votar por un proyecto de tu colonia.', '/ciudadano/votacion.html', 'Ir a votar'],
  6: ['Ya se conocen los proyectos ganadores.', '/ciudadano/votacion.html', 'Ver resultados'],
  7: ['Las obras están en marcha. Sube fotos de cómo van.', '/ciudadano/fotos.html', 'Foto denuncia'],
  8: ['Revisa cómo quedaron las obras y cuánto se gastó.', '/ciudadano/fotos.html', 'Ver las obras'],
};

(async () => {
  const u = await P.pagina('Inicio');
  const { ciclo, fases, resumen } = await P.get('/ciclo');
  P.$('#saludo').textContent = `Hola, ${u.nombre.split(' ')[0]}`;
  P.$('#colonia').textContent = `${u.colonia}, ${u.alcaldia}`;
  if (!ciclo) { P.$('#aviso').textContent = 'Por ahora no hay un ciclo activo.'; return; }
  P.$('#ciclo-nombre').textContent = `${ciclo.nombre} · ${u.colonia}, ${u.alcaldia}`;
  P.$('#fase-etq').textContent = `Fase ${ciclo.fase_id} de 8 · ${ciclo.fase}`;
  const [texto, url, boton] = ACCIONES[ciclo.fase_id];
  const fase = fases.find((f) => f.id === ciclo.fase_id);
  const hasta = fase && fase.fecha_fin ? ` Esta fase termina el ${P.fecha(fase.fecha_fin)}.` : '';
  P.$('#aviso').innerHTML = `<div><b>${P.esc(ciclo.fase)}</b>${P.esc(texto + hasta)}</div>${url ? `<a class="btn" href="${url}">${boton}</a>` : ''}`;
  P.$('#presupuesto').textContent = P.pesos(ciclo.presupuesto_colonia);
  P.$('#ideas').textContent = resumen.ideas;
  P.$('#proyectos').textContent = resumen.proyectos;
  P.$('#proyectos-nota').textContent = resumen.mios ? `${resumen.mios} registrado(s) por ti` : 'Todavía no registras ninguno';
  P.$('#fases').innerHTML = P.tablaFases(fases, ciclo.fase_id);
})();
