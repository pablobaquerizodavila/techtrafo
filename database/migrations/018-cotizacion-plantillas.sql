-- ===================================================================
-- Migration 018: Plantillas de cotizacion + flag de aprovisionamiento
--
-- Permite crear cotizaciones de forma automatica a partir de plantillas
-- pre-armadas con materia prima (bodega), mano de obra (h*tarifa),
-- servicios externos, transporte, etc.
--
-- Al generar la cotizacion, se verifica stock contra inventario.stock:
--   - Si hay stock suficiente -> linea normal
--   - Si no -> linea marcada con flag y tiempo de aprovisionamiento
-- ===================================================================

-- -------------------------------------------------------------------
-- Plantilla maestra
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comercial.cotizacion_plantillas (
  id                          BIGSERIAL PRIMARY KEY,
  codigo                      VARCHAR(30) UNIQUE NOT NULL,
  nombre                      VARCHAR(200) NOT NULL,
  descripcion                 TEXT,
  tipo_servicio               VARCHAR(20) NOT NULL
    CHECK (tipo_servicio IN ('reparacion','fabricacion','mantenimiento','otro')),
  capacidad_kva_min           INT,                    -- aplicabilidad opcional
  capacidad_kva_max           INT,
  margen_porcentaje_default   NUMERIC(5,2) NOT NULL DEFAULT 25.00,
  contingencia_porcentaje     NUMERIC(5,2) NOT NULL DEFAULT 5.00,    -- buffer imprevistos
  iva_porcentaje_default      NUMERIC(5,2) NOT NULL DEFAULT 15.00,
  tiempo_entrega_base_dias    INT NOT NULL DEFAULT 30,               -- sin contar aprovisionamiento
  condiciones_pago_default    TEXT,
  observaciones_default       TEXT,
  activo                      BOOLEAN NOT NULL DEFAULT TRUE,
  creado_por                  UUID REFERENCES core.usuarios(id),
  actualizado_por             UUID REFERENCES core.usuarios(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cot_plantillas_tipo
  ON comercial.cotizacion_plantillas(tipo_servicio, activo);

CREATE TRIGGER trg_cot_plantillas_updated
  BEFORE UPDATE ON comercial.cotizacion_plantillas
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

CREATE TRIGGER trg_cot_plantillas_audit
  AFTER INSERT OR UPDATE OR DELETE ON comercial.cotizacion_plantillas
  FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

-- -------------------------------------------------------------------
-- Componentes de la plantilla (las "lineas" que se materializan en cotizacion_lineas)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comercial.plantilla_componentes (
  id                          BIGSERIAL PRIMARY KEY,
  plantilla_id                BIGINT NOT NULL REFERENCES comercial.cotizacion_plantillas(id) ON DELETE CASCADE,
  orden                       INT NOT NULL DEFAULT 1,
  -- Categoria conceptual del costo
  categoria                   VARCHAR(30) NOT NULL DEFAULT 'materia_prima'
    CHECK (categoria IN (
      'materia_prima','consumible','mano_obra','servicio_externo',
      'ensayo','transporte','documentacion','garantia','indirecto','imprevisto','otro'
    )),
  -- Si esta linea proviene de bodega, item_id apunta al item maestro.
  -- En ese caso, al materializar se valida stock y se override precio
  -- desde inventario.items si corresponde.
  item_id                     BIGINT REFERENCES inventario.items(id),
  descripcion                 VARCHAR(500) NOT NULL,
  cantidad_default            NUMERIC(14,4) NOT NULL DEFAULT 1,
  unidad_medida               VARCHAR(20) NOT NULL DEFAULT 'unid',
  precio_unitario_default     NUMERIC(14,4) NOT NULL DEFAULT 0,      -- usado si no hay item_id
  costo_unitario_default      NUMERIC(14,4),                          -- costo interno (margen)
  -- Cuando este componente apunta a bodega y NO hay stock suficiente,
  -- cuanto tiempo (dias) toma traerlo. Editable por categoria/item.
  tiempo_aprovisionamiento_default INT NOT NULL DEFAULT 0,
  notas                       TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plant_comp_plantilla
  ON comercial.plantilla_componentes(plantilla_id, orden);

CREATE TRIGGER trg_plant_comp_updated
  BEFORE UPDATE ON comercial.plantilla_componentes
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

-- -------------------------------------------------------------------
-- Columnas en cotizacion_lineas para tracking de aprovisionamiento
-- -------------------------------------------------------------------
ALTER TABLE comercial.cotizacion_lineas
  ADD COLUMN IF NOT EXISTS pendiente_aprovisionamiento BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tiempo_aprovisionamiento_dias INT,
  ADD COLUMN IF NOT EXISTS categoria VARCHAR(30);

COMMENT ON COLUMN comercial.cotizacion_lineas.pendiente_aprovisionamiento IS
  'TRUE si al generar la cotizacion desde plantilla, no habia stock suficiente en bodega';
COMMENT ON COLUMN comercial.cotizacion_lineas.tiempo_aprovisionamiento_dias IS
  'Dias estimados para conseguir el item si pendiente_aprovisionamiento=TRUE';
COMMENT ON COLUMN comercial.cotizacion_lineas.categoria IS
  'Categoria heredada de la plantilla: materia_prima | mano_obra | servicio_externo | etc.';

-- -------------------------------------------------------------------
-- Tracking de origen en cotizaciones (opcional, util para auditoria)
-- -------------------------------------------------------------------
ALTER TABLE comercial.cotizaciones
  ADD COLUMN IF NOT EXISTS plantilla_id BIGINT REFERENCES comercial.cotizacion_plantillas(id),
  ADD COLUMN IF NOT EXISTS contingencia_porcentaje NUMERIC(5,2);

COMMENT ON COLUMN comercial.cotizaciones.plantilla_id IS
  'Si la cotizacion fue generada desde plantilla, referencia a la plantilla origen';
