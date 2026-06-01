-- Migration 023: representante legal del cliente en comercial.clientes
-- Nombres, apellidos, cedula y cargo del representante legal que firma por el
-- cliente. Columnas nullable: la obligatoriedad cuando tipo_persona='juridica'
-- se valida a nivel aplicacion (backend zod + frontend), para no romper filas
-- existentes. cargo: 'Gerente General' | 'Presidente' | 'Apoderado'.

ALTER TABLE comercial.clientes
  ADD COLUMN IF NOT EXISTS rep_legal_nombres   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS rep_legal_apellidos VARCHAR(100),
  ADD COLUMN IF NOT EXISTS rep_legal_cedula    VARCHAR(13),
  ADD COLUMN IF NOT EXISTS rep_legal_cargo     VARCHAR(30);
