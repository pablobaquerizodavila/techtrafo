"use client";

import { useEffect, useState, useCallback, use as usePromise } from "react";
import Link from "next/link";
import { ChevronLeft, Send, Check, X, ArrowRight, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PageHeader, HeaderActionGhost } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import {
  aprobarSolicitud, cancelarSolicitud, convertirSolicitudEnOC, enviarSolicitud,
  ESTADO_SC_LABEL, fmtMoneda, getSolicitudCompra,
  listProveedores, Proveedor, rechazarSolicitud, SolicitudCompra,
} from "@/lib/compras";

const SC_BADGE: Record<string, "default" | "muted" | "success" | "warning" | "destructive" | "teal"> = {
  borrador: "muted",
  enviada: "warning",
  aprobada: "success",
  convertida_en_oc: "teal",
  rechazada: "destructive",
  cancelada: "muted",
};

function actionClass(tone: "primary" | "ghost" | "destructive") {
  return tone === "primary"
    ? "inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-3.5 py-2 text-xs font-medium text-white glow-copper-sm inset-highlight-md transition hover:glow-copper disabled:opacity-60"
    : tone === "destructive"
    ? "inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs font-medium text-rose-300 transition hover:bg-rose-500/15 disabled:opacity-60"
    : "inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-3.5 py-2 text-xs font-medium text-foreground/90 transition hover:border-glass-strong hover:bg-glass-elev disabled:opacity-60";
}
import { ApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SolicitudCompraDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const scId = Number(id);
  const [sc, setSc] = useState<SolicitudCompra | null>(null);
  const [loading, setLoading] = useState(true);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState<number | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [showRechazo, setShowRechazo] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSolicitudCompra(scId);
      setSc(res.data);
    } catch (err) {
      toast.error(err instanceof ApiError ? `Error ${err.status}` : "Error cargando SC");
    } finally {
      setLoading(false);
    }
  }, [scId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { listProveedores({ estado: "activo" }).then((r) => setProveedores(r.data)).catch(() => {}); }, []);

  async function action(fn: () => Promise<unknown>, okMsg: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(okMsg);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !sc) {
    return (
      <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-copper border-t-transparent" />
          <span className="text-sm">Cargando solicitud…</span>
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
          { href: "/compras/solicitudes", label: "Solicitudes" },
          { label: sc.codigo },
        ]}
        title={sc.codigo}
        titleAccent="solicitud"
        meta={
          <>
            <Badge variant={SC_BADGE[sc.estado] ?? "muted"}>{ESTADO_SC_LABEL[sc.estado] ?? sc.estado}</Badge>
            <span className="text-muted-foreground/40">·</span>
            <span>{sc.departamento_solicitante}</span>
            <span className="text-muted-foreground/40">·</span>
            <span>prioridad {sc.prioridad}</span>
            <span className="text-muted-foreground/40">·</span>
            <span>origen {sc.origen}</span>
          </>
        }
        actions={<HeaderActionGhost href="/compras/solicitudes" icon={<ChevronLeft className="h-3.5 w-3.5" />}>Volver</HeaderActionGhost>}
      />

      <div className="space-y-6 pt-6">
        {/* Total destacado */}
        <Panel title="Total estimado" subtitle="Suma de las líneas solicitadas">
          <p className="font-display text-4xl font-semibold tabular-nums tracking-tight text-copper text-glow-copper">
            {fmtMoneda(sc.total_estimado, sc.moneda)}
          </p>
        </Panel>

        {/* Acciones */}
        {(sc.estado !== "convertida_en_oc" && sc.estado !== "cancelada") || sc.orden_compra_id ? (
          <Panel title="Acciones disponibles" subtitle="Transiciones de estado">
            <div className="flex flex-wrap items-end gap-2">
              {sc.estado === "borrador" && (
                <button type="button" onClick={() => action(() => enviarSolicitud(scId), "Solicitud enviada para aprobación")} disabled={busy} className={actionClass("primary")}>
                  <Send className="h-3.5 w-3.5" /> Enviar para aprobación
                </button>
              )}
              {sc.estado === "enviada" && (
                <>
                  <button type="button" onClick={() => action(() => aprobarSolicitud(scId), "Solicitud aprobada")} disabled={busy} className={actionClass("primary")}>
                    <Check className="h-3.5 w-3.5" /> Aprobar
                  </button>
                  <button type="button" onClick={() => setShowRechazo((s) => !s)} disabled={busy} className={actionClass("destructive")}>
                    <X className="h-3.5 w-3.5" /> Rechazar
                  </button>
                </>
              )}
              {sc.estado === "aprobada" && (
                <div className="flex flex-1 items-end gap-3">
                  <div className="flex-1 max-w-md">
                    <Label className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">Convertir en OC · proveedor</Label>
                    <Select value={proveedorSeleccionado?.toString() ?? ""} onValueChange={(v) => setProveedorSeleccionado(v ? Number(v) : null)}>
                      <SelectTrigger className="mt-1 h-10 border-glass bg-glass"><SelectValue placeholder="Seleccionar proveedor…" /></SelectTrigger>
                      <SelectContent>
                        {proveedores.map((p) => (
                          <SelectItem key={p.id} value={p.id.toString()}>{p.codigo} — {p.razon_social}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <button type="button" disabled={!proveedorSeleccionado || busy}
                    onClick={() => action(() => convertirSolicitudEnOC(scId, proveedorSeleccionado!), "Orden de compra generada")}
                    className={actionClass("primary")}>
                    <ArrowRight className="h-3.5 w-3.5" /> Convertir en OC
                  </button>
                </div>
              )}
              {!["convertida_en_oc", "cancelada"].includes(sc.estado) && (
                <button type="button" onClick={() => action(() => cancelarSolicitud(scId), "Solicitud cancelada")} disabled={busy} className={actionClass("ghost")}>
                  Cancelar
                </button>
              )}
              {sc.orden_compra_id && (
                <Link href={`/compras/ordenes-compra/${sc.orden_compra_id}`} className={actionClass("ghost")}>
                  Ver OC generada →
                </Link>
              )}
            </div>
          </Panel>
        ) : null}

        {showRechazo && sc.estado === "enviada" && (
          <Panel title="Motivo del rechazo" subtitle="Será visible al solicitante">
            <Input value={motivoRechazo} onChange={(e) => setMotivoRechazo(e.target.value)} className="border-glass bg-glass" />
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={motivoRechazo.length < 2 || busy}
                onClick={() => action(() => rechazarSolicitud(scId, motivoRechazo), "Solicitud rechazada")}
                className={actionClass("destructive")}>
                Confirmar rechazo
              </button>
              <button type="button" onClick={() => setShowRechazo(false)} className={actionClass("ghost")}>
                Cancelar
              </button>
            </div>
          </Panel>
        )}

        {sc.motivo_rechazo && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.06] px-4 py-3 text-sm inset-highlight">
            <strong className="text-rose-300">Rechazo:</strong> <span className="text-foreground/85">{sc.motivo_rechazo}</span>
          </div>
        )}

        {/* Líneas */}
        <Panel title="Líneas solicitadas" subtitle={`${(sc.solicitud_lineas ?? []).length} ítems`} icon={<FileText className="h-3.5 w-3.5" />} padded={false}>
          <Table>
            <TableHeader>
              <TableRow className="border-glass bg-glass hover:bg-glass">
                <TableHead className="w-12 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">#</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Item</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Descripción</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Cantidad</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Precio ref.</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Proveedor sugerido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(sc.solicitud_lineas ?? []).map((l) => (
                <TableRow key={l.id} className="border-glass hover:bg-glass">
                  <TableCell className="font-mono text-xs text-muted-foreground">{l.orden}</TableCell>
                  <TableCell className="font-mono text-xs text-copper">{l.items?.codigo_interno ?? "—"}</TableCell>
                  <TableCell className="text-sm">{l.descripcion}</TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">{Number(l.cantidad_solicitada)} <span className="text-[10px] text-muted-foreground">{l.unidad_medida}</span></TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">{fmtMoneda(l.precio_referencial, l.moneda)}</TableCell>
                  <TableCell className="text-xs text-foreground/85">{l.proveedores?.razon_social ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>

        {/* Datos del proceso */}
        <Panel title="Datos del proceso" subtitle="Solicitante, fechas, justificación">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm md:grid-cols-2 lg:grid-cols-4">
            <KVPair label="Solicitante" value={sc.usuarios_solicitudes_solicitante_idTousuarios?.nombre_completo} />
            <KVPair label="Fecha solicitud" value={new Date(sc.fecha_solicitud).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" })} mono />
            <KVPair label="Fecha requerida" value={sc.fecha_requerida ? new Date(sc.fecha_requerida).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" }) : "—"} mono />
            <KVPair label="Aprobador" value={sc.usuarios_solicitudes_aprobador_idTousuarios?.nombre_completo} />
            {sc.justificacion && <KVPair label="Justificación" value={sc.justificacion} full />}
            {sc.observaciones && <KVPair label="Observaciones" value={sc.observaciones} full />}
            {sc.cotizaciones && (
              <KVPair label="Cotización origen" value={
                <Link className="font-mono text-copper hover:underline" href={`/cotizaciones/${sc.cotizaciones.id}`}>{sc.cotizaciones.codigo}</Link>
              } />
            )}
            {sc.expedientes && (
              <KVPair label="Expediente" value={
                <Link className="font-mono text-copper hover:underline" href={`/expedientes/${sc.expedientes.id}`}>{sc.expedientes.codigo}</Link>
              } />
            )}
          </dl>
        </Panel>
      </div>

      <Toaster richColors theme="dark" />
    </div>
  );
}

function KVPair({ label, value, full, mono }: { label: string; value: React.ReactNode; full?: boolean; mono?: boolean }) {
  return (
    <div className={full ? "md:col-span-2 lg:col-span-4" : ""}>
      <dt className="mb-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`text-sm text-foreground/90 ${mono ? "font-mono" : ""}`}>{value ?? "—"}</dd>
    </div>
  );
}
