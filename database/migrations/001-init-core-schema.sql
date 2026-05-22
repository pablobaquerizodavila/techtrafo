-- ===================================================================
-- TECHTRAFO - Migracion 001: Schema core inicial
-- ===================================================================
-- Version: 0.1.0
-- Fecha: 2026-05-22
-- Ejecutado en produccion: si
-- Reversible: no (solo IF NOT EXISTS, idempotente)
--
-- Contenido:
--   - Schema core (separa tablas de sistema vs negocio)
--   - Extension pgcrypto para UUIDs y hashing
--   - 4 tablas: roles, usuarios, configuracion, auditoria
--   - 6 indices para busquedas frecuentes
-- ===================================================================

CREATE SCHEMA IF NOT EXISTS core;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -------------------------------------------------------------------
-- Tabla: roles
-- Define los roles del sistema y sus permisos como JSONB
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS core.roles (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(50) UNIQUE NOT NULL,
    descripcion     TEXT,
    permisos        JSONB DEFAULT '{}'::jsonb,
    activo          BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------------------
-- Tabla: usuarios
-- UUID como PK para que los IDs no sean predecibles
-- password_hash usa bcrypt (genera el backend)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS core.usuarios (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    nombres         VARCHAR(100) NOT NULL,
    apellidos       VARCHAR(100) NOT NULL,
    rol_id          INT REFERENCES core.roles(id),
    telefono        VARCHAR(20),
    activo          BOOLEAN DEFAULT TRUE,
    ultimo_login    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------------------
-- Tabla: configuracion
-- Centro de parametros editables del sistema
-- valor como JSONB permite cualquier tipo: string, number, array, object
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS core.configuracion (
    id              SERIAL PRIMARY KEY,
    modulo          VARCHAR(50) NOT NULL,
    clave           VARCHAR(100) NOT NULL,
    valor           JSONB NOT NULL,
    tipo            VARCHAR(20) DEFAULT 'string',
    descripcion     TEXT,
    editado_por     UUID REFERENCES core.usuarios(id),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (modulo, clave)
);

-- -------------------------------------------------------------------
-- Tabla: auditoria
-- Cada cambio importante del sistema queda registrado
-- valor_anterior y valor_nuevo en JSONB para flexibilidad
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS core.auditoria (
    id              BIGSERIAL PRIMARY KEY,
    usuario_id      UUID REFERENCES core.usuarios(id),
    modulo          VARCHAR(50) NOT NULL,
    accion          VARCHAR(50) NOT NULL,
    entidad         VARCHAR(100),
    entidad_id      VARCHAR(100),
    valor_anterior  JSONB,
    valor_nuevo     JSONB,
    ip_origen       INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------------------
-- Indices para busquedas frecuentes
-- -------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_usuarios_email          ON core.usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_rol            ON core.usuarios(rol_id);
CREATE INDEX IF NOT EXISTS idx_config_modulo           ON core.configuracion(modulo);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario       ON core.auditoria(usuario_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_modulo_fecha  ON core.auditoria(modulo, created_at);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha         ON core.auditoria(created_at DESC);
