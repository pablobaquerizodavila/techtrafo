"use client";

import { useEffect, useState, useCallback, use as usePromise } from "react";
import Link from "next/link";
import { ChevronLeft, Check, PackageCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import { PageHeader, HeaderActionGhost } from "@/components/page-header";
import { Panel } from "@/components/panel";
import {
  anularRecepcion, confirmarRecepcion, fmtMoneda, getRecepcion, Recepcion,
} from "@/lib/compras";
import { ApiError } from "@/lib/api";
import { getNoConformidades } from "@/lib/no-conformidades";

const REC_BADGE: Record<string, "muted" | "success" | "destructive" | "warning"> = {
  borrador: "muted", confirmada: "success", rechazada: "destructive", anulada: "warning",
};

function actionClass(tone: "primary" | "ghost") {
  return tone === "primary"
    ? "inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-3.5 py-2 text-xs font-medium text-white glow-copper-sm inset-highlight-md transition hover:glow-copper disabled:opacity-60"
    : "inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-3.5 py-2 text-xs font-medium text-foreground/90 transition hover:border-glass-strong hover:bg-glass-elev disabled:opacity-60";
}

export default function RecepcionDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const recId = Number(id);
  const [rec, setRec] = useState<Recepcion | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [nc, setNc] = useState<{ id: number; codigo: string; estado: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await getRecepcion(recId); setRec(res.data); }
    catch (err) { toast.error(err instanceof ApiError ? `Error ${err.status}` : "Error cargando recepción"); }
    finally { setLoading(false); }
  }, [recId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    getNoConformidades({ recepcion_id: Number(recId) })
      .then((d) => { if (d.data?.length > 0) setNc(d.data[0]); })
      .catch(() => {});
  }, [recId]);

  async function action(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); toast.success(ok); await load(); }
    catch (err) { toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error"); }
    finally { setBusy(false); }
  }

  if (loading || !rec) {
    return (
      <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-copper border-t-transparent" />
          <span className="text-sm">Cargando recepción…</span>
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
          { href: "/compras/recepciones", label: "Recepciones" },
          { label: rec.codigo },
        ]}
        title={rec.codigo}
        titleAccent="recepción"
        meta={
          <>
            <Badge variant={REC_BADGE[rec.estado] ?? "muted"}>{rec.estado}</Badge>
            <span className="text-muted-foreground/40">·</span>
            <span>{new Date(rec.fecha_recepcion).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}</span>
            {rec.ordenes_compra && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span>OC <Link className="font-mono text-copper hover:underline" href={`/compras/ordenes-compra/${rec.ordenes_compra.id}`}>{rec.ordenes_compra.codigo}</Link></span>
              </>
            )}
            <span className="text-muted-foreground/40">·</span>
            <span>Estado general: <span className="capitalize text-foreground">{rec.estado_general}</span></span>
          </>
        }
        actions={<HeaderActionGhost href="/compras/recepciones" icon={<ChevronLeft className="h-3.5 w-3.5" />}>Volver</HeaderActionGhost>}
      />

      <div className="space-y-6 pt-6">
        {nc && (
          <div className="px-1">
            <Link
              href={`/compras/no-conformidades/${nc.id}`}
              className="inline-flex items-center gap-2 text-sm text-red-400 hover:text-red-300 font-medium"
            >
              ⚠ No conformidad: {nc.codigo}
              <span className={`text-xs px-2 py-0.5 rounded-full ${nc.estado === "cerrada" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                {nc.estado}
              </span>
            </Link>
          </div>
        )}

        {rec.estado === "borrador" && (
          <Panel title="Acciones disponibles" subtitle="Confirmá para que el material entre a bodega">
            <div className="flex gap-2">
              <button type="button" onClick={() => action(() => confirmarRecepcion(recId), "Recepción confirmada · bodega actualizada")} disabled={busy} className={actionClass("primary")}>
                <Check className="h-3.5 w-3.5" /> Confirmar recepción
              </button>
              <button type="button" onClick={() => action(() => anularRecepcion(recId), "Recepción anulada")} disabled={busy} className={actionClass("ghost")}>
                Anular
              </button>
            </div>
          </Panel>
        )}

        <Panel title="Líneas recibidas" subtitle={`${(rec.recepcion_lineas ?? []).length} ítems`} icon={<PackageCheck className="h-3.5 w-3.5" />} padded={false}>
          <Table>
            <TableHeader>
              <TableRow className="border-glass bg-glass hover:bg-glass">
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Item</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Recibida</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Rechazada</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Precio real</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Inspección</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Ubicación</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Mov.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rec.recepcion_lineas ?? []).map((rl) => (
                <TableRow key={rl.id} className="border-glass hover:bg-glass">
                  <TableCell>
                    <p className="font-mono text-[10.5px] text-copper">{rl.orden_compra_lineas?.items?.codigo_interno ?? "—"}</p>
                    <p className="text-sm">{rl.orden_compra_lineas?.descripcion}</p>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold tabular-nums text-green-300">{Number(rl.cantidad_recibida)}</TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums text-rose-300">{Number(rl.cantidad_rechazada)}</TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">{rl.precio_real ? fmtMoneda(rl.precio_real) : <span className="text-muted-foreground/50">—</span>}</TableCell>
                  <TableCell>
                    <Badge variant={rl.resultado_inspeccion === "aprobado" ? "success" : rl.resultado_inspeccion === "rechazado" ? "destructive" : "warning"}>
                      {rl.resultado_inspeccion}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-foreground/80">{rl.ubicaciones ? rl.ubicaciones.codigo : <span className="text-muted-foreground/50">—</span>}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">
                    {rl.movimiento_stock_id ? `#${rl.movimiento_stock_id}` : <span className="text-muted-foreground/50">—</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>

        <Panel title="Documentos">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm md:grid-cols-2">
            <KVPair label="Guía de remisión" value={rec.guia_remision_numero} mono />
            <KVPair label="Factura número" value={rec.factura_numero} mono />
            <KVPair label="Factura fecha" value={rec.factura_fecha ? new Date(rec.factura_fecha).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" }) : null} mono />
            <KVPair label="Estado físico" value={rec.estado_general} />
            {rec.observaciones && <KVPair label="Observaciones" value={rec.observaciones} full />}
          </dl>
        </Panel>
      </div>

      <Toaster richColors theme="dark" />
    </div>
  );
}

function KVPair({ label, value, full, mono }: { label: string; value: React.ReactNode; full?: boolean; mono?: boolean }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <dt className="mb-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`text-sm text-foreground/90 ${mono ? "font-mono" : ""}`}>{value ?? "—"}</dd>
    </div>
  );
}
