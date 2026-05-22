-- ===================================================================
-- TECHTRAFO - Seed 001: Roles iniciales del sistema
-- ===================================================================
-- Version: 0.1.0
-- Fecha: 2026-05-22
-- Ejecutado en produccion: si
-- Idempotente: si (ON CONFLICT DO NOTHING)
--
-- Roles validados en FASE 1 segun matriz de responsabilidades
-- ===================================================================

INSERT INTO core.roles (nombre, descripcion, permisos) VALUES
    ('presidencia',
        'Presidencia - autoridad 100%',
        '{"all": true}'::jsonb),

    ('gerencia_general',
        'Gerencia General - autoridad 100%',
        '{"all": true}'::jsonb),

    ('gerencia_comercial',
        'Gerencia Comercial - autoridad 100%',
        '{"all": true}'::jsonb),

    ('jefe_planta',
        'Jefe de planta',
        '{"planta": true, "ot": true, "checklists": true}'::jsonb),

    ('coordinador_tecnico',
        'Coordinador tecnico',
        '{"ot": true, "checklists": true}'::jsonb),

    ('ejecutivo_comercial',
        'Ejecutivo comercial',
        '{"crm": true, "cotizaciones": true}'::jsonb),

    ('ingeniero_diagnostico',
        'Ingeniero de diagnostico',
        '{"diagnostico": true, "informes": true}'::jsonb),

    ('tecnico_planta',
        'Tecnico de planta',
        '{"checklists_propios": true}'::jsonb),

    ('jefe_bodega',
        'Jefe de bodega',
        '{"bodega": true, "compras_basicas": true}'::jsonb),

    ('cobranza',
        'Cobranza',
        '{"caja": true, "cartera": true}'::jsonb),

    ('qa',
        'Control de calidad',
        '{"qa": true, "garantias": true}'::jsonb),

    ('cliente_externo',
        'Cliente externo (portal)',
        '{"portal_seguimiento": true}'::jsonb)

ON CONFLICT (nombre) DO NOTHING;
