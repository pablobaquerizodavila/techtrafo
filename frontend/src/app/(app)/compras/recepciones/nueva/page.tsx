"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Save, PackageCheck } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PageHeader, HeaderActionGhost } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import {
  createRecepcion, getOrdenCompra, OrdenCompra, RecepcionLineaInput,
} from "@/lib/compras";
import { listUbicaciones, Ubicacion } from "@/lib/inventario";
import { ApiError } from "@/lib/api";

interface LineaForm {
  orden_compra_linea_id: number;
  item_codigo: string;
  descripcion: string;
  unidad_medida: string;
  saldo: number;
  precio_oc: number;
  cantidad_recibida: number;
  cantidad_rechazada: number;
  precio_real: number | null;
  resultado_inspeccion: "aprobado" | "rechazado" | "observado" | "pendiente_inspeccion";
  motivo_rechazo: string;
  ubicacion_id: number | null;
}

export default function NuevaRecepcionPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const ocId = Number(sp.get("oc") ?? 0);
  const [oc, setOc] = useState<OrdenCompra | null>(null);
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [lineas, setLineas] = useState<LineaForm[]>([]);
  const [guia, setGuia] = useState("");
  const [factNum, setFactNum] = useState("");
  const [factFecha, setFactFecha] = useState("");
  const [estadoGeneral, setEstadoGeneral] = useState<"bueno" | "observado" | "danado" | "incompleto">("bueno");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!ocId) return;
    try {
      const [ocRes, ubRes] = await Promise.all([
        getOrdenCompra(ocId),
        listUbicaciones(false),
      ]);
      setOc(ocRes.data);
      setUbicaciones(ubRes.data);
      const defaultUb = ubRes.data[0]?.id ?? null;
      const initial = (ocRes.data.orden_compra_lineas ?? [])
        .filter((l) => l.estado_linea !== "recibida" && l.estado_linea !== "cancelada")
        .map((l) => {
          const saldo = Math.max(Number(l.cantidad_solicitada) - Number(l.cantidad_recibida ?? 0), 0);
          return {
            orden_compra_linea_id: Number(l.id),
            item_codigo: l.items?.codigo_interno ?? "—",
            descripcion: l.descripcion,
            unidad_medida: l.unidad_medida,
            saldo,
            precio_oc: Number(l.precio_unitario),
            cantidad_recibida: saldo,
            cantidad_rechazada: 0,
            precio_real: null,
            resultado_inspeccion: "aprobado" as const,
            motivo_rechazo: "",
            ubicacion_id: l.ubicacion_destino_id ?? defaultUb,
          };
        });
      setLineas(initial);
    } catch (err) {
      toast.error(err instanceof ApiError ? `Error ${err.status}` : "Error cargando OC");
    }
  }, [ocId]);

  useEffect(() => { load(); }, [load]);

  function updateLinea(idx: number, patch: Partial<LineaForm>) {
    setLineas((curr) => curr.map((l, i) => i === idx ? { ...l, ...patch } : l));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!oc) return;
    const lineasInput: RecepcionLineaInput[] = lineas
      .filter((l) => l.cantidad_recibida > 0 || l.cantidad_rechazada > 0)
      .map((l) => ({
        orden_compra_linea_id: l.orden_compra_linea_id,
        cantidad_recibida: l.cantidad_recibida,
        cantidad_rechazada: l.cantidad_rechazada,
        precio_real: l.precio_real ?? undefined,
        resultado_inspeccion: l.resultado_inspeccion,
        motivo_rechazo: l.resultado_inspeccion === "rechazado" ? l.motivo_rechazo : undefined,
        ubicacion_id: l.ubicacion_id ?? undefined,
      }));
    if (lineasInput.length === 0) {
      toast.error("Indicá al menos una cantidad recibida o rechazada");
      return;
    }
    setSaving(true);
    try {
      const res = await createRecepcion({
        orden_compra_id: oc.id,
        guia_remision_numero: guia || null,
        factura_numero: factNum || null,
        factura_fecha: factFecha || null,
        estado_general: estadoGeneral,
        observaciones: obs || null,
        lineas: lineasInput,
      });
      toast.success(`Recepción ${res.data.codigo} creada en borrador. Confirmala para impactar bodega.`);
      router.push(`/compras/recepciones/${res.data.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  if (!ocId) {
    return (
      <div>
        <PageHeader breadcrumb={[{ href: "/dashboard", label: "Panel" }, { href: "/compras", label: "Compras" }, { label: "Nueva recepción" }]} title="Nueva" titleAccent="recepción" />
        <div className="pt-6">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-6 inset-highlight">
            <p className="mb-3 text-sm text-amber-200">Necesitás especificar una OC en el query string (<code className="font-mono text-amber-100">?oc=ID</code>).</p>
            <Link href="/compras/ordenes-compra"
              className="inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-4 py-2 text-sm font-medium text-foreground/90 transition hover:border-glass-strong hover:bg-glass-elev">
              Ver OCs →
            </Link>
          </div>
        </div>
      </div>
    );
  }
  if (!oc) {
    return (
      <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-copper border-t-transparent" />
          <span className="text-sm">Cargando OC…</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        breadcrumb={[
          { href: "/dashboard", label: "Panel" },
          { href: "/compras", label: "Compras" },
          { href: `/compras/ordenes-compra/${oc.id}`, label: oc.codigo },
          { label: "Nueva recepción" },
        ]}
        title="Registrar"
        titleAccent="recepción"
        meta={
          <>
            <span>Contra OC <Link href={`/compras/ordenes-compra/${oc.id}`} className="font-mono text-copper hover:underline">{oc.codigo}</Link></span>
            <span className="text-muted-foreground/40">·</span>
            <span>{oc.proveedores?.razon_social}</span>
            <span className="text-muted-foreground/40">·</span>
            <span>Si el precio real difiere, se actualiza el costo del item</span>
          </>
        }
        actions={<HeaderActionGhost href={`/compras/ordenes-compra/${oc.id}`} icon={<ChevronLeft className="h-3.5 w-3.5" />}>Volver a la OC</HeaderActionGhost>}
      />

      <form onSubmit={onSubmit} className="space-y-6 pt-6">
        <Panel title="Documentos" subtitle="Guía de remisión, factura y estado físico" icon={<PackageCheck className="h-3.5 w-3.5" />}>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <FormField label="Guía de remisión" htmlFor="guia"><Input id="guia" value={guia} onChange={(e) => setGuia(e.target.value)} className="h-10 border-glass bg-glass" /></FormField>
            <FormField label="Factura" htmlFor="fact"><Input id="fact" value={factNum} onChange={(e) => setFactNum(e.target.value)} className="h-10 border-glass bg-glass" /></FormField>
            <FormField label="Fecha factura" htmlFor="factf"><Input id="factf" type="date" value={factFecha} onChange={(e) => setFactFecha(e.target.value)} className="h-10 border-glass bg-glass" /></FormField>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
            <FormField label="Estado físico general" htmlFor="estado">
              <Select value={estadoGeneral} onValueChange={(v) => setEstadoGeneral(v as "bueno" | "observado" | "danado" | "incompleto")}>
                <SelectTrigger id="estado" className="h-10 border-glass bg-glass"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bueno">Bueno</SelectItem>
                  <SelectItem value="observado">Observado</SelectItem>
                  <SelectItem value="danado">Dañado</SelectItem>
                  <SelectItem value="incompleto">Incompleto</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>
          <div className="mt-5">
            <FormField label="Observaciones" htmlFor="obs">
              <Textarea id="obs" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} className="border-glass bg-glass" />
            </FormField>
          </div>
        </Panel>

        <Panel
          title="Líneas a recibir"
          subtitle="Cantidades se descuentan del saldo pendiente"
          padded={false}
        >
          <Table>
            <TableHeader>
              <TableRow className="border-glass bg-glass hover:bg-glass">
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Item</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Saldo</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Recibida</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Rechazada</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Precio real</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Inspección</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Ubicación</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineas.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">La OC no tiene líneas pendientes</TableCell></TableRow>
              ) : (
                lineas.map((l, i) => (
                  <TableRow key={l.orden_compra_linea_id} className="border-glass hover:bg-glass">
                    <TableCell className="max-w-xs">
                      <p className="font-mono text-[10.5px] text-copper">{l.item_codigo}</p>
                      <p className="text-sm">{l.descripcion}</p>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">{l.saldo} {l.unidad_medida}</TableCell>
                    <TableCell className="text-right">
                      <Input type="number" step="any" min="0" max={l.saldo}
                        className="h-8 w-24 border-glass bg-glass text-right font-mono text-xs"
                        value={l.cantidad_recibida}
                        onChange={(e) => updateLinea(i, { cantidad_recibida: Number(e.target.value) })} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input type="number" step="any" min="0"
                        className="h-8 w-20 border-glass bg-glass text-right font-mono text-xs"
                        value={l.cantidad_rechazada}
                        onChange={(e) => updateLinea(i, { cantidad_rechazada: Number(e.target.value) })} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input type="number" step="any" min="0"
                        placeholder={l.precio_oc.toFixed(2)}
                        className="h-8 w-28 border-glass bg-glass text-right font-mono text-xs"
                        value={l.precio_real ?? ""}
                        onChange={(e) => updateLinea(i, { precio_real: e.target.value ? Number(e.target.value) : null })} />
                    </TableCell>
                    <TableCell>
                      <Select value={l.resultado_inspeccion} onValueChange={(v) => updateLinea(i, { resultado_inspeccion: v as LineaForm["resultado_inspeccion"] })}>
                        <SelectTrigger className="h-8 w-36 border-glass bg-glass text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="aprobado">Aprobado</SelectItem>
                          <SelectItem value="observado">Observado</SelectItem>
                          <SelectItem value="rechazado">Rechazado</SelectItem>
                          <SelectItem value="pendiente_inspeccion">Pendiente</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select value={l.ubicacion_id?.toString() ?? "_"} onValueChange={(v) => updateLinea(i, { ubicacion_id: v === "_" ? null : Number(v) })}>
                        <SelectTrigger className="h-8 w-28 border-glass bg-glass text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_">—</SelectItem>
                          {ubicaciones.map((u) => (
                            <SelectItem key={u.id} value={u.id.toString()}>{u.codigo}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <p className="border-t border-glass px-5 py-3 text-xs text-muted-foreground">
            <span className="font-mono text-copper">Tip:</span> dejá el precio real vacío si se mantiene el de la OC. Llenalo solo cuando el proveedor facturó distinto.
          </p>
        </Panel>

        <div className="flex justify-end gap-2 border-t border-glass pt-5">
          <Link href={`/compras/ordenes-compra/${oc.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-4 py-2 text-sm font-medium text-foreground/90 transition hover:border-glass-strong hover:bg-glass-elev">
            Cancelar
          </Link>
          <button type="submit" disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-4 py-2 text-sm font-medium text-white shadow-sm glow-copper-sm inset-highlight-md transition hover:glow-copper disabled:opacity-60">
            <Save className="h-3.5 w-3.5" /> {saving ? "Guardando…" : "Crear recepción (borrador)"}
          </button>
        </div>
      </form>

      <Toaster richColors theme="dark" />
    </div>
  );
}

function FormField({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
