import { api } from "./api";

export interface NoConformidad {
  id: number;
  codigo: string;
  recepcion_id: number;
  orden_compra_id: number | null;
  proveedor_id: number | null;
  tipo: "cantidad" | "calidad" | "documentacion" | "otro";
  descripcion: string;
  accion_tomada: string | null;
  estado: "abierta" | "en_proceso" | "cerrada";
  responsable_id: string | null;
  fecha_cierre: string | null;
  costo_impacto: number | null;
  created_at: string;
  updated_at: string;
  proveedores?: { id: number; razon_social: string } | null;
  recepciones?: { id: number; fecha_recepcion: string } | null;
  _count?: { nc_lineas: number };
}

export interface NcLinea {
  id: number;
  no_conformidad_id: number;
  recepcion_linea_id: number;
  cantidad_no_conforme: number;
  motivo: string | null;
  created_at: string;
}

export function estadoBadge(estado: string): { label: string; className: string } {
  const map: Record<string, { label: string; className: string }> = {
    abierta:    { label: "Abierta",    className: "bg-red-100 text-red-700" },
    en_proceso: { label: "En proceso", className: "bg-yellow-100 text-yellow-700" },
    cerrada:    { label: "Cerrada",    className: "bg-green-100 text-green-700" },
  };
  return map[estado] ?? { label: estado, className: "bg-gray-100 text-gray-700" };
}

export async function getNoConformidades(params?: {
  estado?: string;
  proveedor_id?: number;
  recepcion_id?: number;
  desde?: string;
  hasta?: string;
  page?: number;
}): Promise<{ data: NoConformidad[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.estado) qs.set("estado", params.estado);
  if (params?.proveedor_id) qs.set("proveedor_id", String(params.proveedor_id));
  if (params?.recepcion_id) qs.set("recepcion_id", String(params.recepcion_id));
  if (params?.desde) qs.set("desde", params.desde);
  if (params?.hasta) qs.set("hasta", params.hasta);
  if (params?.page) qs.set("page", String(params.page));
  return api.get<{ data: NoConformidad[]; total: number }>(`/api/no-conformidades?${qs}`);
}

export async function getNoConformidad(id: number): Promise<{ data: NoConformidad }> {
  return api.get<{ data: NoConformidad }>(`/api/no-conformidades/${id}`);
}

export async function patchNoConformidad(
  id: number,
  data: {
    accion_tomada?: string;
    responsable_id?: string | null;
    costo_impacto?: number | null;
    estado?: "abierta" | "en_proceso";
  }
): Promise<{ data: NoConformidad }> {
  return api.patch<{ data: NoConformidad }>(`/api/no-conformidades/${id}`, data);
}

export async function cerrarNoConformidad(id: number): Promise<{ data: NoConformidad }> {
  return api.post<{ data: NoConformidad }>(`/api/no-conformidades/${id}/cerrar`, {});
}
