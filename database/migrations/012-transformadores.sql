-- ===================================================================
-- Migration 012: transformadores como entidad de primera clase
-- ===================================================================
-- Modela los transformadores reales que pertenecen a clientes y que
-- pasan por OT (reparacion, fabricacion, mantenimiento). Permite trazar
-- el historial completo de cada equipo: cuantas veces vino al taller,
-- por que, con que resultado.
--
-- Vinculos:
--   produccion.ot.transformador_id  -> que equipo se esta interviniendo
--   comercial.expedientes.transformador_id -> opcional, captura desde lead
--
-- Vista v_transformador_historial expone todas las OT por equipo.
-- ===================================================================

BEGIN;

-- -------------------------------------------------------------------
-- Tabla maestra
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS produccion.transformadores (
  id                    BIGSERIAL PRIMARY KEY,

  -- Identificacion
  codigo_interno        VARCHAR(30) UNIQUE,                   -- TRF-2026-0001 auto
  numero_serie          VARCHAR(100),                         -- serie del fabricante (puede repetirse entre marcas)
  marca                 VARCHAR(80),
  modelo                VARCHAR(100),

  -- Dueño actual
  cliente_id            BIGINT REFERENCES comercial.clientes(id) ON DELETE RESTRICT,

  -- Caracteristicas tecnicas
  tipo                  VARCHAR(30) NOT NULL DEFAULT 'distribucion'
                          CHECK (tipo IN ('distribucion','potencia','seco','aceite','pedestal','subestacion','especial')),
  capacidad_kva         INTEGER NOT NULL CHECK (capacidad_kva > 0),
  tension_primaria_kv   NUMERIC(8,3),                         -- ej 13.8, 22.86
  tension_secundaria_v  INTEGER,                              -- ej 220, 480
  conexion              VARCHAR(20),                          -- ej Dyn5, Yyn0
  grupo_vectorial       VARCHAR(20),                          -- ej Yyn0d5
  numero_fases          SMALLINT CHECK (numero_fases IN (1,3)),
  frecuencia_hz         SMALLINT CHECK (frecuencia_hz IS NULL OR frecuencia_hz IN (50,60)),
  refrigeracion         VARCHAR(20),                          -- ej ONAN, ONAF, AN

  -- Dimensiones / peso
  peso_kg               NUMERIC(10,2),
  ancho_mm              INTEGER,
  alto_mm               INTEGER,
  profundidad_mm        INTEGER,

  -- Ciclo de vida
  anio_fabricacion      INTEGER CHECK (anio_fabricacion IS NULL OR (anio_fabricacion BETWEEN 1900 AND 2200)),
  fecha_puesta_servicio DATE,
  ubicacion_actual      VARCHAR(200),                         -- sitio donde esta instalado
  estado                VARCHAR(20) NOT NULL DEFAULT 'en_servicio'
                          CHECK (estado IN ('en_servicio','en_taller','en_almacen','fuera_de_servicio','dado_de_baja')),

  observaciones         TEXT,
  notas_internas        TEXT,

  -- Auditoria
  creado_por            UUID REFERENCES core.usuarios(id),
  actualizado_por       UUID REFERENCES core.usuarios(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),

  -- Unicidad por marca+serie (si ambos vienen)
  CONSTRAINT transformadores_marca_serie_unq UNIQUE (marca, numero_serie) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS idx_trf_cliente   ON produccion.transformadores(cliente_id);
CREATE INDEX IF NOT EXISTS idx_trf_estado    ON produccion.transformadores(estado);
CREATE INDEX IF NOT EXISTS idx_trf_tipo      ON produccion.transformadores(tipo);
CREATE INDEX IF NOT EXISTS idx_trf_capacidad ON produccion.transformadores(capacidad_kva);
CREATE INDEX IF NOT EXISTS idx_trf_serie     ON produccion.transformadores(numero_serie) WHERE numero_serie IS NOT NULL;

DROP TRIGGER IF EXISTS tg_trf_updated_at ON produccion.transformadores;
CREATE TRIGGER tg_trf_updated_at
  BEFORE UPDATE ON produccion.transformadores
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

DROP TRIGGER IF EXISTS tg_trf_auditar ON produccion.transformadores;
CREATE TRIGGER tg_trf_auditar
  AFTER INSERT OR UPDATE OR DELETE ON produccion.transformadores
  FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

-- -------------------------------------------------------------------
-- FK desde OT y expedientes (nullable para no romper datos historicos)
-- -------------------------------------------------------------------
ALTER TABLE produccion.ot
  ADD COLUMN IF NOT EXISTS transformador_id BIGINT
  REFERENCES produccion.transformadores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ot_transformador ON produccion.ot(transformador_id) WHERE transformador_id IS NOT NULL;

ALTER TABLE comercial.expedientes
  ADD COLUMN IF NOT EXISTS transformador_id BIGINT
  REFERENCES produccion.transformadores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_exp_transformador ON comercial.expedientes(transformador_id) WHERE transformador_id IS NOT NULL;

-- -------------------------------------------------------------------
-- Vista: historial completo de OT por transformador
-- Util para mostrar "este equipo entro 5 veces, ultima por reparacion
-- con motivo X" en la ficha del transformador.
-- -------------------------------------------------------------------
CREATE OR REPLACE VIEW produccion.v_transformador_historial AS
  SELECT
    t.id                          AS transformador_id,
    t.codigo_interno              AS transformador_codigo,
    t.marca, t.modelo, t.capacidad_kva, t.tipo,
    ot.id                         AS ot_id,
    ot.codigo                     AS ot_codigo,
    ot.tipo_ruta                  AS ot_tipo,
    ot.estado                     AS ot_estado,
    ot.prioridad                  AS ot_prioridad,
    ot.fecha_inicio_real,
    ot.fecha_fin_real,
    ot.fecha_fin_planeada,
    ot.descripcion                AS ot_descripcion,
    c.codigo                      AS contrato_codigo,
    cl.razon_social               AS cliente_nombre,
    EXTRACT(EPOCH FROM (COALESCE(ot.fecha_fin_real, NOW()) - ot.fecha_inicio_real)) / 86400 AS duracion_dias
  FROM produccion.transformadores t
  JOIN produccion.ot ot ON ot.transformador_id = t.id
  LEFT JOIN comercial.contratos c ON c.id = ot.contrato_id
  LEFT JOIN comercial.clientes cl ON cl.id = c.cliente_id
  ORDER BY t.id, ot.created_at DESC;

-- -------------------------------------------------------------------
-- Seed minimo: 2 transformadores de demo asociados a PETROECUADOR
-- para que el dashboard tenga capacidad real desde el primer momento.
-- Si no existe el cliente, no inserta nada (DO NOTHING).
-- -------------------------------------------------------------------
DO $$
DECLARE
  v_cliente_id BIGINT;
  v_trf1_id    BIGINT;
  v_trf2_id    BIGINT;
BEGIN
  SELECT id INTO v_cliente_id FROM comercial.clientes WHERE razon_social ILIKE '%PETROECUADOR%' LIMIT 1;
  IF v_cliente_id IS NULL THEN
    RAISE NOTICE 'Cliente PETROECUADOR no encontrado, omitiendo seed de transformadores';
    RETURN;
  END IF;

  -- Trafo 1: 500 kVA de distribucion (asociado a OT-2026-0001 reparacion)
  INSERT INTO produccion.transformadores (
    codigo_interno, numero_serie, marca, modelo, cliente_id,
    tipo, capacidad_kva, tension_primaria_kv, tension_secundaria_v,
    conexion, numero_fases, frecuencia_hz, refrigeracion,
    anio_fabricacion, ubicacion_actual, estado, observaciones
  ) VALUES (
    'TRF-2026-0001', 'SI-857412', 'Siemens', 'TPV-500', v_cliente_id,
    'distribucion', 500, 13.8, 480, 'Dyn5', 3, 60, 'ONAN',
    2018, 'Subestacion Refineria Esmeraldas', 'en_taller',
    'Equipo recibido para reparacion de bobinado primario'
  )
  ON CONFLICT (codigo_interno) DO NOTHING
  RETURNING id INTO v_trf1_id;

  -- Trafo 2: 1 MVA de potencia (asociado a OT-2026-0002 fabricacion)
  INSERT INTO produccion.transformadores (
    codigo_interno, numero_serie, marca, modelo, cliente_id,
    tipo, capacidad_kva, tension_primaria_kv, tension_secundaria_v,
    conexion, numero_fases, frecuencia_hz, refrigeracion,
    anio_fabricacion, estado, observaciones
  ) VALUES (
    'TRF-2026-0002', 'ABB-2026-0042', 'ABB', 'POT-1MVA-V2', v_cliente_id,
    'potencia', 1000, 22.86, 480, 'Yyn0', 3, 60, 'ONAF',
    2026, 'en_taller',
    'Fabricacion nueva — entrega comprometida'
  )
  ON CONFLICT (codigo_interno) DO NOTHING
  RETURNING id INTO v_trf2_id;

  -- Vincular con las OT existentes si todavia no tienen
  IF v_trf1_id IS NOT NULL THEN
    UPDATE produccion.ot SET transformador_id = v_trf1_id WHERE codigo = 'OT-2026-0001' AND transformador_id IS NULL;
  END IF;
  IF v_trf2_id IS NOT NULL THEN
    UPDATE produccion.ot SET transformador_id = v_trf2_id WHERE codigo = 'OT-2026-0002' AND transformador_id IS NULL;
  END IF;
END $$;

COMMIT;

-- ===================================================================
-- FIN migration 012
-- ===================================================================
