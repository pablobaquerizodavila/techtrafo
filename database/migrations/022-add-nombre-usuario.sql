-- Migration 022: agregar campo nombre_usuario a core.usuarios
-- El nombre de usuario es único, distinto del email, y se requiere en el registro.

ALTER TABLE core.usuarios
  ADD COLUMN nombre_usuario VARCHAR(50) UNIQUE;

-- Índice para búsquedas por nombre de usuario
CREATE INDEX idx_usuarios_nombre_usuario ON core.usuarios (nombre_usuario);

-- Rellenar usuarios existentes con un valor temporal basado en el email
-- (parte antes del @) para no violar el NOT NULL en datos pre-existentes.
-- El admin puede corregirlos después desde el panel.
UPDATE core.usuarios
SET nombre_usuario = LOWER(SPLIT_PART(email, '@', 1)) || '_' || SUBSTRING(id::text, 1, 4)
WHERE nombre_usuario IS NULL;

-- Una vez rellenados, aplicar NOT NULL
ALTER TABLE core.usuarios
  ALTER COLUMN nombre_usuario SET NOT NULL;
