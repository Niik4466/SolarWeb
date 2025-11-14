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

-- ============================================================
-- 7) Datos de prueba para HU-4A: admin + 3 usuarios eliminados
-- ============================================================

-- Admin que realizará las eliminaciones
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
  'admin@solarweb.com',
  'Admin',
  'Solarweb',
  crypt('Test123', public.gen_salt('bf')),
  TRUE,
  'aprobado'::app.usuario_estado,
  NOW(),
  NOW(),
  NOW()
)
ON CONFLICT (correo) DO NOTHING;

-- Tres usuarios marcados como eliminados
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
VALUES
  (
    'eliminado1@solarweb.com',
    'Ana',
    '',
    crypt('Test123', public.gen_salt('bf')),
    FALSE,
    'aprobado'::app.usuario_estado,
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '5 days',
    NULL
  ),
  (
    'eliminado2@solarweb.com',
    'Bruno',
    '',
    crypt('Test123', public.gen_salt('bf')),
    FALSE,
    'aprobado'::app.usuario_estado,
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '3 days',
    NULL
  ),
  (
    'eliminado3@solarweb.com',
    'Carla',
    '',
    crypt('Test123', public.gen_salt('bf')),
    FALSE,
    'eliminado'::app.usuario_estado,
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '1 day',
    NULL
  ),

  (
    'eliminado4@solarweb.com',
    'David',
    '',
    crypt('Test123', public.gen_salt('bf')),
    FALSE,
    'aprobado'::app.usuario_estado,
    NOW() - INTERVAL '12 hours',
    NOW() - INTERVAL '12 hours',
    NULL
  )
ON CONFLICT (correo) DO NOTHING;

-- Bitácora de eliminaciones: quién eliminó a quién y por qué
INSERT INTO usuario_eliminacion_log (usuario_id, eliminado_por_id, motivo, eliminado_en)
VALUES
  (
    (SELECT id FROM usuario WHERE correo = 'eliminado1@solarweb.com'),
    (SELECT id FROM usuario WHERE correo = 'admin@solarweb.com'),
    'Cuenta dada de baja para pruebas internas.',
    NOW() - INTERVAL '4 days'
  ),
  (
    (SELECT id FROM usuario WHERE correo = 'eliminado2@solarweb.com'),
    (SELECT id FROM usuario WHERE correo = 'admin@solarweb.com'),
    'El usuario solicitó la eliminación de la cuenta.',
    NOW() - INTERVAL '2 days'
  ),
  (
    (SELECT id FROM usuario WHERE correo = 'eliminado3@solarweb.com'),
    (SELECT id FROM usuario WHERE correo = 'admin@solarweb.com'),
    'Cuenta eliminada por uso indebido del sistema.',
    NOW() - INTERVAL '12 hours'
  );

-- ============================================================
-- 8) Verificación rápida
-- ============================================================

TABLE usuario;

DO $$ BEGIN
  RAISE NOTICE '✅ Esquema app vaciado e inicializado con usuarios QA (incluye admin y 3 eliminados).';
END $$;
