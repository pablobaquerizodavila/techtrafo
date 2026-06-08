"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, ShoppingCart } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, HeaderActionGhost } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import {
  createOrdenCompra, listProveedores, listUmbralesAprobacion,
  Proveedor, ConfigUmbral, fmtMoneda,
} from "@/lib/compras";
import { ApiError } from "@/lib/api";

// ─── tipos locales ──────────────────────────────────────────────────
interface LineaForm {
  id: string;
  descripcion: string;
  codigo_proveedor_item: string;
  unidad_medida: string;
  cantidad_solicitada: string;
  precio_unitario: string;
  descuento_porcentaje: string;
}

function newLinea(orden: number): LineaForm {
  return {
    id: `l-${orden}-${Date.now()}`,
    descripcion: "",
    codigo_proveedor_item: "",
    unidad_medida: "unid",
    cantidad_solicitada: "1",
    precio_unitario: "0",
    descuento_porcentaje: "0",
  };
}

// ─── cálculo de totales (igual que backend) ─────────────────────────
function calcTotales(
  lineas: LineaForm[],
  descPorcCab: number,
  ivaPorc: number,
  retencion: number
) {
  const subtotal = lineas.reduce((acc, l) => {
    const sub = (parseFloat(l.cantidad_solicitada) || 0) * (parseFloat(l.precio_unitario) || 0);
    const descLinea = sub * ((parseFloat(l.descuento_porcentaje) || 0) / 100);
    return acc + (sub - descLinea);
  }, 0);
  const descuentoValor = subtotal * (descPorcCab / 100);
  const baseImponible = subtotal - descuentoValor;
  const ivaValor = baseImponible * (ivaPorc / 100);
  const total = baseImponible + ivaValor - retencion;
  return { subtotal, descuentoValor, baseImponible, ivaValor, total };
}

function resolverRolAprobador(total: number, umbrales: ConfigUmbral[]): string {
  const match = umbrales.find((u) => {
    const min = parseFloat(u.monto_minimo);
    const max = u.monto_maximo ? parseFloat(u.monto_maximo) : Infinity;
    return total >= min && total <= max;
  });
  return match?.roles.nombre ?? "—";
}

// ─── componente ─────────────────────────────────────────────────────
export default function NuevaOCPage() {
  const router = useRouter();

  // datos maestros
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [umbrales, setUmbrales] = useState<ConfigUmbral[]>([]);
  const [loadingMaestro, setLoadingMaestro] = useState(true);

  // cabecera
  const [proveedorId, setProveedorId] = useState<string>("");
  const [condicionesPago, setCondicionesPago] = useState("");
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [moneda, setMoneda] = useState("USD");
  const [ivaPorc, setIvaPorc] = useState("15");
  const [descCab, setDescCab] = useState("0");
  const [retencion, setRetencion] = useState("0");
  const [obsInternas, setObsInternas] = useState("");
  const [obsProveedor, setObsProveedor] = useState("");

  // líneas
  const [lineas, setLineas] = useState<LineaForm[]>([newLinea(1)]);
  const [saving, setSaving] = useState(false);

  // cargar maestros
  const loadMaestros = useCallback(async () => {
    try {
      const [provRes, umbRes] = await Promise.all([
        listProveedores({ estado: "activo" }),
        listUmbralesAprobacion(),
      ]);
      setProveedores(provRes.data);
      setUmbrales(umbRes.data);
      if (provRes.data.length > 0) setProveedorId(String(provRes.data[0].id));
    } catch {
      toast.error("Error cargando proveedores");
    } finally {
      setLoadingMaestro(false);
    }
  }, []);

  useEffect(() => { loadMaestros(); }, [loadMaestros]);

  // ── helpers de líneas ──────────────────────────────────────────
  const addLinea = () => setLineas((prev) => [...prev, newLinea(prev.length + 1)]);
  const removeLinea = (id: string) => setLineas((prev) => prev.filter((l) => l.id !== id));
  const patchLinea = (id: string, patch: Partial<LineaForm>) =>
    setLineas((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  // ── totales ────────────────────────────────────────────────────
  const tots = calcTotales(
    lineas,
    parseFloat(descCab) || 0,
    parseFloat(ivaPorc) || 0,
    parseFloat(retencion) || 0
  );
  const rolAprobador = resolverRolAprobador(tots.total, umbrales);

  // ── submit ─────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proveedorId) { toast.error("Selecciona un proveedor"); return; }
    for (const l of lineas) {
      if (!l.descripcion.trim()) { toast.error("Todas las líneas deben tener descripción"); return; }
      if (parseFloat(l.cantidad_solicitada) <= 0) { toast.error("Cantidad debe ser mayor a 0"); return; }
      if (parseFloat(l.precio_unitario) < 0) { toast.error("Precio no puede ser negativo"); return; }
    }
    setSaving(true);
    try {
      const payload = {
        proveedor_id: parseInt(proveedorId, 10),
        fecha_entrega_acordada: fechaEntrega || null,
        condiciones_pago: condicionesPago || null,
        moneda,
        iva_porcentaje: parseFloat(ivaPorc) || 15,
        descuento_porcentaje: parseFloat(descCab) || 0,
        retencion_valor: parseFloat(retencion) || 0,
        observaciones_internas: obsInternas || null,
        observaciones_proveedor: obsProveedor || null,
        lineas: lineas.map((l, i) => ({
          orden: i + 1,
          descripcion: l.descripcion.trim(),
          codigo_proveedor_item: l.codigo_proveedor_item.trim() || null,
          unidad_medida: l.unidad_medida || "unid",
          cantidad_solicitada: parseFloat(l.cantidad_solicitada) || 1,
          precio_unitario: parseFloat(l.precio_unitario) || 0,
          descuento_porcentaje: parseFloat(l.descuento_porcentaje) || 0,
        })),
      };
      const res = await createOrdenCompra(payload);
      toast.success(`OC creada: ${res.data.codigo}`);
      setTimeout(() => router.push(`/compras/ordenes-compra/${res.data.id}`), 800);
    } catch (err) {
      const msg = err instanceof ApiError
        ? `Error ${err.status}: ${(err as any).body?.details ? JSON.stringify((err as any).body.details) : err.message}`
        : "Error al crear la OC";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        breadcrumb={[
          { href: "/dashboard", label: "Panel" },
          { href: "/compras", label: "Compras" },
          { href: "/compras/ordenes-compra", label: "Órdenes de compra" },
          { label: "Nueva OC" },
        ]}
        title="Nueva orden"
        titleAccent="de compra"
        meta={<span>Origen manual · estado inicial: <strong>Borrador</strong></span>}
        actions={<HeaderActionGhost href="/compras/ordenes-compra">← Volver</HeaderActionGhost>}
      />

      <form onSubmit={handleSubmit} className="space-y-6 pt-6">
        {/* ── Cabecera ──────────────────────────────────────── */}
        <Panel>
          <h2 className="mb-4 text-sm font-semibold text-foreground/80">Datos generales</h2>

          {loadingMaestro ? (
            <p className="text-sm text-muted-foreground">Cargando proveedores…</p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {/* Proveedor */}
                <div className="space-y-1.5">
                  <Label>Proveedor *</Label>
                  <Select value={proveedorId} onValueChange={setProveedorId}>
                    <SelectTrigger className="bg-glass border-glass-mid">
                      <SelectValue placeholder="Seleccionar proveedor" />
                    </SelectTrigger>
                    <SelectContent>
                      {proveedores.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.codigo} — {p.razon_social}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Fecha entrega */}
                <div className="space-y-1.5">
                  <Label>Fecha entrega acordada</Label>
                  <Input
                    type="date"
                    value={fechaEntrega}
                    onChange={(e) => setFechaEntrega(e.target.value)}
                    className="bg-glass border-glass-mid"
                  />
                </div>

                {/* Condiciones de pago */}
                <div className="space-y-1.5">
                  <Label>Condiciones de pago</Label>
                  <Input
                    value={condicionesPago}
                    onChange={(e) => setCondicionesPago(e.target.value)}
                    placeholder="Ej: 30 días, anticipo 50%…"
                    className="bg-glass border-glass-mid"
                  />
                </div>

                {/* Moneda */}
                <div className="space-y-1.5">
                  <Label>Moneda</Label>
                  <Select value={moneda} onValueChange={setMoneda}>
                    <SelectTrigger className="bg-glass border-glass-mid">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD — Dólares</SelectItem>
                      <SelectItem value="EUR">EUR — Euros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* IVA */}
                <div className="space-y-1.5">
                  <Label>IVA %</Label>
                  <Input
                    type="number"
                    min="0"
                    max="50"
                    step="any"
                    value={ivaPorc}
                    onChange={(e) => setIvaPorc(e.target.value)}
                    className="bg-glass border-glass-mid tabular-nums"
                  />
                </div>

                {/* Descuento cabecera */}
                <div className="space-y-1.5">
                  <Label>Descuento cabecera %</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={descCab}
                    onChange={(e) => setDescCab(e.target.value)}
                    className="bg-glass border-glass-mid tabular-nums"
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Observaciones internas</Label>
                  <Textarea
                    value={obsInternas}
                    onChange={(e) => setObsInternas(e.target.value)}
                    placeholder="Notas solo para el equipo interno…"
                    rows={3}
                    className="bg-glass border-glass-mid resize-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Observaciones al proveedor</Label>
                  <Textarea
                    value={obsProveedor}
                    onChange={(e) => setObsProveedor(e.target.value)}
                    placeholder="Instrucciones para incluir en la OC oficial…"
                    rows={3}
                    className="bg-glass border-glass-mid resize-none"
                  />
                </div>
              </div>
            </>
          )}
        </Panel>

        {/* ── Líneas ────────────────────────────────────────── */}
        <Panel padded={false}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-glass">
            <h2 className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-copper" />
              Líneas de la orden
            </h2>
            <button
              type="button"
              onClick={addLinea}
              className="inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-3 py-1.5 text-xs font-medium text-foreground/80 transition hover:border-copper/60 hover:text-copper"
            >
              <Plus className="h-3.5 w-3.5" /> Agregar línea
            </button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-glass bg-glass hover:bg-glass">
                  <TableHead className="w-8 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">#</TableHead>
                  <TableHead className="min-w-[200px] font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Descripción *</TableHead>
                  <TableHead className="w-32 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Cód. proveedor</TableHead>
                  <TableHead className="w-20 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">U.M.</TableHead>
                  <TableHead className="w-24 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Cantidad *</TableHead>
                  <TableHead className="w-32 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">P. Unitario *</TableHead>
                  <TableHead className="w-24 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Desc. %</TableHead>
                  <TableHead className="w-32 text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Subtotal</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineas.map((l, idx) => {
                  const sub = (parseFloat(l.cantidad_solicitada) || 0) * (parseFloat(l.precio_unitario) || 0);
                  const descL = sub * ((parseFloat(l.descuento_porcentaje) || 0) / 100);
                  return (
                    <TableRow key={l.id} className="border-glass hover:bg-glass">
                      <TableCell className="text-xs text-muted-foreground tabular-nums">{idx + 1}</TableCell>

                      <TableCell>
                        <Input
                          required
                          value={l.descripcion}
                          onChange={(e) => patchLinea(l.id, { descripcion: e.target.value })}
                          placeholder="Descripción del artículo *"
                          className="bg-glass border-glass-mid text-xs h-7"
                        />
                      </TableCell>

                      <TableCell>
                        <Input
                          value={l.codigo_proveedor_item}
                          onChange={(e) => patchLinea(l.id, { codigo_proveedor_item: e.target.value })}
                          placeholder="SKU proveedor"
                          className="bg-glass border-glass-mid text-xs h-7 w-28"
                        />
                      </TableCell>

                      <TableCell>
                        <Input
                          value={l.unidad_medida}
                          onChange={(e) => patchLinea(l.id, { unidad_medida: e.target.value })}
                          className="bg-glass border-glass-mid text-xs h-7 w-16"
                          placeholder="unid"
                        />
                      </TableCell>

                      <TableCell>
                        <Input
                          type="number"
                          min="0.001"
                          step="any"
                          required
                          value={l.cantidad_solicitada}
                          onChange={(e) => patchLinea(l.id, { cantidad_solicitada: e.target.value })}
                          className="bg-glass border-glass-mid text-xs h-7 w-20 tabular-nums"
                        />
                      </TableCell>

                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          required
                          value={l.precio_unitario}
                          onChange={(e) => patchLinea(l.id, { precio_unitario: e.target.value })}
                          className="bg-glass border-glass-mid text-xs h-7 w-28 tabular-nums"
                          placeholder="0.00"
                        />
                      </TableCell>

                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="any"
                          value={l.descuento_porcentaje}
                          onChange={(e) => patchLinea(l.id, { descuento_porcentaje: e.target.value })}
                          className="bg-glass border-glass-mid text-xs h-7 w-20 tabular-nums"
                        />
                      </TableCell>

                      <TableCell className="text-right font-mono text-xs tabular-nums text-foreground/80">
                        {fmtMoneda(sub - descL, moneda)}
                      </TableCell>

                      <TableCell>
                        <button
                          type="button"
                          onClick={() => removeLinea(l.id)}
                          disabled={lineas.length === 1}
                          className="rounded p-1 text-muted-foreground transition hover:text-destructive disabled:opacity-30 disabled:pointer-events-none"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Bloque de totales */}
          <div className="flex justify-end px-4 py-4 border-t border-glass">
            <div className="w-72 space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-mono tabular-nums">{fmtMoneda(tots.subtotal, moneda)}</span>
              </div>
              {tots.descuentoValor > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Descuento ({descCab}%)</span>
                  <span className="font-mono tabular-nums text-amber-400">−{fmtMoneda(tots.descuentoValor, moneda)}</span>
                </div>
              )}
              <div className="flex justify-between text-muted-foreground">
                <span>Base imponible</span>
                <span className="font-mono tabular-nums">{fmtMoneda(tots.baseImponible, moneda)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>IVA {ivaPorc}%</span>
                <span className="font-mono tabular-nums">{fmtMoneda(tots.ivaValor, moneda)}</span>
              </div>
              {tots.total !== tots.baseImponible + tots.ivaValor && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Retención</span>
                  <span className="font-mono tabular-nums text-amber-400">−{fmtMoneda(parseFloat(retencion) || 0, moneda)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-glass pt-1.5 font-semibold text-foreground">
                <span>Total</span>
                <span className="font-mono text-base tabular-nums text-copper">{fmtMoneda(tots.total, moneda)}</span>
              </div>
              {umbrales.length > 0 && (
                <div className="flex justify-between pt-1 text-xs text-muted-foreground">
                  <span>Aprobador requerido</span>
                  <span className="font-mono capitalize">{rolAprobador}</span>
                </div>
              )}
              {/* Retención (campo extra) */}
              <div className="flex items-center gap-2 pt-1.5 border-t border-glass">
                <span className="text-xs text-muted-foreground w-32">Retención (valor)</span>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={retencion}
                  onChange={(e) => setRetencion(e.target.value)}
                  className="bg-glass border-glass-mid text-xs h-6 tabular-nums w-24 ml-auto"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>
        </Panel>

        {/* ── Acciones ──────────────────────────────────────── */}
        <div className="flex justify-end gap-3 pb-8">
          <HeaderActionGhost href="/compras/ordenes-compra">Cancelar</HeaderActionGhost>
          <button
            type="submit"
            disabled={saving || loadingMaestro}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-4 py-2 text-xs font-medium text-white shadow-sm glow-copper-sm inset-highlight-md transition-shadow hover:glow-copper disabled:opacity-50 disabled:pointer-events-none"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Guardando…" : "Crear orden de compra"}
          </button>
        </div>
      </form>

      <Toaster richColors theme="dark" />
    </div>
  );
}
