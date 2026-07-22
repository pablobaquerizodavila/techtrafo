import { api, getCsrfTokenFromCookie } from "./api";

export type EstadoReq =
  | "registrado"
  | "en_revision"
  | "pendiente_informacion"
  | "aprobado"
  | "rechazado"
  | "en_planificacion"
  | "en_desarrollo"
  | "en_pruebas"
  | "listo_produccion"
  | "completado"
  | "cancelado";
export type PrioridadReq = "baja" | "media" | "alta" | "urgente";
export type TipoReq =
  | "nuevo_desarrollo"
  | "mejora"
  | "correccion_error"
  | "cambio_configuracion"
  | "integracion"
  | "reporte_consulta"
  | "otro";

export interface UsuarioMin {
  id: string;
  nombres: string;
  apellidos?: string;
}

export interface Requerimiento {
  id: string; // serializado (BigInt del backend)
  codigo: string;
  titulo: string;
  tipo: TipoReq;
  modulo_relacionado?: string | null;
  descripcion: string;
  problema?: string | null;
  resultado_esperado?: string | null;
  prioridad_sugerida: PrioridadReq;
  prioridad?: PrioridadReq | null;
  estado: EstadoReq;
  solicitante_id: string;
  asignado_a?: string | null;
  fecha_requerida?: string | null;
  fecha_estimada_entrega?: string | null;
  created_at: string;
  updated_at: string;
  usuarios_requerimientos_solicitante_idTousuarios?: UsuarioMin | null;
  usuarios_requerimientos_asignado_aTousuarios?: UsuarioMin | null;
}

export interface Comentario {
  id: string;
  cuerpo: string;
  es_tecnico: boolean;
  created_at: string;
  usuarios?: UsuarioMin | null;
}

export interface Adjunto {
  id: string;
  nombre_original?: string | null;
  mime?: string | null;
  tamano_bytes?: string | number | null;
  created_at: string;
  usuarios?: UsuarioMin | null;
}

export interface HistorialItem {
  id: string;
  accion: string;
  detalle: Record<string, unknown>;
  created_at: string;
  usuarios?: UsuarioMin | null;
}

export interface Paginacion {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface ResumenReq {
  total: number;
  por_estado: Record<string, number>;
  por_prioridad: Record<string, number>;
  por_responsable: { responsable_id: string; nombre: string; total: number }[];
  tiempo_promedio_horas: number;
  vencidos: number;
}

export interface ListarParams {
  q?: string;
  estado?: EstadoReq;
  prioridad?: PrioridadReq;
  tipo?: TipoReq;
  modulo?: string;
  solicitante?: string;
  responsable?: string;
  desde?: string;
  hasta?: string;
  bandeja?: string;
  page?: number;
  limit?: number;
}

export interface ResumenParams {
  desde?: string;
  hasta?: string;
  responsable?: string;
  bandeja?: string;
}

// ===================================================================
// Helpers de nombres (formatean las relaciones embebidas)
// ===================================================================
function nombreUsuario(u?: UsuarioMin | null): string {
  if (!u) return "—";
  return [u.nombres, u.apellidos].filter(Boolean).join(" ").trim() || "—";
}

export function solicitanteNombre(r: Requerimiento): string {
  return nombreUsuario(r.usuarios_requerimientos_solicitante_idTousuarios);
}

export function responsableNombre(r: Requerimiento): string {
  return nombreUsuario(r.usuarios_requerimientos_asignado_aTousuarios);
}

// ===================================================================
// API — base /api/requerimientos
// ===================================================================
export async function listar(
  params: ListarParams = {},
): Promise<{ data: Requerimiento[]; pagination: Paginacion }> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== null) qs.set(k, String(v));
  }
  return api.get(`/api/requerimientos${qs.toString() ? `?${qs}` : ""}`);
}

export async function obtener(id: string): Promise<{ data: Requerimiento }> {
  return api.get(`/api/requerimientos/${id}`);
}

export async function crear(
  payload: Partial<Requerimiento>,
): Promise<{ data: Requerimiento }> {
  return api.post(`/api/requerimientos`, payload);
}

export async function editar(
  id: string,
  payload: Partial<Requerimiento>,
): Promise<{ data: Requerimiento }> {
  return api.patch(`/api/requerimientos/${id}`, payload);
}

export async function cambiarEstado(
  id: string,
  estado: EstadoReq,
  nota?: string,
): Promise<{ data: Requerimiento }> {
  return api.post(`/api/requerimientos/${id}/estado`, { estado, nota });
}

export async function cambiarPrioridad(
  id: string,
  prioridad: PrioridadReq,
): Promise<{ data: Requerimiento }> {
  return api.post(`/api/requerimientos/${id}/prioridad`, { prioridad });
}

export async function asignar(
  id: string,
  asignado_a: string,
): Promise<{ data: Requerimiento }> {
  return api.post(`/api/requerimientos/${id}/asignar`, { asignado_a });
}

export async function estimar(
  id: string,
  fecha_estimada_entrega: string,
): Promise<{ data: Requerimiento }> {
  return api.post(`/api/requerimientos/${id}/estimar`, { fecha_estimada_entrega });
}

export async function solicitarInfo(
  id: string,
  mensaje: string,
): Promise<{ data: Requerimiento }> {
  return api.post(`/api/requerimientos/${id}/solicitar-info`, { mensaje });
}

export async function cancelar(id: string): Promise<{ data: Requerimiento }> {
  return api.post(`/api/requerimientos/${id}/cancelar`);
}

// Comentarios
export async function comentarios(id: string): Promise<{ data: Comentario[] }> {
  return api.get(`/api/requerimientos/${id}/comentarios`);
}

export async function comentar(
  id: string,
  cuerpo: string,
): Promise<{ data: Comentario }> {
  return api.post(`/api/requerimientos/${id}/comentarios`, { cuerpo });
}

// Adjuntos
export async function adjuntos(id: string): Promise<{ data: Adjunto[] }> {
  return api.get(`/api/requerimientos/${id}/adjuntos`);
}

export async function subirAdjunto(
  id: string,
  file: File,
): Promise<{ data: Adjunto }> {
  const fd = new FormData();
  fd.append("file", file);
  const base = process.env.NEXT_PUBLIC_API_URL ?? "";
  // El middleware CSRF exige X-CSRF-Token tambien en multipart (no exime uploads).
  const csrf = getCsrfTokenFromCookie();
  const res = await fetch(`${base}/api/requerimientos/${id}/adjuntos`, {
    method: "POST", body: fd, credentials: "include",
    headers: csrf ? { "X-CSRF-Token": csrf } : {},
  });
  const body = await res.json();
  if (!res.ok) throw Object.assign(new Error("upload_failed"), { status: res.status, body });
  return body;
}

/** URL absoluta para abrir/descargar el adjunto (respeta cookie). */
export function urlAdjunto(id: string, adjId: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "";
  return `${base}/api/requerimientos/${id}/adjuntos/${adjId}/file`;
}

// Historial
export async function historial(id: string): Promise<{ data: HistorialItem[] }> {
  return api.get(`/api/requerimientos/${id}/historial`);
}

// Resumen / export
export async function resumen(
  params: ResumenParams = {},
): Promise<{ data: ResumenReq }> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== null) qs.set(k, String(v));
  }
  return api.get(`/api/requerimientos/resumen${qs.toString() ? `?${qs}` : ""}`);
}

export function urlExport(params: ListarParams = {}): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== null) qs.set(k, String(v));
  }
  const base = process.env.NEXT_PUBLIC_API_URL ?? "";
  return `${base}/api/requerimientos/export${qs.toString() ? `?${qs}` : ""}`;
}

// ===================================================================
// Helpers UI
// ===================================================================
export function estadoReqVariant(
  e: EstadoReq,
): "success" | "default" | "warning" | "destructive" | "muted" {
  switch (e) {
    case "completado":
      return "success";
    case "en_desarrollo":
    case "en_pruebas":
    case "listo_produccion":
      return "default";
    case "en_revision":
    case "pendiente_informacion":
    case "aprobado":
    case "en_planificacion":
      return "warning";
    case "rechazado":
    case "cancelado":
      return "destructive";
    case "registrado":
    default:
      return "muted";
  }
}

export function prioridadReqVariant(
  p?: PrioridadReq | null,
): "default" | "warning" | "destructive" | "muted" {
  switch (p) {
    case "urgente":
      return "destructive";
    case "alta":
      return "warning";
    case "media":
      return "default";
    case "baja":
    default:
      return "muted";
  }
}

const ESTADO_LABELS: Record<EstadoReq, string> = {
  registrado: "Registrado",
  en_revision: "En revisión",
  pendiente_informacion: "Pendiente de información",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  en_planificacion: "En planificación",
  en_desarrollo: "En desarrollo",
  en_pruebas: "En pruebas",
  listo_produccion: "Listo para producción",
  completado: "Completado",
  cancelado: "Cancelado",
};

const TIPO_LABELS: Record<TipoReq, string> = {
  nuevo_desarrollo: "Nuevo desarrollo",
  mejora: "Mejora",
  correccion_error: "Corrección de error",
  cambio_configuracion: "Cambio de configuración",
  integracion: "Integración",
  reporte_consulta: "Reporte / consulta",
  otro: "Otro",
};

const PRIORIDAD_LABELS: Record<PrioridadReq, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
  urgente: "Urgente",
};

export function estadoReqLabel(e: EstadoReq): string {
  return ESTADO_LABELS[e] ?? e;
}

export function tipoReqLabel(t: TipoReq): string {
  return TIPO_LABELS[t] ?? t;
}

export function prioridadLabel(p?: PrioridadReq | null): string {
  return p ? PRIORIDAD_LABELS[p] ?? p : "—";
}

// Opciones para selects
export const TIPOS: { value: TipoReq; label: string }[] = (
  Object.keys(TIPO_LABELS) as TipoReq[]
).map((value) => ({ value, label: TIPO_LABELS[value] }));

export const ESTADOS: { value: EstadoReq; label: string }[] = (
  Object.keys(ESTADO_LABELS) as EstadoReq[]
).map((value) => ({ value, label: ESTADO_LABELS[value] }));

export const PRIORIDADES: { value: PrioridadReq; label: string }[] = (
  Object.keys(PRIORIDAD_LABELS) as PrioridadReq[]
).map((value) => ({ value, label: PRIORIDAD_LABELS[value] }));

export const BANDEJAS: { key: string; label: string }[] = [
  { key: "mis", label: "Mis requerimientos" },
  { key: "todos", label: "Todos" },
  { key: "pend_revision", label: "Pendientes de revisión" },
  { key: "asignados", label: "Asignados a mí" },
  { key: "en_desarrollo", label: "En desarrollo" },
  { key: "pend_info", label: "Pendientes de información" },
  { key: "completados", label: "Completados" },
  { key: "cancelados", label: "Cancelados" },
];
