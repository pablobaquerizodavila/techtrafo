-- ===================================================================
-- Migration 024: Plantillas de contrato
--
-- Plantillas reutilizables para emitir contratos: texto de clausulas
-- (con variables {{...}} que se rellenan al crear el contrato) + un
-- preset del plan de pago. Al crear un contrato se snapshotean las
-- clausulas renderizadas en contratos.clausulas (integridad legal:
-- editar la plantilla no cambia contratos ya firmados).
-- ===================================================================

-- -------------------------------------------------------------------
-- Cabecera de plantilla
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comercial.contrato_plantillas (
  id              BIGSERIAL PRIMARY KEY,
  codigo          VARCHAR(30) UNIQUE NOT NULL,
  nombre          VARCHAR(200) NOT NULL,
  descripcion     TEXT,
  tipo_servicio   VARCHAR(20) NOT NULL DEFAULT 'otro',     -- reparacion|fabricacion|mantenimiento|otro
  clausulas       TEXT,                                     -- cuerpo legal con variables {{...}}
  plan_pago_tipo  VARCHAR(30) NOT NULL DEFAULT 'anticipo_y_saldo',
  activo          BOOLEAN NOT NULL DEFAULT true,
  creado_por      UUID,
  actualizado_por UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contrato_plantillas_tipo
  ON comercial.contrato_plantillas (tipo_servicio, activo);

-- -------------------------------------------------------------------
-- Preset de pagos de la plantilla (porcentajes; el monto se calcula
-- contra el monto_total real del contrato)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comercial.contrato_plantilla_pagos (
  id                BIGSERIAL PRIMARY KEY,
  plantilla_id      BIGINT NOT NULL
                      REFERENCES comercial.contrato_plantillas(id) ON DELETE CASCADE,
  numero            INTEGER NOT NULL,
  tipo              VARCHAR(20) NOT NULL DEFAULT 'anticipo', -- anticipo|hito|saldo
  descripcion       TEXT,
  condicion_disparo VARCHAR(30),                             -- fecha_fija|manual|al_completar_ot|al_pasar_gate|al_entregar
  monto_porcentaje  NUMERIC(5,2),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contrato_plantilla_pagos_plantilla
  ON comercial.contrato_plantilla_pagos (plantilla_id, numero);

-- -------------------------------------------------------------------
-- Snapshot de clausulas en el contrato
-- -------------------------------------------------------------------
ALTER TABLE comercial.contratos
  ADD COLUMN IF NOT EXISTS clausulas TEXT;
