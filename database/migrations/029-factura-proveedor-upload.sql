-- 029-factura-proveedor-upload.sql
-- Agrega nombre original del archivo de factura del proveedor.
-- factura_proveedor_url pasa de guardar URL externa a ruta relativa al UPLOAD_DIR.

ALTER TABLE compras.ordenes_compra
  ADD COLUMN IF NOT EXISTS factura_proveedor_nombre_original VARCHAR(255);
