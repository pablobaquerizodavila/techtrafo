-- ===================================================================
-- TECHTRAFO - Migracion 007: Schema posventa - Garantias y reclamos
-- ===================================================================
-- Version: 0.3.0
-- Fecha: 2026-05-22
-- Ejecutado en produccion: no
-- Reversible: no (solo IF NOT EXISTS, idempotente)
--
-- Contenido:
--   - Schema posventa
--   - 3 tablas: garantias, reclamos, intervenciones
--   - 1 garantia por serie (UNIQUE serie_id)
--   - Reclamos durante la vigencia de la garantia
--   - Intervenciones por reclamo (visitas, reparaciones)
--   - Las intervenciones que requieran OT se enlazan a produccion.ot
--   - Cliente y contrato denormalizados en garantias para queries rapidas
-- ===================================================================

CREATE SCHEMA IF NOT EXISTS posventa;

-- -------------------------------------------------------------------
-- Tabla: garantias
-- Una por cada trafo entregado (serie). Vigencia: fecha_inicio + duracion_meses.
-- fecha_emision (firma del certificado) puede ser posterior a fecha_inicio
-- (entrega fisica): es comun que el papeleo se complete despues de la entrega.
-- Estado vigente/vencida lo evalua la app comparando fecha_fin con hoy.
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS posventa.garantias (
    id                  BIGSERIAL PRIMARY KEY,
    codigo              VARCHAR(30) UNIQUE,
    serie_id            BIGINT NOT NULL UNIQUE REFERENCES inventario.series(id),
    contrato_id         BIGINT REFERENCES comercial.contratos(id),
    cliente_id          BIGINT NOT NULL REFERENCES comercial.clientes(id),
    fecha_emision       DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_inicio        DATE NOT NULL,
    fecha_fin           DATE NOT NULL,
    duracion_meses      INT NOT NULL CHECK (duracion_meses > 0 AND duracion_meses <= 60),
    alcance             TEXT,
    condiciones         TEXT,
    estado              VARCHAR(20) NOT NULL DEFAULT 'vigente'
                        CHECK (estado IN ('vigente','vencida','suspendida','cancelada')),
    motivo_estado       TEXT,
    creado_por          UUID REFERENCES core.usuarios(id),
    actualizado_por     UUID REFERENCES core.usuarios(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_garantias_fechas       CHECK (fecha_fin >= fecha_inicio),
    CONSTRAINT chk_garantias_estado_motivo
        CHECK ((estado NOT IN ('cancelada','suspendida'))
            OR (estado IN ('cancelada','suspendida') AND motivo_estado IS NOT NULL))
);

-- Si la migration se re-aplica sobre una DB que ya tiene el CHECK obsoleto
-- (anonimo) que exigia fecha_inicio >= fecha_emision, lo eliminamos.
DO $$
DECLARE
    v_constraint_name TEXT;
BEGIN
    FOR v_constraint_name IN
        SELECT conname
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
         WHERE n.nspname = 'posventa'
           AND t.relname = 'garantias'
           AND c.contype = 'c'
           AND pg_get_constraintdef(c.oid) LIKE '%fecha_inicio%fecha_emision%'
    LOOP
        EXECUTE format('ALTER TABLE posventa.garantias DROP CONSTRAINT %I', v_constraint_name);
    END LOOP;
END $$;

-- -------------------------------------------------------------------
-- Tabla: reclamos
-- Reportes del cliente durante la vigencia de la garantia.
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS posventa.reclamos (
    id                          BIGSERIAL PRIMARY KEY,
    codigo                      VARCHAR(30) UNIQUE,
    garantia_id                 BIGINT NOT NULL REFERENCES posventa.garantias(id),
    fecha_reclamo               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    descripcion                 TEXT NOT NULL,
    severidad                   VARCHAR(20) NOT NULL DEFAULT 'media'
                                CHECK (severidad IN ('baja','media','alta','critica')),
    canal                       VARCHAR(20)
                                CHECK (canal IS NULL OR canal IN ('telefono','email','whatsapp','visita_planta','web','otro')),
    reportado_por_contacto_id   BIGINT REFERENCES comercial.cliente_contactos(id),
    reportado_por_nombre        VARCHAR(200),  -- si no hay contacto registrado
    estado                      VARCHAR(20) NOT NULL DEFAULT 'recibido'
                                CHECK (estado IN ('recibido','en_evaluacion','aceptado','rechazado','cerrado')),
    resolucion                  TEXT,
    fecha_cierre                TIMESTAMPTZ,
    dictaminado_por             UUID REFERENCES core.usuarios(id),
    creado_por                  UUID REFERENCES core.usuarios(id),
    actualizado_por             UUID REFERENCES core.usuarios(id),
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ DEFAULT NOW(),
    -- Cierre exige resolucion + fecha + dictamen
    CHECK ((estado <> 'cerrado')
        OR (estado = 'cerrado' AND resolucion IS NOT NULL
            AND fecha_cierre IS NOT NULL AND dictaminado_por IS NOT NULL)),
    -- Rechazo exige resolucion y dictamen
    CHECK ((estado <> 'rechazado')
        OR (estado = 'rechazado' AND resolucion IS NOT NULL AND dictaminado_por IS NOT NULL))
);

-- -------------------------------------------------------------------
-- Tabla: intervenciones
-- Acciones tomadas para resolver un reclamo: visitas, reparaciones, etc.
-- Si la intervencion requiere documentar trabajo de planta, se enlaza
-- una OT con tipo_ruta='reparacion' o 'mantenimiento'.
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS posventa.intervenciones (
    id                  BIGSERIAL PRIMARY KEY,
    reclamo_id          BIGINT NOT NULL REFERENCES posventa.reclamos(id) ON DELETE CASCADE,
    numero              INT NOT NULL,
    tipo                VARCHAR(30) NOT NULL
                        CHECK (tipo IN ('visita_diagnostico','reparacion','reemplazo','calibracion','asesoria','otro')),
    fecha_programada    DATE,
    fecha_real          TIMESTAMPTZ,
    ot_id               BIGINT REFERENCES produccion.ot(id),
    tecnico_id          UUID REFERENCES core.usuarios(id),
    hallazgos           TEXT,
    acciones_tomadas    TEXT,
    costo_interno       NUMERIC(14,2) DEFAULT 0 CHECK (costo_interno >= 0),
    resultado           VARCHAR(20)
                        CHECK (resultado IS NULL OR resultado IN ('exitoso','parcial','fallido','no_aplica')),
    observaciones       TEXT,
    creado_por          UUID REFERENCES core.usuarios(id),
    actualizado_por     UUID REFERENCES core.usuarios(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (reclamo_id, numero)
);

-- -------------------------------------------------------------------
-- Indices
-- -------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_garantias_serie         ON posventa.garantias(serie_id);
CREATE INDEX IF NOT EXISTS idx_garantias_cliente       ON posventa.garantias(cliente_id);
CREATE INDEX IF NOT EXISTS idx_garantias_contrato      ON posventa.garantias(contrato_id);
CREATE INDEX IF NOT EXISTS idx_garantias_estado        ON posventa.garantias(estado);
CREATE INDEX IF NOT EXISTS idx_garantias_fecha_fin     ON posventa.garantias(fecha_fin)
                                                       WHERE estado = 'vigente';
CREATE INDEX IF NOT EXISTS idx_reclamos_garantia       ON posventa.reclamos(garantia_id);
CREATE INDEX IF NOT EXISTS idx_reclamos_estado         ON posventa.reclamos(estado);
CREATE INDEX IF NOT EXISTS idx_reclamos_severidad      ON posventa.reclamos(severidad);
CREATE INDEX IF NOT EXISTS idx_reclamos_fecha          ON posventa.reclamos(fecha_reclamo DESC);
CREATE INDEX IF NOT EXISTS idx_interv_reclamo          ON posventa.intervenciones(reclamo_id);
CREATE INDEX IF NOT EXISTS idx_interv_ot               ON posventa.intervenciones(ot_id)
                                                       WHERE ot_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_interv_tecnico          ON posventa.intervenciones(tecnico_id);

-- -------------------------------------------------------------------
-- Triggers
-- -------------------------------------------------------------------
DROP TRIGGER IF EXISTS tg_garantias_updated_at ON posventa.garantias;
CREATE TRIGGER tg_garantias_updated_at
    BEFORE UPDATE ON posventa.garantias
    FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

DROP TRIGGER IF EXISTS tg_garantias_auditar ON posventa.garantias;
CREATE TRIGGER tg_garantias_auditar
    AFTER INSERT OR UPDATE OR DELETE ON posventa.garantias
    FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

DROP TRIGGER IF EXISTS tg_reclamos_updated_at ON posventa.reclamos;
CREATE TRIGGER tg_reclamos_updated_at
    BEFORE UPDATE ON posventa.reclamos
    FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

DROP TRIGGER IF EXISTS tg_reclamos_auditar ON posventa.reclamos;
CREATE TRIGGER tg_reclamos_auditar
    AFTER INSERT OR UPDATE OR DELETE ON posventa.reclamos
    FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

DROP TRIGGER IF EXISTS tg_interv_updated_at ON posventa.intervenciones;
CREATE TRIGGER tg_interv_updated_at
    BEFORE UPDATE ON posventa.intervenciones
    FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

DROP TRIGGER IF EXISTS tg_interv_auditar ON posventa.intervenciones;
CREATE TRIGGER tg_interv_auditar
    AFTER INSERT OR UPDATE OR DELETE ON posventa.intervenciones
    FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();
