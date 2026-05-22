-- ===================================================================
-- TECHTRAFO - Migracion 006: Schema produccion - Ordenes de Trabajo
-- ===================================================================
-- Version: 0.3.0
-- Fecha: 2026-05-22
-- Ejecutado en produccion: no
-- Reversible: no (solo IF NOT EXISTS, idempotente)
--
-- Contenido:
--   - Schema produccion
--   - 3 tablas: ot, ot_pasos, ot_evidencias
--   - ALTER inventario.series ADD FK ot_id_origen -> produccion.ot.id
--     (cierra dependencia pendiente de la migration 003)
--   - ot_pasos unifica los 28 pasos del flujo y los 5 gates de QC
--     (gates marcados con es_gate=TRUE; campos resultado_gate y
--     mediciones aplican solo a gates)
--   - tipo_ruta (reparacion/fabricacion/mantenimiento) define que
--     plantilla de pasos instancia la app al crear la OT
--   - Consumos de bodega se consultan via inventario.movimientos_stock
--     filtrando por referencia_tipo='ot' (sin tabla puente)
-- ===================================================================

CREATE SCHEMA IF NOT EXISTS produccion;

-- -------------------------------------------------------------------
-- Tabla: ot
-- Cabecera de la orden de trabajo. Nace de un contrato firmado.
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS produccion.ot (
    id                      BIGSERIAL PRIMARY KEY,
    codigo                  VARCHAR(30) UNIQUE,
    contrato_id             BIGINT NOT NULL REFERENCES comercial.contratos(id),
    tipo_ruta               VARCHAR(20) NOT NULL
                            CHECK (tipo_ruta IN ('reparacion','fabricacion','mantenimiento')),
    prioridad               VARCHAR(20) NOT NULL DEFAULT 'normal'
                            CHECK (prioridad IN ('baja','normal','alta','urgente')),
    descripcion             TEXT,
    fecha_inicio_planeada   DATE,
    fecha_fin_planeada      DATE,
    fecha_inicio_real       TIMESTAMPTZ,
    fecha_fin_real          TIMESTAMPTZ,
    paso_actual             INT,
    responsable_id          UUID REFERENCES core.usuarios(id),
    estado                  VARCHAR(20) NOT NULL DEFAULT 'planeada'
                            CHECK (estado IN ('planeada','en_curso','pausada','completada','cancelada')),
    motivo_cancelacion      TEXT,
    observaciones           TEXT,
    notas_internas          TEXT,
    creado_por              UUID REFERENCES core.usuarios(id),
    actualizado_por         UUID REFERENCES core.usuarios(id),
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW(),
    CHECK (fecha_fin_planeada IS NULL OR fecha_inicio_planeada IS NULL
        OR fecha_fin_planeada >= fecha_inicio_planeada),
    CHECK (fecha_fin_real IS NULL OR fecha_inicio_real IS NULL
        OR fecha_fin_real >= fecha_inicio_real),
    -- Coherencia: cancelada requiere motivo
    CHECK ((estado <> 'cancelada') OR (estado = 'cancelada' AND motivo_cancelacion IS NOT NULL)),
    -- Coherencia: completada requiere fecha_fin_real
    CHECK ((estado <> 'completada') OR (estado = 'completada' AND fecha_fin_real IS NOT NULL))
);

-- -------------------------------------------------------------------
-- Tabla: ot_pasos
-- Instancia los pasos del flujo (hasta 28 segun ruta). Los gates de QC
-- son un subconjunto marcado con es_gate=TRUE. Cuando es_gate, los
-- campos resultado_gate y mediciones son significativos.
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS produccion.ot_pasos (
    id                  BIGSERIAL PRIMARY KEY,
    ot_id               BIGINT NOT NULL REFERENCES produccion.ot(id) ON DELETE CASCADE,
    numero              INT NOT NULL CHECK (numero > 0),
    nombre              VARCHAR(200) NOT NULL,
    descripcion         TEXT,
    es_gate             BOOLEAN NOT NULL DEFAULT FALSE,
    numero_gate         INT,  -- 1..5 si es_gate; NULL si no
    estado              VARCHAR(20) NOT NULL DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente','en_curso','completado','saltado','rechazado')),
    resultado_gate      VARCHAR(20)
                        CHECK (resultado_gate IS NULL OR resultado_gate IN ('aprobado','rechazado','con_observaciones')),
    mediciones          JSONB,
    fecha_inicio        TIMESTAMPTZ,
    fecha_fin           TIMESTAMPTZ,
    ejecutado_por       UUID REFERENCES core.usuarios(id),
    aprobado_por        UUID REFERENCES core.usuarios(id),  -- para gates
    observaciones       TEXT,
    notas_internas      TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (ot_id, numero),
    CHECK (fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio),
    -- Si es_gate, debe tener numero_gate; si no, no
    CHECK ((es_gate = TRUE  AND numero_gate IS NOT NULL AND numero_gate BETWEEN 1 AND 5)
        OR (es_gate = FALSE AND numero_gate IS NULL)),
    -- Gates rechazados requieren resultado='rechazado' y observaciones
    CHECK ((estado <> 'rechazado')
        OR (estado = 'rechazado' AND es_gate = TRUE
            AND resultado_gate = 'rechazado' AND observaciones IS NOT NULL))
);

-- -------------------------------------------------------------------
-- Tabla: ot_evidencias
-- Polimorfica: una evidencia puede asociarse a la OT en general o a un
-- paso especifico (paso_id). Archivos viven en MinIO; aqui solo ruta.
-- metadatos guarda EXIF, equipo de medicion, parametros, etc.
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS produccion.ot_evidencias (
    id              BIGSERIAL PRIMARY KEY,
    ot_id           BIGINT NOT NULL REFERENCES produccion.ot(id) ON DELETE CASCADE,
    paso_id         BIGINT REFERENCES produccion.ot_pasos(id) ON DELETE SET NULL,
    tipo            VARCHAR(20) NOT NULL
                    CHECK (tipo IN ('foto','pdf','medicion','video','certificado','otro')),
    titulo          VARCHAR(200),
    descripcion     TEXT,
    ruta_archivo    VARCHAR(500),  -- ruta en MinIO (s3://bucket/key) o URL temporal
    mime_type       VARCHAR(100),
    tamanio_bytes   BIGINT CHECK (tamanio_bytes IS NULL OR tamanio_bytes >= 0),
    metadatos       JSONB,
    creado_por      UUID REFERENCES core.usuarios(id),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------------------
-- ALTER inventario.series: anadir FK ot_id_origen -> produccion.ot
-- (cierra dependencia que dejamos pendiente en migration 003)
-- -------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
         WHERE constraint_name = 'series_ot_id_origen_fkey'
           AND table_schema = 'inventario'
           AND table_name = 'series'
    ) THEN
        ALTER TABLE inventario.series
            ADD CONSTRAINT series_ot_id_origen_fkey
            FOREIGN KEY (ot_id_origen) REFERENCES produccion.ot(id);
    END IF;
END $$;

-- -------------------------------------------------------------------
-- Vista: v_ot_consumos
-- Lista los consumos de bodega asociados a cada OT, leyendo de
-- inventario.movimientos_stock por referencia_tipo='ot'.
-- -------------------------------------------------------------------
CREATE OR REPLACE VIEW produccion.v_ot_consumos AS
SELECT
    m.referencia_id        AS ot_id,
    m.id                   AS movimiento_id,
    m.fecha,
    m.tipo,
    m.item_id,
    i.codigo_interno       AS item_codigo,
    i.nombre               AS item_nombre,
    m.cantidad,
    i.unidad_medida,
    m.costo_unitario,
    (m.cantidad * COALESCE(m.costo_unitario, 0)) AS costo_total_linea,
    m.lote_id,
    m.serie_id,
    m.usuario_id,
    m.motivo,
    m.observaciones
FROM inventario.movimientos_stock m
JOIN inventario.items i ON i.id = m.item_id
WHERE m.referencia_tipo = 'ot'
  AND m.referencia_id IS NOT NULL;

-- -------------------------------------------------------------------
-- Indices
-- -------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ot_contrato        ON produccion.ot(contrato_id);
CREATE INDEX IF NOT EXISTS idx_ot_estado          ON produccion.ot(estado);
CREATE INDEX IF NOT EXISTS idx_ot_tipo_ruta       ON produccion.ot(tipo_ruta);
CREATE INDEX IF NOT EXISTS idx_ot_responsable     ON produccion.ot(responsable_id);
CREATE INDEX IF NOT EXISTS idx_ot_codigo          ON produccion.ot(codigo);
CREATE INDEX IF NOT EXISTS idx_ot_pasos_ot        ON produccion.ot_pasos(ot_id);
CREATE INDEX IF NOT EXISTS idx_ot_pasos_estado    ON produccion.ot_pasos(estado);
CREATE INDEX IF NOT EXISTS idx_ot_pasos_gates     ON produccion.ot_pasos(ot_id, numero_gate)
                                                  WHERE es_gate;
CREATE INDEX IF NOT EXISTS idx_ot_evidencias_ot   ON produccion.ot_evidencias(ot_id);
CREATE INDEX IF NOT EXISTS idx_ot_evidencias_paso ON produccion.ot_evidencias(paso_id)
                                                  WHERE paso_id IS NOT NULL;

-- -------------------------------------------------------------------
-- Triggers
-- -------------------------------------------------------------------
DROP TRIGGER IF EXISTS tg_ot_updated_at ON produccion.ot;
CREATE TRIGGER tg_ot_updated_at
    BEFORE UPDATE ON produccion.ot
    FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

DROP TRIGGER IF EXISTS tg_ot_auditar ON produccion.ot;
CREATE TRIGGER tg_ot_auditar
    AFTER INSERT OR UPDATE OR DELETE ON produccion.ot
    FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

DROP TRIGGER IF EXISTS tg_ot_pasos_updated_at ON produccion.ot_pasos;
CREATE TRIGGER tg_ot_pasos_updated_at
    BEFORE UPDATE ON produccion.ot_pasos
    FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

DROP TRIGGER IF EXISTS tg_ot_pasos_auditar ON produccion.ot_pasos;
CREATE TRIGGER tg_ot_pasos_auditar
    AFTER INSERT OR UPDATE OR DELETE ON produccion.ot_pasos
    FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

DROP TRIGGER IF EXISTS tg_ot_evidencias_auditar ON produccion.ot_evidencias;
CREATE TRIGGER tg_ot_evidencias_auditar
    AFTER INSERT OR UPDATE OR DELETE ON produccion.ot_evidencias
    FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();
