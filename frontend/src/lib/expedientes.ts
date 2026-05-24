import { api } from "./api";

export type CanalOrigen = "web" | "whatsapp" | "telefono" | "email" | "referido" | "visita_directa" | "otro";
export type TipoServicioEstimado = "reparacion" | "fabricacion" | "mantenimiento" | "otro";
export type EstadoExpediente = "activo" | "ganado" | "perdido" | "cancelado";
export type EstadoHito = "no_iniciado" | "en_curso" | "bloqueado" | "completado" | "rechazado" | "omitido";

export interface ExpedienteHito {
  id: number;
  expediente_id: number;
  plantilla_id: number | null;
  codigo: string;
  nombre: string;
  orden: number;
  visible_cliente: boolean;
  requiere_aprobacion: boolean;
  rol_aprobador_id: number | null;
  sla_horas: number | null;
  estado: EstadoHito;
  responsable_id: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  aprobado_por: string | null;
  fecha_aprobacion: string | null;
  motivo_rechazo: string | null;
  notas: string | null;
  metadata: Record<string, unknown>;
  horas_transcurridas: number | null;
  estancado: boolean;
  usuarios_expediente_hitos_responsable_idTousuarios?: { id: string; nombres: string; apellidos: string } | null;
  usuarios_expediente_hitos_aprobado_porTousuarios?: { id: string; nombres: string; apellidos: string } | null;
  roles?: { id: number; nombre: string } | null;
}

export interface VisitaTecnica {
  id: number;
  expediente_id: number;
  hito_id: number | null;
  fecha_programada: string | null;
  fecha_realizada: string | null;
  ubicacion_tipo: "sitio_cliente" | "planta" | "virtual";
  direccion: string | null;
  ingeniero_id: string | null;
  hallazgos: string | null;
  fotos_urls: string[] | null;
  recomendacion: "reparar" | "reconstruir" | "mantenimiento" | "no_viable" | null;
  observaciones: string | null;
  estado: "programada" | "realizada" | "cancelada";
}

export interface InformeTecnico {
  id: number;
  expediente_id: number;
  hito_id: number | null;
  visita_id: number | null;
  numero: string;
  diagnostico_completo: string | null;
  decision_tecnica: "reparar" | "reconstruir" | "mantenimiento" | "no_viable" | null;
  justificacion: string | null;
  archivo_pdf_url: string | null;
  estado: "borrador" | "en_revision" | "aprobado" | "rechazado";
  aprobado_por: string | null;
  fecha_aprobacion: string | null;
}

export interface Expediente {
  id: number;
  codigo: string;
  cliente_id: number;
  contacto_id: number | null;
  ejecutivo_id: string | null;
  canal_origen: CanalOrigen | null;
  tipo_servicio_estimado: TipoServicioEstimado | null;
  tipo_servicio_confirmado: TipoServicioEstimado | null;
  descripcion_problema: string | null;
  cotizacion_id: number | null;
  contrato_id: number | null;
  ot_id: number | null;
  garantia_id: number | null;
  estado: EstadoExpediente;
  motivo_cierre: string | null;
  fecha_apertura: string;
  fecha_cierre: string | null;
  clientes?: { id: number; razon_social: string; ruc_cedula: string; email?: string | null; telefono?: string | null };
  cliente_contactos?: { id: number; nombres: string; apellidos: string | null; email: string | null } | null;
  usuarios_expedientes_ejecutivo_idTousuarios?: { id: string; nombres: string; apellidos: string; email?: string } | null;
  cotizaciones?: { id: number; codigo: string; estado: string; total: string } | null;
  contratos?: { id: number; codigo: string; estado: string; monto_total: string } | null;
  ot?: { id: number; codigo: string; estado: string; tipo_ruta: string } | null;
  garantias?: { id: number; codigo: string; estado: string; fecha_fin: string } | null;
  expediente_hitos?: ExpedienteHito[];
  visitas_tecnicas?: VisitaTecnica[];
  informes_tecnicos?: InformeTecnico[];
}

export interface CreateExpediente {
  cliente_id: number;
  contacto_id?: number | null;
  ejecutivo_id?: string | null;
  canal_origen?: CanalOrigen | null;
  tipo_servicio_estimado: TipoServicioEstimado;
  descripcion_problema?: string | null;
}

export interface ListParams {
  page?: number;
  limit?: number;
  q?: string;
  estado?: EstadoExpediente;
  ejecutivo_id?: string;
  cliente_id?: number;
  estancados?: boolean;
}

export interface ListResponse {
  data: Expediente[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}

export interface ResumenResponse {
  data: {
    total_activos: number;
    total_estancados: number;
    por_estado: Record<string, number>;
  };
}

export async function listExpedientes(params: ListParams = {}): Promise<ListResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== null) qs.set(k, String(v));
  }
  return api.get(`/api/expedientes${qs.toString() ? `?${qs}` : ""}`);
}

export async function getExpediente(id: number): Promise<{ data: Expediente }> {
  return api.get(`/api/expedientes/${id}`);
}

export async function createExpediente(payload: CreateExpediente): Promise<{ data: Expediente }> {
  return api.post(`/api/expedientes`, payload);
}

export async function getResumenExpedientes(): Promise<ResumenResponse> {
  return api.get(`/api/expedientes/dashboard/resumen`);
}

export async function iniciarHito(expId: number, hitoId: number, responsable_id?: string): Promise<{ data: ExpedienteHito }> {
  return api.post(`/api/expedientes/${expId}/hitos/${hitoId}/iniciar`, responsable_id ? { responsable_id } : {});
}

export async function aprobarHito(expId: number, hitoId: number, notas?: string): Promise<{ data: ExpedienteHito }> {
  return api.post(`/api/expedientes/${expId}/hitos/${hitoId}/aprobar`, notas ? { notas } : {});
}

export async function rechazarHito(expId: number, hitoId: number, motivo: string): Promise<{ data: ExpedienteHito }> {
  return api.post(`/api/expedientes/${expId}/hitos/${hitoId}/rechazar`, { motivo });
}

export async function updateHitoSla(expId: number, hitoId: number, sla_horas: number | null): Promise<{ data: { id: number; codigo: string; nombre: string; sla_horas: number | null; estado: string } }> {
  return api.patch(`/api/expedientes/${expId}/hitos/${hitoId}`, { sla_horas });
}

// Helpers de UI
export function estadoHitoVariant(estado: EstadoHito, estancado: boolean): "success" | "default" | "warning" | "destructive" | "muted" {
  if (estancado) return "destructive";
  switch (estado) {
    case "completado": return "success";
    case "en_curso": return "default";
    case "bloqueado": return "warning";
    case "rechazado": return "destructive";
    case "no_iniciado":
    case "omitido":
    default: return "muted";
  }
}

export function estadoHitoIcon(estado: EstadoHito, estancado: boolean): string {
  if (estancado) return "⚠️";
  switch (estado) {
    case "completado": return "✓";
    case "en_curso": return "⏳";
    case "bloqueado": return "🚫";
    case "rechazado": return "✗";
    case "omitido": return "—";
    case "no_iniciado":
    default: return "○";
  }
}

export function estadoExpedienteVariant(e: EstadoExpediente): "success" | "default" | "destructive" | "muted" {
  switch (e) {
    case "activo": return "default";
    case "ganado": return "success";
    case "perdido": return "destructive";
    case "cancelado": return "muted";
  }
}

// ===================================================================
// Notificaciones (4.D)
// ===================================================================
export interface Notificacion {
  id: number;
  tipo: string;
  asunto: string;
  enviado: boolean;
  fecha_envio: string | null;
  contexto: Record<string, unknown>;
  created_at: string;
}

export async function listNotificaciones(limit = 25): Promise<{ data: Notificacion[] }> {
  return api.get(`/api/notificaciones?limit=${limit}`);
}

export async function getResumenNotificaciones(): Promise<{ data: { recientes_48h: number; total: number } }> {
  return api.get(`/api/notificaciones/resumen`);
}

export function canalOrigenLabel(c: CanalOrigen | null): string {
  if (!c) return "—";
  return {
    web: "Web",
    whatsapp: "WhatsApp",
    telefono: "Teléfono",
    email: "Email",
    referido: "Referido",
    visita_directa: "Visita directa",
    otro: "Otro",
  }[c];
}
