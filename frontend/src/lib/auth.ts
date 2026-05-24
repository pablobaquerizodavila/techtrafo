import { api } from "./api";

export interface AuthUser {
  id: string;
  email: string;
  nombres: string;
  apellidos: string;
  rol_id: number | null;
  rol_nombre: string | null;
  es_super_admin: boolean;
  permisos: Record<string, boolean>;
}

interface AuthResponse {
  user: AuthUser;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await api.post<AuthResponse>("/api/auth/login", { email, password });
  return res.user;
}

export async function logout(): Promise<void> {
  await api.post("/api/auth/logout");
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const res = await api.get<AuthResponse>("/api/auth/me");
    return res.user;
  } catch {
    return null;
  }
}

export interface RegisterPayload {
  email: string;
  password: string;
  nombres: string;
  apellidos: string;
  telefono?: string;
}

export async function register(payload: RegisterPayload): Promise<{ status: string }> {
  return api.post("/api/auth/register", payload);
}

export interface UpdateProfilePayload {
  nombres?: string;
  apellidos?: string;
  telefono?: string | null;
}

export async function updateMyProfile(payload: UpdateProfilePayload): Promise<{ data: {
  id: string; email: string; nombres: string; apellidos: string; telefono: string | null;
} }> {
  return api.patch("/api/auth/me", payload);
}

export async function changeMyPassword(current_password: string, new_password: string): Promise<{ status: string }> {
  return api.post("/api/auth/change-password", { current_password, new_password });
}

/**
 * Verifica si el usuario tiene un permiso especifico.
 * Acepta los 3 formatos: granular (modulo.accion), por area (modulo), comodin (all).
 * Super admin siempre tiene.
 */
export function hasPermission(user: AuthUser | null, modulo: string, accion: string): boolean {
  if (!user) return false;
  if (user.es_super_admin) return true;
  const p = user.permisos ?? {};
  return p[`${modulo}.${accion}`] === true || p[modulo] === true || p.all === true;
}
