import { api } from "./api";

export type EstadoAprobacion = "pendiente" | "aprobado" | "rechazado";

export interface UsuarioAdmin {
  id: string;
  email: string;
  nombre_usuario: string;
  nombres: string;
  apellidos: string;
  telefono: string | null;
  telefono_solicitud: string | null;
  rol_id: number | null;
  activo: boolean;
  estado_aprobacion: EstadoAprobacion;
  fecha_aprobacion: string | null;
  motivo_rechazo: string | null;
  ultimo_login: string | null;
  created_at: string;
  roles?: { id: number; nombre: string; es_super_admin: boolean } | null;
}

export interface UsuarioPendiente {
  id: string;
  email: string;
  nombre_usuario: string;
  nombres: string;
  apellidos: string;
  telefono_solicitud: string | null;
  created_at: string;
}

export interface RolAdmin {
  id: number;
  nombre: string;
  descripcion: string | null;
  permisos: Record<string, boolean>;
  es_super_admin: boolean;
  activo: boolean;
}

export interface PermisoCatalogoEntry {
  modulo: string;
  acciones: string[];
}

// ---------- Usuarios ----------
export async function listUsuariosAdmin(params: {
  page?: number; limit?: number; q?: string;
  estado?: EstadoAprobacion; rol_id?: number;
} = {}): Promise<{ data: UsuarioAdmin[]; pagination: { page: number; limit: number; total: number; total_pages: number } }> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== null) qs.set(k, String(v));
  }
  return api.get(`/api/admin/usuarios${qs.toString() ? `?${qs}` : ""}`);
}

export async function listPendientes(): Promise<{ data: UsuarioPendiente[] }> {
  return api.get("/api/admin/usuarios/pendientes");
}

export async function aprobarUsuario(id: string, rol_id: number): Promise<{ data: UsuarioAdmin }> {
  return api.post(`/api/admin/usuarios/${id}/aprobar`, { rol_id });
}

export async function rechazarUsuario(id: string, motivo: string): Promise<{ status: string }> {
  return api.post(`/api/admin/usuarios/${id}/rechazar`, { motivo });
}

export async function updateUsuarioAdmin(id: string, payload: {
  email?: string;
  nombres?: string; apellidos?: string; telefono?: string | null;
  rol_id?: number | null; activo?: boolean;
}): Promise<{ data: UsuarioAdmin }> {
  return api.patch(`/api/admin/usuarios/${id}`, payload);
}

export async function resetPasswordUsuarioAdmin(id: string, new_password: string): Promise<{ status: string }> {
  return api.post(`/api/admin/usuarios/${id}/password`, { new_password });
}

/**
 * Hard delete de usuario. Solo super_admin. Falla con 409 si el usuario
 * tiene cualquier registro asociado (creó cotizaciones, OTs, expedientes,
 * etc.); en ese caso se recomienda usar updateUsuarioAdmin({ activo: false }).
 */
export async function deleteUsuarioPermanente(id: string): Promise<void> {
  await api.delete(`/api/admin/usuarios/${id}`);
}

// ---------- Hito plantillas (catalogo maestro) ----------
export interface HitoPlantilla {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  orden: number;
  tipo_servicio: string;
  visible_cliente: boolean;
  requiere_aprobacion: boolean;
  rol_aprobador_id: number | null;
  sla_horas: number | null;
  es_automatico: boolean;
  fuente_tabla: string | null;
  activo: boolean;
  roles?: { id: number; nombre: string } | null;
}

export async function listHitoPlantillas(): Promise<{ data: HitoPlantilla[] }> {
  return api.get("/api/admin/hito-plantillas");
}

export async function updateHitoPlantilla(id: number, payload: {
  nombre?: string;
  descripcion?: string | null;
  sla_horas?: number | null;
  requiere_aprobacion?: boolean;
  rol_aprobador_id?: number | null;
  visible_cliente?: boolean;
  activo?: boolean;
}): Promise<{ data: HitoPlantilla }> {
  return api.patch(`/api/admin/hito-plantillas/${id}`, payload);
}

// ---------- Roles ----------
export async function listRolesAdmin(): Promise<{ data: RolAdmin[] }> {
  return api.get("/api/admin/roles");
}

export async function updateRolPermisos(id: number, permisos: Record<string, boolean>): Promise<{ data: RolAdmin }> {
  return api.patch(`/api/admin/roles/${id}`, { permisos });
}

export async function createRol(payload: {
  nombre: string;
  descripcion?: string | null;
  permisos?: Record<string, boolean>;
}): Promise<{ data: RolAdmin }> {
  return api.post(`/api/admin/roles`, payload);
}

export async function deleteRol(id: number): Promise<void> {
  await api.delete(`/api/admin/roles/${id}`);
}

export async function getCatalogoPermisos(): Promise<{ data: PermisoCatalogoEntry[] }> {
  return api.get("/api/admin/permisos/catalogo");
}

export function estadoAprobVariant(estado: EstadoAprobacion): "success" | "warning" | "destructive" {
  switch (estado) {
    case "aprobado": return "success";
    case "pendiente": return "warning";
    case "rechazado": return "destructive";
  }
}
