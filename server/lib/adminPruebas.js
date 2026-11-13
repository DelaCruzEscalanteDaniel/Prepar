'use strict';
const config = require('../config');
const db = require('../db');
const hash = require('./hash');
const v = require('./validar');
const log = require('./log');

const NOMBRE = 'Administrador de pruebas';

async function asegurar() {
  const correo = config.adminPruebas.correo;
  const pass = config.adminPruebas.password;
  if (!correo) return { motivo: 'sin configurar' };
  const u = await db.conSistema((c) => c.uno('SELECT id, rol, estado, password_hash FROM usuarios WHERE correo = ?', [correo]));
  if (u && u.rol !== 'administrador') {
    log.error(`ADMIN_PRUEBAS_CORREO (${correo}) ya pertenece a una cuenta que no es de administrador; no se cambió nada`);
    return { motivo: 'correo ocupado' };
  }
  if (!pass) {
    if (u && u.estado === 'activa') {
      await db.conSistema(async (c) => {
        await c.q("UPDATE usuarios SET estado = 'desactivada' WHERE id = ?", [u.id]);
        await c.q('UPDATE sesiones SET cerrada_en = NOW() WHERE usuario_id = ? AND cerrada_en IS NULL', [u.id]);
      });
      log.info(`Cuenta de administrador de pruebas desactivada: ${correo}`);
      return { desactivada: true };
    }
    return { motivo: 'sin contraseña' };
  }
  try {
    v.password(pass, 'ADMIN_PRUEBAS_PASSWORD');
    v.contrasenaSegura(pass, { correo, nombre: NOMBRE });
  } catch (e) {
    log.error(`ADMIN_PRUEBAS_PASSWORD no cumple las reglas de contraseña: ${e.message}`);
    return { motivo: 'contraseña no válida' };
  }
  if (!u) {
    const nuevoHash = await hash.hash(pass);
    await db.conSistema((c) => c.call('sp_crear_administrador', [NOMBRE, correo, nuevoHash]));
    log.info(`Cuenta de administrador de pruebas creada: ${correo}`);
    return { creada: true };
  }
  const cambios = [];
  if (!(await hash.comparar(pass, u.password_hash))) cambios.push(['password_hash = ?', await hash.hash(pass)]);
  if (u.estado !== 'activa') cambios.push(["estado = 'activa'", null]);
  if (!cambios.length) return { motivo: 'al día' };
  await db.conSistema((c) => c.q(`UPDATE usuarios SET ${cambios.map((x) => x[0]).join(', ')}, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?`,
    [...cambios.filter((x) => x[1] !== null).map((x) => x[1]), u.id]));
  log.info(`Cuenta de administrador de pruebas actualizada: ${correo}`);
  return { actualizada: true };
}

module.exports = { asegurar, NOMBRE };
