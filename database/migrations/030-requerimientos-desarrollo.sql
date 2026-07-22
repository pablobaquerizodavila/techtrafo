-- ===================================================================
-- TECHTRAFO - Migracion 030: Requerimientos de Desarrollo (DEV)
-- ===================================================================
-- Version: 0.18.0
-- Fecha: 2026-07-22
-- Ejecutado en produccion: no
-- Reversible: no (idempotente, IF NOT EXISTS)
--
-- Contenido:
--   - Schema desarrollo
--   - Tablas: requerimientos, requerimiento_comentarios, _adjuntos, _historial
--   - Trigger fn_generar_codigo_dev (DEV-000001)
--   - Triggers updated_at + auditar
--   - Rol 'desarrollo' + permisos desarrollo.* a roles internos
-- ===================================================================

CREATE SCHEMA IF NOT EXISTS desarrollo;

-- ---------- Tabla principal ----------
CREATE TABLE IF NOT EXISTS desarrollo.requerimientos (
    id                      BIGSERIAL PRIMARY KEY,
    codigo                  VARCHAR(30) UNIQUE NOT NULL,
    titulo                  VARCHAR(200) NOT NULL,
    tipo                    VARCHAR(30) NOT NULL
        CHECK (tipo IN ('nuevo_desarrollo','mejora','correccion_error','cambio_configuracion','integracion','reporte_consulta','otro')),
    modulo_relacionado      VARCHAR(120),
    descripcion             TEXT NOT NULL,
    problema                TEXT,
    resultado_esperado      TEXT,
    prioridad_sugerida      VARCHAR(10) NOT NULL DEFAULT 'media'
        CHECK (prioridad_sugerida IN ('baja','media','alta','urgente')),
    prioridad               VARCHAR(10)
        CHECK (prioridad IS NULL OR prioridad IN ('baja','media','alta','urgente')),
    estado                  VARCHAR(25) NOT NULL DEFAULT 'registrado'
        CHECK (estado IN ('registrado','en_revision','pendiente_informacion','aprobado','rechazado','en_planificacion','en_desarrollo','en_pruebas','listo_produccion','completado','cancelado')),
    solicitante_id          UUID NOT NULL REFERENCES core.usuarios(id),
    asignado_a              UUID REFERENCES core.usuarios(id),
    fecha_requerida         DATE,
    fecha_estimada_entrega  DATE,
    creado_por              UUID REFERENCES core.usuarios(id),
    actualizado_por         UUID REFERENCES core.usuarios(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_req_estado       ON desarrollo.requerimientos(estado);
CREATE INDEX IF NOT EXISTS idx_req_asignado     ON desarrollo.requerimientos(asignado_a);
CREATE INDEX IF NOT EXISTS idx_req_solicitante  ON desarrollo.requerimientos(solicitante_id);
CREATE INDEX IF NOT EXISTS idx_req_created      ON desarrollo.requerimientos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_req_prioridad    ON desarrollo.requerimientos(prioridad);

-- ---------- Comentarios (inmutables) ----------
CREATE TABLE IF NOT EXISTS desarrollo.requerimiento_comentarios (
    id                BIGSERIAL PRIMARY KEY,
    requerimiento_id  BIGINT NOT NULL REFERENCES desarrollo.requerimientos(id) ON DELETE CASCADE,
    autor_id          UUID REFERENCES core.usuarios(id),
    cuerpo            TEXT NOT NULL,
    es_tecnico        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reqcom_req ON desarrollo.requerimiento_comentarios(requerimiento_id, created_at);

-- ---------- Adjuntos ----------
CREATE TABLE IF NOT EXISTS desarrollo.requerimiento_adjuntos (
    id                BIGSERIAL PRIMARY KEY,
    requerimiento_id  BIGINT NOT NULL REFERENCES desarrollo.requerimientos(id) ON DELETE CASCADE,
    ruta_relativa     TEXT NOT NULL,
    nombre_original   VARCHAR(255),
    mime              VARCHAR(120),
    tamano_bytes      BIGINT,
    subido_por        UUID REFERENCES core.usuarios(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reqadj_req ON desarrollo.requerimiento_adjuntos(requerimiento_id);

-- ---------- Historial (append-only) ----------
CREATE TABLE IF NOT EXISTS desarrollo.requerimiento_historial (
    id                BIGSERIAL PRIMARY KEY,
    requerimiento_id  BIGINT NOT NULL REFERENCES desarrollo.requerimientos(id) ON DELETE CASCADE,
    accion            VARCHAR(30) NOT NULL
        CHECK (accion IN ('creado','cambio_estado','cambio_prioridad','cambio_responsable','solicitud_info','comentario','adjunto','modificacion','estimacion')),
    detalle           JSONB NOT NULL DEFAULT '{}'::jsonb,
    por_usuario_id    UUID REFERENCES core.usuarios(id),
    rol_actuante      VARCHAR(50),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reqhist_req ON desarrollo.requerimiento_historial(requerimiento_id, created_at DESC);

-- ---------- Generador de codigo DEV-000001 ----------
CREATE OR REPLACE FUNCTION desarrollo.fn_generar_codigo_dev()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_max INT;
BEGIN
  IF NEW.codigo IS NOT NULL AND LENGTH(NEW.codigo) > 0 THEN RETURN NEW; END IF;
  SELECT COALESCE(MAX(SUBSTRING(codigo FROM 5)::INTEGER), 0) INTO v_max
    FROM desarrollo.requerimientos WHERE codigo LIKE 'DEV-%';
  NEW.codigo := 'DEV-' || LPAD((v_max + 1)::TEXT, 6, '0');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tg_req_codigo ON desarrollo.requerimientos;
CREATE TRIGGER tg_req_codigo BEFORE INSERT ON desarrollo.requerimientos
  FOR EACH ROW EXECUTE FUNCTION desarrollo.fn_generar_codigo_dev();

-- ---------- updated_at + auditar ----------
DROP TRIGGER IF EXISTS tg_req_updated_at ON desarrollo.requerimientos;
CREATE TRIGGER tg_req_updated_at BEFORE UPDATE ON desarrollo.requerimientos
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();
DROP TRIGGER IF EXISTS tg_req_auditar ON desarrollo.requerimientos;
CREATE TRIGGER tg_req_auditar AFTER INSERT OR UPDATE OR DELETE ON desarrollo.requerimientos
  FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();
DROP TRIGGER IF EXISTS tg_reqcom_auditar ON desarrollo.requerimiento_comentarios;
CREATE TRIGGER tg_reqcom_auditar AFTER INSERT OR UPDATE OR DELETE ON desarrollo.requerimiento_comentarios
  FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();
DROP TRIGGER IF EXISTS tg_reqadj_auditar ON desarrollo.requerimiento_adjuntos;
CREATE TRIGGER tg_reqadj_auditar AFTER INSERT OR UPDATE OR DELETE ON desarrollo.requerimiento_adjuntos
  FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

-- ---------- Rol y permisos ----------
INSERT INTO core.roles (nombre, descripcion, permisos, activo)
VALUES ('desarrollo', 'Area de Desarrollo (gestiona requerimientos)',
        jsonb_build_object('desarrollo.read',true,'desarrollo.crear',true,'desarrollo.gestionar',true), TRUE)
ON CONFLICT (nombre) DO NOTHING;

UPDATE core.roles
   SET permisos = permisos || jsonb_build_object('desarrollo.read',true,'desarrollo.crear',true)
 WHERE nombre NOT IN ('cliente_externo','cliente');
