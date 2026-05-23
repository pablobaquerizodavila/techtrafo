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
  dummy_capacidad_planta: {
    dummy: true; nota: string;
    por_area: Array<{ area: string; carga_pct: number; ot_activas: number }>;
  };
  dummy_causas_demora: {
    dummy: true; nota: string;
    causas: Array<{ causa: string; incidencias: number; dias_perdidos: number }>;
  };
  dummy_productividad: {
    dummy: true; nota: string;
    por_responsable: Array<{ nombre: string; ot_completadas_mes: number; eficiencia_pct: number }>;
  };
  generado_en: string;
}

export async function getDashboardProduccion(): Promise<{ data: DashboardData }> {
  return api.get(`/api/produccion/dashboard`);
}
