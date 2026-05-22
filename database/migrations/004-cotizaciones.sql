-- ===================================================================
-- TECHTRAFO - Migracion 004: Cotizaciones (schema comercial)
-- ===================================================================
-- Version: 0.3.0
-- Fecha: 2026-05-22
-- Ejecutado en produccion: no
-- Reversible: no (solo IF NOT EXISTS, idempotente)
--
-- Contenido:
--   - 3 tablas en comercial: cotizaciones, cotizacion_lineas,
--     cotizacion_revisiones
--   - tipo_servicio define la ruta futura de la OT (reparacion/fabricacion)
--   - Lineas con item_id opcional (servicios y custom permitidos)
--   - Lineas snapshotean costo_unitario para analisis de margen historico
--   - Revisiones guardan snapshot JSONB (cabecera + lineas) al modificar
--     cotizaciones ya enviadas
--   - Totales (subtotal, iva, total) los calcula y persiste la app;
--     la DB no recalcula automaticamente
-- ===================================================================

-- Schema comercial ya existe (migration 002).

-- -------------------------------------------------------------------
-- Tabla: cotizaciones
-- Cabecera de la cotizacion. Una cotizacion vive aqui en su version
-- actual; versiones anteriores (al modificar tras enviar) van a
-- cotizacion_revisiones.
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comercial.cotizaciones (
    id                  BIGSERIAL PRIMARY KEY,
    codigo              VARCHAR(30) UNIQUE,
    cliente_id          BIGINT NOT NULL REFERENCES comercial.clientes(id),
    contacto_id         BIGINT REFERENCES comercial.cliente_contactos(id),
    tipo_servicio       VARCHAR(20) NOT NULL
                        CHECK (tipo_servicio IN ('reparacion','fabricacion','mantenimiento','otro')),
    fecha_emision       DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_validez       DATE,
    moneda              VARCHAR(3) NOT NULL DEFAULT 'USD',
    subtotal            NUMERIC(14,2) NOT NULL DEFAULT 0,
    descuento_global    NUMERIC(14,2) NOT NULL DEFAULT 0,
    iva_porcentaje      NUMERIC(5,2)  NOT NULL DEFAULT 15.00,
    iva_valor           NUMERIC(14,2) NOT NULL DEFAULT 0,
    total               NUMERIC(14,2) NOT NULL DEFAULT 0,
    margen_porcentaje   NUMERIC(5,2),
    condiciones_pago    TEXT,
    tiempo_entrega      TEXT,
    observaciones       TEXT,
    notas_internas      TEXT,
    estado              VARCHAR(20) NOT NULL DEFAULT 'borrador'
                        CHECK (estado IN ('borrador','enviada','aprobada','rechazada','vencida','cancelada','convertida')),
    revision_actual     INT NOT NULL DEFAULT 1,
    vendedor_id         UUID REFERENCES core.usuarios(id),
    aprobada_por        UUID REFERENCES core.usuarios(id),
    fecha_aprobacion    TIMESTAMPTZ,
    creado_por          UUID REFERENCES core.usuarios(id),
    actualizado_por     UUID REFERENCES core.usuarios(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    CHECK (subtotal >= 0 AND total >= 0 AND iva_valor >= 0),
    CHECK (fecha_validez IS NULL OR fecha_validez >= fecha_emision),
    -- Si la cotizacion fue aprobada, debe haber registrado quien y cuando
    CHECK ((estado = 'aprobada' AND aprobada_por IS NOT NULL AND fecha_aprobacion IS NOT NULL)
        OR (estado <> 'aprobada'))
);

-- -------------------------------------------------------------------
-- Tabla: cotizacion_lineas
-- Items/servicios cotizados. item_id puede ser NULL para lineas libres
-- (ej. servicio externo no inventariable o item ad-hoc).
-- costo_unitario es snapshot al momento de cotizar (para margenes).
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comercial.cotizacion_lineas (
    id                          BIGSERIAL PRIMARY KEY,
    cotizacion_id               BIGINT NOT NULL REFERENCES comercial.cotizaciones(id) ON DELETE CASCADE,
    orden                       INT NOT NULL DEFAULT 1,
    item_id                     BIGINT REFERENCES inventario.items(id),
    descripcion                 TEXT NOT NULL,
    cantidad                    NUMERIC(14,3) NOT NULL CHECK (cantidad > 0),
    unidad_medida               VARCHAR(20) NOT NULL DEFAULT 'unid',
    precio_unitario             NUMERIC(14,2) NOT NULL CHECK (precio_unitario >= 0),
    descuento_linea_porcentaje  NUMERIC(5,2) NOT NULL DEFAULT 0
                                CHECK (descuento_linea_porcentaje >= 0 AND descuento_linea_porcentaje <= 100),
    costo_unitario              NUMERIC(14,2),  -- snapshot, opcional
    subtotal_linea              NUMERIC(14,2) NOT NULL DEFAULT 0,
    notas                       TEXT,
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------------------
-- Tabla: cotizacion_revisiones
-- Historico. Cuando se modifica una cotizacion ya enviada, antes de
-- aplicar cambios la app guarda aqui un snapshot (cabecera + lineas)
-- como JSONB para preservar la version anterior.
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comercial.cotizacion_revisiones (
    id              BIGSERIAL PRIMARY KEY,
    cotizacion_id   BIGINT NOT NULL REFERENCES comercial.cotizaciones(id) ON DELETE CASCADE,
    revision        INT NOT NULL,
    snapshot        JSONB NOT NULL,
    motivo          TEXT,
    creado_por      UUID REFERENCES core.usuarios(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (cotizacion_id, revision)
);

-- -------------------------------------------------------------------
-- Indices
-- -------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_cotizaciones_cliente      ON comercial.cotizaciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_estado       ON comercial.cotizaciones(estado);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_fecha        ON comercial.cotizaciones(fecha_emision DESC);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_codigo       ON comercial.cotizaciones(codigo);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_vendedor     ON comercial.cotizaciones(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_tipo         ON comercial.cotizaciones(tipo_servicio);
CREATE INDEX IF NOT EXISTS idx_cot_lineas_cotizacion     ON comercial.cotizacion_lineas(cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_cot_lineas_item           ON comercial.cotizacion_lineas(item_id)
                                                          WHERE item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cot_revisiones_cotizacion ON comercial.cotizacion_revisiones(cotizacion_id);

-- -------------------------------------------------------------------
-- Triggers de updated_at y auditoria
-- -------------------------------------------------------------------
DROP TRIGGER IF EXISTS tg_cotizaciones_updated_at ON comercial.cotizaciones;
CREATE TRIGGER tg_cotizaciones_updated_at
    BEFORE UPDATE ON comercial.cotizaciones
    FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

DROP TRIGGER IF EXISTS tg_cotizaciones_auditar ON comercial.cotizaciones;
CREATE TRIGGER tg_cotizaciones_auditar
    AFTER INSERT OR UPDATE OR DELETE ON comercial.cotizaciones
    FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

DROP TRIGGER IF EXISTS tg_cot_lineas_updated_at ON comercial.cotizacion_lineas;
CREATE TRIGGER tg_cot_lineas_updated_at
    BEFORE UPDATE ON comercial.cotizacion_lineas
    FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

DROP TRIGGER IF EXISTS tg_cot_lineas_auditar ON comercial.cotizacion_lineas;
CREATE TRIGGER tg_cot_lineas_auditar
    AFTER INSERT OR UPDATE OR DELETE ON comercial.cotizacion_lineas
    FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

DROP TRIGGER IF EXISTS tg_cot_revisiones_auditar ON comercial.cotizacion_revisiones;
CREATE TRIGGER tg_cot_revisiones_auditar
    AFTER INSERT OR UPDATE OR DELETE ON comercial.cotizacion_revisiones
    FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();
