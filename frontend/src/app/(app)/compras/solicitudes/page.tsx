"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import { PageHeader, HeaderActionGhost } from "@/components/page-header";
import { Panel } from "@/components/panel";
import {
  ESTADO_SC_LABEL, EstadoSC, SolicitudCompra, listSolicitudesCompra,
  fmtMoneda, PRIORIDAD_LABEL,
} from "@/lib/compras";
import { ApiError } from "@/lib/api";

const SC_BADGE: Record<string, "default" | "muted" | "success" | "warning" | "destructive" | "teal"> = {
  borrador: "muted",
  enviada: "warning",
  aprobada: "success",
  convertida_en_oc: "teal",
  rechazada: "destructive",
};

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
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { href: "/compras", label: "Compras" }, { label: "Solicitudes" }]}
        title="Solicitudes"
        titleAccent="de compra"
        meta={<span>Generadas desde cotizaciones, alertas de stock o manualmente</span>}
        actions={<HeaderActionGhost href="/compras">← Dashboard</HeaderActionGhost>}
      />

      <div className="space-y-6 pt-6">
        {/* Filtros de pills */}
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
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Departamento</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Origen</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Prioridad</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Solicitante</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Total estimado</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Fecha</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Cargando…</TableCell></TableRow>
              ) : items.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="py-10 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <FileText className="h-5 w-5" />
                    <span className="text-sm">No hay solicitudes con ese filtro</span>
                  </div>
                </TableCell></TableRow>
              ) : (
                items.map((s) => (
                  <TableRow key={s.id} className="border-glass hover:bg-glass">
                    <TableCell className="font-mono text-xs">
                      <Link href={`/compras/solicitudes/${s.id}`} className="text-copper hover:underline">
                        {s.codigo}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{s.departamento_solicitante}</TableCell>
                    <TableCell className="font-mono text-[10.5px] text-muted-foreground">{s.origen}</TableCell>
                    <TableCell className="text-sm capitalize text-foreground/85">{PRIORIDAD_LABEL[s.prioridad]}</TableCell>
                    <TableCell className="text-xs text-foreground/85">{s.usuarios_solicitudes_solicitante_idTousuarios?.nombre_completo ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums text-foreground/90">{fmtMoneda(s.total_estimado, s.moneda)}</TableCell>
                    <TableCell className="font-mono text-xs text-foreground/80">{new Date(s.fecha_solicitud).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" })}</TableCell>
                    <TableCell><Badge variant={SC_BADGE[s.estado] ?? "muted"}>{ESTADO_SC_LABEL[s.estado] ?? s.estado}</Badge></TableCell>
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
