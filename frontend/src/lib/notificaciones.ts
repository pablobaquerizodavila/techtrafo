import { api } from "./api";

export interface Notif {
  id: string;
  tipo: string;
  asunto: string;
  enlace?: string | null;
  leido: boolean;
  created_at: string;
}

export async function listar(): Promise<{ data: Notif[] }> {
  return api.get(`/api/notificaciones`);
}

export async function unreadCount(): Promise<{ count: number }> {
  return api.get(`/api/notificaciones/unread-count`);
}

export async function leer(id: string): Promise<{ ok: boolean }> {
  return api.post(`/api/notificaciones/${id}/leer`);
}

export async function leerTodas(): Promise<{ ok: boolean; count: number }> {
  return api.post(`/api/notificaciones/leer-todas`);
}
