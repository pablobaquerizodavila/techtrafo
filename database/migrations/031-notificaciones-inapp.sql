-- ===================================================================
-- TECHTRAFO - Migracion 031: campos in-app en core.notificaciones (campana)
-- ===================================================================
-- Version: 0.18.0
-- Fecha: 2026-07-22
-- Ejecutado en produccion: no
-- Reversible: no (aditivo, idempotente)
--
-- Contenido:
--   - core.notificaciones: leido, leido_at, enlace (para centro in-app)
-- ===================================================================

ALTER TABLE core.notificaciones ADD COLUMN IF NOT EXISTS leido    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE core.notificaciones ADD COLUMN IF NOT EXISTS leido_at TIMESTAMPTZ;
ALTER TABLE core.notificaciones ADD COLUMN IF NOT EXISTS enlace   VARCHAR(300);
CREATE INDEX IF NOT EXISTS idx_notif_inapp ON core.notificaciones(destinatario_id, leido, created_at DESC);
