DROP DATABASE IF EXISTS prepar;
CREATE DATABASE prepar CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE prepar;

CREATE TABLE parametros_sistema (
  clave        VARCHAR(50)   NOT NULL PRIMARY KEY,
  valor        VARCHAR(1000) NOT NULL,
  tipo         VARCHAR(8)    NOT NULL DEFAULT 'texto' CHECK (tipo IN ('texto', 'entero', 'decimal', 'booleano', 'json')),
  descripcion  VARCHAR(250)  NULL,
  actualizado_en DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE fuentes_externas (
  id                   SMALLINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  clave                VARCHAR(40)   NOT NULL UNIQUE,
  nombre               VARCHAR(100)  NOT NULL,
  proveedor            VARCHAR(100)  NOT NULL,
  tipo                 VARCHAR(15)   NOT NULL CHECK (tipo IN ('datos', 'geocodificacion', 'mapa', 'correo', 'almacenamiento')),
  entidad_destino      VARCHAR(40)   NULL,
  url_base             VARCHAR(255)  NOT NULL,
  recurso              VARCHAR(255)  NULL,
  formato              VARCHAR(7)    NOT NULL DEFAULT 'json' CHECK (formato IN ('json', 'geojson', 'csv', 'xml', 'png')),
  autenticacion        VARCHAR(7)    NOT NULL DEFAULT 'ninguna' CHECK (autenticacion IN ('ninguna', 'api_key', 'token', 'oauth')),
  variable_credencial  VARCHAR(60)   NULL,
  frecuencia_minutos   INT           NULL,
  limite_por_segundo   DECIMAL(6,2)  NULL,
  atribucion           VARCHAR(250)  NULL,
  licencia             VARCHAR(100)  NULL,
  activa               BOOLEAN       NOT NULL DEFAULT TRUE,
  ultima_sincronizacion_exitosa DATETIME NULL,
  creada_en            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_fuente_frecuencia CHECK (frecuencia_minutos IS NULL OR frecuencia_minutos > 0)
);

CREATE TABLE sincronizaciones (
  id                BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  fuente_id         SMALLINT     NOT NULL,
  disparada_por     VARCHAR(10)  NOT NULL DEFAULT 'programada' CHECK (disparada_por IN ('programada', 'manual')),
  usuario_id        INT          NULL,
  iniciada_en       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finalizada_en     DATETIME     NULL,
  estado            VARCHAR(9)   NOT NULL DEFAULT 'en_curso' CHECK (estado IN ('en_curso', 'exitosa', 'parcial', 'fallida')),
  registros_leidos  INT          NOT NULL DEFAULT 0,
  nuevos            INT          NOT NULL DEFAULT 0,
  actualizados      INT          NOT NULL DEFAULT 0,
  sin_cambios       INT          NOT NULL DEFAULT 0,
  omitidos          INT          NOT NULL DEFAULT 0,
  con_error         INT          NOT NULL DEFAULT 0,
  mensaje           VARCHAR(1000) NULL,
  KEY ix_sync_fuente (fuente_id, iniciada_en),
  CONSTRAINT fk_sync_fuente FOREIGN KEY (fuente_id) REFERENCES fuentes_externas(id)
);

CREATE TABLE sincronizacion_errores (
  id                 BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sincronizacion_id  BIGINT       NOT NULL,
  id_externo         VARCHAR(100) NULL,
  mensaje            VARCHAR(500) NOT NULL,
  datos              JSON         NULL,
  creado_en          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_syncerr_sync FOREIGN KEY (sincronizacion_id) REFERENCES sincronizaciones(id) ON DELETE CASCADE
);

CREATE TABLE geocodificaciones (
  id               BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  consulta_hash    CHAR(64)      NOT NULL UNIQUE,
  consulta         VARCHAR(300)  NOT NULL,
  fuente_id        SMALLINT      NULL,
  exito            BOOLEAN       NOT NULL,
  latitud          DECIMAL(9,6)  NULL,
  longitud         DECIMAL(9,6)  NULL,
  direccion_encontrada VARCHAR(300) NULL,
  respuesta        JSON          NULL,
  consultado_en    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usos             INT           NOT NULL DEFAULT 1,
  CONSTRAINT fk_geo_fuente FOREIGN KEY (fuente_id) REFERENCES fuentes_externas(id),
  CONSTRAINT ck_geo_coords CHECK ((latitud IS NULL AND longitud IS NULL) OR (latitud IS NOT NULL AND longitud IS NOT NULL))
);

CREATE TABLE alcaldias (
  id      SMALLINT     NOT NULL AUTO_INCREMENT PRIMARY KEY,
  clave   CHAR(3)      NOT NULL UNIQUE,
  nombre  VARCHAR(50)  NOT NULL UNIQUE,
  latitud         DECIMAL(9,6) NULL,
  longitud        DECIMAL(9,6) NULL,
  limite_geojson  JSON         NULL,
  origen          VARCHAR(6)   NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual', 'api')),
  fuente_id       SMALLINT     NULL,
  id_externo      VARCHAR(100) NULL,
  hash_datos      CHAR(64)     NULL,
  datos_externos  JSON         NULL,
  sincronizado_en DATETIME     NULL,
  UNIQUE KEY uk_alcaldia_externo (fuente_id, id_externo),
  CONSTRAINT fk_alcaldia_fuente FOREIGN KEY (fuente_id) REFERENCES fuentes_externas(id)
);

CREATE TABLE unidades_territoriales (
  id           INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  alcaldia_id  SMALLINT     NOT NULL,
  clave        VARCHAR(20)  NOT NULL UNIQUE,
  nombre       VARCHAR(100) NOT NULL,
  tipo         VARCHAR(19) NOT NULL DEFAULT 'colonia' CHECK (tipo IN ('colonia', 'barrio', 'pueblo_originario', 'unidad_habitacional')),
  latitud      DECIMAL(9,6) NULL,
  longitud     DECIMAL(9,6) NULL,
  activa       BOOLEAN      NOT NULL DEFAULT TRUE,
  limite_geojson  JSON         NULL,
  origen          VARCHAR(6)   NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual', 'api')),
  fuente_id       SMALLINT     NULL,
  id_externo      VARCHAR(100) NULL,
  hash_datos      CHAR(64)     NULL,
  datos_externos  JSON         NULL,
  sincronizado_en DATETIME     NULL,
  UNIQUE KEY uk_ut_nombre (alcaldia_id, nombre),
  UNIQUE KEY uk_ut_externo (fuente_id, id_externo),
  CONSTRAINT fk_ut_alcaldia FOREIGN KEY (alcaldia_id) REFERENCES alcaldias(id),
  CONSTRAINT fk_ut_fuente   FOREIGN KEY (fuente_id) REFERENCES fuentes_externas(id),
  CONSTRAINT ck_ut_latitud  CHECK (latitud  BETWEEN -90  AND 90),
  CONSTRAINT ck_ut_longitud CHECK (longitud BETWEEN -180 AND 180)
);

CREATE TABLE fases (
  id                   SMALLINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  clave                VARCHAR(30)   NOT NULL UNIQUE,
  orden                SMALLINT      NOT NULL UNIQUE,
  nombre_es            VARCHAR(60)   NOT NULL,
  nombre_en            VARCHAR(60)   NOT NULL,
  que_ocurre_es        VARCHAR(1000) NULL,
  que_ocurre_en        VARCHAR(1000) NULL,
  que_puedes_hacer_es  VARCHAR(1000) NULL,
  que_puedes_hacer_en  VARCHAR(1000) NULL
);

CREATE TABLE rubros (
  id           SMALLINT     NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nombre_es    VARCHAR(80)  NOT NULL UNIQUE,
  nombre_en    VARCHAR(80)  NOT NULL,
  descripcion  VARCHAR(250) NULL,
  activo       BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE criterios_dictamen (
  id           SMALLINT     NOT NULL AUTO_INCREMENT PRIMARY KEY,
  clave        VARCHAR(30)  NOT NULL UNIQUE,
  nombre_es    VARCHAR(100) NOT NULL,
  nombre_en    VARCHAR(100) NOT NULL,
  descripcion  VARCHAR(250) NULL,
  orden        SMALLINT     NOT NULL DEFAULT 0,
  activo       BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE indicadores (
  id           SMALLINT     NOT NULL AUTO_INCREMENT PRIMARY KEY,
  clave        VARCHAR(40)  NOT NULL UNIQUE,
  nombre_es    VARCHAR(100) NOT NULL,
  nombre_en    VARCHAR(100) NOT NULL,
  unidad_medida VARCHAR(30) NULL,
  descripcion  VARCHAR(250) NULL
);

CREATE TABLE indicadores_unidad (
  id                     BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  unidad_territorial_id  INT           NOT NULL,
  indicador_id           SMALLINT      NOT NULL,
  periodo                SMALLINT      NOT NULL,
  valor                  DECIMAL(16,4) NOT NULL,
  fuente_id              SMALLINT      NULL,
  hash_datos             CHAR(64)      NULL,
  datos_externos         JSON          NULL,
  sincronizado_en        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_indicador_periodo (unidad_territorial_id, indicador_id, periodo),
  CONSTRAINT fk_iu_ut        FOREIGN KEY (unidad_territorial_id) REFERENCES unidades_territoriales(id),
  CONSTRAINT fk_iu_indicador FOREIGN KEY (indicador_id) REFERENCES indicadores(id),
  CONSTRAINT fk_iu_fuente    FOREIGN KEY (fuente_id) REFERENCES fuentes_externas(id)
);

CREATE TABLE avisos_privacidad (
  version        VARCHAR(10)    NOT NULL PRIMARY KEY,
  texto_es       TEXT           NOT NULL,
  texto_en       TEXT           NULL,
  vigente_desde  DATE           NOT NULL
);

CREATE TABLE terminos_condiciones (
  version        VARCHAR(10)    NOT NULL PRIMARY KEY,
  texto_es       TEXT           NOT NULL,
  texto_en       TEXT           NULL,
  vigente_desde  DATE           NOT NULL
);

CREATE TABLE usuarios (
  id               INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rol              VARCHAR(13) NOT NULL CHECK (rol IN ('ciudadano', 'funcionario', 'administrador')),
  nombre_completo  VARCHAR(50)  NOT NULL,
  correo           VARCHAR(50)  NOT NULL UNIQUE,
  password_hash    VARCHAR(255) NOT NULL,
  estado           VARCHAR(11) NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'suspendida', 'desactivada')),
  idioma           CHAR(2)      NOT NULL DEFAULT 'es',
  recibir_correos  BOOLEAN      NOT NULL DEFAULT TRUE,
  intentos_fallidos TINYINT     NOT NULL DEFAULT 0,
  bloqueado_hasta  DATETIME     NULL,
  creado_en        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT ck_usuarios_correo CHECK (correo REGEXP '^[^@ ]+@[^@ ]+\\.[^@ ]+$'),
  CONSTRAINT ck_usuarios_idioma CHECK (idioma IN ('es','en'))
);

CREATE TABLE sesiones (
  id                BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  usuario_id        INT         NOT NULL,
  token_hash        CHAR(64)    NOT NULL UNIQUE,
  creada_en         DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultima_actividad  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cerrada_en        DATETIME    NULL,
  CONSTRAINT fk_sesion_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE tokens_recuperacion (
  id          BIGINT    NOT NULL AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT       NOT NULL,
  token_hash  CHAR(64)  NOT NULL UNIQUE,
  expira_en   DATETIME  NOT NULL,
  usado_en    DATETIME  NULL,
  creado_en   DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_token_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE tokens_verificacion (
  id          BIGINT    NOT NULL AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT       NOT NULL,
  token_hash  CHAR(64)  NOT NULL UNIQUE,
  expira_en   DATETIME  NOT NULL,
  usado_en    DATETIME  NULL,
  creado_en   DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_tokver_usuario (usuario_id),
  CONSTRAINT fk_tokver_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE archivos (
  id              BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  uuid            CHAR(36)      NOT NULL UNIQUE,
  categoria       VARCHAR(16)   NOT NULL CHECK (categoria IN ('imagen_proyecto', 'foto_reporte', 'convocatoria',
                                                            'comprobante', 'reporte', 'exportacion', 'imagen_sistema',
                                                            'foto_perfil')),
  nombre_original VARCHAR(255)  NOT NULL,
  tipo_mime       VARCHAR(50)   NOT NULL,
  tamano_bytes    INT           NOT NULL,
  sha256          CHAR(64)      NOT NULL,
  ancho_px        SMALLINT      NULL,
  alto_px         SMALLINT      NULL,
  almacenamiento  VARCHAR(10)   NOT NULL DEFAULT 'base_datos' CHECK (almacenamiento IN ('base_datos', 'externo')),
  url_externa     VARCHAR(500)  NULL,
  fuente_id       SMALLINT      NULL,
  subido_por      INT           NULL,
  subido_en       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  eliminado_en    DATETIME      NULL,
  KEY ix_archivos_categoria (categoria, subido_en),
  CONSTRAINT fk_archivo_usuario FOREIGN KEY (subido_por) REFERENCES usuarios(id),
  CONSTRAINT fk_archivo_fuente  FOREIGN KEY (fuente_id) REFERENCES fuentes_externas(id),
  CONSTRAINT ck_archivo_tamano  CHECK (tamano_bytes > 0 AND tamano_bytes <= 20971520),
  CONSTRAINT ck_archivo_imagen  CHECK (categoria NOT IN ('imagen_proyecto', 'foto_reporte', 'imagen_sistema', 'foto_perfil')
                                       OR (tipo_mime IN ('image/jpeg', 'image/png') AND tamano_bytes <= 5242880)),
  CONSTRAINT ck_archivo_pdf     CHECK (categoria NOT IN ('convocatoria', 'comprobante', 'reporte')
                                       OR tipo_mime = 'application/pdf'),
  CONSTRAINT ck_archivo_externo CHECK (almacenamiento = 'base_datos' OR url_externa IS NOT NULL)
);

CREATE TABLE archivos_contenido (
  archivo_id  BIGINT     NOT NULL PRIMARY KEY,
  contenido   LONGBLOB   NOT NULL,
  miniatura   MEDIUMBLOB NULL,
  CONSTRAINT fk_contenido_archivo FOREIGN KEY (archivo_id) REFERENCES archivos(id) ON DELETE CASCADE
);

ALTER TABLE usuarios
  ADD COLUMN foto_archivo_id BIGINT NULL AFTER recibir_correos,
  ADD CONSTRAINT fk_usuario_foto FOREIGN KEY (foto_archivo_id) REFERENCES archivos(id);

ALTER TABLE usuarios
  ADD COLUMN telefono VARCHAR(10) NULL AFTER foto_archivo_id,
  ADD CONSTRAINT ck_usuarios_telefono CHECK (telefono IS NULL OR telefono REGEXP '^[0-9]{10}$');

ALTER TABLE usuarios
  ADD COLUMN correo_verificado_en DATETIME NULL AFTER bloqueado_hasta,
  ADD COLUMN eliminado_en DATETIME NULL AFTER correo_verificado_en;

ALTER TABLE usuarios
  ADD COLUMN terminos_version VARCHAR(10) NULL AFTER telefono,
  ADD COLUMN terminos_aceptados_en DATETIME NULL AFTER terminos_version,
  ADD CONSTRAINT fk_usuario_terminos FOREIGN KEY (terminos_version) REFERENCES terminos_condiciones(version);

CREATE TABLE ciudadanos (
  usuario_id                    INT      NOT NULL PRIMARY KEY,
  fecha_nacimiento              DATE     NOT NULL,
  genero                        VARCHAR(17) NOT NULL CHECK (genero IN ('mujer', 'hombre', 'no_binario', 'prefiero_no_decir')),
  unidad_territorial_id         INT      NOT NULL,
  aviso_privacidad_aceptado_en  DATETIME NOT NULL,
  aviso_privacidad_version      VARCHAR(10) NULL,
  CONSTRAINT fk_ciudadano_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_ciudadano_aviso   FOREIGN KEY (aviso_privacidad_version) REFERENCES avisos_privacidad(version),
  CONSTRAINT fk_ciudadano_ut FOREIGN KEY (unidad_territorial_id) REFERENCES unidades_territoriales(id)
);

CREATE TABLE funcionarios (
  usuario_id             INT      NOT NULL PRIMARY KEY,
  alcaldia_id            SMALLINT NOT NULL,
  debe_cambiar_password  BOOLEAN  NOT NULL DEFAULT TRUE,
  registrado_por         INT      NULL,
  CONSTRAINT fk_funcionario_usuario  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_funcionario_alcaldia FOREIGN KEY (alcaldia_id) REFERENCES alcaldias(id),
  CONSTRAINT fk_funcionario_admin    FOREIGN KEY (registrado_por) REFERENCES usuarios(id)
);

CREATE TABLE funcionario_funciones (
  funcionario_id  INT NOT NULL,
  funcion         VARCHAR(18) NOT NULL CHECK (funcion IN ('directorio', 'moderacion', 'revision_registros', 'dictaminacion', 'consulta', 'seguimiento')),
  PRIMARY KEY (funcionario_id, funcion),
  CONSTRAINT fk_funciones_funcionario FOREIGN KEY (funcionario_id) REFERENCES funcionarios(usuario_id) ON DELETE CASCADE
);

CREATE TABLE suspensiones_cuenta (
  id                BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ciudadano_id      INT          NOT NULL,
  accion            VARCHAR(9) NOT NULL CHECK (accion IN ('suspender', 'reactivar')),
  motivo            VARCHAR(250) NULL,
  administrador_id  INT          NULL,
  realizada_en      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_susp_ciudadano FOREIGN KEY (ciudadano_id) REFERENCES ciudadanos(usuario_id) ON DELETE CASCADE,
  CONSTRAINT fk_susp_admin     FOREIGN KEY (administrador_id) REFERENCES usuarios(id),
  CONSTRAINT ck_susp_motivo    CHECK (accion = 'reactivar' OR COALESCE(TRIM(motivo), '') <> '')
);
