-- ===================================================================
-- TECHTRAFO - Migracion 008: Super admin + estado_aprobacion en usuarios
-- ===================================================================
-- Version: 0.4.0
-- Fecha: 2026-05-22
-- Ejecutado en produccion: no
-- Reversible: parcial (los datos migrados a 'aprobado' no se revierten)
--
-- Contenido:
--   - roles.es_super_admin BOOL: flag de super administrador que bypassa
--     todos los checks de permisos
--   - usuarios.estado_aprobacion: maquina de aprobacion para auto-registro
--     (pendiente/aprobado/rechazado)
--   - usuarios.aprobado_por + fecha_aprobacion + motivo_rechazo
--   - Marcar el rol 'presidencia' como super_admin
--   - Migrar todos los usuarios existentes a estado 'aprobado' (asumimos
--     que los pre-existentes son legitimos)
-- ===================================================================

-- -------------------------------------------------------------------
-- roles: agregar flag es_super_admin
-- -------------------------------------------------------------------
ALTER TABLE core.roles
  ADD COLUMN IF NOT EXISTS es_super_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_roles_super_admin
  ON core.roles(es_super_admin)
  WHERE es_super_admin = TRUE;

-- Marcar presidencia como super admin
UPDATE core.roles SET es_super_admin = TRUE WHERE nombre = 'presidencia';

-- -------------------------------------------------------------------
-- usuarios: agregar estado_aprobacion + relacionados
-- -------------------------------------------------------------------
ALTER TABLE core.usuarios
  ADD COLUMN IF NOT EXISTS estado_aprobacion VARCHAR(20) NOT NULL DEFAULT 'pendiente'
    CHECK (estado_aprobacion IN ('pendiente', 'aprobado', 'rechazado')),
  ADD COLUMN IF NOT EXISTS aprobado_por UUID REFERENCES core.usuarios(id),
  ADD COLUMN IF NOT EXISTS fecha_aprobacion TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT,
  ADD COLUMN IF NOT EXISTS telefono_solicitud VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_usuarios_estado_aprobacion
  ON core.usuarios(estado_aprobacion);

-- Migrar todos los usuarios EXISTENTES a 'aprobado' (eran legitimos pre-migration)
UPDATE core.usuarios
   SET estado_aprobacion = 'aprobado',
       fecha_aprobacion  = COALESCE(fecha_aprobacion, NOW())
 WHERE estado_aprobacion = 'pendiente'
   AND created_at < NOW();

-- -------------------------------------------------------------------
-- Inicializar permisos por rol (JSONB en core.roles.permisos)
-- Solo seteamos los permisos si la columna esta vacia ({}); no sobreescribimos
-- si ya hay algo configurado.
--
-- Catalogo de permisos:
--   clientes.read, clientes.write, clientes.delete
--   cotizaciones.read, cotizaciones.write, cotizaciones.delete, cotizaciones.aprobar
--   contratos.read, contratos.write, contratos.delete, contratos.cobrar
--   inventario.read, inventario.write, inventario.delete, movimientos.crear
--   admin.usuarios, admin.roles
-- -------------------------------------------------------------------

-- Gerencia general: todo excepto admin.roles (solo super_admin edita permisos)
UPDATE core.roles SET permisos = jsonb_build_object(
  'clientes.read', true, 'clientes.write', true, 'clientes.delete', true,
  'cotizaciones.read', true, 'cotizaciones.write', true, 'cotizaciones.delete', true, 'cotizaciones.aprobar', true,
  'contratos.read', true, 'contratos.write', true, 'contratos.delete', true, 'contratos.cobrar', true,
  'inventario.read', true, 'inventario.write', true, 'inventario.delete', true, 'movimientos.crear', true,
  'admin.usuarios', true
) WHERE nombre = 'gerencia_general' AND permisos = '{}'::jsonb;

-- Gerencia comercial: comercial completo, inventario solo lectura
UPDATE core.roles SET permisos = jsonb_build_object(
  'clientes.read', true, 'clientes.write', true, 'clientes.delete', true,
  'cotizaciones.read', true, 'cotizaciones.write', true, 'cotizaciones.aprobar', true,
  'contratos.read', true, 'contratos.write', true, 'contratos.cobrar', true,
  'inventario.read', true
) WHERE nombre = 'gerencia_comercial' AND permisos = '{}'::jsonb;

-- Jefe de planta: inventario completo, comercial solo lectura
UPDATE core.roles SET permisos = jsonb_build_object(
  'clientes.read', true,
  'cotizaciones.read', true,
  'contratos.read', true,
  'inventario.read', true, 'inventario.write', true, 'inventario.delete', true, 'movimientos.crear', true
) WHERE nombre = 'jefe_planta' AND permisos = '{}'::jsonb;

-- Coordinador tecnico: lectura general + movimientos
UPDATE core.roles SET permisos = jsonb_build_object(
  'clientes.read', true,
  'cotizaciones.read', true,
  'contratos.read', true,
  'inventario.read', true, 'movimientos.crear', true
) WHERE nombre = 'coordinador_tecnico' AND permisos = '{}'::jsonb;
