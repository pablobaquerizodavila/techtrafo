-- Migration 028: No conformidades en recepciones de compras
-- Detects and tracks quality/quantity non-conformities found during reception inspection.

-- Tabla principal de no conformidades
CREATE TABLE IF NOT EXISTS compras.no_conformidades (
  id                  bigserial PRIMARY KEY,
  codigo              varchar(20) NOT NULL UNIQUE,
  recepcion_id        bigint NOT NULL REFERENCES compras.recepciones(id),
  orden_compra_id     bigint REFERENCES compras.ordenes_compra(id),
  proveedor_id        bigint REFERENCES compras.proveedores(id),
  tipo                varchar(30) NOT NULL CHECK (tipo IN ('cantidad','calidad','documentacion','otro')),
  descripcion         text NOT NULL,
  accion_tomada       text,
  estado              varchar(20) NOT NULL DEFAULT 'abierta'
                      CHECK (estado IN ('abierta','en_proceso','cerrada')),
  responsable_id      uuid REFERENCES core.usuarios(id),
  fecha_cierre        timestamptz,
  costo_impacto       numeric(12,2),
  creado_por          uuid REFERENCES core.usuarios(id),
  actualizado_por     uuid REFERENCES core.usuarios(id),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- Lineas afectadas de la recepcion
CREATE TABLE IF NOT EXISTS compras.nc_lineas (
  id                    bigserial PRIMARY KEY,
  no_conformidad_id     bigint NOT NULL REFERENCES compras.no_conformidades(id) ON DELETE CASCADE,
  recepcion_linea_id    bigint NOT NULL REFERENCES compras.recepcion_lineas(id),
  cantidad_no_conforme  numeric(12,3) NOT NULL,
  motivo                text,
  created_at            timestamptz DEFAULT now()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_nc_recepcion  ON compras.no_conformidades(recepcion_id);
CREATE INDEX IF NOT EXISTS idx_nc_proveedor  ON compras.no_conformidades(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_nc_estado     ON compras.no_conformidades(estado);
CREATE INDEX IF NOT EXISTS idx_nc_lineas_nc  ON compras.nc_lineas(no_conformidad_id);

-- Secuencia de codigo NC-YYYY-NNNN
CREATE SEQUENCE IF NOT EXISTS compras.nc_seq_2026 START 1;

COMMENT ON TABLE compras.no_conformidades IS 'No conformidades detectadas en inspeccion de recepciones. Creadas automaticamente al marcar lineas como no_conforme o rechazado.';
COMMENT ON TABLE compras.nc_lineas IS 'Lineas individuales de recepcion afectadas por una no conformidad.';