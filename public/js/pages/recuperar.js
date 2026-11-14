'use strict';
P.formulario(P.$('#form'), async (datos) => (await P.post('/recuperar', datos)).mensaje);
