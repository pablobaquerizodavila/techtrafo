import { api } from "./api";

export type TipoTransformador =
  | "distribucion" | "potencia" | "seco" | "aceite" | "pedestal" | "subestacion" | "especial";

export type EstadoTransformador =
  | "en_servicio" | "en_taller" | "en_almacen" | "fuera_de_servicio" | "dado_de_baja";

export interface OTHistorial {
  id: number;
  codigo: string | null;
  tipo_ruta: string;
  estado: string;
  prioridad: string;
  descripcion: string | null;
  fecha_inicio_real: string | null;
  fecha_fin_real: string | null;
  fecha_fin_planeada: string | null;
  created_at: string;
  contratos?: { codigo: string } | null;
}

export interface Transformador {
  id: number;
  codigo_interno: string | null;
  numero_serie: string | null;
  marca: string | null;
  modelo: string | null;
  cliente_id: number | null;
  tipo: TipoTransformador;
  capacidad_kva: number;
  tension_primaria_kv: string | number | null;
  tension_secundaria_v: number | null;
  conexion: string | null;
  grupo_vectorial: string | null;
  numero_fases: number | null;
  frecuencia_hz: number | null;
  refrigeracion: string | null;
  peso_kg: string | number | null;
  ancho_mm: number | null;
  alto_mm: number | null;
  profundidad_mm: number | null;
  anio_fabricacion: number | null;
  fecha_puesta_servicio: string | null;
  ubicacion_actual: string | null;
  estado: EstadoTransformador;
  observaciones: string | null;
  notas_internas: string | null;
  created_at: string;
  updated_at: string;
  clientes?: { id: number; razon_social: string; ruc_cedula: string; email?: string | null; telefono?: string | null } | null;
  ot?: OTHistorial[];
  historial_stats?: {
    total_intervenciones: number;
    completadas: number;
    en_curso: number;
    ultima_intervencion: string | null;
  };
  _count?: { ot: number };
}

export interface CreateTransformador {
  numero_serie?: string | null;
  marca?: string | null;
  modelo?: string | null;
  cliente_id?: number | null;
  tipo: TipoTransformador;
  capacidad_kva: number;
  tension_primaria_kv?: number | null;
  tension_secundaria_v?: number | null;
  conexion?: string | null;
  grupo_vectorial?: string | null;
  numero_fases?: 1 | 3 | null;
  frecuencia_hz?: 50 | 60 | null;
  refrigeracion?: string | null;
  peso_kg?: number | null;
  ancho_mm?: number | null;
  alto_mm?: number | null;
  profundidad_mm?: number | null;
  anio_fabricacion?: number | null;
  fecha_puesta_servicio?: string | null;
  ubicacion_actual?: string | null;
  estado?: EstadoTransformador;
  observaciones?: string | null;
  notas_internas?: string | null;
}

export interface ListParams {
  page?: number;
  limit?: number;
  q?: string;
  cliente_id?: number;
  tipo?: TipoTransformador;
  estado?: EstadoTransformador;
  capacidad_min?: number;
  capacidad_max?: number;
}

export interface ListResponse {
  data: Transformador[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}

export async function listTransformadores(params: ListParams = {}): Promise<ListResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== null) qs.set(k, String(v));
  }
  return api.get(`/api/transformadores${qs.toString() ? `?${qs}` : ""}`);
}

export async function getTransformador(id: number): Promise<{ data: Transformador }> {
  return api.get(`/api/transformadores/${id}`);
}

export async function createTransformador(payload: CreateTransformador): Promise<{ data: Transformador }> {
  return api.post(`/api/transformadores`, payload);
}

export async function updateTransformador(id: number, payload: Partial<CreateTransformador>): Promise<{ data: Transformador }> {
  return api.patch(`/api/transformadores/${id}`, payload);
}

export async function listTransformadoresByCliente(clienteId: number): Promise<{ data: Transformador[] }> {
  return api.get(`/api/transformadores/cliente/${clienteId}`);
}

// Helpers UI
export function tipoLabel(t: TipoTransformador): string {
  return {
    distribucion: "Distribución",
    potencia: "Potencia",
    seco: "Seco",
    aceite: "Aceite",
    pedestal: "Pedestal",
    subestacion: "Subestación",
    especial: "Especial",
  }[t];
}

export function estadoLabel(e: EstadoTransformador): string {
  return {
    en_servicio: "En servicio",
    en_taller: "En taller",
    en_almacen: "En almacén",
    fuera_de_servicio: "Fuera de servicio",
    dado_de_baja: "Dado de baja",
  }[e];
}

export function estadoVariant(e: EstadoTransformador): "success" | "default" | "warning" | "destructive" | "muted" {
  switch (e) {
    case "en_servicio": return "success";
    case "en_taller": return "default";
    case "en_almacen": return "muted";
    case "fuera_de_servicio": return "warning";
    case "dado_de_baja": return "destructive";
  }
}

/** Formatea kVA → "500 kVA" o "1.5 MVA" según escala */
export function formatCapacidad(kva: number): string {
  if (kva >= 1000) {
    const mva = kva / 1000;
    return `${mva % 1 === 0 ? mva.toFixed(0) : mva.toFixed(2)} MVA`;
  }
  return `${kva} kVA`;
}
