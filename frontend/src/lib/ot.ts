import { api } from "./api";

export type TipoRuta = "reparacion" | "fabricacion" | "mantenimiento";
export type PrioridadOT = "baja" | "normal" | "alta" | "urgente";
export type EstadoOT = "planeada" | "en_curso" | "pausada" | "completada" | "cancelada";
export type EstadoPaso = "pendiente" | "en_curso" | "completado" | "saltado" | "rechazado";
export type ResultadoGate = "aprobado" | "rechazado" | "con_observaciones";

export interface OTPaso {
  id: number;
  ot_id: number;
  numero: number;
  nombre: string;
  descripcion: string | null;
  es_gate: boolean;
  numero_gate: number | null;
  estado: EstadoPaso;
  resultado_gate: ResultadoGate | null;
  mediciones: Record<string, unknown> | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  ejecutado_por: string | null;
  aprobado_por: string | null;
  observaciones: string | null;
  notas_internas: string | null;
  usuarios_ot_pasos_ejecutado_porTousuarios?: { id: string; nombres: string; apellidos: string } | null;
  usuarios_ot_pasos_aprobado_porTousuarios?: { id: string; nombres: string; apellidos: string } | null;
}

export interface OTEvidencia {
  id: number;
  ot_id: number;
  paso_id: number | null;
  tipo: "foto" | "pdf" | "medicion" | "video" | "certificado" | "otro";
  titulo: string | null;
  descripcion: string | null;
  ruta_archivo: string | null;
  mime_type: string | null;
  tamanio_bytes: number | null;
  created_at: string;
}

export interface OTTransformadorRef {
  id: number;
  codigo_interno: string | null;
  marca: string | null;
  modelo: string | null;
  capacidad_kva: number;
  tipo: string;
  numero_serie: string | null;
}

export interface OT {
  id: number;
  codigo: string | null;
  contrato_id: number;
  transformador_id?: number | null;
  tipo_ruta: TipoRuta;
  prioridad: PrioridadOT;
  descripcion: string | null;
  fecha_inicio_planeada: string | null;
  fecha_fin_planeada: string | null;
  fecha_inicio_real: string | null;
  fecha_fin_real: string | null;
  paso_actual: number | null;
  responsable_id: string | null;
  estado: EstadoOT;
  motivo_cancelacion: string | null;
  observaciones: string | null;
  notas_internas: string | null;
  contratos?: {
    id: number; codigo: string; estado?: string;
    clientes?: { id: number; razon_social: string; ruc_cedula: string } | null;
  };
  usuarios_ot_responsable_idTousuarios?: { id: string; nombres: string; apellidos: string; email?: string } | null;
  transformadores?: OTTransformadorRef | null;
  ot_pasos?: OTPaso[];
  ot_evidencias?: OTEvidencia[];
  expedientes?: Array<{ id: number; codigo: string }>;
  _count?: { ot_pasos: number };
}

export interface CreateOT {
  contrato_id: number;
  tipo_ruta: TipoRuta;
  prioridad?: PrioridadOT;
  descripcion?: string | null;
  fecha_inicio_planeada?: string | null;
  fecha_fin_planeada?: string | null;
  responsable_id?: string | null;
  observaciones?: string | null;
  transformador_id?: number | null;
}

export interface ListParams {
  page?: number;
  limit?: number;
  q?: string;
  estado?: EstadoOT;
  tipo_ruta?: TipoRuta;
  prioridad?: PrioridadOT;
  responsable_id?: string;
  contrato_id?: number;
}

export interface ListResponse {
  data: OT[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}

export interface ResumenOT {
  data: {
    por_estado: Record<string, number>;
    urgentes_abiertas: number;
    atrasadas: number;
  };
}

// API
export async function listOT(params: ListParams = {}): Promise<ListResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== null) qs.set(k, String(v));
  }
  return api.get(`/api/ot${qs.toString() ? `?${qs}` : ""}`);
}

export async function getOT(id: number): Promise<{ data: OT }> {
  return api.get(`/api/ot/${id}`);
}

export async function createOT(payload: CreateOT): Promise<{ data: OT }> {
  return api.post(`/api/ot`, payload);
}

export async function updateOT(id: number, payload: Partial<CreateOT> & { notas_internas?: string | null }): Promise<{ data: OT }> {
  return api.patch(`/api/ot/${id}`, payload);
}

export async function getResumenOT(): Promise<ResumenOT> {
  return api.get(`/api/ot/dashboard/resumen`);
}

// Transiciones OT
export async function iniciarOT(id: number) { return api.post(`/api/ot/${id}/iniciar`); }
export async function pausarOT(id: number) { return api.post(`/api/ot/${id}/pausar`); }
export async function completarOT(id: number) { return api.post(`/api/ot/${id}/completar`); }
export async function cancelarOT(id: number, motivo: string) { return api.post(`/api/ot/${id}/cancelar`, { motivo }); }

// Pasos
export async function iniciarPaso(otId: number, pasoId: number) {
  return api.post(`/api/ot/${otId}/pasos/${pasoId}/iniciar`);
}
export async function completarPaso(
  otId: number,
  pasoId: number,
  body?: { observaciones?: string | null; mediciones?: Record<string, unknown>; resultado_gate?: ResultadoGate },
) {
  return api.post(`/api/ot/${otId}/pasos/${pasoId}/completar`, body ?? {});
}
export async function rechazarPaso(otId: number, pasoId: number, observaciones: string) {
  return api.post(`/api/ot/${otId}/pasos/${pasoId}/rechazar`, { observaciones });
}
export async function saltarPaso(otId: number, pasoId: number) {
  return api.post(`/api/ot/${otId}/pasos/${pasoId}/saltar`);
}

// Helpers UI
export function estadoOTVariant(e: EstadoOT): "success" | "default" | "warning" | "destructive" | "muted" {
  switch (e) {
    case "completada": return "success";
    case "en_curso": return "default";
    case "pausada": return "warning";
    case "cancelada": return "destructive";
    case "planeada":
    default: return "muted";
  }
}

export function prioridadVariant(p: PrioridadOT): "default" | "warning" | "destructive" | "muted" {
  switch (p) {
    case "urgente": return "destructive";
    case "alta": return "warning";
    case "normal": return "default";
    case "baja":
    default: return "muted";
  }
}

export function estadoPasoIcon(estado: EstadoPaso): string {
  switch (estado) {
    case "completado": return "✓";
    case "en_curso": return "⏳";
    case "rechazado": return "✗";
    case "saltado": return "—";
    case "pendiente":
    default: return "○";
  }
}

export function estadoPasoVariant(estado: EstadoPaso): "success" | "default" | "destructive" | "muted" {
  switch (estado) {
    case "completado": return "success";
    case "en_curso": return "default";
    case "rechazado": return "destructive";
    case "saltado":
    case "pendiente":
    default: return "muted";
  }
}

export function tipoRutaLabel(t: TipoRuta): string {
  return { reparacion: "Reparación", fabricacion: "Fabricación", mantenimiento: "Mantenimiento" }[t];
}
