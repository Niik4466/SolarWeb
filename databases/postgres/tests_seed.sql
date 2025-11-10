-- ============================================================
-- Seed de pruebas para SolarWeb (local y reproducible)
-- Limpia el esquema app e inserta usuarios QA
-- ============================================================

-- extensiones necesarias
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- trabajar en el esquema app (y luego public para funciones)
SET search_path TO app, public;

-- ============================================================
-- 1) VACÍAR ESQUEMA APP
-- ============================================================

-- permitir truncar con FK
SET session_replication_role = replica;

DO
$$
DECLARE
    r RECORD;
BEGIN
    -- recorrer todas las tablas del esquema app
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'app') LOOP
        EXECUTE format('TRUNCATE TABLE app.%I RESTART IDENTITY CASCADE;', r.tablename);
    END LOOP;
END;
$$;

-- restaurar
SET session_replication_role = origin;

-- ============================================================
-- 2) INSERTAR USUARIOS QA
-- ============================================================

-- Usuario APROBADO
INSERT INTO usuario (
    correo,
    nombre,
    apellido,
    password_hash,
    es_admin,
    estado,
    creado_en,
    actualizado_en,
    aprobado_en
)
VALUES (
    'qa.user@example.com',
    'QA Aprobado',
    '',
    crypt('Test123', public.gen_salt('bf')),
    false,
    'aprobado'::app.usuario_estado,
    NOW(),
    NOW(),
    NOW()
);

-- Usuario PENDIENTE
INSERT INTO usuario (
    correo,
    nombre,
    apellido,
    password_hash,
    es_admin,
    estado,
    creado_en,
    actualizado_en,
    aprobado_en
)
VALUES (
    'qa.user+pendiente@example.com',
    'QA Pendiente',
    '',
    crypt('Test1234!', public.gen_salt('bf')),
    false,
    'pendiente'::app.usuario_estado,
    NOW(),
    NOW(),
    NULL
);

-- mostrar los usuarios insertados
TABLE usuario;

DO $$ BEGIN
  RAISE NOTICE '✅ Esquema app vaciado e inicializado con usuarios QA (aprobado y pendiente).';
END $$;
