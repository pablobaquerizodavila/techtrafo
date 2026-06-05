import { api } from "./api";

export type TipoServicio = "reparacion" | "fabricacion" | "mantenimiento" | "otro";

export const TIPO_LABEL: Record<string, string> = {
  reparacion: "Reparación", fabricacion: "Fabricación", mantenimiento: "Mantenimiento", otro: "Otro",
};

export interface ResumenFinanzas {
  periodo: { desde: string; hasta: string };
  totales: { contratado: number; cobrado: number; por_cobrar: number; cartera_vencida: number; anticipos_cobrados: number };
  por_tipo: Array<{ tipo_servicio: string; contratado: number; cobrado: number; por_cobrar: number }>;
  cartera_aging: Array<{ rango: string; cantidad: number; monto: number }>;
  tendencia_cobros: Array<{ mes: string; monto: number }>;
  por_estado_pago: Array<{ estado: string; cantidad: number; monto: number }>;
  pagos_vs_cotizaciones: { cotizado_aprobado: number; contratado: number; cobrado: number };
}

export interface CarteraRow {
  contrato_id: number; contrato_codigo: string | null; cliente: string | null; tipo_servicio: string;
  pago_numero: number; descripcion: string | null; fecha_esperada: string | null; dias_vencido: number; monto_pendiente: number;
}

export interface CobroRow {
  contrato_id: number; fecha_pagado: string | null; contrato_codigo: string | null; cliente: string | null;
  tipo_pago: string; monto_pagado: number; referencia: string | null; tipo_servicio: string;
}

function qsOf(params: { desde?: string; hasta?: string }): string {
  const qs = new URLSearchParams();
  if (params.desde) qs.set("desde", params.desde);
  if (params.hasta) qs.set("hasta", params.hasta);
  return qs.toString() ? `?${qs}` : "";
}

export const getResumenFinanzas = (params: { desde?: string; hasta?: string } = {}) =>
  api.get<{ data: ResumenFinanzas }>(`/api/finanzas/resumen${qsOf(params)}`);

export const getCarteraVencida = () =>
  api.get<{ data: CarteraRow[] }>(`/api/finanzas/cartera-vencida`);

export const getCobros = (params: { desde?: string; hasta?: string } = {}) =>
  api.get<{ data: CobroRow[] }>(`/api/finanzas/cobros${qsOf(params)}`);

/** Formato moneda es-EC (con separador de miles). */
export function fmtMoneda(valor: number | string | null | undefined, moneda = "USD"): string {
  if (valor === null || valor === undefined) return "—";
  const n = typeof valor === "string" ? parseFloat(valor) : valor;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: moneda }).format(n);
}

/** Períodos predefinidos → {desde, hasta} en YYYY-MM-DD. */
export function rangoPeriodo(p: "mes" | "anio" | "todo"): { desde: string; hasta: string } {
  const hoy = new Date();
  const hasta = hoy.toISOString().slice(0, 10);
  if (p === "mes") return { desde: `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01`, hasta };
  if (p === "todo") return { desde: "2000-01-01", hasta };
  return { desde: `${hoy.getFullYear()}-01-01`, hasta };
}
