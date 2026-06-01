import { api } from "./api";

export type PlanPagoTipo = "anticipo_y_saldo" | "hitos" | "mensual" | "contado" | "otro";
export type EstadoContrato = "vigente" | "suspendido" | "completado" | "cancelado";
export type TipoPago = "anticipo" | "hito" | "saldo";
export type CondicionDisparo = "fecha_fija" | "manual" | "al_completar_ot" | "al_pasar_gate" | "al_entregar";
export type EstadoPago = "pendiente" | "parcial" | "pagado" | "vencido" | "cancelado";
export type TransicionContrato = "suspender" | "reanudar" | "completar" | "cancelar";

export interface ContratoPago {
  id: number;
  contrato_id: number;
  numero: number;
  tipo: TipoPago;
  descripcion: string | null;
  condicion_disparo: CondicionDisparo | null;
  fecha_esperada: string | null;
  monto_porcentaje: string | null;
  monto_estipulado: string;
  monto_pagado: string;
  fecha_pagado: string | null;
  referencia_pago: string | null;
  estado: EstadoPago;
  observaciones: string | null;
}

export interface Contrato {
  id: number;
  codigo: string;
  cotizacion_id: number;
  cliente_id: number;
  fecha_firma: string;
  fecha_inicio: string | null;
  fecha_fin_estimada: string | null;
  fecha_fin_real: string | null;
  moneda: string;
  monto_total: string;
  plan_pago_tipo: PlanPagoTipo;
  estado: EstadoContrato;
  observaciones: string | null;
  notas_internas: string | null;
  created_at: string;
  updated_at: string;
  clientes?: { id: number; razon_social: string; ruc_cedula: string };
  cotizaciones?: { id: number; codigo: string; tipo_servicio?: string; total?: string };
  contrato_pagos?: ContratoPago[];
  resumen_pagos?: {
    total_estipulado: number;
    total_pagado: number;
    saldo_pendiente: number;
  };
}

export interface PagoInput {
  numero: number;
  tipo: TipoPago;
  descripcion?: string | null;
  condicion_disparo?: CondicionDisparo | null;
  fecha_esperada?: string | null;
  monto_porcentaje?: number | null;
  monto_estipulado: number;
}

export interface ContratoCreateInput {
  cotizacion_id: number;
  fecha_firma?: string;
  fecha_inicio?: string | null;
  fecha_fin_estimada?: string | null;
  moneda?: string;
  monto_total: number;
  plan_pago_tipo?: PlanPagoTipo;
  observaciones?: string | null;
  notas_internas?: string | null;
  clausulas?: string | null;
  plantilla_id?: number | null;
  pagos?: PagoInput[];
}

export interface ContratoUpdateInput {
  fecha_inicio?: string | null;
  fecha_fin_estimada?: string | null;
  fecha_fin_real?: string | null;
  monto_total?: number;
  plan_pago_tipo?: PlanPagoTipo;
  observaciones?: string | null;
  notas_internas?: string | null;
}

export interface PagoUpdateInput {
  descripcion?: string | null;
  condicion_disparo?: CondicionDisparo | null;
  fecha_esperada?: string | null;
  monto_porcentaje?: number | null;
  monto_estipulado?: number;
  monto_pagado?: number;
  fecha_pagado?: string | null;
  referencia_pago?: string | null;
  estado?: EstadoPago;
  observaciones?: string | null;
}

export interface ListParams {
  page?: number;
  limit?: number;
  q?: string;
  estado?: EstadoContrato;
  cliente_id?: number;
}

export interface ListResponse {
  data: Contrato[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}

export async function listContratos(params: ListParams = {}): Promise<ListResponse> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== null) qs.set(k, String(v));
  }
  return api.get(`/api/contratos${qs.toString() ? `?${qs}` : ""}`);
}

export async function getContrato(id: number): Promise<{ data: Contrato }> {
  return api.get(`/api/contratos/${id}`);
}

export async function createContrato(payload: ContratoCreateInput): Promise<{ data: Contrato }> {
  return api.post(`/api/contratos`, payload);
}

export async function updateContrato(id: number, payload: ContratoUpdateInput): Promise<{ data: Contrato }> {
  return api.patch(`/api/contratos/${id}`, payload);
}

export async function transicionContrato(id: number, accion: TransicionContrato, motivo?: string): Promise<{ data: Contrato }> {
  return api.post(`/api/contratos/${id}/transicion`, { accion, motivo });
}

export async function deleteContrato(id: number): Promise<void> {
  await api.delete(`/api/contratos/${id}`);
}

export async function addPago(contratoId: number, payload: PagoInput): Promise<{ data: ContratoPago }> {
  return api.post(`/api/contratos/${contratoId}/pagos`, payload);
}

export async function updatePago(contratoId: number, pagoId: number, payload: PagoUpdateInput): Promise<{ data: ContratoPago }> {
  return api.patch(`/api/contratos/${contratoId}/pagos/${pagoId}`, payload);
}

export async function deletePago(contratoId: number, pagoId: number): Promise<void> {
  await api.delete(`/api/contratos/${contratoId}/pagos/${pagoId}`);
}

export function estadoContratoVariant(estado: EstadoContrato): "success" | "warning" | "destructive" | "muted" {
  switch (estado) {
    case "vigente": return "success";
    case "suspendido": return "warning";
    case "completado": return "muted";
    case "cancelado": return "destructive";
  }
}

export function estadoPagoVariant(estado: EstadoPago): "success" | "warning" | "destructive" | "muted" | "default" {
  switch (estado) {
    case "pagado": return "success";
    case "parcial": return "default";
    case "vencido": return "destructive";
    case "cancelado": return "muted";
    case "pendiente": return "muted";
  }
}

export function tipoPagoLabel(t: TipoPago): string {
  return { anticipo: "Anticipo", hito: "Hito", saldo: "Saldo" }[t];
}

export function condicionDisparoLabel(c: CondicionDisparo | null): string {
  if (!c) return "—";
  return {
    fecha_fija: "Fecha fija",
    manual: "Manual",
    al_completar_ot: "Al completar OT",
    al_pasar_gate: "Al pasar gate QC",
    al_entregar: "Al entregar",
  }[c];
}

export function transicionesPosiblesContrato(estado: EstadoContrato): TransicionContrato[] {
  const map: Record<EstadoContrato, TransicionContrato[]> = {
    vigente: ["suspender", "completar", "cancelar"],
    suspendido: ["reanudar", "cancelar"],
    completado: [],
    cancelado: [],
  };
  return map[estado];
}
