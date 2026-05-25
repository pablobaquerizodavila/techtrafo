-- ===================================================================
-- Migration 020: Modulo de Compras (Fase 2)
-- Solicitudes internas (SC) + Ordenes de compra (OC) + Recepciones
-- + Historial de precios + Config de aprobacion escalonada por monto
--
-- Flujo completo:
--   1. SC (solicitud interna) — la origina cualquier area que necesita
--      material. Estados: borrador -> enviada -> aprobada / rechazada
--      -> convertida_en_oc.
--   2. OC (orden de compra) — la emite Compras desde una SC aprobada
--      o directamente. Aprobacion por monto contra config_aprobacion.
--      Estados: borrador -> en_revision -> aprobada -> enviada ->
--      confirmada -> recibida_parcial / recibida_total -> cerrada.
--   3. Recepcion — Bodega registra cada llegada parcial o total. Al
--      confirmar, el backend dispara movimientos_stock con
--      referencia_tipo='compra' y referencia_id=OC.id (la logica esta
--      en routes/recepciones.ts, no en SQL).
--
-- La actualizacion automatica de items.costo_referencia tras una
-- recepcion con precio distinto queda trazada en
-- compras.item_proveedor_precios_historial.
-- ===================================================================

-- -------------------------------------------------------------------
-- Config de aprobacion escalonada por monto total de OC
-- Cualquier OC con total >= monto_minimo y < monto_maximo (NULL = sin tope)
-- debe ser aprobada por el rol_aprobador.
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS compras.config_aprobacion (
  id                  BIGSERIAL PRIMARY KEY,
  monto_minimo        NUMERIC(14,2) NOT NULL,                        -- inclusive
  monto_maximo        NUMERIC(14,2),                                 -- exclusive; NULL = sin tope
  rol_aprobador_id    INTEGER NOT NULL REFERENCES core.roles(id),
  moneda              VARCHAR(3) NOT NULL DEFAULT 'USD',
  activo              BOOLEAN NOT NULL DEFAULT TRUE,
  notas               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (monto_maximo IS NULL OR monto_maximo > monto_minimo)
);

CREATE INDEX IF NOT EXISTS idx_compras_config_activo
  ON compras.config_aprobacion(activo, monto_minimo);

CREATE TRIGGER tg_compras_config_updated_at
  BEFORE UPDATE ON compras.config_aprobacion
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

-- Seeds iniciales (ver HANDOFF; Pablo puede ajustarlos)
INSERT INTO compras.config_aprobacion (monto_minimo, monto_maximo, rol_aprobador_id, notas)
SELECT 0.00,    500.00,    r.id, 'OCs chicas: comprador puede emitir sin aprobacion adicional'
  FROM core.roles r WHERE r.nombre = 'comprador'
ON CONFLICT DO NOTHING;

INSERT INTO compras.config_aprobacion (monto_minimo, monto_maximo, rol_aprobador_id, notas)
SELECT 500.00,  5000.00,   r.id, 'OCs medianas: aprueba jefe_compras'
  FROM core.roles r WHERE r.nombre = 'jefe_compras'
ON CONFLICT DO NOTHING;

INSERT INTO compras.config_aprobacion (monto_minimo, monto_maximo, rol_aprobador_id, notas)
SELECT 5000.00, 30000.00,  r.id, 'OCs grandes: aprueba gerencia_general'
  FROM core.roles r WHERE r.nombre = 'gerencia_general'
ON CONFLICT DO NOTHING;

INSERT INTO compras.config_aprobacion (monto_minimo, monto_maximo, rol_aprobador_id, notas)
SELECT 30000.00, NULL,     r.id, 'OCs criticas: aprueba presidencia'
  FROM core.roles r WHERE r.nombre = 'presidencia'
ON CONFLICT DO NOTHING;

-- -------------------------------------------------------------------
-- Solicitudes internas de compra (SC)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS compras.solicitudes (
  id                       BIGSERIAL PRIMARY KEY,
  codigo                   VARCHAR(30) UNIQUE NOT NULL,              -- SC-YYYY-NNNN

  -- Origen
  departamento_solicitante VARCHAR(50) NOT NULL,                     -- 'produccion','ingenieria','mantenimiento','bodega','calidad','comercial','gerencia'
  solicitante_id           UUID REFERENCES core.usuarios(id),

  -- Asociacion opcional con cotizacion / expediente / OT
  cotizacion_id            BIGINT REFERENCES comercial.cotizaciones(id),
  expediente_id            BIGINT REFERENCES comercial.expedientes(id),

  -- Cabecera
  fecha_solicitud          DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_requerida          DATE,
  prioridad                VARCHAR(20) NOT NULL DEFAULT 'media'
    CHECK (prioridad IN ('baja','media','alta','urgente','critica')),
  justificacion            TEXT,
  observaciones            TEXT,

  -- Flujo
  estado                   VARCHAR(30) NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador','enviada','aprobada','rechazada','convertida_en_oc','cancelada')),
  origen                   VARCHAR(20) NOT NULL DEFAULT 'manual'
    CHECK (origen IN ('manual','cotizacion','stock_minimo','expediente')),

  aprobador_id             UUID REFERENCES core.usuarios(id),
  fecha_aprobacion         TIMESTAMPTZ,
  motivo_rechazo           TEXT,

  -- Vinculo con la OC generada (si llego a convertida_en_oc)
  orden_compra_id          BIGINT,                                   -- FK seteado luego (ciclica)

  total_estimado           NUMERIC(14,2) NOT NULL DEFAULT 0,
  moneda                   VARCHAR(3) NOT NULL DEFAULT 'USD',

  creado_por               UUID REFERENCES core.usuarios(id),
  actualizado_por          UUID REFERENCES core.usuarios(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sc_estado     ON compras.solicitudes(estado);
CREATE INDEX IF NOT EXISTS idx_sc_solicitante ON compras.solicitudes(solicitante_id);
CREATE INDEX IF NOT EXISTS idx_sc_cotizacion  ON compras.solicitudes(cotizacion_id) WHERE cotizacion_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sc_expediente  ON compras.solicitudes(expediente_id) WHERE expediente_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sc_fecha       ON compras.solicitudes(fecha_solicitud DESC);

CREATE TRIGGER tg_sc_updated_at
  BEFORE UPDATE ON compras.solicitudes
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

CREATE TRIGGER tg_sc_auditar
  AFTER INSERT OR UPDATE OR DELETE ON compras.solicitudes
  FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

-- Codigo automatico SC-YYYY-NNNN
CREATE OR REPLACE FUNCTION compras.fn_generar_codigo_sc()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_anio TEXT := TO_CHAR(NOW(), 'YYYY');
  v_max  INT;
BEGIN
  IF NEW.codigo IS NOT NULL AND LENGTH(NEW.codigo) > 0 THEN RETURN NEW; END IF;
  SELECT COALESCE(MAX(SPLIT_PART(codigo, '-', 3)::INTEGER), 0)
    INTO v_max FROM compras.solicitudes
   WHERE codigo LIKE 'SC-' || v_anio || '-%';
  NEW.codigo := 'SC-' || v_anio || '-' || LPAD((v_max + 1)::TEXT, 4, '0');
  RETURN NEW;
END
$$;

CREATE TRIGGER tg_sc_codigo
  BEFORE INSERT ON compras.solicitudes
  FOR EACH ROW EXECUTE FUNCTION compras.fn_generar_codigo_sc();

-- -------------------------------------------------------------------
-- Detalle de la SC
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS compras.solicitud_lineas (
  id                       BIGSERIAL PRIMARY KEY,
  solicitud_id             BIGINT NOT NULL REFERENCES compras.solicitudes(id) ON DELETE CASCADE,
  orden                    INTEGER NOT NULL DEFAULT 1,

  item_id                  BIGINT REFERENCES inventario.items(id),    -- opcional: descripciones libres permitidas
  descripcion              VARCHAR(500) NOT NULL,
  unidad_medida            VARCHAR(20) NOT NULL DEFAULT 'unid',
  cantidad_solicitada      NUMERIC(14,3) NOT NULL CHECK (cantidad_solicitada > 0),

  -- Precio referencial (al momento de crear la SC)
  precio_referencial       NUMERIC(14,4) NOT NULL DEFAULT 0,
  moneda                   VARCHAR(3) NOT NULL DEFAULT 'USD',

  -- Si la SC nacio de una cotizacion, traer ese linea
  cotizacion_linea_id      BIGINT,                                    -- referencia logica a comercial.cotizacion_lineas
  proveedor_sugerido_id    BIGINT REFERENCES compras.proveedores(id),

  notas                    TEXT,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sc_lineas_sc   ON compras.solicitud_lineas(solicitud_id, orden);
CREATE INDEX IF NOT EXISTS idx_sc_lineas_item ON compras.solicitud_lineas(item_id) WHERE item_id IS NOT NULL;

CREATE TRIGGER tg_sc_lineas_updated_at
  BEFORE UPDATE ON compras.solicitud_lineas
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

-- -------------------------------------------------------------------
-- Ordenes de compra (OC)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS compras.ordenes_compra (
  id                       BIGSERIAL PRIMARY KEY,
  codigo                   VARCHAR(30) UNIQUE NOT NULL,               -- OC-YYYY-NNNN

  proveedor_id             BIGINT NOT NULL REFERENCES compras.proveedores(id),
  solicitud_id             BIGINT REFERENCES compras.solicitudes(id), -- SC de origen, opcional
  expediente_id            BIGINT REFERENCES comercial.expedientes(id),

  fecha_emision            DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_entrega_acordada   DATE,
  fecha_confirmacion_proveedor DATE,
  fecha_entrega_real       DATE,

  -- Condiciones comerciales (override del default del proveedor)
  condiciones_pago         VARCHAR(120),
  moneda                   VARCHAR(3) NOT NULL DEFAULT 'USD',
  tipo_cambio              NUMERIC(10,4),                              -- aplica si moneda <> USD
  incoterm                 VARCHAR(10),
  lugar_entrega            TEXT,

  -- Totales (se recalculan desde lineas en el backend)
  subtotal                 NUMERIC(14,2) NOT NULL DEFAULT 0,
  descuento_porcentaje     NUMERIC(5,2)  NOT NULL DEFAULT 0,
  descuento_valor          NUMERIC(14,2) NOT NULL DEFAULT 0,
  iva_porcentaje           NUMERIC(5,2)  NOT NULL DEFAULT 15.00,
  iva_valor                NUMERIC(14,2) NOT NULL DEFAULT 0,
  retencion_valor          NUMERIC(14,2) NOT NULL DEFAULT 0,
  total                    NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- Flujo
  estado                   VARCHAR(30) NOT NULL DEFAULT 'borrador'
    CHECK (estado IN (
      'borrador','en_revision','aprobada','rechazada','enviada','confirmada',
      'recibida_parcial','recibida_total','cerrada','cancelada'
    )),

  -- Aprobacion escalonada por monto
  rol_aprobador_requerido_id INTEGER REFERENCES core.roles(id),
  aprobador_id             UUID REFERENCES core.usuarios(id),
  fecha_aprobacion         TIMESTAMPTZ,
  motivo_rechazo           TEXT,

  -- Observaciones / nota interna
  observaciones_internas   TEXT,
  observaciones_proveedor  TEXT,                                       -- aparece en el PDF

  -- Documentos
  archivo_proveedor_url    TEXT,                                       -- proforma del proveedor
  archivo_oc_url           TEXT,                                       -- PDF de la OC firmada

  creado_por               UUID REFERENCES core.usuarios(id),
  actualizado_por          UUID REFERENCES core.usuarios(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oc_proveedor   ON compras.ordenes_compra(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_oc_estado      ON compras.ordenes_compra(estado);
CREATE INDEX IF NOT EXISTS idx_oc_solicitud   ON compras.ordenes_compra(solicitud_id) WHERE solicitud_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_oc_expediente  ON compras.ordenes_compra(expediente_id) WHERE expediente_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_oc_fecha       ON compras.ordenes_compra(fecha_emision DESC);

CREATE TRIGGER tg_oc_updated_at
  BEFORE UPDATE ON compras.ordenes_compra
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

CREATE TRIGGER tg_oc_auditar
  AFTER INSERT OR UPDATE OR DELETE ON compras.ordenes_compra
  FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

-- Codigo automatico OC-YYYY-NNNN
CREATE OR REPLACE FUNCTION compras.fn_generar_codigo_oc()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_anio TEXT := TO_CHAR(NOW(), 'YYYY');
  v_max  INT;
BEGIN
  IF NEW.codigo IS NOT NULL AND LENGTH(NEW.codigo) > 0 THEN RETURN NEW; END IF;
  SELECT COALESCE(MAX(SPLIT_PART(codigo, '-', 3)::INTEGER), 0)
    INTO v_max FROM compras.ordenes_compra
   WHERE codigo LIKE 'OC-' || v_anio || '-%';
  NEW.codigo := 'OC-' || v_anio || '-' || LPAD((v_max + 1)::TEXT, 4, '0');
  RETURN NEW;
END
$$;

CREATE TRIGGER tg_oc_codigo
  BEFORE INSERT ON compras.ordenes_compra
  FOR EACH ROW EXECUTE FUNCTION compras.fn_generar_codigo_oc();

-- Ahora si, FK ciclica de solicitudes.orden_compra_id -> ordenes_compra
ALTER TABLE compras.solicitudes
  ADD CONSTRAINT solicitudes_orden_compra_fkey
  FOREIGN KEY (orden_compra_id) REFERENCES compras.ordenes_compra(id) ON DELETE SET NULL;

-- -------------------------------------------------------------------
-- Detalle de la OC
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS compras.orden_compra_lineas (
  id                       BIGSERIAL PRIMARY KEY,
  orden_compra_id          BIGINT NOT NULL REFERENCES compras.ordenes_compra(id) ON DELETE CASCADE,
  orden                    INTEGER NOT NULL DEFAULT 1,

  item_id                  BIGINT REFERENCES inventario.items(id),
  descripcion              VARCHAR(500) NOT NULL,
  codigo_proveedor_item    VARCHAR(100),                              -- referencia del proveedor
  unidad_medida            VARCHAR(20) NOT NULL DEFAULT 'unid',
  cantidad_solicitada      NUMERIC(14,3) NOT NULL CHECK (cantidad_solicitada > 0),
  precio_unitario          NUMERIC(14,4) NOT NULL,
  descuento_porcentaje     NUMERIC(5,2) NOT NULL DEFAULT 0,
  subtotal                 NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- Tracking de recepcion
  cantidad_recibida        NUMERIC(14,3) NOT NULL DEFAULT 0,
  cantidad_rechazada       NUMERIC(14,3) NOT NULL DEFAULT 0,
  estado_linea             VARCHAR(20) NOT NULL DEFAULT 'pendiente'
    CHECK (estado_linea IN ('pendiente','recibida_parcial','recibida','rechazada','cancelada')),

  -- Asociacion al destino: ubicacion bodega + lote opcional
  ubicacion_destino_id     BIGINT REFERENCES inventario.ubicaciones(id),
  proyecto_referencia      VARCHAR(100),                              -- texto libre: # transformador, codigo OT, etc

  notas                    TEXT,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oc_lineas_oc    ON compras.orden_compra_lineas(orden_compra_id, orden);
CREATE INDEX IF NOT EXISTS idx_oc_lineas_item  ON compras.orden_compra_lineas(item_id) WHERE item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_oc_lineas_estado ON compras.orden_compra_lineas(estado_linea);

CREATE TRIGGER tg_oc_lineas_updated_at
  BEFORE UPDATE ON compras.orden_compra_lineas
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

-- -------------------------------------------------------------------
-- Recepciones (parciales o totales) contra una OC
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS compras.recepciones (
  id                       BIGSERIAL PRIMARY KEY,
  codigo                   VARCHAR(30) UNIQUE NOT NULL,               -- REC-YYYY-NNNN
  orden_compra_id          BIGINT NOT NULL REFERENCES compras.ordenes_compra(id),

  fecha_recepcion          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  guia_remision_numero     VARCHAR(100),
  factura_numero           VARCHAR(100),
  factura_fecha            DATE,
  factura_url              TEXT,

  estado                   VARCHAR(30) NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador','confirmada','rechazada','anulada')),
  estado_general           VARCHAR(30) NOT NULL DEFAULT 'bueno'
    CHECK (estado_general IN ('bueno','observado','danado','incompleto')),

  responsable_recepcion_id UUID REFERENCES core.usuarios(id),
  responsable_calidad_id   UUID REFERENCES core.usuarios(id),

  observaciones            TEXT,
  evidencia_url            TEXT,                                      -- foto/PDF de respaldo

  creado_por               UUID REFERENCES core.usuarios(id),
  actualizado_por          UUID REFERENCES core.usuarios(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recepciones_oc       ON compras.recepciones(orden_compra_id);
CREATE INDEX IF NOT EXISTS idx_recepciones_estado   ON compras.recepciones(estado);
CREATE INDEX IF NOT EXISTS idx_recepciones_fecha    ON compras.recepciones(fecha_recepcion DESC);

CREATE TRIGGER tg_recepciones_updated_at
  BEFORE UPDATE ON compras.recepciones
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

CREATE TRIGGER tg_recepciones_auditar
  AFTER INSERT OR UPDATE OR DELETE ON compras.recepciones
  FOR EACH ROW EXECUTE FUNCTION core.fn_auditar();

CREATE OR REPLACE FUNCTION compras.fn_generar_codigo_recepcion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_anio TEXT := TO_CHAR(NOW(), 'YYYY');
  v_max  INT;
BEGIN
  IF NEW.codigo IS NOT NULL AND LENGTH(NEW.codigo) > 0 THEN RETURN NEW; END IF;
  SELECT COALESCE(MAX(SPLIT_PART(codigo, '-', 3)::INTEGER), 0)
    INTO v_max FROM compras.recepciones
   WHERE codigo LIKE 'REC-' || v_anio || '-%';
  NEW.codigo := 'REC-' || v_anio || '-' || LPAD((v_max + 1)::TEXT, 4, '0');
  RETURN NEW;
END
$$;

CREATE TRIGGER tg_recepciones_codigo
  BEFORE INSERT ON compras.recepciones
  FOR EACH ROW EXECUTE FUNCTION compras.fn_generar_codigo_recepcion();

-- -------------------------------------------------------------------
-- Detalle de recepcion (cuanto se recibio de cada linea de OC)
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS compras.recepcion_lineas (
  id                       BIGSERIAL PRIMARY KEY,
  recepcion_id             BIGINT NOT NULL REFERENCES compras.recepciones(id) ON DELETE CASCADE,
  orden_compra_linea_id    BIGINT NOT NULL REFERENCES compras.orden_compra_lineas(id),

  cantidad_recibida        NUMERIC(14,3) NOT NULL CHECK (cantidad_recibida >= 0),
  cantidad_rechazada       NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (cantidad_rechazada >= 0),
  precio_real              NUMERIC(14,4),                              -- precio efectivo del proveedor (puede diferir de OC)

  -- Resultado de la inspeccion
  resultado_inspeccion     VARCHAR(20) NOT NULL DEFAULT 'aprobado'
    CHECK (resultado_inspeccion IN ('aprobado','rechazado','observado','pendiente_inspeccion')),
  motivo_rechazo           TEXT,

  -- Donde se ubico fisicamente
  ubicacion_id             BIGINT REFERENCES inventario.ubicaciones(id),
  lote_id                  BIGINT REFERENCES inventario.lotes(id),

  -- Trazabilidad con el movimiento de stock generado (lo setea el backend
  -- tras crear el movimiento en inventario.movimientos_stock)
  movimiento_stock_id      BIGINT,                                     -- referencia logica, no FK fuerte

  observaciones            TEXT,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rec_lineas_recepcion ON compras.recepcion_lineas(recepcion_id);
CREATE INDEX IF NOT EXISTS idx_rec_lineas_oc_linea  ON compras.recepcion_lineas(orden_compra_linea_id);

CREATE TRIGGER tg_rec_lineas_updated_at
  BEFORE UPDATE ON compras.recepcion_lineas
  FOR EACH ROW EXECUTE FUNCTION core.fn_set_updated_at();

-- -------------------------------------------------------------------
-- Historial de precios por item/proveedor
-- Lo escribe el backend cuando una recepcion confirmada tiene un precio
-- distinto al costo_referencia actual del item.
-- -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS compras.item_proveedor_precios_historial (
  id                       BIGSERIAL PRIMARY KEY,
  item_id                  BIGINT NOT NULL REFERENCES inventario.items(id),
  proveedor_id             BIGINT NOT NULL REFERENCES compras.proveedores(id),
  orden_compra_id          BIGINT REFERENCES compras.ordenes_compra(id),
  recepcion_id             BIGINT REFERENCES compras.recepciones(id),

  precio_anterior          NUMERIC(14,4),                              -- costo_referencia previo del item
  precio_nuevo             NUMERIC(14,4) NOT NULL,                     -- precio aplicado tras recepcion
  variacion_porcentaje     NUMERIC(7,2),                               -- (nuevo - anterior) / anterior * 100
  moneda                   VARCHAR(3) NOT NULL DEFAULT 'USD',

  origen                   VARCHAR(20) NOT NULL DEFAULT 'recepcion'
    CHECK (origen IN ('recepcion','manual','oc_aprobada','importacion')),
  registrado_por           UUID REFERENCES core.usuarios(id),
  fecha                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notas                    TEXT
);

CREATE INDEX IF NOT EXISTS idx_precios_hist_item    ON compras.item_proveedor_precios_historial(item_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_precios_hist_prov    ON compras.item_proveedor_precios_historial(proveedor_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_precios_hist_oc      ON compras.item_proveedor_precios_historial(orden_compra_id) WHERE orden_compra_id IS NOT NULL;

COMMENT ON TABLE compras.item_proveedor_precios_historial IS
  'Cada vez que el costo_referencia de un item cambia desde una recepcion (o manualmente), se registra aqui para auditoria. La fila MAS reciente refleja el costo vigente.';

-- -------------------------------------------------------------------
-- Vista: stock total por item (consolidando ubicaciones y lotes)
-- Util para el worker de alerta de stock minimo
-- -------------------------------------------------------------------
CREATE OR REPLACE VIEW compras.v_stock_consolidado AS
SELECT
  i.id                            AS item_id,
  i.codigo_interno,
  i.nombre,
  i.unidad_medida,
  i.stock_minimo,
  i.stock_maximo,
  i.punto_reorden,
  i.costo_referencia,
  i.estado                        AS item_estado,
  i.proveedor_principal_id,
  COALESCE(SUM(s.cantidad), 0)    AS stock_total,
  COUNT(DISTINCT s.ubicacion_id)  AS ubicaciones_con_stock
FROM inventario.items i
LEFT JOIN inventario.stock s ON s.item_id = i.id
WHERE i.estado = 'activo'
GROUP BY i.id;

COMMENT ON VIEW compras.v_stock_consolidado IS
  'Stock consolidado por item (suma de todas las ubicaciones/lotes). Base para alertas de stock minimo y para el endpoint desde-plantilla.';

-- -------------------------------------------------------------------
-- Vista: items bajo punto de reorden (alertas)
-- -------------------------------------------------------------------
CREATE OR REPLACE VIEW compras.v_items_bajo_reorden AS
SELECT
  v.*,
  CASE
    WHEN v.stock_total <= 0                                THEN 'sin_stock'
    WHEN v.stock_total <= v.stock_minimo                   THEN 'bajo_minimo'
    WHEN v.stock_total <= v.punto_reorden                  THEN 'bajo_reorden'
    ELSE 'ok'
  END AS nivel_alerta,
  GREATEST(v.stock_maximo - v.stock_total, 0)::NUMERIC(14,3) AS cantidad_sugerida_reposicion
FROM compras.v_stock_consolidado v
WHERE v.stock_total <= GREATEST(COALESCE(v.punto_reorden,0), COALESCE(v.stock_minimo,0))
  AND (COALESCE(v.punto_reorden,0) > 0 OR COALESCE(v.stock_minimo,0) > 0);
