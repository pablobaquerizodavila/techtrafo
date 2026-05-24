import { api } from "./api";

export type EstadoGarantia = "vigente" | "vencida" | "suspendida" | "cancelada";
export type Severidad = "baja" | "media" | "alta" | "critica";
export type EstadoReclamo = "recibido" | "en_diagnostico" | "en_atencion" | "cerrado" | "rechazado";
export type CanalReclamo = "telefono" | "email" | "whatsapp" | "visita_planta" | "web" | "otro";
export type TipoIntervencion = "visita_diagnostico" | "reparacion" | "reemplazo" | "calibracion" | "asesoria" | "otro";
export type ResultadoIntervencion = "exitoso" | "parcial" | "fallido" | "no_aplica";

export interface Intervencion {
  id: number;
  reclamo_id: number;
  numero: number;
  tipo: TipoIntervencion;
  fecha_programada: string | null;
  fecha_real: string | null;
  ot_id: number | null;
  tecnico_id: string | null;
  hallazgos: string | null;
  acciones_tomadas: string | null;
  costo_interno: string | number;
  resultado: ResultadoIntervencion | null;
  observaciones: string | null;
  created_at: string;
  usuarios_intervenciones_tecnico_idTousuarios?: { id: string; nombres: string; apellidos: string } | null;
}

export interface Reclamo {
  id: number;
  codigo: string | null;
  garantia_id: number;
  fecha_reclamo: string;
  descripcion: string;
  severidad: Severidad;
  canal: CanalReclamo | null;
  reportado_por_nombre: string | null;
  estado: EstadoReclamo;
  resolucion: string | null;
  fecha_cierre: string | null;
  intervenciones?: Intervencion[];
}

export interface Garantia {
  id: number;
  codigo: string | null;
  serie_id: number | null;
  transformador_id: number | null;
  contrato_id: number | null;
  ot_id_origen: number | null;
  cliente_id: number;
  fecha_emision: string;
  fecha_inicio: string;
  fecha_fin: string;
  duracion_meses: number;
  alcance: string | null;
  condiciones: string | null;
  estado: EstadoGarantia;
  motivo_estado: string | null;
  dias_restantes?: number;
  clientes?: { id: number; razon_social: string; ruc_cedula: string; email?: string | null; telefono?: string | null };
  transformadores?: {
    id: number; codigo_interno: string | null; marca: string | null; modelo: string | null;
    capacidad_kva: number; tipo: string; numero_serie?: string | null;
  } | null;
  contratos?: { id: number; codigo: string } | null;
  ot?: { id: number; codigo: string | null; tipo_ruta?: string; fecha_fin_real?: string | null } | null;
  reclamos?: Reclamo[];
  _count?: { reclamos: number };
}

export interface CreateGarantia {
  cliente_id: number;
  transformador_id?: number | null;
  serie_id?: number | null;
  contrato_id?: number | null;
  ot_id_origen?: number | null;
  fecha_inicio: string;
  duracion_meses: number;
  alcance?: string | null;
  condiciones?: string | null;
}

export interface ResumenGarantias {
  total: number;
  vigentes: number;
  por_vencer_30d: number;
  vencidas_no_cerradas: number;
  reclamos_abiertos: number;
}

export interface ListParams {
  page?: number;
  limit?: number;
  q?: string;
  estado?: EstadoGarantia;
  cliente_id?: number;
  por_vencer_30d?: boolean;
}

export async function listGarantias(p: ListParams = {}): Promise<{ data: Garantia[]; pagination: { page: number; limit: number; total: number; total_pages: number } }> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (v !== undefined && v !== "" && v !== null && v !== false) qs.set(k, String(v));
  }
  return api.get(`/api/garantias${qs.toString() ? `?${qs}` : ""}`);
}

export const getGarantia = (id: number) => api.get<{ data: Garantia }>(`/api/garantias/${id}`);
export const createGarantia = (payload: CreateGarantia) => api.post<{ data: Garantia }>(`/api/garantias`, payload);
export const updateGarantia = (id: number, payload: Partial<Omit<Garantia, "id" | "codigo" | "cliente_id">>) =>
  api.patch<{ data: Garantia }>(`/api/garantias/${id}`, payload);
export const getResumenGarantias = () => api.get<{ data: ResumenGarantias }>(`/api/garantias/dashboard/resumen`);

export const crearReclamo = (
  garId: number,
  payload: { descripcion: string; severidad?: Severidad; canal?: CanalReclamo | null; reportado_por_nombre?: string | null },
) => api.post<{ data: Reclamo }>(`/api/garantias/${garId}/reclamos`, payload);

export const actualizarReclamo = (
  garId: number, rId: number,
  payload: { descripcion?: string; severidad?: Severidad; estado?: EstadoReclamo; resolucion?: string | null },
) => api.patch<{ data: Reclamo }>(`/api/garantias/${garId}/reclamos/${rId}`, payload);

export const crearIntervencion = (
  garId: number, rId: number,
  payload: {
    tipo: TipoIntervencion; fecha_programada?: string | null; ot_id?: number | null;
    tecnico_id?: string | null; hallazgos?: string | null; acciones_tomadas?: string | null;
    costo_interno?: number; resultado?: ResultadoIntervencion | null; observaciones?: string | null;
  },
) => api.post<{ data: Intervencion }>(`/api/garantias/${garId}/reclamos/${rId}/intervenciones`, payload);

// Helpers UI
export function estadoGarVariant(e: EstadoGarantia): "success" | "warning" | "destructive" | "muted" {
  switch (e) {
    case "vigente": return "success";
    case "vencida": return "warning";
    case "suspendida": return "muted";
    case "cancelada": return "destructive";
  }
}

export function severidadVariant(s: Severidad): "default" | "warning" | "destructive" {
  switch (s) {
    case "baja": return "default";
    case "media": return "default";
    case "alta": return "warning";
    case "critica": return "destructive";
  }
}

export function estadoReclamoVariant(e: EstadoReclamo): "default" | "warning" | "success" | "destructive" | "muted" {
  switch (e) {
    case "recibido": return "default";
    case "en_diagnostico": return "warning";
    case "en_atencion": return "warning";
    case "cerrado": return "success";
    case "rechazado": return "destructive";
  }
}
