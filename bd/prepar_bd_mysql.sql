DROP DATABASE IF EXISTS prepar;
CREATE DATABASE prepar CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE prepar;

CREATE TABLE alcaldias (
  id        INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nombre    VARCHAR(50)  NOT NULL UNIQUE,
  latitud   DECIMAL(9,6) NULL,
  longitud  DECIMAL(9,6) NULL
);

CREATE TABLE colonias (
  id                INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  alcaldia_id       INT          NOT NULL,
  clave             VARCHAR(20)  NOT NULL UNIQUE,
  nombre            VARCHAR(100) NOT NULL,
  latitud           DECIMAL(9,6) NULL,
  longitud          DECIMAL(9,6) NULL,
  poblacion         INT          NOT NULL DEFAULT 0,
  indice_pobreza    DECIMAL(5,4) NOT NULL DEFAULT 0,
  indice_delictivo  DECIMAL(5,4) NOT NULL DEFAULT 0,
  FOREIGN KEY (alcaldia_id) REFERENCES alcaldias(id),
  CHECK (poblacion >= 0),
  CHECK (indice_pobreza BETWEEN 0 AND 1),
  CHECK (indice_delictivo BETWEEN 0 AND 1)
);

CREATE TABLE rubros (
  id      INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nombre  VARCHAR(80) NOT NULL UNIQUE,
  color   CHAR(7)     NOT NULL
);

CREATE TABLE pasos_rubro (
  id          INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rubro_id    INT         NOT NULL,
  orden       INT         NOT NULL,
  nombre      VARCHAR(80) NOT NULL,
  porcentaje  INT         NOT NULL,
  UNIQUE (rubro_id, orden),
  FOREIGN KEY (rubro_id) REFERENCES rubros(id),
  CHECK (porcentaje BETWEEN 1 AND 100)
);

CREATE TABLE fases (
  id           INT          NOT NULL PRIMARY KEY,
  nombre       VARCHAR(60)  NOT NULL,
  descripcion  VARCHAR(500) NOT NULL
);

CREATE TABLE usuarios (
  id                     INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rol                    VARCHAR(13)  NOT NULL,
  nombre                 VARCHAR(60)  NOT NULL,
  correo                 VARCHAR(60)  NOT NULL UNIQUE,
  password_hash          VARCHAR(255) NOT NULL,
  telefono               VARCHAR(10)  NULL,
  colonia_id             INT          NULL,
  alcaldia_id            INT          NULL,
  activo                 BOOLEAN      NOT NULL DEFAULT TRUE,
  debe_cambiar_password  BOOLEAN      NOT NULL DEFAULT FALSE,
  intentos_fallidos      INT          NOT NULL DEFAULT 0,
  bloqueado_hasta        DATETIME     NULL,
  creado_en              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (colonia_id) REFERENCES colonias(id),
  FOREIGN KEY (alcaldia_id) REFERENCES alcaldias(id),
  CHECK (rol IN ('ciudadano', 'funcionario', 'administrador')),
  CHECK (rol <> 'ciudadano' OR colonia_id IS NOT NULL),
  CHECK (rol <> 'funcionario' OR alcaldia_id IS NOT NULL)
);

CREATE TABLE sesiones (
  id                INT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  usuario_id        INT      NOT NULL,
  token             CHAR(64) NOT NULL UNIQUE,
  creada_en         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultima_actividad  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE recuperaciones (
  id          INT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT      NOT NULL,
  token       CHAR(64) NOT NULL UNIQUE,
  expira_en   DATETIME NOT NULL,
  usado       BOOLEAN  NOT NULL DEFAULT FALSE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE ciclos (
  id                 INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nombre             VARCHAR(50)   NOT NULL,
  anio               INT           NOT NULL,
  presupuesto_total  DECIMAL(14,2) NOT NULL,
  estado             VARCHAR(8)    NOT NULL DEFAULT 'borrador',
  fase_id            INT           NOT NULL DEFAULT 1,
  creado_en          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fase_id) REFERENCES fases(id),
  CHECK (estado IN ('borrador', 'activo', 'cerrado')),
  CHECK (presupuesto_total > 0),
  CHECK (anio BETWEEN 2000 AND 2100)
);

CREATE TABLE ciclo_colonias (
  ciclo_id     INT           NOT NULL,
  colonia_id   INT           NOT NULL,
  presupuesto  DECIMAL(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (ciclo_id, colonia_id),
  FOREIGN KEY (ciclo_id) REFERENCES ciclos(id) ON DELETE CASCADE,
  FOREIGN KEY (colonia_id) REFERENCES colonias(id)
);

CREATE TABLE ideas (
  id          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ciclo_id    INT          NOT NULL,
  colonia_id  INT          NOT NULL,
  autor_id    INT          NOT NULL,
  rubro_id    INT          NOT NULL,
  texto       VARCHAR(500) NOT NULL,
  creada_en   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ciclo_id, colonia_id) REFERENCES ciclo_colonias(ciclo_id, colonia_id) ON DELETE CASCADE,
  FOREIGN KEY (autor_id) REFERENCES usuarios(id),
  FOREIGN KEY (rubro_id) REFERENCES rubros(id)
);

CREATE TABLE comentarios (
  id         INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  idea_id    INT          NOT NULL,
  autor_id   INT          NOT NULL,
  texto      VARCHAR(250) NOT NULL,
  creado_en  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE,
  FOREIGN KEY (autor_id) REFERENCES usuarios(id)
);

CREATE TABLE apoyos (
  idea_id     INT NOT NULL,
  usuario_id  INT NOT NULL,
  PRIMARY KEY (idea_id, usuario_id),
  FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE imagenes (
  id         INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tipo       VARCHAR(10) NOT NULL,
  contenido  LONGBLOB    NOT NULL,
  subida_en  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (tipo IN ('image/jpeg', 'image/png'))
);

CREATE TABLE proyectos (
  id                   INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ciclo_id             INT           NOT NULL,
  colonia_id           INT           NOT NULL,
  proponente_id        INT           NOT NULL,
  rubro_id             INT           NOT NULL,
  titulo               VARCHAR(100)  NOT NULL,
  descripcion          VARCHAR(500)  NOT NULL,
  costo                DECIMAL(14,2) NOT NULL,
  calle                VARCHAR(100)  NOT NULL,
  numero               VARCHAR(10)   NULL,
  latitud              DECIMAL(9,6)  NULL,
  longitud             DECIMAL(9,6)  NULL,
  imagen_id            INT           NULL,
  estatus              VARCHAR(16)   NOT NULL DEFAULT 'registrado',
  numero_boleta        INT           NULL,
  motivo_inejecutable  VARCHAR(250)  NULL,
  creado_en            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ciclo_id, colonia_id) REFERENCES ciclo_colonias(ciclo_id, colonia_id) ON DELETE CASCADE,
  FOREIGN KEY (proponente_id) REFERENCES usuarios(id),
  FOREIGN KEY (rubro_id) REFERENCES rubros(id),
  FOREIGN KEY (imagen_id) REFERENCES imagenes(id),
  CHECK (costo > 0),
  CHECK (estatus IN ('registrado', 'viable', 'no_viable', 'ganador', 'en_ejecucion', 'concluido', 'inejecutable'))
);

CREATE TABLE dictamenes (
  id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  proyecto_id     INT          NOT NULL UNIQUE,
  funcionario_id  INT          NOT NULL,
  resultado       VARCHAR(9)   NOT NULL,
  justificacion   VARCHAR(500) NOT NULL,
  fecha           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE,
  FOREIGN KEY (funcionario_id) REFERENCES usuarios(id),
  CHECK (resultado IN ('viable', 'no_viable'))
);

CREATE TABLE participaciones (
  ciclo_id    INT         NOT NULL,
  usuario_id  INT         NOT NULL,
  folio       VARCHAR(20) NOT NULL UNIQUE,
  fecha       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ciclo_id, usuario_id),
  FOREIGN KEY (ciclo_id) REFERENCES ciclos(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE votos (
  id           INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ciclo_id     INT NOT NULL,
  colonia_id   INT NOT NULL,
  proyecto_id  INT NOT NULL,
  FOREIGN KEY (ciclo_id, colonia_id) REFERENCES ciclo_colonias(ciclo_id, colonia_id) ON DELETE CASCADE,
  FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE
);

CREATE TABLE pasos_proyecto (
  proyecto_id     INT          NOT NULL,
  paso_id         INT          NOT NULL,
  que_se_hizo     VARCHAR(250) NOT NULL,
  funcionario_id  INT          NOT NULL,
  fecha           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (proyecto_id, paso_id),
  FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE,
  FOREIGN KEY (paso_id) REFERENCES pasos_rubro(id),
  FOREIGN KEY (funcionario_id) REFERENCES usuarios(id)
);

CREATE TABLE gastos (
  id              INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  proyecto_id     INT           NOT NULL,
  funcionario_id  INT           NOT NULL,
  monto           DECIMAL(14,2) NOT NULL,
  concepto        VARCHAR(150)  NOT NULL,
  fecha           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE,
  FOREIGN KEY (funcionario_id) REFERENCES usuarios(id),
  CHECK (monto > 0)
);

CREATE TABLE fotos_denuncia (
  id           INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  proyecto_id  INT          NOT NULL,
  autor_id     INT          NOT NULL,
  imagen_id    INT          NOT NULL,
  comentario   VARCHAR(250) NOT NULL,
  fecha        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE,
  FOREIGN KEY (autor_id) REFERENCES usuarios(id),
  FOREIGN KEY (imagen_id) REFERENCES imagenes(id)
);

CREATE VIEW v_avance_proyecto AS
SELECT p.id AS proyecto_id,
       (SELECT COALESCE(SUM(pr.porcentaje), 0) FROM pasos_proyecto pp
          JOIN pasos_rubro pr ON pr.id = pp.paso_id WHERE pp.proyecto_id = p.id) AS avance,
       (SELECT COALESCE(SUM(g.monto), 0) FROM gastos g WHERE g.proyecto_id = p.id) AS gastado
FROM proyectos p;

CREATE VIEW v_votos_colonia AS
SELECT cc.ciclo_id, c.id AS colonia_id, c.nombre AS colonia, a.nombre AS alcaldia,
       (SELECT COUNT(*) FROM votos v WHERE v.ciclo_id = cc.ciclo_id AND v.colonia_id = c.id) AS votos
FROM ciclo_colonias cc
JOIN colonias c ON c.id = cc.colonia_id
JOIN alcaldias a ON a.id = c.alcaldia_id;

CREATE VIEW v_obras AS
SELECT p.id, p.ciclo_id, p.titulo, p.descripcion, p.costo, p.estatus, p.calle, p.numero,
       p.latitud, p.longitud, p.imagen_id, p.motivo_inejecutable,
       p.colonia_id, c.nombre AS colonia, c.alcaldia_id, a.nombre AS alcaldia,
       p.rubro_id, r.nombre AS rubro, r.color,
       av.avance, av.gastado,
       (SELECT COUNT(*) FROM fotos_denuncia f WHERE f.proyecto_id = p.id) AS fotos
FROM proyectos p
JOIN colonias c ON c.id = p.colonia_id
JOIN alcaldias a ON a.id = c.alcaldia_id
JOIN rubros r ON r.id = p.rubro_id
JOIN v_avance_proyecto av ON av.proyecto_id = p.id
WHERE p.estatus IN ('ganador', 'en_ejecucion', 'concluido', 'inejecutable');

DELIMITER $$

CREATE TRIGGER tg_ideas_bi BEFORE INSERT ON ideas FOR EACH ROW
BEGIN
  IF (SELECT fase_id FROM ciclos WHERE id = NEW.ciclo_id) <> 2 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Las ideas solo se pueden publicar en la fase de Diagnóstico y registro';
  END IF;
END$$

CREATE TRIGGER tg_proyectos_bi BEFORE INSERT ON proyectos FOR EACH ROW
BEGIN
  IF (SELECT fase_id FROM ciclos WHERE id = NEW.ciclo_id) <> 2 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Los proyectos solo se pueden registrar en la fase de Diagnóstico y registro';
  END IF;
  IF NEW.costo > (SELECT presupuesto FROM ciclo_colonias WHERE ciclo_id = NEW.ciclo_id AND colonia_id = NEW.colonia_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El costo del proyecto no puede ser mayor que el presupuesto de la colonia';
  END IF;
END$$

CREATE TRIGGER tg_dictamenes_ai AFTER INSERT ON dictamenes FOR EACH ROW
BEGIN
  UPDATE proyectos SET estatus = NEW.resultado WHERE id = NEW.proyecto_id;
END$$

CREATE TRIGGER tg_participaciones_bi BEFORE INSERT ON participaciones FOR EACH ROW
BEGIN
  IF (SELECT fase_id FROM ciclos WHERE id = NEW.ciclo_id) <> 5 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La votación solo está abierta en la fase de Consulta';
  END IF;
END$$

CREATE TRIGGER tg_gastos_bi BEFORE INSERT ON gastos FOR EACH ROW
BEGIN
  DECLARE v_costo DECIMAL(14,2);
  DECLARE v_gastado DECIMAL(14,2);
  SET v_costo = (SELECT costo FROM proyectos WHERE id = NEW.proyecto_id);
  SET v_gastado = (SELECT COALESCE(SUM(monto), 0) FROM gastos WHERE proyecto_id = NEW.proyecto_id);
  IF v_gastado + NEW.monto > v_costo THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El gasto total no puede pasar del costo aprobado del proyecto';
  END IF;
END$$

CREATE TRIGGER tg_pasos_proyecto_ai AFTER INSERT ON pasos_proyecto FOR EACH ROW
BEGIN
  DECLARE v_total INT;
  DECLARE v_hechos INT;
  SET v_total = (SELECT COUNT(*) FROM pasos_rubro WHERE rubro_id = (SELECT rubro_id FROM proyectos WHERE id = NEW.proyecto_id));
  SET v_hechos = (SELECT COUNT(*) FROM pasos_proyecto WHERE proyecto_id = NEW.proyecto_id);
  UPDATE proyectos SET estatus = IF(v_hechos >= v_total, 'concluido', 'en_ejecucion') WHERE id = NEW.proyecto_id;
END$$

CREATE PROCEDURE sp_repartir_presupuesto(IN p_ciclo INT)
BEGIN
  DECLARE v_total DECIMAL(14,2);
  DECLARE v_colonias INT;
  DECLARE v_max_poblacion INT;
  DECLARE v_suma_pesos DECIMAL(14,6);
  DECLARE v_resto DECIMAL(14,2);
  SET v_total = (SELECT presupuesto_total FROM ciclos WHERE id = p_ciclo);
  SET v_colonias = (SELECT COUNT(*) FROM ciclo_colonias WHERE ciclo_id = p_ciclo);
  SET v_max_poblacion = (SELECT MAX(c.poblacion) FROM ciclo_colonias cc JOIN colonias c ON c.id = cc.colonia_id WHERE cc.ciclo_id = p_ciclo);
  SET v_suma_pesos = (SELECT SUM((c.indice_pobreza + c.indice_delictivo + c.poblacion / v_max_poblacion) / 3)
                      FROM ciclo_colonias cc JOIN colonias c ON c.id = cc.colonia_id WHERE cc.ciclo_id = p_ciclo);
  UPDATE ciclo_colonias cc JOIN colonias c ON c.id = cc.colonia_id
     SET cc.presupuesto = ROUND(v_total / 2 / v_colonias
                              + v_total / 2 * ((c.indice_pobreza + c.indice_delictivo + c.poblacion / v_max_poblacion) / 3) / v_suma_pesos, 2)
   WHERE cc.ciclo_id = p_ciclo;
  SET v_resto = v_total - (SELECT SUM(presupuesto) FROM ciclo_colonias WHERE ciclo_id = p_ciclo);
  UPDATE ciclo_colonias SET presupuesto = presupuesto + v_resto
   WHERE ciclo_id = p_ciclo ORDER BY presupuesto DESC LIMIT 1;
END$$

CREATE PROCEDURE sp_crear_ciclo(IN p_nombre VARCHAR(50), IN p_anio INT, IN p_presupuesto DECIMAL(14,2))
BEGIN
  DECLARE v_ciclo INT;
  INSERT INTO ciclos (nombre, anio, presupuesto_total) VALUES (p_nombre, p_anio, p_presupuesto);
  SET v_ciclo = LAST_INSERT_ID();
  INSERT INTO ciclo_colonias (ciclo_id, colonia_id) SELECT v_ciclo, id FROM colonias;
  CALL sp_repartir_presupuesto(v_ciclo);
  SELECT v_ciclo AS ciclo_id;
END$$

CREATE PROCEDURE sp_sorteo(IN p_ciclo INT, IN p_colonia INT)
BEGIN
  DECLARE v_numero INT DEFAULT 0;
  DECLARE v_proyecto INT;
  IF (SELECT fase_id FROM ciclos WHERE id = p_ciclo) <> 4 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El sorteo solo se hace en la fase de Sorteo y difusión';
  END IF;
  IF EXISTS (SELECT 1 FROM proyectos WHERE ciclo_id = p_ciclo AND colonia_id = p_colonia AND numero_boleta IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El sorteo de esta colonia ya se hizo';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM proyectos WHERE ciclo_id = p_ciclo AND colonia_id = p_colonia AND estatus = 'viable') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Esta colonia no tiene proyectos viables';
  END IF;
  SET v_proyecto = (SELECT id FROM proyectos WHERE ciclo_id = p_ciclo AND colonia_id = p_colonia
                    AND estatus = 'viable' AND numero_boleta IS NULL ORDER BY RAND() LIMIT 1);
  WHILE v_proyecto IS NOT NULL DO
    SET v_numero = v_numero + 1;
    UPDATE proyectos SET numero_boleta = v_numero WHERE id = v_proyecto;
    SET v_proyecto = (SELECT id FROM proyectos WHERE ciclo_id = p_ciclo AND colonia_id = p_colonia
                      AND estatus = 'viable' AND numero_boleta IS NULL ORDER BY RAND() LIMIT 1);
  END WHILE;
  SELECT v_numero AS proyectos;
END$$

CREATE PROCEDURE sp_votar(IN p_usuario INT, IN p_proyecto INT)
BEGIN
  DECLARE v_ciclo INT;
  DECLARE v_colonia INT;
  DECLARE v_folio VARCHAR(20);
  SET v_ciclo = (SELECT id FROM ciclos WHERE estado = 'activo' LIMIT 1);
  SET v_colonia = (SELECT colonia_id FROM usuarios WHERE id = p_usuario AND rol = 'ciudadano');
  IF NOT EXISTS (SELECT 1 FROM proyectos WHERE id = p_proyecto AND ciclo_id = v_ciclo AND colonia_id = v_colonia
                 AND estatus = 'viable' AND numero_boleta IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ese proyecto no está en la boleta de tu colonia';
  END IF;
  IF EXISTS (SELECT 1 FROM participaciones WHERE ciclo_id = v_ciclo AND usuario_id = p_usuario) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ya votaste en este ciclo';
  END IF;
  SET v_folio = CONCAT('VOTO-', v_ciclo, '-', UPPER(LEFT(MD5(RAND()), 8)));
  INSERT INTO participaciones (ciclo_id, usuario_id, folio) VALUES (v_ciclo, p_usuario, v_folio);
  INSERT INTO votos (ciclo_id, colonia_id, proyecto_id) VALUES (v_ciclo, v_colonia, p_proyecto);
  SELECT v_folio AS folio;
END$$

CREATE PROCEDURE sp_calcular_ganadores(IN p_ciclo INT)
BEGIN
  DECLARE v_colonia INT;
  DECLARE v_ganador INT;
  DECLARE v_viables INT;
  DECLARE v_votos INT;
  SET v_colonia = (SELECT MIN(colonia_id) FROM ciclo_colonias WHERE ciclo_id = p_ciclo);
  WHILE v_colonia IS NOT NULL DO
    SET v_viables = (SELECT COUNT(*) FROM proyectos WHERE ciclo_id = p_ciclo AND colonia_id = v_colonia
                     AND estatus = 'viable' AND numero_boleta IS NOT NULL);
    SET v_ganador = (SELECT p.id FROM proyectos p
                     WHERE p.ciclo_id = p_ciclo AND p.colonia_id = v_colonia AND p.estatus = 'viable' AND p.numero_boleta IS NOT NULL
                     ORDER BY (SELECT COUNT(*) FROM votos v WHERE v.proyecto_id = p.id) DESC, p.id
                     LIMIT 1);
    SET v_votos = (SELECT COUNT(*) FROM votos WHERE proyecto_id = v_ganador);
    IF v_ganador IS NOT NULL AND (v_votos > 0 OR v_viables = 1) THEN
      UPDATE proyectos SET estatus = 'ganador' WHERE id = v_ganador;
    END IF;
    SET v_colonia = (SELECT MIN(colonia_id) FROM ciclo_colonias WHERE ciclo_id = p_ciclo AND colonia_id > v_colonia);
  END WHILE;
  SELECT COUNT(*) AS ganadores FROM proyectos WHERE ciclo_id = p_ciclo AND estatus = 'ganador';
END$$

DELIMITER ;

