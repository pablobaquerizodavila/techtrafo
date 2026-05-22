-- ===================================================================
-- TECHTRAFO - Migracion 002: Schema comercial - Clientes y contactos
-- ===================================================================
-- Version: 0.3.0
-- Fecha: 2026-05-22
-- Ejecutado en produccion: no
-- Reversible: no (solo IF NOT EXISTS, idempotente)
--
-- Contenido:
--   - Schema comercial (clientes, cotizaciones, contratos futuros)
--   - core.fn_set_updated_at()  trigger generico de timestamp
--   - core.fn_auditar()         trigger generico que escribe a core.auditoria
--   - 2 tablas: clientes, cliente_contactos
--   - Indices y triggers en ambas tablas
-- ===================================================================

CREATE SCHEMA IF NOT EXISTS comercial;

-- -------------------------------------------------------------------
-- Funcion generica: refresca updated_at en cualquier tabla
-- -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -------------------------------------------------------------------
-- Funcion generica de auditoria
-- Escribe a core.auditoria en INSERT/UPDATE/DELETE
-- Lee usuario actual de la variable de sesion 'app.usuario_id'
-- (el backend la setea con SET LOCAL al inicio de cada transaccion)
-- -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION core.fn_auditar()
RETURNS TRIGGER AS $$
DECLARE
    v_usuario_id UUID;
    v_valor_ant  JSONB;
    v_valor_new  JSONB;
    v_entidad_id TEXT;
BEGIN
    BEGIN
        v_usuario_id := current_setting('app.usuario_id', true)::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_usuario_id := NULL;
    END;

    IF TG_OP = 'DELETE' THEN
        v_valor_ant  := to_jsonb(OLD);
        v_entidad_id := OLD.id::TEXT;
    ELSIF TG_OP = 'UPDATE' THEN
        v_valor_ant  := to_jsonb(OLD);
        v_valor_new  := to_jsonb(NEW);
        v_entidad_id := NEW.id::TEXT;
    ELSE
        v_valor_new  := to_jsonb(NEW);
        v_entidad_id := NEW.id::TEXT;
    END IF;

    INSERT INTO core.auditoria
        (usuario_id, modulo, accion, entidad, entidad_id, valor_anterior, valor_nuevo)
    VALUES
        (v_usuario_id, TG_TABLE_SCHEMA, TG_OP, TG_TABLE_NAME, v_entidad_id, v_valor_ant, v_valor_new);

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- -------------------------------------------------------------------
-- Tabla: clientes
-- Persona natural o juridica que contrata servicios o compra trafos
-- ruc_cedula unico; validacion de algoritmo se hace en la app
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comercial.clientes (
    id                  BIGSERIAL PRIMARY KEY,
    tipo_persona        VARCHAR(20) NOT NULL CHECK (tipo_persona IN ('natural','juridica')),
    razon_social        VARCHAR(200) NOT NULL,
    nombre_comercial    VARCHAR(200),
    ruc_cedula          VARCHAR(13) UNIQUE NOT NULL,
    direccion_fiscal    TEXT,
    ciudad              VARCHAR(80),
    provincia           VARCHAR(80),
    pais                VARCHAR(80) DEFAULT 'Ecuador',
    telefono            VARCHAR(20),
    email               VARCHAR(255),
    sitio_web           VARCHAR(255),
    segmento            VARCHAR(30) CHECK (segmento IN ('industrial','distribuidora','constructora','otro')),
    sector              VARCHAR(20) CHECK (sector IN ('privado','publico')),
    credito_habilitado  BOOLEAN DEFAULT FALSE,
    limite_credito      NUMERIC(14,2) DEFAULT 0,
    plazo_credito_dias  INT DEFAULT 0,
    estado              VARCHAR(20) DEFAULT 'activo'
                        CHECK (estado IN ('activo','inactivo','bloqueado','archivado')),
    notas               TEXT,
    creado_por          UUID REFERENCES core.usuarios(id),
    actualizado_por     UUID REFERENCES core.usuarios(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------------------
-- Tabla: cliente_contactos
-- Personas dentro del cliente (jefe de compras, ing. electrico, etc.)
-- Un cliente puede tener N contactos; uno solo como principal
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comercial.cliente_contactos (
    id                      BIGSERIAL PRIMARY KEY,
    cliente_id              BIGINT NOT NULL REFERENCES comercial.clientes(id) ON DELETE CASCADE,
    nombres                 VARCHAR(100) NOT NULL,
    apellidos               VARCHAR(100),
    cargo                   VARCHAR(100),
    telefono                VARCHAR(20),
    celular                 VARCHAR(20),
    email                   VARCHAR(255),
    es_principal            BOOLEAN DEFAULT FALSE,
    recibe_notificaciones   BOOLEAN DEFAULT TRUE,
    notas                   TEXT,
    estado                  VARCHAR(20) DEFAULT 'activo'
                            CHECK (estado IN ('activo','inactivo')),
    creado_por              UUID REFERENCES core.usuarios(id),
    actualizado_por         UUID REFERENCES core.usuarios(id),
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------------------
-- Indices
-- -------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_clientes_ruc        ON comercial.clientes(ruc_cedula);
CREATE INDEX IF NOT EXISTS idx_clientes_razon      ON comercial.clientes(razon_social);
CREATE INDEX IF NOT EXISTS idx_clientes_estado     ON comercial.clientes(estado);
CREATE INDEX IF NOT EXISTS idx_clientes_segmento   ON comercial.clientes(segmento);
CREATE INDEX IF NOT EXISTS idx_contactos_cliente   ON comercial.cliente_contactos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_contactos_email     ON comercial.cliente_contactos(email);

-- Un solo contacto principal por cliente
CREATE UNIQUE INDEX IF NOT EXISTS uq_contacto_principal
    ON comercial.cliente_contactos(cliente_id)
    WHERE es_principal;

-- -------------------------------------------------------------------
-- Triggers de updated_at y auditoria
-- -------------------------------------------------------------------
DROP TRIGGER IF EXISTS tg_clientes_updated_at ON comercial.clientes;
CREATE TRIGGER tg_clientes_updated_at
    BEFORE UPDATE ON comercial.clientes
    FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

DROP TRIGGER IF EXISTS tg_clientes_auditar ON comercial.clientes;
CREATE TRIGGER tg_clientes_auditar
    AFTER INSERT OR UPDATE OR DELETE ON comercial.clientes
    FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

DROP TRIGGER IF EXISTS tg_contactos_updated_at ON comercial.cliente_contactos;
CREATE TRIGGER tg_contactos_updated_at
    BEFORE UPDATE ON comercial.cliente_contactos
    FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

DROP TRIGGER IF EXISTS tg_contactos_auditar ON comercial.cliente_contactos;
CREATE TRIGGER tg_contactos_auditar
    AFTER INSERT OR UPDATE OR DELETE ON comercial.cliente_contactos
    FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();
