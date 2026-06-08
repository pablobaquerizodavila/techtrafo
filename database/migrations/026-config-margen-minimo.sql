-- Migration 026: Tabla de configuracion de margenes minimos por tipo_servicio
-- Aplicar: docker exec techtrafo-db psql -U techtrafo -d techtrafo -f /migrations/026-config-margen-minimo.sql

CREATE TABLE IF NOT EXISTS comercial.config_margen_minimo (
  id               serial PRIMARY KEY,
  tipo_servicio    varchar(40) NOT NULL UNIQUE,
  margen_minimo    numeric(5,2) NOT NULL CHECK (margen_minimo >= 0 AND margen_minimo <= 100),
  actualizado_por  uuid REFERENCES core.usuarios(id),
  updated_at       timestamptz DEFAULT now()
);

COMMENT ON TABLE comercial.config_margen_minimo IS 'Umbrales minimos de margen por tipo de servicio. Editables solo por presidencia/super_admin.';

INSERT INTO comercial.config_margen_minimo (tipo_servicio, margen_minimo) VALUES
  ('fabricacion',   25.00),
  ('mantenimiento', 20.00),
  ('reparacion',    20.00),
  ('otro',          15.00)
ON CONFLICT (tipo_servicio) DO NOTHING;
