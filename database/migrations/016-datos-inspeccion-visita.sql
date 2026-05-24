-- ===================================================================
-- 016 - Formulario estandarizado de visita tecnica e informe tecnico
-- ===================================================================
-- Agrega columna datos_inspeccion JSONB en visitas_tecnicas e
-- informes_tecnicos. Permite guardar los campos del formulario
-- estructurado (dropdowns, checkboxes, mediciones) sin tener que
-- agregar columnas SQL por cada iteracion del form.
--
-- Estructura tentativa (puede crecer):
-- {
--   "estado_general": "operativo" | "operativo_con_alertas" | "fuera_de_servicio",
--   "estado_aceite": "bueno" | "regular" | "malo" | "no_aplica",
--   "color_aceite": "claro_ambar" | "ambar" | "oscuro" | "negro",
--   "ruidos_anomalos": true | false,
--   "temperatura_externa_c": 65.4,
--   "resistencia_aislamiento_mohm": 1200,
--   "voltaje_primario_v": 13800,
--   "voltaje_secundario_v": 220,
--   "hallazgos": ["fuga_aceite", "oxido_visible", "conexiones_sueltas", "ruido_anomalo"],
--   "recomendacion": "reparar" | "reconstruir" | "mantenimiento" | "no_viable",
--   "justificacion": "texto libre breve",
--   "fotos_urls": ["https://...", "https://..."]
-- }
-- ===================================================================

ALTER TABLE comercial.visitas_tecnicas
    ADD COLUMN IF NOT EXISTS datos_inspeccion JSONB;

ALTER TABLE comercial.informes_tecnicos
    ADD COLUMN IF NOT EXISTS datos_inspeccion JSONB;

COMMENT ON COLUMN comercial.visitas_tecnicas.datos_inspeccion IS
    'Form estandarizado de la inspeccion. JSONB para iterar el formulario sin migrations.';
COMMENT ON COLUMN comercial.informes_tecnicos.datos_inspeccion IS
    'Snapshot del form al generar el informe. Copia de visitas_tecnicas.datos_inspeccion en el momento de creacion.';
