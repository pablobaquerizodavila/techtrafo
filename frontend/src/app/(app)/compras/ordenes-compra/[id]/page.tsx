"use client";

import { useEffect, useState, useCallback, use as usePromise } from "react";
import Link from "next/link";
import { ChevronLeft, Send, Check, X, Truck, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import {
  aprobarOC, cancelarOC, confirmarOC, enviarOC, ESTADO_OC_COLOR, ESTADO_OC_LABEL,
  fmtMoneda, getOrdenCompra, OrdenCompra, rechazarOC, solicitarAprobacionOC,
} from "@/lib/compras";
import { ApiError } from "@/lib/api";

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
    try {
      const res = await getOrdenCompra(ocId);
      setOc(res.data);
    } catch (err) {
      toast.error(err instanceof ApiError ? `Error ${err.status}` : "Error cargando OC");
    } finally {
      setLoading(false);
    }
  }, [ocId]);

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

  if (loading || !oc) return <div className="p-8 text-muted-foreground">Cargando…</div>;

  const cantidadRecibida = (oc.orden_compra_lineas ?? []).reduce(
    (acc, l) => acc + Number(l.cantidad_recibida ?? 0), 0,
  );
  const cantidadTotal = (oc.orden_compra_lineas ?? []).reduce(
    (acc, l) => acc + Number(l.cantidad_solicitada), 0,
  );
  const progresoRecepcion = cantidadTotal > 0 ? (cantidadRecibida / cantidadTotal) * 100 : 0;

  return (
    <div className="max-w-5xl space-y-6">
      <Toaster richColors />
      <Link href="/compras/ordenes-compra" className="inline-flex items-center text-sm text-muted-foreground hover:underline">
        <ChevronLeft className="mr-1 h-4 w-4" /> Volver
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <div className="font-mono text-xs text-muted-foreground">{oc.codigo}</div>
          <h1 className="text-2xl font-bold">{oc.proveedores?.razon_social}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <Badge className={ESTADO_OC_COLOR[oc.estado] ?? ""}>{ESTADO_OC_LABEL[oc.estado] ?? oc.estado}</Badge>
            {oc.roles && <span className="text-muted-foreground">Aprobador requerido: {oc.roles.nombre}</span>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Total</div>
          <div className="text-3xl font-bold">{fmtMoneda(oc.total, oc.moneda)}</div>
          <div className="text-xs text-muted-foreground">
            Subtotal {fmtMoneda(oc.subtotal, oc.moneda)} · IVA {Number(oc.iva_porcentaje)}%
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(oc.estado === "borrador" || oc.estado === "rechazada") && (
          <Button onClick={() => action(() => solicitarAprobacionOC(ocId), "OC en revisión")} disabled={busy}>
            <Send className="mr-2 h-4 w-4" /> Solicitar aprobación
          </Button>
        )}
        {(oc.estado === "en_revision" || oc.estado === "borrador") && (
          <>
            <Button onClick={() => action(() => aprobarOC(ocId), "OC aprobada")} disabled={busy}>
              <Check className="mr-2 h-4 w-4" /> Aprobar
            </Button>
            <Button variant="outline" onClick={() => setShowRechazo((s) => !s)} disabled={busy}>
              <X className="mr-2 h-4 w-4" /> Rechazar
            </Button>
          </>
        )}
        {oc.estado === "aprobada" && (
          <Button onClick={() => action(() => enviarOC(ocId), "OC enviada al proveedor")} disabled={busy}>
            <Truck className="mr-2 h-4 w-4" /> Marcar como enviada
          </Button>
        )}
        {oc.estado === "enviada" && (
          <Button onClick={() => setShowConfirmar((s) => !s)} disabled={busy}>
            <Check className="mr-2 h-4 w-4" /> Confirmar disponibilidad proveedor
          </Button>
        )}
        {["confirmada", "enviada", "recibida_parcial"].includes(oc.estado) && (
          <Link href={`/compras/recepciones/nueva?oc=${oc.id}`}>
            <Button variant="default" disabled={busy}>
              <PackageCheck className="mr-2 h-4 w-4" /> Registrar recepción
            </Button>
          </Link>
        )}
        {!["recibida_total", "cerrada", "cancelada"].includes(oc.estado) && (
          <Button variant="outline" onClick={() => action(() => cancelarOC(ocId), "OC cancelada")} disabled={busy}>
            Cancelar OC
          </Button>
        )}
      </div>

      {showRechazo && (
        <div className="rounded-md border bg-amber-50/40 p-4">
          <Label>Motivo del rechazo</Label>
          <Input value={motivoRechazo} onChange={(e) => setMotivoRechazo(e.target.value)} className="mt-2" />
          <div className="mt-3 flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={motivoRechazo.length < 2 || busy}
              onClick={() => action(() => rechazarOC(ocId, motivoRechazo), "OC rechazada")}
            >Confirmar rechazo</Button>
            <Button variant="outline" size="sm" onClick={() => setShowRechazo(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {showConfirmar && (
        <div className="rounded-md border bg-blue-50/40 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Fecha confirmación proveedor</Label>
              <Input type="date" value={fechaConfirm} onChange={(e) => setFechaConfirm(e.target.value)} />
            </div>
            <div>
              <Label>Fecha entrega acordada</Label>
              <Input type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              onClick={() => action(
                () => confirmarOC(ocId, {
                  fecha_confirmacion_proveedor: fechaConfirm || undefined,
                  fecha_entrega_acordada: fechaEntrega || undefined,
                }),
                "Confirmación registrada",
              )}
              disabled={busy}
            >Confirmar</Button>
            <Button variant="outline" size="sm" onClick={() => setShowConfirmar(false)}>Cerrar</Button>
          </div>
        </div>
      )}

      {oc.motivo_rechazo && (
        <div className="rounded-md border border-red-200 bg-red-50/60 p-4 text-sm">
          <strong>Rechazo:</strong> {oc.motivo_rechazo}
        </div>
      )}

      <section className="rounded-md border bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Líneas de la orden</h2>
          {cantidadTotal > 0 && (
            <span className="text-xs text-muted-foreground">
              Recepción: {progresoRecepcion.toFixed(0)}% ({cantidadRecibida} / {cantidadTotal})
            </span>
          )}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="text-right">Cant.</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead className="text-right">Recibido</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(oc.orden_compra_lineas ?? []).map((l) => (
              <TableRow key={l.id}>
                <TableCell>{l.orden}</TableCell>
                <TableCell className="font-mono text-xs">{l.items?.codigo_interno ?? "—"}</TableCell>
                <TableCell>{l.descripcion}</TableCell>
                <TableCell className="text-right">{Number(l.cantidad_solicitada)} {l.unidad_medida}</TableCell>
                <TableCell className="text-right">{fmtMoneda(l.precio_unitario, oc.moneda)}</TableCell>
                <TableCell className="text-right font-semibold">{fmtMoneda(l.subtotal, oc.moneda)}</TableCell>
                <TableCell className="text-right">{Number(l.cantidad_recibida ?? 0)}</TableCell>
                <TableCell><span className="text-xs">{l.estado_linea}</span></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <KVRow label="Solicitud origen" value={
          oc.solicitudes_ordenes_compra_solicitud_idTosolicitudes
            ? <Link href={`/compras/solicitudes/${oc.solicitudes_ordenes_compra_solicitud_idTosolicitudes.id}`} className="text-blue-700 hover:underline">{oc.solicitudes_ordenes_compra_solicitud_idTosolicitudes.codigo}</Link>
            : "—"
        } />
        <KVRow label="Expediente" value={
          oc.expedientes
            ? <Link href={`/expedientes/${oc.expedientes.id}`} className="text-blue-700 hover:underline">{oc.expedientes.codigo}</Link>
            : "—"
        } />
        <KVRow label="Condiciones de pago" value={oc.condiciones_pago} />
        <KVRow label="Incoterm" value={oc.incoterm} />
        <KVRow label="Lugar entrega" value={oc.lugar_entrega} />
        <KVRow label="Fecha confirmación" value={oc.fecha_confirmacion_proveedor ? new Date(oc.fecha_confirmacion_proveedor).toLocaleDateString() : "—"} />
        <KVRow label="Fecha entrega real" value={oc.fecha_entrega_real ? new Date(oc.fecha_entrega_real).toLocaleDateString() : "—"} />
        <KVRow label="Aprobador" value={oc.usuarios_ordenes_compra_aprobador_idTousuarios?.nombre_completo} />
        {oc.observaciones_internas && <KVRow span={2} label="Notas internas" value={oc.observaciones_internas} />}
        {oc.observaciones_proveedor && <KVRow span={2} label="Notas al proveedor" value={oc.observaciones_proveedor} />}
      </div>

      {(oc.recepciones ?? []).length > 0 && (
        <section className="rounded-md border bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase text-muted-foreground">Recepciones de esta OC</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Estado general</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(oc.recepciones ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">
                    <Link href={`/compras/recepciones/${r.id}`} className="text-blue-700 hover:underline">{r.codigo}</Link>
                  </TableCell>
                  <TableCell className="text-xs">{new Date(r.fecha_recepcion).toLocaleString()}</TableCell>
                  <TableCell><Badge>{r.estado}</Badge></TableCell>
                  <TableCell className="text-xs">{r.estado_general}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
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
