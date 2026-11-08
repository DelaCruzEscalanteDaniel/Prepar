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

DELIMITER $$

CREATE PROCEDURE sp_error(IN p_mensaje VARCHAR(255))
BEGIN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = p_mensaje;
END$$

CREATE PROCEDURE sp_requiere_admin()
BEGIN
  IF @usuario_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM usuarios WHERE id = @usuario_id AND rol = 'administrador' AND estado = 'activa') THEN
    CALL sp_error('Solo el Administrador puede realizar esta acción');
  END IF;
END$$

CREATE PROCEDURE sp_requiere_funcionario(IN p_funcion VARCHAR(30), IN p_alcaldia SMALLINT)
BEGIN
  IF @usuario_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = @usuario_id AND rol = 'administrador' AND estado = 'activa')
     AND NOT EXISTS (
       SELECT 1 FROM funcionarios f
       JOIN usuarios u ON u.id = f.usuario_id AND u.estado = 'activa'
       WHERE f.usuario_id = @usuario_id
         AND (p_alcaldia IS NULL OR f.alcaldia_id = p_alcaldia)
         AND (p_funcion IS NULL OR EXISTS (SELECT 1 FROM funcionario_funciones ff
                                           WHERE ff.funcionario_id = f.usuario_id AND ff.funcion = p_funcion))) THEN
    CALL sp_error(CONCAT('No tienes la función "', COALESCE(p_funcion, 'funcionario'),
                         '" en la alcaldía de este registro'));
  END IF;
END$$

CREATE PROCEDURE sp_requiere_funcionario_ut(IN p_funcion VARCHAR(30), IN p_ut INT)
BEGIN
  DECLARE v_alcaldia SMALLINT;
  SET v_alcaldia = (SELECT alcaldia_id FROM unidades_territoriales WHERE id = p_ut);
  CALL sp_requiere_funcionario(p_funcion, v_alcaldia);
END$$

CREATE PROCEDURE sp_requiere_funcionario_proyecto(IN p_funcion VARCHAR(30), IN p_proyecto BIGINT)
BEGIN
  DECLARE v_ut INT;
  SET v_ut = (SELECT unidad_territorial_id FROM proyectos WHERE id = p_proyecto);
  CALL sp_requiere_funcionario_ut(p_funcion, v_ut);
END$$

CREATE PROCEDURE sp_validar_ciudadano(IN p_ciclo INT, IN p_ut INT, IN p_fase VARCHAR(30))
BEGIN
  DECLARE v_fase VARCHAR(30);
  IF @usuario_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM usuarios WHERE id = @usuario_id AND rol = 'ciudadano' AND estado = 'activa') THEN
      CALL sp_error('Solo un Ciudadano con cuenta activa puede realizar esta acción');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM ciclos WHERE id = p_ciclo AND estado = 'activo') THEN
      CALL sp_error('El ciclo de simulación no está activo');
    END IF;
    SET v_fase = (SELECT clave FROM fases WHERE id = (SELECT c.fase_actual_id FROM ciclos c WHERE c.id = p_ciclo));
    IF p_fase IS NOT NULL AND (v_fase IS NULL OR v_fase <> p_fase) THEN
      CALL sp_error(CONCAT('Esta acción solo está disponible en la fase "',
                           (SELECT nombre_es FROM fases WHERE clave = p_fase), '"'));
    END IF;
    IF p_ut IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ciudadanos WHERE usuario_id = @usuario_id AND unidad_territorial_id = p_ut) THEN
      CALL sp_error('Solo puedes participar en tu unidad territorial de residencia');
    END IF;
  END IF;
END$$

CREATE PROCEDURE sp_requiere_ciclo_activo(IN p_ciclo INT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM ciclos WHERE id = p_ciclo AND estado = 'activo') THEN
    CALL sp_error('El ciclo no está activo (si está cerrado, su información es de solo lectura)');
  END IF;
END$$

CREATE PROCEDURE sp_bitacora(IN p_accion VARCHAR(60), IN p_entidad VARCHAR(40), IN p_entidad_id VARCHAR(40),
                             IN p_ciclo INT, IN p_detalle JSON)
BEGIN
  DECLARE v_ciclo INT;
  IF EXISTS (SELECT 1 FROM usuarios WHERE id = @usuario_id AND rol IN ('administrador', 'funcionario')) THEN
    SET v_ciclo = COALESCE(p_ciclo, IF(p_entidad = 'proyectos',
                    (SELECT ciclo_id FROM proyectos WHERE id = p_entidad_id), NULL));
    INSERT INTO bitacora (usuario_id, rol, alcaldia_id, ciclo_id, accion, entidad, entidad_id, detalle)
    VALUES (@usuario_id, (SELECT rol FROM usuarios WHERE id = @usuario_id),
            (SELECT alcaldia_id FROM funcionarios WHERE usuario_id = @usuario_id),
            v_ciclo, p_accion, p_entidad, p_entidad_id, p_detalle);
  END IF;
END$$

CREATE PROCEDURE sp_notificar(IN p_usuario INT, IN p_tipo VARCHAR(30), IN p_titulo VARCHAR(100),
                              IN p_mensaje VARCHAR(500), IN p_proyecto BIGINT)
BEGIN
  INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje, proyecto_id)
  VALUES (p_usuario, p_tipo, LEFT(p_titulo, 100), LEFT(p_mensaje, 500), p_proyecto);
END$$

CREATE PROCEDURE sp_notificar_proyecto(IN p_proyecto BIGINT, IN p_tipo VARCHAR(30),
                                       IN p_titulo VARCHAR(100), IN p_mensaje VARCHAR(500))
BEGIN
  INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje, proyecto_id)
  SELECT proponente_id, p_tipo, LEFT(p_titulo, 100), LEFT(REPLACE(p_mensaje, '{folio}', folio), 500), id
  FROM proyectos WHERE id = p_proyecto;
END$$

DELIMITER ;

DELIMITER $$

CREATE TRIGGER tg_ciudadanos_bi BEFORE INSERT ON ciudadanos FOR EACH ROW
BEGIN
  IF (SELECT rol FROM usuarios WHERE id = NEW.usuario_id) <> 'ciudadano' THEN
    CALL sp_error('El usuario no tiene rol de Ciudadano');
  END IF;
  IF NEW.fecha_nacimiento > DATE_SUB(CURDATE(), INTERVAL 18 YEAR) THEN
    CALL sp_error('Solo pueden registrarse personas mayores de 18 años');
  END IF;
END$$

CREATE TRIGGER tg_ciudadanos_bu BEFORE UPDATE ON ciudadanos FOR EACH ROW
BEGIN
  IF NEW.fecha_nacimiento <> OLD.fecha_nacimiento AND @usuario_id IS NOT NULL THEN
    CALL sp_error('La fecha de nacimiento no puede modificarse');
  END IF;
  IF NEW.unidad_territorial_id <> OLD.unidad_territorial_id
     AND (SELECT orden FROM fases WHERE id = (SELECT c.fase_actual_id FROM ciclos c WHERE c.estado = 'activo'))
         >= (SELECT orden FROM fases WHERE clave = 'consulta') THEN
    CALL sp_error('El cambio de residencia solo se permite antes de la fase de Consulta');
  END IF;
END$$

CREATE TRIGGER tg_funcionarios_bi BEFORE INSERT ON funcionarios FOR EACH ROW
BEGIN
  IF (SELECT rol FROM usuarios WHERE id = NEW.usuario_id) <> 'funcionario' THEN
    CALL sp_error('El usuario no tiene rol de Funcionario');
  END IF;
END$$

CREATE TRIGGER tg_usuarios_bu BEFORE UPDATE ON usuarios FOR EACH ROW
BEGIN
  IF NEW.rol <> OLD.rol THEN
    CALL sp_error('El rol de una cuenta no puede cambiarse');
  END IF;
END$$

CREATE TRIGGER tg_usuarios_au AFTER UPDATE ON usuarios FOR EACH ROW
BEGIN
  IF NEW.password_hash <> OLD.password_hash THEN
    UPDATE funcionarios SET debe_cambiar_password = FALSE WHERE usuario_id = NEW.id;
    UPDATE sesiones SET cerrada_en = NOW() WHERE usuario_id = NEW.id AND cerrada_en IS NULL
       AND @usuario_id IS NULL;
  END IF;
  IF NEW.estado <> OLD.estado THEN
    CALL sp_bitacora(CONCAT('cuenta_', NEW.estado), 'usuarios', NEW.id, NULL, NULL);
    IF NEW.estado <> 'activa' THEN
      UPDATE sesiones SET cerrada_en = NOW() WHERE usuario_id = NEW.id AND cerrada_en IS NULL;
    END IF;
  END IF;
END$$

CREATE TRIGGER tg_suspensiones_bi BEFORE INSERT ON suspensiones_cuenta FOR EACH ROW
BEGIN
  CALL sp_requiere_admin();
  SET NEW.administrador_id = COALESCE(NEW.administrador_id, @usuario_id);
END$$

CREATE TRIGGER tg_suspensiones_ai AFTER INSERT ON suspensiones_cuenta FOR EACH ROW
BEGIN
  UPDATE usuarios SET estado = IF(NEW.accion = 'suspender', 'suspendida', 'activa')
   WHERE id = NEW.ciudadano_id;
END$$

CREATE TRIGGER tg_ciclos_bu BEFORE UPDATE ON ciclos FOR EACH ROW
BEGIN
  IF OLD.estado = 'cerrado' THEN
    CALL sp_error('El ciclo está cerrado: su información es de solo lectura');
  END IF;
END$$

CREATE TRIGGER tg_ciclo_fases_bi BEFORE INSERT ON ciclo_fases FOR EACH ROW
BEGIN
  CALL sp_requiere_admin();
  IF (SELECT estado FROM ciclos WHERE id = NEW.ciclo_id) = 'cerrado' THEN
    CALL sp_error('El ciclo está cerrado: su información es de solo lectura');
  END IF;
END$$

CREATE TRIGGER tg_ciclo_fases_bu BEFORE UPDATE ON ciclo_fases FOR EACH ROW
BEGIN
  CALL sp_requiere_admin();
  IF (SELECT estado FROM ciclos WHERE id = NEW.ciclo_id) = 'cerrado' THEN
    CALL sp_error('El ciclo está cerrado: su información es de solo lectura');
  END IF;
END$$

CREATE TRIGGER tg_ciclo_unidades_bu BEFORE UPDATE ON ciclo_unidades FOR EACH ROW
BEGIN
  IF (SELECT estado FROM ciclos WHERE id = NEW.ciclo_id) = 'cerrado' THEN
    CALL sp_error('El ciclo está cerrado: su información es de solo lectura');
  END IF;
END$$

CREATE TRIGGER tg_avisos_bi BEFORE INSERT ON avisos FOR EACH ROW
BEGIN
  SET NEW.autor_id = COALESCE(NULLIF(NEW.autor_id, 0), @usuario_id);
  SET NEW.ciclo_id = COALESCE(NULLIF(NEW.ciclo_id, 0), (SELECT id FROM ciclos WHERE estado = 'activo'));
  CALL sp_requiere_ciclo_activo(NEW.ciclo_id);
  CALL sp_requiere_funcionario(NULL, NEW.alcaldia_id);
  CALL sp_bitacora('aviso_publicar', 'avisos', NULL, NEW.ciclo_id, JSON_OBJECT('titulo', NEW.titulo));
END$$

CREATE TRIGGER tg_directorio_bi BEFORE INSERT ON directorio FOR EACH ROW
BEGIN
  CALL sp_requiere_funcionario('directorio', NEW.alcaldia_id);
  SET NEW.actualizado_por = @usuario_id;
  IF @usuario_id IS NOT NULL THEN SET NEW.origen = 'manual', NEW.editado_manualmente = TRUE; END IF;
  CALL sp_bitacora('directorio_alta', 'directorio', NULL, NULL, JSON_OBJECT('cargo', NEW.cargo));
END$$

CREATE TRIGGER tg_directorio_bu BEFORE UPDATE ON directorio FOR EACH ROW
BEGIN
  CALL sp_requiere_funcionario('directorio', OLD.alcaldia_id);
  CALL sp_requiere_funcionario('directorio', NEW.alcaldia_id);
  SET NEW.actualizado_por = @usuario_id;
  IF @usuario_id IS NOT NULL THEN SET NEW.editado_manualmente = TRUE; END IF;
  CALL sp_bitacora('directorio_edicion', 'directorio', OLD.id, NULL, JSON_OBJECT('cargo', NEW.cargo));
END$$

CREATE TRIGGER tg_directorio_bd BEFORE DELETE ON directorio FOR EACH ROW
BEGIN
  CALL sp_requiere_funcionario('directorio', OLD.alcaldia_id);
  CALL sp_bitacora('directorio_baja', 'directorio', OLD.id, NULL, JSON_OBJECT('cargo', OLD.cargo));
END$$

CREATE TRIGGER tg_ideas_bi BEFORE INSERT ON ideas FOR EACH ROW
BEGIN
  SET NEW.ciclo_id = COALESCE(NULLIF(NEW.ciclo_id, 0), (SELECT id FROM ciclos WHERE estado = 'activo'));
  SET NEW.unidad_territorial_id = COALESCE(NULLIF(NEW.unidad_territorial_id, 0),
        (SELECT unidad_territorial_id FROM ciudadanos WHERE usuario_id = @usuario_id));
  SET NEW.autor_id = COALESCE(NULLIF(NEW.autor_id, 0), @usuario_id);
  CALL sp_validar_ciudadano(NEW.ciclo_id, NEW.unidad_territorial_id, 'diagnostico_registro');
  IF @usuario_id IS NOT NULL THEN
    SET NEW.total_apoyos = 0, NEW.estado = 'visible';
  END IF;
END$$

CREATE TRIGGER tg_ideas_bu BEFORE UPDATE ON ideas FOR EACH ROW
BEGIN
  IF @usuario_id IS NOT NULL AND COALESCE(@interno, 0) = 0 THEN
    CALL sp_error('Las ideas publicadas no pueden modificarse directamente');
  END IF;
END$$

CREATE TRIGGER tg_comentarios_idea_bi BEFORE INSERT ON comentarios_idea FOR EACH ROW
BEGIN
  DECLARE v_ciclo INT; DECLARE v_ut INT; DECLARE v_estado VARCHAR(10);
  SELECT ciclo_id, unidad_territorial_id, estado INTO v_ciclo, v_ut, v_estado FROM ideas WHERE id = NEW.idea_id;
  IF v_estado <> 'visible' THEN CALL sp_error('La idea no está disponible'); END IF;
  SET NEW.autor_id = COALESCE(NULLIF(NEW.autor_id, 0), @usuario_id);
  CALL sp_validar_ciudadano(v_ciclo, v_ut, NULL);
  IF @usuario_id IS NOT NULL THEN SET NEW.estado = 'visible'; END IF;
END$$

CREATE TRIGGER tg_apoyos_bi BEFORE INSERT ON apoyos_idea FOR EACH ROW
BEGIN
  DECLARE v_ciclo INT; DECLARE v_ut INT; DECLARE v_autor INT; DECLARE v_estado VARCHAR(10);
  SELECT ciclo_id, unidad_territorial_id, autor_id, estado INTO v_ciclo, v_ut, v_autor, v_estado
    FROM ideas WHERE id = NEW.idea_id;
  SET NEW.ciudadano_id = COALESCE(NULLIF(NEW.ciudadano_id, 0), @usuario_id);
  IF v_estado <> 'visible' THEN CALL sp_error('La idea no está disponible'); END IF;
  IF v_autor = NEW.ciudadano_id THEN CALL sp_error('No puedes apoyar tu propia idea'); END IF;
  CALL sp_validar_ciudadano(v_ciclo, v_ut, NULL);
END$$

CREATE TRIGGER tg_apoyos_ai AFTER INSERT ON apoyos_idea FOR EACH ROW
BEGIN
  SET @interno = 1;
  UPDATE ideas SET total_apoyos = total_apoyos + 1 WHERE id = NEW.idea_id;
  SET @interno = 0;
END$$

CREATE TRIGGER tg_apoyos_ad AFTER DELETE ON apoyos_idea FOR EACH ROW
BEGIN
  SET @interno = 1;
  UPDATE ideas SET total_apoyos = GREATEST(total_apoyos - 1, 0) WHERE id = OLD.idea_id;
  SET @interno = 0;
END$$

CREATE TRIGGER tg_moderaciones_bi BEFORE INSERT ON moderaciones FOR EACH ROW
BEGIN
  SET @mod_ut = CASE NEW.tipo_objeto
    WHEN 'idea'            THEN (SELECT unidad_territorial_id FROM ideas WHERE id = NEW.objeto_id)
    WHEN 'comentario_idea' THEN (SELECT unidad_territorial_id FROM ideas
                                 WHERE id = (SELECT idea_id FROM comentarios_idea WHERE id = NEW.objeto_id))
    WHEN 'proyecto'        THEN (SELECT unidad_territorial_id FROM proyectos WHERE id = NEW.objeto_id)
    ELSE (SELECT unidad_territorial_id FROM proyectos
          WHERE id = (SELECT proyecto_id FROM reportes
                      WHERE id = (SELECT reporte_id FROM comentarios_reporte WHERE id = NEW.objeto_id)))
  END;
  IF @mod_ut IS NULL THEN CALL sp_error('El contenido a moderar no existe'); END IF;
  CALL sp_requiere_funcionario('moderacion', (SELECT alcaldia_id FROM unidades_territoriales WHERE id = @mod_ut));
  SET NEW.funcionario_id = COALESCE(NEW.funcionario_id,
        (SELECT usuario_id FROM funcionarios WHERE usuario_id = @usuario_id));
  SET @mod_estado = CASE NEW.accion WHEN 'ocultar' THEN 'oculto' WHEN 'eliminar' THEN 'eliminado' ELSE 'visible' END;
  SET @interno = 1;
  IF NEW.tipo_objeto = 'idea' THEN
    UPDATE ideas SET estado = @mod_estado WHERE id = NEW.objeto_id;
  ELSEIF NEW.tipo_objeto = 'comentario_idea' THEN
    UPDATE comentarios_idea SET estado = @mod_estado WHERE id = NEW.objeto_id;
  ELSEIF NEW.tipo_objeto = 'proyecto' THEN
    UPDATE proyectos SET estado_moderacion = @mod_estado WHERE id = NEW.objeto_id;
  ELSE
    UPDATE comentarios_reporte SET estado = @mod_estado WHERE id = NEW.objeto_id;
  END IF;
  SET @interno = 0;
  CALL sp_bitacora(CONCAT('moderacion_', NEW.accion), NEW.tipo_objeto, NEW.objeto_id, NULL,
                   JSON_OBJECT('motivo', NEW.motivo));
END$$

CREATE TRIGGER tg_proyectos_bi BEFORE INSERT ON proyectos FOR EACH ROW
BEGIN
  SET NEW.ciclo_id = COALESCE(NULLIF(NEW.ciclo_id, 0), (SELECT id FROM ciclos WHERE estado = 'activo'));
  SET NEW.unidad_territorial_id = COALESCE(NULLIF(NEW.unidad_territorial_id, 0),
        (SELECT unidad_territorial_id FROM ciudadanos WHERE usuario_id = @usuario_id));
  SET NEW.proponente_id = COALESCE(NULLIF(NEW.proponente_id, 0), @usuario_id);
  CALL sp_validar_ciudadano(NEW.ciclo_id, NEW.unidad_territorial_id, 'diagnostico_registro');
  IF @usuario_id IS NOT NULL THEN
    SET NEW.estatus = 'registrado', NEW.numero_sorteo = NULL, NEW.avance_porcentaje = 0,
        NEW.monto_ejercido = 0, NEW.estado_moderacion = 'visible';
  END IF;
  IF NEW.idea_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM ideas WHERE id = NEW.idea_id AND ciclo_id = NEW.ciclo_id
                             AND unidad_territorial_id = NEW.unidad_territorial_id) THEN
    CALL sp_error('La idea de origen debe pertenecer al mismo foro');
  END IF;
  IF NEW.latitud IS NOT NULL AND NEW.estado_ubicacion = 'pendiente' THEN
    SET NEW.estado_ubicacion = 'ubicado';
  END IF;
  IF NEW.imagen_archivo_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM archivos WHERE id = NEW.imagen_archivo_id AND categoria = 'imagen_proyecto'
                                AND eliminado_en IS NULL
                                AND (@usuario_id IS NULL OR subido_por = @usuario_id)) THEN
    CALL sp_error('La imagen del proyecto no es válida');
  END IF;

  SET @folio_anio = (SELECT anio_simulado FROM ciclos WHERE id = NEW.ciclo_id);
  SET @folio_alc  = (SELECT alcaldia_id FROM unidades_territoriales WHERE id = NEW.unidad_territorial_id);
  INSERT INTO folio_consecutivos (anio, alcaldia_id, ultimo) VALUES (@folio_anio, @folio_alc, 1)
    ON DUPLICATE KEY UPDATE ultimo = ultimo + 1;
  SET @folio_n = (SELECT ultimo FROM folio_consecutivos WHERE anio = @folio_anio AND alcaldia_id = @folio_alc);
  SET NEW.folio = CONCAT('PP-', @folio_anio, '-', (SELECT clave FROM alcaldias WHERE id = @folio_alc), '-',
                         LPAD(@folio_n, 4, '0'));
  IF NEW.folio IS NULL THEN
    CALL sp_error('No se pudo generar el folio del proyecto');
  END IF;
END$$

CREATE TRIGGER tg_proyectos_bu BEFORE UPDATE ON proyectos FOR EACH ROW
BEGIN
  DECLARE v_rol VARCHAR(20);
  IF COALESCE(NEW.folio, '') <> COALESCE(OLD.folio, '') OR NEW.ciclo_id <> OLD.ciclo_id
     OR NEW.unidad_territorial_id <> OLD.unidad_territorial_id OR NEW.proponente_id <> OLD.proponente_id THEN
    CALL sp_error('El folio, el ciclo, la unidad territorial y el proponente no pueden cambiar');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ciclos WHERE id = NEW.ciclo_id AND estado = 'activo') THEN
    CALL sp_error('El ciclo no está activo (si está cerrado, su información es de solo lectura)');
  END IF;

  IF @usuario_id IS NOT NULL AND COALESCE(@interno, 0) = 0 THEN
    SET v_rol = (SELECT rol FROM usuarios WHERE id = @usuario_id AND estado = 'activa');
    IF v_rol = 'ciudadano' THEN
      IF OLD.proponente_id <> @usuario_id THEN CALL sp_error('Solo puedes editar tus proyectos'); END IF;
      IF COALESCE((SELECT clave FROM fases WHERE id = (SELECT c.fase_actual_id FROM ciclos c WHERE c.id = NEW.ciclo_id)), '') <> 'diagnostico_registro' OR OLD.estatus <> 'registrado' THEN
        CALL sp_error('El proyecto solo puede editarse o retirarse durante la fase de Diagnóstico y Registro');
      END IF;
      IF NEW.estatus NOT IN ('registrado', 'retirado') OR COALESCE(NEW.numero_sorteo, 0) <> COALESCE(OLD.numero_sorteo, 0)
         OR NEW.avance_porcentaje <> OLD.avance_porcentaje OR NEW.monto_ejercido <> OLD.monto_ejercido
         OR NEW.estado_moderacion <> OLD.estado_moderacion THEN
        CALL sp_error('No puedes modificar los campos que administra el sistema');
      END IF;
      IF NEW.imagen_archivo_id IS NOT NULL AND COALESCE(NEW.imagen_archivo_id, 0) <> COALESCE(OLD.imagen_archivo_id, 0)
         AND NOT EXISTS (SELECT 1 FROM archivos WHERE id = NEW.imagen_archivo_id AND categoria = 'imagen_proyecto'
                                                  AND eliminado_en IS NULL AND subido_por = @usuario_id) THEN
        CALL sp_error('La imagen del proyecto no es válida');
      END IF;
    ELSEIF v_rol = 'funcionario' THEN
      IF NEW.titulo <> OLD.titulo OR NEW.descripcion <> OLD.descripcion OR NEW.rubro_id <> OLD.rubro_id
         OR NEW.costo_estimado <> OLD.costo_estimado OR NEW.estatus <> OLD.estatus
         OR COALESCE(NEW.numero_sorteo, 0) <> COALESCE(OLD.numero_sorteo, 0) OR NEW.avance_porcentaje <> OLD.avance_porcentaje
         OR NEW.monto_ejercido <> OLD.monto_ejercido OR NEW.estado_moderacion <> OLD.estado_moderacion
         OR COALESCE(NEW.imagen_archivo_id, 0) <> COALESCE(OLD.imagen_archivo_id, 0) OR COALESCE(NEW.idea_id, 0) <> COALESCE(OLD.idea_id, 0) THEN
        CALL sp_error('El Funcionario solo puede corregir la ubicación del proyecto');
      END IF;
      CALL sp_requiere_funcionario_ut(NULL, NEW.unidad_territorial_id);
      SET NEW.estado_ubicacion = IF(NEW.latitud IS NULL, 'no_ubicado', 'corregido');
      CALL sp_bitacora('ubicacion_corregir', 'proyectos', NEW.id, NEW.ciclo_id,
                       JSON_OBJECT('latitud', NEW.latitud, 'longitud', NEW.longitud));
    ELSEIF v_rol IS NULL OR v_rol <> 'administrador' THEN
      CALL sp_error('Sin permiso para modificar el proyecto');
    END IF;
  END IF;
END$$

CREATE TRIGGER tg_proyectos_ai AFTER INSERT ON proyectos FOR EACH ROW
BEGIN
  INSERT INTO historial_estatus_proyecto (proyecto_id, estatus_anterior, estatus_nuevo, usuario_id)
  VALUES (NEW.id, NULL, NEW.estatus, @usuario_id);
END$$

CREATE TRIGGER tg_proyectos_au AFTER UPDATE ON proyectos FOR EACH ROW
BEGIN
  IF NEW.estatus <> OLD.estatus THEN
    INSERT INTO historial_estatus_proyecto (proyecto_id, estatus_anterior, estatus_nuevo, usuario_id)
    VALUES (NEW.id, OLD.estatus, NEW.estatus, @usuario_id);
  END IF;
END$$

CREATE TRIGGER tg_revisiones_bi BEFORE INSERT ON revisiones_registro FOR EACH ROW
BEGIN
  DECLARE v_estatus VARCHAR(20); DECLARE v_ut INT; DECLARE v_ciclo INT;
  SELECT estatus, unidad_territorial_id, ciclo_id INTO v_estatus, v_ut, v_ciclo
    FROM proyectos WHERE id = NEW.proyecto_id;
  CALL sp_requiere_ciclo_activo(v_ciclo);
  CALL sp_requiere_funcionario_ut('revision_registros', v_ut);
  IF v_estatus <> 'registrado' THEN CALL sp_error('Solo se revisan proyectos con estatus Registrado'); END IF;
  SET NEW.funcionario_id = COALESCE(NEW.funcionario_id,
        (SELECT usuario_id FROM funcionarios WHERE usuario_id = @usuario_id));
END$$

CREATE TRIGGER tg_revisiones_ai AFTER INSERT ON revisiones_registro FOR EACH ROW
BEGIN
  IF NEW.resultado = 'completo' THEN
    SET @interno = 1;
    UPDATE proyectos SET estatus = 'en_dictaminacion' WHERE id = NEW.proyecto_id;
    SET @interno = 0;
    CALL sp_notificar_proyecto(NEW.proyecto_id, 'proyecto_en_dictaminacion', 'Tu proyecto pasó a dictaminación',
                               'El proyecto {folio} está completo y fue enviado al Órgano Dictaminador.');
  ELSE
    CALL sp_notificar_proyecto(NEW.proyecto_id, 'correccion_solicitada', 'Se solicitó una corrección',
                               CONCAT('Proyecto {folio}: ', NEW.observacion));
  END IF;
  CALL sp_bitacora(CONCAT('revision_', NEW.resultado), 'proyectos', NEW.proyecto_id, NULL, NULL);
END$$

CREATE TRIGGER tg_dictamenes_bi BEFORE INSERT ON dictamenes FOR EACH ROW
BEGIN
  DECLARE v_estatus VARCHAR(20); DECLARE v_ut INT; DECLARE v_ciclo INT;
  SELECT estatus, unidad_territorial_id, ciclo_id INTO v_estatus, v_ut, v_ciclo FROM proyectos WHERE id = NEW.proyecto_id;
  CALL sp_requiere_ciclo_activo(v_ciclo);
  CALL sp_requiere_funcionario_ut('dictaminacion', v_ut);
  IF v_estatus <> 'en_dictaminacion' THEN CALL sp_error('El proyecto no está en dictaminación'); END IF;
  IF NEW.emitido_en IS NOT NULL THEN
    CALL sp_error('Primero registra la evaluación de los criterios; después emite el dictamen');
  END IF;
  SET NEW.funcionario_id = COALESCE(NEW.funcionario_id,
        (SELECT usuario_id FROM funcionarios WHERE usuario_id = @usuario_id));
END$$

CREATE TRIGGER tg_dictamenes_bu BEFORE UPDATE ON dictamenes FOR EACH ROW
BEGIN
  IF OLD.emitido_en IS NOT NULL THEN CALL sp_error('El dictamen ya fue emitido y es definitivo'); END IF;
  CALL sp_requiere_funcionario_proyecto('dictaminacion', NEW.proyecto_id);
  IF NEW.emitido_en IS NOT NULL AND EXISTS (
       SELECT 1 FROM criterios_dictamen cd
       WHERE cd.activo AND NOT EXISTS (SELECT 1 FROM dictamen_criterios dc
                                       WHERE dc.dictamen_id = NEW.id AND dc.criterio_id = cd.id)) THEN
    CALL sp_error('Evalúa todos los criterios antes de emitir el dictamen');
  END IF;
END$$

CREATE TRIGGER tg_dictamenes_au AFTER UPDATE ON dictamenes FOR EACH ROW
BEGIN
  IF NEW.emitido_en IS NOT NULL AND OLD.emitido_en IS NULL THEN
    SET @interno = 1;
    UPDATE proyectos SET estatus = NEW.resultado WHERE id = NEW.proyecto_id;
    SET @interno = 0;
    CALL sp_notificar_proyecto(NEW.proyecto_id, 'dictamen_emitido',
                               CONCAT('Dictamen de tu proyecto: ', REPLACE(NEW.resultado, '_', ' ')),
                               CONCAT('Proyecto {folio}. Justificación: ', NEW.justificacion));
    CALL sp_bitacora('dictamen_emitir', 'proyectos', NEW.proyecto_id, NULL,
                     JSON_OBJECT('resultado', NEW.resultado));
  END IF;
END$$

CREATE TRIGGER tg_dictamen_criterios_bi BEFORE INSERT ON dictamen_criterios FOR EACH ROW
BEGIN
  IF (SELECT emitido_en FROM dictamenes WHERE id = NEW.dictamen_id) IS NOT NULL THEN
    CALL sp_error('El dictamen ya fue emitido y es definitivo');
  END IF;
  CALL sp_requiere_funcionario_proyecto('dictaminacion', (SELECT proyecto_id FROM dictamenes WHERE id = NEW.dictamen_id));
END$$

CREATE TRIGGER tg_dictamen_criterios_bu BEFORE UPDATE ON dictamen_criterios FOR EACH ROW
BEGIN
  IF (SELECT emitido_en FROM dictamenes WHERE id = OLD.dictamen_id) IS NOT NULL THEN
    CALL sp_error('El dictamen ya fue emitido y es definitivo');
  END IF;
END$$

CREATE TRIGGER tg_dictamen_criterios_bd BEFORE DELETE ON dictamen_criterios FOR EACH ROW
BEGIN
  IF (SELECT emitido_en FROM dictamenes WHERE id = OLD.dictamen_id) IS NOT NULL THEN
    CALL sp_error('El dictamen ya fue emitido y es definitivo');
  END IF;
END$$

CREATE TRIGGER tg_avances_bi BEFORE INSERT ON avances_proyecto FOR EACH ROW
BEGIN
  DECLARE v_estatus VARCHAR(20); DECLARE v_ut INT; DECLARE v_ciclo INT;
  SELECT estatus, unidad_territorial_id, ciclo_id INTO v_estatus, v_ut, v_ciclo FROM proyectos WHERE id = NEW.proyecto_id;
  CALL sp_requiere_ciclo_activo(v_ciclo);
  CALL sp_requiere_funcionario_ut('seguimiento', v_ut);
  IF v_estatus NOT IN ('ganador','en_ejecucion','concluido','inejecutable') THEN
    CALL sp_error('Solo se registra avance de proyectos ganadores');
  END IF;
  IF (SELECT orden FROM fases WHERE id = (SELECT fase_actual_id FROM ciclos
         WHERE id = (SELECT ciclo_id FROM proyectos WHERE id = NEW.proyecto_id)))
     < (SELECT orden FROM fases WHERE clave = 'ejecucion_seguimiento') THEN
    CALL sp_error('El avance se registra a partir de la fase de Ejecución y Seguimiento');
  END IF;
  SET NEW.funcionario_id = COALESCE(NEW.funcionario_id,
        (SELECT usuario_id FROM funcionarios WHERE usuario_id = @usuario_id));
END$$

CREATE TRIGGER tg_avances_ai AFTER INSERT ON avances_proyecto FOR EACH ROW
BEGIN
  SET @interno = 1;
  UPDATE proyectos SET avance_porcentaje = NEW.porcentaje, monto_ejercido = NEW.monto_ejercido,
                       estatus = NEW.estatus
   WHERE id = NEW.proyecto_id;
  SET @interno = 0;
  CALL sp_bitacora('avance_registrar', 'proyectos', NEW.proyecto_id, NULL,
                   JSON_OBJECT('porcentaje', NEW.porcentaje, 'monto', NEW.monto_ejercido, 'estatus', NEW.estatus));
END$$

CREATE TRIGGER tg_reportes_bi BEFORE INSERT ON reportes FOR EACH ROW
BEGIN
  DECLARE v_estatus VARCHAR(20); DECLARE v_mod VARCHAR(10); DECLARE v_ciclo INT;
  SELECT estatus, estado_moderacion, ciclo_id INTO v_estatus, v_mod, v_ciclo FROM proyectos WHERE id = NEW.proyecto_id;
  SET NEW.autor_id = COALESCE(NULLIF(NEW.autor_id, 0), @usuario_id);
  CALL sp_validar_ciudadano(v_ciclo, NULL, NULL);
  IF v_estatus NOT IN ('ganador','en_ejecucion','concluido','inejecutable') OR v_mod <> 'visible' THEN
    CALL sp_error('Solo se pueden reportar proyectos ganadores');
  END IF;
  IF @usuario_id IS NOT NULL THEN
    SET NEW.estatus = 'pendiente', NEW.respuesta = NULL, NEW.motivo_eliminacion = NULL,
        NEW.revisado_por = NULL, NEW.revisado_en = NULL;
  END IF;
END$$

CREATE TRIGGER tg_reportes_bu BEFORE UPDATE ON reportes FOR EACH ROW
BEGIN
  IF NEW.proyecto_id <> OLD.proyecto_id OR NEW.autor_id <> OLD.autor_id
     OR NEW.tipo <> OLD.tipo OR NEW.descripcion <> OLD.descripcion THEN
    CALL sp_error('El contenido del reporte no puede modificarse');
  END IF;
  CALL sp_requiere_funcionario_proyecto('seguimiento', NEW.proyecto_id);
  IF NEW.estatus <> OLD.estatus THEN
    SET NEW.revisado_por = (SELECT usuario_id FROM funcionarios WHERE usuario_id = @usuario_id),
        NEW.revisado_en = NOW();
  END IF;
END$$

CREATE TRIGGER tg_reportes_au AFTER UPDATE ON reportes FOR EACH ROW
BEGIN
  IF NEW.estatus <> OLD.estatus AND NEW.estatus IN ('atendido', 'eliminado') THEN
    CALL sp_notificar(NEW.autor_id, CONCAT('reporte_', NEW.estatus),
                      IF(NEW.estatus = 'atendido', 'Tu reporte fue atendido', 'Tu reporte fue eliminado'),
                      COALESCE(NEW.respuesta, NEW.motivo_eliminacion), NEW.proyecto_id);
    CALL sp_bitacora(CONCAT('reporte_', NEW.estatus), 'reportes', NEW.id, NULL, NULL);
  END IF;
END$$

CREATE TRIGGER tg_reporte_fotos_bi BEFORE INSERT ON reporte_fotos FOR EACH ROW
BEGIN
  IF @usuario_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM reportes WHERE id = NEW.reporte_id AND autor_id = @usuario_id) THEN
    CALL sp_error('Solo el autor del reporte puede adjuntar fotografías');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM archivos WHERE id = NEW.archivo_id AND categoria = 'foto_reporte'
                   AND eliminado_en IS NULL AND (@usuario_id IS NULL OR subido_por = @usuario_id)) THEN
    CALL sp_error('La fotografía no es válida (debe ser JPG o PNG de hasta 5 MB subida por ti)');
  END IF;
  IF (SELECT COUNT(*) FROM reporte_fotos WHERE reporte_id = NEW.reporte_id) >= 5 THEN
    CALL sp_error('Un reporte admite como máximo 5 fotografías');
  END IF;
END$$

CREATE TRIGGER tg_comentarios_reporte_bi BEFORE INSERT ON comentarios_reporte FOR EACH ROW
BEGIN
  DECLARE v_estatus VARCHAR(10); DECLARE v_ciclo INT;
  SELECT r.estatus, p.ciclo_id INTO v_estatus, v_ciclo
    FROM reportes r JOIN proyectos p ON p.id = r.proyecto_id WHERE r.id = NEW.reporte_id;
  IF v_estatus = 'eliminado' THEN CALL sp_error('El reporte no está disponible'); END IF;
  SET NEW.autor_id = COALESCE(NULLIF(NEW.autor_id, 0), @usuario_id);
  CALL sp_validar_ciudadano(v_ciclo, NULL, NULL);
  IF @usuario_id IS NOT NULL THEN SET NEW.estado = 'visible'; END IF;
END$$

CREATE TRIGGER tg_calificaciones_bi BEFORE INSERT ON calificaciones FOR EACH ROW
BEGIN
  DECLARE v_estatus VARCHAR(20); DECLARE v_ut INT; DECLARE v_ciclo INT;
  SELECT estatus, unidad_territorial_id, ciclo_id INTO v_estatus, v_ut, v_ciclo FROM proyectos WHERE id = NEW.proyecto_id;
  SET NEW.ciudadano_id = COALESCE(NULLIF(NEW.ciudadano_id, 0), @usuario_id);
  IF v_estatus NOT IN ('ganador','en_ejecucion','concluido','inejecutable') THEN
    CALL sp_error('Solo se califican proyectos ganadores');
  END IF;
  CALL sp_validar_ciudadano(v_ciclo, v_ut, 'evaluacion');
END$$

CREATE TRIGGER tg_notificaciones_ai AFTER INSERT ON notificaciones FOR EACH ROW
BEGIN
  IF EXISTS (SELECT 1 FROM usuarios WHERE id = NEW.usuario_id AND recibir_correos AND estado = 'activa') THEN
    INSERT INTO correos_salida (usuario_id, destinatario, asunto, cuerpo, plantilla, notificacion_id)
    VALUES (NEW.usuario_id, (SELECT correo FROM usuarios WHERE id = NEW.usuario_id),
            CONCAT('Prepar · ', NEW.titulo), NEW.mensaje, NEW.tipo, NEW.id);
  END IF;
END$$

CREATE TRIGGER tg_calificaciones_bu BEFORE UPDATE ON calificaciones FOR EACH ROW
BEGIN
  DECLARE v_ut INT; DECLARE v_ciclo INT;
  SELECT unidad_territorial_id, ciclo_id INTO v_ut, v_ciclo FROM proyectos WHERE id = NEW.proyecto_id;
  CALL sp_validar_ciudadano(v_ciclo, v_ut, 'evaluacion');
END$$

DELIMITER ;

DELIMITER $$

CREATE PROCEDURE sp_iniciar_sesion(IN p_usuario INT, IN p_token_hash CHAR(64))
BEGIN
  IF NOT EXISTS (SELECT 1 FROM usuarios WHERE id = p_usuario AND estado = 'activa') THEN
    CALL sp_error('La cuenta no está activa');
  END IF;
  IF EXISTS (SELECT 1 FROM usuarios WHERE id = p_usuario AND bloqueado_hasta > NOW()) THEN
    CALL sp_error('Demasiados intentos fallidos. Intenta de nuevo en unos minutos');
  END IF;
  UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = p_usuario;
  INSERT INTO sesiones (usuario_id, token_hash) VALUES (p_usuario, p_token_hash);
  SELECT u.id, u.rol, u.nombre_completo, u.idioma,
         (SELECT debe_cambiar_password FROM funcionarios WHERE usuario_id = u.id) AS debe_cambiar_password
  FROM usuarios u WHERE u.id = p_usuario;
END$$

CREATE PROCEDURE sp_login_fallido(IN p_correo VARCHAR(50))
BEGIN
  DECLARE v_max INT; DECLARE v_minutos INT;
  SET v_max     = COALESCE((SELECT CAST(valor AS UNSIGNED) FROM parametros_sistema WHERE clave = 'login_intentos_max'), 5);
  SET v_minutos = COALESCE((SELECT CAST(valor AS UNSIGNED) FROM parametros_sistema WHERE clave = 'login_minutos_bloqueo'), 15);
  UPDATE usuarios
     SET intentos_fallidos = LEAST(intentos_fallidos + 1, 100),
         bloqueado_hasta   = IF(intentos_fallidos >= v_max, NOW() + INTERVAL v_minutos MINUTE, bloqueado_hasta)
   WHERE correo = LOWER(p_correo);
END$$

CREATE PROCEDURE sp_validar_sesion(IN p_token_hash CHAR(64))
BEGIN
  DECLARE v_minutos INT;
  SET v_minutos = COALESCE((SELECT CAST(valor AS UNSIGNED) FROM parametros_sistema
                            WHERE clave = 'sesion_minutos_inactividad'), 15);
  UPDATE sesiones SET cerrada_en = NOW()
   WHERE token_hash = p_token_hash AND cerrada_en IS NULL
     AND ultima_actividad < NOW() - INTERVAL v_minutos MINUTE;
  UPDATE sesiones SET ultima_actividad = NOW()
   WHERE token_hash = p_token_hash AND cerrada_en IS NULL;
  SELECT s.usuario_id, u.rol, u.nombre_completo
  FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id AND u.estado = 'activa'
  WHERE s.token_hash = p_token_hash AND s.cerrada_en IS NULL;
END$$

CREATE PROCEDURE sp_cerrar_sesion(IN p_token_hash CHAR(64))
BEGIN
  UPDATE sesiones SET cerrada_en = NOW() WHERE token_hash = p_token_hash AND cerrada_en IS NULL;
END$$

CREATE PROCEDURE sp_solicitar_recuperacion(IN p_correo VARCHAR(50), IN p_token_hash CHAR(64))
BEGIN
  DECLARE v_id INT;
  SET v_id = (SELECT id FROM usuarios WHERE correo = LOWER(p_correo) AND estado = 'activa');
  IF v_id IS NOT NULL THEN
    INSERT INTO tokens_recuperacion (usuario_id, token_hash, expira_en)
    VALUES (v_id, p_token_hash, NOW() + INTERVAL 1 HOUR);
  END IF;
END$$

CREATE PROCEDURE sp_restablecer_password(IN p_token_hash CHAR(64), IN p_nuevo_hash VARCHAR(255))
BEGIN
  DECLARE v_id INT; DECLARE v_token BIGINT;
  SELECT id, usuario_id INTO v_token, v_id FROM tokens_recuperacion
   WHERE token_hash = p_token_hash AND usado_en IS NULL AND expira_en > NOW();
  IF v_id IS NULL THEN CALL sp_error('El enlace no es válido o ya expiró'); END IF;
  UPDATE tokens_recuperacion SET usado_en = NOW() WHERE id = v_token;
  UPDATE usuarios SET password_hash = p_nuevo_hash WHERE id = v_id;
END$$

CREATE PROCEDURE sp_cambiar_password(IN p_nuevo_hash VARCHAR(255))
BEGIN
  IF @usuario_id IS NULL THEN CALL sp_error('Indica el usuario con SET @usuario_id'); END IF;
  UPDATE usuarios SET password_hash = p_nuevo_hash WHERE id = @usuario_id;
END$$

CREATE PROCEDURE sp_registrar_ciudadano(IN p_nombre VARCHAR(50), IN p_correo VARCHAR(50),
       IN p_password_hash VARCHAR(255), IN p_fecha_nacimiento DATE, IN p_genero VARCHAR(20),
       IN p_unidad_territorial INT, IN p_acepta_aviso BOOLEAN)
BEGIN
  DECLARE v_id INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  IF NOT COALESCE(p_acepta_aviso, FALSE) THEN
    CALL sp_error('Debes aceptar el aviso de privacidad para crear tu cuenta');
  END IF;
  IF p_fecha_nacimiento > DATE_SUB(CURDATE(), INTERVAL 18 YEAR) THEN
    CALL sp_error('Solo pueden registrarse personas mayores de 18 años');
  END IF;
  IF EXISTS (SELECT 1 FROM usuarios WHERE correo = LOWER(p_correo)) THEN
    CALL sp_error('Ya existe una cuenta con ese correo');
  END IF;
  START TRANSACTION;
    INSERT INTO usuarios (rol, nombre_completo, correo, password_hash)
    VALUES ('ciudadano', TRIM(p_nombre), LOWER(p_correo), p_password_hash);
    SET v_id = (SELECT id FROM usuarios WHERE correo = LOWER(p_correo));
    INSERT INTO ciudadanos (usuario_id, fecha_nacimiento, genero, unidad_territorial_id,
                            aviso_privacidad_aceptado_en, aviso_privacidad_version)
    VALUES (v_id, p_fecha_nacimiento, p_genero, p_unidad_territorial, NOW(),
            (SELECT version FROM avisos_privacidad WHERE vigente_desde <= CURDATE()
             ORDER BY vigente_desde DESC LIMIT 1));
  COMMIT;
  SELECT v_id AS usuario_id;
END$$

CREATE PROCEDURE sp_registrar_funcionario(IN p_nombre VARCHAR(50), IN p_correo VARCHAR(50),
       IN p_password_temporal_hash VARCHAR(255), IN p_alcaldia SMALLINT, IN p_funciones VARCHAR(200))
BEGIN
  DECLARE v_id INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  CALL sp_requiere_admin();
  IF EXISTS (SELECT 1 FROM usuarios WHERE correo = LOWER(p_correo)) THEN
    CALL sp_error('Ya existe una cuenta con ese correo');
  END IF;
  START TRANSACTION;
    INSERT INTO usuarios (rol, nombre_completo, correo, password_hash)
    VALUES ('funcionario', TRIM(p_nombre), LOWER(p_correo), p_password_temporal_hash);
    SET v_id = (SELECT id FROM usuarios WHERE correo = LOWER(p_correo));
    INSERT INTO funcionarios (usuario_id, alcaldia_id, registrado_por) VALUES (v_id, p_alcaldia, @usuario_id);
    CALL sp_asignar_funciones(v_id, p_alcaldia, p_funciones);
  COMMIT;
  CALL sp_bitacora('funcionario_registrar', 'funcionarios', v_id, NULL,
                   JSON_OBJECT('correo', p_correo, 'alcaldia_id', p_alcaldia, 'funciones', p_funciones));
  SELECT v_id AS usuario_id;
END$$

CREATE PROCEDURE sp_asignar_funciones(IN p_funcionario INT, IN p_alcaldia SMALLINT, IN p_funciones VARCHAR(200))
BEGIN
  CALL sp_requiere_admin();
  UPDATE funcionarios SET alcaldia_id = p_alcaldia WHERE usuario_id = p_funcionario;
  DELETE FROM funcionario_funciones WHERE funcionario_id = p_funcionario;
  INSERT INTO funcionario_funciones (funcionario_id, funcion)
  SELECT p_funcionario, f.funcion
  FROM (SELECT 'directorio' AS funcion UNION ALL SELECT 'moderacion' UNION ALL SELECT 'revision_registros'
        UNION ALL SELECT 'dictaminacion' UNION ALL SELECT 'consulta' UNION ALL SELECT 'seguimiento') f
  WHERE FIND_IN_SET(f.funcion, REPLACE(p_funciones, ' ', '')) > 0;
  CALL sp_bitacora('funcionario_editar', 'funcionarios', p_funcionario, NULL,
                   JSON_OBJECT('alcaldia_id', p_alcaldia, 'funciones', p_funciones));
END$$

CREATE PROCEDURE sp_crear_administrador(IN p_nombre VARCHAR(50), IN p_correo VARCHAR(50), IN p_password_hash VARCHAR(255))
BEGIN
  CALL sp_requiere_admin();
  INSERT INTO usuarios (rol, nombre_completo, correo, password_hash)
  VALUES ('administrador', TRIM(p_nombre), LOWER(p_correo), p_password_hash);
  SELECT id AS usuario_id FROM usuarios WHERE correo = LOWER(p_correo);
END$$

CREATE PROCEDURE sp_crear_ciclo(IN p_nombre VARCHAR(50), IN p_anio SMALLINT, IN p_presupuesto DECIMAL(14,2),
       IN p_alcaldias VARCHAR(100), IN p_unidades VARCHAR(500), IN p_origen_indices VARCHAR(9))
BEGIN
  DECLARE v_ciclo INT; DECLARE v_ut INT; DECLARE v_max_delitos DECIMAL(16,4);
  DECLARE v_poblacion DECIMAL(16,4); DECLARE v_flotante DECIMAL(16,4);
  DECLARE v_pobreza DECIMAL(16,4); DECLARE v_delitos DECIMAL(16,4); DECLARE v_vueltas INT DEFAULT 0;
  CALL sp_requiere_admin();
  IF p_alcaldias IS NULL AND p_unidades IS NULL THEN
    CALL sp_error('Indica las alcaldías o unidades territoriales participantes');
  END IF;
  IF p_origen_indices NOT IN ('api', 'aleatorio', 'manual') THEN
    CALL sp_error('Origen de índices no válido: usa api, aleatorio o manual');
  END IF;
  INSERT INTO ciclos (nombre, anio_simulado, presupuesto_total, creado_por, fase_actual_id, origen_indices)
  VALUES (p_nombre, p_anio, p_presupuesto, @usuario_id, (SELECT id FROM fases ORDER BY orden LIMIT 1), p_origen_indices);
  SET v_ciclo = LAST_INSERT_ID();

  INSERT INTO ciclo_unidades (ciclo_id, unidad_territorial_id, poblacion, poblacion_flotante,
                              indice_pobreza, indice_delictivo, es_pueblo_originario)
  SELECT v_ciclo, ut.id,
         IF(p_origen_indices = 'aleatorio', FLOOR(2000 + RAND() * 18000), 0),
         IF(p_origen_indices = 'aleatorio', FLOOR(RAND() * 5000), 0),
         IF(p_origen_indices = 'aleatorio', ROUND(RAND(), 4), 0),
         IF(p_origen_indices = 'aleatorio', ROUND(RAND(), 4), 0),
         ut.tipo = 'pueblo_originario'
  FROM unidades_territoriales ut
  WHERE ut.activa
    AND (FIND_IN_SET(ut.alcaldia_id, REPLACE(COALESCE(p_alcaldias, ''), ' ', '')) > 0
      OR FIND_IN_SET(ut.id, REPLACE(COALESCE(p_unidades, ''), ' ', '')) > 0);

  IF p_origen_indices = 'api' THEN
    SET v_max_delitos = (SELECT MAX(vi.incidencia_delictiva_actual) FROM v_indicadores_recientes vi
                         WHERE vi.unidad_territorial_id IN (SELECT unidad_territorial_id FROM ciclo_unidades
                                                            WHERE ciclo_id = v_ciclo));
    SET v_ut = (SELECT MIN(unidad_territorial_id) FROM ciclo_unidades WHERE ciclo_id = v_ciclo);
    WHILE v_ut IS NOT NULL AND v_vueltas < 100000 DO
      SET v_vueltas = v_vueltas + 1;
      SET v_poblacion = (SELECT poblacion_actual FROM v_indicadores_recientes WHERE unidad_territorial_id = v_ut);
      SET v_flotante  = (SELECT poblacion_flotante_actual FROM v_indicadores_recientes WHERE unidad_territorial_id = v_ut);
      SET v_pobreza   = (SELECT indice_pobreza_actual FROM v_indicadores_recientes WHERE unidad_territorial_id = v_ut);
      SET v_delitos   = (SELECT incidencia_delictiva_actual FROM v_indicadores_recientes WHERE unidad_territorial_id = v_ut);
      UPDATE ciclo_unidades
         SET poblacion          = COALESCE(FLOOR(v_poblacion), 0),
             poblacion_flotante = COALESCE(FLOOR(v_flotante), 0),
             indice_pobreza     = CASE WHEN v_pobreza IS NULL OR v_pobreza < 0 THEN 0
                                       WHEN v_pobreza > 1 THEN 1 ELSE v_pobreza END,
             indice_delictivo   = IF(v_max_delitos > 0, ROUND(COALESCE(v_delitos, 0) / v_max_delitos, 4), 0)
       WHERE ciclo_id = v_ciclo AND unidad_territorial_id = v_ut;
      SET v_ut = (SELECT MIN(unidad_territorial_id) FROM ciclo_unidades
                  WHERE ciclo_id = v_ciclo AND unidad_territorial_id > v_ut);
    END WHILE;
  END IF;

  CALL sp_bitacora('ciclo_crear', 'ciclos', v_ciclo, v_ciclo,
                   JSON_OBJECT('nombre', p_nombre, 'anio', p_anio, 'presupuesto', p_presupuesto,
                               'origen_indices', p_origen_indices));
  SELECT v_ciclo AS ciclo_id;
END$$

CREATE PROCEDURE sp_calcular_presupuesto(IN p_ciclo INT)
BEGIN
  DECLARE v_total DECIMAL(14,2); DECLARE v_pct DECIMAL(7,4); DECLARE v_n INT;
  DECLARE v_max_pob DECIMAL(14,4); DECLARE v_max_flot DECIMAL(14,4); DECLARE v_suma DECIMAL(14,6);
  DECLARE v_resto DECIMAL(14,2);
  CALL sp_requiere_admin();
  SELECT presupuesto_total, porcentaje_partes_iguales / 100 INTO v_total, v_pct
    FROM ciclos WHERE id = p_ciclo AND estado <> 'cerrado';
  IF v_total IS NULL THEN CALL sp_error('Ciclo inexistente o cerrado'); END IF;
  SELECT COUNT(*), NULLIF(MAX(poblacion), 0), NULLIF(MAX(poblacion_flotante), 0)
    INTO v_n, v_max_pob, v_max_flot FROM ciclo_unidades WHERE ciclo_id = p_ciclo;
  IF v_n = 0 THEN CALL sp_error('El ciclo no tiene unidades territoriales participantes'); END IF;

  SELECT SUM((indice_pobreza + indice_delictivo + COALESCE(poblacion / v_max_pob, 0)
              + COALESCE(poblacion_flotante / v_max_flot, 0) + IF(es_pueblo_originario, 1, 0)) / 5)
    INTO v_suma FROM ciclo_unidades WHERE ciclo_id = p_ciclo;

  UPDATE ciclo_unidades
     SET presupuesto_asignado = ROUND(
           v_total * v_pct / v_n
         + IF(v_suma > 0,
              v_total * (1 - v_pct) * ((indice_pobreza + indice_delictivo + COALESCE(poblacion / v_max_pob, 0)
                + COALESCE(poblacion_flotante / v_max_flot, 0) + IF(es_pueblo_originario, 1, 0)) / 5) / v_suma,
              v_total * (1 - v_pct) / v_n), 2)
   WHERE ciclo_id = p_ciclo;

  SET v_resto = v_total - (SELECT SUM(presupuesto_asignado) FROM ciclo_unidades WHERE ciclo_id = p_ciclo);
  UPDATE ciclo_unidades SET presupuesto_asignado = presupuesto_asignado + v_resto
   WHERE ciclo_id = p_ciclo ORDER BY presupuesto_asignado DESC LIMIT 1;

  CALL sp_bitacora('presupuesto_calcular', 'ciclos', p_ciclo, p_ciclo, NULL);
  SELECT unidad_territorial_id, presupuesto_asignado FROM ciclo_unidades WHERE ciclo_id = p_ciclo ORDER BY 1;
END$$

CREATE PROCEDURE sp_cambiar_fase(IN p_ciclo INT, IN p_fase VARCHAR(30))
BEGIN
  DECLARE v_fase SMALLINT; DECLARE v_estado VARCHAR(10); DECLARE v_votacion BOOLEAN; DECLARE v_anterior VARCHAR(30);
  CALL sp_requiere_admin();
  SELECT estado, votacion_abierta INTO v_estado, v_votacion FROM ciclos WHERE id = p_ciclo;
  IF v_estado IS NULL OR v_estado = 'cerrado' THEN CALL sp_error('Ciclo inexistente o cerrado'); END IF;
  SET v_fase = (SELECT id FROM fases WHERE clave = p_fase);
  IF v_fase IS NULL THEN CALL sp_error(CONCAT('Fase inexistente: ', p_fase)); END IF;
  IF v_votacion THEN CALL sp_error('Cierra la votación antes de cambiar de fase'); END IF;
  IF v_estado = 'borrador' AND EXISTS (SELECT 1 FROM ciclo_unidades
                                       WHERE ciclo_id = p_ciclo AND presupuesto_asignado IS NULL) THEN
    CALL sp_error('Calcula la distribución del presupuesto antes de activar el ciclo');
  END IF;
  SET v_anterior = (SELECT clave FROM fases WHERE id = (SELECT c.fase_actual_id FROM ciclos c WHERE c.id = p_ciclo));
  UPDATE ciclos SET fase_actual_id = v_fase, estado = 'activo' WHERE id = p_ciclo;
  CALL sp_bitacora('fase_cambiar', 'ciclos', p_ciclo, p_ciclo, JSON_OBJECT('de', v_anterior, 'a', p_fase));
END$$

CREATE PROCEDURE sp_cerrar_ciclo(IN p_ciclo INT)
BEGIN
  CALL sp_requiere_admin();
  IF COALESCE((SELECT clave FROM fases WHERE id = (SELECT c.fase_actual_id FROM ciclos c WHERE c.id = p_ciclo AND c.estado = 'activo')), '') <> COALESCE((SELECT clave FROM fases ORDER BY orden DESC LIMIT 1), '-') THEN
    CALL sp_error('Solo puede cerrarse un ciclo activo que llegó a su última fase');
  END IF;
  UPDATE ciclos SET estado = 'cerrado', cerrado_en = NOW(), votacion_abierta = FALSE WHERE id = p_ciclo;
  CALL sp_bitacora('ciclo_cerrar', 'ciclos', p_ciclo, p_ciclo, NULL);
END$$

CREATE PROCEDURE sp_realizar_sorteo(IN p_ciclo INT, IN p_ut INT)
BEGIN
  DECLARE v_id BIGINT; DECLARE v_n SMALLINT DEFAULT 0;
  CALL sp_requiere_funcionario('dictaminacion', (SELECT alcaldia_id FROM unidades_territoriales WHERE id = p_ut));
  IF COALESCE((SELECT clave FROM fases WHERE id = (SELECT c.fase_actual_id FROM ciclos c WHERE c.id = p_ciclo AND c.estado = 'activo')), '') <> 'sorteo_difusion' THEN
    CALL sp_error('El sorteo solo se realiza en la fase de Sorteo y Difusión');
  END IF;
  IF EXISTS (SELECT 1 FROM sorteos WHERE ciclo_id = p_ciclo AND unidad_territorial_id = p_ut) THEN
    CALL sp_error('El sorteo de esta unidad territorial ya se realizó');
  END IF;
  IF EXISTS (SELECT 1 FROM proyectos WHERE ciclo_id = p_ciclo AND unidad_territorial_id = p_ut
               AND estatus IN ('registrado','en_dictaminacion') AND estado_moderacion = 'visible') THEN
    CALL sp_error('Aún hay proyectos de esta unidad territorial sin dictamen');
  END IF;

  SET @interno = 1;
  sorteo: LOOP
    SET v_id = (SELECT id FROM proyectos
                WHERE ciclo_id = p_ciclo AND unidad_territorial_id = p_ut AND estatus = 'viable'
                  AND estado_moderacion = 'visible' AND numero_sorteo IS NULL
                ORDER BY RAND() LIMIT 1);
    IF v_id IS NULL THEN LEAVE sorteo; END IF;
    SET v_n = v_n + 1;
    UPDATE proyectos SET numero_sorteo = v_n, estatus = 'en_consulta' WHERE id = v_id;
  END LOOP;
  SET @interno = 0;

  INSERT INTO sorteos (ciclo_id, unidad_territorial_id, funcionario_id, boleta_publicada_en)
  VALUES (p_ciclo, p_ut, (SELECT usuario_id FROM funcionarios WHERE usuario_id = @usuario_id), NOW());
  CALL sp_bitacora('sorteo_realizar', 'sorteos', p_ut, p_ciclo, JSON_OBJECT('proyectos', v_n));
  SELECT numero_sorteo, id AS proyecto_id, folio, titulo FROM proyectos
  WHERE ciclo_id = p_ciclo AND unidad_territorial_id = p_ut AND numero_sorteo IS NOT NULL
  ORDER BY numero_sorteo;
END$$

CREATE PROCEDURE sp_abrir_votacion(IN p_ciclo INT)
BEGIN
  CALL sp_requiere_admin();
  IF COALESCE((SELECT clave FROM fases WHERE id = (SELECT c.fase_actual_id FROM ciclos c WHERE c.id = p_ciclo AND c.estado = 'activo')), '') <> 'consulta' THEN
    CALL sp_error('La votación solo puede abrirse en la fase de Consulta');
  END IF;
  IF (SELECT computo_realizado_en FROM ciclos WHERE id = p_ciclo) IS NOT NULL THEN
    CALL sp_error('El cómputo de este ciclo ya se realizó');
  END IF;
  UPDATE ciclos SET votacion_abierta = TRUE, votacion_abierta_en = COALESCE(votacion_abierta_en, NOW())
   WHERE id = p_ciclo;
  CALL sp_bitacora('votacion_abrir', 'ciclos', p_ciclo, p_ciclo, NULL);
END$$

CREATE PROCEDURE sp_emitir_voto(IN p_proyecto BIGINT)
BEGIN
  DECLARE v_ciclo INT; DECLARE v_ut INT; DECLARE v_anio SMALLINT; DECLARE v_folio VARCHAR(20);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  IF NOT EXISTS (SELECT 1 FROM usuarios WHERE id = @usuario_id AND rol = 'ciudadano' AND estado = 'activa') THEN
    CALL sp_error('Solo un Ciudadano con cuenta activa puede votar');
  END IF;
  SELECT id, anio_simulado INTO v_ciclo, v_anio FROM ciclos WHERE estado = 'activo';
  SET v_ut = (SELECT unidad_territorial_id FROM ciudadanos WHERE usuario_id = @usuario_id);
  IF COALESCE((SELECT clave FROM fases WHERE id = (SELECT c.fase_actual_id FROM ciclos c WHERE c.id = v_ciclo)), '') <> 'consulta'
     OR NOT (SELECT votacion_abierta FROM ciclos WHERE id = v_ciclo) THEN
    CALL sp_error('La recepción de votos no está abierta');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM proyectos WHERE id = p_proyecto AND ciclo_id = v_ciclo AND unidad_territorial_id = v_ut
                   AND estatus = 'en_consulta' AND estado_moderacion = 'visible') THEN
    CALL sp_error('El proyecto no está en la boleta de tu unidad territorial');
  END IF;
  IF EXISTS (SELECT 1 FROM participaciones WHERE ciclo_id = v_ciclo AND ciudadano_id = @usuario_id) THEN
    CALL sp_error('Ya emitiste tu voto en este ciclo');
  END IF;

  SET v_folio = CONCAT('CP-', v_anio, '-', UPPER(LEFT(SHA2(CONCAT(UUID(), RAND()), 256), 10)));
  START TRANSACTION;
    INSERT INTO participaciones (ciclo_id, ciudadano_id, unidad_territorial_id, folio_comprobante)
    VALUES (v_ciclo, @usuario_id, v_ut, v_folio);
    INSERT INTO votos (id, ciclo_id, unidad_territorial_id, proyecto_id)
    VALUES (LEFT(SHA2(CONCAT(UUID(), RAND()), 256), 32), v_ciclo, v_ut, p_proyecto);
  COMMIT;
  SELECT folio_comprobante, participo_en FROM participaciones
  WHERE ciclo_id = v_ciclo AND ciudadano_id = @usuario_id;
END$$

CREATE PROCEDURE sp_contar_votos(IN p_ciclo INT)
BEGIN
  CALL sp_requiere_admin();
  IF (SELECT votacion_abierta FROM ciclos WHERE id = p_ciclo) OR (SELECT votacion_cerrada_en FROM ciclos WHERE id = p_ciclo) IS NULL THEN
    CALL sp_error('La votación debe estar cerrada para contar los votos');
  END IF;
  IF (SELECT resultados_publicados_en FROM ciclos WHERE id = p_ciclo) IS NOT NULL THEN
    CALL sp_error('Los resultados ya fueron publicados');
  END IF;

  DELETE FROM resultados_unidad   WHERE ciclo_id = p_ciclo;
  DELETE FROM resultados_proyecto WHERE ciclo_id = p_ciclo;

  INSERT INTO resultados_proyecto (proyecto_id, ciclo_id, unidad_territorial_id, total_votos, posicion)
  SELECT x.id, x.ciclo_id, x.unidad_territorial_id, x.total,
         RANK() OVER (PARTITION BY x.unidad_territorial_id ORDER BY x.total DESC)
  FROM (SELECT p.id, p.ciclo_id, p.unidad_territorial_id,
               (SELECT COUNT(*) FROM votos v WHERE v.proyecto_id = p.id) AS total
        FROM proyectos p
        WHERE p.ciclo_id = p_ciclo AND p.estatus = 'en_consulta' AND p.estado_moderacion = 'visible') x;

  INSERT INTO resultados_unidad (ciclo_id, unidad_territorial_id, total_votos, caso_especial, proyecto_ganador_id, metodo)
  SELECT p_ciclo, a.ut, a.total, a.caso,
         IF(a.caso IS NULL, a.primero, NULL),
         IF(a.caso IS NULL, 'votacion', NULL)
  FROM (SELECT rp.unidad_territorial_id AS ut,
               SUM(rp.total_votos) AS total,
               CASE WHEN COUNT(*) = 1 THEN 'unico_viable'
                    WHEN SUM(rp.total_votos) = 0 THEN 'sin_votos'
                    WHEN SUM(rp.posicion = 1) > 1 THEN 'empate' END AS caso,
               MIN(IF(rp.posicion = 1, rp.proyecto_id, NULL)) AS primero
        FROM resultados_proyecto rp WHERE rp.ciclo_id = p_ciclo
        GROUP BY rp.unidad_territorial_id) a;

  UPDATE ciclos SET computo_realizado_en = NOW() WHERE id = p_ciclo;
  CALL sp_bitacora('votos_contar', 'ciclos', p_ciclo, p_ciclo, NULL);
  SELECT COUNT(*) AS unidades, SUM(caso_especial IS NOT NULL) AS casos_especiales
  FROM resultados_unidad WHERE ciclo_id = p_ciclo;
END$$

CREATE PROCEDURE sp_cerrar_votacion(IN p_ciclo INT)
BEGIN
  CALL sp_requiere_admin();
  IF NOT COALESCE((SELECT votacion_abierta FROM ciclos WHERE id = p_ciclo), FALSE) THEN
    CALL sp_error('La votación no está abierta');
  END IF;
  UPDATE ciclos SET votacion_abierta = FALSE, votacion_cerrada_en = NOW() WHERE id = p_ciclo;
  CALL sp_bitacora('votacion_cerrar', 'ciclos', p_ciclo, p_ciclo, NULL);
  CALL sp_contar_votos(p_ciclo);
END$$

CREATE PROCEDURE sp_resolver_caso_especial(IN p_ciclo INT, IN p_ut INT, IN p_metodo VARCHAR(20),
                                           IN p_justificacion VARCHAR(500), IN p_proyecto BIGINT)
BEGIN
  DECLARE v_caso VARCHAR(20); DECLARE v_ganador BIGINT;
  CALL sp_requiere_funcionario('consulta', (SELECT alcaldia_id FROM unidades_territoriales WHERE id = p_ut));
  SELECT caso_especial, proyecto_ganador_id INTO v_caso, v_ganador
    FROM resultados_unidad WHERE ciclo_id = p_ciclo AND unidad_territorial_id = p_ut;
  IF v_caso IS NULL THEN CALL sp_error('Esta unidad territorial no es un caso especial'); END IF;
  IF v_ganador IS NOT NULL THEN CALL sp_error('El caso especial ya fue resuelto'); END IF;
  IF (SELECT resultados_publicados_en FROM ciclos WHERE id = p_ciclo) IS NOT NULL THEN
    CALL sp_error('Los resultados ya fueron publicados');
  END IF;

  IF p_metodo = 'asamblea_seleccion' THEN
    IF NOT EXISTS (SELECT 1 FROM resultados_proyecto
                   WHERE ciclo_id = p_ciclo AND unidad_territorial_id = p_ut AND proyecto_id = p_proyecto
                     AND (v_caso <> 'empate' OR posicion = 1)) THEN
      CALL sp_error('El proyecto seleccionado no es candidato en este caso especial');
    END IF;
    SET v_ganador = p_proyecto;
  ELSEIF p_metodo = 'asamblea_sorteo' THEN
    SET v_ganador = (SELECT proyecto_id FROM resultados_proyecto
                     WHERE ciclo_id = p_ciclo AND unidad_territorial_id = p_ut
                       AND (v_caso <> 'empate' OR posicion = 1)
                     ORDER BY RAND() LIMIT 1);
  ELSE
    CALL sp_error('Método no válido: usa asamblea_seleccion o asamblea_sorteo');
  END IF;

  UPDATE resultados_unidad
     SET proyecto_ganador_id = v_ganador, metodo = p_metodo, justificacion = p_justificacion,
         resuelto_por = (SELECT usuario_id FROM funcionarios WHERE usuario_id = @usuario_id), resuelto_en = NOW()
   WHERE ciclo_id = p_ciclo AND unidad_territorial_id = p_ut;
  CALL sp_bitacora('caso_especial_resolver', 'resultados_unidad', p_ut, p_ciclo,
                   JSON_OBJECT('metodo', p_metodo, 'ganador', v_ganador));
  SELECT v_ganador AS proyecto_ganador_id;
END$$

CREATE PROCEDURE sp_publicar_ganadores(IN p_ciclo INT)
BEGIN
  DECLARE v_pendientes INT;
  CALL sp_requiere_admin();
  IF (SELECT computo_realizado_en FROM ciclos WHERE id = p_ciclo) IS NULL THEN
    CALL sp_error('Primero cierra la votación para realizar el cómputo');
  END IF;
  IF (SELECT resultados_publicados_en FROM ciclos WHERE id = p_ciclo) IS NOT NULL THEN
    CALL sp_error('Los resultados ya fueron publicados');
  END IF;
  SET v_pendientes = (SELECT COUNT(*) FROM resultados_unidad WHERE ciclo_id = p_ciclo AND proyecto_ganador_id IS NULL);
  IF v_pendientes > 0 THEN
    CALL sp_error(CONCAT('Hay ', v_pendientes, ' caso(s) especial(es) sin resolver'));
  END IF;

  SET @interno = 1;
  UPDATE proyectos p JOIN resultados_unidad ru ON ru.proyecto_ganador_id = p.id AND ru.ciclo_id = p_ciclo
     SET p.estatus = 'ganador';
  SET @interno = 0;
  UPDATE ciclos SET resultados_publicados_en = NOW() WHERE id = p_ciclo;

  INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje, proyecto_id)
  SELECT p.proponente_id, 'proyecto_ganador', '¡Tu proyecto ganó la consulta!',
         CONCAT('El proyecto ', p.folio, ' resultó ganador en tu unidad territorial.'), p.id
  FROM proyectos p JOIN resultados_unidad ru ON ru.proyecto_ganador_id = p.id AND ru.ciclo_id = p_ciclo;

  CALL sp_bitacora('ganadores_publicar', 'ciclos', p_ciclo, p_ciclo, NULL);
  SELECT COUNT(*) AS ganadores FROM resultados_unidad WHERE ciclo_id = p_ciclo;
END$$

CREATE PROCEDURE sp_guardar_archivo(IN p_categoria VARCHAR(16), IN p_nombre_original VARCHAR(255),
       IN p_tipo_mime VARCHAR(50), IN p_contenido LONGBLOB, IN p_ancho SMALLINT, IN p_alto SMALLINT,
       IN p_miniatura MEDIUMBLOB)
BEGIN
  DECLARE v_id BIGINT; DECLARE v_uuid CHAR(36); DECLARE v_firma VARCHAR(64);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  IF p_contenido IS NULL OR LENGTH(p_contenido) = 0 THEN CALL sp_error('El archivo está vacío'); END IF;
  IF p_categoria IN ('imagen_proyecto', 'foto_reporte', 'comprobante') THEN
    IF @usuario_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = @usuario_id
                                                 AND rol = 'ciudadano' AND estado = 'activa') THEN
      CALL sp_error('Solo un Ciudadano con cuenta activa puede subir este archivo');
    END IF;
  ELSEIF p_categoria = 'foto_perfil' THEN
    IF NOT EXISTS (SELECT 1 FROM usuarios WHERE id = @usuario_id AND estado = 'activa') THEN
      CALL sp_error('Inicia sesión para cambiar tu foto de perfil');
    END IF;
  ELSE
    CALL sp_requiere_admin();
  END IF;

  SET v_firma = HEX(SUBSTRING(CAST(p_contenido AS BINARY), 1, 8));
  IF p_tipo_mime = 'image/jpeg' AND LEFT(v_firma, 6) <> 'FFD8FF' THEN
    CALL sp_error('El archivo no es una imagen JPG válida');
  ELSEIF p_tipo_mime = 'image/png' AND v_firma <> '89504E470D0A1A0A' THEN
    CALL sp_error('El archivo no es una imagen PNG válida');
  ELSEIF p_tipo_mime = 'application/pdf' AND LEFT(v_firma, 10) <> '255044462D' THEN
    CALL sp_error('El archivo no es un PDF válido');
  END IF;
  IF p_categoria IN ('imagen_proyecto', 'foto_reporte', 'imagen_sistema', 'foto_perfil')
     AND (p_tipo_mime NOT IN ('image/jpeg', 'image/png') OR LENGTH(p_contenido) > 5242880) THEN
    CALL sp_error('Las imágenes deben ser JPG o PNG de hasta 5 MB');
  END IF;

  SET v_uuid = UUID();
  START TRANSACTION;
    INSERT INTO archivos (uuid, categoria, nombre_original, tipo_mime, tamano_bytes, sha256, ancho_px, alto_px, subido_por)
    VALUES (v_uuid, p_categoria, LEFT(p_nombre_original, 255), p_tipo_mime, LENGTH(p_contenido),
            SHA2(p_contenido, 256), p_ancho, p_alto, @usuario_id);
    SET v_id = (SELECT id FROM archivos WHERE uuid = v_uuid);
    INSERT INTO archivos_contenido (archivo_id, contenido, miniatura) VALUES (v_id, p_contenido, p_miniatura);
  COMMIT;
  SELECT v_id AS archivo_id, v_uuid AS uuid;
END$$

CREATE PROCEDURE sp_obtener_archivo(IN p_uuid CHAR(36), IN p_miniatura BOOLEAN)
BEGIN
  SELECT a.id, a.uuid, a.nombre_original, a.tipo_mime, a.tamano_bytes, a.sha256,
         IF(p_miniatura AND c.miniatura IS NOT NULL, c.miniatura, c.contenido) AS contenido
  FROM archivos a JOIN archivos_contenido c ON c.archivo_id = a.id
  WHERE a.uuid = p_uuid AND a.eliminado_en IS NULL;
END$$

CREATE PROCEDURE sp_eliminar_archivo(IN p_uuid CHAR(36))
BEGIN
  IF @usuario_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM archivos WHERE uuid = p_uuid AND subido_por = @usuario_id) THEN
    CALL sp_requiere_funcionario('seguimiento', NULL);
  END IF;
  UPDATE archivos SET eliminado_en = NOW() WHERE uuid = p_uuid AND eliminado_en IS NULL;
END$$

CREATE PROCEDURE sp_registrar_reporte_generado(IN p_ciclo INT, IN p_tipo VARCHAR(20),
                                               IN p_archivo BIGINT, IN p_filtros JSON)
BEGIN
  CALL sp_requiere_admin();
  INSERT INTO reportes_generados (ciclo_id, tipo, archivo_id, filtros, generado_por)
  VALUES (p_ciclo, p_tipo, p_archivo, p_filtros, @usuario_id);
  CALL sp_bitacora(CONCAT('reporte_', p_tipo), 'reportes_generados', p_archivo, p_ciclo, p_filtros);
END$$

CREATE PROCEDURE sp_encolar_correo(IN p_usuario INT, IN p_destinatario VARCHAR(50), IN p_asunto VARCHAR(150),
                                   IN p_cuerpo TEXT, IN p_plantilla VARCHAR(40))
BEGIN
  INSERT INTO correos_salida (usuario_id, destinatario, asunto, cuerpo, plantilla)
  VALUES (p_usuario, LOWER(p_destinatario), p_asunto, p_cuerpo, p_plantilla);
  SELECT MAX(id) AS correo_id FROM correos_salida WHERE destinatario = LOWER(p_destinatario);
END$$

CREATE PROCEDURE sp_correo_resultado(IN p_correo BIGINT, IN p_enviado BOOLEAN, IN p_fuente_clave VARCHAR(40),
                                     IN p_id_mensaje_externo VARCHAR(100), IN p_error VARCHAR(500))
BEGIN
  UPDATE correos_salida
     SET intentos = intentos + 1,
         estado = IF(p_enviado, 'enviado', IF(intentos >= 3, 'fallido', 'pendiente')),
         enviado_en = IF(p_enviado, NOW(), NULL),
         fuente_id = (SELECT id FROM fuentes_externas WHERE clave = p_fuente_clave),
         id_mensaje_externo = p_id_mensaje_externo,
         ultimo_error = p_error
   WHERE id = p_correo;
END$$

CREATE PROCEDURE sp_geocodificacion_buscar(IN p_consulta VARCHAR(300))
BEGIN
  DECLARE v_hash CHAR(64);
  SET v_hash = SHA2(LOWER(TRIM(p_consulta)), 256);
  UPDATE geocodificaciones SET usos = usos + 1 WHERE consulta_hash = v_hash;
  SELECT id, exito, latitud, longitud, direccion_encontrada, consultado_en
  FROM geocodificaciones WHERE consulta_hash = v_hash;
END$$

CREATE PROCEDURE sp_geocodificacion_guardar(IN p_consulta VARCHAR(300), IN p_exito BOOLEAN,
       IN p_latitud DECIMAL(9,6), IN p_longitud DECIMAL(9,6), IN p_direccion VARCHAR(300), IN p_respuesta JSON)
BEGIN
  DECLARE v_hash CHAR(64);
  SET v_hash = SHA2(LOWER(TRIM(p_consulta)), 256);
  INSERT INTO geocodificaciones (consulta_hash, consulta, fuente_id, exito, latitud, longitud, direccion_encontrada, respuesta)
  VALUES (v_hash, LOWER(TRIM(p_consulta)), (SELECT id FROM fuentes_externas WHERE clave = 'nominatim'),
          p_exito, p_latitud, p_longitud, p_direccion, p_respuesta)
  ON DUPLICATE KEY UPDATE exito = p_exito, latitud = p_latitud, longitud = p_longitud,
                          direccion_encontrada = p_direccion, respuesta = p_respuesta, consultado_en = NOW();
  SELECT id FROM geocodificaciones WHERE consulta_hash = v_hash;
END$$

CREATE PROCEDURE sp_sync_iniciar(IN p_fuente_clave VARCHAR(40), IN p_disparada_por VARCHAR(10))
BEGIN
  DECLARE v_fuente SMALLINT;
  IF p_disparada_por = 'manual' THEN CALL sp_requiere_admin(); END IF;
  SET v_fuente = (SELECT id FROM fuentes_externas WHERE clave = p_fuente_clave AND activa);
  IF v_fuente IS NULL THEN CALL sp_error(CONCAT('Fuente inexistente o inactiva: ', p_fuente_clave)); END IF;
  IF EXISTS (SELECT 1 FROM sincronizaciones WHERE fuente_id = v_fuente AND estado = 'en_curso'
               AND iniciada_en > NOW() - INTERVAL 2 HOUR) THEN
    CALL sp_error('Ya hay una sincronización en curso para esta fuente');
  END IF;
  INSERT INTO sincronizaciones (fuente_id, disparada_por, usuario_id)
  VALUES (v_fuente, COALESCE(p_disparada_por, 'programada'), @usuario_id);
  SELECT MAX(id) AS sincronizacion_id FROM sincronizaciones WHERE fuente_id = v_fuente;
END$$

CREATE PROCEDURE sp_sync_contar(IN p_sync BIGINT, IN p_resultado VARCHAR(12))
BEGIN
  UPDATE sincronizaciones
     SET registros_leidos = registros_leidos + 1,
         nuevos       = nuevos       + (p_resultado = 'nuevo'),
         actualizados = actualizados + (p_resultado = 'actualizado'),
         sin_cambios  = sin_cambios  + (p_resultado = 'sin_cambios'),
         omitidos     = omitidos     + (p_resultado = 'omitido')
   WHERE id = p_sync;
END$$

CREATE PROCEDURE sp_sync_error(IN p_sync BIGINT, IN p_id_externo VARCHAR(100), IN p_mensaje VARCHAR(500), IN p_datos JSON)
BEGIN
  INSERT INTO sincronizacion_errores (sincronizacion_id, id_externo, mensaje, datos)
  VALUES (p_sync, p_id_externo, LEFT(p_mensaje, 500), p_datos);
  UPDATE sincronizaciones SET registros_leidos = registros_leidos + 1, con_error = con_error + 1 WHERE id = p_sync;
END$$

CREATE PROCEDURE sp_sync_finalizar(IN p_sync BIGINT, IN p_mensaje_error VARCHAR(1000))
BEGIN
  UPDATE sincronizaciones
     SET finalizada_en = NOW(),
         mensaje = p_mensaje_error,
         estado = CASE WHEN p_mensaje_error IS NOT NULL THEN 'fallida'
                       WHEN con_error = 0 THEN 'exitosa'
                       WHEN con_error < registros_leidos THEN 'parcial'
                       ELSE 'fallida' END
   WHERE id = p_sync AND estado = 'en_curso';
  UPDATE fuentes_externas f JOIN sincronizaciones sy ON sy.fuente_id = f.id
     SET f.ultima_sincronizacion_exitosa = sy.finalizada_en
   WHERE sy.id = p_sync AND sy.estado IN ('exitosa', 'parcial');
  SELECT estado, registros_leidos, nuevos, actualizados, sin_cambios, omitidos, con_error
  FROM sincronizaciones WHERE id = p_sync;
END$$

CREATE PROCEDURE sp_sync_alcaldia(IN p_sync BIGINT, IN p_id_externo VARCHAR(100), IN p_nombre VARCHAR(50),
       IN p_clave CHAR(3), IN p_latitud DECIMAL(9,6), IN p_longitud DECIMAL(9,6), IN p_geojson JSON, IN p_datos JSON)
BEGIN
  DECLARE v_fuente SMALLINT; DECLARE v_id SMALLINT; DECLARE v_hash CHAR(64);
  SET v_fuente = (SELECT fuente_id FROM sincronizaciones WHERE id = p_sync);
  SET v_hash = SHA2(CONCAT(COALESCE(CAST(p_datos AS CHAR), ''), COALESCE(CAST(p_geojson AS CHAR), '')), 256);
  SET v_id = COALESCE((SELECT id FROM alcaldias WHERE fuente_id = v_fuente AND id_externo = p_id_externo),
                      (SELECT id FROM alcaldias WHERE nombre = p_nombre));
  IF v_id IS NULL AND p_clave IS NULL THEN
    CALL sp_sync_error(p_sync, p_id_externo, CONCAT('Alcaldía nueva sin clave de 3 letras: ', COALESCE(p_nombre, '?')), p_datos);
  ELSEIF v_id IS NULL THEN
    INSERT INTO alcaldias (clave, nombre, latitud, longitud, limite_geojson, origen, fuente_id, id_externo,
                           hash_datos, datos_externos, sincronizado_en)
    VALUES (p_clave, p_nombre, p_latitud, p_longitud, p_geojson, 'api', v_fuente, p_id_externo, v_hash, p_datos, NOW());
    CALL sp_sync_contar(p_sync, 'nuevo');
  ELSEIF (SELECT hash_datos FROM alcaldias WHERE id = v_id) = v_hash THEN
    UPDATE alcaldias SET sincronizado_en = NOW() WHERE id = v_id;
    CALL sp_sync_contar(p_sync, 'sin_cambios');
  ELSE
    UPDATE alcaldias
       SET nombre = COALESCE(p_nombre, nombre), latitud = COALESCE(p_latitud, latitud),
           longitud = COALESCE(p_longitud, longitud), limite_geojson = COALESCE(p_geojson, limite_geojson),
           origen = 'api', fuente_id = v_fuente, id_externo = p_id_externo, hash_datos = v_hash,
           datos_externos = p_datos, sincronizado_en = NOW()
     WHERE id = v_id;
    CALL sp_sync_contar(p_sync, 'actualizado');
  END IF;
END$$

CREATE PROCEDURE sp_sync_unidad(IN p_sync BIGINT, IN p_id_externo VARCHAR(100), IN p_alcaldia_nombre VARCHAR(50),
       IN p_clave VARCHAR(20), IN p_nombre VARCHAR(100), IN p_tipo VARCHAR(19),
       IN p_latitud DECIMAL(9,6), IN p_longitud DECIMAL(9,6), IN p_geojson JSON, IN p_datos JSON)
BEGIN
  DECLARE v_fuente SMALLINT; DECLARE v_id INT; DECLARE v_alc SMALLINT; DECLARE v_hash CHAR(64);
  SET v_fuente = (SELECT fuente_id FROM sincronizaciones WHERE id = p_sync);
  SET v_alc = (SELECT id FROM alcaldias WHERE nombre = p_alcaldia_nombre);
  SET v_hash = SHA2(CONCAT(COALESCE(CAST(p_datos AS CHAR), ''), COALESCE(CAST(p_geojson AS CHAR), '')), 256);
  SET v_id = COALESCE((SELECT id FROM unidades_territoriales WHERE fuente_id = v_fuente AND id_externo = p_id_externo),
                      (SELECT id FROM unidades_territoriales WHERE clave = p_clave));
  IF v_alc IS NULL THEN
    CALL sp_sync_error(p_sync, p_id_externo, CONCAT('Alcaldía no encontrada: ', COALESCE(p_alcaldia_nombre, '?')), p_datos);
  ELSEIF COALESCE(p_tipo, 'colonia') NOT IN ('colonia', 'barrio', 'pueblo_originario', 'unidad_habitacional') THEN
    CALL sp_sync_error(p_sync, p_id_externo, CONCAT('Tipo de unidad no válido: ', p_tipo), p_datos);
  ELSEIF v_id IS NULL THEN
    INSERT INTO unidades_territoriales (alcaldia_id, clave, nombre, tipo, latitud, longitud, limite_geojson,
                                        origen, fuente_id, id_externo, hash_datos, datos_externos, sincronizado_en)
    VALUES (v_alc, p_clave, p_nombre, COALESCE(p_tipo, 'colonia'), p_latitud, p_longitud, p_geojson,
            'api', v_fuente, p_id_externo, v_hash, p_datos, NOW());
    CALL sp_sync_contar(p_sync, 'nuevo');
  ELSEIF (SELECT hash_datos FROM unidades_territoriales WHERE id = v_id) = v_hash THEN
    UPDATE unidades_territoriales SET sincronizado_en = NOW() WHERE id = v_id;
    CALL sp_sync_contar(p_sync, 'sin_cambios');
  ELSE
    UPDATE unidades_territoriales
       SET alcaldia_id = v_alc, clave = p_clave, nombre = p_nombre, tipo = COALESCE(p_tipo, tipo),
           latitud = COALESCE(p_latitud, latitud), longitud = COALESCE(p_longitud, longitud),
           limite_geojson = COALESCE(p_geojson, limite_geojson), origen = 'api', fuente_id = v_fuente,
           id_externo = p_id_externo, hash_datos = v_hash, datos_externos = p_datos, sincronizado_en = NOW()
     WHERE id = v_id;
    CALL sp_sync_contar(p_sync, 'actualizado');
  END IF;
END$$

CREATE PROCEDURE sp_sync_indicador(IN p_sync BIGINT, IN p_unidad_clave VARCHAR(20), IN p_indicador_clave VARCHAR(40),
       IN p_periodo SMALLINT, IN p_valor DECIMAL(16,4), IN p_datos JSON)
BEGIN
  DECLARE v_fuente SMALLINT; DECLARE v_ut INT; DECLARE v_ind SMALLINT; DECLARE v_hash CHAR(64); DECLARE v_actual CHAR(64);
  DECLARE v_existe INT;
  SET v_fuente = (SELECT fuente_id FROM sincronizaciones WHERE id = p_sync);
  SET v_ut  = (SELECT id FROM unidades_territoriales WHERE clave = p_unidad_clave);
  SET v_ind = (SELECT id FROM indicadores WHERE clave = p_indicador_clave);
  SET v_hash = SHA2(CONCAT(p_valor, '|', COALESCE(CAST(p_datos AS CHAR), '')), 256);
  IF v_ut IS NULL OR v_ind IS NULL OR p_valor IS NULL THEN
    CALL sp_sync_error(p_sync, CONCAT(p_unidad_clave, '/', p_indicador_clave, '/', p_periodo),
                       'Unidad territorial, indicador o valor no válido', p_datos);
  ELSE
    SET v_existe = (SELECT COUNT(*) FROM indicadores_unidad
                    WHERE unidad_territorial_id = v_ut AND indicador_id = v_ind AND periodo = p_periodo);
    SET v_actual = (SELECT hash_datos FROM indicadores_unidad
                    WHERE unidad_territorial_id = v_ut AND indicador_id = v_ind AND periodo = p_periodo);
    IF v_existe = 0 THEN
      INSERT INTO indicadores_unidad (unidad_territorial_id, indicador_id, periodo, valor, fuente_id, hash_datos, datos_externos)
      VALUES (v_ut, v_ind, p_periodo, p_valor, v_fuente, v_hash, p_datos);
      CALL sp_sync_contar(p_sync, 'nuevo');
    ELSEIF v_actual = v_hash THEN
      CALL sp_sync_contar(p_sync, 'sin_cambios');
    ELSE
      UPDATE indicadores_unidad SET valor = p_valor, fuente_id = v_fuente, hash_datos = v_hash,
                                    datos_externos = p_datos, sincronizado_en = NOW()
       WHERE unidad_territorial_id = v_ut AND indicador_id = v_ind AND periodo = p_periodo;
      CALL sp_sync_contar(p_sync, 'actualizado');
    END IF;
  END IF;
END$$

CREATE PROCEDURE sp_sync_directorio(IN p_sync BIGINT, IN p_id_externo VARCHAR(100), IN p_alcaldia_nombre VARCHAR(50),
       IN p_tipo VARCHAR(13), IN p_cargo VARCHAR(50), IN p_nombre_titular VARCHAR(50), IN p_temas VARCHAR(100),
       IN p_direccion VARCHAR(150), IN p_telefono VARCHAR(30), IN p_correo VARCHAR(50), IN p_sitio_web VARCHAR(100),
       IN p_datos JSON)
BEGIN
  DECLARE v_fuente SMALLINT; DECLARE v_id INT; DECLARE v_alc SMALLINT; DECLARE v_hash CHAR(64); DECLARE v_tel VARCHAR(30);
  SET v_fuente = (SELECT fuente_id FROM sincronizaciones WHERE id = p_sync);
  SET v_alc = (SELECT id FROM alcaldias WHERE nombre = p_alcaldia_nombre);
  SET v_hash = SHA2(COALESCE(CAST(p_datos AS CHAR), ''), 256);
  SET v_tel = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(p_telefono, ''), ' ', ''), '-', ''), '(', ''), ')', ''), '+52', '');
  SET v_tel = IF(LENGTH(v_tel) = 10, v_tel, NULL);
  SET v_id = (SELECT id FROM directorio WHERE fuente_id = v_fuente AND id_externo = p_id_externo);
  IF v_alc IS NULL THEN
    CALL sp_sync_error(p_sync, p_id_externo, CONCAT('Alcaldía no encontrada: ', COALESCE(p_alcaldia_nombre, '?')), p_datos);
  ELSEIF v_id IS NULL THEN
    INSERT INTO directorio (alcaldia_id, tipo, cargo, nombre_titular, temas, direccion, telefono, correo, sitio_web,
                            origen, fuente_id, id_externo, hash_datos, datos_externos, sincronizado_en)
    VALUES (v_alc, COALESCE(p_tipo, 'sede_atencion'), p_cargo, p_nombre_titular, p_temas, p_direccion, v_tel,
            p_correo, p_sitio_web, 'api', v_fuente, p_id_externo, v_hash, p_datos, NOW());
    CALL sp_sync_contar(p_sync, 'nuevo');
  ELSEIF (SELECT editado_manualmente FROM directorio WHERE id = v_id) THEN
    CALL sp_sync_contar(p_sync, 'omitido');
  ELSEIF (SELECT hash_datos FROM directorio WHERE id = v_id) = v_hash THEN
    CALL sp_sync_contar(p_sync, 'sin_cambios');
  ELSE
    UPDATE directorio
       SET alcaldia_id = v_alc, tipo = COALESCE(p_tipo, tipo), cargo = p_cargo, nombre_titular = p_nombre_titular,
           temas = p_temas, direccion = p_direccion, telefono = v_tel, correo = p_correo, sitio_web = p_sitio_web,
           hash_datos = v_hash, datos_externos = p_datos, sincronizado_en = NOW()
     WHERE id = v_id;
    CALL sp_sync_contar(p_sync, 'actualizado');
  END IF;
END$$

CREATE PROCEDURE sp_sync_pendientes()
BEGIN
  SELECT f.id, f.clave, f.nombre, f.url_base, f.recurso, f.formato, f.autenticacion, f.variable_credencial,
         f.entidad_destino, f.ultima_sincronizacion_exitosa
  FROM fuentes_externas f
  WHERE f.activa AND f.tipo = 'datos' AND f.frecuencia_minutos IS NOT NULL
    AND (f.ultima_sincronizacion_exitosa IS NULL
         OR f.ultima_sincronizacion_exitosa < NOW() - INTERVAL f.frecuencia_minutos MINUTE)
    AND NOT EXISTS (SELECT 1 FROM sincronizaciones sy WHERE sy.fuente_id = f.id AND sy.estado = 'en_curso'
                      AND sy.iniciada_en > NOW() - INTERVAL 2 HOUR);
END$$

DELIMITER ;

CREATE VIEW v_panel_ciclo AS
SELECT c.id AS ciclo_id, c.nombre AS ciclo, c.anio_simulado, c.estado,
       f.id AS fase_id, f.orden, f.clave, f.nombre_es, f.nombre_en,
       cf.fecha_inicio, cf.fecha_fin, (f.id = c.fase_actual_id) AS es_fase_activa,
       f.que_ocurre_es, f.que_ocurre_en, f.que_puedes_hacer_es, f.que_puedes_hacer_en,
       c.votacion_abierta, c.resultados_publicados_en
FROM ciclos c
CROSS JOIN fases f
LEFT JOIN ciclo_fases cf ON cf.ciclo_id = c.id AND cf.fase_id = f.id;

CREATE VIEW v_presupuesto_unidades AS
SELECT cu.ciclo_id, a.id AS alcaldia_id, a.nombre AS alcaldia, ut.id AS unidad_territorial_id,
       ut.clave, ut.nombre AS unidad_territorial, ut.tipo, cu.presupuesto_asignado
FROM ciclo_unidades cu
JOIN unidades_territoriales ut ON ut.id = cu.unidad_territorial_id
JOIN alcaldias a ON a.id = ut.alcaldia_id;

CREATE VIEW v_foro AS
SELECT i.id, i.ciclo_id, i.unidad_territorial_id, i.contenido, i.rubro_id, r.nombre_es AS rubro,
       i.total_apoyos, i.creada_en, i.autor_id, u.nombre_completo AS autor,
       (SELECT COUNT(*) FROM comentarios_idea ci WHERE ci.idea_id = i.id AND ci.estado = 'visible') AS total_comentarios
FROM ideas i
JOIN rubros r ON r.id = i.rubro_id
JOIN usuarios u ON u.id = i.autor_id
WHERE i.estado = 'visible';

CREATE VIEW v_boleta AS
SELECT p.ciclo_id, p.unidad_territorial_id, p.numero_sorteo, p.id AS proyecto_id, p.folio,
       p.titulo, p.descripcion, r.nombre_es AS rubro, p.costo_estimado,
       (SELECT a.uuid FROM archivos a WHERE a.id = p.imagen_archivo_id AND a.eliminado_en IS NULL) AS imagen_uuid
FROM proyectos p JOIN rubros r ON r.id = p.rubro_id
WHERE p.numero_sorteo IS NOT NULL AND p.estado_moderacion = 'visible';

CREATE VIEW v_ficha_proyecto AS
SELECT p.id, p.folio, p.ciclo_id, c.nombre AS ciclo, c.anio_simulado,
       a.id AS alcaldia_id, a.nombre AS alcaldia, ut.id AS unidad_territorial_id, ut.nombre AS unidad_territorial,
       p.titulo, p.descripcion, p.rubro_id, r.nombre_es AS rubro, p.costo_estimado, cu.presupuesto_asignado,
       p.calle, p.numero, p.referencias, p.latitud, p.longitud, p.estado_ubicacion,
       (SELECT a.uuid FROM archivos a WHERE a.id = p.imagen_archivo_id AND a.eliminado_en IS NULL) AS imagen_uuid,
       p.estatus, p.numero_sorteo, p.avance_porcentaje, p.monto_ejercido,
       IF(c.resultados_publicados_en IS NOT NULL, rp.total_votos, NULL) AS total_votos,
       (SELECT COUNT(*) FROM reporte_fotos f JOIN reportes re ON re.id = f.reporte_id
          JOIN archivos a ON a.id = f.archivo_id
         WHERE re.proyecto_id = p.id AND re.estatus <> 'eliminado' AND a.eliminado_en IS NULL) AS total_fotos,
       (SELECT ROUND(AVG(ca.puntuacion), 2) FROM calificaciones ca WHERE ca.proyecto_id = p.id) AS calificacion_promedio
FROM proyectos p
JOIN ciclos c ON c.id = p.ciclo_id
JOIN unidades_territoriales ut ON ut.id = p.unidad_territorial_id
JOIN alcaldias a ON a.id = ut.alcaldia_id
JOIN rubros r ON r.id = p.rubro_id
JOIN ciclo_unidades cu ON cu.ciclo_id = p.ciclo_id AND cu.unidad_territorial_id = p.unidad_territorial_id
LEFT JOIN resultados_proyecto rp ON rp.proyecto_id = p.id
WHERE p.estado_moderacion = 'visible' AND p.estatus <> 'retirado';

CREATE VIEW v_galeria_proyecto AS
SELECT re.proyecto_id, f.id AS foto_id, a.uuid AS archivo_uuid, a.tipo_mime, a.ancho_px, a.alto_px,
       re.id AS reporte_id, re.tipo, re.descripcion, re.estatus, f.subida_en
FROM reporte_fotos f
JOIN reportes re ON re.id = f.reporte_id
JOIN archivos a ON a.id = f.archivo_id
WHERE re.estatus <> 'eliminado' AND a.eliminado_en IS NULL;

CREATE VIEW v_reportes AS
SELECT re.id, re.proyecto_id, p.folio, p.titulo AS proyecto, ut.alcaldia_id, a.nombre AS alcaldia,
       re.tipo, re.descripcion, re.estatus, re.respuesta, re.creado_en, re.autor_id, u.nombre_completo AS autor,
       (SELECT COUNT(*) FROM comentarios_reporte cr WHERE cr.reporte_id = re.id AND cr.estado = 'visible') AS total_comentarios
FROM reportes re
JOIN proyectos p ON p.id = re.proyecto_id
JOIN unidades_territoriales ut ON ut.id = p.unidad_territorial_id
JOIN alcaldias a ON a.id = ut.alcaldia_id
JOIN usuarios u ON u.id = re.autor_id
WHERE re.estatus <> 'eliminado';

CREATE VIEW v_resultados_consulta AS
SELECT c.id AS ciclo_id, c.nombre AS ciclo, c.resultados_publicados_en, a.nombre AS alcaldia,
       ut.clave AS clave_ut, ut.nombre AS unidad_territorial, p.numero_sorteo, p.folio, p.titulo,
       r.nombre_es AS rubro, rp.total_votos, rp.posicion, COALESCE(ru.proyecto_ganador_id = p.id, FALSE) AS ganador,
       ru.caso_especial, ru.metodo
FROM resultados_proyecto rp
JOIN proyectos p ON p.id = rp.proyecto_id
JOIN ciclos c ON c.id = rp.ciclo_id
JOIN unidades_territoriales ut ON ut.id = rp.unidad_territorial_id
JOIN alcaldias a ON a.id = ut.alcaldia_id
JOIN rubros r ON r.id = p.rubro_id
JOIN resultados_unidad ru ON ru.ciclo_id = rp.ciclo_id AND ru.unidad_territorial_id = rp.unidad_territorial_id;

CREATE VIEW v_unidades_mapa AS
SELECT ut.id, ut.clave, ut.nombre, ut.tipo, a.id AS alcaldia_id, a.nombre AS alcaldia,
       ut.latitud, ut.longitud, ut.limite_geojson, ut.origen, ut.sincronizado_en
FROM unidades_territoriales ut JOIN alcaldias a ON a.id = ut.alcaldia_id
WHERE ut.activa;

CREATE VIEW v_estado_integraciones AS
SELECT f.id, f.clave, f.nombre, f.proveedor, f.tipo, f.entidad_destino, f.activa, f.frecuencia_minutos,
       f.ultima_sincronizacion_exitosa,
       (SELECT sy.estado FROM sincronizaciones sy WHERE sy.fuente_id = f.id ORDER BY sy.iniciada_en DESC LIMIT 1) AS ultimo_estado,
       (SELECT sy.iniciada_en FROM sincronizaciones sy WHERE sy.fuente_id = f.id ORDER BY sy.iniciada_en DESC LIMIT 1) AS ultimo_intento,
       (SELECT sy.con_error FROM sincronizaciones sy WHERE sy.fuente_id = f.id ORDER BY sy.iniciada_en DESC LIMIT 1) AS ultimos_errores,
       IF(f.frecuencia_minutos IS NULL, NULL,
          DATE_ADD(COALESCE(f.ultima_sincronizacion_exitosa, NOW()), INTERVAL f.frecuencia_minutos MINUTE)) AS proxima_sincronizacion
FROM fuentes_externas f;

CREATE VIEW v_atribuciones AS
SELECT clave, nombre, proveedor, atribucion, licencia
FROM fuentes_externas WHERE activa AND atribucion IS NOT NULL;

CREATE VIEW v_est_participacion AS
SELECT cu.ciclo_id, ut.alcaldia_id, a.nombre AS alcaldia, ut.id AS unidad_territorial_id,
       ut.nombre AS unidad_territorial, ci.genero,
       CASE WHEN TIMESTAMPDIFF(YEAR, ci.fecha_nacimiento, CURDATE()) < 30 THEN '18-29'
            WHEN TIMESTAMPDIFF(YEAR, ci.fecha_nacimiento, CURDATE()) < 45 THEN '30-44'
            WHEN TIMESTAMPDIFF(YEAR, ci.fecha_nacimiento, CURDATE()) < 60 THEN '45-59'
            ELSE '60+' END AS rango_edad,
       COUNT(*) AS registrados,
       COUNT(pa.ciudadano_id) AS votantes
FROM ciclo_unidades cu
JOIN unidades_territoriales ut ON ut.id = cu.unidad_territorial_id
JOIN alcaldias a ON a.id = ut.alcaldia_id
JOIN ciudadanos ci ON ci.unidad_territorial_id = cu.unidad_territorial_id
LEFT JOIN participaciones pa ON pa.ciclo_id = cu.ciclo_id AND pa.ciudadano_id = ci.usuario_id
GROUP BY cu.ciclo_id, ut.alcaldia_id, a.nombre, ut.id, ut.nombre, ci.genero, rango_edad;

CREATE VIEW v_est_participacion_general AS
SELECT ciclo_id, SUM(registrados) AS registrados, SUM(votantes) AS votantes,
       ROUND(100 * SUM(votantes) / NULLIF(SUM(registrados), 0), 2) AS porcentaje
FROM v_est_participacion GROUP BY ciclo_id;

CREATE VIEW v_est_proyectos AS
SELECT p.ciclo_id, ut.alcaldia_id, a.nombre AS alcaldia, p.unidad_territorial_id, p.rubro_id, r.nombre_es AS rubro,
       SUM(p.estatus <> 'retirado')        AS registrados,
       SUM(d.resultado = 'viable')         AS viables,
       SUM(d.resultado = 'no_viable')      AS no_viables,
       COUNT(ru.proyecto_ganador_id)       AS ganadores
FROM proyectos p
JOIN unidades_territoriales ut ON ut.id = p.unidad_territorial_id
JOIN alcaldias a ON a.id = ut.alcaldia_id
JOIN rubros r ON r.id = p.rubro_id
LEFT JOIN dictamenes d ON d.proyecto_id = p.id AND d.emitido_en IS NOT NULL
LEFT JOIN resultados_unidad ru ON ru.proyecto_ganador_id = p.id
GROUP BY p.ciclo_id, ut.alcaldia_id, a.nombre, p.unidad_territorial_id, p.rubro_id, r.nombre_es;

CREATE VIEW v_est_seguimiento AS
SELECT p.ciclo_id, ut.alcaldia_id, a.nombre AS alcaldia, p.unidad_territorial_id, p.rubro_id, r.nombre_es AS rubro,
       p.id AS proyecto_id, p.folio, p.estatus, p.avance_porcentaje, p.monto_ejercido, cu.presupuesto_asignado,
       (SELECT COUNT(*) FROM reportes re WHERE re.proyecto_id = p.id AND re.estatus <> 'eliminado') AS reportes,
       (SELECT COUNT(*) FROM reportes re WHERE re.proyecto_id = p.id AND re.tipo = 'irregularidad'
                                           AND re.estatus <> 'eliminado') AS irregularidades,
       (SELECT COUNT(*) FROM reportes re WHERE re.proyecto_id = p.id AND re.estatus = 'atendido') AS reportes_atendidos,
       (SELECT ROUND(AVG(ca.puntuacion), 2) FROM calificaciones ca WHERE ca.proyecto_id = p.id) AS calificacion_promedio,
       (SELECT COUNT(*) FROM calificaciones ca WHERE ca.proyecto_id = p.id) AS total_calificaciones
FROM proyectos p
JOIN resultados_unidad ru ON ru.proyecto_ganador_id = p.id
JOIN unidades_territoriales ut ON ut.id = p.unidad_territorial_id
JOIN alcaldias a ON a.id = ut.alcaldia_id
JOIN rubros r ON r.id = p.rubro_id
JOIN ciclo_unidades cu ON cu.ciclo_id = p.ciclo_id AND cu.unidad_territorial_id = p.unidad_territorial_id;

CREATE VIEW v_bitacora AS
SELECT b.id, b.realizada_en, b.usuario_id, u.nombre_completo AS responsable, b.rol,
       b.alcaldia_id, a.nombre AS alcaldia, b.ciclo_id, b.accion, b.entidad, b.entidad_id, b.detalle
FROM bitacora b
LEFT JOIN usuarios u ON u.id = b.usuario_id
LEFT JOIN alcaldias a ON a.id = b.alcaldia_id;

INSERT INTO parametros_sistema (clave, valor, tipo, descripcion) VALUES
  ('sesion_minutos_inactividad', '15', 'entero', 'Cierre automático de sesión por inactividad (RNF)'),
  ('login_intentos_max', '5', 'entero', 'Intentos fallidos antes de bloquear temporalmente la cuenta'),
  ('login_minutos_bloqueo', '15', 'entero', 'Minutos de bloqueo tras exceder los intentos'),
  ('imagen_tamano_max_bytes', '5242880', 'entero', 'Tamaño máximo de imágenes: 5 MB (RNF)'),
  ('reporte_fotos_max', '5', 'entero', 'Fotografías máximas por reporte de Foto Denuncia'),
  ('presupuesto_porcentaje_ley', '4', 'decimal', 'Porcentaje del presupuesto de las alcaldías (art. 117 LPC CDMX)'),
  ('correo_remitente', 'no-responder@prepar.mx', 'texto', 'Remitente de los correos del sistema'),
  ('nominatim_user_agent', 'Prepar-Simulador/1.0 (contacto@prepar.mx)', 'texto',
   'Identificación obligatoria para usar Nominatim (cambiar por un correo real del equipo)'),
  ('aviso_simulador_es', 'Simulador educativo sin validez oficial. No tiene relación con el IECM ni con las alcaldías.', 'texto',
   'Aviso visible en todas las páginas (RNF)'),
  ('aviso_simulador_en', 'Educational simulator with no official validity. Not affiliated with IECM or the boroughs.', 'texto',
   'Notice shown on every page (RNF)');

INSERT INTO fuentes_externas (clave, nombre, proveedor, tipo, entidad_destino, url_base, recurso, formato,
                              autenticacion, variable_credencial, frecuencia_minutos, limite_por_segundo,
                              atribucion, licencia, activa) VALUES
  ('datos_cdmx_alcaldias', 'Límites de las alcaldías', 'Portal de Datos Abiertos CDMX', 'datos', 'alcaldias',
   'https://datos.cdmx.gob.mx/api/3/action/datastore_search', NULL, 'geojson', 'ninguna', NULL, 43200, NULL,
   'Fuente: Portal de Datos Abiertos de la Ciudad de México', NULL, TRUE),
  ('datos_cdmx_unidades', 'Colonias / unidades territoriales', 'Portal de Datos Abiertos CDMX', 'datos', 'unidades_territoriales',
   'https://datos.cdmx.gob.mx/api/3/action/datastore_search', NULL, 'geojson', 'ninguna', NULL, 43200, NULL,
   'Fuente: Portal de Datos Abiertos de la Ciudad de México', NULL, TRUE),
  ('datos_cdmx_delitos', 'Incidencia delictiva por colonia', 'Portal de Datos Abiertos CDMX (FGJ)', 'datos', 'indicadores_unidad',
   'https://datos.cdmx.gob.mx/api/3/action/datastore_search', NULL, 'json', 'ninguna', NULL, 10080, NULL,
   'Fuente: Fiscalía General de Justicia, Portal de Datos Abiertos CDMX', NULL, TRUE),
  ('indice_desarrollo_social', 'Índice de pobreza / desarrollo social por colonia', 'Evalúa CDMX', 'datos', 'indicadores_unidad',
   'https://datos.cdmx.gob.mx/api/3/action/datastore_search', NULL, 'json', 'ninguna', NULL, 43200, NULL,
   'Fuente: Evalúa CDMX', NULL, TRUE),
  ('inegi_poblacion', 'Población (Censo de Población y Vivienda)', 'INEGI', 'datos', 'indicadores_unidad',
   'https://www.inegi.org.mx/app/api/', NULL, 'json', 'token', 'INEGI_TOKEN', 43200, NULL,
   'Fuente: INEGI', NULL, FALSE),
  ('directorio_alcaldias', 'Directorio de alcaldías y sedes de atención', 'Portal de Datos Abiertos CDMX', 'datos', 'directorio',
   'https://datos.cdmx.gob.mx/api/3/action/datastore_search', NULL, 'json', 'ninguna', NULL, 10080, NULL,
   'Fuente: Portal de Datos Abiertos de la Ciudad de México', NULL, TRUE),
  ('nominatim', 'Geocodificación de direcciones', 'OpenStreetMap Nominatim', 'geocodificacion', 'geocodificaciones',
   'https://nominatim.openstreetmap.org/search', NULL, 'json', 'ninguna', NULL, NULL, 1.00,
   '© OpenStreetMap contributors', 'ODbL', TRUE),
  ('osm_mosaicos', 'Mapa base (mosaicos)', 'OpenStreetMap', 'mapa', NULL,
   'https://tile.openstreetmap.org/{z}/{x}/{y}.png', NULL, 'png', 'ninguna', NULL, NULL, NULL,
   '© OpenStreetMap contributors', 'ODbL', TRUE),
  ('correo', 'Envío de correos', 'Por definir (p. ej. Brevo, Resend o SendGrid)', 'correo', 'correos_salida',
   'https://api.proveedor-de-correo.com', NULL, 'json', 'api_key', 'CORREO_API_KEY', NULL, NULL,
   NULL, NULL, FALSE);

INSERT INTO indicadores (clave, nombre_es, nombre_en, unidad_medida, descripcion) VALUES
  ('poblacion', 'Población', 'Population', 'personas', 'Población residente de la unidad territorial'),
  ('poblacion_flotante', 'Población flotante', 'Floating population', 'personas', 'Personas que transitan o trabajan en la unidad'),
  ('indice_pobreza', 'Índice de pobreza', 'Poverty index', 'índice 0–1', 'Debe guardarse normalizado de 0 (menor) a 1 (mayor pobreza)'),
  ('incidencia_delictiva', 'Incidencia delictiva', 'Crime incidence', 'delitos', 'Número de delitos del periodo; se normaliza al crear el ciclo');

INSERT INTO avisos_privacidad (version, texto_es, texto_en, vigente_desde) VALUES
  ('1.0', 'Tus datos de fecha de nacimiento, género y residencia se usan únicamente para estadísticas agregadas del simulador. Prepar es un simulador educativo sin validez oficial.',
   'Your date of birth, gender and residence are used only for aggregated statistics of the simulator. Prepar is an educational simulator with no official validity.',
   '2026-01-01');

INSERT INTO avisos_privacidad (version, texto_es, texto_en, vigente_desde) VALUES
  ('2.0', 'Aviso de privacidad integral de Prepar

1. Responsable. El equipo de Prepar, simulador educativo del Presupuesto Participativo de la Ciudad de México, es responsable del tratamiento de tus datos personales. Contacto: equipoprepar@gmail.com.

2. Datos que tratamos. Nombre, correo electrónico, contraseña (se guarda solo cifrada con bcrypt, nadie puede leerla), fecha de nacimiento, género, colonia, barrio o pueblo donde vives, foto de perfil si decides subirla, y lo que publiques en el simulador: ideas, comentarios, proyectos, reportes y fotos. No tratamos datos personales sensibles. Tu voto es secreto: se guarda separado de tu cuenta y no puede vincularse contigo.

3. Finalidades. Crear y proteger tu cuenta, confirmar que el correo es tuyo, permitirte participar en el foro, registrar proyectos y votar en la simulación, enviarte avisos del simulador y elaborar estadísticas agregadas y anónimas. Todas son necesarias para el servicio; no usamos tus datos para publicidad ni para otros fines.

4. Transferencias y encargados. No vendemos ni transferimos tus datos. Para operar usamos servicios que los procesan solo por nuestra cuenta: el alojamiento del sitio, la base de datos, el proveedor de envío de correos y, si eliges entrar con Google, Google (de quien solo recibimos tu nombre y tu correo verificado). Las direcciones de los proyectos, no las de las personas, se ubican en el mapa con OpenStreetMap.

5. Derechos ARCO. Puedes acceder a tus datos y rectificarlos en cualquier momento desde «Mi perfil». Para cancelarlos usa «Eliminar mi cuenta» en «Mi perfil»: se borran tu nombre, correo, fecha de nacimiento, género, foto y sesiones; tus votos ya son anónimos y se conservan para no alterar los resultados, y lo que publicaste queda a nombre de «Cuenta eliminada». Para oponerte a algún tratamiento o hacer cualquier otra solicitud ARCO, escribe a equipoprepar@gmail.com con tu nombre, el correo de tu cuenta y lo que solicitas; te responderemos en los plazos que establece la ley.

6. Revocación del consentimiento. Puedes revocar tu consentimiento en cualquier momento eliminando tu cuenta, y dejar de recibir correos de avisos desde «Mi perfil».

7. Seguridad. Contraseñas cifradas, conexión segura (HTTPS), sesiones que caducan por inactividad, verificación del correo y bitácora de las acciones administrativas.

8. Cambios a este aviso. Cualquier cambio se publicará en esta página con su nueva versión y fecha.

9. Marco legal. Ley Federal de Protección de Datos Personales en Posesión de los Particulares, publicada en el Diario Oficial de la Federación el 20 de marzo de 2025. La autoridad en la materia es la Secretaría de Anticorrupción y Buen Gobierno.',
   'Prepar comprehensive privacy notice

1. Data controller. The Prepar team, an educational simulator of Mexico City''s Participatory Budget, is responsible for processing your personal data. Contact: equipoprepar@gmail.com.

2. Data we process. Name, email, password (stored only encrypted with bcrypt, nobody can read it), date of birth, gender, the neighborhood where you live, a profile photo if you choose to upload one, and what you publish in the simulator: ideas, comments, projects, reports and photos. We do not process sensitive personal data. Your vote is secret: it is stored separately from your account and cannot be linked to you.

3. Purposes. Creating and protecting your account, confirming that the email is yours, letting you take part in the forum, register projects and vote in the simulation, sending you simulator notices and producing aggregated, anonymous statistics. All of them are necessary for the service; we do not use your data for advertising or any other purpose.

4. Transfers and processors. We do not sell or transfer your data. To operate we use services that process it only on our behalf: site hosting, the database, the email delivery provider and, if you choose to sign in with Google, Google (from which we only receive your name and verified email). Project addresses, not personal addresses, are placed on the map with OpenStreetMap.

5. ARCO rights. You can access and correct your data at any time from «My profile». To cancel it, use «Delete my account» in «My profile»: your name, email, date of birth, gender, photo and sessions are erased; your votes are already anonymous and are kept so results are not altered, and what you published remains under «Deleted account». To object to any processing or make any other ARCO request, write to equipoprepar@gmail.com with your name, your account email and your request; we will reply within the time limits set by law.

6. Withdrawing consent. You can withdraw your consent at any time by deleting your account, and stop receiving notice emails from «My profile».

7. Security. Encrypted passwords, secure connection (HTTPS), sessions that expire after inactivity, email verification and a log of administrative actions.

8. Changes to this notice. Any change will be published on this page with its new version and date.

9. Legal framework. Mexico''s Federal Law on the Protection of Personal Data Held by Private Parties, published in the Official Gazette of the Federation on March 20, 2025. The competent authority is the Ministry of Anti-Corruption and Good Government.',
   '2026-11-01');

INSERT INTO terminos_condiciones (version, texto_es, texto_en, vigente_desde) VALUES
  ('1.0', 'Términos y condiciones de uso de Prepar

1. Qué es Prepar. Prepar es un simulador educativo del Presupuesto Participativo de la Ciudad de México. No tiene validez oficial ni relación con el IECM ni con las alcaldías: los proyectos, votos, montos y resultados son de práctica.

2. Tu cuenta. Debes tener 18 años o más y dar datos verdaderos. Tu cuenta es personal: no compartas tu contraseña. Eres responsable de lo que se haga con ella. Solo puedes tener una cuenta de ciudadano.

3. Uso correcto. Publica ideas, comentarios, proyectos y fotos relacionados con tu colonia y con respeto. Está prohibido publicar insultos, discriminación, datos personales de otras personas, publicidad, contenido falso o fotos que no sean tuyas o que no tengas permiso de usar.

4. Moderación. Los funcionarios pueden ocultar o eliminar publicaciones y reportes que no cumplan estas reglas, siempre con un motivo que queda en la bitácora. El Administrador puede suspender cuentas que las incumplan.

5. Fotos y contenidos. Conservas la autoría de lo que subes, pero autorizas a Prepar a mostrarlo dentro del simulador. Solo se aceptan imágenes JPG o PNG.

6. Privacidad. Tus datos se tratan como explica el Aviso de privacidad. Tu voto es secreto: el sistema guarda que participaste, pero no por quién votaste.

7. Cambios. Si estos términos cambian, te pediremos aceptarlos de nuevo la próxima vez que inicies sesión.',
   'Prepar Terms and Conditions of Use

1. What Prepar is. Prepar is an educational simulator of Mexico City''s Participatory Budget. It has no official validity and no relation to the IECM or the boroughs: projects, votes, amounts and results are for practice.

2. Your account. You must be 18 or older and give truthful information. Your account is personal: do not share your password. You are responsible for what is done with it. You may only have one resident account.

3. Proper use. Post ideas, comments, projects and photos related to your neighborhood, respectfully. Insults, discrimination, other people''s personal data, advertising, false content or photos that are not yours or that you have no permission to use are forbidden.

4. Moderation. Officials may hide or delete posts and reports that break these rules, always with a reason recorded in the activity log. The Administrator may suspend accounts that break them.

5. Photos and content. You keep authorship of what you upload, but you allow Prepar to show it inside the simulator. Only JPG or PNG images are accepted.

6. Privacy. Your data is handled as explained in the Privacy notice. Your vote is secret: the system records that you took part, but not who you voted for.

7. Changes. If these terms change, we will ask you to accept them again the next time you sign in.',
   '2026-01-01');

INSERT INTO alcaldias (clave, nombre) VALUES
  ('AOB', 'Álvaro Obregón'),        ('AZC', 'Azcapotzalco'),
  ('BJU', 'Benito Juárez'),         ('COY', 'Coyoacán'),
  ('CUJ', 'Cuajimalpa de Morelos'), ('CUH', 'Cuauhtémoc'),
  ('GAM', 'Gustavo A. Madero'),     ('IZC', 'Iztacalco'),
  ('IZP', 'Iztapalapa'),            ('MAC', 'La Magdalena Contreras'),
  ('MHI', 'Miguel Hidalgo'),        ('MAL', 'Milpa Alta'),
  ('TLH', 'Tláhuac'),               ('TLP', 'Tlalpan'),
  ('VCA', 'Venustiano Carranza'),   ('XOC', 'Xochimilco');

INSERT INTO unidades_territoriales (alcaldia_id, clave, nombre, tipo, latitud, longitud)
SELECT a.id, v.clave, v.nombre, v.tipo, v.lat, v.lng
FROM (
  SELECT 'AOB' alc, 'AOB-001' clave, 'San Ángel' nombre, 'colonia' tipo, 19.3467 lat, -99.1900 lng
  UNION ALL SELECT 'AOB','AOB-002','Olivar de los Padres','colonia',19.3330,-99.2170
  UNION ALL SELECT 'AZC','AZC-001','Clavería','colonia',19.4710,-99.1850
  UNION ALL SELECT 'AZC','AZC-002','San Álvaro','colonia',19.4590,-99.1830
  UNION ALL SELECT 'BJU','BJU-001','Narvarte Poniente','colonia',19.3960,-99.1560
  UNION ALL SELECT 'BJU','BJU-002','Del Valle Centro','colonia',19.3850,-99.1650
  UNION ALL SELECT 'COY','COY-001','Del Carmen','colonia',19.3500,-99.1620
  UNION ALL SELECT 'COY','COY-002','Santa Úrsula Coapa','pueblo_originario',19.3050,-99.1430
  UNION ALL SELECT 'CUJ','CUJ-001','Cuajimalpa','pueblo_originario',19.3570,-99.2990
  UNION ALL SELECT 'CUJ','CUJ-002','El Contadero','pueblo_originario',19.3440,-99.2900
  UNION ALL SELECT 'CUH','CUH-001','Roma Norte','colonia',19.4190,-99.1620
  UNION ALL SELECT 'CUH','CUH-002','Guerrero','colonia',19.4420,-99.1450
  UNION ALL SELECT 'GAM','GAM-001','Lindavista','colonia',19.4880,-99.1300
  UNION ALL SELECT 'GAM','GAM-002','San Felipe de Jesús','colonia',19.4930,-99.0720
  UNION ALL SELECT 'IZC','IZC-001','Agrícola Oriental','colonia',19.3950,-99.0700
  UNION ALL SELECT 'IZC','IZC-002','Santa Anita','barrio',19.3950,-99.1240
  UNION ALL SELECT 'IZP','IZP-001','San Lorenzo Tezonco','pueblo_originario',19.3080,-99.0670
  UNION ALL SELECT 'IZP','IZP-002','Unidad Habitacional Vicente Guerrero','unidad_habitacional',19.3570,-99.0560
  UNION ALL SELECT 'MAC','MAC-001','San Jerónimo Lídice','colonia',19.3230,-99.2220
  UNION ALL SELECT 'MAC','MAC-002','La Magdalena','pueblo_originario',19.2990,-99.2440
  UNION ALL SELECT 'MHI','MHI-001','Tacubaya','colonia',19.4030,-99.1870
  UNION ALL SELECT 'MHI','MHI-002','Anáhuac','colonia',19.4400,-99.1800
  UNION ALL SELECT 'MAL','MAL-001','Villa Milpa Alta','pueblo_originario',19.1920,-99.0230
  UNION ALL SELECT 'MAL','MAL-002','San Pedro Atocpan','pueblo_originario',19.2010,-99.0490
  UNION ALL SELECT 'TLH','TLH-001','San Francisco Tlaltenco','pueblo_originario',19.2930,-99.0230
  UNION ALL SELECT 'TLH','TLH-002','Del Mar','colonia',19.2960,-99.0540
  UNION ALL SELECT 'TLP','TLP-001','Tlalpan Centro','colonia',19.2920,-99.1700
  UNION ALL SELECT 'TLP','TLP-002','San Andrés Totoltepec','pueblo_originario',19.2470,-99.1780
  UNION ALL SELECT 'VCA','VCA-001','Moctezuma 2a Sección','colonia',19.4290,-99.1000
  UNION ALL SELECT 'VCA','VCA-002','Jardín Balbuena','colonia',19.4180,-99.1150
  UNION ALL SELECT 'XOC','XOC-001','Barrio La Asunción','barrio',19.2620,-99.1050
  UNION ALL SELECT 'XOC','XOC-002','Santa Cruz Acalpixca','pueblo_originario',19.2580,-99.0740
) v
JOIN alcaldias a ON a.clave = v.alc
ORDER BY v.clave;

INSERT INTO fases (clave, orden, nombre_es, nombre_en, que_ocurre_es, que_puedes_hacer_es, que_ocurre_en, que_puedes_hacer_en) VALUES
  ('convocatoria', 1, 'Convocatoria', 'Call for participation',
   'El IECM publica la convocatoria con las bases, fechas, requisitos, rubros y el presupuesto de cada unidad territorial.',
   'Consulta el calendario del ciclo y el presupuesto asignado a tu unidad territorial.',
   'The Electoral Institute publishes the call with rules, dates, requirements, categories and each territorial unit''s budget.',
   'Check the cycle calendar and the budget assigned to your territorial unit.'),
  ('diagnostico_registro', 2, 'Diagnóstico y Registro', 'Assessment and Registration',
   'Los vecinos se reúnen en asambleas para identificar necesidades y registran sus proyectos.',
   'Publica, comenta y apoya ideas en el Foro Vecinal y registra formalmente tu proyecto.',
   'Neighbors meet to identify needs and register their projects.',
   'Post, comment and support ideas in the Neighborhood Forum and register your project.'),
  ('dictaminacion', 3, 'Dictaminación', 'Feasibility review',
   'El Órgano Dictaminador de cada alcaldía evalúa la viabilidad técnica, jurídica, ambiental y financiera de los proyectos.',
   'Da seguimiento al dictamen de tu proyecto; recibirás una notificación con el resultado.',
   'Each borough''s review board assesses the technical, legal, environmental and financial feasibility of projects.',
   'Follow your project''s review; you will be notified of the result.'),
  ('sorteo_difusion', 4, 'Sorteo y Difusión', 'Draw and Promotion',
   'Se sortea el número con el que cada proyecto viable aparecerá en la boleta y se difunden los proyectos.',
   'Conoce la boleta de tu unidad territorial y los proyectos que podrás votar.',
   'A draw assigns each feasible project its number on the ballot, and projects are promoted.',
   'Review your territorial unit''s ballot and the projects you can vote for.'),
  ('consulta', 5, 'Consulta', 'Vote',
   'La ciudadanía vota por internet o en mesas receptoras por un proyecto de su unidad territorial.',
   'Emite tu voto único y secreto y descarga tu comprobante de participación.',
   'Residents vote online or at polling stations for one project in their territorial unit.',
   'Cast your single secret vote and download your participation receipt.'),
  ('resultados', 6, 'Resultados y Asamblea de Información', 'Results and Information Assembly',
   'Se computan los votos, se resuelven los casos especiales y se informan los proyectos ganadores.',
   'Consulta los proyectos ganadores en el Mapa de Proyectos.',
   'Votes are counted, special cases are resolved and winning projects are announced.',
   'See the winning projects on the Project Map.'),
  ('ejecucion_seguimiento', 7, 'Ejecución y Seguimiento', 'Execution and Monitoring',
   'La alcaldía ejecuta los proyectos ganadores con el presupuesto asignado.',
   'Revisa el avance de las obras y sube fotografías o reportes en Foto Denuncia.',
   'The borough carries out the winning projects with the assigned budget.',
   'Check progress and upload photos or reports in Photo Report.'),
  ('evaluacion', 8, 'Evaluación y Rendición de Cuentas', 'Evaluation and Accountability',
   'Se informa el avance y el gasto de los proyectos en una asamblea de rendición de cuentas.',
   'Califica del 1 al 5 el cumplimiento del proyecto de tu unidad territorial.',
   'Progress and spending are reported in an accountability assembly.',
   'Rate from 1 to 5 how well your territorial unit''s project was delivered.');

INSERT INTO rubros (nombre_es, nombre_en, descripcion) VALUES
  ('Mejoramiento de espacios públicos', 'Public space improvement',
   'Parques, plazas, áreas verdes, banquetas y mobiliario urbano.'),
  ('Infraestructura urbana, obras y servicios', 'Urban infrastructure, works and services',
   'Obras de infraestructura y servicios para la comunidad.'),
  ('Actividades recreativas, deportivas y culturales', 'Recreational, sports and cultural activities',
   'Talleres, eventos y equipamiento recreativo, deportivo y cultural.');

INSERT INTO etapas_rubro (rubro_id, orden, nombre_es, nombre_en, peso)
SELECT r.id, e.orden, e.nombre_es, e.nombre_en, e.peso FROM rubros r JOIN (
  SELECT 'Mejoramiento de espacios públicos' AS rubro, 1 AS orden, 'Planeación y permisos' AS nombre_es, 'Planning and permits' AS nombre_en, 10 AS peso
  UNION ALL SELECT 'Mejoramiento de espacios públicos', 2, 'Compra de materiales o contratación', 'Materials purchase or contracting', 20
  UNION ALL SELECT 'Mejoramiento de espacios públicos', 3, 'Preparación del sitio', 'Site preparation', 15
  UNION ALL SELECT 'Mejoramiento de espacios públicos', 4, 'Trabajos principales', 'Main works', 35
  UNION ALL SELECT 'Mejoramiento de espacios públicos', 5, 'Detalles finales y limpieza', 'Finishing touches and cleanup', 10
  UNION ALL SELECT 'Mejoramiento de espacios públicos', 6, 'Entrega a los vecinos', 'Handover to residents', 10
  UNION ALL SELECT 'Infraestructura urbana, obras y servicios', 1, 'Proyecto ejecutivo y permisos', 'Detailed design and permits', 15
  UNION ALL SELECT 'Infraestructura urbana, obras y servicios', 2, 'Licitación o contratación', 'Tender or contracting', 15
  UNION ALL SELECT 'Infraestructura urbana, obras y servicios', 3, 'Inicio de obra', 'Construction start', 10
  UNION ALL SELECT 'Infraestructura urbana, obras y servicios', 4, 'Obra al 50 %', 'Works 50 % done', 25
  UNION ALL SELECT 'Infraestructura urbana, obras y servicios', 5, 'Obra terminada', 'Works finished', 25
  UNION ALL SELECT 'Infraestructura urbana, obras y servicios', 6, 'Pruebas y entrega', 'Testing and handover', 10
  UNION ALL SELECT 'Actividades recreativas, deportivas y culturales', 1, 'Planeación y calendario', 'Planning and schedule', 15
  UNION ALL SELECT 'Actividades recreativas, deportivas y culturales', 2, 'Contratación de instructores o compra de equipo', 'Hiring instructors or buying equipment', 25
  UNION ALL SELECT 'Actividades recreativas, deportivas y culturales', 3, 'Difusión con los vecinos', 'Outreach to residents', 10
  UNION ALL SELECT 'Actividades recreativas, deportivas y culturales', 4, 'Actividades en curso', 'Activities under way', 35
  UNION ALL SELECT 'Actividades recreativas, deportivas y culturales', 5, 'Cierre y evaluación', 'Closing and evaluation', 15
) e ON e.rubro = r.nombre_es;

INSERT INTO etapas_rubro (rubro_id, orden, nombre_es, nombre_en, peso) VALUES
  (NULL, 1, 'Planeación y permisos', 'Planning and permits', 15),
  (NULL, 2, 'Contratación o compras', 'Contracting or purchases', 20),
  (NULL, 3, 'Inicio de los trabajos', 'Work start', 15),
  (NULL, 4, 'Trabajos principales', 'Main works', 35),
  (NULL, 5, 'Entrega a los vecinos', 'Handover to residents', 15);

INSERT INTO criterios_dictamen (clave, orden, nombre_es, nombre_en, descripcion) VALUES
  ('viabilidad_tecnica',       1, 'Viabilidad técnica',    'Technical feasibility',     'El proyecto puede realizarse técnicamente en el sitio propuesto.'),
  ('viabilidad_juridica',      2, 'Viabilidad jurídica',   'Legal feasibility',         'No contraviene la normatividad ni el uso de suelo.'),
  ('viabilidad_ambiental',     3, 'Viabilidad ambiental',  'Environmental feasibility', 'No genera daño ambiental.'),
  ('viabilidad_financiera',    4, 'Viabilidad financiera', 'Financial feasibility',     'El costo estimado es congruente con el alcance.'),
  ('impacto_comunitario',      5, 'Impacto comunitario',   'Community impact',          'Atiende una necesidad de la comunidad.'),
  ('beneficio_colectivo',      6, 'Beneficio colectivo',   'Collective benefit',        'Beneficia a la colectividad y no a particulares.'),
  ('costo_dentro_presupuesto', 7, 'Costo no mayor al presupuesto de la unidad territorial',
                                  'Cost within the unit''s budget', 'El costo no excede el presupuesto asignado.'),
  ('no_sustituye_servicios',   8, 'No sustituye servicios de la alcaldía', 'Does not replace borough services',
   'No sustituye alumbrado, limpia, poda o pavimentación a cargo de la alcaldía.');

INSERT INTO directorio (alcaldia_id, tipo, cargo, temas)
SELECT id, 'alcaldia', CONCAT('Alcaldía ', nombre), 'Presupuesto participativo, atención ciudadana'
FROM alcaldias;

INSERT INTO directorio_ciudad (orden, institucion, cargo, nombre_titular, temas, direccion, telefono, correo, sitio_web, fuente_nombre, fuente_url, consultado_en) VALUES
  (10, 'Gobierno de la Ciudad de México', 'Jefa de Gobierno de la Ciudad de México', 'Clara Marina Brugada Molina',
   'Atención ciudadana del Gobierno de la Ciudad', 'Plaza de la Constitución 2, Col. Centro, C.P. 06000, Cuauhtémoc (Antiguo Palacio del Ayuntamiento)',
   '5553458000', 'atencionciudadanajg@cdmx.gob.mx', 'https://www.jefaturadegobierno.cdmx.gob.mx',
   'Jefatura de Gobierno de la CDMX, directorio oficial', 'https://www.jefaturadegobierno.cdmx.gob.mx/dependencia/directorio', '2026-10-31'),
  (20, 'Instituto Electoral de la Ciudad de México (IECM)', 'Oficinas centrales del IECM', NULL,
   'Organiza la consulta de presupuesto participativo y la elección de las COPACO', 'Huizaches 25, Col. Rancho Los Colorines, C.P. 14386, Tlalpan',
   '5554833800', NULL, 'https://www.iecm.mx',
   'IECM, directorio institucional', 'https://www.iecm.mx/acerca-del-iecm/directorio/', '2026-10-31'),
  (30, 'Instituto Electoral de la Ciudad de México (IECM)', 'CITIECM: dudas sobre la consulta', NULL,
   'Línea gratuita 800 433 3222 · WhatsApp 56 6051 0709 · Participatel 55 2652 0989', NULL,
   '8004333222', NULL, 'https://www.iecm.mx',
   'IECM, Convocatoria Única COPACO 2026 y Consulta de Presupuesto Participativo 2026 y 2027 (PDF)', 'https://siproe2026.iecm.mx/downloads/Convocatoria_Unica_2026_y_2027_Verion_IECM-ACU-CG-013-2026.pdf', '2026-10-31');

UPDATE directorio d JOIN alcaldias a ON a.id = d.alcaldia_id JOIN (
  SELECT 'AOB' clave, 'Calle Canario esq. Calle 10, Col. Tolteca, C.P. 01150' direccion, NULL telefono, NULL correo, 'https://aao.cdmx.gob.mx' web,
         'Portal de Turismo de la CDMX, ficha del edificio de la Alcaldía' fuente, 'https://mexicocity.cdmx.gob.mx/venues/alcaldia-alvaro-obregon/' url
  UNION ALL SELECT 'AZC', NULL, NULL, NULL, 'https://azcapotzalco.cdmx.gob.mx', 'Sitio oficial de la Alcaldía Azcapotzalco', 'https://azcapotzalco.cdmx.gob.mx'
  UNION ALL SELECT 'BJU', 'Municipio Libre esq. División del Norte, Col. Santa Cruz Atoyac', '5589584000', NULL, 'https://alcaldiabenitojuarez.gob.mx',
         'Sitio oficial de la Alcaldía Benito Juárez', 'https://alcaldiabenitojuarez.gob.mx/'
  UNION ALL SELECT 'COY', NULL, NULL, NULL, 'https://coyoacan.cdmx.gob.mx', 'Sitio oficial de la Alcaldía Coyoacán', 'https://coyoacan.cdmx.gob.mx'
  UNION ALL SELECT 'CUH', 'Aldama y Mina s/n, Col. Buenavista, C.P. 06350', '5524523100', NULL, 'https://cuauhtemoc.cdmx.gob.mx',
         'Alcaldía Cuauhtémoc, directorio oficial', 'https://cuauhtemoc.cdmx.gob.mx/inicio/directorio/'
  UNION ALL SELECT 'GAM', NULL, NULL, NULL, 'https://gamadero.cdmx.gob.mx', 'Sitio oficial de la Alcaldía Gustavo A. Madero', 'https://gamadero.cdmx.gob.mx'
  UNION ALL SELECT 'IZC', 'Av. Río Churubusco s/n, Col. Gabriel Ramos Millán, C.P. 08000', '5556543333', NULL, 'https://www.iztacalco.cdmx.gob.mx',
         'Alcaldía Iztacalco, página oficial de atención ciudadana', 'https://www.iztacalco.cdmx.gob.mx/alcaldia'
  UNION ALL SELECT 'IZP', 'Aldama 63, Col. San Lucas, C.P. 09000', '5566516600', NULL, 'https://iztapalapa.cdmx.gob.mx',
         'Alcaldía Iztapalapa, directorio oficial', 'https://iztapalapa.cdmx.gob.mx/directorio/'
  UNION ALL SELECT 'MAC', NULL, NULL, NULL, 'https://mcontreras.gob.mx', 'Sitio oficial de la Alcaldía La Magdalena Contreras', 'https://mcontreras.gob.mx'
  UNION ALL SELECT 'MAL', 'Av. México esq. Constitución s/n, C.P. 12000', '5558623150', 'contacto@milpa-alta.cdmx.gob.mx', 'https://www.milpa-alta.cdmx.gob.mx',
         'Alcaldía Milpa Alta, sitio oficial (transparencia)', 'https://www.milpa-alta.cdmx.gob.mx/trans_cdmx.html'
  UNION ALL SELECT 'TLH', NULL, NULL, NULL, 'https://www.tlahuac.cdmx.gob.mx', 'Sitio oficial de la Alcaldía Tláhuac', 'https://www.tlahuac.cdmx.gob.mx'
  UNION ALL SELECT 'TLP', NULL, NULL, NULL, 'https://tlalpan.cdmx.gob.mx', 'Sitio oficial de la Alcaldía Tlalpan', 'https://tlalpan.cdmx.gob.mx'
) v ON v.clave = a.clave
SET d.direccion = COALESCE(v.direccion, d.direccion), d.telefono = COALESCE(v.telefono, d.telefono), d.correo = COALESCE(v.correo, d.correo),
    d.sitio_web = v.web, d.fuente_nombre = v.fuente, d.fuente_url = v.url, d.consultado_en = '2026-10-31'
WHERE d.tipo = 'alcaldia';

INSERT INTO directorio (alcaldia_id, tipo, cargo, nombre_titular, temas, direccion, telefono, correo, sitio_web, fuente_nombre, fuente_url, consultado_en)
SELECT a.id, v.tipo, v.cargo, v.nombre, v.temas, v.direccion, v.telefono, v.correo, NULL, v.fuente, v.url, '2026-10-31'
FROM (
  SELECT 'AOB' clave, 'titular' tipo, 'Alcalde de Álvaro Obregón' cargo, 'Javier Joaquín López Casarín' nombre, 'Gobierno de la alcaldía 2024-2027' temas,
         NULL direccion, NULL telefono, NULL correo, 'Forbes México, alcaldes de la CDMX 2024-2027' fuente,
         'https://forbes.com.mx/estos-son-los-16-alcaldes-de-la-cdmx-para-el-periodo-2024-2027/' url
  UNION ALL SELECT 'AZC', 'titular', 'Alcaldesa de Azcapotzalco', 'Nancy Marlene Núñez Reséndiz', 'Gobierno de la alcaldía 2024-2027', NULL, NULL, NULL,
         'Forbes México, alcaldes de la CDMX 2024-2027', 'https://forbes.com.mx/estos-son-los-16-alcaldes-de-la-cdmx-para-el-periodo-2024-2027/'
  UNION ALL SELECT 'BJU', 'titular', 'Alcalde de Benito Juárez', 'Luis Alberto Mendoza Acevedo', 'Gobierno de la alcaldía 2024-2027', NULL, NULL, NULL,
         'Sitio oficial de la Alcaldía Benito Juárez', 'https://alcaldiabenitojuarez.gob.mx/'
  UNION ALL SELECT 'COY', 'titular', 'Alcalde de Coyoacán', 'José Giovani Gutiérrez Aguilar', 'Gobierno de la alcaldía 2024-2027', NULL, NULL, NULL,
         'Forbes México, alcaldes de la CDMX 2024-2027', 'https://forbes.com.mx/estos-son-los-16-alcaldes-de-la-cdmx-para-el-periodo-2024-2027/'
  UNION ALL SELECT 'CUJ', 'titular', 'Alcalde de Cuajimalpa de Morelos', 'Carlos Orvañanos Rea', 'Gobierno de la alcaldía 2024-2027', NULL, NULL, NULL,
         'Forbes México, alcaldes de la CDMX 2024-2027', 'https://forbes.com.mx/estos-son-los-16-alcaldes-de-la-cdmx-para-el-periodo-2024-2027/'
  UNION ALL SELECT 'CUH', 'titular', 'Alcaldesa de Cuauhtémoc', 'Alessandra Rojo de la Vega', 'Gobierno de la alcaldía 2024-2027', NULL, NULL, NULL,
         'Alcaldía Cuauhtémoc, boletín oficial (junio de 2026)', 'https://cuauhtemoc.cdmx.gob.mx/wp-content/uploads/2026/06/618.-EN-CUAUHTÉMOC-SE-GOBIERNA-EN-LA-CALLE-ALE-ROJO-DE-LA-VEGA-SE-REÚNE-CON-VECINOS-DE-SAN-SIMÓN.pdf'
  UNION ALL SELECT 'GAM', 'titular', 'Alcalde de Gustavo A. Madero', 'Ricardo Janecarlo Lozano Reynoso', 'Gobierno de la alcaldía 2024-2027', NULL, NULL, NULL,
         'Forbes México, alcaldes de la CDMX 2024-2027', 'https://forbes.com.mx/estos-son-los-16-alcaldes-de-la-cdmx-para-el-periodo-2024-2027/'
  UNION ALL SELECT 'IZC', 'titular', 'Alcaldesa de Iztacalco', 'María de Lourdes Paz Reyes', 'Gobierno de la alcaldía 2024-2027', NULL, NULL, NULL,
         'Forbes México, alcaldes de la CDMX 2024-2027', 'https://forbes.com.mx/estos-son-los-16-alcaldes-de-la-cdmx-para-el-periodo-2024-2027/'
  UNION ALL SELECT 'IZP', 'titular', 'Alcaldesa de Iztapalapa', 'Aleida Alavez Ruiz', 'Gobierno de la alcaldía 2024-2027', NULL, NULL, NULL,
         'Forbes México, alcaldes de la CDMX 2024-2027', 'https://forbes.com.mx/estos-son-los-16-alcaldes-de-la-cdmx-para-el-periodo-2024-2027/'
  UNION ALL SELECT 'MAC', 'titular', 'Alcalde de La Magdalena Contreras', 'José Fernando Mercado Guaida', 'Gobierno de la alcaldía 2024-2027', NULL, NULL, NULL,
         'Excélsior, La Magdalena Contreras avanza en recuperación de barrancas', 'https://www.excelsior.com.mx/ciudad-de-mexico/magdalena-contreras-barrancas'
  UNION ALL SELECT 'MHI', 'titular', 'Alcalde de Miguel Hidalgo', 'Mauricio Tabe Echartea', 'Gobierno de la alcaldía 2024-2027', NULL, NULL, NULL,
         'Forbes México, alcaldes de la CDMX 2024-2027', 'https://forbes.com.mx/estos-son-los-16-alcaldes-de-la-cdmx-para-el-periodo-2024-2027/'
  UNION ALL SELECT 'MAL', 'titular', 'Alcalde de Milpa Alta', 'José Octavio Rivero Villaseñor', 'Gobierno de la alcaldía 2024-2027', NULL, NULL, NULL,
         'Forbes México, alcaldes de la CDMX 2024-2027', 'https://forbes.com.mx/estos-son-los-16-alcaldes-de-la-cdmx-para-el-periodo-2024-2027/'
  UNION ALL SELECT 'TLH', 'titular', 'Alcaldesa de Tláhuac', 'Araceli Berenice Hernández Calderón', 'Gobierno de la alcaldía 2024-2027', NULL, NULL, NULL,
         'Forbes México, alcaldes de la CDMX 2024-2027', 'https://forbes.com.mx/estos-son-los-16-alcaldes-de-la-cdmx-para-el-periodo-2024-2027/'
  UNION ALL SELECT 'TLP', 'titular', 'Alcaldesa de Tlalpan', 'Gabriela Osorio Hernández', 'Gobierno de la alcaldía 2024-2027', NULL, NULL, NULL,
         'Forbes México, alcaldes de la CDMX 2024-2027', 'https://forbes.com.mx/estos-son-los-16-alcaldes-de-la-cdmx-para-el-periodo-2024-2027/'
  UNION ALL SELECT 'VCA', 'titular', 'Alcaldesa de Venustiano Carranza', 'Evelyn Parra Álvarez', 'Gobierno de la alcaldía 2024-2027', NULL, NULL, NULL,
         'Forbes México, alcaldes de la CDMX 2024-2027', 'https://forbes.com.mx/estos-son-los-16-alcaldes-de-la-cdmx-para-el-periodo-2024-2027/'
  UNION ALL SELECT 'XOC', 'titular', 'Alcaldesa de Xochimilco', 'Circe Camacho Bastida', 'Gobierno de la alcaldía 2024-2027', NULL, NULL, NULL,
         'Forbes México, alcaldes de la CDMX 2024-2027', 'https://forbes.com.mx/estos-son-los-16-alcaldes-de-la-cdmx-para-el-periodo-2024-2027/'
  UNION ALL SELECT 'AZC', 'sede_atencion', 'IECM · Dirección Distrital 3', 'Marco Antonio Vanegas López', 'Presupuesto participativo, COPACO, consulta ciudadana',
         'Av. 22 de Febrero 251, Col. Santa María Malinalco, C.P. 02050', '5553537926', 'distrito3@iecm.mx',
         'IECM, directorio del Distrito 3 (cabecera Azcapotzalco)', 'https://www.iecm.mx/acerca-del-iecm/directorio/directorio-del-distrito-3-cabecera-delegacional-azcapotzalco/'
  UNION ALL SELECT 'CUH', 'sede_atencion', 'IECM · Dirección Distrital 9', 'Alejandro Noriega González', 'Presupuesto participativo, COPACO, consulta ciudadana',
         'Maple 80, Col. Santa María Insurgentes, C.P. 06430', '5555977238', 'distrito9@iecm.mx',
         'IECM, directorio del Distrito 9 (cabecera Cuauhtémoc)', 'https://www.iecm.mx/acerca-del-iecm/directorio/directorio-del-distrito-9-cabecera-delegacional-cuauhtemoc/'
  UNION ALL SELECT 'VCA', 'sede_atencion', 'IECM · Dirección Distrital 10', 'Isaac Sergio Mendoza García', 'Presupuesto participativo, COPACO, consulta ciudadana',
         'Manuel Rivera Cambas 61, Col. Jardín Balbuena, C.P. 15900', '5557046708', 'distrito10@iecm.mx',
         'IECM, directorio del Distrito 10 (cabecera Venustiano Carranza)', 'https://www.iecm.mx/acerca-del-iecm/directorio/directorio-del-distrito-10-cabecera-delegacional-venustiano-carranza/'
  UNION ALL SELECT 'MHI', 'sede_atencion', 'IECM · Dirección Distrital 13', 'Verónica Muñoz Durán', 'Presupuesto participativo, COPACO, consulta ciudadana',
         'Constitución 35, Col. Escandón, C.P. 11800', '5553997244', 'distrito13@iecm.mx',
         'IECM, directorio del Distrito 13 (cabecera Miguel Hidalgo)', 'https://www.iecm.mx/acerca-del-iecm/directorio/directorio-del-distrito-13-cabecera-delegacional-miguel-hidalgo/'
  UNION ALL SELECT 'COY', 'sede_atencion', 'IECM · Dirección Distrital 26', 'Citlali Alejandra Aldaz Echeverría', 'Presupuesto participativo, COPACO, consulta ciudadana',
         'Holanda 21, Col. San Diego Churubusco, C.P. 04120', '5554833800', 'distrito26@iecm.mx',
         'IECM, directorio del Distrito 26 (cabecera Coyoacán)', 'https://www.iecm.mx/acerca-del-iecm/directorio/directorio-del-distrito-26-cabecera-delegacional-coyoacan/'
) v JOIN alcaldias a ON a.clave = v.clave;

