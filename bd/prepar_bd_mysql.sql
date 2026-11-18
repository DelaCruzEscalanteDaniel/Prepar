DROP DATABASE IF EXISTS prepar;
CREATE DATABASE prepar CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE prepar;

CREATE TABLE alcaldias (
  id_alcaldia  INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nombre       VARCHAR(50)  NOT NULL UNIQUE,
  latitud      DECIMAL(9,6) NULL,
  longitud     DECIMAL(9,6) NULL
);

CREATE TABLE colonias (
  id_colonia        INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_alcaldia       INT          NOT NULL,
  clave             VARCHAR(20)  NOT NULL UNIQUE,
  nombre            VARCHAR(100) NOT NULL,
  latitud           DECIMAL(9,6) NULL,
  longitud          DECIMAL(9,6) NULL,
  poblacion         INT          NOT NULL DEFAULT 0,
  indice_pobreza    DECIMAL(5,4) NOT NULL DEFAULT 0,
  indice_delictivo  DECIMAL(5,4) NOT NULL DEFAULT 0,
  FOREIGN KEY (id_alcaldia) REFERENCES alcaldias(id_alcaldia),
  CHECK (poblacion >= 0),
  CHECK (indice_pobreza BETWEEN 0 AND 1),
  CHECK (indice_delictivo BETWEEN 0 AND 1)
);

CREATE TABLE rubros (
  id_rubro  INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nombre    VARCHAR(80) NOT NULL UNIQUE,
  color     CHAR(7)     NOT NULL
);

CREATE TABLE pasos_rubro (
  id_paso_rubro  INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_rubro       INT         NOT NULL,
  orden          INT         NOT NULL,
  nombre         VARCHAR(80) NOT NULL,
  porcentaje     INT         NOT NULL,
  UNIQUE (id_rubro, orden),
  FOREIGN KEY (id_rubro) REFERENCES rubros(id_rubro),
  CHECK (porcentaje BETWEEN 1 AND 100)
);

CREATE TABLE fases (
  id_fase      INT          NOT NULL PRIMARY KEY,
  nombre       VARCHAR(60)  NOT NULL,
  descripcion  VARCHAR(500) NOT NULL
);

CREATE TABLE usuarios (
  id_usuario             INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rol                    VARCHAR(13)  NOT NULL,
  nombre                 VARCHAR(60)  NOT NULL,
  correo                 VARCHAR(60)  NOT NULL UNIQUE,
  password_hash          VARCHAR(255) NOT NULL,
  telefono               VARCHAR(10)  NULL,
  id_colonia             INT          NULL,
  id_alcaldia            INT          NULL,
  activo                 BOOLEAN      NOT NULL DEFAULT TRUE,
  debe_cambiar_password  BOOLEAN      NOT NULL DEFAULT FALSE,
  intentos_fallidos      INT          NOT NULL DEFAULT 0,
  bloqueado_hasta        DATETIME     NULL,
  creado_en              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_colonia) REFERENCES colonias(id_colonia),
  FOREIGN KEY (id_alcaldia) REFERENCES alcaldias(id_alcaldia),
  CHECK (rol IN ('ciudadano', 'funcionario', 'administrador')),
  CHECK (rol <> 'ciudadano' OR id_colonia IS NOT NULL),
  CHECK (rol <> 'funcionario' OR id_alcaldia IS NOT NULL)
);

CREATE TABLE sesiones (
  id_sesion         INT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_usuario        INT      NOT NULL,
  token             CHAR(64) NOT NULL UNIQUE,
  creada_en         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultima_actividad  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
);

CREATE TABLE recuperaciones (
  id_recuperacion  INT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_usuario       INT      NOT NULL,
  token            CHAR(64) NOT NULL UNIQUE,
  expira_en        DATETIME NOT NULL,
  usado            BOOLEAN  NOT NULL DEFAULT FALSE,
  FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
);

CREATE TABLE ciclos (
  id_ciclo           INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nombre             VARCHAR(50)   NOT NULL,
  anio               INT           NOT NULL,
  presupuesto_total  DECIMAL(14,2) NOT NULL,
  estado             VARCHAR(8)    NOT NULL DEFAULT 'borrador',
  id_fase            INT           NOT NULL DEFAULT 1,
  creado_en          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_fase) REFERENCES fases(id_fase),
  CHECK (estado IN ('borrador', 'activo', 'cerrado')),
  CHECK (presupuesto_total > 0),
  CHECK (anio BETWEEN 2000 AND 2100)
);

CREATE TABLE ciclo_colonias (
  id_ciclo     INT           NOT NULL,
  id_colonia   INT           NOT NULL,
  presupuesto  DECIMAL(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id_ciclo, id_colonia),
  FOREIGN KEY (id_ciclo) REFERENCES ciclos(id_ciclo) ON DELETE CASCADE,
  FOREIGN KEY (id_colonia) REFERENCES colonias(id_colonia)
);

CREATE TABLE ciclo_fases (
  id_ciclo      INT  NOT NULL,
  id_fase       INT  NOT NULL,
  fecha_inicio  DATE NOT NULL,
  fecha_fin     DATE NOT NULL,
  PRIMARY KEY (id_ciclo, id_fase),
  FOREIGN KEY (id_ciclo) REFERENCES ciclos(id_ciclo) ON DELETE CASCADE,
  FOREIGN KEY (id_fase) REFERENCES fases(id_fase),
  CHECK (fecha_fin >= fecha_inicio)
);

CREATE TABLE ideas (
  id_idea     INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_ciclo    INT          NOT NULL,
  id_colonia  INT          NOT NULL,
  id_autor    INT          NOT NULL,
  id_rubro    INT          NOT NULL,
  texto       VARCHAR(500) NOT NULL,
  creada_en   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_ciclo, id_colonia) REFERENCES ciclo_colonias(id_ciclo, id_colonia) ON DELETE CASCADE,
  FOREIGN KEY (id_autor) REFERENCES usuarios(id_usuario),
  FOREIGN KEY (id_rubro) REFERENCES rubros(id_rubro)
);

CREATE TABLE comentarios (
  id_comentario  INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_idea        INT          NOT NULL,
  id_autor       INT          NOT NULL,
  texto          VARCHAR(250) NOT NULL,
  creado_en      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_idea) REFERENCES ideas(id_idea) ON DELETE CASCADE,
  FOREIGN KEY (id_autor) REFERENCES usuarios(id_usuario)
);

CREATE TABLE apoyos (
  id_idea     INT NOT NULL,
  id_usuario  INT NOT NULL,
  PRIMARY KEY (id_idea, id_usuario),
  FOREIGN KEY (id_idea) REFERENCES ideas(id_idea) ON DELETE CASCADE,
  FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
);

CREATE TABLE imagenes (
  id_imagen  INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tipo       VARCHAR(10) NOT NULL,
  contenido  LONGBLOB    NOT NULL,
  subida_en  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (tipo IN ('image/jpeg', 'image/png'))
);

CREATE TABLE proyectos (
  id_proyecto          INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_ciclo             INT           NOT NULL,
  id_colonia           INT           NOT NULL,
  id_proponente        INT           NOT NULL,
  id_rubro             INT           NOT NULL,
  titulo               VARCHAR(100)  NOT NULL,
  descripcion          VARCHAR(500)  NOT NULL,
  costo                DECIMAL(14,2) NOT NULL,
  calle                VARCHAR(100)  NOT NULL,
  numero               VARCHAR(10)   NULL,
  latitud              DECIMAL(9,6)  NULL,
  longitud             DECIMAL(9,6)  NULL,
  id_imagen            INT           NULL,
  estatus              VARCHAR(16)   NOT NULL DEFAULT 'registrado',
  numero_boleta        INT           NULL,
  motivo_inejecutable  VARCHAR(250)  NULL,
  creado_en            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_ciclo, id_colonia) REFERENCES ciclo_colonias(id_ciclo, id_colonia) ON DELETE CASCADE,
  FOREIGN KEY (id_proponente) REFERENCES usuarios(id_usuario),
  FOREIGN KEY (id_rubro) REFERENCES rubros(id_rubro),
  FOREIGN KEY (id_imagen) REFERENCES imagenes(id_imagen),
  CHECK (costo > 0),
  CHECK (estatus IN ('registrado', 'viable', 'no_viable', 'ganador', 'en_ejecucion', 'concluido', 'inejecutable'))
);

CREATE TABLE dictamenes (
  id_dictamen     INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_proyecto     INT          NOT NULL UNIQUE,
  id_funcionario  INT          NOT NULL,
  resultado       VARCHAR(9)   NOT NULL,
  justificacion   VARCHAR(500) NOT NULL,
  fecha           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_proyecto) REFERENCES proyectos(id_proyecto) ON DELETE CASCADE,
  FOREIGN KEY (id_funcionario) REFERENCES usuarios(id_usuario),
  CHECK (resultado IN ('viable', 'no_viable'))
);

CREATE TABLE participaciones (
  id_ciclo    INT         NOT NULL,
  id_usuario  INT         NOT NULL,
  fecha       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_ciclo, id_usuario),
  FOREIGN KEY (id_ciclo) REFERENCES ciclos(id_ciclo) ON DELETE CASCADE,
  FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
);

CREATE TABLE votos (
  id_voto      INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_ciclo     INT NOT NULL,
  id_colonia   INT NOT NULL,
  id_proyecto  INT NOT NULL,
  FOREIGN KEY (id_ciclo, id_colonia) REFERENCES ciclo_colonias(id_ciclo, id_colonia) ON DELETE CASCADE,
  FOREIGN KEY (id_proyecto) REFERENCES proyectos(id_proyecto) ON DELETE CASCADE
);

CREATE TABLE pasos_proyecto (
  id_proyecto     INT          NOT NULL,
  id_paso_rubro   INT          NOT NULL,
  que_se_hizo     VARCHAR(250) NOT NULL,
  id_funcionario  INT          NOT NULL,
  fecha           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_proyecto, id_paso_rubro),
  FOREIGN KEY (id_proyecto) REFERENCES proyectos(id_proyecto) ON DELETE CASCADE,
  FOREIGN KEY (id_paso_rubro) REFERENCES pasos_rubro(id_paso_rubro),
  FOREIGN KEY (id_funcionario) REFERENCES usuarios(id_usuario)
);

CREATE TABLE gastos (
  id_gasto        INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_proyecto     INT           NOT NULL,
  id_funcionario  INT           NOT NULL,
  monto           DECIMAL(14,2) NOT NULL,
  concepto        VARCHAR(150)  NOT NULL,
  fecha           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_proyecto) REFERENCES proyectos(id_proyecto) ON DELETE CASCADE,
  FOREIGN KEY (id_funcionario) REFERENCES usuarios(id_usuario),
  CHECK (monto > 0)
);

CREATE TABLE fotos_denuncia (
  id_foto_denuncia  INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_proyecto       INT          NOT NULL,
  id_autor          INT          NOT NULL,
  id_imagen         INT          NOT NULL,
  comentario        VARCHAR(250) NOT NULL,
  fecha             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_proyecto) REFERENCES proyectos(id_proyecto) ON DELETE CASCADE,
  FOREIGN KEY (id_autor) REFERENCES usuarios(id_usuario),
  FOREIGN KEY (id_imagen) REFERENCES imagenes(id_imagen)
);

CREATE VIEW v_avance_proyecto AS
SELECT p.id_proyecto,
       (SELECT COALESCE(SUM(pr.porcentaje), 0) FROM pasos_proyecto pp
          JOIN pasos_rubro pr ON pr.id_paso_rubro = pp.id_paso_rubro WHERE pp.id_proyecto = p.id_proyecto) AS avance,
       (SELECT COALESCE(SUM(g.monto), 0) FROM gastos g WHERE g.id_proyecto = p.id_proyecto) AS gastado
FROM proyectos p;

CREATE VIEW v_votos_colonia AS
SELECT cc.id_ciclo, c.id_colonia, c.nombre AS colonia, a.nombre AS alcaldia,
       (SELECT COUNT(*) FROM votos v WHERE v.id_ciclo = cc.id_ciclo AND v.id_colonia = c.id_colonia) AS votos
FROM ciclo_colonias cc
JOIN colonias c ON c.id_colonia = cc.id_colonia
JOIN alcaldias a ON a.id_alcaldia = c.id_alcaldia;

CREATE VIEW v_obras AS
SELECT p.id_proyecto, p.id_ciclo, p.titulo, p.descripcion, p.costo, p.estatus, p.calle, p.numero,
       p.latitud, p.longitud, p.id_imagen, p.motivo_inejecutable,
       p.id_colonia, c.nombre AS colonia, c.id_alcaldia, a.nombre AS alcaldia,
       p.id_rubro, r.nombre AS rubro, r.color,
       av.avance, av.gastado,
       (SELECT COUNT(*) FROM fotos_denuncia f WHERE f.id_proyecto = p.id_proyecto) AS fotos
FROM proyectos p
JOIN colonias c ON c.id_colonia = p.id_colonia
JOIN alcaldias a ON a.id_alcaldia = c.id_alcaldia
JOIN rubros r ON r.id_rubro = p.id_rubro
JOIN v_avance_proyecto av ON av.id_proyecto = p.id_proyecto
WHERE p.estatus IN ('ganador', 'en_ejecucion', 'concluido', 'inejecutable');

DELIMITER $$

CREATE TRIGGER tg_ideas_bi BEFORE INSERT ON ideas FOR EACH ROW
BEGIN
  IF (SELECT id_fase FROM ciclos WHERE id_ciclo = NEW.id_ciclo) <> 2 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Las ideas solo se pueden publicar en la fase de Diagnóstico y registro';
  END IF;
END$$

CREATE TRIGGER tg_proyectos_bi BEFORE INSERT ON proyectos FOR EACH ROW
BEGIN
  IF (SELECT id_fase FROM ciclos WHERE id_ciclo = NEW.id_ciclo) <> 2 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Los proyectos solo se pueden registrar en la fase de Diagnóstico y registro';
  END IF;
  IF NEW.costo > (SELECT presupuesto FROM ciclo_colonias WHERE id_ciclo = NEW.id_ciclo AND id_colonia = NEW.id_colonia) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El costo del proyecto no puede ser mayor que el presupuesto de la colonia';
  END IF;
END$$

CREATE TRIGGER tg_dictamenes_ai AFTER INSERT ON dictamenes FOR EACH ROW
BEGIN
  UPDATE proyectos SET estatus = NEW.resultado WHERE id_proyecto = NEW.id_proyecto;
END$$

CREATE TRIGGER tg_participaciones_bi BEFORE INSERT ON participaciones FOR EACH ROW
BEGIN
  IF (SELECT id_fase FROM ciclos WHERE id_ciclo = NEW.id_ciclo) <> 5 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La votación solo está abierta en la fase de Consulta';
  END IF;
END$$

CREATE TRIGGER tg_gastos_bi BEFORE INSERT ON gastos FOR EACH ROW
BEGIN
  DECLARE v_costo DECIMAL(14,2);
  DECLARE v_gastado DECIMAL(14,2);
  SET v_costo = (SELECT costo FROM proyectos WHERE id_proyecto = NEW.id_proyecto);
  SET v_gastado = (SELECT COALESCE(SUM(monto), 0) FROM gastos WHERE id_proyecto = NEW.id_proyecto);
  IF v_gastado + NEW.monto > v_costo THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El gasto total no puede pasar del costo aprobado del proyecto';
  END IF;
END$$

CREATE TRIGGER tg_pasos_proyecto_ai AFTER INSERT ON pasos_proyecto FOR EACH ROW
BEGIN
  DECLARE v_total INT;
  DECLARE v_hechos INT;
  SET v_total = (SELECT COUNT(*) FROM pasos_rubro WHERE id_rubro = (SELECT id_rubro FROM proyectos WHERE id_proyecto = NEW.id_proyecto));
  SET v_hechos = (SELECT COUNT(*) FROM pasos_proyecto WHERE id_proyecto = NEW.id_proyecto);
  UPDATE proyectos SET estatus = IF(v_hechos >= v_total, 'concluido', 'en_ejecucion') WHERE id_proyecto = NEW.id_proyecto;
END$$

CREATE PROCEDURE sp_repartir_presupuesto(IN p_ciclo INT)
BEGIN
  DECLARE v_total DECIMAL(14,2);
  DECLARE v_colonias INT;
  DECLARE v_max_poblacion INT;
  DECLARE v_suma_pesos DECIMAL(14,6);
  DECLARE v_resto DECIMAL(14,2);
  SET v_total = (SELECT presupuesto_total FROM ciclos WHERE id_ciclo = p_ciclo);
  SET v_colonias = (SELECT COUNT(*) FROM ciclo_colonias WHERE id_ciclo = p_ciclo);
  SET v_max_poblacion = (SELECT MAX(c.poblacion) FROM ciclo_colonias cc JOIN colonias c ON c.id_colonia = cc.id_colonia WHERE cc.id_ciclo = p_ciclo);
  SET v_suma_pesos = (SELECT SUM((c.indice_pobreza + c.indice_delictivo + c.poblacion / v_max_poblacion) / 3)
                      FROM ciclo_colonias cc JOIN colonias c ON c.id_colonia = cc.id_colonia WHERE cc.id_ciclo = p_ciclo);
  UPDATE ciclo_colonias cc JOIN colonias c ON c.id_colonia = cc.id_colonia
     SET cc.presupuesto = ROUND(v_total / 2 / v_colonias
                              + v_total / 2 * ((c.indice_pobreza + c.indice_delictivo + c.poblacion / v_max_poblacion) / 3) / v_suma_pesos, 2)
   WHERE cc.id_ciclo = p_ciclo;
  SET v_resto = v_total - (SELECT SUM(presupuesto) FROM ciclo_colonias WHERE id_ciclo = p_ciclo);
  UPDATE ciclo_colonias SET presupuesto = presupuesto + v_resto
   WHERE id_ciclo = p_ciclo ORDER BY presupuesto DESC LIMIT 1;
END$$

CREATE PROCEDURE sp_crear_ciclo(IN p_nombre VARCHAR(50), IN p_anio INT, IN p_presupuesto DECIMAL(14,2))
BEGIN
  DECLARE v_ciclo INT;
  DECLARE v_fase INT DEFAULT 1;
  DECLARE v_dias INT;
  DECLARE v_fecha DATE DEFAULT CURDATE();
  INSERT INTO ciclos (nombre, anio, presupuesto_total) VALUES (p_nombre, p_anio, p_presupuesto);
  SET v_ciclo = LAST_INSERT_ID();
  INSERT INTO ciclo_colonias (id_ciclo, id_colonia) SELECT v_ciclo, id_colonia FROM colonias;
  CALL sp_repartir_presupuesto(v_ciclo);
  WHILE v_fase <= 8 DO
    SET v_dias = ELT(v_fase, 7, 21, 14, 7, 7, 3, 90, 14);
    INSERT INTO ciclo_fases (id_ciclo, id_fase, fecha_inicio, fecha_fin)
    VALUES (v_ciclo, v_fase, v_fecha, v_fecha + INTERVAL (v_dias - 1) DAY);
    SET v_fecha = v_fecha + INTERVAL v_dias DAY;
    SET v_fase = v_fase + 1;
  END WHILE;
  SELECT v_ciclo AS id_ciclo;
END$$

CREATE PROCEDURE sp_sorteo(IN p_ciclo INT, IN p_colonia INT)
BEGIN
  DECLARE v_numero INT DEFAULT 0;
  DECLARE v_proyecto INT;
  IF (SELECT id_fase FROM ciclos WHERE id_ciclo = p_ciclo) <> 4 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El sorteo solo se hace en la fase de Sorteo y difusión';
  END IF;
  IF EXISTS (SELECT 1 FROM proyectos WHERE id_ciclo = p_ciclo AND id_colonia = p_colonia AND numero_boleta IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El sorteo de esta colonia ya se hizo';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM proyectos WHERE id_ciclo = p_ciclo AND id_colonia = p_colonia AND estatus = 'viable') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Esta colonia no tiene proyectos viables';
  END IF;
  SET v_proyecto = (SELECT id_proyecto FROM proyectos WHERE id_ciclo = p_ciclo AND id_colonia = p_colonia
                    AND estatus = 'viable' AND numero_boleta IS NULL ORDER BY RAND() LIMIT 1);
  WHILE v_proyecto IS NOT NULL DO
    SET v_numero = v_numero + 1;
    UPDATE proyectos SET numero_boleta = v_numero WHERE id_proyecto = v_proyecto;
    SET v_proyecto = (SELECT id_proyecto FROM proyectos WHERE id_ciclo = p_ciclo AND id_colonia = p_colonia
                      AND estatus = 'viable' AND numero_boleta IS NULL ORDER BY RAND() LIMIT 1);
  END WHILE;
  SELECT v_numero AS proyectos;
END$$

CREATE PROCEDURE sp_votar(IN p_usuario INT, IN p_proyecto INT)
BEGIN
  DECLARE v_ciclo INT;
  DECLARE v_colonia INT;
  SET v_ciclo = (SELECT id_ciclo FROM ciclos WHERE estado = 'activo' LIMIT 1);
  SET v_colonia = (SELECT id_colonia FROM usuarios WHERE id_usuario = p_usuario AND rol = 'ciudadano');
  IF NOT EXISTS (SELECT 1 FROM proyectos WHERE id_proyecto = p_proyecto AND id_ciclo = v_ciclo AND id_colonia = v_colonia
                 AND estatus = 'viable' AND numero_boleta IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ese proyecto no está en la boleta de tu colonia';
  END IF;
  IF EXISTS (SELECT 1 FROM participaciones WHERE id_ciclo = v_ciclo AND id_usuario = p_usuario) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ya votaste en este ciclo';
  END IF;
  INSERT INTO participaciones (id_ciclo, id_usuario) VALUES (v_ciclo, p_usuario);
  INSERT INTO votos (id_ciclo, id_colonia, id_proyecto) VALUES (v_ciclo, v_colonia, p_proyecto);
END$$

CREATE PROCEDURE sp_calcular_ganadores(IN p_ciclo INT)
BEGIN
  DECLARE v_colonia INT;
  DECLARE v_ganador INT;
  DECLARE v_viables INT;
  DECLARE v_votos INT;
  SET v_colonia = (SELECT MIN(id_colonia) FROM ciclo_colonias WHERE id_ciclo = p_ciclo);
  WHILE v_colonia IS NOT NULL DO
    SET v_viables = (SELECT COUNT(*) FROM proyectos WHERE id_ciclo = p_ciclo AND id_colonia = v_colonia
                     AND estatus = 'viable' AND numero_boleta IS NOT NULL);
    SET v_ganador = (SELECT p.id_proyecto FROM proyectos p
                     WHERE p.id_ciclo = p_ciclo AND p.id_colonia = v_colonia AND p.estatus = 'viable' AND p.numero_boleta IS NOT NULL
                     ORDER BY (SELECT COUNT(*) FROM votos v WHERE v.id_proyecto = p.id_proyecto) DESC, p.id_proyecto
                     LIMIT 1);
    SET v_votos = (SELECT COUNT(*) FROM votos WHERE id_proyecto = v_ganador);
    IF v_ganador IS NOT NULL AND (v_votos > 0 OR v_viables = 1) THEN
      UPDATE proyectos SET estatus = 'ganador' WHERE id_proyecto = v_ganador;
    END IF;
    SET v_colonia = (SELECT MIN(id_colonia) FROM ciclo_colonias WHERE id_ciclo = p_ciclo AND id_colonia > v_colonia);
  END WHILE;
  SELECT COUNT(*) AS ganadores FROM proyectos WHERE id_ciclo = p_ciclo AND estatus = 'ganador';
END$$

DELIMITER ;

INSERT INTO fases (id_fase, nombre, descripcion) VALUES
  (1, 'Convocatoria', 'Se publica el presupuesto de cada colonia y las reglas del ciclo.'),
  (2, 'Diagnóstico y registro', 'Los vecinos publican ideas en el foro y registran sus proyectos.'),
  (3, 'Dictaminación', 'La alcaldía revisa cada proyecto y dice si es viable o no viable.'),
  (4, 'Sorteo y difusión', 'Se sortea el número con el que cada proyecto viable aparece en la boleta.'),
  (5, 'Consulta', 'Cada vecino vota una sola vez por un proyecto de su colonia.'),
  (6, 'Resultados', 'Se cuentan los votos y se conoce el proyecto ganador de cada colonia.'),
  (7, 'Ejecución y seguimiento', 'La alcaldía construye las obras y los vecinos suben fotos de cómo van.'),
  (8, 'Evaluación', 'Se revisa cuánto se gastó y cómo quedó cada obra.');

INSERT INTO rubros (nombre, color) VALUES
  ('Mejoramiento de espacios públicos', '#16A34A'),
  ('Infraestructura urbana, obras y servicios', '#EA580C'),
  ('Actividades recreativas, deportivas y culturales', '#7C3AED');

INSERT INTO pasos_rubro (id_rubro, orden, nombre, porcentaje) VALUES
  (1, 1, 'Planeación y permisos', 10),
  (1, 2, 'Compra de materiales o contratación', 20),
  (1, 3, 'Preparación del sitio', 15),
  (1, 4, 'Trabajos principales', 35),
  (1, 5, 'Detalles finales y limpieza', 10),
  (1, 6, 'Entrega a los vecinos', 10),
  (2, 1, 'Proyecto y permisos', 15),
  (2, 2, 'Contratación', 15),
  (2, 3, 'Inicio de obra', 10),
  (2, 4, 'Obra a la mitad', 25),
  (2, 5, 'Obra terminada', 25),
  (2, 6, 'Pruebas y entrega', 10),
  (3, 1, 'Planeación y calendario', 15),
  (3, 2, 'Contratación de instructores o compra de equipo', 25),
  (3, 3, 'Difusión con los vecinos', 10),
  (3, 4, 'Actividades en curso', 35),
  (3, 5, 'Cierre y evaluación', 15);

INSERT INTO alcaldias (id_alcaldia, nombre, latitud, longitud) VALUES
  (1, 'Álvaro Obregón', 19.358600, -99.203600),
  (2, 'Azcapotzalco', 19.483300, -99.183300),
  (3, 'Benito Juárez', 19.372500, -99.156400),
  (4, 'Coyoacán', 19.328000, -99.161700),
  (5, 'Cuajimalpa de Morelos', 19.357200, -99.299100),
  (6, 'Cuauhtémoc', 19.432600, -99.133200),
  (7, 'Gustavo A. Madero', 19.482300, -99.110100),
  (8, 'Iztacalco', 19.395600, -99.097800),
  (9, 'Iztapalapa', 19.355700, -99.062000),
  (10, 'La Magdalena Contreras', 19.304400, -99.240200),
  (11, 'Miguel Hidalgo', 19.422800, -99.204800),
  (12, 'Milpa Alta', 19.192400, -99.023200),
  (13, 'Tláhuac', 19.286300, -99.006300),
  (14, 'Tlalpan', 19.290500, -99.171100),
  (15, 'Venustiano Carranza', 19.430400, -99.098300),
  (16, 'Xochimilco', 19.257200, -99.103700);

INSERT INTO colonias (id_alcaldia, clave, nombre, latitud, longitud, poblacion, indice_pobreza, indice_delictivo) VALUES
  (1, 'AOB-001', 'San Ángel', 19.346700, -99.190000, 9800, 0.0800, 0.3500),
  (1, 'AOB-002', 'Olivar de los Padres', 19.333000, -99.217000, 21500, 0.3100, 0.4200),
  (2, 'AZC-001', 'Clavería', 19.471000, -99.185000, 17600, 0.1800, 0.4800),
  (2, 'AZC-002', 'San Álvaro', 19.459000, -99.183000, 12400, 0.2200, 0.4500),
  (3, 'BJU-001', 'Narvarte Poniente', 19.396000, -99.156000, 24800, 0.0600, 0.5200),
  (3, 'BJU-002', 'Del Valle Centro', 19.385000, -99.165000, 19300, 0.0500, 0.4900),
  (4, 'COY-001', 'Del Carmen', 19.350000, -99.162000, 11200, 0.0900, 0.3300),
  (4, 'COY-002', 'Santa Úrsula Coapa', 19.305000, -99.143000, 38500, 0.4100, 0.5600),
  (5, 'CUJ-001', 'Cuajimalpa', 19.357000, -99.299000, 15700, 0.3000, 0.2400),
  (5, 'CUJ-002', 'El Contadero', 19.344000, -99.290000, 8900, 0.3400, 0.2100),
  (6, 'CUH-001', 'Roma Norte', 19.419000, -99.162000, 27300, 0.0700, 0.8100),
  (6, 'CUH-002', 'Guerrero', 19.442000, -99.145000, 36900, 0.3800, 0.8800),
  (7, 'GAM-001', 'Lindavista', 19.488000, -99.130000, 23100, 0.1000, 0.4000),
  (7, 'GAM-002', 'San Felipe de Jesús', 19.493000, -99.072000, 33800, 0.4600, 0.6500),
  (8, 'IZC-001', 'Agrícola Oriental', 19.395000, -99.070000, 40200, 0.2900, 0.5800),
  (8, 'IZC-002', 'Santa Anita', 19.395000, -99.124000, 10600, 0.2500, 0.4300),
  (9, 'IZP-001', 'San Lorenzo Tezonco', 19.308000, -99.067000, 39500, 0.5100, 0.6200),
  (9, 'IZP-002', 'Unidad Habitacional Vicente Guerrero', 19.357000, -99.056000, 28700, 0.4400, 0.5900),
  (10, 'MAC-001', 'San Jerónimo Lídice', 19.323000, -99.222000, 13400, 0.1400, 0.2600),
  (10, 'MAC-002', 'La Magdalena', 19.299000, -99.244000, 9700, 0.3600, 0.2300),
  (11, 'MHI-001', 'Tacubaya', 19.403000, -99.187000, 22600, 0.3200, 0.7100),
  (11, 'MHI-002', 'Anáhuac', 19.440000, -99.180000, 18900, 0.2000, 0.5000),
  (12, 'MAL-001', 'Villa Milpa Alta', 19.192000, -99.023000, 16800, 0.5800, 0.1500),
  (12, 'MAL-002', 'San Pedro Atocpan', 19.201000, -99.049000, 11900, 0.5500, 0.1200),
  (13, 'TLH-001', 'San Francisco Tlaltenco', 19.293000, -99.023000, 25400, 0.4900, 0.3800),
  (13, 'TLH-002', 'Del Mar', 19.296000, -99.054000, 20100, 0.4300, 0.4100),
  (14, 'TLP-001', 'Tlalpan Centro', 19.292000, -99.170000, 14200, 0.1500, 0.2900),
  (14, 'TLP-002', 'San Andrés Totoltepec', 19.247000, -99.178000, 18300, 0.4700, 0.2700),
  (15, 'VCA-001', 'Moctezuma 2a Sección', 19.429000, -99.100000, 26900, 0.2400, 0.6000),
  (15, 'VCA-002', 'Jardín Balbuena', 19.418000, -99.115000, 31500, 0.2000, 0.5400),
  (16, 'XOC-001', 'Barrio La Asunción', 19.262000, -99.105000, 7600, 0.3300, 0.3100),
  (16, 'XOC-002', 'Santa Cruz Acalpixca', 19.258000, -99.074000, 17200, 0.5000, 0.2800);
