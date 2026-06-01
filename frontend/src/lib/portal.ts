import { api } from "./api";

export interface PortalHito {
  id: number;
  codigo: string;
  nombre: string;
  orden: number;
  estado: "no_iniciado" | "en_curso" | "bloqueado" | "completado" | "rechazado" | "omitido";
  visible_cliente: boolean;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  label_cliente: string;
  descripcion_cliente: string | null;
  emoji: string | null;
}

export interface PortalTransformador {
  id: number;
  codigo_interno: string | null;
  marca: string | null;
  modelo: string | null;
  capacidad_kva: number;
  tipo: string;
  numero_serie?: string | null;
}

export interface PortalExpedienteResumen {
  id: number;
  codigo: string;
  estado: "activo" | "ganado" | "perdido" | "cancelado";
  tipo_servicio_estimado: string | null;
  tipo_servicio_confirmado: string | null;
  fecha_apertura: string;
  fecha_cierre: string | null;
  descripcion_problema: string | null;
  expediente_hitos: Array<Omit<PortalHito, "label_cliente" | "descripcion_cliente" | "emoji">>;
  transformadores: PortalTransformador | null;
}

export interface PortalExpedienteDetalle {
  id: number;
  codigo: string;
  estado: "activo" | "ganado" | "perdido" | "cancelado";
  tipo_servicio_estimado: string | null;
  tipo_servicio_confirmado: string | null;
  fecha_apertura: string;
  fecha_cierre: string | null;
  descripcion_problema: string | null;
  expediente_hitos: PortalHito[];
  transformadores: PortalTransformador | null;
  ot: Array<{
    id: number;
    codigo: string | null;
    estado: string;
    tipo_ruta: string;
    fecha_inicio_planeada: string | null;
    fecha_fin_planeada: string | null;
    fecha_inicio_real: string | null;
    fecha_fin_real: string | null;
  }>;
  cotizaciones: { id: number; codigo: string; estado: string; total: string; fecha_emision: string } | null;
  contratos: { id: number; codigo: string; estado: string; monto_total: string; fecha_firma: string | null } | null;
  portal_meta: {
    avance_pct: number;
    completados: number;
    total: number;
    fase_actual_label: string;
    proximo_paso_label: string | null;
  };
}

export interface PortalResumen {
  por_estado: Record<string, number>;
  transformadores_registrados: number;
}

export const listMisExpedientes = () =>
  api.get<{ data: PortalExpedienteResumen[] }>(`/api/portal/mis-expedientes`);

export const getMiExpediente = (id: number) =>
  api.get<{ data: PortalExpedienteDetalle }>(`/api/portal/expediente/${id}`);

export const getPortalResumen = () =>
  api.get<{ data: PortalResumen }>(`/api/portal/resumen`);

// -------------------------------------------------------------------
// Aprobación de cotización por el cliente
// -------------------------------------------------------------------
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

/** URL del PDF (nivel cliente) de la cotización; abrir con window.open (cookie auto). */
export const verCotizacionPdfUrl = (cotId: number) =>
  `${API_BASE}/api/portal/cotizacion/${cotId}/pdf`;

export const aprobarCotizacion = (cotId: number) =>
  api.post<{ status: string }>(`/api/portal/cotizacion/${cotId}/aprobar`);

export const rechazarCotizacion = (cotId: number, motivo: string) =>
  api.post<{ status: string }>(`/api/portal/cotizacion/${cotId}/rechazar`, { motivo });

export const listMisTransformadores = () =>
  api.get<{ data: Array<PortalTransformador & { tension_primaria_kv: string | number | null; tension_secundaria_v: number | null; anio_fabricacion: number | null; ubicacion_actual: string | null; estado: string; _count: { ot: number } }> }>(`/api/portal/mis-transformadores`);
