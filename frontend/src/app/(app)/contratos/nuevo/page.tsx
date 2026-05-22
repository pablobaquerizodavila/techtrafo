"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import { getCotizacion, Cotizacion } from "@/lib/cotizaciones";
import {
  CondicionDisparo,
  ContratoCreateInput,
  PagoInput,
  PlanPagoTipo,
  TipoPago,
  condicionDisparoLabel,
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
  const cotizacionId = params.get("cotizacion") ? Number(params.get("cotizacion")) : null;

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
    if (!cotizacionId) {
      setErrorCot("Falta el parametro ?cotizacion=<id>");
      setLoadingCot(false);
      return;
    }
    getCotizacion(cotizacionId)
      .then((r) => {
        const c = r.data;
        if (c.estado !== "aprobada") {
          setErrorCot(`La cotizacion ${c.codigo} esta en estado "${c.estado}" — solo se puede convertir cuando esta aprobada`);
        } else {
          setCotizacion(c);
          setMontoTotal(Number(c.total));
          // Pre-poblar plan de pagos 50/50 con el total de la cotizacion
          const mitad = Math.round(Number(c.total) * 50) / 100;
          setPagos([
            { _tempId: crypto.randomUUID(), numero: 1, tipo: "anticipo", descripcion: "50% anticipo al firmar", condicion_disparo: "fecha_fija", fecha_esperada: null, monto_porcentaje: 50, monto_estipulado: mitad },
            { _tempId: crypto.randomUUID(), numero: 2, tipo: "saldo", descripcion: "50% saldo contra entrega", condicion_disparo: "al_entregar", fecha_esperada: null, monto_porcentaje: 50, monto_estipulado: Number(c.total) - mitad },
          ]);
        }
      })
      .catch(() => setErrorCot("No se pudo cargar la cotizacion"))
      .finally(() => setLoadingCot(false));
  }, [cotizacionId]);

  function updatePago<K extends keyof PagoForm>(idx: number, key: K, value: PagoForm[K]) {
    setPagos((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: value };
      return next;
    });
  }

  function addPago() {
    setPagos((prev) => [...prev, nuevoPago(prev.length + 1)]);
  }

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

  if (loadingCot) return <p className="text-muted-foreground">Cargando cotizacion...</p>;
  if (errorCot) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/contratos"><ChevronLeft className="mr-1 h-4 w-4" /> Volver</Link>
        </Button>
        <p className="text-destructive">{errorCot}</p>
      </div>
    );
  }
  if (!cotizacion) return null;

  return (
    <div className="space-y-6">
      <header>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link href={`/cotizaciones/${cotizacion.id}`}><ChevronLeft className="mr-1 h-4 w-4" /> Volver a la cotizacion</Link>
        </Button>
        <h2 className="text-3xl font-bold">Nuevo contrato</h2>
        <p className="text-muted-foreground">
          Desde cotizacion <span className="font-mono">{cotizacion.codigo}</span> · cliente {cotizacion.clientes?.razon_social} · total cotizacion ${Number(cotizacion.total).toFixed(2)}
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="firma">Fecha firma *</Label>
            <Input id="firma" type="date" value={fechaFirma} onChange={(e) => setFechaFirma(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inicio">Fecha inicio</Label>
            <Input id="inicio" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} min={fechaFirma} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fin">Fecha fin estimada</Label>
            <Input id="fin" type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} min={fechaInicio || fechaFirma} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="monto">Monto total (USD) *</Label>
            <Input id="monto" type="number" step="0.01" min="0" value={montoTotal} onChange={(e) => setMontoTotal(Number(e.target.value))} required />
            {Number(cotizacion.total) !== montoTotal && (
              <p className="text-xs text-muted-foreground">
                Diferente al total de cotizacion (${Number(cotizacion.total).toFixed(2)}) — por negociacion final
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan">Plan de pago</Label>
            <Select value={planPagoTipo} onValueChange={(v) => setPlanPagoTipo(v as PlanPagoTipo)}>
              <SelectTrigger id="plan"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="anticipo_y_saldo">Anticipo + saldo</SelectItem>
                <SelectItem value="hitos">Por hitos</SelectItem>
                <SelectItem value="mensual">Mensual</SelectItem>
                <SelectItem value="contado">Contado</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Plan de pagos */}
        <div className="rounded-md border">
          <div className="flex items-center justify-between p-3">
            <h3 className="text-sm font-semibold">Plan de pagos</h3>
            <Button type="button" variant="outline" size="sm" onClick={addPago}>
              <Plus className="mr-1 h-4 w-4" /> Agregar pago
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead className="w-32">Tipo</TableHead>
                <TableHead>Descripcion</TableHead>
                <TableHead className="w-40">Condicion</TableHead>
                <TableHead className="w-32">Fecha esperada</TableHead>
                <TableHead className="w-20 text-right">%</TableHead>
                <TableHead className="w-28 text-right">Monto (USD)</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagos.map((p, idx) => (
                <TableRow key={p._tempId}>
                  <TableCell>{p.numero}</TableCell>
                  <TableCell>
                    <Select value={p.tipo} onValueChange={(v) => updatePago(idx, "tipo", v as TipoPago)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="anticipo">Anticipo</SelectItem>
                        <SelectItem value="hito">Hito</SelectItem>
                        <SelectItem value="saldo">Saldo</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input value={p.descripcion ?? ""} onChange={(e) => updatePago(idx, "descripcion", e.target.value)} placeholder="Descripcion del pago" />
                  </TableCell>
                  <TableCell>
                    <Select value={p.condicion_disparo ?? "_"} onValueChange={(v) => updatePago(idx, "condicion_disparo", v === "_" ? null : v as CondicionDisparo)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_">Sin condicion</SelectItem>
                        <SelectItem value="fecha_fija">Fecha fija</SelectItem>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="al_completar_ot">Al completar OT</SelectItem>
                        <SelectItem value="al_pasar_gate">Al pasar gate</SelectItem>
                        <SelectItem value="al_entregar">Al entregar</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input type="date" value={p.fecha_esperada ?? ""} onChange={(e) => updatePago(idx, "fecha_esperada", e.target.value || null)} />
                  </TableCell>
                  <TableCell>
                    <Input type="number" step="0.01" min="0" max="100" value={p.monto_porcentaje ?? ""} onChange={(e) => updatePago(idx, "monto_porcentaje", e.target.value === "" ? null : Number(e.target.value))} />
                  </TableCell>
                  <TableCell>
                    <Input type="number" step="0.01" min="0" value={p.monto_estipulado} onChange={(e) => updatePago(idx, "monto_estipulado", Number(e.target.value))} />
                  </TableCell>
                  <TableCell>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removePago(idx)} disabled={pagos.length === 1}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between border-t bg-muted/20 p-3 text-sm">
            <span>Suma del plan de pagos: <span className="font-mono font-semibold">${totalEstipulado.toFixed(2)}</span></span>
            <span className={diferencia === 0 ? "text-success" : "text-warning"}>
              {diferencia === 0 ? "✓ Coincide con monto total" : diferencia > 0 ? `Excede ${diferencia.toFixed(2)} sobre monto total` : `Falta ${Math.abs(diferencia).toFixed(2)} del monto total`}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="obs">Observaciones (visibles)</Label>
            <Textarea id="obs" rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notas">Notas internas</Label>
            <Textarea id="notas" rows={2} value={notasInternas} onChange={(e) => setNotasInternas(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.push("/contratos")} disabled={submitting}>Cancelar</Button>
          <Button type="submit" disabled={submitting}>{submitting ? "Creando..." : "Crear contrato"}</Button>
        </div>
      </form>

      <Toaster richColors position="top-right" />
    </div>
  );
}
