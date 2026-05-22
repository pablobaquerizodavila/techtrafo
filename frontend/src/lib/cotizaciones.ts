import { api } from "./api";

export type TipoServicio = "reparacion" | "fabricacion" | "mantenimiento" | "otro";
export type EstadoCotizacion =
  | "borrador"
  | "enviada"
  | "aprobada"
  | "rechazada"
  | "vencida"
  | "cancelada"
  | "convertida";
export type TransicionAccion =
  | "enviar"
  | "aprobar"
  | "rechazar"
  | "cancelar"
  | "vencer"
  | "convertir";

export interface CotizacionLinea {
  id?: number;
  orden: number;
  item_id: number | null;
  descripcion: string;
  cantidad: number;
  unidad_medida: string;
  precio_unitario: number;
  descuento_linea_porcentaje: number;
  costo_unitario: number | null;
  subtotal_linea?: number;
  notas: string | null;
}

export interface Cotizacion {
  id: number;
  codigo: string;
  cliente_id: number;
  contacto_id: number | null;
  tipo_servicio: TipoServicio;
  fecha_emision: string;
  fecha_validez: string | null;
  moneda: string;
  subtotal: string;
  descuento_global: string;
  iva_porcentaje: string;
  iva_valor: string;
  total: string;
  margen_porcentaje: string | null;
  condiciones_pago: string | null;
  tiempo_entrega: string | null;
  observaciones: string | null;
  notas_internas: string | null;
  estado: EstadoCotizacion;
  revision_actual: number;
  vendedor_id: string | null;
  aprobada_por: string | null;
  fecha_aprobacion: string | null;
  created_at: string;
  updated_at: string;
  clientes?: { id: number; razon_social: string; ruc_cedula: string; segmento?: string | null; sector?: string | null };
  cotizacion_lineas?: CotizacionLinea[];
  cotizacion_revisiones?: Array<{ id: number; revision: number; motivo: string | null; creado_por: string | null; created_at: string }>;
}

export interface CotizacionListResponse {
  data: Cotizacion[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}

export interface CotizacionListParams {
  page?: number;
  limit?: number;
  q?: string;
  estado?: EstadoCotizacion;
  tipo_servicio?: TipoServicio;
  cliente_id?: number;
}

export interface CotizacionCreateInput {
  cliente_id: number;
  contacto_id?: number | null;
  tipo_servicio: TipoServicio;
  fecha_emision?: string;
  fecha_validez?: string | null;
  moneda?: string;
  descuento_global?: number;
  iva_porcentaje?: number;
  margen_porcentaje?: number | null;
  condiciones_pago?: string | null;
  tiempo_entrega?: string | null;
  observaciones?: string | null;
  notas_internas?: string | null;
  lineas: Array<Omit<CotizacionLinea, "id" | "subtotal_linea">>;
}

export type CotizacionUpdateInput = Partial<CotizacionCreateInput>;

export async function listCotizaciones(params: CotizacionListParams = {}): Promise<CotizacionListResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== null) qs.set(k, String(v));
  }
  return api.get(`/api/cotizaciones${qs.toString() ? `?${qs}` : ""}`);
}

export async function getCotizacion(id: number): Promise<{ data: Cotizacion }> {
  return api.get(`/api/cotizaciones/${id}`);
}

export async function createCotizacion(payload: CotizacionCreateInput): Promise<{ data: Cotizacion }> {
  return api.post(`/api/cotizaciones`, payload);
}

export async function updateCotizacion(id: number, payload: CotizacionUpdateInput): Promise<{ data: Cotizacion }> {
  return api.patch(`/api/cotizaciones/${id}`, payload);
}

export async function transicionCotizacion(
  id: number,
  accion: TransicionAccion,
  motivo?: string,
): Promise<{ data: Cotizacion }> {
  return api.post(`/api/cotizaciones/${id}/transicion`, { accion, motivo });
}

export async function archiveCotizacion(id: number): Promise<void> {
  await api.delete(`/api/cotizaciones/${id}`);
}

// -------------------------------------------------------------------
// Helpers de calculo (replican la logica del backend)
// -------------------------------------------------------------------

export function calcularSubtotalLinea(l: Pick<CotizacionLinea, "cantidad" | "precio_unitario" | "descuento_linea_porcentaje">): number {
  return round2(l.cantidad * l.precio_unitario * (1 - l.descuento_linea_porcentaje / 100));
}

export function calcularTotales(
  lineas: Array<Pick<CotizacionLinea, "cantidad" | "precio_unitario" | "descuento_linea_porcentaje">>,
  iva_porcentaje: number,
  descuento_global: number,
): { subtotal: number; iva_valor: number; total: number } {
  const subtotalLineas = lineas.reduce(
    (acc, l) => acc + l.cantidad * l.precio_unitario * (1 - l.descuento_linea_porcentaje / 100),
    0,
  );
  const subtotal = Math.max(0, subtotalLineas - descuento_global);
  const iva_valor = subtotal * (iva_porcentaje / 100);
  return {
    subtotal: round2(subtotal),
    iva_valor: round2(iva_valor),
    total: round2(subtotal + iva_valor),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function estadoVariant(estado: EstadoCotizacion): "success" | "warning" | "destructive" | "muted" | "default" {
  switch (estado) {
    case "aprobada":
    case "convertida":
      return "success";
    case "enviada":
      return "default";
    case "rechazada":
    case "cancelada":
      return "destructive";
    case "vencida":
      return "warning";
    case "borrador":
      return "muted";
  }
}

export function transicionesPosibles(estado: EstadoCotizacion): TransicionAccion[] {
  const map: Record<EstadoCotizacion, TransicionAccion[]> = {
    borrador: ["enviar", "cancelar"],
    enviada: ["aprobar", "rechazar", "cancelar", "vencer"],
    aprobada: ["convertir", "cancelar"],
    rechazada: [],
    vencida: ["enviar"],
    cancelada: [],
    convertida: [],
  };
  return map[estado] ?? [];
}
