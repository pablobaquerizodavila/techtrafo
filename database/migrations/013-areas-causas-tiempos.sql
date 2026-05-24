-- ===================================================================
-- Migration 013: áreas de producción + causas de demora + tiempos
-- ===================================================================
-- Reemplaza los 3 bloques DUMMY del dashboard de producción (fase A)
-- con catálogos y data real:
--   produccion.areas              - centros de trabajo de planta
--   produccion.causas_demora       - tipificación de retrasos
--   produccion.reprocesos          - registro de reprocesos por OT/paso
--   produccion.tiempos_trabajo     - horas-hombre por usuario/área/OT
--
-- Tambien añade:
--   ot_pasos.area_id               - vincula cada paso a su area
--   ot_pasos.causa_demora_id       - causa registrada si el paso se atrasa
--   paso_plantillas.area_codigo    - default de area por paso de plantilla
-- ===================================================================

BEGIN;

-- -------------------------------------------------------------------
-- Catálogo de áreas de producción
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS produccion.areas (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(30) UNIQUE NOT NULL,
  nombre      VARCHAR(80) NOT NULL,
  descripcion TEXT,
  color_hex   VARCHAR(7) DEFAULT '#64748b',     -- para badges en UI
  orden       INTEGER NOT NULL DEFAULT 0,        -- orden visual sugerido
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS tg_areas_updated_at ON produccion.areas;
CREATE TRIGGER tg_areas_updated_at
  BEFORE UPDATE ON produccion.areas
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

INSERT INTO produccion.areas (codigo, nombre, descripcion, color_hex, orden) VALUES
  ('ingenieria',  'Ingeniería',  'Diseño técnico, cálculos, aprobación de planos', '#6366f1', 10),
  ('compras',     'Compras / Bodega', 'Adquisición y recepción de materiales',     '#f59e0b', 20),
  ('nucleo',      'Núcleo',      'Corte y armado del núcleo magnético',           '#0ea5e9', 30),
  ('bobinado',    'Bobinado',    'Construcción de bobinas primarias y secundarias','#10b981', 40),
  ('ensamble',    'Ensamble',    'Montaje de parte activa, tanque, accesorios',   '#3b82f6', 50),
  ('tanque',      'Tanque',      'Fabricación, soldadura, prueba hermeticidad',   '#8b5cf6', 60),
  ('pintura',     'Pintura',     'Tratamiento anticorrosivo y acabado',           '#ec4899', 70),
  ('secado',      'Secado / Aceite', 'Secado al vacío y llenado de aceite',       '#14b8a6', 75),
  ('pruebas',     'Pruebas (QA)', 'Pruebas eléctricas FAT y control de calidad',  '#ef4444', 80),
  ('despacho',    'Despacho',    'Embalaje, coordinación de transporte y entrega', '#64748b', 90),
  ('servicio',    'Servicio en sitio', 'Mantenimiento e intervenciones en cliente','#22c55e', 100)
ON CONFLICT (codigo) DO NOTHING;

-- -------------------------------------------------------------------
-- Catálogo de causas de demora
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS produccion.causas_demora (
  id          BIGSERIAL PRIMARY KEY,
  codigo      VARCHAR(40) UNIQUE NOT NULL,
  nombre      VARCHAR(120) NOT NULL,
  categoria   VARCHAR(30) NOT NULL DEFAULT 'operativa'
                CHECK (categoria IN ('materiales','personal','calidad','tecnica','cliente','operativa','otra')),
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS tg_causas_updated_at ON produccion.causas_demora;
CREATE TRIGGER tg_causas_updated_at
  BEFORE UPDATE ON produccion.causas_demora
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

INSERT INTO produccion.causas_demora (codigo, nombre, categoria) VALUES
  ('falta_material',      'Falta de materiales',                      'materiales'),
  ('material_defectuoso', 'Material recibido defectuoso',             'materiales'),
  ('falta_personal',      'Falta de personal asignado',               'personal'),
  ('reproceso_qa',        'Reproceso por observación de QA',          'calidad'),
  ('pruebas_fallidas',    'Pruebas eléctricas fallidas',              'calidad'),
  ('falla_equipo',        'Falla técnica de equipo de planta',        'tecnica'),
  ('espera_aprobacion',   'Espera aprobación del cliente',            'cliente'),
  ('cambio_alcance',      'Cambio de alcance solicitado por cliente', 'cliente'),
  ('feriado_paro',        'Feriado o paro de actividades',            'operativa'),
  ('otro',                'Otra causa (especificar)',                 'otra')
ON CONFLICT (codigo) DO NOTHING;

-- -------------------------------------------------------------------
-- Registro de reprocesos
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS produccion.reprocesos (
  id              BIGSERIAL PRIMARY KEY,
  ot_id           BIGINT NOT NULL REFERENCES produccion.ot(id) ON DELETE CASCADE,
  paso_id         BIGINT REFERENCES produccion.ot_pasos(id) ON DELETE SET NULL,
  causa_demora_id BIGINT REFERENCES produccion.causas_demora(id) ON DELETE SET NULL,
  descripcion     TEXT NOT NULL,
  dias_perdidos   NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (dias_perdidos >= 0),
  costo_estimado  NUMERIC(14,2),               -- opcional
  reportado_por   UUID REFERENCES core.usuarios(id),
  resuelto        BOOLEAN NOT NULL DEFAULT false,
  fecha_resolucion TIMESTAMPTZ,
  notas_resolucion TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reprocesos_ot       ON produccion.reprocesos(ot_id);
CREATE INDEX IF NOT EXISTS idx_reprocesos_causa    ON produccion.reprocesos(causa_demora_id);
CREATE INDEX IF NOT EXISTS idx_reprocesos_resuelto ON produccion.reprocesos(resuelto, created_at DESC);

DROP TRIGGER IF EXISTS tg_reprocesos_updated_at ON produccion.reprocesos;
CREATE TRIGGER tg_reprocesos_updated_at
  BEFORE UPDATE ON produccion.reprocesos
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

DROP TRIGGER IF EXISTS tg_reprocesos_auditar ON produccion.reprocesos;
CREATE TRIGGER tg_reprocesos_auditar
  AFTER INSERT OR UPDATE OR DELETE ON produccion.reprocesos
  FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

-- -------------------------------------------------------------------
-- Tiempos de trabajo (horas-hombre por usuario / OT / paso / área)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS produccion.tiempos_trabajo (
  id          BIGSERIAL PRIMARY KEY,
  ot_id       BIGINT NOT NULL REFERENCES produccion.ot(id) ON DELETE CASCADE,
  paso_id     BIGINT REFERENCES produccion.ot_pasos(id) ON DELETE SET NULL,
  area_id     BIGINT REFERENCES produccion.areas(id) ON DELETE SET NULL,
  usuario_id  UUID NOT NULL REFERENCES core.usuarios(id),
  fecha       DATE NOT NULL DEFAULT CURRENT_DATE,
  horas       NUMERIC(5,2) NOT NULL CHECK (horas > 0 AND horas <= 24),
  descripcion TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tiempos_ot          ON produccion.tiempos_trabajo(ot_id);
CREATE INDEX IF NOT EXISTS idx_tiempos_usuario     ON produccion.tiempos_trabajo(usuario_id, fecha);
CREATE INDEX IF NOT EXISTS idx_tiempos_area_fecha  ON produccion.tiempos_trabajo(area_id, fecha) WHERE area_id IS NOT NULL;

DROP TRIGGER IF EXISTS tg_tiempos_auditar ON produccion.tiempos_trabajo;
CREATE TRIGGER tg_tiempos_auditar
  AFTER INSERT OR UPDATE OR DELETE ON produccion.tiempos_trabajo
  FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

-- -------------------------------------------------------------------
-- FK desde ot_pasos y paso_plantillas
-- -------------------------------------------------------------------
ALTER TABLE produccion.ot_pasos
  ADD COLUMN IF NOT EXISTS area_id BIGINT REFERENCES produccion.areas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS causa_demora_id BIGINT REFERENCES produccion.causas_demora(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ot_pasos_area ON produccion.ot_pasos(area_id) WHERE area_id IS NOT NULL;

ALTER TABLE produccion.paso_plantillas
  ADD COLUMN IF NOT EXISTS area_codigo VARCHAR(30) REFERENCES produccion.areas(codigo) ON DELETE SET NULL;

-- Asignar area por defecto a las plantillas existentes
UPDATE produccion.paso_plantillas SET area_codigo = 'compras'    WHERE tipo_ruta = 'reparacion'    AND numero = 1;
UPDATE produccion.paso_plantillas SET area_codigo = 'ingenieria' WHERE tipo_ruta = 'reparacion'    AND numero = 2;
UPDATE produccion.paso_plantillas SET area_codigo = 'pruebas'    WHERE tipo_ruta = 'reparacion'    AND numero = 3;
UPDATE produccion.paso_plantillas SET area_codigo = 'bobinado'   WHERE tipo_ruta = 'reparacion'    AND numero = 4;
UPDATE produccion.paso_plantillas SET area_codigo = 'secado'     WHERE tipo_ruta = 'reparacion'    AND numero = 5;
UPDATE produccion.paso_plantillas SET area_codigo = 'pruebas'    WHERE tipo_ruta = 'reparacion'    AND numero = 6;
UPDATE produccion.paso_plantillas SET area_codigo = 'pruebas'    WHERE tipo_ruta = 'reparacion'    AND numero = 7;
UPDATE produccion.paso_plantillas SET area_codigo = 'pintura'    WHERE tipo_ruta = 'reparacion'    AND numero = 8;
UPDATE produccion.paso_plantillas SET area_codigo = 'despacho'   WHERE tipo_ruta = 'reparacion'    AND numero = 9;

UPDATE produccion.paso_plantillas SET area_codigo = 'compras'    WHERE tipo_ruta = 'fabricacion'   AND numero = 1;
UPDATE produccion.paso_plantillas SET area_codigo = 'compras'    WHERE tipo_ruta = 'fabricacion'   AND numero = 2;
UPDATE produccion.paso_plantillas SET area_codigo = 'nucleo'     WHERE tipo_ruta = 'fabricacion'   AND numero = 3;
UPDATE produccion.paso_plantillas SET area_codigo = 'bobinado'   WHERE tipo_ruta = 'fabricacion'   AND numero = 4;
UPDATE produccion.paso_plantillas SET area_codigo = 'ensamble'   WHERE tipo_ruta = 'fabricacion'   AND numero = 5;
UPDATE produccion.paso_plantillas SET area_codigo = 'pruebas'    WHERE tipo_ruta = 'fabricacion'   AND numero = 6;
UPDATE produccion.paso_plantillas SET area_codigo = 'tanque'     WHERE tipo_ruta = 'fabricacion'   AND numero = 7;
UPDATE produccion.paso_plantillas SET area_codigo = 'pruebas'    WHERE tipo_ruta = 'fabricacion'   AND numero = 8;
UPDATE produccion.paso_plantillas SET area_codigo = 'pruebas'    WHERE tipo_ruta = 'fabricacion'   AND numero = 9;
UPDATE produccion.paso_plantillas SET area_codigo = 'pintura'    WHERE tipo_ruta = 'fabricacion'   AND numero = 10;
UPDATE produccion.paso_plantillas SET area_codigo = 'despacho'   WHERE tipo_ruta = 'fabricacion'   AND numero = 11;

UPDATE produccion.paso_plantillas SET area_codigo = 'servicio'   WHERE tipo_ruta = 'mantenimiento';

-- Asignar area a los pasos YA INSTANCIADOS de OT existentes (basado en plantilla)
-- (UPDATE ... FROM no permite JOIN sobre la tabla updateada; uso CTE)
WITH pasos_a_actualizar AS (
  SELECT op.id AS paso_id, a.id AS area_id
    FROM produccion.ot_pasos op
    JOIN produccion.ot              ot ON ot.id = op.ot_id
    JOIN produccion.paso_plantillas pp ON pp.tipo_ruta = ot.tipo_ruta AND pp.numero = op.numero
    JOIN produccion.areas           a  ON a.codigo = pp.area_codigo
   WHERE op.area_id IS NULL
)
UPDATE produccion.ot_pasos op
   SET area_id = p.area_id
  FROM pasos_a_actualizar p
 WHERE op.id = p.paso_id;

-- -------------------------------------------------------------------
-- Vistas agregadas para alimentar dashboard sin computar en runtime
-- -------------------------------------------------------------------

-- Carga por area: cuantas OT activas tienen pasos en curso en cada area
CREATE OR REPLACE VIEW produccion.v_carga_por_area AS
  SELECT
    a.id                                         AS area_id,
    a.codigo                                     AS area_codigo,
    a.nombre                                     AS area_nombre,
    a.color_hex,
    COUNT(DISTINCT op.ot_id) FILTER (WHERE op.estado IN ('en_curso','pendiente'))  AS ot_activas,
    COUNT(*) FILTER (WHERE op.estado = 'en_curso')                                 AS pasos_en_curso,
    COUNT(*) FILTER (WHERE op.estado = 'pendiente')                                AS pasos_pendientes,
    COUNT(*) FILTER (WHERE op.estado = 'completado'
                       AND op.fecha_fin >= NOW() - INTERVAL '30 days')             AS completados_mes
  FROM produccion.areas a
  LEFT JOIN produccion.ot_pasos op ON op.area_id = a.id
  LEFT JOIN produccion.ot       ot ON ot.id = op.ot_id
  WHERE a.activo = true
  GROUP BY a.id, a.codigo, a.nombre, a.color_hex, a.orden
  ORDER BY a.orden;

-- Productividad por responsable (ultimos 30 dias)
CREATE OR REPLACE VIEW produccion.v_productividad_responsable AS
  SELECT
    u.id                                         AS usuario_id,
    u.nombres || ' ' || u.apellidos              AS nombre,
    u.email,
    COUNT(DISTINCT tt.ot_id)                     AS ot_intervenidas_mes,
    COALESCE(SUM(tt.horas), 0)::numeric(8,2)     AS horas_mes,
    COUNT(DISTINCT op.id) FILTER (
      WHERE op.estado = 'completado'
        AND op.fecha_fin >= NOW() - INTERVAL '30 days'
    )                                            AS pasos_completados_mes
  FROM core.usuarios u
  LEFT JOIN produccion.tiempos_trabajo tt ON tt.usuario_id = u.id
                                          AND tt.fecha >= CURRENT_DATE - INTERVAL '30 days'
  LEFT JOIN produccion.ot_pasos op       ON op.ejecutado_por = u.id
  WHERE u.estado_aprobacion = 'aprobado'
  GROUP BY u.id, u.nombres, u.apellidos, u.email
  HAVING COUNT(DISTINCT tt.ot_id) > 0
      OR COUNT(DISTINCT op.id) FILTER (WHERE op.estado = 'completado'
                                          AND op.fecha_fin >= NOW() - INTERVAL '30 days') > 0
  ORDER BY horas_mes DESC, pasos_completados_mes DESC;

-- Causas de demora agregadas (con reprocesos)
CREATE OR REPLACE VIEW produccion.v_causas_demora_agregado AS
  SELECT
    c.id                                          AS causa_id,
    c.codigo,
    c.nombre,
    c.categoria,
    COUNT(r.id)                                   AS incidencias_total,
    COUNT(r.id) FILTER (WHERE NOT r.resuelto)     AS incidencias_abiertas,
    COALESCE(SUM(r.dias_perdidos), 0)::numeric(8,2) AS dias_perdidos_total,
    COALESCE(SUM(r.costo_estimado), 0)::numeric(14,2) AS costo_estimado_total
  FROM produccion.causas_demora c
  LEFT JOIN produccion.reprocesos r ON r.causa_demora_id = c.id
  WHERE c.activo = true
  GROUP BY c.id, c.codigo, c.nombre, c.categoria
  ORDER BY incidencias_total DESC, dias_perdidos_total DESC;

-- -------------------------------------------------------------------
-- Seed sintetico para que el dashboard muestre data real desde el dia 0
-- (genera tiempos_trabajo y un par de reprocesos sobre las 2 OT demo)
-- -------------------------------------------------------------------
DO $$
DECLARE
  v_user_id     UUID;
  v_ot1_id      BIGINT;
  v_ot2_id      BIGINT;
  v_area_bob    BIGINT;
  v_area_nuc    BIGINT;
  v_area_pru    BIGINT;
  v_paso        RECORD;
  v_causa_mat   BIGINT;
  v_causa_qa    BIGINT;
BEGIN
  SELECT id INTO v_user_id FROM core.usuarios WHERE email = 'pablobaquerizodavila@gmail.com' LIMIT 1;
  SELECT id INTO v_ot1_id FROM produccion.ot WHERE codigo = 'OT-2026-0001';
  SELECT id INTO v_ot2_id FROM produccion.ot WHERE codigo = 'OT-2026-0002';
  SELECT id INTO v_area_bob FROM produccion.areas WHERE codigo = 'bobinado';
  SELECT id INTO v_area_nuc FROM produccion.areas WHERE codigo = 'nucleo';
  SELECT id INTO v_area_pru FROM produccion.areas WHERE codigo = 'pruebas';
  SELECT id INTO v_causa_mat FROM produccion.causas_demora WHERE codigo = 'falta_material';
  SELECT id INTO v_causa_qa  FROM produccion.causas_demora WHERE codigo = 'reproceso_qa';

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'Usuario admin no encontrado, omitiendo seed';
    RETURN;
  END IF;

  -- Tiempos sobre OT-2026-0001 (reparacion, 3 pasos avanzados)
  IF v_ot1_id IS NOT NULL THEN
    FOR v_paso IN
      SELECT id, numero, area_id FROM produccion.ot_pasos WHERE ot_id = v_ot1_id AND area_id IS NOT NULL ORDER BY numero LIMIT 3
    LOOP
      INSERT INTO produccion.tiempos_trabajo (ot_id, paso_id, area_id, usuario_id, fecha, horas, descripcion)
      VALUES
        (v_ot1_id, v_paso.id, v_paso.area_id, v_user_id, CURRENT_DATE - 3, 8.0, 'Avance jornada 1'),
        (v_ot1_id, v_paso.id, v_paso.area_id, v_user_id, CURRENT_DATE - 2, 7.5, 'Avance jornada 2');
    END LOOP;
    -- Un reproceso sobre OT-2026-0001 paso 3
    INSERT INTO produccion.reprocesos (ot_id, paso_id, causa_demora_id, descripcion, dias_perdidos, reportado_por)
    SELECT v_ot1_id, p.id, v_causa_qa, 'Diagnostico requirio segunda revision por discrepancia en mediciones', 1.5, v_user_id
      FROM produccion.ot_pasos p WHERE p.ot_id = v_ot1_id AND p.numero = 3 LIMIT 1;
  END IF;

  -- Tiempos + reproceso sobre OT-2026-0002 (fabricacion, urgente atrasada)
  IF v_ot2_id IS NOT NULL THEN
    FOR v_paso IN
      SELECT id, numero, area_id FROM produccion.ot_pasos WHERE ot_id = v_ot2_id AND area_id IS NOT NULL ORDER BY numero LIMIT 5
    LOOP
      INSERT INTO produccion.tiempos_trabajo (ot_id, paso_id, area_id, usuario_id, fecha, horas, descripcion)
      VALUES (v_ot2_id, v_paso.id, v_paso.area_id, v_user_id, CURRENT_DATE - v_paso.numero, 8.0, 'Jornada productiva');
    END LOOP;
    INSERT INTO produccion.reprocesos (ot_id, paso_id, causa_demora_id, descripcion, dias_perdidos, reportado_por)
    SELECT v_ot2_id, p.id, v_causa_mat, 'Pedido de chapa magnetica llego con retraso del proveedor', 3.0, v_user_id
      FROM produccion.ot_pasos p WHERE p.ot_id = v_ot2_id AND p.numero = 2 LIMIT 1;
  END IF;

  RAISE NOTICE 'Seed sintetico aplicado';
END $$;

COMMIT;

-- ===================================================================
-- FIN migration 013
-- ===================================================================
