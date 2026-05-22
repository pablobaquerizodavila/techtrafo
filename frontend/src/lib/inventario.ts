import { api } from "./api";

// ===================================================================
// Tipos
// ===================================================================
export type TipoItem = "insumo" | "componente" | "herramienta" | "servicio" | "producto_terminado";
export type EstadoItem = "activo" | "inactivo" | "descontinuado";
export type EstadoBasico = "activo" | "inactivo";
export type TipoUbicacion = "bodega" | "area_produccion" | "area_qc" | "transito" | "obra";
export type TipoMovimiento = "entrada" | "salida" | "ajuste_positivo" | "ajuste_negativo" | "transferencia";
export type ReferenciaTipo = "compra" | "ot" | "devolucion" | "inventario_fisico" | "manual";

export interface Categoria {
  id: number;
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  estado: EstadoBasico;
}

export interface Ubicacion {
  id: number;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  tipo: TipoUbicacion;
  estado: EstadoBasico;
}

export interface Item {
  id: number;
  codigo_interno: string;
  categoria_id: number;
  nombre: string;
  descripcion: string | null;
  tipo_item: TipoItem;
  unidad_medida: string;
  controla_stock: boolean;
  controla_lote: boolean;
  controla_serie: boolean;
  costo_referencia: string;
  precio_referencia: string;
  stock_minimo: string;
  stock_maximo: string;
  punto_reorden: string;
  proveedor_preferido: string | null;
  peso_kg: string | null;
  notas: string | null;
  estado: EstadoItem;
  created_at: string;
  updated_at: string;
  categorias_item?: { id: number; nombre: string };
  stock_total?: number;
}

export interface Lote {
  id: number;
  item_id: number;
  numero_lote: string;
  proveedor: string | null;
  fecha_ingreso: string;
  fecha_vencimiento: string | null;
  observaciones: string | null;
  estado: string;
  items?: { id: number; codigo_interno: string; nombre: string };
}

export interface StockRow {
  id: number;
  item_id: number;
  ubicacion_id: number;
  lote_id: number | null;
  cantidad: string;
  items: { id: number; codigo_interno: string; nombre: string; unidad_medida: string; controla_lote: boolean; controla_serie: boolean };
  ubicaciones: { id: number; codigo: string; nombre: string };
  lotes: { id: number; numero_lote: string; fecha_vencimiento: string | null } | null;
}

export interface Movimiento {
  id: number;
  fecha: string;
  tipo: TipoMovimiento;
  item_id: number;
  ubicacion_origen_id: number | null;
  ubicacion_destino_id: number | null;
  lote_id: number | null;
  serie_id: number | null;
  cantidad: string;
  costo_unitario: string | null;
  referencia_tipo: ReferenciaTipo | null;
  referencia_id: number | null;
  motivo: string | null;
  observaciones: string | null;
  items?: { id: number; codigo_interno: string; nombre: string; unidad_medida: string };
  ubicaciones_movimientos_stock_ubicacion_origen_idToubicaciones?: { id: number; codigo: string; nombre: string } | null;
  ubicaciones_movimientos_stock_ubicacion_destino_idToubicaciones?: { id: number; codigo: string; nombre: string } | null;
  lotes?: { id: number; numero_lote: string } | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; total_pages: number };
}

// ===================================================================
// Categorias
// ===================================================================
export async function listCategorias(includeInactivos = false): Promise<{ data: Categoria[] }> {
  const qs = includeInactivos ? "?include_inactivos=true" : "";
  return api.get(`/api/inventario/categorias${qs}`);
}

export async function createCategoria(payload: { codigo?: string | null; nombre: string; descripcion?: string | null }): Promise<{ data: Categoria }> {
  return api.post(`/api/inventario/categorias`, payload);
}

export async function updateCategoria(id: number, payload: Partial<Categoria>): Promise<{ data: Categoria }> {
  return api.patch(`/api/inventario/categorias/${id}`, payload);
}

export async function archiveCategoria(id: number): Promise<void> {
  await api.delete(`/api/inventario/categorias/${id}`);
}

// ===================================================================
// Ubicaciones
// ===================================================================
export async function listUbicaciones(includeInactivos = false): Promise<{ data: Ubicacion[] }> {
  const qs = includeInactivos ? "?include_inactivos=true" : "";
  return api.get(`/api/inventario/ubicaciones${qs}`);
}

export async function createUbicacion(payload: Omit<Ubicacion, "id" | "estado">): Promise<{ data: Ubicacion }> {
  return api.post(`/api/inventario/ubicaciones`, payload);
}

export async function updateUbicacion(id: number, payload: Partial<Ubicacion>): Promise<{ data: Ubicacion }> {
  return api.patch(`/api/inventario/ubicaciones/${id}`, payload);
}

export async function archiveUbicacion(id: number): Promise<void> {
  await api.delete(`/api/inventario/ubicaciones/${id}`);
}

// ===================================================================
// Items
// ===================================================================
export interface ItemListParams {
  page?: number;
  limit?: number;
  q?: string;
  categoria_id?: number;
  tipo_item?: TipoItem;
  estado?: EstadoItem;
}

export async function listItems(params: ItemListParams = {}): Promise<PaginatedResponse<Item>> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== null) qs.set(k, String(v));
  }
  return api.get(`/api/inventario/items${qs.toString() ? `?${qs}` : ""}`);
}

export async function getItem(id: number): Promise<{ data: Item & { stock?: StockRow[]; lotes?: Lote[] } }> {
  return api.get(`/api/inventario/items/${id}`);
}

export type ItemInput = Omit<Item, "id" | "created_at" | "updated_at" | "categorias_item" | "stock_total" | "costo_referencia" | "precio_referencia" | "stock_minimo" | "stock_maximo" | "punto_reorden" | "peso_kg"> & {
  costo_referencia?: number;
  precio_referencia?: number;
  stock_minimo?: number;
  stock_maximo?: number;
  punto_reorden?: number;
  peso_kg?: number | null;
};

export async function createItem(payload: ItemInput): Promise<{ data: Item }> {
  return api.post(`/api/inventario/items`, payload);
}

export async function updateItem(id: number, payload: Partial<ItemInput>): Promise<{ data: Item }> {
  return api.patch(`/api/inventario/items/${id}`, payload);
}

export async function archiveItem(id: number): Promise<void> {
  await api.delete(`/api/inventario/items/${id}`);
}

// ===================================================================
// Lotes
// ===================================================================
export async function listLotes(itemId?: number): Promise<{ data: Lote[] }> {
  const qs = itemId ? `?item_id=${itemId}` : "";
  return api.get(`/api/inventario/lotes${qs}`);
}

export async function createLote(payload: {
  item_id: number;
  numero_lote: string;
  proveedor?: string | null;
  fecha_ingreso?: string;
  fecha_vencimiento?: string | null;
  observaciones?: string | null;
}): Promise<{ data: Lote }> {
  return api.post(`/api/inventario/lotes`, payload);
}

// ===================================================================
// Stock
// ===================================================================
export async function listStock(params: { item_id?: number; ubicacion_id?: number; q?: string; con_cantidad?: boolean } = {}): Promise<{ data: StockRow[] }> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== null) {
      qs.set(k, k === "con_cantidad" ? String(v) : String(v));
    }
  }
  return api.get(`/api/inventario/stock${qs.toString() ? `?${qs}` : ""}`);
}

export interface AlertasResponse {
  data: {
    stock_bajo_reorden: Array<{ item_id: number; codigo_interno: string; nombre: string; unidad_medida: string; punto_reorden: number; stock_actual: number }>;
    lotes_por_vencer: Lote[];
  };
}

export async function getAlertas(): Promise<AlertasResponse> {
  return api.get(`/api/inventario/stock/alertas`);
}

// ===================================================================
// Movimientos
// ===================================================================
export interface MovimientoListParams {
  page?: number;
  limit?: number;
  item_id?: number;
  ubicacion_id?: number;
  tipo?: TipoMovimiento;
  desde?: string;
  hasta?: string;
}

export async function listMovimientos(params: MovimientoListParams = {}): Promise<PaginatedResponse<Movimiento>> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== null) qs.set(k, String(v));
  }
  return api.get(`/api/inventario/movimientos${qs.toString() ? `?${qs}` : ""}`);
}

export interface MovimientoInput {
  tipo: TipoMovimiento;
  item_id: number;
  ubicacion_origen_id?: number | null;
  ubicacion_destino_id?: number | null;
  lote_id?: number | null;
  serie_id?: number | null;
  cantidad: number;
  costo_unitario?: number | null;
  referencia_tipo?: ReferenciaTipo | null;
  referencia_id?: number | null;
  motivo?: string | null;
  observaciones?: string | null;
  fecha?: string;
}

export async function createMovimiento(payload: MovimientoInput): Promise<{ data: Movimiento }> {
  return api.post(`/api/inventario/movimientos`, payload);
}

// ===================================================================
// Helpers UI
// ===================================================================
export function tipoMovLabel(tipo: TipoMovimiento): string {
  return {
    entrada: "Entrada",
    salida: "Salida",
    ajuste_positivo: "Ajuste +",
    ajuste_negativo: "Ajuste −",
    transferencia: "Transferencia",
  }[tipo];
}

export function tipoMovVariant(tipo: TipoMovimiento): "success" | "destructive" | "warning" | "default" {
  switch (tipo) {
    case "entrada":
    case "ajuste_positivo":
      return "success";
    case "salida":
    case "ajuste_negativo":
      return "destructive";
    case "transferencia":
      return "warning";
  }
}

export function tipoItemLabel(t: TipoItem): string {
  return {
    insumo: "Insumo",
    componente: "Componente",
    herramienta: "Herramienta",
    servicio: "Servicio",
    producto_terminado: "Producto terminado",
  }[t];
}
