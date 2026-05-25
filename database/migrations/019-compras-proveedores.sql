-- ===================================================================
-- Migration 019: Modulo de Compras (Fase 1) — Proveedores + item_proveedores
--
-- Crea el schema `compras` con la tabla maestra de proveedores y la
-- relacion N:N item <-> proveedor (con precio y tiempo de entrega
-- vigentes). Tambien:
--   - Roles nuevos: jefe_compras, comprador
--   - items.proveedor_principal_id FK opcional a compras.proveedores
--     (el campo texto items.proveedor_preferido se mantiene como fallback)
-- ===================================================================

CREATE SCHEMA IF NOT EXISTS compras;
GRANT USAGE ON SCHEMA compras TO techtrafo_admin;

-- -------------------------------------------------------------------
-- Proveedores
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS compras.proveedores (
  id                          BIGSERIAL PRIMARY KEY,
  codigo                      VARCHAR(30) UNIQUE NOT NULL,           -- PRV-YYYY-NNNN
  razon_social                VARCHAR(200) NOT NULL,
  nombre_comercial            VARCHAR(200),
  ruc                         VARCHAR(20),                            -- identificacion fiscal
  pais                        VARCHAR(80) NOT NULL DEFAULT 'Ecuador',
  ciudad                      VARCHAR(120),
  direccion                   TEXT,

  -- Contacto principal
  contacto_nombre             VARCHAR(150),
  contacto_cargo              VARCHAR(120),
  contacto_email              VARCHAR(255),
  contacto_telefono           VARCHAR(40),
  sitio_web                   VARCHAR(255),

  -- Condiciones comerciales default (puede override por OC)
  condiciones_pago_default    VARCHAR(120),                           -- 'contado', 'credito 30 dias', 'anticipo 50%'
  moneda_default              VARCHAR(3) NOT NULL DEFAULT 'USD',
  tiempo_entrega_default_dias INTEGER,                                -- promedio
  incoterm_default            VARCHAR(10),                            -- 'FOB','CIF','DAP', etc

  -- Certificaciones y capacidades
  certificaciones             TEXT,                                   -- texto libre: ISO 9001, IEC 60076, etc
  productos_que_suministra    TEXT,                                   -- texto libre para busqueda

  -- Calificacion historica (se calcula desde recepciones, default null)
  calificacion                NUMERIC(5,2),                           -- 0..100
  total_ordenes               INTEGER NOT NULL DEFAULT 0,
  total_entregas_atiempo      INTEGER NOT NULL DEFAULT 0,
  total_no_conformidades      INTEGER NOT NULL DEFAULT 0,

  observaciones               TEXT,
  estado                      VARCHAR(20) NOT NULL DEFAULT 'activo'
    CHECK (estado IN ('activo','inactivo','bloqueado')),

  creado_por                  UUID REFERENCES core.usuarios(id),
  actualizado_por             UUID REFERENCES core.usuarios(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proveedores_estado    ON compras.proveedores(estado);
CREATE INDEX IF NOT EXISTS idx_proveedores_razon     ON compras.proveedores(LOWER(razon_social));
CREATE INDEX IF NOT EXISTS idx_proveedores_ruc       ON compras.proveedores(ruc) WHERE ruc IS NOT NULL;

CREATE TRIGGER tg_proveedores_updated_at
  BEFORE UPDATE ON compras.proveedores
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

CREATE TRIGGER tg_proveedores_auditar
  AFTER INSERT OR UPDATE OR DELETE ON compras.proveedores
  FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

COMMENT ON TABLE compras.proveedores IS
  'Catalogo maestro de proveedores. Estado controla disponibilidad para nuevas OCs.';

-- -------------------------------------------------------------------
-- Relacion item <-> proveedor (precio + tiempo de entrega vigentes)
-- El historial de precios se guarda en migration 020.
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS compras.item_proveedores (
  id                       BIGSERIAL PRIMARY KEY,
  item_id                  BIGINT NOT NULL REFERENCES inventario.items(id) ON DELETE CASCADE,
  proveedor_id             BIGINT NOT NULL REFERENCES compras.proveedores(id) ON DELETE CASCADE,

  -- Precio y condiciones vigentes con este proveedor
  precio_unitario          NUMERIC(14,4) NOT NULL DEFAULT 0,
  moneda                   VARCHAR(3) NOT NULL DEFAULT 'USD',
  unidad_medida            VARCHAR(20) NOT NULL DEFAULT 'unid',
  cantidad_minima_orden    NUMERIC(14,3) NOT NULL DEFAULT 1,
  tiempo_entrega_dias      INTEGER,                                  -- override del default del proveedor
  condiciones_pago         VARCHAR(120),
  incoterm                 VARCHAR(10),

  -- Referencia del proveedor (su propio codigo para este item)
  codigo_proveedor_item    VARCHAR(100),

  -- Si TRUE, este proveedor se usa por default al sugerir OC para este item
  es_principal             BOOLEAN NOT NULL DEFAULT FALSE,

  -- Vigencia de esta condicion comercial
  vigencia_desde           DATE NOT NULL DEFAULT CURRENT_DATE,
  vigencia_hasta           DATE,

  notas                    TEXT,

  creado_por               UUID REFERENCES core.usuarios(id),
  actualizado_por          UUID REFERENCES core.usuarios(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (item_id, proveedor_id)
);

CREATE INDEX IF NOT EXISTS idx_item_prov_item        ON compras.item_proveedores(item_id);
CREATE INDEX IF NOT EXISTS idx_item_prov_proveedor   ON compras.item_proveedores(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_item_prov_principal   ON compras.item_proveedores(item_id) WHERE es_principal = TRUE;

CREATE TRIGGER tg_item_proveedores_updated_at
  BEFORE UPDATE ON compras.item_proveedores
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

CREATE TRIGGER tg_item_proveedores_auditar
  AFTER INSERT OR UPDATE OR DELETE ON compras.item_proveedores
  FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

COMMENT ON TABLE compras.item_proveedores IS
  'Relacion N:N item <-> proveedor con precio, tiempo entrega y condiciones vigentes. '
  'es_principal indica el proveedor preferido para este item al generar OCs sugeridas.';

-- -------------------------------------------------------------------
-- Funcion que asegura un unico proveedor principal por item
-- -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION compras.fn_solo_un_proveedor_principal()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.es_principal IS TRUE THEN
    UPDATE compras.item_proveedores
       SET es_principal = FALSE
     WHERE item_id = NEW.item_id
       AND id <> NEW.id
       AND es_principal = TRUE;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER tg_item_prov_unico_principal
  AFTER INSERT OR UPDATE OF es_principal ON compras.item_proveedores
  FOR EACH ROW WHEN (NEW.es_principal = TRUE)
  EXECUTE FUNCTION compras.fn_solo_un_proveedor_principal();

-- -------------------------------------------------------------------
-- FK opcional en items.proveedor_principal_id apuntando a proveedores
-- (El campo texto items.proveedor_preferido se conserva como fallback
--  durante la migracion de datos. Una vez vaciado se puede borrar.)
-- -------------------------------------------------------------------
ALTER TABLE inventario.items
  ADD COLUMN IF NOT EXISTS proveedor_principal_id BIGINT
    REFERENCES compras.proveedores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_items_proveedor_principal
  ON inventario.items(proveedor_principal_id) WHERE proveedor_principal_id IS NOT NULL;

COMMENT ON COLUMN inventario.items.proveedor_principal_id IS
  'Proveedor preferido (FK). Reemplaza al texto proveedor_preferido. '
  'Si NULL, el sistema deduce el proveedor desde compras.item_proveedores(es_principal=TRUE).';

-- -------------------------------------------------------------------
-- Roles nuevos para el modulo de compras
-- -------------------------------------------------------------------
INSERT INTO core.roles (nombre, descripcion, permisos, activo)
VALUES
  ('jefe_compras',
   'Jefe de Compras — aprueba SC y OC dentro de su umbral, revisa proveedores, define condiciones',
   '{"compras": true, "compras.aprobar": true, "compras.recibir": true, "proveedores": true, "inventario.read": true, "cotizaciones.read": true, "expedientes.read": true}'::jsonb,
   TRUE),
  ('comprador',
   'Comprador — emite solicitudes y ordenes de compra, da seguimiento a proveedores',
   '{"compras": true, "compras.recibir": true, "proveedores.read": true, "proveedores.write": true, "inventario.read": true, "cotizaciones.read": true}'::jsonb,
   TRUE)
ON CONFLICT (nombre) DO NOTHING;

-- -------------------------------------------------------------------
-- Codigo automatico de proveedor: PRV-YYYY-NNNN
-- Reusa el patron de SPLIT_PART para evitar el bug BigInt + SUBSTRING
-- -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION compras.fn_generar_codigo_proveedor()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_anio TEXT := TO_CHAR(NOW(), 'YYYY');
  v_max  INT;
BEGIN
  IF NEW.codigo IS NOT NULL AND LENGTH(NEW.codigo) > 0 THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(MAX(SPLIT_PART(codigo, '-', 3)::INTEGER), 0)
    INTO v_max
    FROM compras.proveedores
   WHERE codigo LIKE 'PRV-' || v_anio || '-%';
  NEW.codigo := 'PRV-' || v_anio || '-' || LPAD((v_max + 1)::TEXT, 4, '0');
  RETURN NEW;
END
$$;

CREATE TRIGGER tg_proveedores_codigo
  BEFORE INSERT ON compras.proveedores
  FOR EACH ROW EXECUTE FUNCTION compras.fn_generar_codigo_proveedor();
