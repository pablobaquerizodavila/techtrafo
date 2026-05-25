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
  // Flags propios de la emisión desde plantilla
  pendiente_aprovisionamiento?: boolean;
  tiempo_aprovisionamiento_dias?: number | null;
  categoria?: string | null;
}

export type EstadoRevisionInterna = "no_solicitada" | "pendiente" | "aprobada" | "rechazada";

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
  // Revision interna (gerencia comercial -> general -> presidencia)
  revision_interna_estado: EstadoRevisionInterna;
  revision_interna_nivel: number | null;
  revision_interna_solicitada_por: string | null;
  revision_interna_solicitada_at: string | null;
  revision_interna_resuelta_por: string | null;
  revision_interna_resuelta_at: string | null;
  revision_interna_motivo_rechazo: string | null;
  clientes?: { id: number; razon_social: string; ruc_cedula: string; segmento?: string | null; sector?: string | null };
  cotizacion_lineas?: CotizacionLinea[];
  cotizacion_revisiones?: Array<{ id: number; revision: number; motivo: string | null; creado_por: string | null; created_at: string }>;
}

export interface RevisionHistorialItem {
  id: number;
  nivel: number;
  accion: "solicitar" | "aprobar" | "rechazar" | "escalar";
  por_usuario_id: string | null;
  rol_actuante: string | null;
  notas: string | null;
  created_at: string;
  nombres: string | null;
  apellidos: string | null;
}

export function nivelRevisionLabel(nivel: number | null): string {
  if (!nivel) return "—";
  return ({ 1: "Gerencia Comercial", 2: "Gerencia General", 3: "Presidencia" } as Record<number, string>)[nivel] ?? `Nivel ${nivel}`;
}

export function rolDeNivelRevision(nivel: number): string {
  return ({ 1: "gerencia_comercial", 2: "gerencia_general", 3: "presidencia" } as Record<number, string>)[nivel] ?? "";
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
  // Si se pasa, al crear la cotizacion se la vincula a este expediente
  // (expedientes.cotizacion_id = nueva.id).
  expediente_id?: number | null;
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
// Revision interna (gerencia_comercial -> gerencia_general -> presidencia)
// -------------------------------------------------------------------
export async function solicitarRevisionInterna(id: number): Promise<{ status: string; nivel: number; rol_destino: string }> {
  return api.post(`/api/cotizaciones/${id}/revision-interna/solicitar`);
}
export async function aprobarRevisionInterna(id: number, notas?: string): Promise<{ status: string }> {
  return api.post(`/api/cotizaciones/${id}/revision-interna/aprobar`, notas ? { notas } : {});
}
export async function rechazarRevisionInterna(id: number, motivo: string): Promise<{ status: string }> {
  return api.post(`/api/cotizaciones/${id}/revision-interna/rechazar`, { motivo });
}
export async function escalarRevisionInterna(id: number, mensaje: string): Promise<{ status: string; nivel: number; rol_destino: string }> {
  return api.post(`/api/cotizaciones/${id}/revision-interna/escalar`, { mensaje });
}
export async function getRevisionHistorial(id: number): Promise<{ data: RevisionHistorialItem[] }> {
  return api.get(`/api/cotizaciones/${id}/revision-interna/historial`);
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
