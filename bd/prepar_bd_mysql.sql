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

CREATE TABLE ciclos (
  id                         INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nombre                     VARCHAR(50)   NOT NULL,
  anio_simulado              SMALLINT      NOT NULL,
  presupuesto_total          DECIMAL(14,2) NOT NULL,
  porcentaje_partes_iguales  DECIMAL(5,2)  NOT NULL DEFAULT 50,
  convocatoria_archivo_id    BIGINT        NULL,
  origen_indices             VARCHAR(9)    NOT NULL DEFAULT 'api' CHECK (origen_indices IN ('api', 'aleatorio', 'manual')),
  tipo                       VARCHAR(8)    NOT NULL DEFAULT 'practica' CHECK (tipo IN ('oficial', 'practica')),
  pausado_en                 DATETIME      NULL,
  estado                     VARCHAR(8) NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'activo', 'cerrado')),
  fase_actual_id             SMALLINT      NULL,
  votacion_abierta           BOOLEAN       NOT NULL DEFAULT FALSE,
  votacion_abierta_en        DATETIME      NULL,
  votacion_cerrada_en        DATETIME      NULL,
  computo_realizado_en       DATETIME      NULL,
  resultados_publicados_en   DATETIME      NULL,
  creado_por                 INT           NULL,
  creado_en                  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cerrado_en                 DATETIME      NULL,
  activo_unico               TINYINT GENERATED ALWAYS AS (IF(estado = 'activo', 1, NULL)) STORED,
  UNIQUE KEY uk_un_ciclo_activo (activo_unico),
  CONSTRAINT fk_ciclo_fase  FOREIGN KEY (fase_actual_id) REFERENCES fases(id),
  CONSTRAINT fk_ciclo_convocatoria FOREIGN KEY (convocatoria_archivo_id) REFERENCES archivos(id),
  CONSTRAINT fk_ciclo_admin FOREIGN KEY (creado_por) REFERENCES usuarios(id),
  CONSTRAINT ck_ciclo_anio  CHECK (anio_simulado BETWEEN 2000 AND 2100),
  CONSTRAINT ck_ciclo_monto CHECK (presupuesto_total > 0),
  CONSTRAINT ck_ciclo_pct   CHECK (porcentaje_partes_iguales BETWEEN 0 AND 100)
);

CREATE TABLE ciclo_fases (
  ciclo_id      INT      NOT NULL,
  fase_id       SMALLINT NOT NULL,
  fecha_inicio  DATE     NOT NULL,
  fecha_fin     DATE     NOT NULL,
  PRIMARY KEY (ciclo_id, fase_id),
  CONSTRAINT fk_cf_ciclo FOREIGN KEY (ciclo_id) REFERENCES ciclos(id) ON DELETE CASCADE,
  CONSTRAINT fk_cf_fase  FOREIGN KEY (fase_id) REFERENCES fases(id),
  CONSTRAINT ck_cf_fechas CHECK (fecha_fin >= fecha_inicio)
);

CREATE TABLE ciclo_unidades (
  ciclo_id               INT           NOT NULL,
  unidad_territorial_id  INT           NOT NULL,
  poblacion              INT           NOT NULL DEFAULT 0,
  poblacion_flotante     INT           NOT NULL DEFAULT 0,
  indice_pobreza         DECIMAL(5,4)  NOT NULL DEFAULT 0,
  indice_delictivo       DECIMAL(5,4)  NOT NULL DEFAULT 0,
  es_pueblo_originario   BOOLEAN       NOT NULL DEFAULT FALSE,
  presupuesto_asignado   DECIMAL(14,2) NULL,
  PRIMARY KEY (ciclo_id, unidad_territorial_id),
  CONSTRAINT fk_cu_ciclo FOREIGN KEY (ciclo_id) REFERENCES ciclos(id) ON DELETE CASCADE,
  CONSTRAINT fk_cu_ut    FOREIGN KEY (unidad_territorial_id) REFERENCES unidades_territoriales(id),
  CONSTRAINT ck_cu_indices CHECK (indice_pobreza BETWEEN 0 AND 1 AND indice_delictivo BETWEEN 0 AND 1
                                  AND poblacion >= 0 AND poblacion_flotante >= 0)
);

CREATE TABLE avisos (
  id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ciclo_id      INT          NOT NULL DEFAULT 0,
  autor_id      INT          NOT NULL DEFAULT 0,
  alcaldia_id   SMALLINT     NULL,
  titulo        VARCHAR(100) NOT NULL,
  mensaje       VARCHAR(500) NOT NULL,
  publicado_en  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activo        BOOLEAN      NOT NULL DEFAULT TRUE,
  vigente_hasta DATE         NULL,
  CONSTRAINT fk_aviso_ciclo    FOREIGN KEY (ciclo_id) REFERENCES ciclos(id) ON DELETE CASCADE,
  CONSTRAINT fk_aviso_autor    FOREIGN KEY (autor_id) REFERENCES usuarios(id),
  CONSTRAINT fk_aviso_alcaldia FOREIGN KEY (alcaldia_id) REFERENCES alcaldias(id)
);

CREATE TABLE directorio (
  id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  alcaldia_id     SMALLINT     NOT NULL,
  tipo            VARCHAR(13) NOT NULL CHECK (tipo IN ('alcaldia', 'titular', 'sede_atencion')),
  cargo           VARCHAR(50)  NOT NULL,
  nombre_titular  VARCHAR(50)  NULL,
  temas           VARCHAR(100) NULL,
  direccion       VARCHAR(150) NULL,
  telefono        CHAR(10)     NULL,
  correo          VARCHAR(50)  NULL,
  sitio_web       VARCHAR(100) NULL,
  origen          VARCHAR(6)   NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual', 'api')),
  fuente_id       SMALLINT     NULL,
  id_externo      VARCHAR(100) NULL,
  hash_datos      CHAR(64)     NULL,
  datos_externos  JSON         NULL,
  sincronizado_en DATETIME     NULL,
  editado_manualmente BOOLEAN  NOT NULL DEFAULT FALSE,
  fuente_nombre   VARCHAR(150) NULL,
  fuente_url      VARCHAR(300) NULL,
  consultado_en   DATE         NULL,
  actualizado_por INT          NULL,
  actualizado_en  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_dir_alcaldia FOREIGN KEY (alcaldia_id) REFERENCES alcaldias(id),
  CONSTRAINT fk_dir_usuario  FOREIGN KEY (actualizado_por) REFERENCES usuarios(id),
  CONSTRAINT fk_dir_fuente   FOREIGN KEY (fuente_id) REFERENCES fuentes_externas(id),
  UNIQUE KEY uk_dir_externo (fuente_id, id_externo),
  CONSTRAINT ck_dir_telefono CHECK (telefono REGEXP '^[0-9]{10}$')
);

CREATE TABLE directorio_ciudad (
  id             SMALLINT     NOT NULL AUTO_INCREMENT PRIMARY KEY,
  orden          SMALLINT     NOT NULL DEFAULT 100,
  institucion    VARCHAR(80)  NOT NULL,
  cargo          VARCHAR(80)  NOT NULL,
  nombre_titular VARCHAR(60)  NULL,
  temas          VARCHAR(200) NULL,
  direccion      VARCHAR(200) NULL,
  telefono       CHAR(10)     NULL,
  correo         VARCHAR(60)  NULL,
  sitio_web      VARCHAR(120) NULL,
  fuente_nombre  VARCHAR(150) NOT NULL,
  fuente_url     VARCHAR(300) NULL,
  consultado_en  DATE         NOT NULL,
  CONSTRAINT ck_dirc_telefono CHECK (telefono IS NULL OR telefono REGEXP '^[0-9]{10}$')
);

CREATE TABLE ideas (
  id                     BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ciclo_id               INT          NOT NULL DEFAULT 0,
  unidad_territorial_id  INT          NOT NULL DEFAULT 0,
  autor_id               INT          NOT NULL DEFAULT 0,
  rubro_id               SMALLINT     NOT NULL,
  contenido              VARCHAR(500) NOT NULL,
  total_apoyos           INT          NOT NULL DEFAULT 0,
  estado                 VARCHAR(9) NOT NULL DEFAULT 'visible' CHECK (estado IN ('visible', 'oculto', 'eliminado')),
  creada_en              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  editada_en             DATETIME     NULL,
  KEY ix_ideas_foro (ciclo_id, unidad_territorial_id, creada_en),
  CONSTRAINT fk_idea_cu     FOREIGN KEY (ciclo_id, unidad_territorial_id) REFERENCES ciclo_unidades(ciclo_id, unidad_territorial_id),
  CONSTRAINT fk_idea_autor  FOREIGN KEY (autor_id) REFERENCES ciudadanos(usuario_id),
  CONSTRAINT fk_idea_rubro  FOREIGN KEY (rubro_id) REFERENCES rubros(id),
  CONSTRAINT ck_idea_texto  CHECK (COALESCE(TRIM(contenido), '') <> '')
);

CREATE TABLE comentarios_idea (
  id         BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  idea_id    BIGINT       NOT NULL,
  autor_id   INT          NOT NULL DEFAULT 0,
  contenido  VARCHAR(250) NOT NULL,
  estado     VARCHAR(9) NOT NULL DEFAULT 'visible' CHECK (estado IN ('visible', 'oculto', 'eliminado')),
  creado_en  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  editado_en DATETIME     NULL,
  CONSTRAINT fk_ci_idea  FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE,
  CONSTRAINT fk_ci_autor FOREIGN KEY (autor_id) REFERENCES ciudadanos(usuario_id),
  CONSTRAINT ck_ci_texto CHECK (COALESCE(TRIM(contenido), '') <> '')
);

CREATE TABLE apoyos_idea (
  idea_id       BIGINT   NOT NULL,
  ciudadano_id  INT      NOT NULL DEFAULT 0,
  creado_en     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (idea_id, ciudadano_id),
  CONSTRAINT fk_apoyo_idea      FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE,
  CONSTRAINT fk_apoyo_ciudadano FOREIGN KEY (ciudadano_id) REFERENCES ciudadanos(usuario_id)
);

CREATE TABLE folio_consecutivos (
  anio         SMALLINT NOT NULL,
  alcaldia_id  SMALLINT NOT NULL,
  ultimo       INT      NOT NULL DEFAULT 0,
  PRIMARY KEY (anio, alcaldia_id),
  CONSTRAINT fk_folio_alcaldia FOREIGN KEY (alcaldia_id) REFERENCES alcaldias(id)
);

CREATE TABLE proyectos (
  id                     BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  folio                  VARCHAR(20)   NULL UNIQUE,
  ciclo_id               INT           NOT NULL DEFAULT 0,
  unidad_territorial_id  INT           NOT NULL DEFAULT 0,
  proponente_id          INT           NOT NULL DEFAULT 0,
  idea_id                BIGINT        NULL,
  titulo                 VARCHAR(100)  NOT NULL,
  descripcion            VARCHAR(500)  NOT NULL,
  rubro_id               SMALLINT      NOT NULL,
  costo_estimado         DECIMAL(14,2) NOT NULL,
  calle                  VARCHAR(100)  NOT NULL,
  numero                 VARCHAR(10)   NULL,
  referencias            VARCHAR(100)  NULL,
  codigo_postal          CHAR(5)       NULL CHECK (codigo_postal IS NULL OR codigo_postal REGEXP '^[0-9]{5}$'),
  latitud                DECIMAL(9,6)  NULL,
  longitud               DECIMAL(9,6)  NULL,
  estado_ubicacion       VARCHAR(10) NOT NULL DEFAULT 'pendiente' CHECK (estado_ubicacion IN ('pendiente', 'ubicado', 'no_ubicado', 'corregido')),
  imagen_archivo_id      BIGINT        NULL,
  geocodificacion_id     BIGINT        NULL,
  estatus                VARCHAR(16)
                         NOT NULL DEFAULT 'registrado' CHECK (estatus IN ('registrado', 'en_dictaminacion', 'viable', 'no_viable', 'en_consulta', 'ganador', 'en_ejecucion', 'concluido', 'inejecutable', 'retirado')),
  numero_sorteo          SMALLINT      NULL,
  avance_porcentaje      DECIMAL(5,2)  NOT NULL DEFAULT 0,
  monto_ejercido         DECIMAL(14,2) NOT NULL DEFAULT 0,
  estado_moderacion      VARCHAR(9) NOT NULL DEFAULT 'visible' CHECK (estado_moderacion IN ('visible', 'oculto', 'eliminado')),
  creado_en              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_numero_boleta (ciclo_id, unidad_territorial_id, numero_sorteo),
  KEY ix_proyectos_estatus (ciclo_id, unidad_territorial_id, estatus),
  CONSTRAINT fk_proy_cu         FOREIGN KEY (ciclo_id, unidad_territorial_id) REFERENCES ciclo_unidades(ciclo_id, unidad_territorial_id),
  CONSTRAINT fk_proy_proponente FOREIGN KEY (proponente_id) REFERENCES ciudadanos(usuario_id),
  CONSTRAINT fk_proy_idea       FOREIGN KEY (idea_id) REFERENCES ideas(id),
  CONSTRAINT fk_proy_rubro      FOREIGN KEY (rubro_id) REFERENCES rubros(id),
  CONSTRAINT fk_proy_imagen     FOREIGN KEY (imagen_archivo_id) REFERENCES archivos(id),
  CONSTRAINT fk_proy_geo        FOREIGN KEY (geocodificacion_id) REFERENCES geocodificaciones(id),
  CONSTRAINT ck_proy_costo      CHECK (costo_estimado > 0),
  CONSTRAINT ck_proy_avance     CHECK (avance_porcentaje BETWEEN 0 AND 100 AND monto_ejercido >= 0),
  CONSTRAINT ck_proy_sorteo     CHECK (numero_sorteo > 0),
  CONSTRAINT ck_proy_textos     CHECK (COALESCE(TRIM(titulo), '') <> '' AND COALESCE(TRIM(descripcion), '') <> ''),
  CONSTRAINT ck_proy_coords     CHECK ((latitud IS NULL AND longitud IS NULL) OR (latitud IS NOT NULL AND longitud IS NOT NULL))
);

CREATE TABLE categorias_proyecto (
  clave      VARCHAR(20)  NOT NULL PRIMARY KEY,
  nombre_es  VARCHAR(60)  NOT NULL,
  nombre_en  VARCHAR(60)  NOT NULL,
  color      CHAR(7)      NOT NULL,
  icono      VARCHAR(12)  NOT NULL DEFAULT 'proyecto',
  palabras   VARCHAR(400) NOT NULL DEFAULT '',
  orden      SMALLINT     NOT NULL DEFAULT 100,
  activa     BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_cat_clave  CHECK (clave REGEXP '^[a-z][a-z0-9_]{1,19}$'),
  CONSTRAINT ck_cat_color  CHECK (color REGEXP '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT ck_cat_nombre CHECK (TRIM(nombre_es) <> '' AND TRIM(nombre_en) <> '')
);

INSERT INTO categorias_proyecto (clave, nombre_es, nombre_en, color, icono, palabras, orden) VALUES
  ('areas_verdes', 'Parques, huertos y áreas verdes', 'Parks, gardens and green areas', '#3FA34D', 'arbol', 'parque, jardin, huerto, arbol, arbolado, area verde, areas verdes, reforest, pasto, vivero, composta, camellon', 10),
  ('vialidad', 'Calles, bacheo y banquetas', 'Streets, potholes and sidewalks', '#8A94A6', 'cono', 'bache, bacheo, banqueta, pavimen, calle, vialidad, rampa, guarnici, asfalto, paso peatonal, ciclovia, tope', 20),
  ('alumbrado', 'Alumbrado público', 'Street lighting', '#C9A227', 'foco', 'alumbrad, luminari, lampara, ilumina, foco, poste de luz, luz', 30),
  ('recreacion', 'Centros recreativos, deporte y cultura', 'Recreation, sports and culture centers', '#A78BFA', 'estrella', 'deportiv, cancha, gimnasio, juegos, recreativ, cultural, taller, musica, pintura, teatro, biblioteca, centro comunitario, skate, alberca, ludoteca', 40),
  ('seguridad', 'Cámaras y seguridad', 'Cameras and security', '#E55E54', 'escudo', 'camara, videovigil, seguridad, alarma, vigilancia', 50),
  ('agua', 'Agua, pozos y drenaje', 'Water, wells and drainage', '#3B9EDB', 'gota', 'agua, drenaje, pozo, bebedero, coladera, cisterna, tinaco, potable, fuga, inundaci, alcantarill', 60),
  ('mobiliario', 'Plazas y mobiliario urbano', 'Plazas and street furniture', '#C07F4E', 'banca', 'plaza, mobiliario, banca, bote de basura, botes de basura, jardinera, kiosco, techumbre, senaletica, parada', 70),
  ('otro', 'Otro', 'Other', '#5F7387', 'proyecto', '', 999);

ALTER TABLE proyectos
  ADD COLUMN categoria VARCHAR(20) NULL AFTER rubro_id,
  ADD CONSTRAINT fk_proy_categoria FOREIGN KEY (categoria) REFERENCES categorias_proyecto(clave);

CREATE TABLE historial_estatus_proyecto (
  id                BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  proyecto_id       BIGINT      NOT NULL,
  estatus_anterior  VARCHAR(20) NULL,
  estatus_nuevo     VARCHAR(20) NOT NULL,
  usuario_id        INT         NULL,
  cambiado_en       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_hist_proyecto FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE
);

CREATE TABLE revisiones_registro (
  id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  proyecto_id     BIGINT       NOT NULL,
  funcionario_id  INT          NULL,
  resultado       VARCHAR(21) NOT NULL CHECK (resultado IN ('completo', 'correccion_solicitada')),
  observacion     VARCHAR(250) NULL,
  revisado_en     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  correccion_unica BIGINT GENERATED ALWAYS AS (IF(resultado = 'correccion_solicitada', proyecto_id, NULL)) STORED,
  aprobacion_unica BIGINT GENERATED ALWAYS AS (IF(resultado = 'completo', proyecto_id, NULL)) STORED,
  UNIQUE KEY uk_una_correccion (correccion_unica),
  UNIQUE KEY uk_una_aprobacion (aprobacion_unica),
  CONSTRAINT fk_rev_proyecto    FOREIGN KEY (proyecto_id) REFERENCES proyectos(id),
  CONSTRAINT fk_rev_funcionario FOREIGN KEY (funcionario_id) REFERENCES funcionarios(usuario_id),
  CONSTRAINT ck_rev_observacion CHECK (resultado = 'completo' OR COALESCE(TRIM(observacion), '') <> '')
);

CREATE TABLE moderaciones (
  id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  funcionario_id  INT          NULL,
  tipo_objeto     VARCHAR(18) NOT NULL CHECK (tipo_objeto IN ('idea', 'comentario_idea', 'proyecto', 'comentario_reporte')),
  objeto_id       BIGINT       NOT NULL,
  accion          VARCHAR(9) NOT NULL CHECK (accion IN ('ocultar', 'eliminar', 'restaurar')),
  motivo          VARCHAR(250) NOT NULL,
  realizada_en    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_moderacion_objeto (tipo_objeto, objeto_id),
  CONSTRAINT fk_mod_funcionario FOREIGN KEY (funcionario_id) REFERENCES funcionarios(usuario_id),
  CONSTRAINT ck_mod_motivo CHECK (COALESCE(TRIM(motivo), '') <> '')
);

CREATE TABLE dictamenes (
  id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  proyecto_id     BIGINT       NOT NULL UNIQUE,
  funcionario_id  INT          NULL,
  resultado       VARCHAR(9) NULL CHECK (resultado IN ('viable', 'no_viable')),
  justificacion   VARCHAR(500) NULL,
  creado_en       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  emitido_en      DATETIME     NULL,
  CONSTRAINT fk_dict_proyecto    FOREIGN KEY (proyecto_id) REFERENCES proyectos(id),
  CONSTRAINT fk_dict_funcionario FOREIGN KEY (funcionario_id) REFERENCES funcionarios(usuario_id),
  CONSTRAINT ck_dict_emitido CHECK (emitido_en IS NULL OR (resultado IS NOT NULL AND COALESCE(TRIM(justificacion), '') <> ''))
);

CREATE TABLE dictamen_criterios (
  dictamen_id  BIGINT       NOT NULL,
  criterio_id  SMALLINT     NOT NULL,
  cumple       BOOLEAN      NOT NULL,
  observacion  VARCHAR(250) NULL,
  PRIMARY KEY (dictamen_id, criterio_id),
  CONSTRAINT fk_dc_dictamen FOREIGN KEY (dictamen_id) REFERENCES dictamenes(id),
  CONSTRAINT fk_dc_criterio FOREIGN KEY (criterio_id) REFERENCES criterios_dictamen(id)
);

CREATE TABLE sorteos (
  id                     BIGINT   NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ciclo_id               INT      NOT NULL,
  unidad_territorial_id  INT      NOT NULL,
  funcionario_id         INT      NULL,
  realizado_en           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  boleta_publicada_en    DATETIME NULL,
  UNIQUE KEY uk_sorteo (ciclo_id, unidad_territorial_id),
  CONSTRAINT fk_sorteo_cu FOREIGN KEY (ciclo_id, unidad_territorial_id) REFERENCES ciclo_unidades(ciclo_id, unidad_territorial_id),
  CONSTRAINT fk_sorteo_funcionario FOREIGN KEY (funcionario_id) REFERENCES funcionarios(usuario_id)
);

CREATE TABLE participaciones (
  ciclo_id               INT         NOT NULL,
  ciudadano_id           INT         NOT NULL,
  unidad_territorial_id  INT         NOT NULL,
  folio_comprobante      VARCHAR(20) NOT NULL UNIQUE,
  participo_en           DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ciclo_id, ciudadano_id),
  CONSTRAINT fk_part_ciclo     FOREIGN KEY (ciclo_id) REFERENCES ciclos(id),
  CONSTRAINT fk_part_ciudadano FOREIGN KEY (ciudadano_id) REFERENCES ciudadanos(usuario_id),
  CONSTRAINT fk_part_ut        FOREIGN KEY (unidad_territorial_id) REFERENCES unidades_territoriales(id)
);

CREATE TABLE votos (
  id                     CHAR(32) NOT NULL PRIMARY KEY,
  ciclo_id               INT      NOT NULL,
  unidad_territorial_id  INT      NOT NULL,
  proyecto_id            BIGINT   NOT NULL,
  KEY ix_votos_proyecto (proyecto_id),
  CONSTRAINT fk_voto_proyecto FOREIGN KEY (proyecto_id) REFERENCES proyectos(id),
  CONSTRAINT fk_voto_cu FOREIGN KEY (ciclo_id, unidad_territorial_id) REFERENCES ciclo_unidades(ciclo_id, unidad_territorial_id)
);

CREATE TABLE resultados_proyecto (
  proyecto_id            BIGINT   NOT NULL PRIMARY KEY,
  ciclo_id               INT      NOT NULL,
  unidad_territorial_id  INT      NOT NULL,
  total_votos            INT      NOT NULL DEFAULT 0,
  posicion               SMALLINT NULL,
  CONSTRAINT fk_rp_proyecto FOREIGN KEY (proyecto_id) REFERENCES proyectos(id)
);

CREATE TABLE resultados_unidad (
  ciclo_id               INT          NOT NULL,
  unidad_territorial_id  INT          NOT NULL,
  total_votos            INT          NOT NULL DEFAULT 0,
  caso_especial          VARCHAR(12) NULL CHECK (caso_especial IN ('empate', 'unico_viable', 'sin_votos')),
  proyecto_ganador_id    BIGINT       NULL,
  metodo                 VARCHAR(18) NULL CHECK (metodo IN ('votacion', 'asamblea_seleccion', 'asamblea_sorteo')),
  justificacion          VARCHAR(500) NULL,
  resuelto_por           INT          NULL,
  resuelto_en            DATETIME     NULL,
  PRIMARY KEY (ciclo_id, unidad_territorial_id),
  CONSTRAINT fk_ru_cu       FOREIGN KEY (ciclo_id, unidad_territorial_id) REFERENCES ciclo_unidades(ciclo_id, unidad_territorial_id),
  CONSTRAINT fk_ru_ganador  FOREIGN KEY (proyecto_ganador_id) REFERENCES proyectos(id),
  CONSTRAINT fk_ru_funcionario FOREIGN KEY (resuelto_por) REFERENCES funcionarios(usuario_id),
  CONSTRAINT ck_ru_metodo   CHECK ((proyecto_ganador_id IS NULL AND metodo IS NULL) OR (proyecto_ganador_id IS NOT NULL AND metodo IS NOT NULL)),
  CONSTRAINT ck_ru_justif   CHECK (metodo IS NULL OR metodo = 'votacion' OR COALESCE(TRIM(justificacion), '') <> '')
);

CREATE TABLE avances_proyecto (
  id                          BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  proyecto_id                 BIGINT        NOT NULL,
  funcionario_id              INT           NULL,
  porcentaje                  DECIMAL(5,2)  NOT NULL,
  monto_ejercido              DECIMAL(14,2) NOT NULL,
  estatus                     VARCHAR(12) NOT NULL CHECK (estatus IN ('ganador', 'en_ejecucion', 'concluido', 'inejecutable')),
  nota                        VARCHAR(250)  NULL,
  justificacion_inejecutable  VARCHAR(500)  NULL,
  registrado_en               DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_av_proyecto    FOREIGN KEY (proyecto_id) REFERENCES proyectos(id),
  CONSTRAINT fk_av_funcionario FOREIGN KEY (funcionario_id) REFERENCES funcionarios(usuario_id),
  CONSTRAINT ck_av_valores     CHECK (porcentaje BETWEEN 0 AND 100 AND monto_ejercido >= 0),
  CONSTRAINT ck_av_inejecutable CHECK (estatus <> 'inejecutable' OR COALESCE(TRIM(justificacion_inejecutable), '') <> '')
);

CREATE TABLE etapas_rubro (
  id         SMALLINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  rubro_id   SMALLINT      NULL,
  orden      TINYINT       NOT NULL,
  nombre_es  VARCHAR(80)   NOT NULL,
  nombre_en  VARCHAR(80)   NOT NULL,
  peso       DECIMAL(5,2)  NOT NULL,
  UNIQUE KEY uk_etapa_orden (rubro_id, orden),
  CONSTRAINT fk_etapa_rubro FOREIGN KEY (rubro_id) REFERENCES rubros(id) ON DELETE CASCADE,
  CONSTRAINT ck_etapa_peso  CHECK (peso > 0 AND peso <= 100 AND orden > 0)
);

CREATE TABLE etapas_proyecto (
  proyecto_id    BIGINT        NOT NULL,
  etapa_id       SMALLINT      NOT NULL,
  evidencia      VARCHAR(250)  NOT NULL,
  usuario_id     INT           NULL,
  cumplida_en    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (proyecto_id, etapa_id),
  CONSTRAINT fk_ep_proyecto FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE,
  CONSTRAINT fk_ep_etapa    FOREIGN KEY (etapa_id) REFERENCES etapas_rubro(id),
  CONSTRAINT fk_ep_usuario  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT ck_ep_evidencia CHECK (COALESCE(TRIM(evidencia), '') <> '')
);

CREATE TABLE reportes (
  id                  BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  proyecto_id         BIGINT       NOT NULL,
  autor_id            INT          NOT NULL DEFAULT 0,
  tipo                VARCHAR(13) NOT NULL CHECK (tipo IN ('avance', 'irregularidad')),
  descripcion         VARCHAR(500) NOT NULL,
  estatus             VARCHAR(9) NOT NULL DEFAULT 'pendiente' CHECK (estatus IN ('pendiente', 'atendido', 'eliminado')),
  respuesta           VARCHAR(250) NULL,
  motivo_eliminacion  VARCHAR(250) NULL,
  revisado_por        INT          NULL,
  revisado_en         DATETIME     NULL,
  creado_en           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_reportes_proyecto (proyecto_id, creado_en),
  CONSTRAINT fk_rep_proyecto FOREIGN KEY (proyecto_id) REFERENCES proyectos(id),
  CONSTRAINT fk_rep_autor    FOREIGN KEY (autor_id) REFERENCES ciudadanos(usuario_id),
  CONSTRAINT fk_rep_revisor  FOREIGN KEY (revisado_por) REFERENCES funcionarios(usuario_id),
  CONSTRAINT ck_rep_texto     CHECK (COALESCE(TRIM(descripcion), '') <> ''),
  CONSTRAINT ck_rep_atendido  CHECK (estatus <> 'atendido'  OR COALESCE(TRIM(respuesta), '') <> ''),
  CONSTRAINT ck_rep_eliminado CHECK (estatus <> 'eliminado' OR COALESCE(TRIM(motivo_eliminacion), '') <> '')
);

CREATE TABLE reporte_fotos (
  id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  reporte_id    BIGINT       NOT NULL,
  archivo_id    BIGINT       NOT NULL UNIQUE,
  orden         TINYINT      NOT NULL DEFAULT 1,
  subida_en     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_foto_reporte FOREIGN KEY (reporte_id) REFERENCES reportes(id),
  CONSTRAINT fk_foto_archivo FOREIGN KEY (archivo_id) REFERENCES archivos(id)
);

CREATE TABLE comentarios_reporte (
  id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  reporte_id  BIGINT       NOT NULL,
  autor_id    INT          NOT NULL DEFAULT 0,
  contenido   VARCHAR(250) NOT NULL,
  estado      VARCHAR(9) NOT NULL DEFAULT 'visible' CHECK (estado IN ('visible', 'oculto', 'eliminado')),
  creado_en   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cr_reporte FOREIGN KEY (reporte_id) REFERENCES reportes(id),
  CONSTRAINT fk_cr_autor   FOREIGN KEY (autor_id) REFERENCES ciudadanos(usuario_id),
  CONSTRAINT ck_cr_texto   CHECK (COALESCE(TRIM(contenido), '') <> '')
);

CREATE TABLE calificaciones (
  proyecto_id   BIGINT       NOT NULL,
  ciudadano_id  INT          NOT NULL DEFAULT 0,
  puntuacion    TINYINT      NOT NULL,
  comentario    VARCHAR(250) NULL,
  creada_en     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (proyecto_id, ciudadano_id),
  CONSTRAINT fk_cal_proyecto  FOREIGN KEY (proyecto_id) REFERENCES proyectos(id),
  CONSTRAINT fk_cal_ciudadano FOREIGN KEY (ciudadano_id) REFERENCES ciudadanos(usuario_id),
  CONSTRAINT ck_cal_puntuacion CHECK (puntuacion BETWEEN 1 AND 5)
);

CREATE TABLE notificaciones (
  id           BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  usuario_id   INT          NOT NULL,
  tipo         VARCHAR(30)  NOT NULL,
  titulo       VARCHAR(100) NOT NULL,
  mensaje      VARCHAR(500) NOT NULL,
  proyecto_id  BIGINT       NULL,
  leida        BOOLEAN      NOT NULL DEFAULT FALSE,
  creada_en    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_notif_usuario (usuario_id, leida, creada_en),
  CONSTRAINT fk_notif_usuario  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_proyecto FOREIGN KEY (proyecto_id) REFERENCES proyectos(id)
);

CREATE TABLE correos_salida (
  id                 BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  usuario_id         INT          NULL,
  destinatario       VARCHAR(50)  NOT NULL,
  asunto             VARCHAR(150) NOT NULL,
  cuerpo             TEXT         NOT NULL,
  plantilla          VARCHAR(40)  NULL,
  notificacion_id    BIGINT       NULL,
  estado             VARCHAR(9)   NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'enviado', 'fallido', 'cancelado')),
  intentos           TINYINT      NOT NULL DEFAULT 0,
  fuente_id          SMALLINT     NULL,
  id_mensaje_externo VARCHAR(100) NULL,
  ultimo_error       VARCHAR(500) NULL,
  creado_en          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  enviado_en         DATETIME     NULL,
  KEY ix_correos_pendientes (estado, creado_en),
  CONSTRAINT fk_correo_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_correo_notif   FOREIGN KEY (notificacion_id) REFERENCES notificaciones(id) ON DELETE SET NULL,
  CONSTRAINT fk_correo_fuente  FOREIGN KEY (fuente_id) REFERENCES fuentes_externas(id)
);

CREATE TABLE reportes_generados (
  id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ciclo_id      INT          NULL,
  tipo          VARCHAR(20)  NOT NULL CHECK (tipo IN ('cierre_ciclo', 'estadisticas', 'resultados_csv', 'bitacora_csv')),
  archivo_id    BIGINT       NOT NULL,
  filtros       JSON         NULL,
  generado_por  INT          NULL,
  generado_en   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_repgen_ciclo   FOREIGN KEY (ciclo_id) REFERENCES ciclos(id),
  CONSTRAINT fk_repgen_archivo FOREIGN KEY (archivo_id) REFERENCES archivos(id),
  CONSTRAINT fk_repgen_usuario FOREIGN KEY (generado_por) REFERENCES usuarios(id)
);

CREATE TABLE bitacora (
  id            BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  usuario_id    INT         NULL,
  rol           VARCHAR(20) NULL,
  alcaldia_id   SMALLINT    NULL,
  ciclo_id      INT         NULL,
  accion        VARCHAR(60) NOT NULL,
  entidad       VARCHAR(40) NOT NULL,
  entidad_id    VARCHAR(40) NULL,
  detalle       JSON        NULL,
  realizada_en  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_bitacora_filtros (realizada_en, usuario_id, accion),
  CONSTRAINT fk_bit_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE VIEW v_indicadores_recientes AS
SELECT iu.unidad_territorial_id,
       MAX(CASE WHEN i.clave = 'poblacion'            THEN iu.valor END) AS poblacion_actual,
       MAX(CASE WHEN i.clave = 'poblacion_flotante'   THEN iu.valor END) AS poblacion_flotante_actual,
       MAX(CASE WHEN i.clave = 'indice_pobreza'       THEN iu.valor END) AS indice_pobreza_actual,
       MAX(CASE WHEN i.clave = 'incidencia_delictiva' THEN iu.valor END) AS incidencia_delictiva_actual,
       MAX(iu.sincronizado_en) AS actualizado_en
FROM indicadores_unidad iu
JOIN indicadores i ON i.id = iu.indicador_id
WHERE iu.periodo = (SELECT MAX(x.periodo) FROM indicadores_unidad x
                    WHERE x.unidad_territorial_id = iu.unidad_territorial_id AND x.indicador_id = iu.indicador_id)
GROUP BY iu.unidad_territorial_id;
