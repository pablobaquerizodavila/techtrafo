-- ===================================================================
-- TECHTRAFO - Migracion 005: Contratos (schema comercial)
-- ===================================================================
-- Version: 0.3.0
-- Fecha: 2026-05-22
-- Ejecutado en produccion: no
-- Reversible: no (solo IF NOT EXISTS, idempotente)
--
-- Contenido:
--   - 2 tablas en comercial: contratos, contrato_pagos
--   - contratos nace de una cotizacion aprobada (FK NOT NULL)
--   - contrato_pagos unifica anticipos, hitos y saldo (columna tipo)
--   - Hitos pueden tener condicion_disparo (fecha, manual, gate, OT)
--   - monto_pagado se actualiza desde modulo caja (futuro)
-- ===================================================================

-- Schema comercial ya existe.

-- -------------------------------------------------------------------
-- Tabla: contratos
-- Cabecera. Nace al aprobar una cotizacion.
-- cliente_id se duplica respecto a cotizacion.cliente_id para queries
-- rapidas; consistencia la garantiza la app (mismo cliente al convertir).
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comercial.contratos (
    id                  BIGSERIAL PRIMARY KEY,
    codigo              VARCHAR(30) UNIQUE,
    cotizacion_id       BIGINT NOT NULL REFERENCES comercial.cotizaciones(id),
    cliente_id          BIGINT NOT NULL REFERENCES comercial.clientes(id),
    fecha_firma         DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_inicio        DATE,
    fecha_fin_estimada  DATE,
    fecha_fin_real      DATE,
    moneda              VARCHAR(3) NOT NULL DEFAULT 'USD',
    monto_total         NUMERIC(14,2) NOT NULL CHECK (monto_total >= 0),
    plan_pago_tipo      VARCHAR(30) NOT NULL DEFAULT 'anticipo_y_saldo'
                        CHECK (plan_pago_tipo IN ('anticipo_y_saldo','hitos','mensual','contado','otro')),
    estado              VARCHAR(20) NOT NULL DEFAULT 'vigente'
                        CHECK (estado IN ('vigente','suspendido','completado','cancelado')),
    observaciones       TEXT,
    notas_internas      TEXT,
    firmado_por         UUID REFERENCES core.usuarios(id),
    creado_por          UUID REFERENCES core.usuarios(id),
    actualizado_por     UUID REFERENCES core.usuarios(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    CHECK (fecha_inicio IS NULL OR fecha_inicio >= fecha_firma),
    CHECK (fecha_fin_estimada IS NULL OR fecha_inicio IS NULL OR fecha_fin_estimada >= fecha_inicio),
    -- Un contrato por cotizacion (regla de negocio: 1 cotizacion aprobada -> 1 contrato)
    UNIQUE (cotizacion_id)
);

-- -------------------------------------------------------------------
-- Tabla: contrato_pagos
-- Cronograma de pagos del contrato. Unifica anticipos, hitos y saldo.
-- monto_pagado se va actualizando conforme se cobran los pagos
-- (manual al inicio; integrado con caja en fase posterior).
-- condicion_disparo aplica principalmente a tipo='hito'.
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comercial.contrato_pagos (
    id                  BIGSERIAL PRIMARY KEY,
    contrato_id         BIGINT NOT NULL REFERENCES comercial.contratos(id) ON DELETE CASCADE,
    numero              INT NOT NULL,
    tipo                VARCHAR(20) NOT NULL
                        CHECK (tipo IN ('anticipo','hito','saldo')),
    descripcion         TEXT,
    condicion_disparo   VARCHAR(30)
                        CHECK (condicion_disparo IS NULL OR
                               condicion_disparo IN ('fecha_fija','manual','al_completar_ot','al_pasar_gate','al_entregar')),
    fecha_esperada      DATE,
    monto_porcentaje    NUMERIC(5,2)
                        CHECK (monto_porcentaje IS NULL OR (monto_porcentaje > 0 AND monto_porcentaje <= 100)),
    monto_estipulado    NUMERIC(14,2) NOT NULL CHECK (monto_estipulado >= 0),
    monto_pagado        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (monto_pagado >= 0),
    fecha_pagado        DATE,
    referencia_pago     VARCHAR(200),
    estado              VARCHAR(20) NOT NULL DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente','parcial','pagado','vencido','cancelado')),
    observaciones       TEXT,
    creado_por          UUID REFERENCES core.usuarios(id),
    actualizado_por     UUID REFERENCES core.usuarios(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (contrato_id, numero),
    -- pagado no puede superar estipulado
    CHECK (monto_pagado <= monto_estipulado),
    -- si estado=pagado, monto_pagado debe igualar estipulado y fecha_pagado NOT NULL
    CHECK (
        (estado <> 'pagado')
     OR (estado = 'pagado' AND monto_pagado = monto_estipulado AND fecha_pagado IS NOT NULL)
    )
);

-- -------------------------------------------------------------------
-- Indices
-- -------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_contratos_cliente        ON comercial.contratos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_contratos_cotizacion     ON comercial.contratos(cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_contratos_estado         ON comercial.contratos(estado);
CREATE INDEX IF NOT EXISTS idx_contratos_codigo         ON comercial.contratos(codigo);
CREATE INDEX IF NOT EXISTS idx_contratos_fecha_firma    ON comercial.contratos(fecha_firma DESC);
CREATE INDEX IF NOT EXISTS idx_contrato_pagos_contrato  ON comercial.contrato_pagos(contrato_id);
CREATE INDEX IF NOT EXISTS idx_contrato_pagos_estado    ON comercial.contrato_pagos(estado);
CREATE INDEX IF NOT EXISTS idx_contrato_pagos_esperada  ON comercial.contrato_pagos(fecha_esperada)
                                                        WHERE fecha_esperada IS NOT NULL AND estado <> 'pagado';

-- -------------------------------------------------------------------
-- Triggers
-- -------------------------------------------------------------------
DROP TRIGGER IF EXISTS tg_contratos_updated_at ON comercial.contratos;
CREATE TRIGGER tg_contratos_updated_at
    BEFORE UPDATE ON comercial.contratos
    FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

DROP TRIGGER IF EXISTS tg_contratos_auditar ON comercial.contratos;
CREATE TRIGGER tg_contratos_auditar
    AFTER INSERT OR UPDATE OR DELETE ON comercial.contratos
    FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

DROP TRIGGER IF EXISTS tg_contrato_pagos_updated_at ON comercial.contrato_pagos;
CREATE TRIGGER tg_contrato_pagos_updated_at
    BEFORE UPDATE ON comercial.contrato_pagos
    FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

DROP TRIGGER IF EXISTS tg_contrato_pagos_auditar ON comercial.contrato_pagos;
CREATE TRIGGER tg_contrato_pagos_auditar
    AFTER INSERT OR UPDATE OR DELETE ON comercial.contrato_pagos
    FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();
