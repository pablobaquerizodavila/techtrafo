import { api } from "./api";

export type TipoPersona = "natural" | "juridica";
export type Segmento = "industrial" | "distribuidora" | "constructora" | "otro";
export type Sector = "privado" | "publico";
export type EstadoCliente = "activo" | "inactivo" | "bloqueado" | "archivado";

export interface Cliente {
  id: number;
  tipo_persona: TipoPersona;
  razon_social: string;
  nombre_comercial: string | null;
  ruc_cedula: string;
  direccion_fiscal: string | null;
  ciudad: string | null;
  provincia: string | null;
  pais: string | null;
  telefono: string | null;
  email: string | null;
  sitio_web: string | null;
  segmento: Segmento | null;
  sector: Sector | null;
  credito_habilitado: boolean;
  limite_credito: string; // Prisma Decimal -> string
  plazo_credito_dias: number;
  estado: EstadoCliente;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClienteListResponse {
  data: Cliente[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface ClienteListParams {
  page?: number;
  limit?: number;
  q?: string;
  estado?: EstadoCliente;
  segmento?: Segmento;
  sector?: Sector;
}

export type ClienteInput = Partial<Omit<Cliente, "id" | "created_at" | "updated_at" | "estado" | "limite_credito">> & {
  // Para enviar al API el limite_credito como number (zod lo acepta y Prisma lo convierte a Decimal)
  limite_credito?: number;
  estado?: EstadoCliente;
};

export async function listClientes(params: ClienteListParams = {}): Promise<ClienteListResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== null) qs.set(k, String(v));
  }
  const path = `/api/clientes${qs.toString() ? `?${qs}` : ""}`;
  return api.get<ClienteListResponse>(path);
}

export async function getCliente(id: number): Promise<{ data: Cliente }> {
  return api.get(`/api/clientes/${id}`);
}

export async function createCliente(payload: ClienteInput): Promise<{ data: Cliente }> {
  return api.post(`/api/clientes`, payload);
}

export async function updateCliente(id: number, payload: ClienteInput): Promise<{ data: Cliente }> {
  return api.patch(`/api/clientes/${id}`, payload);
}

export async function archiveCliente(id: number): Promise<void> {
  await api.delete(`/api/clientes/${id}`);
}
