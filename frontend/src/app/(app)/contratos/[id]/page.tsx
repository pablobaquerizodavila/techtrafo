"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, DollarSign, Pause, Play, CheckCircle2, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster, toast } from "sonner";
import {
  Contrato,
  ContratoPago,
  TransicionContrato,
  condicionDisparoLabel,
  estadoContratoVariant,
  estadoPagoVariant,
  getContrato,
  tipoPagoLabel,
  transicionContrato,
  transicionesPosiblesContrato,
  updatePago,
} from "@/lib/contratos";
import { ApiError } from "@/lib/api";
import { PdfButton } from "../../pdf-button";

interface PageProps { params: Promise<{ id: string }> }

const accionConfig: Record<TransicionContrato, { label: string; icon: typeof Pause; variant: "default" | "outline" | "destructive" }> = {
  suspender: { label: "Suspender", icon: Pause, variant: "outline" },
  reanudar: { label: "Reanudar", icon: Play, variant: "default" },
  completar: { label: "Marcar completado", icon: CheckCircle2, variant: "default" },
  cancelar: { label: "Cancelar", icon: Ban, variant: "destructive" },
};

export default function ContratoDetallePage({ params }: PageProps) {
  const [id, setId] = useState<number | null>(null);
  const [contrato, setContrato] = useState<Contrato | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cobroDialog, setCobroDialog] = useState<{ open: boolean; pago: ContratoPago | null }>({ open: false, pago: null });
  const [cobroMonto, setCobroMonto] = useState(0);
  const [cobroFecha, setCobroFecha] = useState("");
  const [cobroReferencia, setCobroReferencia] = useState("");

  useEffect(() => {
    params.then(({ id }) => setId(Number(id)));
  }, [params]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getContrato(id);
      setContrato(res.data);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? "Contrato no encontrado" : "Error cargando");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);

  function abrirCobro(pago: ContratoPago) {
    setCobroMonto(Number(pago.monto_estipulado) - Number(pago.monto_pagado));
    setCobroFecha(new Date().toISOString().split("T")[0]);
    setCobroReferencia("");
    setCobroDialog({ open: true, pago });
  }

  async function registrarCobro() {
    if (!contrato || !cobroDialog.pago) return;
    const pago = cobroDialog.pago;
    const nuevoTotalPagado = Number(pago.monto_pagado) + cobroMonto;
    const nuevoEstado = nuevoTotalPagado >= Number(pago.monto_estipulado) ? "pagado" : "parcial";

    try {
      await updatePago(contrato.id, pago.id, {
        monto_pagado: Math.min(nuevoTotalPagado, Number(pago.monto_estipulado)),
        fecha_pagado: cobroFecha,
        referencia_pago: cobroReferencia.trim() || null,
        estado: nuevoEstado,
      });
      toast.success("Cobro registrado");
      setCobroDialog({ open: false, pago: null });
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error");
    }
  }

  async function handleTransicion(accion: TransicionContrato) {
    if (!contrato) return;
    if (["cancelar"].includes(accion)) {
      const motivo = window.prompt(`Motivo de ${accion}:`);
      if (motivo === null) return;
      try {
        await transicionContrato(contrato.id, accion, motivo);
        toast.success("Estado actualizado");
        load();
      } catch (err) {
        toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error");
      }
      return;
    }
    if (!window.confirm(`Confirmar: ${accionConfig[accion].label}?`)) return;
    try {
      await transicionContrato(contrato.id, accion);
      toast.success("Estado actualizado");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error");
    }
  }

  if (loading && !contrato) return <p className="text-muted-foreground">Cargando...</p>;
  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/contratos"><ChevronLeft className="mr-1 h-4 w-4" /> Volver</Link>
        </Button>
        <p className="text-destructive">{error}</p>
      </div>
    );
  }
  if (!contrato) return null;

  const transiciones = transicionesPosiblesContrato(contrato.estado);
  const editable = contrato.estado === "vigente";

  return (
    <div className="space-y-6">
      <header>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link href="/contratos"><ChevronLeft className="mr-1 h-4 w-4" /> Volver a contratos</Link>
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">{contrato.codigo}</h2>
            <p className="text-muted-foreground">
              {contrato.clientes?.razon_social}
              {" · desde "}<Link href={`/cotizaciones/${contrato.cotizacion_id}`} className="text-primary hover:underline font-mono">{contrato.cotizaciones?.codigo}</Link>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={estadoContratoVariant(contrato.estado)} className="text-base">
              {contrato.estado.toUpperCase()}
            </Badge>
            <PdfButton recurso="contrato" id={contrato.id} />
          </div>
        </div>
      </header>

      {transiciones.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-3">
          <span className="text-sm font-medium">Acciones:</span>
          {transiciones.map((accion) => {
            const cfg = accionConfig[accion];
            const Icon = cfg.icon;
            return (
              <Button key={accion} variant={cfg.variant} size="sm" onClick={() => handleTransicion(accion)}>
                <Icon className="mr-2 h-4 w-4" /> {cfg.label}
              </Button>
            );
          })}
        </div>
      )}

      {/* Resumen */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Monto total</CardTitle></CardHeader><CardContent className="text-2xl font-bold font-mono">${Number(contrato.monto_total).toFixed(2)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total pagado</CardTitle></CardHeader><CardContent className="text-2xl font-bold font-mono text-success">${(contrato.resumen_pagos?.total_pagado ?? 0).toFixed(2)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Saldo pendiente</CardTitle></CardHeader><CardContent className="text-2xl font-bold font-mono text-orange-600">${(contrato.resumen_pagos?.saldo_pendiente ?? 0).toFixed(2)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Plan de pago</CardTitle></CardHeader><CardContent className="text-sm capitalize">{contrato.plan_pago_tipo.replace(/_/g, " ")}</CardContent></Card>
      </div>

      {/* Cabecera */}
      <Card>
        <CardHeader><CardTitle className="text-base">Datos del contrato</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:grid-cols-4">
            <dt className="font-medium">Cliente:</dt><dd className="col-span-3">{contrato.clientes?.razon_social} ({contrato.clientes?.ruc_cedula})</dd>
            <dt className="font-medium">Cotizacion origen:</dt><dd className="col-span-3 font-mono">{contrato.cotizaciones?.codigo}</dd>
            <dt className="font-medium">Fecha firma:</dt><dd>{contrato.fecha_firma?.split("T")[0]}</dd>
            <dt className="font-medium">Inicio:</dt><dd>{contrato.fecha_inicio?.split("T")[0] ?? "—"}</dd>
            <dt className="font-medium">Fin estimado:</dt><dd>{contrato.fecha_fin_estimada?.split("T")[0] ?? "—"}</dd>
            <dt className="font-medium">Fin real:</dt><dd>{contrato.fecha_fin_real?.split("T")[0] ?? "—"}</dd>
            {contrato.observaciones && (<><dt className="font-medium">Observaciones:</dt><dd className="col-span-3 whitespace-pre-wrap">{contrato.observaciones}</dd></>)}
            {contrato.notas_internas && (<><dt className="font-medium">Notas internas:</dt><dd className="col-span-3 whitespace-pre-wrap text-muted-foreground">{contrato.notas_internas}</dd></>)}
          </dl>
        </CardContent>
      </Card>

      {/* Plan de pagos */}
      <div className="rounded-md border">
        <div className="border-b p-3">
          <h3 className="text-sm font-semibold">Plan de pagos</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Descripcion</TableHead>
              <TableHead>Condicion</TableHead>
              <TableHead>Esperada</TableHead>
              <TableHead className="text-right">Estipulado</TableHead>
              <TableHead className="text-right">Pagado</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contrato.contrato_pagos?.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Sin pagos definidos</TableCell></TableRow>
            ) : (
              contrato.contrato_pagos?.map((p) => {
                const pendiente = Number(p.monto_estipulado) - Number(p.monto_pagado);
                return (
                  <TableRow key={p.id}>
                    <TableCell>{p.numero}</TableCell>
                    <TableCell>{tipoPagoLabel(p.tipo)}</TableCell>
                    <TableCell className="text-sm">{p.descripcion ?? "—"}</TableCell>
                    <TableCell className="text-sm">{condicionDisparoLabel(p.condicion_disparo)}</TableCell>
                    <TableCell className="text-sm">{p.fecha_esperada?.split("T")[0] ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">${Number(p.monto_estipulado).toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono">
                      ${Number(p.monto_pagado).toFixed(2)}
                      {p.fecha_pagado && <div className="text-xs text-muted-foreground">{p.fecha_pagado.split("T")[0]}</div>}
                    </TableCell>
                    <TableCell><Badge variant={estadoPagoVariant(p.estado)}>{p.estado}</Badge></TableCell>
                    <TableCell className="text-right">
                      {editable && pendiente > 0 && p.estado !== "cancelado" && (
                        <Button variant="outline" size="sm" onClick={() => abrirCobro(p)}>
                          <DollarSign className="mr-1 h-3 w-3" /> Cobrar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Dialog de cobro */}
      <Dialog open={cobroDialog.open} onOpenChange={(open) => !open && setCobroDialog({ open: false, pago: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar cobro</DialogTitle>
            <DialogDescription>
              Pago #{cobroDialog.pago?.numero} · estipulado ${cobroDialog.pago && Number(cobroDialog.pago.monto_estipulado).toFixed(2)}
              {cobroDialog.pago && Number(cobroDialog.pago.monto_pagado) > 0 && ` · ya pagado $${Number(cobroDialog.pago.monto_pagado).toFixed(2)}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="cobro_monto">Monto a cobrar ($)</Label>
              <Input id="cobro_monto" type="number" step="0.01" min="0" max={cobroDialog.pago ? Number(cobroDialog.pago.monto_estipulado) - Number(cobroDialog.pago.monto_pagado) : 0} value={cobroMonto} onChange={(e) => setCobroMonto(Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cobro_fecha">Fecha</Label>
              <Input id="cobro_fecha" type="date" value={cobroFecha} onChange={(e) => setCobroFecha(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cobro_ref">Referencia (transferencia, cheque, etc.)</Label>
              <Input id="cobro_ref" value={cobroReferencia} onChange={(e) => setCobroReferencia(e.target.value)} placeholder="Ej: Transferencia banco XYZ #001" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCobroDialog({ open: false, pago: null })}>Cancelar</Button>
            <Button onClick={registrarCobro} disabled={cobroMonto <= 0}>Registrar cobro</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster richColors position="top-right" />
    </div>
  );
}
