import { api } from "./api";

export type TipoServicioPlantilla = "reparacion" | "fabricacion" | "mantenimiento" | "otro";
export type PlanPagoTipo = "anticipo_y_saldo" | "hitos" | "mensual" | "contado" | "otro";
export type TipoPagoPreset = "anticipo" | "hito" | "saldo";
export type CondicionDisparo = "fecha_fija" | "manual" | "al_completar_ot" | "al_pasar_gate" | "al_entregar";

export interface PlantillaPagoPreset {
  id?: number;
  numero: number;
  tipo: TipoPagoPreset;
  descripcion: string | null;
  condicion_disparo: CondicionDisparo | null;
  monto_porcentaje: number | string | null;
}

export interface ContratoPlantilla {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  tipo_servicio: TipoServicioPlantilla;
  clausulas: string | null;
  plan_pago_tipo: PlanPagoTipo;
  activo: boolean;
  created_at: string;
  _count?: { pagos: number };
  pagos?: PlantillaPagoPreset[];
}

export interface ContratoPlantillaInput {
  codigo: string;
  nombre: string;
  descripcion?: string | null;
  tipo_servicio: TipoServicioPlantilla;
  clausulas?: string | null;
  plan_pago_tipo: PlanPagoTipo;
  activo?: boolean;
  pagos: Array<{
    numero: number;
    tipo: TipoPagoPreset;
    descripcion?: string | null;
    condicion_disparo?: CondicionDisparo | null;
    monto_porcentaje?: number | null;
  }>;
}

/** Variables disponibles para usar en las cláusulas (se rellenan al emitir el contrato). */
export const VARIABLES_CONTRATO: Array<{ key: string; desc: string }> = [
  { key: "cliente_razon_social", desc: "Razón social del cliente" },
  { key: "cliente_ruc", desc: "RUC / cédula del cliente" },
  { key: "representante_legal_nombre", desc: "Nombre del representante legal" },
  { key: "representante_legal_cedula", desc: "Cédula del representante legal" },
  { key: "representante_legal_cargo", desc: "Cargo del representante legal" },
  { key: "contrato_codigo", desc: "Código del contrato" },
  { key: "cotizacion_codigo", desc: "Código de la cotización base" },
  { key: "monto_total", desc: "Monto total del contrato" },
  { key: "fecha_firma", desc: "Fecha de firma" },
  { key: "plazo_entrega", desc: "Plazo / fecha fin estimada" },
];

export async function listContratoPlantillas(params: { activo?: boolean } = {}): Promise<{ data: ContratoPlantilla[] }> {
  const qs = new URLSearchParams();
  if (params.activo === false) qs.set("activo", "false");
  return api.get(`/api/contrato-plantillas${qs.toString() ? `?${qs}` : ""}`);
}

export async function getContratoPlantilla(id: number): Promise<{ data: ContratoPlantilla }> {
  return api.get(`/api/contrato-plantillas/${id}`);
}

export async function createContratoPlantilla(payload: ContratoPlantillaInput): Promise<{ data: ContratoPlantilla }> {
  return api.post(`/api/contrato-plantillas`, payload);
}

export async function updateContratoPlantilla(id: number, payload: Partial<ContratoPlantillaInput>): Promise<{ data: ContratoPlantilla }> {
  return api.patch(`/api/contrato-plantillas/${id}`, payload);
}

export async function archiveContratoPlantilla(id: number): Promise<void> {
  await api.delete(`/api/contrato-plantillas/${id}`);
}
