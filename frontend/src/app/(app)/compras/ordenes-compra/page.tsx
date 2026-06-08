"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ShoppingCart, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import { PageHeader, HeaderActionGhost, HeaderActionPrimary } from "@/components/page-header";
import { Panel } from "@/components/panel";
import {
  ESTADO_OC_LABEL, EstadoOC, OrdenCompra, listOrdenesCompra, fmtMoneda,
} from "@/lib/compras";
import { ApiError } from "@/lib/api";

const OC_BADGE: Record<string, "default" | "muted" | "success" | "warning" | "destructive" | "teal" | "copper"> = {
  borrador: "muted",
  en_revision: "warning",
  aprobada: "copper",
  enviada: "teal",
  confirmada: "teal",
  recibida_parcial: "warning",
  recibida_total: "success",
  cerrada: "muted",
  cancelada: "destructive",
  rechazada: "destructive",
};

const ESTADOS_FILTER: Array<{ value: EstadoOC | "todas"; label: string }> = [
  { value: "todas", label: "Todas" },
  { value: "en_revision", label: "En revisión" },
  { value: "aprobada", label: "Aprobadas" },
  { value: "enviada", label: "Enviadas" },
  { value: "confirmada", label: "Confirmadas" },
  { value: "recibida_parcial", label: "Parcial" },
  { value: "recibida_total", label: "Recibidas" },
  { value: "cancelada", label: "Canceladas" },
];

export default function OCListPage() {
  const sp = useSearchParams();
  const initialEstado = (sp.get("estado") as EstadoOC | null) ?? "todas";
  const [estado, setEstado] = useState<EstadoOC | "todas">(initialEstado);
  const [items, setItems] = useState<OrdenCompra[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listOrdenesCompra({ estado: estado === "todas" ? undefined : estado });
      setItems(res.data);
    } catch (err) {
      toast.error(err instanceof ApiError ? `Error ${err.status}` : "Error cargando OCs");
    } finally {
      setLoading(false);
    }
  }, [estado]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { href: "/compras", label: "Compras" }, { label: "Órdenes de compra" }]}
        title="Órdenes"
        titleAccent="de compra"
        meta={<span>Se generan desde solicitudes aprobadas · aprobación escalonada por monto</span>}
        actions={
          <div className="flex items-center gap-2">
            <HeaderActionPrimary href="/compras/ordenes-compra/nueva" icon={<Plus className="h-3.5 w-3.5" />}>
              Nueva OC
            </HeaderActionPrimary>
            <HeaderActionGhost href="/compras">← Dashboard</HeaderActionGhost>
          </div>
        }
      />

      <div className="space-y-6 pt-6">
        <div className="flex flex-wrap gap-1.5">
          {ESTADOS_FILTER.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setEstado(f.value)}
              className={estado === f.value
                ? "inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-3 py-1.5 text-xs font-medium text-white glow-copper-sm inset-highlight-md"
                : "inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-3 py-1.5 text-xs font-medium text-foreground/80 transition hover:border-glass-strong hover:bg-glass-elev"}
            >
              {f.label}
            </button>
          ))}
        </div>

        <Panel padded={false}>
          <Table>
            <TableHeader>
              <TableRow className="border-glass bg-glass hover:bg-glass">
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Código</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Proveedor</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Total</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Aprobador</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Emisión</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Entrega</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Cargando…</TableCell></TableRow>
              ) : items.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-10 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <ShoppingCart className="h-5 w-5" />
                    <span className="text-sm">No hay OCs con ese filtro</span>
                  </div>
                </TableCell></TableRow>
              ) : (
                items.map((oc) => (
                  <TableRow key={oc.id} className="border-glass hover:bg-glass">
                    <TableCell className="font-mono text-xs">
                      <Link className="text-copper hover:underline" href={`/compras/ordenes-compra/${oc.id}`}>{oc.codigo}</Link>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{oc.proveedores?.razon_social ?? "—"}</p>
                      <p className="font-mono text-[10.5px] text-muted-foreground">{oc.proveedores?.codigo}</p>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold tabular-nums text-copper">{fmtMoneda(oc.total, oc.moneda)}</TableCell>
                    <TableCell className="text-xs text-foreground/80">{oc.roles?.nombre ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-foreground/80">{new Date(oc.fecha_emision).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" })}</TableCell>
                    <TableCell className="font-mono text-xs text-foreground/80">
                      {oc.fecha_entrega_acordada ? new Date(oc.fecha_entrega_acordada).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" }) : <span className="text-muted-foreground/50">—</span>}
                    </TableCell>
                    <TableCell><Badge variant={OC_BADGE[oc.estado] ?? "muted"}>{ESTADO_OC_LABEL[oc.estado] ?? oc.estado}</Badge></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Panel>
      </div>

      <Toaster richColors theme="dark" />
    </div>
  );
}
