-- ===================================================================
-- Migration 015: garantías sobre transformadores
-- ===================================================================
-- La migration 007 enlazó garantías a inventario.series (para equipos
-- de catálogo). Con transformadores como entidad de primera clase
-- (migration 012), es mas natural vincular la garantía directo al
-- transformador del cliente.
--
-- Cambios:
--   posventa.garantias.transformador_id  (FK opcional nueva)
--   posventa.garantias.serie_id          -> opcional (NULL permitido)
--   CHECK: uno de los dos debe estar presente
--   Columnas auxiliares para evitar spam de notificaciones
-- ===================================================================

BEGIN;

-- Quitar NOT NULL de serie_id
ALTER TABLE posventa.garantias
  ALTER COLUMN serie_id DROP NOT NULL;

-- Quitar el UNIQUE que existía (una serie -> una garantia) ahora opcional
ALTER TABLE posventa.garantias
  DROP CONSTRAINT IF EXISTS garantias_serie_id_key;

-- Recrear UNIQUE parcial (solo cuando serie_id no es null)
CREATE UNIQUE INDEX IF NOT EXISTS garantias_serie_id_key
  ON posventa.garantias(serie_id)
  WHERE serie_id IS NOT NULL;

-- Nueva FK opcional a transformadores
ALTER TABLE posventa.garantias
  ADD COLUMN IF NOT EXISTS transformador_id BIGINT
    REFERENCES produccion.transformadores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_garantias_transformador
  ON posventa.garantias(transformador_id)
  WHERE transformador_id IS NOT NULL;

-- Garantía pertenece a UN transformador (un trafo puede tener varias
-- garantías a lo largo del tiempo, ej: garantía de reparación 2024 +
-- garantía de reparación 2026 sobre el mismo equipo)
-- Por eso NO ponemos UNIQUE.

-- CHECK: al menos una referencia (serie_id O transformador_id) debe existir
ALTER TABLE posventa.garantias
  DROP CONSTRAINT IF EXISTS garantias_check_referencia;
ALTER TABLE posventa.garantias
  ADD CONSTRAINT garantias_check_referencia
    CHECK (serie_id IS NOT NULL OR transformador_id IS NOT NULL);

-- Columna para tracking de notificacion de vencimiento proximo
ALTER TABLE posventa.garantias
  ADD COLUMN IF NOT EXISTS notif_vencimiento_30d_enviada BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notif_vencimiento_7d_enviada BOOLEAN NOT NULL DEFAULT false;

-- Tambien hacemos opcional ot_id de origen (que también requería serie)
-- y permitimos linkear OT directamente a la garantía si nace de una OT.
ALTER TABLE posventa.garantias
  ADD COLUMN IF NOT EXISTS ot_id_origen BIGINT
    REFERENCES produccion.ot(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_garantias_ot_origen
  ON posventa.garantias(ot_id_origen)
  WHERE ot_id_origen IS NOT NULL;

-- Trigger de auditoria (ya debería estar, pero idempotente)
DROP TRIGGER IF EXISTS tg_garantias_auditar ON posventa.garantias;
CREATE TRIGGER tg_garantias_auditar
  AFTER INSERT OR UPDATE OR DELETE ON posventa.garantias
  FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

DROP TRIGGER IF EXISTS tg_reclamos_auditar ON posventa.reclamos;
CREATE TRIGGER tg_reclamos_auditar
  AFTER INSERT OR UPDATE OR DELETE ON posventa.reclamos
  FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

DROP TRIGGER IF EXISTS tg_intervenciones_auditar ON posventa.intervenciones;
CREATE TRIGGER tg_intervenciones_auditar
  AFTER INSERT OR UPDATE OR DELETE ON posventa.intervenciones
  FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

-- Vista para alertas (garantías por vencer)
CREATE OR REPLACE VIEW posventa.v_garantias_por_vencer AS
  SELECT
    g.id, g.codigo, g.cliente_id, g.transformador_id, g.serie_id,
    g.fecha_fin,
    (g.fecha_fin - CURRENT_DATE)::integer AS dias_restantes,
    g.estado,
    c.razon_social         AS cliente_nombre,
    c.email                AS cliente_email,
    t.codigo_interno       AS transformador_codigo,
    t.marca                AS transformador_marca,
    t.capacidad_kva        AS transformador_capacidad
  FROM posventa.garantias g
  JOIN comercial.clientes c ON c.id = g.cliente_id
  LEFT JOIN produccion.transformadores t ON t.id = g.transformador_id
  WHERE g.estado = 'vigente'
    AND g.fecha_fin >= CURRENT_DATE
    AND g.fecha_fin <= CURRENT_DATE + INTERVAL '30 days'
  ORDER BY g.fecha_fin ASC;

COMMIT;

-- ===================================================================
-- FIN migration 015
-- ===================================================================
