"use client";

import { useEffect, useState, useCallback, use as usePromise } from "react";
import Link from "next/link";
import { ChevronLeft, Send, Check, X, Truck, PackageCheck, ShoppingCart } from "lucide-react";
import { PdfButton } from "../../../pdf-button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import { PageHeader, HeaderActionGhost } from "@/components/page-header";
import { Panel } from "@/components/panel";
import {
  aprobarOC, cancelarOC, confirmarOC, enviarOC, ESTADO_OC_LABEL,
  fmtMoneda, getOrdenCompra, OrdenCompra, rechazarOC, solicitarAprobacionOC,
} from "@/lib/compras";
import { ApiError } from "@/lib/api";

const OC_BADGE: Record<string, "default" | "muted" | "success" | "warning" | "destructive" | "teal" | "copper"> = {
  borrador: "muted", en_revision: "warning", aprobada: "copper", enviada: "teal",
  confirmada: "teal", recibida_parcial: "warning", recibida_total: "success",
  cerrada: "muted", cancelada: "destructive", rechazada: "destructive",
};

function actionClass(tone: "primary" | "ghost" | "destructive") {
  return tone === "primary"
    ? "inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-3.5 py-2 text-xs font-medium text-white glow-copper-sm inset-highlight-md transition hover:glow-copper disabled:opacity-60"
    : tone === "destructive"
    ? "inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs font-medium text-rose-300 transition hover:bg-rose-500/15 disabled:opacity-60"
    : "inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-3.5 py-2 text-xs font-medium text-foreground/90 transition hover:border-glass-strong hover:bg-glass-elev disabled:opacity-60";
}

export default function OCDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const ocId = Number(id);
  const [oc, setOc] = useState<OrdenCompra | null>(null);
  const [loading, setLoading] = useState(true);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [showRechazo, setShowRechazo] = useState(false);
  const [showConfirmar, setShowConfirmar] = useState(false);
  const [fechaConfirm, setFechaConfirm] = useState("");
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await getOrdenCompra(ocId); setOc(res.data); }
    catch (err) { toast.error(err instanceof ApiError ? `Error ${err.status}` : "Error cargando OC"); }
    finally { setLoading(false); }
  }, [ocId]);

  useEffect(() => { load(); }, [load]);

  async function action(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); toast.success(ok); await load(); }
    catch (err) { toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error"); }
    finally { setBusy(false); }
  }

  if (loading || !oc) {
    return (
      <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-copper border-t-transparent" />
          <span className="text-sm">Cargando orden de compra…</span>
        </div>
      </div>
    );
  }

  const cantidadRecibida = (oc.orden_compra_lineas ?? []).reduce((acc, l) => acc + Number(l.cantidad_recibida ?? 0), 0);
  const cantidadTotal = (oc.orden_compra_lineas ?? []).reduce((acc, l) => acc + Number(l.cantidad_solicitada), 0);
  const progresoRecepcion = cantidadTotal > 0 ? (cantidadRecibida / cantidadTotal) * 100 : 0;

  return (
    <div>
      <PageHeader
        breadcrumb={[
          { href: "/dashboard", label: "Panel" },
          { href: "/compras", label: "Compras" },
          { href: "/compras/ordenes-compra", label: "OCs" },
          { label: oc.codigo },
        ]}
        title={oc.codigo}
        titleAccent={oc.proveedores?.razon_social ?? ""}
        meta={
          <>
            <Badge variant={OC_BADGE[oc.estado] ?? "muted"}>{ESTADO_OC_LABEL[oc.estado] ?? oc.estado}</Badge>
            {oc.roles && (<><span className="text-muted-foreground/40">·</span><span>Aprobador: {oc.roles.nombre}</span></>)}
          </>
        }
        actions={<HeaderActionGhost href="/compras/ordenes-compra" icon={<ChevronLeft className="h-3.5 w-3.5" />}>Volver</HeaderActionGhost>}
      />

      <div className="space-y-6 pt-6">
        {/* Total */}
        <Panel title="Total de la orden" subtitle={`Subtotal ${fmtMoneda(oc.subtotal, oc.moneda)} · IVA ${Number(oc.iva_porcentaje)}%`} icon={<ShoppingCart className="h-3.5 w-3.5" />}>
          <p className="font-display text-4xl font-semibold tabular-nums tracking-tight text-copper text-glow-copper">
            {fmtMoneda(oc.total, oc.moneda)}
          </p>
        </Panel>

        {/* Acciones */}
        <Panel title="Acciones disponibles" subtitle="Transiciones de estado">
          <div className="flex flex-wrap gap-2">
            {(oc.estado === "borrador" || oc.estado === "rechazada") && (
              <button type="button" onClick={() => action(() => solicitarAprobacionOC(ocId), "OC en revisión")} disabled={busy} className={actionClass("primary")}>
                <Send className="h-3.5 w-3.5" /> Solicitar aprobación
              </button>
            )}
            {(oc.estado === "en_revision" || oc.estado === "borrador") && (
              <>
                <button type="button" onClick={() => action(() => aprobarOC(ocId), "OC aprobada")} disabled={busy} className={actionClass("primary")}>
                  <Check className="h-3.5 w-3.5" /> Aprobar
                </button>
                <button type="button" onClick={() => setShowRechazo((s) => !s)} disabled={busy} className={actionClass("destructive")}>
                  <X className="h-3.5 w-3.5" /> Rechazar
                </button>
              </>
            )}
            {oc.estado === "aprobada" && (
              <button type="button" onClick={() => action(() => enviarOC(ocId), "OC enviada al proveedor")} disabled={busy} className={actionClass("primary")}>
                <Truck className="h-3.5 w-3.5" /> Marcar como enviada
              </button>
            )}
            {oc.estado === "enviada" && (
              <button type="button" onClick={() => setShowConfirmar((s) => !s)} disabled={busy} className={actionClass("primary")}>
                <Check className="h-3.5 w-3.5" /> Confirmar disponibilidad
              </button>
            )}
            {["confirmada", "enviada", "recibida_parcial"].includes(oc.estado) && (
              <Link href={`/compras/recepciones/nueva?oc=${oc.id}`} className={actionClass("primary")}>
                <PackageCheck className="h-3.5 w-3.5" /> Registrar recepción
              </Link>
            )}
            <PdfButton recurso="orden-compra" id={ocId} label="Descargar PDF" maxNivel={3} />

            {!["recibida_total", "cerrada", "cancelada"].includes(oc.estado) && (
              <button type="button" onClick={() => action(() => cancelarOC(ocId), "OC cancelada")} disabled={busy} className={actionClass("ghost")}>
                Cancelar OC
              </button>
            )}
          </div>
        </Panel>

        {showRechazo && (
          <Panel title="Motivo del rechazo">
            <Input value={motivoRechazo} onChange={(e) => setMotivoRechazo(e.target.value)} className="border-glass bg-glass" />
            <div className="mt-3 flex gap-2">
              <button type="button" disabled={motivoRechazo.length < 2 || busy} onClick={() => action(() => rechazarOC(ocId, motivoRechazo), "OC rechazada")} className={actionClass("destructive")}>
                Confirmar rechazo
              </button>
              <button type="button" onClick={() => setShowRechazo(false)} className={actionClass("ghost")}>Cancelar</button>
            </div>
          </Panel>
        )}

        {showConfirmar && (
          <Panel title="Confirmación del proveedor" subtitle="Fechas acordadas">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">Fecha confirmación</Label>
                <Input type="date" value={fechaConfirm} onChange={(e) => setFechaConfirm(e.target.value)} className="h-10 border-glass bg-glass" />
              </div>
              <div className="space-y-1.5">
                <Label className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">Fecha entrega acordada</Label>
                <Input type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} className="h-10 border-glass bg-glass" />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" disabled={busy}
                onClick={() => action(() => confirmarOC(ocId, { fecha_confirmacion_proveedor: fechaConfirm || undefined, fecha_entrega_acordada: fechaEntrega || undefined }), "Confirmación registrada")}
                className={actionClass("primary")}>Confirmar</button>
              <button type="button" onClick={() => setShowConfirmar(false)} className={actionClass("ghost")}>Cerrar</button>
            </div>
          </Panel>
        )}

        {oc.motivo_rechazo && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.06] px-4 py-3 text-sm inset-highlight">
            <strong className="text-rose-300">Rechazo:</strong> <span className="text-foreground/85">{oc.motivo_rechazo}</span>
          </div>
        )}

        {/* Líneas */}
        <Panel
          title="Líneas de la orden"
          subtitle={cantidadTotal > 0 ? `Recepción ${progresoRecepcion.toFixed(0)}% · ${cantidadRecibida} de ${cantidadTotal}` : undefined}
          padded={false}
          action={cantidadTotal > 0 && (
            <div className="w-32">
              <div className="h-1.5 overflow-hidden rounded-full bg-glass-elev">
                <div className={`h-full rounded-full ${progresoRecepcion >= 100 ? "bg-green-500" : progresoRecepcion > 0 ? "bg-copper" : "bg-muted-foreground/40"}`} style={{ width: `${progresoRecepcion}%` }} />
              </div>
            </div>
          )}
        >
          <Table>
            <TableHeader>
              <TableRow className="border-glass bg-glass hover:bg-glass">
                <TableHead className="w-12 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">#</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Item</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Descripción</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Cant.</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Precio</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Subtotal</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Recibido</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(oc.orden_compra_lineas ?? []).map((l) => (
                <TableRow key={l.id} className="border-glass hover:bg-glass">
                  <TableCell className="font-mono text-xs text-muted-foreground">{l.orden}</TableCell>
                  <TableCell className="font-mono text-xs text-copper">{l.items?.codigo_interno ?? "—"}</TableCell>
                  <TableCell className="text-sm">{l.descripcion}</TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">{Number(l.cantidad_solicitada)} <span className="text-[10px] text-muted-foreground">{l.unidad_medida}</span></TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">{fmtMoneda(l.precio_unitario, oc.moneda)}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold tabular-nums text-copper">{fmtMoneda(l.subtotal, oc.moneda)}</TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums text-green-300">{Number(l.cantidad_recibida ?? 0)}</TableCell>
                  <TableCell><span className="font-mono text-[10.5px] capitalize text-muted-foreground">{l.estado_linea}</span></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>

        {/* Metadatos */}
        <Panel title="Datos del proceso">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm md:grid-cols-2 lg:grid-cols-3">
            <KVPair label="Solicitud origen" value={
              oc.solicitudes_ordenes_compra_solicitud_idTosolicitudes
                ? <Link href={`/compras/solicitudes/${oc.solicitudes_ordenes_compra_solicitud_idTosolicitudes.id}`} className="font-mono text-copper hover:underline">{oc.solicitudes_ordenes_compra_solicitud_idTosolicitudes.codigo}</Link>
                : "—"
            } />
            <KVPair label="Expediente" value={
              oc.expedientes
                ? <Link href={`/expedientes/${oc.expedientes.id}`} className="font-mono text-copper hover:underline">{oc.expedientes.codigo}</Link>
                : "—"
            } />
            <KVPair label="Aprobador" value={oc.usuarios_ordenes_compra_aprobador_idTousuarios?.nombre_completo} />
            <KVPair label="Condiciones de pago" value={oc.condiciones_pago} />
            <KVPair label="Incoterm" value={oc.incoterm} />
            <KVPair label="Lugar entrega" value={oc.lugar_entrega} />
            <KVPair label="Fecha confirmación" value={oc.fecha_confirmacion_proveedor ? new Date(oc.fecha_confirmacion_proveedor).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" }) : "—"} mono />
            <KVPair label="Fecha entrega real" value={oc.fecha_entrega_real ? new Date(oc.fecha_entrega_real).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" }) : "—"} mono />
            {oc.observaciones_internas && <KVPair label="Notas internas" value={oc.observaciones_internas} full />}
            {oc.observaciones_proveedor && <KVPair label="Notas al proveedor" value={oc.observaciones_proveedor} full />}
          </dl>
        </Panel>

        {(oc.recepciones ?? []).length > 0 && (
          <Panel title="Recepciones de esta OC" icon={<PackageCheck className="h-3.5 w-3.5" />} padded={false}>
            <Table>
              <TableHeader>
                <TableRow className="border-glass bg-glass hover:bg-glass">
                  <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Código</TableHead>
                  <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Fecha</TableHead>
                  <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Estado</TableHead>
                  <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Estado general</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(oc.recepciones ?? []).map((r) => (
                  <TableRow key={r.id} className="border-glass hover:bg-glass">
                    <TableCell className="font-mono text-xs">
                      <Link href={`/compras/recepciones/${r.id}`} className="text-copper hover:underline">{r.codigo}</Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-foreground/80">{new Date(r.fecha_recepcion).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}</TableCell>
                    <TableCell><Badge variant={r.estado === "confirmada" ? "success" : "muted"}>{r.estado}</Badge></TableCell>
                    <TableCell className="text-xs capitalize text-foreground/80">{r.estado_general}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        )}
      </div>

      <Toaster richColors theme="dark" />
    </div>
  );
}

function KVPair({ label, value, full, mono }: { label: string; value: React.ReactNode; full?: boolean; mono?: boolean }) {
  return (
    <div className={full ? "md:col-span-2 lg:col-span-3" : ""}>
      <dt className="mb-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`text-sm text-foreground/90 ${mono ? "font-mono" : ""}`}>{value ?? "—"}</dd>
    </div>
  );
}
