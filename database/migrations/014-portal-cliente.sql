-- ===================================================================
-- Migration 014: portal cliente — usuarios.cliente_id + rol auditor
-- ===================================================================
-- Habilita que un usuario del sistema con rol "cliente" quede asociado
-- a una empresa de comercial.clientes y solo pueda ver SUS expedientes,
-- ordenes, transformadores y notificaciones.
--
-- Tambien añade el rol "auditor" para consultoria externa (read-only,
-- sin acceso a costos internos ni datos comerciales).
-- ===================================================================

BEGIN;

-- -------------------------------------------------------------------
-- usuarios.cliente_id: vincula usuario con la empresa que representa
-- -------------------------------------------------------------------
ALTER TABLE core.usuarios
  ADD COLUMN IF NOT EXISTS cliente_id BIGINT
  REFERENCES comercial.clientes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_usuarios_cliente ON core.usuarios(cliente_id) WHERE cliente_id IS NOT NULL;

COMMENT ON COLUMN core.usuarios.cliente_id IS
  'Si el usuario representa a un cliente externo (rol cliente), aqui va la FK a la empresa. Filtra todas sus consultas al portal.';

-- -------------------------------------------------------------------
-- Rol auditor (solo lectura, sin info sensible)
-- -------------------------------------------------------------------
INSERT INTO core.roles (nombre, descripcion, es_super_admin, permisos) VALUES (
  'auditor',
  'Consultor o auditor externo con acceso de solo lectura a indicadores no sensibles',
  false,
  '{"clientes.read":true,"expedientes.read":true,"ot.read":true,"informes.read":true,"reportes.read":true}'::jsonb
)
ON CONFLICT (nombre) DO NOTHING;

-- -------------------------------------------------------------------
-- Actualizar permisos del rol cliente (granular para portal)
-- -------------------------------------------------------------------
UPDATE core.roles
   SET permisos = '{"portal.read":true,"portal_seguimiento":true}'::jsonb,
       descripcion = COALESCE(descripcion, 'Cliente externo con acceso a su portal de seguimiento de pedidos')
 WHERE nombre = 'cliente';

-- -------------------------------------------------------------------
-- Tabla de mapping estados internos -> externos (para el portal cliente)
-- Esta declarada explicita en la BD para que se pueda editar via UI
-- en el futuro (FASE 5) sin tocar codigo
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comercial.hito_estados_cliente (
  hito_codigo         VARCHAR(40) PRIMARY KEY,
  label_cliente       VARCHAR(120) NOT NULL,
  descripcion_cliente TEXT,
  orden               INTEGER NOT NULL DEFAULT 0,
  emoji               VARCHAR(8)
);

INSERT INTO comercial.hito_estados_cliente (hito_codigo, label_cliente, descripcion_cliente, orden, emoji) VALUES
  ('captacion',          'Pedido recibido',              'Tu solicitud fue registrada en nuestro sistema',                10, '📥'),
  ('validacion_credito', 'Validando información',        'Estamos validando los datos comerciales',                       20, '📋'),
  ('visita_tecnica',     'Evaluación técnica en sitio',  'Nuestro equipo está coordinando la visita al equipo',           30, '🔍'),
  ('informe_tecnico',    'Análisis técnico',             'Elaborando informe técnico con el diagnóstico',                 40, '📄'),
  ('cotizacion',         'Preparando cotización',        'Calculando precio según diagnóstico técnico',                   50, '💰'),
  ('aprobacion_cliente', 'Esperando tu aprobación',      'La cotización está lista para tu revisión',                     60, '✅'),
  ('contrato',           'Contrato',                     'Formalizando el contrato del servicio',                         70, '📝'),
  ('anticipo',           'Esperando anticipo',           'Pendiente confirmación del anticipo acordado',                  80, '💳'),
  ('recepcion_fisica',   'Equipo recibido en planta',    'Tu transformador llegó a nuestras instalaciones',               90, '🏭'),
  ('desmontaje',         'En revisión técnica',          'Desmontaje y evaluación detallada del equipo',                 100, '🔧'),
  ('reparacion',         'En reparación especializada',  'Trabajos técnicos en ejecución',                                110, '⚙️'),
  ('pruebas_finales',    'Pruebas de calidad',           'Bateria completa de pruebas eléctricas',                        120, '⚡'),
  ('entrega',            'Listo para entrega',           'Equipo aprobado y coordinando logística de entrega',           130, '🚚'),
  ('garantia_activa',    'En garantía',                  'Servicio entregado bajo garantía activa',                       140, '🛡️'),
  ('nps',                'Proceso finalizado',           'Cerraremos el caso con tu evaluación de satisfacción',          150, '🎉')
ON CONFLICT (hito_codigo) DO UPDATE
   SET label_cliente       = EXCLUDED.label_cliente,
       descripcion_cliente = EXCLUDED.descripcion_cliente,
       orden               = EXCLUDED.orden,
       emoji               = EXCLUDED.emoji;

COMMIT;

-- ===================================================================
-- FIN migration 014
-- ===================================================================
