"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import { PageHeader, HeaderActionGhost } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { listRecepciones, Recepcion } from "@/lib/compras";
import { ApiError } from "@/lib/api";

const REC_BADGE: Record<string, "muted" | "success" | "destructive" | "warning"> = {
  borrador: "muted",
  confirmada: "success",
  rechazada: "destructive",
  anulada: "warning",
};

export default function RecepcionesPage() {
  const sp = useSearchParams();
  const [estado, setEstado] = useState<string>(sp.get("estado") ?? "todas");
  const [items, setItems] = useState<Recepcion[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listRecepciones({ estado: estado === "todas" ? undefined : estado });
      setItems(res.data);
    } catch (err) {
      toast.error(err instanceof ApiError ? `Error ${err.status}` : "Error cargando recepciones");
    } finally {
      setLoading(false);
    }
  }, [estado]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { href: "/compras", label: "Compras" }, { label: "Recepciones" }]}
        title="Recepciones"
        titleAccent="de material"
        meta={<span>Al confirmarlas el material entra a bodega y actualiza el costo del item si difiere</span>}
        actions={<HeaderActionGhost href="/compras">← Dashboard</HeaderActionGhost>}
      />

      <div className="space-y-6 pt-6">
        <div className="flex flex-wrap gap-1.5">
          {["todas", "borrador", "confirmada", "anulada"].map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEstado(e)}
              className={estado === e
                ? "inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-3 py-1.5 text-xs font-medium text-white glow-copper-sm inset-highlight-md"
                : "inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-3 py-1.5 text-xs font-medium capitalize text-foreground/80 transition hover:border-glass-strong hover:bg-glass-elev"}
            >
              {e === "todas" ? "Todas" : e}
            </button>
          ))}
        </div>

        <Panel padded={false}>
          <Table>
            <TableHeader>
              <TableRow className="border-glass bg-glass hover:bg-glass">
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Código</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">OC</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Fecha</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Guía remisión</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Factura</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Líneas</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Estado general</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Cargando…</TableCell></TableRow>
              ) : items.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="py-10 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <PackageCheck className="h-5 w-5" />
                    <span className="text-sm">No hay recepciones con ese filtro</span>
                  </div>
                </TableCell></TableRow>
              ) : (
                items.map((r) => (
                  <TableRow key={r.id} className="border-glass hover:bg-glass">
                    <TableCell className="font-mono text-xs">
                      <Link className="text-copper hover:underline" href={`/compras/recepciones/${r.id}`}>{r.codigo}</Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.ordenes_compra && (
                        <Link className="text-ttteal hover:underline" href={`/compras/ordenes-compra/${r.ordenes_compra.id}`}>{r.ordenes_compra.codigo}</Link>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-foreground/80">{new Date(r.fecha_recepcion).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}</TableCell>
                    <TableCell className="font-mono text-xs text-foreground/80">{r.guia_remision_numero ?? <span className="text-muted-foreground/50">—</span>}</TableCell>
                    <TableCell className="font-mono text-xs text-foreground/80">{r.factura_numero ?? <span className="text-muted-foreground/50">—</span>}</TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">{r._count?.recepcion_lineas ?? "—"}</TableCell>
                    <TableCell className="text-xs capitalize text-foreground/80">{r.estado_general}</TableCell>
                    <TableCell><Badge variant={REC_BADGE[r.estado] ?? "muted"}>{r.estado}</Badge></TableCell>
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
