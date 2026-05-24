-- ===================================================================
-- Migration 018 - token_version para revocacion de JWT (Fix M7 auditoria)
-- ===================================================================
-- Antes: un JWT robado seguia siendo valido hasta el expiry (8h) porque
-- el backend no podia revocar tokens individuales.
--
-- Ahora: cada usuario tiene un token_version que se incluye en el payload
-- del JWT como `tv`. El middleware requireAuth compara payload.tv contra
-- el valor actual en la DB; si no coinciden, el token esta revocado (401).
--
-- Eventos que incrementan token_version (invalidan TODAS las sesiones del user):
--   - logout (cierre de sesion global, defensa contra cookie robada)
--   - change-password (self-service)
--   - admin reset password (lockeo forzado)
--
-- Costo: si un usuario tiene 3 sesiones abiertas y hace logout en una,
-- las otras 2 quedan invalidas. En esta etapa con un solo usuario activo
-- es aceptable; cuando haya muchos usuarios y multiples dispositivos
-- puede swapearse por una blacklist de jti via Redis.
-- ===================================================================

ALTER TABLE core.usuarios
  ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;

-- Trigger no necesario: token_version no se audita (es ruido) ni se incluye
-- en core.fn_set_updated_at (es un contador interno, no merece bump del updated_at).
