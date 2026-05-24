import { api } from "./api";

export interface MatrizFila {
  origen: "ot" | "expediente";
  id: number;
  codigo: string | null;
  cliente: string | null;
  tipo: string;
  capacidad_kva: number | null;
  prioridad: string | null;
  estado: string;
  fase_actual: string | null;
  avance_pct: number;
  fecha_compromiso: string | null;
  responsable: string | null;
  dias_diff: number | null;
  semaforo: "verde" | "amarillo" | "rojo" | "azul" | "gris";
  capacidad_dummy: boolean;
}

export interface AlertaDash {
  id: string;
  tipo: string;
  mensaje: string;
  severidad: "alta" | "media" | "baja";
  ref?: { tipo: string; id: number } | null;
  dummy?: boolean;
}

export interface DummyBlock<T> {
  dummy: true;
  nota: string;
  // contenido depende de cada bloque
  [k: string]: unknown;
  por_area?: T;
  causas?: T;
  por_responsable?: T;
}

export interface DashboardData {
  kpis: {
    ot_total: number;
    ot_por_estado: Record<string, number>;
    expedientes_activos: number;
    expedientes_por_estado: Record<string, number>;
    ot_urgentes_abiertas: number;
    ot_atrasadas: number;
    expedientes_estancados: number;
    notificaciones_pendientes: number;
  };
  semaforo: { verde: number; amarillo: number; rojo: number; azul: number; gris: number };
  matriz: MatrizFila[];
  ranking_fases_demora: Array<{ codigo: string; nombre: string; cant_estancados: number; promedio_exceso_horas: number }>;
  cumplimiento_cliente: Array<{ cliente: string; total: number; a_tiempo: number; cumplimiento_pct: number }>;
  alertas: AlertaDash[];
  proximas_entregas: Array<{ id: number; codigo: string | null; cliente: string | null; fecha: string | null; dias_para: number | null }>;
  capacidad_planta: {
    dummy: false;
    por_area: Array<{ area: string; codigo: string; color_hex: string; carga_pct: number; ot_activas: number; completados_mes: number }>;
  };
  causas_demora: {
    dummy: false;
    causas: Array<{ codigo: string; causa: string; categoria: string; incidencias: number; abiertas: number; dias_perdidos: number }>;
  };
  productividad: {
    dummy: false;
    por_responsable: Array<{ usuario_id: string; nombre: string; email: string; ot_intervenidas_mes: number; horas_mes: number; pasos_completados_mes: number }>;
  };
  generado_en: string;
}

export async function getDashboardProduccion(): Promise<{ data: DashboardData }> {
  return api.get(`/api/produccion/dashboard`);
}

// ===================================================================
// Catálogos: áreas y causas de demora (migration 013)
// ===================================================================
export interface Area {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  color_hex: string;
  orden: number;
  activo: boolean;
}
export interface CausaDemora {
  id: number;
  codigo: string;
  nombre: string;
  categoria: "materiales" | "personal" | "calidad" | "tecnica" | "cliente" | "operativa" | "otra";
  activo: boolean;
}
export interface TiempoTrabajo {
  id: number;
  ot_id: number;
  paso_id: number | null;
  area_id: number | null;
  usuario_id: string;
  fecha: string;
  horas: string | number;
  descripcion: string | null;
  areas?: { codigo: string; nombre: string; color_hex: string } | null;
  usuarios?: { id: string; nombres: string; apellidos: string } | null;
  ot_pasos?: { id: number; numero: number; nombre: string } | null;
}
export interface Reproceso {
  id: number;
  ot_id: number;
  paso_id: number | null;
  causa_demora_id: number | null;
  descripcion: string;
  dias_perdidos: string | number;
  costo_estimado: string | number | null;
  reportado_por: string | null;
  resuelto: boolean;
  fecha_resolucion: string | null;
  notas_resolucion: string | null;
  created_at: string;
  causas_demora?: CausaDemora | null;
  ot_pasos?: { id: number; numero: number; nombre: string } | null;
  ot?: { id: number; codigo: string } | null;
}

export const listAreas = () => api.get<{ data: Area[] }>(`/api/produccion/areas`);
export const createArea = (payload: Omit<Area, "id">) => api.post<{ data: Area }>(`/api/produccion/areas`, payload);
export const updateArea = (id: number, payload: Partial<Omit<Area, "id">>) =>
  api.patch<{ data: Area }>(`/api/produccion/areas/${id}`, payload);

export const listCausasDemora = () => api.get<{ data: CausaDemora[] }>(`/api/produccion/causas-demora`);
export const createCausaDemora = (payload: Omit<CausaDemora, "id">) =>
  api.post<{ data: CausaDemora }>(`/api/produccion/causas-demora`, payload);
export const updateCausaDemora = (id: number, payload: Partial<Omit<CausaDemora, "id">>) =>
  api.patch<{ data: CausaDemora }>(`/api/produccion/causas-demora/${id}`, payload);

export const listTiempos = (otId?: number) =>
  api.get<{ data: TiempoTrabajo[] }>(`/api/produccion/tiempos${otId ? `?ot_id=${otId}` : ""}`);
export const registrarTiempo = (payload: {
  ot_id: number; paso_id?: number | null; area_id?: number | null;
  fecha?: string | null; horas: number; descripcion?: string | null;
}) => api.post<{ data: TiempoTrabajo }>(`/api/produccion/tiempos`, payload);

export const listReprocesos = (otId?: number) =>
  api.get<{ data: Reproceso[] }>(`/api/produccion/reprocesos${otId ? `?ot_id=${otId}` : ""}`);
export const registrarReproceso = (payload: {
  ot_id: number; paso_id?: number | null; causa_demora_id: number;
  descripcion: string; dias_perdidos?: number; costo_estimado?: number | null;
}) => api.post<{ data: Reproceso }>(`/api/produccion/reprocesos`, payload);
export const resolverReproceso = (id: number, notas?: string) =>
  api.post<{ data: Reproceso }>(`/api/produccion/reprocesos/${id}/resolver`, { notas });
