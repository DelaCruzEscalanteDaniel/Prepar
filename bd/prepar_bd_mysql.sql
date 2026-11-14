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

