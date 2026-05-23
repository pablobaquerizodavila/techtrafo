-- ===================================================================
-- TECHTRAFO - Migracion 010: Expedientes + hitos + visitas + informes
-- ===================================================================
-- Version: 0.5.0
-- Fecha: 2026-05-23
-- Ejecutado en produccion: no
-- Reversible: no (solo IF NOT EXISTS, idempotente para CREATE)
--
-- Contenido:
--   - comercial.expedientes: raiz del ciclo de pedido (EXP-YYYY-NNNN)
--     enlaza cliente, cotizacion, contrato, OT, garantia bajo un codigo
--   - comercial.hito_plantillas: catalogo de hitos del proceso con SLA
--     y rol aprobador. Define orden, visibilidad cliente, automatico/manual
--   - comercial.expediente_hitos: instancias por expediente con estado,
--     responsable, fechas, aprobacion, motivo de rechazo, metadata
--   - comercial.visitas_tecnicas: registro de visitas en sitio o planta
--   - comercial.informes_tecnicos: diagnostico formal + decision tecnica
--   - core.notificaciones: log de notificaciones enviadas (estancamiento,
--     aprobacion requerida, etc.). Cron del backend marca enviado=true.
--   - Seed inicial: 16 hitos del proceso TECHTRAFO
-- ===================================================================

-- -------------------------------------------------------------------
-- Tabla: hito_plantillas (catalogo)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comercial.hito_plantillas (
    id                  BIGSERIAL PRIMARY KEY,
    codigo              VARCHAR(50) UNIQUE NOT NULL,
    nombre              VARCHAR(200) NOT NULL,
    descripcion         TEXT,
    orden               INT NOT NULL,
    tipo_servicio       VARCHAR(20) NOT NULL DEFAULT 'comun'
                        CHECK (tipo_servicio IN ('comun','reparacion','fabricacion','mantenimiento')),
    visible_cliente     BOOLEAN NOT NULL DEFAULT FALSE,
    requiere_aprobacion BOOLEAN NOT NULL DEFAULT FALSE,
    rol_aprobador_id    INT REFERENCES core.roles(id),
    sla_horas           INT,                                -- NULL si no aplica SLA
    es_automatico       BOOLEAN NOT NULL DEFAULT FALSE,     -- true: se completa sin accion humana
    fuente_tabla        VARCHAR(50),                        -- ej: 'cotizaciones' para hitos vinculados a entidades existentes
    activo              BOOLEAN NOT NULL DEFAULT TRUE,
    creado_por          UUID REFERENCES core.usuarios(id),
    actualizado_por     UUID REFERENCES core.usuarios(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hito_plantillas_tipo_orden
  ON comercial.hito_plantillas(tipo_servicio, orden) WHERE activo = TRUE;

-- -------------------------------------------------------------------
-- Tabla: expedientes (raiz del ciclo de pedido)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comercial.expedientes (
    id                          BIGSERIAL PRIMARY KEY,
    codigo                      VARCHAR(30) UNIQUE,                     -- EXP-2026-0001
    cliente_id                  BIGINT NOT NULL REFERENCES comercial.clientes(id),
    contacto_id                 BIGINT REFERENCES comercial.cliente_contactos(id),
    ejecutivo_id                UUID REFERENCES core.usuarios(id),
    canal_origen                VARCHAR(20)
                                CHECK (canal_origen IS NULL OR canal_origen IN ('web','whatsapp','telefono','email','referido','visita_directa','otro')),
    tipo_servicio_estimado      VARCHAR(20)
                                CHECK (tipo_servicio_estimado IS NULL OR tipo_servicio_estimado IN ('reparacion','fabricacion','mantenimiento','otro')),
    tipo_servicio_confirmado    VARCHAR(20)                              -- se llena al aprobar el informe tecnico
                                CHECK (tipo_servicio_confirmado IS NULL OR tipo_servicio_confirmado IN ('reparacion','fabricacion','mantenimiento','otro')),
    descripcion_problema        TEXT,
    cotizacion_id               BIGINT REFERENCES comercial.cotizaciones(id),
    contrato_id                 BIGINT REFERENCES comercial.contratos(id),
    ot_id                       BIGINT REFERENCES produccion.ot(id),
    garantia_id                 BIGINT REFERENCES posventa.garantias(id),
    estado                      VARCHAR(20) NOT NULL DEFAULT 'activo'
                                CHECK (estado IN ('activo','ganado','perdido','cancelado')),
    motivo_cierre               TEXT,
    fecha_apertura              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_cierre                TIMESTAMPTZ,
    creado_por                  UUID REFERENCES core.usuarios(id),
    actualizado_por             UUID REFERENCES core.usuarios(id),
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expedientes_cliente   ON comercial.expedientes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_expedientes_ejecutivo ON comercial.expedientes(ejecutivo_id);
CREATE INDEX IF NOT EXISTS idx_expedientes_estado    ON comercial.expedientes(estado);
CREATE INDEX IF NOT EXISTS idx_expedientes_cotizacion ON comercial.expedientes(cotizacion_id) WHERE cotizacion_id IS NOT NULL;

-- -------------------------------------------------------------------
-- Tabla: expediente_hitos (instancias por expediente)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comercial.expediente_hitos (
    id                          BIGSERIAL PRIMARY KEY,
    expediente_id               BIGINT NOT NULL REFERENCES comercial.expedientes(id) ON DELETE CASCADE,
    plantilla_id                BIGINT REFERENCES comercial.hito_plantillas(id),
    codigo                      VARCHAR(50) NOT NULL,
    nombre                      VARCHAR(200) NOT NULL,
    orden                       INT NOT NULL,
    visible_cliente             BOOLEAN NOT NULL DEFAULT FALSE,
    requiere_aprobacion         BOOLEAN NOT NULL DEFAULT FALSE,
    rol_aprobador_id            INT REFERENCES core.roles(id),
    sla_horas                   INT,
    estado                      VARCHAR(20) NOT NULL DEFAULT 'no_iniciado'
                                CHECK (estado IN ('no_iniciado','en_curso','bloqueado','completado','rechazado','omitido')),
    responsable_id              UUID REFERENCES core.usuarios(id),
    fecha_inicio                TIMESTAMPTZ,
    fecha_fin                   TIMESTAMPTZ,
    fecha_alerta_estancamiento  TIMESTAMPTZ,
    aprobado_por                UUID REFERENCES core.usuarios(id),
    fecha_aprobacion            TIMESTAMPTZ,
    motivo_rechazo              TEXT,
    notas                       TEXT,
    metadata                    JSONB DEFAULT '{}'::jsonb,
    creado_por                  UUID REFERENCES core.usuarios(id),
    actualizado_por             UUID REFERENCES core.usuarios(id),
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (expediente_id, codigo),
    CHECK (fecha_fin IS NULL OR fecha_inicio IS NULL OR fecha_fin >= fecha_inicio)
);
CREATE INDEX IF NOT EXISTS idx_exp_hitos_expediente ON comercial.expediente_hitos(expediente_id);
CREATE INDEX IF NOT EXISTS idx_exp_hitos_estado     ON comercial.expediente_hitos(estado);
CREATE INDEX IF NOT EXISTS idx_exp_hitos_responsable ON comercial.expediente_hitos(responsable_id);
-- Indice util para el cron de deteccion de estancados:
CREATE INDEX IF NOT EXISTS idx_exp_hitos_estancados
  ON comercial.expediente_hitos(fecha_inicio, sla_horas)
  WHERE estado = 'en_curso' AND sla_horas IS NOT NULL AND fecha_alerta_estancamiento IS NULL;

-- -------------------------------------------------------------------
-- Tabla: visitas_tecnicas
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comercial.visitas_tecnicas (
    id                  BIGSERIAL PRIMARY KEY,
    expediente_id       BIGINT NOT NULL REFERENCES comercial.expedientes(id) ON DELETE CASCADE,
    hito_id             BIGINT REFERENCES comercial.expediente_hitos(id),
    fecha_programada    DATE,
    fecha_realizada     TIMESTAMPTZ,
    ubicacion_tipo      VARCHAR(20) NOT NULL DEFAULT 'sitio_cliente'
                        CHECK (ubicacion_tipo IN ('sitio_cliente','planta','virtual')),
    direccion           TEXT,
    ingeniero_id        UUID REFERENCES core.usuarios(id),
    hallazgos           TEXT,
    fotos_urls          TEXT[],                                  -- paths MinIO (cuando este conectado)
    recomendacion       VARCHAR(20)
                        CHECK (recomendacion IS NULL OR recomendacion IN ('reparar','reconstruir','mantenimiento','no_viable')),
    observaciones       TEXT,
    estado              VARCHAR(20) NOT NULL DEFAULT 'programada'
                        CHECK (estado IN ('programada','realizada','cancelada')),
    creado_por          UUID REFERENCES core.usuarios(id),
    actualizado_por     UUID REFERENCES core.usuarios(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_visitas_expediente ON comercial.visitas_tecnicas(expediente_id);
CREATE INDEX IF NOT EXISTS idx_visitas_fecha      ON comercial.visitas_tecnicas(fecha_programada);

-- -------------------------------------------------------------------
-- Tabla: informes_tecnicos
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comercial.informes_tecnicos (
    id                      BIGSERIAL PRIMARY KEY,
    expediente_id           BIGINT NOT NULL REFERENCES comercial.expedientes(id) ON DELETE CASCADE,
    hito_id                 BIGINT REFERENCES comercial.expediente_hitos(id),
    visita_id               BIGINT REFERENCES comercial.visitas_tecnicas(id),
    numero                  VARCHAR(30) UNIQUE,                  -- INF-2026-0001
    diagnostico_completo    TEXT,
    decision_tecnica        VARCHAR(20)
                            CHECK (decision_tecnica IS NULL OR decision_tecnica IN ('reparar','reconstruir','mantenimiento','no_viable')),
    justificacion           TEXT,
    archivo_pdf_url         TEXT,                                  -- MinIO
    aprobado_por            UUID REFERENCES core.usuarios(id),
    fecha_aprobacion        TIMESTAMPTZ,
    estado                  VARCHAR(20) NOT NULL DEFAULT 'borrador'
                            CHECK (estado IN ('borrador','en_revision','aprobado','rechazado')),
    creado_por              UUID REFERENCES core.usuarios(id),
    actualizado_por         UUID REFERENCES core.usuarios(id),
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_informes_expediente ON comercial.informes_tecnicos(expediente_id);

-- -------------------------------------------------------------------
-- Tabla: notificaciones (log de envios)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS core.notificaciones (
    id                  BIGSERIAL PRIMARY KEY,
    tipo                VARCHAR(40) NOT NULL,                   -- 'estancamiento_hito' | 'aprobacion_requerida' | etc.
    destinatario_id     UUID REFERENCES core.usuarios(id),
    destinatario_email  VARCHAR(255) NOT NULL,
    asunto              VARCHAR(200) NOT NULL,
    cuerpo_html         TEXT,
    cuerpo_texto        TEXT,
    enviado             BOOLEAN NOT NULL DEFAULT FALSE,
    intento_count       INT NOT NULL DEFAULT 0,
    error               TEXT,
    fecha_envio         TIMESTAMPTZ,
    contexto            JSONB DEFAULT '{}'::jsonb,              -- { expediente_id, hito_id, ... }
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_enviado ON core.notificaciones(enviado, created_at) WHERE enviado = FALSE;
CREATE INDEX IF NOT EXISTS idx_notif_destinatario ON core.notificaciones(destinatario_id, created_at DESC);

-- -------------------------------------------------------------------
-- Triggers de updated_at y auditoria en las nuevas tablas
-- -------------------------------------------------------------------
DROP TRIGGER IF EXISTS tg_hito_plantillas_updated_at ON comercial.hito_plantillas;
CREATE TRIGGER tg_hito_plantillas_updated_at BEFORE UPDATE ON comercial.hito_plantillas
    FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

DROP TRIGGER IF EXISTS tg_hito_plantillas_auditar ON comercial.hito_plantillas;
CREATE TRIGGER tg_hito_plantillas_auditar AFTER INSERT OR UPDATE OR DELETE ON comercial.hito_plantillas
    FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

DROP TRIGGER IF EXISTS tg_expedientes_updated_at ON comercial.expedientes;
CREATE TRIGGER tg_expedientes_updated_at BEFORE UPDATE ON comercial.expedientes
    FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

DROP TRIGGER IF EXISTS tg_expedientes_auditar ON comercial.expedientes;
CREATE TRIGGER tg_expedientes_auditar AFTER INSERT OR UPDATE OR DELETE ON comercial.expedientes
    FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

DROP TRIGGER IF EXISTS tg_exp_hitos_updated_at ON comercial.expediente_hitos;
CREATE TRIGGER tg_exp_hitos_updated_at BEFORE UPDATE ON comercial.expediente_hitos
    FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

DROP TRIGGER IF EXISTS tg_exp_hitos_auditar ON comercial.expediente_hitos;
CREATE TRIGGER tg_exp_hitos_auditar AFTER INSERT OR UPDATE OR DELETE ON comercial.expediente_hitos
    FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

DROP TRIGGER IF EXISTS tg_visitas_updated_at ON comercial.visitas_tecnicas;
CREATE TRIGGER tg_visitas_updated_at BEFORE UPDATE ON comercial.visitas_tecnicas
    FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

DROP TRIGGER IF EXISTS tg_visitas_auditar ON comercial.visitas_tecnicas;
CREATE TRIGGER tg_visitas_auditar AFTER INSERT OR UPDATE OR DELETE ON comercial.visitas_tecnicas
    FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

DROP TRIGGER IF EXISTS tg_informes_updated_at ON comercial.informes_tecnicos;
CREATE TRIGGER tg_informes_updated_at BEFORE UPDATE ON comercial.informes_tecnicos
    FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

DROP TRIGGER IF EXISTS tg_informes_auditar ON comercial.informes_tecnicos;
CREATE TRIGGER tg_informes_auditar AFTER INSERT OR UPDATE OR DELETE ON comercial.informes_tecnicos
    FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

DROP TRIGGER IF EXISTS tg_notif_updated_at ON core.notificaciones;
CREATE TRIGGER tg_notif_updated_at BEFORE UPDATE ON core.notificaciones
    FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

-- -------------------------------------------------------------------
-- Trigger: sincronizar hitos automaticos cuando cambian entidades vinculadas
--
-- Cuando una cotizacion pasa a 'aprobada', el hito 'aprobacion_cliente'
-- del expediente vinculado se marca completado.
-- Idem para contrato firmado, OT completada, etc.
-- -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION comercial.fn_sync_hito_cotizacion()
RETURNS TRIGGER AS $$
DECLARE
    v_expediente_id BIGINT;
BEGIN
    -- Buscar expediente vinculado a esta cotizacion
    SELECT id INTO v_expediente_id FROM comercial.expedientes WHERE cotizacion_id = NEW.id;
    IF v_expediente_id IS NULL THEN RETURN NEW; END IF;

    -- Cotizacion emitida (al crear)
    IF TG_OP = 'INSERT' THEN
        UPDATE comercial.expediente_hitos
           SET estado = 'completado', fecha_fin = NOW()
         WHERE expediente_id = v_expediente_id AND codigo = 'cotizacion' AND estado <> 'completado';
        UPDATE comercial.expediente_hitos
           SET estado = 'en_curso', fecha_inicio = COALESCE(fecha_inicio, NOW())
         WHERE expediente_id = v_expediente_id AND codigo = 'aprobacion_cliente' AND estado = 'no_iniciado';
    END IF;

    -- Cambio de estado de cotizacion
    IF TG_OP = 'UPDATE' AND OLD.estado IS DISTINCT FROM NEW.estado THEN
        IF NEW.estado = 'aprobada' THEN
            UPDATE comercial.expediente_hitos
               SET estado = 'completado', fecha_fin = NOW()
             WHERE expediente_id = v_expediente_id AND codigo = 'aprobacion_cliente' AND estado <> 'completado';
        ELSIF NEW.estado = 'rechazada' THEN
            UPDATE comercial.expediente_hitos
               SET estado = 'rechazado', fecha_fin = NOW(), motivo_rechazo = 'Cotizacion rechazada por cliente'
             WHERE expediente_id = v_expediente_id AND codigo = 'aprobacion_cliente';
            UPDATE comercial.expedientes
               SET estado = 'perdido', motivo_cierre = 'Cotizacion rechazada', fecha_cierre = NOW()
             WHERE id = v_expediente_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_sync_hito_cotizacion ON comercial.cotizaciones;
CREATE TRIGGER tg_sync_hito_cotizacion
    AFTER INSERT OR UPDATE OF estado ON comercial.cotizaciones
    FOR EACH ROW EXECUTE FUNCTION comercial.fn_sync_hito_cotizacion();

-- Idem para contratos
CREATE OR REPLACE FUNCTION comercial.fn_sync_hito_contrato()
RETURNS TRIGGER AS $$
DECLARE v_expediente_id BIGINT;
BEGIN
    SELECT id INTO v_expediente_id FROM comercial.expedientes WHERE contrato_id = NEW.id;
    IF v_expediente_id IS NULL THEN
        -- Si no esta vinculado pero la cotizacion lo esta, vincular el contrato
        UPDATE comercial.expedientes SET contrato_id = NEW.id
         WHERE cotizacion_id = NEW.cotizacion_id AND contrato_id IS NULL
         RETURNING id INTO v_expediente_id;
    END IF;
    IF v_expediente_id IS NULL THEN RETURN NEW; END IF;

    IF TG_OP = 'INSERT' THEN
        UPDATE comercial.expediente_hitos
           SET estado = 'completado', fecha_fin = NOW()
         WHERE expediente_id = v_expediente_id AND codigo = 'contrato' AND estado <> 'completado';
        UPDATE comercial.expediente_hitos
           SET estado = 'en_curso', fecha_inicio = COALESCE(fecha_inicio, NOW())
         WHERE expediente_id = v_expediente_id AND codigo = 'anticipo' AND estado = 'no_iniciado';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_sync_hito_contrato ON comercial.contratos;
CREATE TRIGGER tg_sync_hito_contrato
    AFTER INSERT OR UPDATE OF estado ON comercial.contratos
    FOR EACH ROW EXECUTE FUNCTION comercial.fn_sync_hito_contrato();

-- Idem para OT
CREATE OR REPLACE FUNCTION produccion.fn_sync_hito_ot()
RETURNS TRIGGER AS $$
DECLARE v_expediente_id BIGINT;
BEGIN
    SELECT id INTO v_expediente_id FROM comercial.expedientes WHERE ot_id = NEW.id;
    IF v_expediente_id IS NULL THEN RETURN NEW; END IF;

    IF TG_OP = 'UPDATE' AND OLD.estado IS DISTINCT FROM NEW.estado THEN
        IF NEW.estado = 'completada' THEN
            UPDATE comercial.expediente_hitos
               SET estado = 'completado', fecha_fin = NOW()
             WHERE expediente_id = v_expediente_id AND codigo IN ('reparacion','fabricacion','pruebas_finales')
               AND estado <> 'completado';
            UPDATE comercial.expediente_hitos
               SET estado = 'en_curso', fecha_inicio = COALESCE(fecha_inicio, NOW())
             WHERE expediente_id = v_expediente_id AND codigo = 'entrega' AND estado = 'no_iniciado';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_sync_hito_ot ON produccion.ot;
CREATE TRIGGER tg_sync_hito_ot
    AFTER UPDATE OF estado ON produccion.ot
    FOR EACH ROW EXECUTE FUNCTION produccion.fn_sync_hito_ot();

-- -------------------------------------------------------------------
-- Seed: catalogo de 16 hitos del proceso TECHTRAFO
-- Solo se insertan si la tabla esta vacia (idempotente)
-- -------------------------------------------------------------------
INSERT INTO comercial.hito_plantillas
  (codigo, nombre, orden, tipo_servicio, visible_cliente, requiere_aprobacion, rol_aprobador_id, sla_horas, es_automatico, fuente_tabla, descripcion)
SELECT * FROM (VALUES
  ('captacion',           'Lead captado',                  1,  'comun',        true,  false, NULL,                                                                                NULL, true,  'expedientes',       'Registro inicial del cliente y problema'),
  ('validacion_credito',  'Validación de crédito',         2,  'comun',        false, true,  (SELECT id FROM core.roles WHERE nombre = 'gerencia_comercial'),                      48,   false, 'clientes',          'Confirmar términos de pago y línea de crédito'),
  ('visita_tecnica',      'Visita técnica',                3,  'comun',        true,  true,  (SELECT id FROM core.roles WHERE nombre = 'ingeniero_diagnostico'),                   72,   false, 'visitas_tecnicas',  'Inspección en sitio o recepción de equipo para diagnóstico'),
  ('informe_tecnico',     'Informe técnico',               4,  'comun',        true,  true,  (SELECT id FROM core.roles WHERE nombre = 'jefe_planta'),                             48,   false, 'informes_tecnicos', 'Diagnóstico formal y decisión técnica: reparar / reconstruir'),
  ('cotizacion',          'Cotización emitida',            5,  'comun',        true,  false, NULL,                                                                                24,   true,  'cotizaciones',      'Cotización formal enviada al cliente'),
  ('aprobacion_cliente',  'Aprobación del cliente',        6,  'comun',        true,  false, NULL,                                                                                168,  true,  'cotizaciones',      'Espera de respuesta del cliente'),
  ('contrato',            'Contrato firmado',              7,  'comun',        true,  false, NULL,                                                                                48,   true,  'contratos',         'Firma del contrato'),
  ('anticipo',            'Anticipo cobrado',              8,  'comun',        true,  false, NULL,                                                                                168,  true,  'contrato_pagos',    'Confirmación de pago del anticipo'),
  ('recepcion_fisica',    'Recepción física en planta',    9,  'reparacion',   true,  true,  (SELECT id FROM core.roles WHERE nombre = 'jefe_planta'),                             24,   false, 'ot',                'Recepción y checklist inicial del equipo'),
  ('desmontaje',          'Desmontaje y diagnóstico',     10,  'reparacion',   true,  false, NULL,                                                                                72,   true,  'ot_pasos',          'Desmontaje y pruebas internas'),
  ('reparacion',          'Reparación / reconstrucción',  11,  'reparacion',   true,  false, NULL,                                                                                480,  true,  'ot_pasos',          'Trabajo en planta'),
  ('fabricacion',         'Fabricación',                   9,  'fabricacion',  true,  false, NULL,                                                                                720,  true,  'ot_pasos',          'Fabricación del transformador nuevo'),
  ('pruebas_finales',     'Pruebas finales QA',           12,  'comun',        true,  true,  (SELECT id FROM core.roles WHERE nombre = 'qa'),                                      48,   false, 'ot_pasos',          'Ensayos de aceptación y certificación'),
  ('entrega',             'Entrega + acta',               13,  'comun',        true,  false, NULL,                                                                                72,   true,  'ot',                'Entrega física al cliente con acta firmada'),
  ('garantia_activa',     'Garantía activa',              14,  'comun',        true,  false, NULL,                                                                                NULL, true,  'garantias',         'Garantía emitida y vigente'),
  ('nps',                 'Encuesta NPS',                 15,  'comun',        false, false, NULL,                                                                                168,  false, NULL,                'Encuesta de satisfacción posventa'),
  ('mant_preventivo',     'Mantenimiento programado',     16,  'mantenimiento',false, false, NULL,                                                                                NULL, false, NULL,                'Programa de mantenimiento preventivo')
) AS v(codigo, nombre, orden, tipo_servicio, visible_cliente, requiere_aprobacion, rol_aprobador_id, sla_horas, es_automatico, fuente_tabla, descripcion)
WHERE NOT EXISTS (SELECT 1 FROM comercial.hito_plantillas WHERE codigo = v.codigo);

-- -------------------------------------------------------------------
-- Vista: v_expediente_pipeline (timeline completo con estado calculado)
-- -------------------------------------------------------------------
CREATE OR REPLACE VIEW comercial.v_expediente_pipeline AS
SELECT
    e.id              AS expediente_id,
    e.codigo          AS expediente_codigo,
    e.cliente_id,
    cl.razon_social   AS cliente_nombre,
    e.estado          AS expediente_estado,
    h.id              AS hito_id,
    h.codigo          AS hito_codigo,
    h.nombre          AS hito_nombre,
    h.orden           AS hito_orden,
    h.estado          AS hito_estado,
    h.visible_cliente,
    h.requiere_aprobacion,
    h.responsable_id,
    h.sla_horas,
    h.fecha_inicio,
    h.fecha_fin,
    -- Calcular si esta estancado: en_curso + tiene SLA + ha pasado mas que SLA desde fecha_inicio
    CASE
        WHEN h.estado = 'en_curso' AND h.sla_horas IS NOT NULL AND h.fecha_inicio IS NOT NULL
             AND EXTRACT(EPOCH FROM (NOW() - h.fecha_inicio)) / 3600 > h.sla_horas
        THEN true
        ELSE false
    END                AS estancado,
    -- Horas transcurridas en hito en curso
    CASE
        WHEN h.estado = 'en_curso' AND h.fecha_inicio IS NOT NULL
        THEN ROUND(EXTRACT(EPOCH FROM (NOW() - h.fecha_inicio)) / 3600, 1)
        ELSE NULL
    END                AS horas_transcurridas,
    h.aprobado_por,
    h.motivo_rechazo,
    h.metadata
FROM comercial.expedientes e
JOIN comercial.clientes cl ON cl.id = e.cliente_id
JOIN comercial.expediente_hitos h ON h.expediente_id = e.id
ORDER BY e.id, h.orden;
