-- Migration 027: Portal de proveedor
-- Vincular usuario a proveedor, campos de respuesta en OC, nuevo rol

-- Vincular usuario a proveedor
ALTER TABLE core.usuarios
  ADD COLUMN IF NOT EXISTS proveedor_id bigint REFERENCES compras.proveedores(id);

-- Campos de respuesta del proveedor en OC
ALTER TABLE compras.ordenes_compra
  ADD COLUMN IF NOT EXISTS acuse_recibo_at timestamptz,
  ADD COLUMN IF NOT EXISTS factura_proveedor_numero varchar(80),
  ADD COLUMN IF NOT EXISTS factura_proveedor_url text;

-- Nuevo rol 'proveedor' (sin permisos de panel interno)
INSERT INTO core.roles (nombre, descripcion, permisos, activo, es_super_admin)
VALUES ('proveedor', 'Acceso al portal de proveedor (solo OCs propias)', '{}', true, false)
ON CONFLICT (nombre) DO NOTHING;

-- Índice
CREATE INDEX IF NOT EXISTS idx_usuarios_proveedor_id ON core.usuarios(proveedor_id);
