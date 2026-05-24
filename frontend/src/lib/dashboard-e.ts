import { api } from "./api";

// ===================================================================
// Gantt
// ===================================================================
export interface GanttPaso {
  id: number;
  numero: number;
  nombre: string;
  estado: "pendiente" | "en_curso" | "completado" | "saltado" | "rechazado";
  es_gate: boolean;
  area: { codigo: string; nombre: string; color: string } | null;
  plan_inicio: string;
  plan_fin: string;
  real_inicio: string | null;
  real_fin: string | null;
}
export interface GanttData {
  ot: {
    id: number; codigo: string | null; tipo_ruta: string;
    inicio_planeado: string | null; fin_planeado: string | null;
    inicio_real: string | null; fin_real: string | null;
  };
  rango: { desde: string; hasta: string };
  pasos: GanttPaso[];
}
export const getGanttOT = (otId: number) =>
  api.get<{ data: GanttData }>(`/api/ot/${otId}/gantt`);

// ===================================================================
// Evidencias
// ===================================================================
export interface Evidencia {
  id: number;
  ot_id: number;
  paso_id: number | null;
  tipo: "foto" | "pdf" | "medicion" | "video" | "certificado" | "otro";
  titulo: string | null;
  descripcion: string | null;
  ruta_archivo: string | null;
  mime_type: string | null;
  tamanio_bytes: string | number | null;
  created_at: string;
  usuarios?: { id: string; nombres: string; apellidos: string } | null;
  ot_pasos?: { id: number; numero: number; nombre: string } | null;
}

export const listEvidencias = (otId: number) =>
  api.get<{ data: Evidencia[] }>(`/api/ot/${otId}/evidencias`);

/** URL absoluta para abrir/descargar el archivo (respeta cookie). */
export function urlEvidencia(otId: number, evId: number): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "";
  return `${base}/api/ot/${otId}/evidencias/${evId}/file`;
}

export async function subirEvidencia(
  otId: number,
  file: File,
  meta: { titulo?: string; descripcion?: string; paso_id?: number | null; tipo?: Evidencia["tipo"] },
): Promise<{ data: Evidencia }> {
  const fd = new FormData();
  fd.append("file", file);
  if (meta.titulo) fd.append("titulo", meta.titulo);
  if (meta.descripcion) fd.append("descripcion", meta.descripcion);
  if (meta.paso_id) fd.append("paso_id", String(meta.paso_id));
  if (meta.tipo) fd.append("tipo", meta.tipo);

  const base = process.env.NEXT_PUBLIC_API_URL ?? "";
  const res = await fetch(`${base}/api/ot/${otId}/evidencias`, {
    method: "POST", body: fd, credentials: "include",
  });
  const body = await res.json();
  if (!res.ok) throw Object.assign(new Error("upload_failed"), { status: res.status, body });
  return body;
}

export const eliminarEvidencia = (otId: number, evId: number) =>
  api.delete(`/api/ot/${otId}/evidencias/${evId}`);

// ===================================================================
// Auditoría
// ===================================================================
export interface AuditEntry {
  id: number;
  usuario_id: string | null;
  modulo: string;
  accion: string;
  entidad: string | null;
  entidad_id: string | null;
  valor_anterior: Record<string, unknown> | null;
  valor_nuevo: Record<string, unknown> | null;
  created_at: string;
  usuario: { id: string; nombres: string; apellidos: string; email: string } | null;
}

export const getAuditoriaOT = (otId: number) =>
  api.get<{ data: AuditEntry[] }>(`/api/auditoria/ot/${otId}`);

export const getAuditoriaExpediente = (expId: number) =>
  api.get<{ data: AuditEntry[] }>(`/api/auditoria/expediente/${expId}`);
