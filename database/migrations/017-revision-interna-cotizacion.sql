-- ===================================================================
-- Migration 017: Revision/aprobacion interna de cotizaciones
--
-- Antes de que una cotizacion pueda ser ENVIADA al cliente, debe pasar
-- por una revision interna escalonada:
--   nivel 1: gerencia_comercial
--   nivel 2: gerencia_general (si nivel 1 escala)
--   nivel 3: presidencia       (si nivel 2 escala, tope)
--
-- Cada nivel puede: aprobar, rechazar, o escalar al siguiente. Rechazo
-- vuelve la cotizacion a manos del creador (estado='rechazada_interna',
-- pero el `estado` general de la cotizacion sigue siendo 'borrador').
-- Aprobacion final habilita la accion 'enviar' al cliente.
-- ===================================================================

-- -------------------------------------------------------------------
-- Columnas en cotizaciones
-- -------------------------------------------------------------------
ALTER TABLE comercial.cotizaciones
  ADD COLUMN IF NOT EXISTS revision_interna_estado VARCHAR(20) NOT NULL DEFAULT 'no_solicitada'
    CHECK (revision_interna_estado IN ('no_solicitada','pendiente','aprobada','rechazada')),
  ADD COLUMN IF NOT EXISTS revision_interna_nivel INT,
  ADD COLUMN IF NOT EXISTS revision_interna_solicitada_por UUID REFERENCES core.usuarios(id),
  ADD COLUMN IF NOT EXISTS revision_interna_solicitada_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revision_interna_resuelta_por UUID REFERENCES core.usuarios(id),
  ADD COLUMN IF NOT EXISTS revision_interna_resuelta_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revision_interna_motivo_rechazo TEXT;

COMMENT ON COLUMN comercial.cotizaciones.revision_interna_estado IS
  'Estado del flujo de revision interna: no_solicitada / pendiente / aprobada / rechazada';
COMMENT ON COLUMN comercial.cotizaciones.revision_interna_nivel IS
  'Nivel actual en el escalamiento: 1=gerencia_comercial, 2=gerencia_general, 3=presidencia';

-- -------------------------------------------------------------------
-- Tabla de historial (auditoria del flujo de aprobacion)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comercial.cotizacion_revision_interna_historial (
  id            BIGSERIAL PRIMARY KEY,
  cotizacion_id BIGINT NOT NULL REFERENCES comercial.cotizaciones(id) ON DELETE CASCADE,
  nivel         INT NOT NULL,
  accion        VARCHAR(20) NOT NULL CHECK (accion IN ('solicitar','aprobar','rechazar','escalar')),
  por_usuario_id UUID REFERENCES core.usuarios(id),
  rol_actuante  VARCHAR(50),
  notas         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cot_rev_hist_cotizacion
  ON comercial.cotizacion_revision_interna_historial(cotizacion_id, created_at DESC);

COMMENT ON TABLE comercial.cotizacion_revision_interna_historial IS
  'Historial de eventos del flujo de revision interna de una cotizacion';
