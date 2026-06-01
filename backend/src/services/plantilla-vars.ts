/**
 * Motor de variables para clausulas de plantillas de contrato.
 *
 * Reemplaza {{variable}} en el texto con datos reales del contrato al
 * momento de emitirlo. Las variables no reconocidas se dejan tal cual
 * ({{x}}) para que el error sea visible en el documento.
 */
export interface VarsContrato {
  cliente_razon_social?: string | null;
  cliente_ruc?: string | null;
  representante_legal_nombre?: string | null;
  representante_legal_cedula?: string | null;
  representante_legal_cargo?: string | null;
  contrato_codigo?: string | null;
  cotizacion_codigo?: string | null;
  monto_total?: string | null;
  fecha_firma?: string | null;
  plazo_entrega?: string | null;
}

/** Catalogo de variables disponibles (para mostrar como ayuda en el editor). */
export const VARIABLES_CONTRATO: Array<{ key: string; desc: string }> = [
  { key: "cliente_razon_social", desc: "Razón social del cliente" },
  { key: "cliente_ruc", desc: "RUC / cédula del cliente" },
  { key: "representante_legal_nombre", desc: "Nombre del representante legal" },
  { key: "representante_legal_cedula", desc: "Cédula del representante legal" },
  { key: "representante_legal_cargo", desc: "Cargo del representante legal" },
  { key: "contrato_codigo", desc: "Código del contrato" },
  { key: "cotizacion_codigo", desc: "Código de la cotización base" },
  { key: "monto_total", desc: "Monto total del contrato" },
  { key: "fecha_firma", desc: "Fecha de firma" },
  { key: "plazo_entrega", desc: "Plazo / fecha fin estimada" },
];

export function renderClausulas(texto: string, vars: VarsContrato): string {
  return texto.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, key: string) => {
    const v = (vars as Record<string, string | null | undefined>)[key];
    return v != null && v !== "" ? String(v) : m;
  });
}
