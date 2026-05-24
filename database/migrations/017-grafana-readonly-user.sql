-- ===================================================================
-- Migration 017 - Usuario grafana_ro (SELECT-only para datasource Grafana)
-- ===================================================================
-- Fix H4 de la auditoria de seguridad: Grafana usaba techtrafo_admin
-- (DB superuser). Si Grafana es comprometido, un atacante podia leer
-- y escribir TODO incluyendo core.usuarios.password_hash.
--
-- Este migration crea un rol con SELECT-only en los 3 schemas que
-- realmente usan los dashboards: comercial, posventa, produccion.
-- Schemas excluidos a proposito:
--   - core      -> contiene usuarios, roles, password_hash
--   - inventario -> no usado por dashboards
--
-- El password se setea aparte por seguridad (no queda en git). Tras
-- aplicar este SQL, correr:
--   ALTER USER grafana_ro WITH PASSWORD '...' LOGIN;
-- (lo hace el script de despliegue leyendo de /opt/techtrafo/.env)
-- ===================================================================

-- Crear rol sin login. El password+LOGIN se setea aparte.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grafana_ro') THEN
    CREATE ROLE grafana_ro NOLOGIN;
  END IF;
END$$;

-- Acceso al DB
GRANT CONNECT ON DATABASE techtrafo TO grafana_ro;

-- USAGE en los 3 schemas que usan los dashboards
GRANT USAGE ON SCHEMA comercial TO grafana_ro;
GRANT USAGE ON SCHEMA posventa  TO grafana_ro;
GRANT USAGE ON SCHEMA produccion TO grafana_ro;

-- SELECT en todas las tablas/views ACTUALES de esos schemas
GRANT SELECT ON ALL TABLES IN SCHEMA comercial  TO grafana_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA posventa   TO grafana_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA produccion TO grafana_ro;

-- SELECT en todas las tablas/views FUTURAS de esos schemas.
-- Importante: ALTER DEFAULT PRIVILEGES aplica solo a objetos creados
-- por el rol especificado en FOR ROLE. techtrafo_admin es quien aplica
-- las migrations, asi que es ese rol.
ALTER DEFAULT PRIVILEGES FOR ROLE techtrafo_admin IN SCHEMA comercial
  GRANT SELECT ON TABLES TO grafana_ro;
ALTER DEFAULT PRIVILEGES FOR ROLE techtrafo_admin IN SCHEMA posventa
  GRANT SELECT ON TABLES TO grafana_ro;
ALTER DEFAULT PRIVILEGES FOR ROLE techtrafo_admin IN SCHEMA produccion
  GRANT SELECT ON TABLES TO grafana_ro;

-- USAGE en sequences NO se otorga: SELECT no requiere nextval.
-- INSERT/UPDATE/DELETE NO se otorgan: SELECT puro.
-- EXECUTE en funciones NO se otorga: Grafana no las necesita.
