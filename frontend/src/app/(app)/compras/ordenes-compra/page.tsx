"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import {
  ESTADO_OC_COLOR, ESTADO_OC_LABEL, EstadoOC, OrdenCompra, listOrdenesCompra, fmtMoneda,
} from "@/lib/compras";
import { ApiError } from "@/lib/api";

const ESTADOS_FILTER: Array<{ value: EstadoOC | "todas"; label: string }> = [
  { value: "todas", label: "Todas" },
  { value: "en_revision", label: "En revisión" },
  { value: "aprobada", label: "Aprobadas (por enviar)" },
  { value: "enviada", label: "Enviadas" },
  { value: "confirmada", label: "Confirmadas" },
  { value: "recibida_parcial", label: "Recepción parcial" },
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
    <div className="space-y-6">
      <Toaster richColors />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Órdenes de compra</h1>
          <p className="text-sm text-muted-foreground">
            Las OCs se generan desde solicitudes aprobadas. La aprobación es escalonada por monto.
          </p>
        </div>
        <Link href="/compras" className="text-sm text-muted-foreground hover:underline">← Volver al dashboard</Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {ESTADOS_FILTER.map((f) => (
          <button
            key={f.value}
            onClick={() => setEstado(f.value)}
            className={`rounded-md border px-3 py-1.5 text-sm transition ${
              estado === f.value ? "border-blue-500 bg-blue-50 text-blue-700" : "bg-white hover:bg-muted/30"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Aprobador requerido</TableHead>
              <TableHead>Fecha emisión</TableHead>
              <TableHead>Entrega acordada</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Cargando…</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No hay OCs con ese filtro.</TableCell></TableRow>
            ) : (
              items.map((oc) => (
                <TableRow key={oc.id} className="hover:bg-muted/40">
                  <TableCell className="font-mono text-xs">
                    <Link className="text-blue-700 hover:underline" href={`/compras/ordenes-compra/${oc.id}`}>{oc.codigo}</Link>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{oc.proveedores?.razon_social ?? "—"}</div>
                    <div className="font-mono text-xs text-muted-foreground">{oc.proveedores?.codigo}</div>
                  </TableCell>
                  <TableCell className="text-right font-semibold">{fmtMoneda(oc.total, oc.moneda)}</TableCell>
                  <TableCell className="text-xs">{oc.roles?.nombre ?? "—"}</TableCell>
                  <TableCell className="text-xs">{new Date(oc.fecha_emision).toLocaleDateString()}</TableCell>
                  <TableCell className="text-xs">
                    {oc.fecha_entrega_acordada ? new Date(oc.fecha_entrega_acordada).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell><Badge className={ESTADO_OC_COLOR[oc.estado] ?? ""}>{ESTADO_OC_LABEL[oc.estado] ?? oc.estado}</Badge></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
