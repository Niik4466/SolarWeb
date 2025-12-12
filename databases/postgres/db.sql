CREATE EXTENSION IF NOT EXISTS citext; -- sirve para que el correo no distinga mayúsculas/minúsculas
CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION CURRENT_USER; -- sirve para organizar tablas y evitar conflictos de nombres
CREATE EXTENSION IF NOT EXISTS pgcrypto with schema public; -- sirve para funciones de hashing
CREATE EXTENSION IF NOT EXISTS citext; -- sirve para que el correo no distinga mayúsculas/minúsculas
SET search_path TO app, public; -- le dice a Postgres que use el esquema app por defecto

-- 1) Tipos ENUM (ajusta valores si lo necesitas)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'usuario_estado') THEN
    CREATE TYPE usuario_estado AS ENUM ('pendiente','aprobado','eliminado');
  END IF;
END$$;

-- 2) Tabla USUARIO
CREATE TABLE IF NOT EXISTS usuario (
  id               BIGSERIAL PRIMARY KEY,
  correo           CITEXT        NOT NULL,         -- case-insensitive
  nombre           VARCHAR(100)  NOT NULL,
  apellido         VARCHAR(100),
  password_hash    TEXT          NOT NULL,
  es_admin         BOOLEAN       NOT NULL DEFAULT FALSE,
  owner            BOOLEAN       NOT NULL DEFAULT FALSE,
  estado           usuario_estado NOT NULL DEFAULT 'pendiente',
  creado_en        TIMESTAMP      NOT NULL DEFAULT now(),
  actualizado_en   TIMESTAMP      NOT NULL DEFAULT now(),
  aprobado_en      TIMESTAMP
);

-- Unicidad de correo solo para usuarios no eliminados (permite reutilizar correo tras eliminación)
-- Se crea un índice único parcial sobre estado<>'eliminado'
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuario_correo_activo
  ON usuario(correo)
  WHERE estado <> 'eliminado';

-- Trigger para mantener actualizado_en
CREATE OR REPLACE FUNCTION set_actualizado_en()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_usuario_touch ON usuario;

CREATE TRIGGER trg_usuario_touch
BEFORE UPDATE ON usuario
FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();

-- 3) Bitácora: quién elimina a quién + motivo + fecha
CREATE TABLE IF NOT EXISTS usuario_eliminacion_log (
  id                 BIGSERIAL PRIMARY KEY,
  usuario_id         BIGINT  NOT NULL REFERENCES usuario(id),  -- el eliminado
  eliminado_por_id   BIGINT  NOT NULL REFERENCES usuario(id),  -- admin/operador
  motivo             TEXT,
  eliminado_en  TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_u_elim_log_usuario       ON usuario_eliminacion_log(usuario_id);
CREATE INDEX IF NOT EXISTS ix_u_elim_log_eliminado_por ON usuario_eliminacion_log(eliminado_por_id);
CREATE INDEX IF NOT EXISTS ix_u_elim_log_fecha         ON usuario_eliminacion_log(eliminado_en);

-- 4) Tabla SOLICITUD (N por usuario)
-- 'tipo' lo dejamos como TEXT para flexibilidad; si lo prefieres, crea un ENUM catálogo.
CREATE TABLE IF NOT EXISTS solicitud (
  id             BIGSERIAL PRIMARY KEY,
  usuario_id     BIGINT      NOT NULL REFERENCES usuario(id),
  justificacion  TEXT,
  creado_en      TIMESTAMP   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_solicitud_usuario  ON solicitud(usuario_id);

-- 5) Tabla TRANSACCION (N por usuario)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaccion_estado') THEN
    CREATE TYPE transaccion_estado AS ENUM ('pendiente','listo','error','expirado');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS transaccion (
    id                 BIGSERIAL PRIMARY KEY,
    usuario_id         BIGINT     NOT NULL REFERENCES usuario(id),
    archivos           TEXT[]     NULL,
    exportado_en       TIMESTAMP  NULL,
    imagenes           BOOLEAN    NOT NULL DEFAULT FALSE,
    var_ghi            BOOLEAN    NOT NULL DEFAULT FALSE,
    var_dni            BOOLEAN    NOT NULL DEFAULT FALSE,
    var_global         BOOLEAN    NOT NULL DEFAULT FALSE,
    estado             transaccion_estado NOT NULL DEFAULT 'pendiente',
    creado_en          TIMESTAMP  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_transaccion_usuario ON transaccion(usuario_id);
CREATE INDEX IF NOT EXISTS ix_transaccion_fecha   ON transaccion(exportado_en);

-- 6) Funciones de negocio (opcionales pero útiles)

-- 7) Tabla PASSWORD_RECOVERY_CODE
CREATE TABLE IF NOT EXISTS password_recovery_code (
    id          BIGSERIAL PRIMARY KEY,
    usuario_id  BIGINT NOT NULL REFERENCES usuario(id),
    code_hash   VARCHAR NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT now(),
    expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    used        BOOLEAN DEFAULT FALSE,
    attempts    INTEGER DEFAULT 0
);


CREATE INDEX IF NOT EXISTS ix_pwd_recovery_usuario ON password_recovery_code(usuario_id);
-- Aprobar usuario
CREATE OR REPLACE FUNCTION aprobar_usuario(p_usuario_id BIGINT, p_admin_id BIGINT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_admin BOOLEAN;
BEGIN
  SELECT es_admin INTO v_admin FROM usuario
  WHERE id = p_admin_id AND estado <> 'eliminado';
  IF v_admin IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Solo un administrador activo puede aprobar.';
  END IF;

  UPDATE usuario
     SET estado='aprobado', aprobado_en=now()
   WHERE id = p_usuario_id;
END$$;

-- 8) Crear usuario Owner por defecto
INSERT INTO usuario (correo, nombre, apellido, password_hash, es_admin, owner, estado, aprobado_en)
VALUES ('solarwebuach@gmail.com', 'SolarWeb', 'Uach', '$2b$12$OeJakuWRg.3Y3F4Wsjtj7OWyUYFZ7ZO.U103MlkSjl2Zg30UGhhoC', TRUE, TRUE, 'aprobado', now())
ON CONFLICT (correo) DO NOTHING;

-- Crear usuario de prueba no admin
INSERT INTO usuario (correo, nombre, apellido, password_hash, es_admin, owner, estado, aprobado_en)
VALUES (
  'user@test.com',
  'Usuario',
  'De Prueba',
  crypt('Test123', gen_salt('bf')),
  FALSE,
  FALSE,
  'aprobado',
  now()
)
ON CONFLICT (correo) DO NOTHING;
-- crear usuario de prueba admin
INSERT INTO usuario (correo, nombre, apellido, password_hash, es_admin, owner, estado, aprobado_en)
VALUES (
  'admin@test.com',
  'Admin',
  'De Prueba',
  crypt('Test123', gen_salt('bf')),
  TRUE,
  FALSE,
  'aprobado',
  now()
)
ON CONFLICT (correo) DO NOTHING; 
