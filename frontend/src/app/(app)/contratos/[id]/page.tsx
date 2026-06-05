"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, DollarSign, Pause, Play, CheckCircle2, Ban, FileSignature, Pencil, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { PageHeader, HeaderActionGhost } from "@/components/page-header";
import { Panel, StatCard } from "@/components/panel";
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

const accionConfig: Record<TransicionContrato, { label: string; icon: typeof Pause; tone: "ghost" | "primary" | "destructive" }> = {
  suspender: { label: "Suspender", icon: Pause, tone: "ghost" },
  reanudar: { label: "Reanudar", icon: Play, tone: "primary" },
  completar: { label: "Marcar completado", icon: CheckCircle2, tone: "primary" },
  cancelar: { label: "Cancelar", icon: Ban, tone: "destructive" },
};

export default function ContratoDetallePage({ params }: PageProps) {
  const [id, setId] = useState<number | null>(null);
  const [contrato, setContrato] = useState<Contrato | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cobroDialog, setCobroDialog] = useState<{ open: boolean; pago: ContratoPago | null; modo: "registrar" | "editar" }>({ open: false, pago: null, modo: "registrar" });
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
    setCobroDialog({ open: true, pago, modo: "registrar" });
  }

  function abrirEditarCobro(pago: ContratoPago) {
    setCobroMonto(Number(pago.monto_pagado));
    setCobroFecha(pago.fecha_pagado?.split("T")[0] ?? new Date().toISOString().split("T")[0]);
    setCobroReferencia(pago.referencia_pago ?? "");
    setCobroDialog({ open: true, pago, modo: "editar" });
  }

  async function reversarCobro(pago: ContratoPago) {
    if (!contrato) return;
    const motivo = window.prompt(`Reversar el cobro #${pago.numero} (vuelve a pendiente, pagado $0). Motivo (obligatorio):`);
    if (motivo === null) return;
    if (!motivo.trim()) { toast.error("El motivo es obligatorio para reversar"); return; }
    const nota = `[REVERSADO ${new Date().toISOString().split("T")[0]}] ${motivo.trim()}`;
    try {
      await updatePago(contrato.id, pago.id, {
        monto_pagado: 0,
        fecha_pagado: null,
        referencia_pago: null,
        estado: "pendiente",
        observaciones: pago.observaciones ? `${nota}\n${pago.observaciones}` : nota,
      });
      toast.success("Cobro reversado");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error");
    }
  }

  async function registrarCobro() {
    if (!contrato || !cobroDialog.pago) return;
    const pago = cobroDialog.pago;
    const estipulado = Number(pago.monto_estipulado);
    // En "editar" el monto es el TOTAL pagado; en "registrar" se SUMA al ya pagado.
    const totalRaw = cobroDialog.modo === "editar" ? cobroMonto : Number(pago.monto_pagado) + cobroMonto;
    const total = Math.min(Math.max(totalRaw, 0), estipulado);
    const nuevoEstado = total >= estipulado ? "pagado" : total > 0 ? "parcial" : "pendiente";

    try {
      await updatePago(contrato.id, pago.id, {
        monto_pagado: total,
        fecha_pagado: total > 0 ? cobroFecha : null,
        referencia_pago: cobroReferencia.trim() || null,
        estado: nuevoEstado,
      });
      toast.success(cobroDialog.modo === "editar" ? "Cobro actualizado" : "Cobro registrado");
      setCobroDialog({ open: false, pago: null, modo: "registrar" });
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

  if (loading && !contrato) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-copper border-t-transparent" />
          <span className="text-sm">Cargando contrato…</span>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div>
        <PageHeader breadcrumb={[{ href: "/dashboard", label: "Panel" }, { href: "/contratos", label: "Contratos" }, { label: "Error" }]} title="Contrato" titleAccent="no encontrado" />
        <div className="pt-6">
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-200 inset-highlight">
            <p className="text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }
  if (!contrato) return null;

  const transiciones = transicionesPosiblesContrato(contrato.estado);
  const editable = contrato.estado === "vigente";
  const puedeAjustar = contrato.estado === "vigente" || contrato.estado === "completado";
  const totalPagado = contrato.resumen_pagos?.total_pagado ?? 0;
  const saldoPendiente = contrato.resumen_pagos?.saldo_pendiente ?? 0;
  const pctPagado = Number(contrato.monto_total) > 0 ? (totalPagado / Number(contrato.monto_total)) * 100 : 0;

  return (
    <div>
      <PageHeader
        breadcrumb={[
          { href: "/dashboard", label: "Panel" },
          { href: "/contratos", label: "Contratos" },
          { label: contrato.codigo },
        ]}
        title={contrato.codigo}
        titleAccent={contrato.clientes?.razon_social ?? ""}
        meta={
          <>
            <Badge variant={estadoContratoVariant(contrato.estado)}>{contrato.estado}</Badge>
            <span className="text-muted-foreground/40">·</span>
            <span>
              Desde cotización{" "}
              <Link href={`/cotizaciones/${contrato.cotizacion_id}`} className="font-mono text-copper hover:underline">
                {contrato.cotizaciones?.codigo}
              </Link>
            </span>
          </>
        }
        actions={
          <>
            <HeaderActionGhost href="/contratos" icon={<ChevronLeft className="h-3.5 w-3.5" />}>Volver</HeaderActionGhost>
            <PdfButton recurso="contrato" id={contrato.id} />
          </>
        }
      />

      <div className="space-y-6 pt-6">
        {/* Acciones de transición */}
        {transiciones.length > 0 && (
          <Panel title="Acciones disponibles" subtitle="Transiciones de estado" icon={<FileSignature className="h-3.5 w-3.5" />}>
            <div className="flex flex-wrap items-center gap-2">
              {transiciones.map((accion) => {
                const cfg = accionConfig[accion];
                const Icon = cfg.icon;
                const cls = cfg.tone === "primary"
                  ? "inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-3 py-1.5 text-xs font-medium text-white shadow-sm glow-copper-sm inset-highlight-md transition hover:glow-copper"
                  : cfg.tone === "destructive"
                  ? "inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/15"
                  : "inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-3 py-1.5 text-xs font-medium text-foreground/90 transition hover:border-glass-strong hover:bg-glass-elev";
                return (
                  <button key={accion} type="button" onClick={() => handleTransicion(accion)} className={cls}>
                    <Icon className="h-3.5 w-3.5" /> {cfg.label}
                  </button>
                );
              })}
            </div>
          </Panel>
        )}

        {/* Resumen financiero */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Monto total" value={`$${Number(contrato.monto_total).toFixed(2)}`} sub="Valor del contrato" />
          <StatCard label="Pagado" value={`$${totalPagado.toFixed(2)}`} sub={`${pctPagado.toFixed(0)}% del total`} tone="green" />
          <StatCard label="Saldo pendiente" value={`$${saldoPendiente.toFixed(2)}`} sub={saldoPendiente > 0 ? "Por cobrar" : "Liquidado"} tone={saldoPendiente > 0 ? "amber" : "default"} />
          <StatCard label="Plan de pago" value={contrato.plan_pago_tipo.replace(/_/g, " ")} sub="Modalidad acordada" />
        </section>

        {/* Datos del contrato */}
        <Panel title="Datos del contrato" subtitle="Información administrativa">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm md:grid-cols-2 lg:grid-cols-4">
            <KVPair label="Cliente"><span className="font-medium">{contrato.clientes?.razon_social}</span> <span className="font-mono text-xs text-muted-foreground">({contrato.clientes?.ruc_cedula})</span></KVPair>
            <KVPair label="Cotización origen"><span className="font-mono text-copper">{contrato.cotizaciones?.codigo}</span></KVPair>
            <KVPair label="Fecha firma"><span className="font-mono">{contrato.fecha_firma?.split("T")[0]}</span></KVPair>
            <KVPair label="Inicio"><span className="font-mono">{contrato.fecha_inicio?.split("T")[0] ?? "—"}</span></KVPair>
            <KVPair label="Fin estimado"><span className="font-mono">{contrato.fecha_fin_estimada?.split("T")[0] ?? "—"}</span></KVPair>
            <KVPair label="Fin real"><span className="font-mono">{contrato.fecha_fin_real?.split("T")[0] ?? "—"}</span></KVPair>
            {contrato.observaciones && <KVPair label="Observaciones" full><p className="whitespace-pre-wrap">{contrato.observaciones}</p></KVPair>}
            {contrato.notas_internas && <KVPair label="Notas internas" full><p className="whitespace-pre-wrap text-muted-foreground">{contrato.notas_internas}</p></KVPair>}
          </dl>
        </Panel>

        {/* Plan de pagos */}
        <Panel title="Plan de pagos" subtitle={`${contrato.contrato_pagos?.length ?? 0} hitos definidos`} padded={false}>
          <Table>
            <TableHeader>
              <TableRow className="border-glass bg-glass hover:bg-glass">
                <TableHead className="w-12 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">#</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Tipo</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Descripción</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Condición</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Esperada</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Estipulado</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Pagado</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Estado</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contrato.contrato_pagos?.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">Sin pagos definidos</TableCell></TableRow>
              ) : (
                contrato.contrato_pagos?.map((p) => {
                  const pendiente = Number(p.monto_estipulado) - Number(p.monto_pagado);
                  return (
                    <TableRow key={p.id} className="border-glass group hover:bg-glass">
                      <TableCell className="font-mono text-xs text-muted-foreground">{p.numero}</TableCell>
                      <TableCell className="text-sm capitalize">{tipoPagoLabel(p.tipo)}</TableCell>
                      <TableCell className="text-sm text-foreground/85">{p.descripcion ?? "—"}</TableCell>
                      <TableCell className="text-sm text-foreground/75">{condicionDisparoLabel(p.condicion_disparo)}</TableCell>
                      <TableCell className="font-mono text-xs text-foreground/80">{p.fecha_esperada?.split("T")[0] ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">${Number(p.monto_estipulado).toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <span className={`font-mono text-sm tabular-nums ${Number(p.monto_pagado) > 0 ? "text-green-300" : "text-muted-foreground"}`}>
                          ${Number(p.monto_pagado).toFixed(2)}
                        </span>
                        {p.fecha_pagado && <div className="font-mono text-[10px] text-muted-foreground">{p.fecha_pagado.split("T")[0]}</div>}
                      </TableCell>
                      <TableCell><Badge variant={estadoPagoVariant(p.estado)}>{p.estado}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {editable && pendiente > 0 && p.estado !== "cancelado" && (
                            <button type="button" onClick={() => abrirCobro(p)} title="Registrar cobro" className="inline-flex items-center gap-1 rounded-md border border-copper/30 bg-copper/10 px-2 py-1 text-[11px] font-medium text-copper transition hover:bg-copper/15">
                              <DollarSign className="h-3 w-3" /> Cobrar
                            </button>
                          )}
                          {puedeAjustar && Number(p.monto_pagado) > 0 && (
                            <>
                              <button type="button" onClick={() => abrirEditarCobro(p)} title="Editar cobro" className="rounded-md p-1.5 text-muted-foreground transition hover:bg-glass-elev hover:text-copper">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button type="button" onClick={() => reversarCobro(p)} title="Reversar cobro" className="rounded-md p-1.5 text-muted-foreground transition hover:bg-rose-500/10 hover:text-rose-400">
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Panel>
      </div>

      {/* Dialog de cobro */}
      <Dialog open={cobroDialog.open} onOpenChange={(open) => !open && setCobroDialog({ open: false, pago: null, modo: "registrar" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{cobroDialog.modo === "editar" ? "Editar cobro" : "Registrar cobro"}</DialogTitle>
            <DialogDescription>
              Pago #{cobroDialog.pago?.numero} · estipulado ${cobroDialog.pago && Number(cobroDialog.pago.monto_estipulado).toFixed(2)}
              {cobroDialog.pago && Number(cobroDialog.pago.monto_pagado) > 0 && ` · ya pagado $${Number(cobroDialog.pago.monto_pagado).toFixed(2)}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="cobro_monto">{cobroDialog.modo === "editar" ? "Monto pagado total ($)" : "Monto a cobrar ($)"}</Label>
              <Input id="cobro_monto" type="number" step="0.01" min="0" max={cobroDialog.pago ? (cobroDialog.modo === "editar" ? Number(cobroDialog.pago.monto_estipulado) : Number(cobroDialog.pago.monto_estipulado) - Number(cobroDialog.pago.monto_pagado)) : 0} value={cobroMonto} onChange={(e) => setCobroMonto(Number(e.target.value))} />
              {cobroDialog.modo === "editar" && <p className="text-[11px] text-muted-foreground">Poné el total efectivamente pagado de esta cuota (0 = equivale a reversar).</p>}
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
            <Button variant="outline" onClick={() => setCobroDialog({ open: false, pago: null, modo: "registrar" })}>Cancelar</Button>
            <Button onClick={registrarCobro} disabled={cobroMonto < 0 || (cobroDialog.modo === "registrar" && cobroMonto <= 0)}>{cobroDialog.modo === "editar" ? "Guardar" : "Registrar cobro"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster richColors position="top-right" theme="dark" />
    </div>
  );
}

function KVPair({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "md:col-span-2 lg:col-span-4" : ""}>
      <dt className="mb-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground/90">{children}</dd>
    </div>
  );
}
