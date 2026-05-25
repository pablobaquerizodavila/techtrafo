"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import { listRecepciones, Recepcion } from "@/lib/compras";
import { ApiError } from "@/lib/api";

const ESTADO_COLOR: Record<string, string> = {
  borrador: "bg-gray-100 text-gray-700",
  confirmada: "bg-green-100 text-green-800",
  rechazada: "bg-red-100 text-red-800",
  anulada: "bg-rose-100 text-rose-800",
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
    <div className="space-y-6">
      <Toaster richColors />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Recepciones</h1>
          <p className="text-sm text-muted-foreground">
            Las recepciones se crean desde una OC. Al confirmarlas, el material entra a bodega y se actualiza el costo del item si difiere.
          </p>
        </div>
        <Link href="/compras" className="text-sm text-muted-foreground hover:underline">← Volver al dashboard</Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {["todas", "borrador", "confirmada", "anulada"].map((e) => (
          <button
            key={e}
            onClick={() => setEstado(e)}
            className={`rounded-md border px-3 py-1.5 text-sm transition ${
              estado === e ? "border-blue-500 bg-blue-50 text-blue-700" : "bg-white hover:bg-muted/30"
            }`}
          >
            {e === "todas" ? "Todas" : e}
          </button>
        ))}
      </div>

      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>OC</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Guía remisión</TableHead>
              <TableHead>Factura</TableHead>
              <TableHead>Líneas</TableHead>
              <TableHead>Estado general</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Cargando…</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No hay recepciones con ese filtro.</TableCell></TableRow>
            ) : (
              items.map((r) => (
                <TableRow key={r.id} className="hover:bg-muted/40">
                  <TableCell className="font-mono text-xs">
                    <Link className="text-blue-700 hover:underline" href={`/compras/recepciones/${r.id}`}>{r.codigo}</Link>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.ordenes_compra && (
                      <Link className="text-blue-700 hover:underline" href={`/compras/ordenes-compra/${r.ordenes_compra.id}`}>{r.ordenes_compra.codigo}</Link>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{new Date(r.fecha_recepcion).toLocaleString()}</TableCell>
                  <TableCell className="text-xs">{r.guia_remision_numero ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.factura_numero ?? "—"}</TableCell>
                  <TableCell className="text-right text-xs">{r._count?.recepcion_lineas ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.estado_general}</TableCell>
                  <TableCell><Badge className={ESTADO_COLOR[r.estado] ?? ""}>{r.estado}</Badge></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
