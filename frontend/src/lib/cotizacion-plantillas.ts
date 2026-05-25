import { api } from "./api";

export type CategoriaComponente =
  | "materia_prima" | "consumible" | "mano_obra" | "servicio_externo"
  | "ensayo" | "transporte" | "documentacion" | "garantia"
  | "indirecto" | "imprevisto" | "otro";

export const CATEGORIAS_LABEL: Record<CategoriaComponente, string> = {
  materia_prima: "Materia prima",
  consumible: "Consumible",
  mano_obra: "Mano de obra (h × tarifa)",
  servicio_externo: "Servicio externo",
  ensayo: "Ensayo / pruebas",
  transporte: "Transporte",
  documentacion: "Documentación",
  garantia: "Garantía",
  indirecto: "Indirecto / overhead",
  imprevisto: "Imprevisto",
  otro: "Otro",
};

export type TipoServicioPlantilla = "reparacion" | "fabricacion" | "mantenimiento" | "otro";

export interface PlantillaComponente {
  id?: number;
  orden: number;
  categoria: CategoriaComponente;
  item_id: number | null;
  descripcion: string;
  cantidad_default: number;
  unidad_medida: string;
  precio_unitario_default: number;
  costo_unitario_default: number | null;
  tiempo_aprovisionamiento_default: number;
  notas: string | null;
  items?: { id: number; codigo: string; nombre: string } | null;
}

export interface CotizacionPlantilla {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  tipo_servicio: TipoServicioPlantilla;
  capacidad_kva_min: number | null;
  capacidad_kva_max: number | null;
  margen_porcentaje_default: string;
  contingencia_porcentaje: string;
  iva_porcentaje_default: string;
  tiempo_entrega_base_dias: number;
  condiciones_pago_default: string | null;
  observaciones_default: string | null;
  activo: boolean;
  created_at: string;
  _count?: { plantilla_componentes: number };
  plantilla_componentes?: PlantillaComponente[];
}

export interface PlantillaCreateInput {
  codigo: string;
  nombre: string;
  descripcion?: string | null;
  tipo_servicio: TipoServicioPlantilla;
  capacidad_kva_min?: number | null;
  capacidad_kva_max?: number | null;
  margen_porcentaje_default?: number;
  contingencia_porcentaje?: number;
  iva_porcentaje_default?: number;
  tiempo_entrega_base_dias?: number;
  condiciones_pago_default?: string | null;
  observaciones_default?: string | null;
  activo?: boolean;
  componentes?: Omit<PlantillaComponente, "items">[];
}

export async function listPlantillas(params: { tipo_servicio?: TipoServicioPlantilla; activo?: boolean } = {}): Promise<{ data: CotizacionPlantilla[] }> {
  const qs = new URLSearchParams();
  if (params.tipo_servicio) qs.set("tipo_servicio", params.tipo_servicio);
  if (params.activo === false) qs.set("activo", "false");
  return api.get(`/api/cotizacion-plantillas${qs.toString() ? `?${qs}` : ""}`);
}

export async function getPlantilla(id: number): Promise<{ data: CotizacionPlantilla }> {
  return api.get(`/api/cotizacion-plantillas/${id}`);
}

export async function createPlantilla(payload: PlantillaCreateInput): Promise<{ data: CotizacionPlantilla }> {
  return api.post(`/api/cotizacion-plantillas`, payload);
}

export async function updatePlantilla(id: number, payload: Partial<PlantillaCreateInput>): Promise<{ data: CotizacionPlantilla }> {
  return api.patch(`/api/cotizacion-plantillas/${id}`, payload);
}

export async function archivePlantilla(id: number): Promise<void> {
  await api.delete(`/api/cotizacion-plantillas/${id}`);
}

// -------------------------------------------------------------------
// Generar cotizacion desde plantilla
// -------------------------------------------------------------------
export interface DesdePlantillaInput {
  plantilla_id: number;
  cliente_id: number;
  contacto_id?: number | null;
  expediente_id?: number | null;
  margen_porcentaje?: number;
  contingencia_porcentaje?: number;
  iva_porcentaje?: number;
}

export async function crearDesdePlantilla(payload: DesdePlantillaInput): Promise<{
  data: { id: number; codigo: string };
  meta: { lineas_pendientes_aprovisionamiento: number };
}> {
  return api.post(`/api/cotizaciones/desde-plantilla`, payload);
}
