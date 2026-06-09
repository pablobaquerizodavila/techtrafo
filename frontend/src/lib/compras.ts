import { api } from "./api";

// -------------------------------------------------------------------
// Proveedores
// -------------------------------------------------------------------
export type EstadoProveedor = "activo" | "inactivo" | "bloqueado";

export interface Proveedor {
  id: number;
  codigo: string;
  razon_social: string;
  nombre_comercial: string | null;
  ruc: string | null;
  pais: string;
  ciudad: string | null;
  direccion?: string | null;
  contacto_nombre: string | null;
  contacto_cargo?: string | null;
  contacto_email: string | null;
  contacto_telefono: string | null;
  sitio_web?: string | null;
  condiciones_pago_default: string | null;
  moneda_default: string;
  tiempo_entrega_default_dias: number | null;
  incoterm_default?: string | null;
  certificaciones?: string | null;
  productos_que_suministra?: string | null;
  calificacion: string | null;
  total_ordenes: number;
  total_entregas_atiempo: number;
  total_no_conformidades: number;
  observaciones?: string | null;
  estado: EstadoProveedor;
  created_at: string;
}

export interface ProveedorCreateInput {
  razon_social: string;
  nombre_comercial?: string | null;
  ruc?: string | null;
  pais?: string;
  ciudad?: string | null;
  direccion?: string | null;
  contacto_nombre?: string | null;
  contacto_cargo?: string | null;
  contacto_email?: string | null;
  contacto_telefono?: string | null;
  sitio_web?: string | null;
  condiciones_pago_default?: string | null;
  moneda_default?: string;
  tiempo_entrega_default_dias?: number | null;
  incoterm_default?: string | null;
  certificaciones?: string | null;
  productos_que_suministra?: string | null;
  observaciones?: string | null;
  estado?: EstadoProveedor;
}

export interface ItemProveedor {
  id: number;
  item_id: number;
  proveedor_id: number;
  precio_unitario: string;
  moneda: string;
  unidad_medida: string;
  cantidad_minima_orden: string;
  tiempo_entrega_dias: number | null;
  condiciones_pago: string | null;
  incoterm: string | null;
  codigo_proveedor_item: string | null;
  es_principal: boolean;
  vigencia_desde: string;
  vigencia_hasta: string | null;
  notas: string | null;
  items?: { id: number; codigo_interno: string; nombre: string; unidad_medida: string };
  proveedores?: { id: number; codigo: string; razon_social: string; calificacion: string | null; tiempo_entrega_default_dias: number | null; estado: string };
}

export interface ItemProveedorCreateInput {
  item_id: number;
  precio_unitario: number;
  moneda?: string;
  unidad_medida?: string;
  cantidad_minima_orden?: number;
  tiempo_entrega_dias?: number | null;
  condiciones_pago?: string | null;
  incoterm?: string | null;
  codigo_proveedor_item?: string | null;
  es_principal?: boolean;
  vigencia_desde?: string;
  vigencia_hasta?: string | null;
  notas?: string | null;
}

export async function listProveedores(params: { estado?: EstadoProveedor; q?: string } = {}): Promise<{ data: Proveedor[] }> {
  const qs = new URLSearchParams();
  if (params.estado) qs.set("estado", params.estado);
  if (params.q) qs.set("q", params.q);
  return api.get(`/api/proveedores${qs.toString() ? `?${qs}` : ""}`);
}

export async function getProveedor(id: number): Promise<{ data: Proveedor & { item_proveedores: ItemProveedor[]; _count: { ordenes_compra: number } } }> {
  return api.get(`/api/proveedores/${id}`);
}

export async function createProveedor(payload: ProveedorCreateInput): Promise<{ data: Proveedor }> {
  return api.post(`/api/proveedores`, payload);
}

export async function updateProveedor(id: number, payload: Partial<ProveedorCreateInput>): Promise<{ data: Proveedor }> {
  return api.patch(`/api/proveedores/${id}`, payload);
}

export async function archiveProveedor(id: number): Promise<void> {
  await api.delete(`/api/proveedores/${id}`);
}

export async function listItemsDelProveedor(proveedorId: number): Promise<{ data: ItemProveedor[] }> {
  return api.get(`/api/proveedores/${proveedorId}/items`);
}

export async function addItemAProveedor(proveedorId: number, payload: ItemProveedorCreateInput): Promise<{ data: ItemProveedor }> {
  return api.post(`/api/proveedores/${proveedorId}/items`, payload);
}

export async function updateItemProveedor(proveedorId: number, relId: number, payload: Partial<Omit<ItemProveedorCreateInput, "item_id">>): Promise<{ data: ItemProveedor }> {
  return api.patch(`/api/proveedores/${proveedorId}/items/${relId}`, payload);
}

export async function removeItemProveedor(proveedorId: number, relId: number): Promise<void> {
  await api.delete(`/api/proveedores/${proveedorId}/items/${relId}`);
}

export async function buscarProveedoresPorItem(itemId: number): Promise<{ data: ItemProveedor[] }> {
  return api.get(`/api/proveedores/buscar-por-item/${itemId}`);
}

// -------------------------------------------------------------------
// Solicitudes internas de compra
// -------------------------------------------------------------------
export type EstadoSC = "borrador" | "enviada" | "aprobada" | "rechazada" | "convertida_en_oc" | "cancelada";
export type Prioridad = "baja" | "media" | "alta" | "urgente" | "critica";
export type OrigenSC = "manual" | "cotizacion" | "stock_minimo" | "expediente";

export interface SolicitudCompraLinea {
  id?: number;
  orden: number;
  item_id: number | null;
  descripcion: string;
  unidad_medida: string;
  cantidad_solicitada: number | string;
  precio_referencial: number | string;
  moneda: string;
  cotizacion_linea_id?: number | null;
  proveedor_sugerido_id?: number | null;
  notas?: string | null;
  items?: { id: number; codigo_interno: string; nombre: string } | null;
  proveedores?: { id: number; codigo: string; razon_social: string } | null;
}

export interface SolicitudCompra {
  id: number;
  codigo: string;
  departamento_solicitante: string;
  solicitante_id: string | null;
  cotizacion_id: number | null;
  expediente_id: number | null;
  fecha_solicitud: string;
  fecha_requerida: string | null;
  prioridad: Prioridad;
  justificacion?: string | null;
  observaciones?: string | null;
  estado: EstadoSC;
  origen: OrigenSC;
  aprobador_id?: string | null;
  fecha_aprobacion?: string | null;
  motivo_rechazo?: string | null;
  orden_compra_id: number | null;
  total_estimado: string;
  moneda: string;
  created_at: string;
  solicitud_lineas?: SolicitudCompraLinea[];
  cotizaciones?: { id: number; codigo: string; total: string } | null;
  expedientes?: { id: number; codigo: string } | null;
  usuarios_solicitudes_solicitante_idTousuarios?: { id: string; nombre_completo: string; email: string } | null;
  usuarios_solicitudes_aprobador_idTousuarios?: { id: string; nombre_completo: string; email: string } | null;
  _count?: { solicitud_lineas: number };
}

export async function listSolicitudesCompra(params: { estado?: EstadoSC; departamento?: string; cotizacion_id?: number } = {}): Promise<{ data: SolicitudCompra[] }> {
  const qs = new URLSearchParams();
  if (params.estado) qs.set("estado", params.estado);
  if (params.departamento) qs.set("departamento", params.departamento);
  if (params.cotizacion_id) qs.set("cotizacion_id", String(params.cotizacion_id));
  return api.get(`/api/solicitudes-compra${qs.toString() ? `?${qs}` : ""}`);
}

export async function getSolicitudCompra(id: number): Promise<{ data: SolicitudCompra }> {
  return api.get(`/api/solicitudes-compra/${id}`);
}

export async function enviarSolicitud(id: number) { return api.post(`/api/solicitudes-compra/${id}/enviar`, {}); }
export async function aprobarSolicitud(id: number) { return api.post(`/api/solicitudes-compra/${id}/aprobar`, {}); }
export async function rechazarSolicitud(id: number, motivo: string) { return api.post(`/api/solicitudes-compra/${id}/rechazar`, { motivo }); }
export async function cancelarSolicitud(id: number) { return api.post(`/api/solicitudes-compra/${id}/cancelar`, {}); }
export async function convertirSolicitudEnOC(id: number, proveedorId: number) {
  return api.post(`/api/solicitudes-compra/${id}/convertir-en-oc`, { proveedor_id: proveedorId });
}

// -------------------------------------------------------------------
// Ordenes de compra
// -------------------------------------------------------------------
export type EstadoOC = "borrador" | "en_revision" | "aprobada" | "rechazada" | "enviada" | "confirmada" | "recibida_parcial" | "recibida_total" | "cerrada" | "cancelada";

export interface OCLinea {
  id?: number;
  orden: number;
  item_id: number | null;
  descripcion: string;
  codigo_proveedor_item: string | null;
  unidad_medida: string;
  cantidad_solicitada: number | string;
  precio_unitario: number | string;
  descuento_porcentaje: number | string;
  subtotal?: string;
  cantidad_recibida?: string;
  cantidad_rechazada?: string;
  estado_linea?: string;
  ubicacion_destino_id?: number | null;
  proyecto_referencia?: string | null;
  notas?: string | null;
  items?: { id: number; codigo_interno: string; nombre: string } | null;
}

export interface OrdenCompra {
  id: number;
  codigo: string;
  proveedor_id: number;
  solicitud_id: number | null;
  expediente_id: number | null;
  fecha_emision: string;
  fecha_entrega_acordada: string | null;
  fecha_confirmacion_proveedor?: string | null;
  fecha_entrega_real: string | null;
  condiciones_pago?: string | null;
  moneda: string;
  tipo_cambio?: string | null;
  incoterm?: string | null;
  lugar_entrega?: string | null;
  subtotal: string;
  descuento_porcentaje: string;
  descuento_valor: string;
  iva_porcentaje: string;
  iva_valor: string;
  retencion_valor: string;
  total: string;
  estado: EstadoOC;
  rol_aprobador_requerido_id: number | null;
  aprobador_id: string | null;
  fecha_aprobacion: string | null;
  motivo_rechazo: string | null;
  observaciones_internas?: string | null;
  observaciones_proveedor?: string | null;
  created_at: string;
  proveedores?: { id: number; codigo: string; razon_social: string };
  roles?: { id: number; nombre: string; descripcion?: string };
  orden_compra_lineas?: OCLinea[];
  recepciones?: Array<{ id: number; codigo: string; fecha_recepcion: string; estado: string; estado_general: string }>;
  solicitudes_ordenes_compra_solicitud_idTosolicitudes?: { id: number; codigo: string; departamento_solicitante: string; prioridad: string } | null;
  expedientes?: { id: number; codigo: string } | null;
  _count?: { orden_compra_lineas: number; recepciones: number };
  usuarios_ordenes_compra_creado_porTousuarios?: { id: string; nombre_completo: string };
  usuarios_ordenes_compra_aprobador_idTousuarios?: { id: string; nombre_completo: string };
  factura_proveedor_numero?: string | null;
  factura_proveedor_url?: string | null;
  factura_proveedor_nombre_original?: string | null;
}

export interface ConfigUmbral {
  id: number;
  monto_minimo: string;
  monto_maximo: string | null;
  moneda: string;
  activo: boolean;
  notas: string | null;
  roles: { id: number; nombre: string; descripcion?: string };
}

export async function listOrdenesCompra(params: { estado?: EstadoOC; proveedor_id?: number; expediente_id?: number } = {}): Promise<{ data: OrdenCompra[] }> {
  const qs = new URLSearchParams();
  if (params.estado) qs.set("estado", params.estado);
  if (params.proveedor_id) qs.set("proveedor_id", String(params.proveedor_id));
  if (params.expediente_id) qs.set("expediente_id", String(params.expediente_id));
  return api.get(`/api/ordenes-compra${qs.toString() ? `?${qs}` : ""}`);
}

export async function getOrdenCompra(id: number): Promise<{ data: OrdenCompra }> {
  return api.get(`/api/ordenes-compra/${id}`);
}

export async function solicitarAprobacionOC(id: number) { return api.post(`/api/ordenes-compra/${id}/solicitar-aprobacion`, {}); }
export async function aprobarOC(id: number) { return api.post(`/api/ordenes-compra/${id}/aprobar`, {}); }
export async function rechazarOC(id: number, motivo: string) { return api.post(`/api/ordenes-compra/${id}/rechazar`, { motivo }); }
export async function enviarOC(id: number) { return api.post(`/api/ordenes-compra/${id}/enviar`, {}); }
export async function confirmarOC(id: number, body: { fecha_confirmacion_proveedor?: string; fecha_entrega_acordada?: string } = {}) {
  return api.post(`/api/ordenes-compra/${id}/confirmar`, body);
}
export async function cancelarOC(id: number) { return api.post(`/api/ordenes-compra/${id}/cancelar`, {}); }
export async function listUmbralesAprobacion(): Promise<{ data: ConfigUmbral[] }> {
  return api.get(`/api/ordenes-compra/config/umbrales`);
}

// -------------------------------------------------------------------
// Recepciones
// -------------------------------------------------------------------
export interface RecepcionLineaInput {
  orden_compra_linea_id: number;
  cantidad_recibida: number;
  cantidad_rechazada?: number;
  precio_real?: number | null;
  resultado_inspeccion?: "aprobado" | "rechazado" | "observado" | "pendiente_inspeccion";
  motivo_rechazo?: string | null;
  ubicacion_id?: number | null;
  lote_id?: number | null;
  observaciones?: string | null;
}

export interface RecepcionCreateInput {
  orden_compra_id: number;
  fecha_recepcion?: string;
  guia_remision_numero?: string | null;
  factura_numero?: string | null;
  factura_fecha?: string | null;
  factura_url?: string | null;
  estado_general?: "bueno" | "observado" | "danado" | "incompleto";
  responsable_calidad_id?: string | null;
  observaciones?: string | null;
  evidencia_url?: string | null;
  lineas: RecepcionLineaInput[];
}

export interface Recepcion {
  id: number;
  codigo: string;
  orden_compra_id: number;
  fecha_recepcion: string;
  guia_remision_numero: string | null;
  factura_numero: string | null;
  factura_fecha: string | null;
  estado: "borrador" | "confirmada" | "rechazada" | "anulada";
  estado_general: "bueno" | "observado" | "danado" | "incompleto";
  responsable_recepcion_id: string | null;
  responsable_calidad_id: string | null;
  observaciones: string | null;
  evidencia_url: string | null;
  created_at: string;
  ordenes_compra?: { id: number; codigo: string; proveedor_id: number; total: string };
  recepcion_lineas?: Array<{
    id: number;
    orden_compra_linea_id: number;
    cantidad_recibida: string;
    cantidad_rechazada: string;
    precio_real: string | null;
    resultado_inspeccion: string;
    motivo_rechazo: string | null;
    movimiento_stock_id: number | null;
    observaciones: string | null;
    orden_compra_lineas?: OCLinea;
    ubicaciones?: { id: number; codigo: string; nombre: string };
    lotes?: { id: number; codigo: string };
  }>;
  _count?: { recepcion_lineas: number };
}

export async function listRecepciones(params: { orden_compra_id?: number; estado?: string } = {}): Promise<{ data: Recepcion[] }> {
  const qs = new URLSearchParams();
  if (params.orden_compra_id) qs.set("orden_compra_id", String(params.orden_compra_id));
  if (params.estado) qs.set("estado", params.estado);
  return api.get(`/api/recepciones${qs.toString() ? `?${qs}` : ""}`);
}

export async function getRecepcion(id: number): Promise<{ data: Recepcion }> {
  return api.get(`/api/recepciones/${id}`);
}

export async function createRecepcion(payload: RecepcionCreateInput): Promise<{ data: Recepcion }> {
  return api.post(`/api/recepciones`, payload);
}

export async function confirmarRecepcion(id: number) {
  return api.post(`/api/recepciones/${id}/confirmar`, {});
}

export async function anularRecepcion(id: number) {
  return api.post(`/api/recepciones/${id}/anular`, {});
}

// -------------------------------------------------------------------
// Dashboard / alertas
// -------------------------------------------------------------------
export interface ComprasKPIs {
  solicitudes_total: number;
  solicitudes_pendientes_aprobacion: number;
  ocs_abiertas: number;
  ocs_retrasadas: number;
  recepciones_pendientes: number;
  proveedores_activos: number;
  alertas_stock: number;
  total_comprado_mes: number;
}

export interface AlertaStock {
  item_id: number;
  codigo_interno: string;
  nombre: string;
  unidad_medida: string;
  stock_minimo: number;
  stock_maximo: number;
  punto_reorden: number;
  costo_referencia: number;
  stock_total: number;
  nivel_alerta: "sin_stock" | "bajo_minimo" | "bajo_reorden";
  cantidad_sugerida_reposicion: number;
  proveedor_principal_id: number | null;
}

export interface PrecioHistorial {
  id: number;
  item_id: number;
  proveedor_id: number;
  orden_compra_id: number | null;
  recepcion_id: number | null;
  precio_anterior: string | null;
  precio_nuevo: string;
  variacion_porcentaje: string | null;
  moneda: string;
  origen: string;
  fecha: string;
  notas: string | null;
  proveedores?: { id: number; codigo: string; razon_social: string };
  ordenes_compra?: { id: number; codigo: string } | null;
  recepciones?: { id: number; codigo: string } | null;
}

export async function getComprasKPIs(): Promise<{ data: ComprasKPIs }> {
  return api.get(`/api/compras-dashboard/kpis`);
}

export async function getAlertasStock(): Promise<{ data: AlertaStock[] }> {
  return api.get(`/api/compras-dashboard/alertas-stock`);
}

export async function generarSCDesdeAlertas(itemIds: number[], departamentoSolicitante = "bodega") {
  return api.post(`/api/compras-dashboard/alertas-stock/generar-sc`, {
    item_ids: itemIds,
    departamento_solicitante: departamentoSolicitante,
  });
}

export async function getHistorialPrecios(itemId: number): Promise<{ data: PrecioHistorial[] }> {
  return api.get(`/api/compras-dashboard/precios-historial/${itemId}`);
}

// -------------------------------------------------------------------
// Crear SC y OC manualmente
// -------------------------------------------------------------------
export type Departamento =
  | "produccion" | "ingenieria" | "mantenimiento" | "bodega"
  | "calidad" | "comercial" | "gerencia" | "compras";

export const DEPARTAMENTO_LABEL: Record<Departamento, string> = {
  produccion: "Producción",
  ingenieria: "Ingeniería",
  mantenimiento: "Mantenimiento",
  bodega: "Bodega",
  calidad: "Calidad",
  comercial: "Comercial",
  gerencia: "Gerencia",
  compras: "Compras",
};

export interface SolicitudCompraCreateInput {
  departamento_solicitante: Departamento;
  prioridad?: Prioridad;
  fecha_requerida?: string | null;
  justificacion?: string | null;
  observaciones?: string | null;
  origen?: OrigenSC;
  moneda?: string;
  lineas: Array<{
    orden: number;
    item_id?: number | null;
    descripcion: string;
    unidad_medida?: string;
    cantidad_solicitada: number;
    precio_referencial?: number;
    moneda?: string;
    proveedor_sugerido_id?: number | null;
    notas?: string | null;
  }>;
}

export async function createSolicitudCompra(payload: SolicitudCompraCreateInput): Promise<{ data: SolicitudCompra }> {
  return api.post(`/api/solicitudes-compra`, payload);
}

export interface OrdenCompraCreateInput {
  proveedor_id: number;
  solicitud_id?: number | null;
  expediente_id?: number | null;
  fecha_entrega_acordada?: string | null;
  condiciones_pago?: string | null;
  moneda?: string;
  iva_porcentaje?: number;
  descuento_porcentaje?: number;
  retencion_valor?: number;
  observaciones_internas?: string | null;
  observaciones_proveedor?: string | null;
  lineas: Array<{
    orden: number;
    item_id?: number | null;
    descripcion: string;
    codigo_proveedor_item?: string | null;
    unidad_medida?: string;
    cantidad_solicitada: number;
    precio_unitario: number;
    descuento_porcentaje?: number;
    notas?: string | null;
  }>;
}

export async function createOrdenCompra(payload: OrdenCompraCreateInput): Promise<{ data: OrdenCompra }> {
  return api.post(`/api/ordenes-compra`, payload);
}

// -------------------------------------------------------------------
// Labels / helpers de UI
// -------------------------------------------------------------------
export const ESTADO_OC_LABEL: Record<EstadoOC, string> = {
  borrador: "Borrador",
  en_revision: "En revisión",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  enviada: "Enviada al proveedor",
  confirmada: "Confirmada por proveedor",
  recibida_parcial: "Recibida parcial",
  recibida_total: "Recibida total",
  cerrada: "Cerrada",
  cancelada: "Cancelada",
};

export const ESTADO_OC_COLOR: Record<EstadoOC, string> = {
  borrador: "bg-gray-100 text-gray-700",
  en_revision: "bg-amber-100 text-amber-800",
  aprobada: "bg-blue-100 text-blue-800",
  rechazada: "bg-red-100 text-red-800",
  enviada: "bg-indigo-100 text-indigo-800",
  confirmada: "bg-purple-100 text-purple-800",
  recibida_parcial: "bg-yellow-100 text-yellow-800",
  recibida_total: "bg-green-100 text-green-800",
  cerrada: "bg-emerald-100 text-emerald-800",
  cancelada: "bg-rose-100 text-rose-800",
};

export const ESTADO_SC_LABEL: Record<EstadoSC, string> = {
  borrador: "Borrador",
  enviada: "Pendiente aprobación",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  convertida_en_oc: "Convertida en OC",
  cancelada: "Cancelada",
};

export const ESTADO_SC_COLOR: Record<EstadoSC, string> = {
  borrador: "bg-gray-100 text-gray-700",
  enviada: "bg-amber-100 text-amber-800",
  aprobada: "bg-green-100 text-green-800",
  rechazada: "bg-red-100 text-red-800",
  convertida_en_oc: "bg-blue-100 text-blue-800",
  cancelada: "bg-rose-100 text-rose-800",
};

export const PRIORIDAD_LABEL: Record<Prioridad, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
  urgente: "Urgente",
  critica: "Crítica",
};

export function fmtMoneda(valor: number | string | null | undefined, moneda = "USD"): string {
  if (valor === null || valor === undefined) return "—";
  const n = typeof valor === "string" ? parseFloat(valor) : valor;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: moneda }).format(n);
}
