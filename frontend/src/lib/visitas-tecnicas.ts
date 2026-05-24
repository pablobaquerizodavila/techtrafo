import { api } from "./api";

export type UbicacionTipo = "sitio_cliente" | "planta" | "virtual";
export type Recomendacion = "reparar" | "reconstruir" | "mantenimiento" | "no_viable";
export type EstadoVisita = "programada" | "realizada" | "cancelada";

export interface DatosInspeccion {
  estado_general?: string;
  estado_aceite?: string;
  color_aceite?: string;
  ruidos_anomalos?: boolean;
  temperatura_externa_c?: number;
  resistencia_aislamiento_mohm?: number;
  voltaje_primario_v?: number;
  voltaje_secundario_v?: number;
  hallazgos?: string[];
  recomendacion?: Recomendacion;
  justificacion?: string;
  fotos_urls?: string[];
  [key: string]: unknown;
}

export interface VisitaTecnica {
  id: number;
  expediente_id: number;
  hito_id: number | null;
  fecha_programada: string | null;
  fecha_realizada: string | null;
  ubicacion_tipo: UbicacionTipo;
  direccion: string | null;
  ingeniero_id: string | null;
  hallazgos: string | null;
  fotos_urls: string[] | null;
  recomendacion: Recomendacion | null;
  observaciones: string | null;
  estado: EstadoVisita;
  datos_inspeccion: DatosInspeccion | null;
  created_at: string;
}

export async function createVisita(payload: {
  expediente_id: number;
  hito_id?: number | null;
  fecha_programada?: string | null;
  ubicacion_tipo?: UbicacionTipo;
  direccion?: string | null;
  ingeniero_id?: string | null;
  observaciones?: string | null;
  datos_inspeccion?: DatosInspeccion | null;
}): Promise<{ data: VisitaTecnica }> {
  return api.post("/api/visitas-tecnicas", payload);
}

export async function updateVisita(id: number, payload: {
  fecha_realizada?: string | null;
  ubicacion_tipo?: UbicacionTipo;
  direccion?: string | null;
  ingeniero_id?: string | null;
  hallazgos?: string | null;
  recomendacion?: Recomendacion | null;
  observaciones?: string | null;
  estado?: EstadoVisita;
  datos_inspeccion?: DatosInspeccion | null;
}): Promise<{ data: VisitaTecnica; informe_creado_id: number | null }> {
  return api.patch(`/api/visitas-tecnicas/${id}`, payload);
}
