"use client";

import { useEffect, useState, useCallback, use as usePromise } from "react";
import Link from "next/link";
import { ChevronLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import {
  anularRecepcion, confirmarRecepcion, fmtMoneda, getRecepcion, Recepcion,
} from "@/lib/compras";
import { ApiError } from "@/lib/api";

export default function RecepcionDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const recId = Number(id);
  const [rec, setRec] = useState<Recepcion | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getRecepcion(recId);
      setRec(res.data);
    } catch (err) {
      toast.error(err instanceof ApiError ? `Error ${err.status}` : "Error cargando recepción");
    } finally {
      setLoading(false);
    }
  }, [recId]);

  useEffect(() => { load(); }, [load]);

  async function action(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !rec) return <div className="p-8 text-muted-foreground">Cargando…</div>;

  return (
    <div className="max-w-4xl space-y-6">
      <Toaster richColors />
      <Link href="/compras/recepciones" className="inline-flex items-center text-sm text-muted-foreground hover:underline">
        <ChevronLeft className="mr-1 h-4 w-4" /> Volver
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <div className="font-mono text-xs text-muted-foreground">{rec.codigo}</div>
          <h1 className="text-2xl font-bold">Recepción</h1>
          <div className="mt-1 text-sm text-muted-foreground">
            {new Date(rec.fecha_recepcion).toLocaleString()} ·{" "}
            {rec.ordenes_compra && (
              <Link className="text-blue-700 hover:underline" href={`/compras/ordenes-compra/${rec.ordenes_compra.id}`}>OC {rec.ordenes_compra.codigo}</Link>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge>{rec.estado}</Badge>
          <span className="text-xs text-muted-foreground">Estado general: {rec.estado_general}</span>
        </div>
      </div>

      {rec.estado === "borrador" && (
        <div className="flex gap-2">
          <Button onClick={() => action(() => confirmarRecepcion(recId), "Recepción confirmada — bodega actualizada")} disabled={busy}>
            <Check className="mr-2 h-4 w-4" /> Confirmar recepción
          </Button>
          <Button variant="outline" onClick={() => action(() => anularRecepcion(recId), "Recepción anulada")} disabled={busy}>
            Anular
          </Button>
        </div>
      )}

      <section className="rounded-md border bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase text-muted-foreground">Líneas recibidas</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Recibida</TableHead>
              <TableHead className="text-right">Rechazada</TableHead>
              <TableHead className="text-right">Precio real</TableHead>
              <TableHead>Inspección</TableHead>
              <TableHead>Ubicación</TableHead>
              <TableHead className="text-right">Mov. stock</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rec.recepcion_lineas ?? []).map((rl) => (
              <TableRow key={rl.id}>
                <TableCell>
                  <div className="font-mono text-xs text-muted-foreground">
                    {rl.orden_compra_lineas?.items?.codigo_interno ?? "—"}
                  </div>
                  <div className="text-sm">{rl.orden_compra_lineas?.descripcion}</div>
                </TableCell>
                <TableCell className="text-right font-semibold">{Number(rl.cantidad_recibida)}</TableCell>
                <TableCell className="text-right">{Number(rl.cantidad_rechazada)}</TableCell>
                <TableCell className="text-right">{rl.precio_real ? fmtMoneda(rl.precio_real) : "—"}</TableCell>
                <TableCell>
                  <Badge className={rl.resultado_inspeccion === "aprobado" ? "bg-green-100 text-green-800" : rl.resultado_inspeccion === "rechazado" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}>
                    {rl.resultado_inspeccion}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">{rl.ubicaciones ? `${rl.ubicaciones.codigo}` : "—"}</TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  {rl.movimiento_stock_id ? `#${rl.movimiento_stock_id}` : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <KVRow label="Guía de remisión" value={rec.guia_remision_numero} />
        <KVRow label="Factura número" value={rec.factura_numero} />
        <KVRow label="Factura fecha" value={rec.factura_fecha ? new Date(rec.factura_fecha).toLocaleDateString() : null} />
        <KVRow label="Estado físico" value={rec.estado_general} />
        {rec.observaciones && <KVRow span={2} label="Observaciones" value={rec.observaciones} />}
      </div>
    </div>
  );
}

function KVRow({ label, value, span = 1 }: { label: string; value: React.ReactNode; span?: 1 | 2 }) {
  return (
    <div className={span === 2 ? "col-span-2 rounded-md border bg-white p-3" : "rounded-md border bg-white p-3"}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{value ?? "—"}</div>
    </div>
  );
}
