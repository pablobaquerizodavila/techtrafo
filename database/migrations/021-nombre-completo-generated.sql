-- ===================================================================
-- Migration 021 - core.usuarios.nombre_completo (GENERATED)
-- ===================================================================
-- El modulo de Compras (routes/recepciones.ts, routes/ordenes-compra.ts,
-- routes/solicitudes-compra.ts) usa `nombre_completo` en sus selects de
-- Prisma. Este campo se asumio existente pero ninguna migration lo creo,
-- causando el crash del API con
--   "Unknown field `nombre_completo` for select statement on model `usuarios`"
--
-- Solucion: GENERATED ALWAYS STORED. Postgres lo recalcula automaticamente
-- cuando cambian nombres o apellidos. Prisma lo detecta como columna normal
-- de solo lectura tras `prisma db pull`.
-- ===================================================================

ALTER TABLE core.usuarios
  ADD COLUMN IF NOT EXISTS nombre_completo VARCHAR(201)
  GENERATED ALWAYS AS (nombres || ' ' || apellidos) STORED;

-- Indice util si en algun lado se filtra/busca por nombre completo
CREATE INDEX IF NOT EXISTS idx_usuarios_nombre_completo
  ON core.usuarios (nombre_completo);
