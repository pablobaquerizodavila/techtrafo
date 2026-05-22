-- ===================================================================
-- TECHTRAFO - Migracion 003: Schema inventario - Bodega
-- ===================================================================
-- Version: 0.3.0
-- Fecha: 2026-05-22
-- Ejecutado en produccion: no
-- Reversible: no (solo IF NOT EXISTS, idempotente)
--
-- Contenido:
--   - Schema inventario (catalogo, lotes, series, stock, movimientos)
--   - 7 tablas: categorias_item, ubicaciones, items, lotes, series,
--               stock, movimientos_stock
--   - Funcion inventario.fn_aplicar_movimiento_stock() (trigger)
--     mantiene la tabla stock al INSERT en movimientos_stock
--   - Movimientos inmutables (solo INSERT): correcciones via ajuste contrario
--   - Stock con CHECK (cantidad >= 0) para evitar negativos silenciosos
-- ===================================================================

CREATE SCHEMA IF NOT EXISTS inventario;

-- -------------------------------------------------------------------
-- Tabla: categorias_item
-- Clasificacion plana: aceite, nucleos, bobinados, herrajes, accesorios,
-- herramientas, materiales menores, servicios, productos terminados...
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventario.categorias_item (
    id              BIGSERIAL PRIMARY KEY,
    codigo          VARCHAR(20) UNIQUE,
    nombre          VARCHAR(100) NOT NULL,
    descripcion     TEXT,
    estado          VARCHAR(20) DEFAULT 'activo'
                    CHECK (estado IN ('activo','inactivo')),
    creado_por      UUID REFERENCES core.usuarios(id),
    actualizado_por UUID REFERENCES core.usuarios(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------------------
-- Tabla: ubicaciones
-- Lugares fisicos: bodega principal, bodega obra, area QC, transito
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventario.ubicaciones (
    id              BIGSERIAL PRIMARY KEY,
    codigo          VARCHAR(20) UNIQUE NOT NULL,
    nombre          VARCHAR(100) NOT NULL,
    descripcion     TEXT,
    tipo            VARCHAR(20) DEFAULT 'bodega'
                    CHECK (tipo IN ('bodega','area_produccion','area_qc','transito','obra')),
    estado          VARCHAR(20) DEFAULT 'activo'
                    CHECK (estado IN ('activo','inactivo')),
    creado_por      UUID REFERENCES core.usuarios(id),
    actualizado_por UUID REFERENCES core.usuarios(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------------------
-- Tabla: items
-- Catalogo maestro. Flags definen como se controla cada item:
--   - controla_stock=false  -> servicios (no inventariables)
--   - controla_lote=true    -> aceite, aislantes (con caducidad)
--   - controla_serie=true   -> trafos terminados (cada unidad unica)
-- lote y serie son mutuamente excluyentes en este negocio.
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventario.items (
    id                  BIGSERIAL PRIMARY KEY,
    codigo_interno      VARCHAR(50) UNIQUE NOT NULL,
    categoria_id        BIGINT NOT NULL REFERENCES inventario.categorias_item(id),
    nombre              VARCHAR(200) NOT NULL,
    descripcion         TEXT,
    tipo_item           VARCHAR(30) NOT NULL
                        CHECK (tipo_item IN ('insumo','componente','herramienta','servicio','producto_terminado')),
    unidad_medida       VARCHAR(20) NOT NULL DEFAULT 'unid',
    controla_stock      BOOLEAN DEFAULT TRUE,
    controla_lote       BOOLEAN DEFAULT FALSE,
    controla_serie      BOOLEAN DEFAULT FALSE,
    costo_referencia    NUMERIC(14,2) DEFAULT 0,
    precio_referencia   NUMERIC(14,2) DEFAULT 0,
    stock_minimo        NUMERIC(14,3) DEFAULT 0,
    stock_maximo        NUMERIC(14,3) DEFAULT 0,
    punto_reorden       NUMERIC(14,3) DEFAULT 0,
    proveedor_preferido VARCHAR(200),  -- texto libre hasta que exista schema compras
    peso_kg             NUMERIC(10,3),
    notas               TEXT,
    estado              VARCHAR(20) DEFAULT 'activo'
                        CHECK (estado IN ('activo','inactivo','descontinuado')),
    creado_por          UUID REFERENCES core.usuarios(id),
    actualizado_por     UUID REFERENCES core.usuarios(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    CHECK (NOT (controla_lote AND controla_serie))
);

-- -------------------------------------------------------------------
-- Tabla: lotes
-- Para items con controla_lote=true. Trazabilidad de aceite/aislantes
-- con fecha de vencimiento para alertas.
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventario.lotes (
    id                  BIGSERIAL PRIMARY KEY,
    item_id             BIGINT NOT NULL REFERENCES inventario.items(id),
    numero_lote         VARCHAR(80) NOT NULL,
    proveedor           VARCHAR(200),
    fecha_ingreso       DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_vencimiento   DATE,
    observaciones       TEXT,
    estado              VARCHAR(20) DEFAULT 'activo'
                        CHECK (estado IN ('activo','agotado','vencido','bloqueado')),
    creado_por          UUID REFERENCES core.usuarios(id),
    actualizado_por     UUID REFERENCES core.usuarios(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (item_id, numero_lote)
);

-- -------------------------------------------------------------------
-- Tabla: series
-- Para items con controla_serie=true (trafos terminados).
-- Cada unidad fabricada tiene numero de serie unico por item.
-- ot_id_origen referencia la OT que la produjo; FK se anade en 006.
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventario.series (
    id                  BIGSERIAL PRIMARY KEY,
    item_id             BIGINT NOT NULL REFERENCES inventario.items(id),
    numero_serie        VARCHAR(80) NOT NULL,
    fecha_fabricacion   DATE,
    ot_id_origen        BIGINT,  -- FK pendiente hasta migration 006
    observaciones       TEXT,
    estado              VARCHAR(20) DEFAULT 'en_stock'
                        CHECK (estado IN ('en_stock','reservado','entregado','en_garantia','retirado')),
    creado_por          UUID REFERENCES core.usuarios(id),
    actualizado_por     UUID REFERENCES core.usuarios(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (item_id, numero_serie)
);

-- -------------------------------------------------------------------
-- Tabla: stock
-- Nivel actual por (item, ubicacion, lote). Mantenida automaticamente
-- por trigger sobre movimientos_stock. NO modificar directamente.
-- UNIQUE NULLS NOT DISTINCT trata lote_id NULL como un valor unico
-- (PostgreSQL 15+); permite ON CONFLICT con lote_id NULL.
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventario.stock (
    id              BIGSERIAL PRIMARY KEY,
    item_id         BIGINT NOT NULL REFERENCES inventario.items(id),
    ubicacion_id    BIGINT NOT NULL REFERENCES inventario.ubicaciones(id),
    lote_id         BIGINT REFERENCES inventario.lotes(id),
    cantidad        NUMERIC(14,3) NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    CHECK (cantidad >= 0),
    UNIQUE NULLS NOT DISTINCT (item_id, ubicacion_id, lote_id)
);

-- -------------------------------------------------------------------
-- Tabla: movimientos_stock
-- Fuente de verdad del histórico de bodega. Inmutable: solo INSERT.
-- Correcciones via movimiento de ajuste contrario.
-- Reglas de coherencia segun tipo:
--   entrada / ajuste_positivo  -> destino obligatorio, origen NULL
--   salida  / ajuste_negativo  -> origen obligatorio, destino NULL
--   transferencia              -> ambas obligatorias
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventario.movimientos_stock (
    id                      BIGSERIAL PRIMARY KEY,
    fecha                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tipo                    VARCHAR(30) NOT NULL
                            CHECK (tipo IN ('entrada','salida','ajuste_positivo','ajuste_negativo','transferencia')),
    item_id                 BIGINT NOT NULL REFERENCES inventario.items(id),
    ubicacion_origen_id     BIGINT REFERENCES inventario.ubicaciones(id),
    ubicacion_destino_id    BIGINT REFERENCES inventario.ubicaciones(id),
    lote_id                 BIGINT REFERENCES inventario.lotes(id),
    serie_id                BIGINT REFERENCES inventario.series(id),
    cantidad                NUMERIC(14,3) NOT NULL CHECK (cantidad > 0),
    costo_unitario          NUMERIC(14,2),
    referencia_tipo         VARCHAR(30)
                            CHECK (referencia_tipo IS NULL OR
                                   referencia_tipo IN ('compra','ot','devolucion','inventario_fisico','manual')),
    referencia_id           BIGINT,
    motivo                  TEXT,
    observaciones           TEXT,
    usuario_id              UUID REFERENCES core.usuarios(id),
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    CHECK (
        (tipo IN ('entrada','ajuste_positivo')
            AND ubicacion_destino_id IS NOT NULL
            AND ubicacion_origen_id IS NULL)
     OR (tipo IN ('salida','ajuste_negativo')
            AND ubicacion_origen_id IS NOT NULL
            AND ubicacion_destino_id IS NULL)
     OR (tipo = 'transferencia'
            AND ubicacion_origen_id IS NOT NULL
            AND ubicacion_destino_id IS NOT NULL)
    )
);

-- -------------------------------------------------------------------
-- Funcion: fn_aplicar_movimiento_stock
-- Trigger AFTER INSERT en movimientos_stock que mantiene stock.
-- Si el item no controla_stock (ej. servicios), no hace nada.
-- Si la salida deja stock < 0, el CHECK de stock dispara y rollback.
-- -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION inventario.fn_aplicar_movimiento_stock()
RETURNS TRIGGER AS $$
DECLARE
    v_controla_stock BOOLEAN;
BEGIN
    SELECT controla_stock INTO v_controla_stock
      FROM inventario.items
     WHERE id = NEW.item_id;

    IF NOT v_controla_stock THEN
        RETURN NEW;
    END IF;

    IF NEW.tipo IN ('entrada','ajuste_positivo') THEN
        INSERT INTO inventario.stock (item_id, ubicacion_id, lote_id, cantidad, updated_at)
        VALUES (NEW.item_id, NEW.ubicacion_destino_id, NEW.lote_id, NEW.cantidad, NOW())
        ON CONFLICT (item_id, ubicacion_id, lote_id) DO UPDATE
            SET cantidad   = inventario.stock.cantidad + EXCLUDED.cantidad,
                updated_at = NOW();

    ELSIF NEW.tipo IN ('salida','ajuste_negativo') THEN
        UPDATE inventario.stock
           SET cantidad   = cantidad - NEW.cantidad,
               updated_at = NOW()
         WHERE item_id      = NEW.item_id
           AND ubicacion_id = NEW.ubicacion_origen_id
           AND lote_id IS NOT DISTINCT FROM NEW.lote_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'No existe stock para item % en ubicacion % (lote %)',
                NEW.item_id, NEW.ubicacion_origen_id, NEW.lote_id;
        END IF;

    ELSIF NEW.tipo = 'transferencia' THEN
        UPDATE inventario.stock
           SET cantidad   = cantidad - NEW.cantidad,
               updated_at = NOW()
         WHERE item_id      = NEW.item_id
           AND ubicacion_id = NEW.ubicacion_origen_id
           AND lote_id IS NOT DISTINCT FROM NEW.lote_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'No existe stock para transferir item % desde ubicacion % (lote %)',
                NEW.item_id, NEW.ubicacion_origen_id, NEW.lote_id;
        END IF;

        INSERT INTO inventario.stock (item_id, ubicacion_id, lote_id, cantidad, updated_at)
        VALUES (NEW.item_id, NEW.ubicacion_destino_id, NEW.lote_id, NEW.cantidad, NOW())
        ON CONFLICT (item_id, ubicacion_id, lote_id) DO UPDATE
            SET cantidad   = inventario.stock.cantidad + EXCLUDED.cantidad,
                updated_at = NOW();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -------------------------------------------------------------------
-- Indices
-- -------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_items_codigo            ON inventario.items(codigo_interno);
CREATE INDEX IF NOT EXISTS idx_items_categoria         ON inventario.items(categoria_id);
CREATE INDEX IF NOT EXISTS idx_items_tipo              ON inventario.items(tipo_item);
CREATE INDEX IF NOT EXISTS idx_items_estado            ON inventario.items(estado);
CREATE INDEX IF NOT EXISTS idx_lotes_item              ON inventario.lotes(item_id);
CREATE INDEX IF NOT EXISTS idx_lotes_vencimiento       ON inventario.lotes(fecha_vencimiento)
                                                       WHERE fecha_vencimiento IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_series_item             ON inventario.series(item_id);
CREATE INDEX IF NOT EXISTS idx_series_numero           ON inventario.series(numero_serie);
CREATE INDEX IF NOT EXISTS idx_series_estado           ON inventario.series(estado);
CREATE INDEX IF NOT EXISTS idx_stock_item              ON inventario.stock(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_ubicacion         ON inventario.stock(ubicacion_id);
CREATE INDEX IF NOT EXISTS idx_mov_item_fecha          ON inventario.movimientos_stock(item_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_mov_tipo_fecha          ON inventario.movimientos_stock(tipo, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_mov_ubic_origen         ON inventario.movimientos_stock(ubicacion_origen_id, fecha DESC)
                                                       WHERE ubicacion_origen_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mov_ubic_destino        ON inventario.movimientos_stock(ubicacion_destino_id, fecha DESC)
                                                       WHERE ubicacion_destino_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mov_referencia          ON inventario.movimientos_stock(referencia_tipo, referencia_id)
                                                       WHERE referencia_tipo IS NOT NULL;

-- -------------------------------------------------------------------
-- Triggers de updated_at y auditoria (en tablas mutables)
-- -------------------------------------------------------------------
DROP TRIGGER IF EXISTS tg_categorias_updated_at ON inventario.categorias_item;
CREATE TRIGGER tg_categorias_updated_at
    BEFORE UPDATE ON inventario.categorias_item
    FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

DROP TRIGGER IF EXISTS tg_categorias_auditar ON inventario.categorias_item;
CREATE TRIGGER tg_categorias_auditar
    AFTER INSERT OR UPDATE OR DELETE ON inventario.categorias_item
    FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

DROP TRIGGER IF EXISTS tg_ubicaciones_updated_at ON inventario.ubicaciones;
CREATE TRIGGER tg_ubicaciones_updated_at
    BEFORE UPDATE ON inventario.ubicaciones
    FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

DROP TRIGGER IF EXISTS tg_ubicaciones_auditar ON inventario.ubicaciones;
CREATE TRIGGER tg_ubicaciones_auditar
    AFTER INSERT OR UPDATE OR DELETE ON inventario.ubicaciones
    FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

DROP TRIGGER IF EXISTS tg_items_updated_at ON inventario.items;
CREATE TRIGGER tg_items_updated_at
    BEFORE UPDATE ON inventario.items
    FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

DROP TRIGGER IF EXISTS tg_items_auditar ON inventario.items;
CREATE TRIGGER tg_items_auditar
    AFTER INSERT OR UPDATE OR DELETE ON inventario.items
    FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

DROP TRIGGER IF EXISTS tg_lotes_updated_at ON inventario.lotes;
CREATE TRIGGER tg_lotes_updated_at
    BEFORE UPDATE ON inventario.lotes
    FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

DROP TRIGGER IF EXISTS tg_lotes_auditar ON inventario.lotes;
CREATE TRIGGER tg_lotes_auditar
    AFTER INSERT OR UPDATE OR DELETE ON inventario.lotes
    FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

DROP TRIGGER IF EXISTS tg_series_updated_at ON inventario.series;
CREATE TRIGGER tg_series_updated_at
    BEFORE UPDATE ON inventario.series
    FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

DROP TRIGGER IF EXISTS tg_series_auditar ON inventario.series;
CREATE TRIGGER tg_series_auditar
    AFTER INSERT OR UPDATE OR DELETE ON inventario.series
    FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

-- Stock: solo updated_at (no se audita, su histórico vive en movimientos_stock)
-- Movimientos: solo auditoria (no se actualiza, es inmutable)

DROP TRIGGER IF EXISTS tg_movimientos_auditar ON inventario.movimientos_stock;
CREATE TRIGGER tg_movimientos_auditar
    AFTER INSERT OR UPDATE OR DELETE ON inventario.movimientos_stock
    FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

DROP TRIGGER IF EXISTS tg_movimientos_aplicar_stock ON inventario.movimientos_stock;
CREATE TRIGGER tg_movimientos_aplicar_stock
    AFTER INSERT ON inventario.movimientos_stock
    FOR EACH ROW EXECUTE FUNCTION inventario.fn_aplicar_movimiento_stock();
