"use client";

import { useEffect, useState, useCallback, use as usePromise } from "react";
import Link from "next/link";
import { ChevronLeft, Send, Check, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import {
  aprobarSolicitud, cancelarSolicitud, convertirSolicitudEnOC, enviarSolicitud,
  ESTADO_SC_COLOR, ESTADO_SC_LABEL, fmtMoneda, getSolicitudCompra,
  listProveedores, Proveedor, rechazarSolicitud, SolicitudCompra,
} from "@/lib/compras";
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

  if (loading || !sc) return <div className="p-8 text-muted-foreground">Cargando…</div>;

  return (
    <div className="max-w-4xl space-y-6">
      <Toaster richColors />
      <Link href="/compras/solicitudes" className="inline-flex items-center text-sm text-muted-foreground hover:underline">
        <ChevronLeft className="mr-1 h-4 w-4" /> Volver
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <div className="font-mono text-xs text-muted-foreground">{sc.codigo}</div>
          <h1 className="text-2xl font-bold">Solicitud de compra</h1>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <Badge className={ESTADO_SC_COLOR[sc.estado] ?? ""}>{ESTADO_SC_LABEL[sc.estado] ?? sc.estado}</Badge>
            <span className="text-muted-foreground">
              {sc.departamento_solicitante} · prioridad {sc.prioridad} · origen {sc.origen}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Total estimado</div>
          <div className="text-2xl font-semibold">{fmtMoneda(sc.total_estimado, sc.moneda)}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {sc.estado === "borrador" && (
          <Button onClick={() => action(() => enviarSolicitud(scId), "Solicitud enviada para aprobación")} disabled={busy}>
            <Send className="mr-2 h-4 w-4" /> Enviar para aprobación
          </Button>
        )}
        {sc.estado === "enviada" && (
          <>
            <Button onClick={() => action(() => aprobarSolicitud(scId), "Solicitud aprobada")} disabled={busy}>
              <Check className="mr-2 h-4 w-4" /> Aprobar
            </Button>
            <Button variant="outline" onClick={() => setShowRechazo((s) => !s)} disabled={busy}>
              <X className="mr-2 h-4 w-4" /> Rechazar
            </Button>
          </>
        )}
        {sc.estado === "aprobada" && (
          <div className="flex flex-1 items-end gap-2">
            <div>
              <Label>Convertir en OC → Proveedor</Label>
              <select
                className="block w-72 rounded-md border bg-background px-3 py-2 text-sm"
                value={proveedorSeleccionado ?? ""}
                onChange={(e) => setProveedorSeleccionado(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Seleccionar proveedor…</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>{p.codigo} — {p.razon_social}</option>
                ))}
              </select>
            </div>
            <Button
              disabled={!proveedorSeleccionado || busy}
              onClick={() => action(() => convertirSolicitudEnOC(scId, proveedorSeleccionado!), "Orden de compra generada")}
            >
              <ArrowRight className="mr-2 h-4 w-4" /> Convertir en OC
            </Button>
          </div>
        )}
        {!["convertida_en_oc", "cancelada"].includes(sc.estado) && (
          <Button variant="outline" onClick={() => action(() => cancelarSolicitud(scId), "Solicitud cancelada")} disabled={busy}>
            Cancelar
          </Button>
        )}
        {sc.orden_compra_id && (
          <Link href={`/compras/ordenes-compra/${sc.orden_compra_id}`}>
            <Button variant="outline">Ver OC generada →</Button>
          </Link>
        )}
      </div>

      {showRechazo && sc.estado === "enviada" && (
        <div className="rounded-md border bg-amber-50/40 p-4">
          <Label>Motivo del rechazo</Label>
          <Input value={motivoRechazo} onChange={(e) => setMotivoRechazo(e.target.value)} className="mt-2" />
          <div className="mt-3 flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={motivoRechazo.length < 2 || busy}
              onClick={() => action(() => rechazarSolicitud(scId, motivoRechazo), "Solicitud rechazada")}
            >
              Confirmar rechazo
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowRechazo(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {sc.motivo_rechazo && (
        <div className="rounded-md border border-red-200 bg-red-50/60 p-4 text-sm">
          <strong>Rechazo:</strong> {sc.motivo_rechazo}
        </div>
      )}

      <section className="rounded-md border bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase text-muted-foreground">Líneas solicitadas</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead className="text-right">Precio ref.</TableHead>
              <TableHead>Proveedor sugerido</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(sc.solicitud_lineas ?? []).map((l) => (
              <TableRow key={l.id}>
                <TableCell>{l.orden}</TableCell>
                <TableCell className="font-mono text-xs">{l.items?.codigo_interno ?? "—"}</TableCell>
                <TableCell>{l.descripcion}</TableCell>
                <TableCell className="text-right">{Number(l.cantidad_solicitada)} {l.unidad_medida}</TableCell>
                <TableCell className="text-right">{fmtMoneda(l.precio_referencial, l.moneda)}</TableCell>
                <TableCell className="text-xs">{l.proveedores?.razon_social ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="grid grid-cols-2 gap-4 text-sm">
        <KVRow label="Solicitante" value={sc.usuarios_solicitudes_solicitante_idTousuarios?.nombre_completo} />
        <KVRow label="Fecha solicitud" value={new Date(sc.fecha_solicitud).toLocaleDateString()} />
        <KVRow label="Fecha requerida" value={sc.fecha_requerida ? new Date(sc.fecha_requerida).toLocaleDateString() : "—"} />
        <KVRow label="Aprobador" value={sc.usuarios_solicitudes_aprobador_idTousuarios?.nombre_completo} />
        {sc.justificacion && <KVRow label="Justificación" value={sc.justificacion} span={2} />}
        {sc.observaciones && <KVRow label="Observaciones" value={sc.observaciones} span={2} />}
        {sc.cotizaciones && (
          <KVRow label="Cotización origen" value={
            <Link className="text-blue-700 hover:underline" href={`/cotizaciones/${sc.cotizaciones.id}`}>{sc.cotizaciones.codigo}</Link>
          } />
        )}
        {sc.expedientes && (
          <KVRow label="Expediente" value={
            <Link className="text-blue-700 hover:underline" href={`/expedientes/${sc.expedientes.id}`}>{sc.expedientes.codigo}</Link>
          } />
        )}
      </section>
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
