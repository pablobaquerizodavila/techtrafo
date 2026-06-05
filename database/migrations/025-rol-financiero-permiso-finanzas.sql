-- ===================================================================
-- Migration 025: Modulo Finanzas — rol financiero + permiso finanzas.read
--
-- Crea el rol `financiero` y otorga el permiso `finanzas.read` a ese rol y
-- a las 3 gerencias. presidencia es es_super_admin=true (ve todo igual),
-- pero se le agrega explicito por claridad. El permiso gobierna el modulo
-- financiero (GET /api/finanzas/*) y la visibilidad del nav "Finanzas".
-- ===================================================================

INSERT INTO core.roles (nombre, descripcion, permisos)
VALUES (
  'financiero',
  'Gerente/analista financiero — ingresos, cartera vencida, cobros, anticipos',
  '{"finanzas.read": true}'::jsonb
)
ON CONFLICT (nombre) DO NOTHING;

UPDATE core.roles
   SET permisos = jsonb_set(COALESCE(permisos, '{}'::jsonb), '{finanzas.read}', 'true'::jsonb)
 WHERE nombre IN ('presidencia', 'gerencia_general', 'gerencia_comercial');
