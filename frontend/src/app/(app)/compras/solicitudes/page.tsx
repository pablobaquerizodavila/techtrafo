"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import {
  ESTADO_SC_COLOR, ESTADO_SC_LABEL, EstadoSC, SolicitudCompra, listSolicitudesCompra,
  fmtMoneda, PRIORIDAD_LABEL,
} from "@/lib/compras";
import { ApiError } from "@/lib/api";

const ESTADOS_FILTER: Array<{ value: EstadoSC | "todas"; label: string }> = [
  { value: "todas", label: "Todas" },
  { value: "borrador", label: "Borrador" },
  { value: "enviada", label: "Pendiente aprobación" },
  { value: "aprobada", label: "Aprobadas" },
  { value: "convertida_en_oc", label: "Convertidas en OC" },
  { value: "rechazada", label: "Rechazadas" },
];

export default function SolicitudesCompraPage() {
  const sp = useSearchParams();
  const initialEstado = (sp.get("estado") as EstadoSC | null) ?? "todas";
  const [estado, setEstado] = useState<EstadoSC | "todas">(initialEstado);
  const [items, setItems] = useState<SolicitudCompra[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listSolicitudesCompra({ estado: estado === "todas" ? undefined : estado });
      setItems(res.data);
    } catch (err) {
      toast.error(err instanceof ApiError ? `Error ${err.status}` : "Error cargando solicitudes");
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
          <h1 className="text-2xl font-bold">Solicitudes de compra</h1>
          <p className="text-sm text-muted-foreground">
            Solicitudes internas pendientes y procesadas. Las SC se generan desde cotizaciones, alertas de stock o manualmente.
          </p>
        </div>
        <Link href="/compras" className="text-sm text-muted-foreground hover:underline">← Volver al dashboard</Link>
      </div>

      <div className="flex gap-2">
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
              <TableHead>Departamento</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead>Prioridad</TableHead>
              <TableHead>Solicitante</TableHead>
              <TableHead className="text-right">Total estimado</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Cargando…</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No hay solicitudes con ese filtro.</TableCell></TableRow>
            ) : (
              items.map((s) => (
                <TableRow key={s.id} className="hover:bg-muted/40">
                  <TableCell className="font-mono text-xs">
                    <Link href={`/compras/solicitudes/${s.id}`} className="text-blue-700 hover:underline">
                      {s.codigo}
                    </Link>
                  </TableCell>
                  <TableCell>{s.departamento_solicitante}</TableCell>
                  <TableCell><span className="text-xs text-muted-foreground">{s.origen}</span></TableCell>
                  <TableCell>{PRIORIDAD_LABEL[s.prioridad]}</TableCell>
                  <TableCell className="text-xs">{s.usuarios_solicitudes_solicitante_idTousuarios?.nombre_completo ?? "—"}</TableCell>
                  <TableCell className="text-right">{fmtMoneda(s.total_estimado, s.moneda)}</TableCell>
                  <TableCell className="text-xs">{new Date(s.fecha_solicitud).toLocaleDateString()}</TableCell>
                  <TableCell><Badge className={ESTADO_SC_COLOR[s.estado] ?? ""}>{ESTADO_SC_LABEL[s.estado] ?? s.estado}</Badge></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
