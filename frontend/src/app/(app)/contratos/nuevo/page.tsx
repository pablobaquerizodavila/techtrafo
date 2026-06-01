"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Plus, Trash2, FileSignature, CheckCircle2, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import { PageHeader, HeaderActionGhost } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { getCotizacion, Cotizacion } from "@/lib/cotizaciones";
import { getExpediente } from "@/lib/expedientes";
import {
  CondicionDisparo,
  ContratoCreateInput,
  PagoInput,
  PlanPagoTipo,
  TipoPago,
  createContrato,
} from "@/lib/contratos";
import { ApiError } from "@/lib/api";

interface PagoForm extends PagoInput {
  _tempId: string;
}

function nuevoPago(numero: number): PagoForm {
  return {
    _tempId: crypto.randomUUID(),
    numero,
    tipo: "anticipo",
    descripcion: "",
    condicion_disparo: "fecha_fija",
    fecha_esperada: null,
    monto_porcentaje: null,
    monto_estipulado: 0,
  };
}

export default function NuevoContratoPage() {
  const router = useRouter();
  const params = useSearchParams();
  // Se puede llegar por ?cotizacion=<id> (desde la cotización) o por
  // ?expediente_id=<id> (desde el expediente); en este último resolvemos
  // la cotización aprobada del expediente.
  const cotizacionParam = params.get("cotizacion") ? Number(params.get("cotizacion")) : null;
  const expedienteParam = params.get("expediente_id") ? Number(params.get("expediente_id")) : null;

  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null);
  const [loadingCot, setLoadingCot] = useState(true);
  const [errorCot, setErrorCot] = useState<string | null>(null);

  const [fechaFirma, setFechaFirma] = useState(new Date().toISOString().split("T")[0]);
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [montoTotal, setMontoTotal] = useState(0);
  const [planPagoTipo, setPlanPagoTipo] = useState<PlanPagoTipo>("anticipo_y_saldo");
  const [observaciones, setObservaciones] = useState("");
  const [notasInternas, setNotasInternas] = useState("");
  const [pagos, setPagos] = useState<PagoForm[]>([nuevoPago(1), nuevoPago(2)]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function resolver() {
      setLoadingCot(true);
      setErrorCot(null);

      // 1) Determinar el id de la cotización: directo o vía expediente.
      let cotId = cotizacionParam;
      if (!cotId && expedienteParam) {
        try {
          const r = await getExpediente(expedienteParam);
          const cot = r.data.cotizaciones;
          if (!cot) {
            if (!cancelled) {
              setErrorCot("Este expediente todavía no tiene una cotización. Primero emití y aprobá la cotización para poder generar el contrato.");
              setLoadingCot(false);
            }
            return;
          }
          cotId = cot.id;
        } catch {
          if (!cancelled) { setErrorCot("No se pudo cargar el expediente"); setLoadingCot(false); }
          return;
        }
      }
      if (!cotId) {
        if (!cancelled) {
          setErrorCot("Falta el parámetro ?cotizacion=<id> o ?expediente_id=<id>");
          setLoadingCot(false);
        }
        return;
      }

      // 2) Cargar la cotización y validar que esté aprobada.
      try {
        const r = await getCotizacion(cotId);
        const c = r.data;
        if (cancelled) return;
        if (c.estado !== "aprobada") {
          setErrorCot(`La cotización ${c.codigo} está en estado "${c.estado}" — solo se puede convertir en contrato cuando está aprobada`);
        } else {
          setCotizacion(c);
          setMontoTotal(Number(c.total));
          const mitad = Math.round(Number(c.total) * 50) / 100;
          setPagos([
            { _tempId: crypto.randomUUID(), numero: 1, tipo: "anticipo", descripcion: "50% anticipo al firmar", condicion_disparo: "fecha_fija", fecha_esperada: null, monto_porcentaje: 50, monto_estipulado: mitad },
            { _tempId: crypto.randomUUID(), numero: 2, tipo: "saldo", descripcion: "50% saldo contra entrega", condicion_disparo: "al_entregar", fecha_esperada: null, monto_porcentaje: 50, monto_estipulado: Number(c.total) - mitad },
          ]);
        }
      } catch {
        if (!cancelled) setErrorCot("No se pudo cargar la cotización");
      } finally {
        if (!cancelled) setLoadingCot(false);
      }
    }
    resolver();
    return () => { cancelled = true; };
  }, [cotizacionParam, expedienteParam]);

  function updatePago<K extends keyof PagoForm>(idx: number, key: K, value: PagoForm[K]) {
    setPagos((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: value };
      return next;
    });
  }
  function addPago() { setPagos((prev) => [...prev, nuevoPago(prev.length + 1)]); }
  function removePago(idx: number) {
    setPagos((prev) => prev.filter((_, i) => i !== idx).map((p, i) => ({ ...p, numero: i + 1 })));
  }

  const totalEstipulado = pagos.reduce((acc, p) => acc + Number(p.monto_estipulado), 0);
  const diferencia = Math.round((totalEstipulado - montoTotal) * 100) / 100;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cotizacion) return;
    if (montoTotal <= 0) { toast.error("Monto total debe ser mayor a 0"); return; }
    const payload: ContratoCreateInput = {
      cotizacion_id: cotizacion.id,
      fecha_firma: fechaFirma,
      fecha_inicio: fechaInicio || null,
      fecha_fin_estimada: fechaFin || null,
      monto_total: montoTotal,
      plan_pago_tipo: planPagoTipo,
      observaciones: observaciones.trim() || null,
      notas_internas: notasInternas.trim() || null,
      pagos: pagos.map((p) => ({
        numero: p.numero,
        tipo: p.tipo,
        descripcion: p.descripcion?.trim() || null,
        condicion_disparo: p.condicion_disparo,
        fecha_esperada: p.fecha_esperada || null,
        monto_porcentaje: p.monto_porcentaje ?? null,
        monto_estipulado: Number(p.monto_estipulado),
      })),
    };
    setSubmitting(true);
    try {
      const res = await createContrato(payload);
      toast.success(`Contrato ${res.data.codigo} creado`);
      router.push(`/contratos/${res.data.id}`);
    } catch (err) {
      const msg = err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingCot) {
    return (
      <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-copper border-t-transparent" />
          <span className="text-sm">Cargando cotización…</span>
        </div>
      </div>
    );
  }
  if (errorCot) {
    return (
      <div>
        <PageHeader breadcrumb={[{ href: "/dashboard", label: "Panel" }, { href: "/contratos", label: "Contratos" }, { label: "Nuevo" }]} title="Nuevo" titleAccent="contrato" actions={<HeaderActionGhost href="/contratos" icon={<ChevronLeft className="h-3.5 w-3.5" />}>Volver</HeaderActionGhost>} />
        <div className="pt-6">
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-200 inset-highlight">
            <p className="text-sm">{errorCot}</p>
          </div>
        </div>
      </div>
    );
  }
  if (!cotizacion) return null;

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { href: "/contratos", label: "Contratos" }, { label: "Nuevo" }]}
        title="Nuevo"
        titleAccent="contrato"
        meta={
          <>
            <span>
              Desde cotización{" "}
              <Link href={`/cotizaciones/${cotizacion.id}`} className="font-mono text-copper hover:underline">{cotizacion.codigo}</Link>
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span>{cotizacion.clientes?.razon_social}</span>
            <span className="text-muted-foreground/40">·</span>
            <span>Total cotización <span className="font-mono text-foreground">${Number(cotizacion.total).toFixed(2)}</span></span>
          </>
        }
        actions={
          <HeaderActionGhost href={`/cotizaciones/${cotizacion.id}`} icon={<ChevronLeft className="h-3.5 w-3.5" />}>Volver</HeaderActionGhost>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-6 pt-6">
        {/* Fechas */}
        <Panel title="Fechas del contrato" icon={<FileSignature className="h-3.5 w-3.5" />}>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <FormField label="Fecha firma" required htmlFor="firma">
              <Input id="firma" type="date" value={fechaFirma} onChange={(e) => setFechaFirma(e.target.value)} required className="h-10 border-glass bg-glass" />
            </FormField>
            <FormField label="Fecha inicio" htmlFor="inicio">
              <Input id="inicio" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} min={fechaFirma} className="h-10 border-glass bg-glass" />
            </FormField>
            <FormField label="Fecha fin estimada" htmlFor="fin">
              <Input id="fin" type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} min={fechaInicio || fechaFirma} className="h-10 border-glass bg-glass" />
            </FormField>
          </div>
        </Panel>

        {/* Monto + plan */}
        <Panel title="Monto y plan de pago" subtitle="Definí el total y la modalidad acordada">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <FormField label="Monto total ($)" required htmlFor="monto">
              <Input id="monto" type="number" step="0.01" min="0" value={montoTotal} onChange={(e) => setMontoTotal(Number(e.target.value))} required className="h-10 border-glass bg-glass" />
              {Number(cotizacion.total) !== montoTotal && (
                <p className="mt-1 text-xs text-amber-300">
                  Diferente al total de cotización (<span className="font-mono">${Number(cotizacion.total).toFixed(2)}</span>) — por negociación final
                </p>
              )}
            </FormField>
            <FormField label="Plan de pago" htmlFor="plan">
              <Select value={planPagoTipo} onValueChange={(v) => setPlanPagoTipo(v as PlanPagoTipo)}>
                <SelectTrigger id="plan" className="h-10 border-glass bg-glass"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="anticipo_y_saldo">Anticipo + saldo</SelectItem>
                  <SelectItem value="hitos">Por hitos</SelectItem>
                  <SelectItem value="mensual">Mensual</SelectItem>
                  <SelectItem value="contado">Contado</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>
        </Panel>

        {/* Plan de pagos */}
        <Panel
          title="Plan de pagos"
          subtitle={`${pagos.length} hito${pagos.length === 1 ? "" : "s"} definido${pagos.length === 1 ? "" : "s"}`}
          padded={false}
          action={
            <button type="button" onClick={addPago}
              className="inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-2.5 py-1 text-xs font-medium text-foreground/90 hover:bg-glass-elev">
              <Plus className="h-3.5 w-3.5" /> Agregar pago
            </button>
          }
        >
          <Table>
            <TableHeader>
              <TableRow className="border-glass bg-glass hover:bg-glass">
                <TableHead className="w-12 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">#</TableHead>
                <TableHead className="w-32 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Tipo</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Descripción</TableHead>
                <TableHead className="w-40 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Condición</TableHead>
                <TableHead className="w-32 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Fecha esperada</TableHead>
                <TableHead className="w-20 text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">%</TableHead>
                <TableHead className="w-28 text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Monto ($)</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagos.map((p, idx) => (
                <TableRow key={p._tempId} className="border-glass hover:bg-glass">
                  <TableCell className="font-mono text-xs text-muted-foreground">{p.numero}</TableCell>
                  <TableCell>
                    <Select value={p.tipo} onValueChange={(v) => updatePago(idx, "tipo", v as TipoPago)}>
                      <SelectTrigger className="h-8 border-glass bg-glass text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="anticipo">Anticipo</SelectItem>
                        <SelectItem value="hito">Hito</SelectItem>
                        <SelectItem value="saldo">Saldo</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input value={p.descripcion ?? ""} onChange={(e) => updatePago(idx, "descripcion", e.target.value)} placeholder="Descripción" className="h-8 border-glass bg-glass text-sm" />
                  </TableCell>
                  <TableCell>
                    <Select value={p.condicion_disparo ?? "_"} onValueChange={(v) => updatePago(idx, "condicion_disparo", v === "_" ? null : v as CondicionDisparo)}>
                      <SelectTrigger className="h-8 border-glass bg-glass text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_">Sin condición</SelectItem>
                        <SelectItem value="fecha_fija">Fecha fija</SelectItem>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="al_completar_ot">Al completar OT</SelectItem>
                        <SelectItem value="al_pasar_gate">Al pasar gate</SelectItem>
                        <SelectItem value="al_entregar">Al entregar</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input type="date" value={p.fecha_esperada ?? ""} onChange={(e) => updatePago(idx, "fecha_esperada", e.target.value || null)} className="h-8 border-glass bg-glass text-xs" />
                  </TableCell>
                  <TableCell>
                    <Input type="number" step="0.01" min="0" max="100" value={p.monto_porcentaje ?? ""} onChange={(e) => updatePago(idx, "monto_porcentaje", e.target.value === "" ? null : Number(e.target.value))} className="h-8 border-glass bg-glass text-right font-mono text-xs" />
                  </TableCell>
                  <TableCell>
                    <Input type="number" step="0.01" min="0" value={p.monto_estipulado} onChange={(e) => updatePago(idx, "monto_estipulado", Number(e.target.value))} className="h-8 border-glass bg-glass text-right font-mono text-xs" />
                  </TableCell>
                  <TableCell>
                    <button type="button" onClick={() => removePago(idx)} disabled={pagos.length === 1}
                      className="rounded p-1 text-rose-400 hover:bg-rose-500/10 disabled:opacity-30 disabled:pointer-events-none"
                      aria-label="Eliminar pago">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between border-t border-glass bg-glass-elev px-5 py-3 text-sm">
            <span className="font-mono text-muted-foreground">
              Suma: <span className="font-semibold text-foreground">${totalEstipulado.toFixed(2)}</span>
            </span>
            <span className={`inline-flex items-center gap-1.5 font-mono text-xs ${diferencia === 0 ? "text-green-400" : "text-amber-300"}`}>
              {diferencia === 0 ? (
                <><CheckCircle2 className="h-3.5 w-3.5" /> Coincide con monto total</>
              ) : (
                <><AlertTriangle className="h-3.5 w-3.5" /> {diferencia > 0 ? `Excede $${diferencia.toFixed(2)}` : `Falta $${Math.abs(diferencia).toFixed(2)}`}</>
              )}
            </span>
          </div>
        </Panel>

        {/* Observaciones y notas */}
        <Panel title="Observaciones y notas" subtitle="Visibles al cliente / internas">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <FormField label="Observaciones (visibles al cliente)" htmlFor="obs">
              <Textarea id="obs" rows={3} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} className="border-glass bg-glass" />
            </FormField>
            <FormField label="Notas internas" htmlFor="notas">
              <Textarea id="notas" rows={3} value={notasInternas} onChange={(e) => setNotasInternas(e.target.value)} className="border-glass bg-glass" />
            </FormField>
          </div>
        </Panel>

        <div className="flex justify-end gap-2 border-t border-glass pt-5">
          <button type="button" onClick={() => router.push("/contratos")} disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-4 py-2 text-sm font-medium text-foreground/90 transition hover:border-glass-strong hover:bg-glass-elev disabled:opacity-40">
            Cancelar
          </button>
          <button type="submit" disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-4 py-2 text-sm font-medium text-white shadow-sm glow-copper-sm inset-highlight-md transition hover:glow-copper disabled:opacity-60">
            {submitting ? "Creando…" : "Crear contrato"}
          </button>
        </div>
      </form>

      <Toaster richColors position="top-right" theme="dark" />
    </div>
  );
}

function FormField({
  label, required, htmlFor, children,
}: {
  label: string; required?: boolean; htmlFor?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}{required && <span className="ml-1 text-copper">*</span>}
      </Label>
      {children}
    </div>
  );
}
