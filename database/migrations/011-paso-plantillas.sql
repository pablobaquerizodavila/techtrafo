-- ===================================================================
-- Migration 011: plantillas de pasos para OT
-- ===================================================================
-- Crea catalogo de pasos tipicos por tipo_ruta (reparacion / fabricacion
-- / mantenimiento). Al crear una OT, se clonan estos pasos en ot_pasos.
--
-- Los pasos marcados como "gate" representan controles de calidad que
-- requieren aprobacion antes de avanzar al siguiente paso.
-- ===================================================================

BEGIN;

-- -------------------------------------------------------------------
-- Tabla de plantillas
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS produccion.paso_plantillas (
  id              BIGSERIAL PRIMARY KEY,
  tipo_ruta       VARCHAR(20) NOT NULL CHECK (tipo_ruta IN ('reparacion','fabricacion','mantenimiento')),
  numero          INTEGER NOT NULL CHECK (numero > 0),
  nombre          VARCHAR(200) NOT NULL,
  descripcion     TEXT,
  es_gate         BOOLEAN NOT NULL DEFAULT false,
  numero_gate     INTEGER CHECK (numero_gate IS NULL OR (numero_gate BETWEEN 1 AND 5)),
  activo          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tipo_ruta, numero),
  CHECK ( (es_gate = true  AND numero_gate IS NOT NULL)
       OR (es_gate = false AND numero_gate IS NULL) )
);

CREATE INDEX IF NOT EXISTS idx_paso_plantillas_tipo ON produccion.paso_plantillas(tipo_ruta, numero);

DROP TRIGGER IF EXISTS tg_paso_plantillas_updated_at ON produccion.paso_plantillas;
CREATE TRIGGER tg_paso_plantillas_updated_at
  BEFORE UPDATE ON produccion.paso_plantillas
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

-- -------------------------------------------------------------------
-- Seed: pasos tipicos por ruta
-- -------------------------------------------------------------------

-- Ruta REPARACION (transformador con falla)
INSERT INTO produccion.paso_plantillas (tipo_ruta, numero, nombre, descripcion, es_gate, numero_gate) VALUES
  ('reparacion',  1, 'Recepcion y registro fisico',     'Verificar serie, etiquetar y fotografiar estado inicial', false, NULL),
  ('reparacion',  2, 'Desmontaje y diagnostico',        'Apertura, inspeccion visual interna, pruebas electricas', false, NULL),
  ('reparacion',  3, 'GATE 1: Diagnostico aprobado',    'Validar diagnostico antes de autorizar reparacion',       true,  1),
  ('reparacion',  4, 'Bobinado / reparacion mecanica',  'Ejecutar trabajos de reparacion segun diagnostico',       false, NULL),
  ('reparacion',  5, 'Secado y aceite',                 'Tratamiento de bobinas y rellenado de aceite mineral',    false, NULL),
  ('reparacion',  6, 'Pruebas electricas FAT',          'Aislamiento, relacion, perdidas, rigidez dielectrica',    false, NULL),
  ('reparacion',  7, 'GATE 2: QA final aprobado',       'Verificacion final de cumplimiento de specs',             true,  2),
  ('reparacion',  8, 'Pintura y armado final',          'Acabado externo, etiquetado, embalaje',                   false, NULL),
  ('reparacion',  9, 'Despacho y entrega',              'Coordinacion de transporte y entrega al cliente',         false, NULL)
ON CONFLICT (tipo_ruta, numero) DO NOTHING;

-- Ruta FABRICACION (transformador nuevo)
INSERT INTO produccion.paso_plantillas (tipo_ruta, numero, nombre, descripcion, es_gate, numero_gate) VALUES
  ('fabricacion', 1, 'Compra de materiales',            'Pedido de chapa, alambre, aceite y herrajes',             false, NULL),
  ('fabricacion', 2, 'GATE 1: Materiales recibidos',    'Verificar calidad y especs de materiales recibidos',      true,  1),
  ('fabricacion', 3, 'Corte y armado del nucleo',       'Apilado de chapa magnetica y armado de nucleo',           false, NULL),
  ('fabricacion', 4, 'Bobinado primario y secundario',  'Construccion de bobinas segun calculo de diseño',         false, NULL),
  ('fabricacion', 5, 'Ensamble parte activa',           'Montaje de bobinas sobre nucleo + conexiones',            false, NULL),
  ('fabricacion', 6, 'GATE 2: Parte activa aprobada',   'Inspeccion previa al cierre del tanque',                  true,  2),
  ('fabricacion', 7, 'Tanqueo y llenado de aceite',     'Cierre hermetico, secado al vacio, llenado con aceite',   false, NULL),
  ('fabricacion', 8, 'Pruebas FAT completas',           'Bateria completa de pruebas de fabrica',                  false, NULL),
  ('fabricacion', 9, 'GATE 3: FAT aprobado',            'Aprobacion final del cliente o testigo',                  true,  3),
  ('fabricacion',10, 'Pintura y acabado',               'Pintura, etiquetado, accesorios externos',                false, NULL),
  ('fabricacion',11, 'Despacho y entrega',              'Coordinacion de transporte y entrega',                    false, NULL)
ON CONFLICT (tipo_ruta, numero) DO NOTHING;

-- Ruta MANTENIMIENTO (transformador en sitio)
INSERT INTO produccion.paso_plantillas (tipo_ruta, numero, nombre, descripcion, es_gate, numero_gate) VALUES
  ('mantenimiento', 1, 'Coordinacion con cliente',      'Confirmar ventana, accesos, EPP y desenergizacion',       false, NULL),
  ('mantenimiento', 2, 'Inspeccion visual en sitio',    'Verificacion externa + toma de muestra de aceite',        false, NULL),
  ('mantenimiento', 3, 'Pruebas en sitio',              'Aislamiento, relacion, factor de potencia',               false, NULL),
  ('mantenimiento', 4, 'Tareas correctivas menores',    'Ajustes, limpieza, reposicion de aceite si aplica',       false, NULL),
  ('mantenimiento', 5, 'GATE 1: Servicio aprobado',     'Acta firmada con resultados y recomendaciones',           true,  1),
  ('mantenimiento', 6, 'Energizacion y entrega',        'Reenergizacion supervisada y entrega al cliente',         false, NULL)
ON CONFLICT (tipo_ruta, numero) DO NOTHING;

COMMIT;

-- ===================================================================
-- FIN migration 011
-- ===================================================================
