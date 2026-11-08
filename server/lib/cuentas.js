'use strict';
const crypto = require('crypto');
const db = require('../db');
const hash = require('./hash');

async function eliminarCuenta(usuarioId, { porAdministrador = null } = {}) {
  const relleno = await hash.hash(crypto.randomBytes(24).toString('base64url'));
  return db.conSistema((con) => con.transaccion(async () => {
    const u = await con.uno('SELECT id, rol, foto_archivo_id AS foto, eliminado_en FROM usuarios WHERE id = ? FOR UPDATE', [usuarioId]);
    if (!u || u.eliminado_en) return null;
    await con.q(`UPDATE usuarios SET nombre_completo = 'Cuenta eliminada', correo = ?, password_hash = ?, estado = 'desactivada',
      telefono = NULL, foto_archivo_id = NULL, recibir_correos = FALSE, correo_verificado_en = NULL, eliminado_en = NOW(),
      intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?`, [`eliminada-${u.id}@prepar.invalid`, relleno, u.id]);
    if (u.rol === 'ciudadano') {
      await con.q("UPDATE ciudadanos SET genero = 'prefiero_no_decir', fecha_nacimiento = MAKEDATE(YEAR(fecha_nacimiento), 1) WHERE usuario_id = ?", [u.id]);
    }
    if (u.rol === 'funcionario') {
      await con.q('DELETE FROM funcionario_funciones WHERE funcionario_id = ?', [u.id]);
      await con.q('UPDATE funcionarios SET debe_cambiar_password = FALSE WHERE usuario_id = ?', [u.id]);
    }
    if (u.foto) {
      await con.q('UPDATE archivos SET eliminado_en = NOW() WHERE id = ? AND eliminado_en IS NULL', [u.foto]);
      await con.q('DELETE FROM archivos_contenido WHERE archivo_id = ?', [u.foto]);
    }
    await con.q('UPDATE sesiones SET cerrada_en = NOW() WHERE usuario_id = ? AND cerrada_en IS NULL', [u.id]);
    await con.q('DELETE FROM tokens_recuperacion WHERE usuario_id = ?', [u.id]);
    await con.q('DELETE FROM tokens_verificacion WHERE usuario_id = ?', [u.id]);
    await con.q('DELETE FROM notificaciones WHERE usuario_id = ?', [u.id]);
    await con.q('DELETE FROM correos_salida WHERE usuario_id = ?', [u.id]);
    if (porAdministrador) {
      await con.q(`INSERT INTO bitacora (usuario_id, rol, accion, entidad, entidad_id, detalle) VALUES (?, 'administrador', 'cuenta_eliminar', 'usuarios', ?, JSON_OBJECT('rol', ?))`,
        [porAdministrador, u.id, u.rol]);
    } else {
      await con.q("INSERT INTO bitacora (usuario_id, rol, accion, entidad, entidad_id) VALUES (?, ?, 'cuenta_eliminar', 'usuarios', ?)", [u.id, u.rol, u.id]);
    }
    return { id: u.id, rol: u.rol };
  }));
}

module.exports = { eliminarCuenta };
