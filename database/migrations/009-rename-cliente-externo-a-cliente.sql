-- ===================================================================
-- TECHTRAFO - Migracion 009: Renombrar cliente_externo a cliente
-- ===================================================================
-- Version: 0.4.1
-- Fecha: 2026-05-23
-- Ejecutado en produccion: no
-- Reversible: si (UPDATE inverso)
--
-- Contenido:
--   - Renombrar el rol 'cliente_externo' a 'cliente' (nombre mas corto y
--     comun para el caso de uso). Mantiene los permisos existentes
--     (portal_seguimiento) y el id 12.
--   - Actualiza descripcion para reflejar el cambio.
-- ===================================================================

UPDATE core.roles
   SET nombre = 'cliente',
       descripcion = COALESCE(descripcion, 'Cliente con acceso a su portal de seguimiento y consulta de cotizaciones, contratos y garantias propias')
 WHERE nombre = 'cliente_externo';
