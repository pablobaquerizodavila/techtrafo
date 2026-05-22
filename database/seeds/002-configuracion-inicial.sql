-- ===================================================================
-- TECHTRAFO - Seed 002: Configuracion inicial del sistema
-- ===================================================================
-- Version: 0.1.0
-- Fecha: 2026-05-22
-- Ejecutado en produccion: si
-- Idempotente: si (ON CONFLICT DO NOTHING)
--
-- 17 parametros editables desde el centro de configuracion
-- Los umbrales monetarios quedan en null para que TECHTRAFO los defina
-- ===================================================================

-- ---- Modulo: caja ----
INSERT INTO core.configuracion (modulo, clave, valor, tipo, descripcion) VALUES
    ('caja', 'tipos_pago_aceptados',
        '["transferencia","cheque","efectivo","tarjeta"]'::jsonb,
        'array', 'Metodos de pago aceptados'),

    ('caja', 'dias_gracia_cobro',
        '5'::jsonb,
        'number', 'Dias de gracia antes de marcar vencido')
ON CONFLICT (modulo, clave) DO NOTHING;

-- ---- Modulo: bodega ----
INSERT INTO core.configuracion (modulo, clave, valor, tipo, descripcion) VALUES
    ('bodega', 'umbral_ajuste_inventario',
        'null'::jsonb,
        'number', 'Monto USD desde el que ajustes requieren autorizacion gerencia'),

    ('bodega', 'umbral_oc_jefe_bodega',
        'null'::jsonb,
        'number', 'Monto USD maximo que jefe de bodega autoriza solo'),

    ('bodega', 'umbral_oc_gerencia',
        'null'::jsonb,
        'number', 'Monto USD desde el que requiere gerencia general'),

    ('bodega', 'umbral_oc_presidencia',
        'null'::jsonb,
        'number', 'Monto USD desde el que requiere presidencia'),

    ('bodega', 'buffer_importado_pct',
        '30'::jsonb,
        'number', 'Porcentaje colchon sobre punto de reorden para importados'),

    ('bodega', 'buffer_local_pct',
        '10'::jsonb,
        'number', 'Porcentaje colchon sobre punto de reorden para locales')
ON CONFLICT (modulo, clave) DO NOTHING;

-- ---- Modulo: cotizador ----
INSERT INTO core.configuracion (modulo, clave, valor, tipo, descripcion) VALUES
    ('cotizador', 'margen_minimo_alerta_pct',
        '15'::jsonb,
        'number', 'Margen minimo antes de alertar a gerencia'),

    ('cotizador', 'descuento_max_libre_pct',
        '5'::jsonb,
        'number', 'Descuento maximo sin autorizacion')
ON CONFLICT (modulo, clave) DO NOTHING;

-- ---- Modulo: comercial ----
INSERT INTO core.configuracion (modulo, clave, valor, tipo, descripcion) VALUES
    ('comercial', 'sla_primera_respuesta_h',
        '24'::jsonb,
        'number', 'Horas maximas primera respuesta cliente normal'),

    ('comercial', 'sla_corporativo_h',
        '8'::jsonb,
        'number', 'Horas maximas primera respuesta cliente corporativo'),

    ('comercial', 'sla_critico_h',
        '2'::jsonb,
        'number', 'Horas maximas primera respuesta cliente critico')
ON CONFLICT (modulo, clave) DO NOTHING;

-- ---- Modulo: sistema ----
INSERT INTO core.configuracion (modulo, clave, valor, tipo, descripcion) VALUES
    ('sistema', 'version',
        '"0.1.0"'::jsonb,
        'string', 'Version del sistema'),

    ('sistema', 'pais',
        '"Ecuador"'::jsonb,
        'string', 'Pais de operacion'),

    ('sistema', 'moneda',
        '"USD"'::jsonb,
        'string', 'Moneda de operacion'),

    ('sistema', 'iva_pct',
        '15'::jsonb,
        'number', 'IVA Ecuador en porcentaje')
ON CONFLICT (modulo, clave) DO NOTHING;
