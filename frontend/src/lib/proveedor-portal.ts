import { api } from "@/lib/api";

export interface OcResumen {
  id: number;
  codigo: string;
  estado: string;
  fecha_emision: string | null;
  fecha_entrega_acordada: string | null;
  total: string; // Prisma Decimal comes as string
  moneda: string;
  acuse_recibo_at: string | null;
  factura_proveedor_numero: string | null;
  factura_proveedor_url: string | null;
  _count: { orden_compra_lineas: number };
}

export interface OcLinea {
  id: number;
  cantidad: string;
  precio_unitario: string;
  items?: { codigo_interno: string; descripcion: string; unidad_medida: string } | null;
}

export interface OcDetalle extends OcResumen {
  orden_compra_lineas: OcLinea[];
}

export interface AccesoProveedor {
  id: string;
  email: string;
  nombre_usuario: string;
  nombres: string;
  apellidos: string;
  activo: boolean;
  estado_aprobacion: "pendiente" | "aprobado" | "rechazado";
  ultimo_login: string | null;
  created_at: string;
}

export interface AccesoProveedorCreateInput {
  email: string;
  nombres: string;
  apellidos: string;
  password: string;
}

export async function getMisOcs(): Promise<{ data: OcResumen[] }> {
  return api.get<{ data: OcResumen[] }>("/api/proveedor-portal/mis-ocs");
}

export async function getOcDetalle(id: number): Promise<{ data: OcDetalle }> {
  return api.get<{ data: OcDetalle }>(`/api/proveedor-portal/oc/${id}`);
}

export async function acusarRecibo(id: number): Promise<{ data: OcDetalle }> {
  return api.post<{ data: OcDetalle }>(`/api/proveedor-portal/oc/${id}/acusar-recibo`, {});
}

export async function subirFactura(id: number, numero: string, url: string): Promise<{ data: OcDetalle }> {
  return api.post<{ data: OcDetalle }>(`/api/proveedor-portal/oc/${id}/factura`, { numero, url });
}

// Admin helpers
export async function listAccesosProveedor(proveedorId: number): Promise<{ data: AccesoProveedor[] }> {
  return api.get(`/api/proveedores/${proveedorId}/accesos`);
}

export async function crearAccesoProveedor(
  proveedorId: number,
  payload: AccesoProveedorCreateInput,
): Promise<{ data: AccesoProveedor }> {
  return api.post(`/api/proveedores/${proveedorId}/accesos`, payload);
}

export async function toggleAccesoProveedor(
  proveedorId: number,
  userId: string,
  activo: boolean,
): Promise<void> {
  await api.patch(`/api/proveedores/${proveedorId}/accesos/${userId}`, { activo });
}

export async function deleteAccesoProveedor(proveedorId: number, userId: string): Promise<void> {
  await api.delete(`/api/proveedores/${proveedorId}/accesos/${userId}`);
}
