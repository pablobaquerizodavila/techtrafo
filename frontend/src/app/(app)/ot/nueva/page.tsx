"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Factory } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Toaster, toast } from "sonner";
import { PageHeader, HeaderActionGhost } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { listContratos, Contrato } from "@/lib/contratos";
import { createOT, PrioridadOT, TipoRuta } from "@/lib/ot";
import {
  Transformador, formatCapacidad, listTransformadoresByCliente, tipoLabel as trfTipoLabel,
} from "@/lib/transformadores";
import { ApiError } from "@/lib/api";

function NuevaOTForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectContrato = searchParams.get("contrato");

  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [contratoId, setContratoId] = useState<number | null>(preselectContrato ? Number(preselectContrato) : null);
  const [transformadores, setTransformadores] = useState<Transformador[]>([]);
  const [transformadorId, setTransformadorId] = useState<number | null>(null);
  const [tipoRuta, setTipoRuta] = useState<TipoRuta>("reparacion");
  const [prioridad, setPrioridad] = useState<PrioridadOT>("normal");
  const [descripcion, setDescripcion] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listContratos({ limit: 200, estado: "vigente" })
      .then((r) => setContratos(r.data))
      .catch(() => setContratos([]));
  }, []);

  useEffect(() => {
    if (!contratoId) {
      setTransformadores([]);
      setTransformadorId(null);
      return;
    }
    const contrato = contratos.find((c) => c.id === contratoId);
    if (!contrato?.cliente_id) {
      setTransformadores([]);
      setTransformadorId(null);
      return;
    }
    listTransformadoresByCliente(contrato.cliente_id)
      .then((r) => setTransformadores(r.data))
      .catch(() => setTransformadores([]));
  }, [contratoId, contratos]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!contratoId) { setError("Seleccioná un contrato"); return; }
    setSubmitting(true);
    try {
      const res = await createOT({
        contrato_id: contratoId,
        tipo_ruta: tipoRuta,
        prioridad,
        descripcion: descripcion.trim() || null,
        fecha_inicio_planeada: fechaInicio || null,
        fecha_fin_planeada: fechaFin || null,
        observaciones: observaciones.trim() || null,
        transformador_id: transformadorId,
      });
      toast.success(`OT ${res.data.codigo} creada`);
      router.push(`/ot/${res.data.id}`);
    } catch (err) {
      const msg = err instanceof ApiError
        ? typeof err.body === "object" && err.body !== null && "error" in err.body
          ? String((err.body as { error: string }).error)
          : `Error ${err.status}`
        : "Error inesperado";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { href: "/ot", label: "Órdenes" }, { label: "Nueva" }]}
        title="Nueva orden"
        titleAccent="de trabajo"
        meta={<span>Al guardar se instancian automáticamente los pasos según el tipo de ruta seleccionado</span>}
        actions={<HeaderActionGhost href="/ot" icon={<ChevronLeft className="h-3.5 w-3.5" />}>Volver</HeaderActionGhost>}
      />

      <form onSubmit={handleSubmit} className="space-y-6 pt-6">
        {/* Sección: Contrato + transformador */}
        <Panel title="Contrato y equipo" subtitle="Vínculos del trabajo" icon={<Factory className="h-3.5 w-3.5" />}>
          <div className="space-y-5">
            <FormField label="Contrato vigente" required htmlFor="contrato">
              <Select value={contratoId?.toString() ?? ""} onValueChange={(v) => setContratoId(v ? Number(v) : null)}>
                <SelectTrigger id="contrato" className="h-10 border-glass bg-glass"><SelectValue placeholder="Seleccioná un contrato" /></SelectTrigger>
                <SelectContent>
                  {contratos.length === 0 && (
                    <SelectItem value="_" disabled>No hay contratos firmados disponibles</SelectItem>
                  )}
                  {contratos.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.codigo} — {c.clientes?.razon_social ?? ""} (${Number(c.monto_total).toFixed(2)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField label="Transformador a intervenir" htmlFor="transformador">
              <Select
                value={transformadorId?.toString() ?? "_"}
                onValueChange={(v) => setTransformadorId(v === "_" ? null : Number(v))}
                disabled={!contratoId}
              >
                <SelectTrigger id="transformador" className="h-10 border-glass bg-glass">
                  <SelectValue placeholder={!contratoId ? "Primero seleccioná un contrato" : "— Sin especificar —"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_">— Sin especificar —</SelectItem>
                  {transformadores.map((t) => (
                    <SelectItem key={t.id} value={t.id.toString()}>
                      {t.codigo_interno ?? `#${t.id}`} · {t.marca ?? ""} {t.modelo ?? ""} · {formatCapacidad(t.capacidad_kva)} · {trfTipoLabel(t.tipo as "distribucion")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {contratoId && transformadores.length === 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Este cliente no tiene transformadores registrados.{" "}
                  <Link href="/transformadores/nuevo" className="text-copper hover:underline">Registrar uno</Link>
                </p>
              )}
            </FormField>
          </div>
        </Panel>

        {/* Sección: Tipo + planificación */}
        <Panel title="Planificación" subtitle="Ruta de producción y fechas">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <FormField label="Tipo de ruta" required htmlFor="tipo">
              <Select value={tipoRuta} onValueChange={(v) => setTipoRuta(v as TipoRuta)}>
                <SelectTrigger id="tipo" className="h-10 border-glass bg-glass"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="reparacion">Reparación · 9 pasos, 2 gates</SelectItem>
                  <SelectItem value="fabricacion">Fabricación · 11 pasos, 3 gates</SelectItem>
                  <SelectItem value="mantenimiento">Mantenimiento · 6 pasos, 1 gate</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Prioridad" htmlFor="prioridad">
              <Select value={prioridad} onValueChange={(v) => setPrioridad(v as PrioridadOT)}>
                <SelectTrigger id="prioridad" className="h-10 border-glass bg-glass"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baja">Baja</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Fecha inicio planeada" htmlFor="ini">
              <Input id="ini" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="h-10 border-glass bg-glass" />
            </FormField>
            <FormField label="Fecha fin planeada" htmlFor="fin">
              <Input id="fin" type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} min={fechaInicio} className="h-10 border-glass bg-glass" />
            </FormField>
          </div>
        </Panel>

        {/* Sección: Descripción + observaciones */}
        <Panel title="Detalles del trabajo" subtitle="Descripción técnica y notas al cliente">
          <div className="space-y-5">
            <FormField label="Descripción del trabajo" htmlFor="desc">
              <Textarea id="desc" rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Ej: Reparación de bobinado primario en transformador 500 kVA, serie TX-1234"
                className="border-glass bg-glass" />
            </FormField>
            <FormField label="Observaciones (visibles al cliente)" htmlFor="obs">
              <Textarea id="obs" rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)}
                className="border-glass bg-glass" />
            </FormField>
          </div>
        </Panel>

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-300 inset-highlight" role="alert">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-glass pt-5">
          <button type="button" onClick={() => router.push("/ot")} disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-4 py-2 text-sm font-medium text-foreground/90 transition hover:border-glass-strong hover:bg-glass-elev disabled:opacity-40">
            Cancelar
          </button>
          <button type="submit" disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-4 py-2 text-sm font-medium text-white shadow-sm glow-copper-sm inset-highlight-md transition hover:glow-copper disabled:opacity-60">
            {submitting ? "Creando…" : "Crear OT"}
          </button>
        </div>
      </form>

      <Toaster richColors position="top-right" theme="dark" />
    </div>
  );
}

export default function NuevaOTPage() {
  return (
    <Suspense fallback={<div className="flex h-[40vh] items-center justify-center text-muted-foreground"><div className="h-6 w-6 animate-spin rounded-full border-2 border-copper border-t-transparent" /></div>}>
      <NuevaOTForm />
    </Suspense>
  );
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════
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
