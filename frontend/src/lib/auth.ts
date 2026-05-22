import { api } from "./api";

export interface AuthUser {
  id: string;
  email: string;
  nombres: string;
  apellidos: string;
  rol_id: number | null;
  rol_nombre: string | null;
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
