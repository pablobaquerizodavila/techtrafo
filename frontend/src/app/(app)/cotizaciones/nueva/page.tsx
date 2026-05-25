"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, FileText, Wand2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Toaster, toast } from "sonner";
import { PageHeader, HeaderActionGhost } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { createCotizacion } from "@/lib/cotizaciones";
import { CotizacionPlantilla, crearDesdePlantilla, listPlantillas } from "@/lib/cotizacion-plantillas";
import { getExpediente } from "@/lib/expedientes";
import { ApiError } from "@/lib/api";
import { CotizacionForm } from "../cotizacion-form";

export default function NuevaCotizacionPage() {
  const router = useRouter();
  const params = useSearchParams();

  const expedienteIdQuery = params.get("expediente_id");
  const expedienteId = expedienteIdQuery ? Number(expedienteIdQuery) : null;

  const [modo, setModo] = useState<"manual" | "plantilla">("manual");
  const [plantillas, setPlantillas] = useState<CotizacionPlantilla[]>([]);
  const [plantillaSeleccionada, setPlantillaSeleccionada] = useState<number | null>(null);
  const [creandoDesdePlantilla, setCreandoDesdePlantilla] = useState(false);

  const [clienteIdPrefill, setClienteIdPrefill] = useState<number | null>(null);
  const [expedienteCodigo, setExpedienteCodigo] = useState<string | null>(null);
  const [cargandoCtx, setCargandoCtx] = useState(false);

  useEffect(() => {
    if (!expedienteId) return;
    setCargandoCtx(true);
    getExpediente(expedienteId)
      .then((r) => {
        setClienteIdPrefill(r.data.cliente_id);
        setExpedienteCodigo(r.data.codigo);
      })
      .catch(() => toast.error("Error cargando expediente vinculado"))
      .finally(() => setCargandoCtx(false));
  }, [expedienteId]);

  useEffect(() => {
    listPlantillas({ activo: true })
      .then((r) => setPlantillas(r.data))
      .catch(() => {});
  }, []);

  const initialForm = useMemo(() => {
    if (!clienteIdPrefill) return undefined;
    return { cliente_id: clienteIdPrefill };
  }, [clienteIdPrefill]);

  const plantillaActual = plantillaSeleccionada
    ? plantillas.find((p) => p.id === plantillaSeleccionada) ?? null
    : null;

  async function handleGenerarDesdePlantilla() {
    if (!plantillaSeleccionada || !clienteIdPrefill) return;
    setCreandoDesdePlantilla(true);
    try {
      const res = await crearDesdePlantilla({
        plantilla_id: plantillaSeleccionada,
        cliente_id: clienteIdPrefill,
        expediente_id: expedienteId ?? undefined,
      });
      const pendientes = res.meta.lineas_pendientes_aprovisionamiento;
      toast.success(
        `Cotización ${res.data.codigo} creada${pendientes > 0 ? ` · ${pendientes} líneas pendientes de aprovisionamiento` : ""}`,
      );
      if (expedienteId) router.push(`/expedientes/${expedienteId}`);
      else router.push(`/cotizaciones/${res.data.id}`);
    } catch (err) {
      const msg = err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error";
      toast.error(msg);
    } finally {
      setCreandoDesdePlantilla(false);
    }
  }

  if (expedienteId && cargandoCtx) {
    return (
      <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-copper border-t-transparent" />
          <span className="text-sm">Cargando contexto del expediente…</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        breadcrumb={[
          { href: "/dashboard", label: "Panel" },
          { href: "/cotizaciones", label: "Cotizaciones" },
          { label: "Nueva" },
        ]}
        title="Nueva"
        titleAccent="cotización"
        meta={
          expedienteId
            ? <span>Emisión para el expediente <Link href={`/expedientes/${expedienteId}`} className="font-mono text-copper hover:underline">{expedienteCodigo ?? expedienteId}</Link></span>
            : <span>Se creará en estado <span className="text-foreground">borrador</span></span>
        }
        actions={
          <HeaderActionGhost
            href={expedienteId ? `/expedientes/${expedienteId}` : "/cotizaciones"}
            icon={<ChevronLeft className="h-3.5 w-3.5" />}
          >
            Volver
          </HeaderActionGhost>
        }
      />

      <div className="space-y-6 pt-6">
        {/* Selector de modo */}
        <Panel title="Modo de creación" subtitle="Manual o desde plantilla">
          <div className="flex flex-wrap gap-2">
            <ModeBtn active={modo === "manual"} onClick={() => setModo("manual")} icon={<FileText className="h-3.5 w-3.5" />}>
              Manual · línea por línea
            </ModeBtn>
            <ModeBtn
              active={modo === "plantilla"}
              onClick={() => setModo("plantilla")}
              icon={<Wand2 className="h-3.5 w-3.5" />}
              disabled={plantillas.length === 0 || !clienteIdPrefill}
              title={!clienteIdPrefill ? "Solo disponible con expediente vinculado" : ""}
            >
              Desde plantilla
            </ModeBtn>
          </div>
          {modo === "plantilla" && plantillas.length === 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              No hay plantillas activas. Creálas en{" "}
              <Link href="/admin/cotizacion-plantillas" className="text-copper hover:underline">admin / plantillas</Link>.
            </p>
          )}
          {modo === "plantilla" && !clienteIdPrefill && (
            <p className="mt-3 text-xs text-muted-foreground">
              La generación desde plantilla requiere venir desde un expediente (<span className="font-mono text-copper">?expediente_id=…</span>).
            </p>
          )}
        </Panel>

        {modo === "manual" && (
          <CotizacionForm
            initial={initialForm}
            onCancel={() => router.push(expedienteId ? `/expedientes/${expedienteId}` : "/cotizaciones")}
            onSubmit={async (payload) => {
              try {
                const res = await createCotizacion({ ...payload, expediente_id: expedienteId ?? undefined });
                toast.success(`Cotización ${res.data.codigo} creada`);
                if (expedienteId) router.push(`/expedientes/${expedienteId}`);
                else router.push(`/cotizaciones/${res.data.id}`);
              } catch (err) {
                const msg = err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error";
                toast.error(msg);
                throw err;
              }
            }}
          />
        )}

        {modo === "plantilla" && (
          <Panel title="Plantilla a usar" subtitle="El sistema verifica stock contra bodega al generar">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">Plantilla <span className="text-copper">*</span></Label>
                <Select
                  value={plantillaSeleccionada?.toString() ?? ""}
                  onValueChange={(v) => setPlantillaSeleccionada(Number(v))}
                >
                  <SelectTrigger className="h-10 border-glass bg-glass"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {plantillas.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>
                        <span className="font-mono text-xs text-copper">{p.codigo}</span>
                        <span className="mx-1.5 text-muted-foreground/40">·</span>
                        {p.nombre}
                        {(p.capacidad_kva_min || p.capacidad_kva_max) && (
                          <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                            ({p.capacidad_kva_min ?? "—"}–{p.capacidad_kva_max ?? "—"} kVA)
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {plantillaActual && (
                <div className="rounded-xl border border-glass bg-glass-elev p-4 inset-highlight">
                  <p className="font-display text-sm font-semibold">{plantillaActual.nombre}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{plantillaActual.descripcion}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="muted">Tipo: {plantillaActual.tipo_servicio}</Badge>
                    <Badge variant="copper">Margen {Number(plantillaActual.margen_porcentaje_default).toFixed(1)}%</Badge>
                    <Badge variant="muted">Contingencia {Number(plantillaActual.contingencia_porcentaje).toFixed(1)}%</Badge>
                    <Badge variant="muted">IVA {Number(plantillaActual.iva_porcentaje_default).toFixed(1)}%</Badge>
                    <Badge variant="muted">Entrega base {plantillaActual.tiempo_entrega_base_dias}d</Badge>
                    <Badge variant="teal"><FileText className="mr-1 h-3 w-3" />{plantillaActual._count?.plantilla_componentes ?? 0} componentes</Badge>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Al generar la cotización, el sistema verifica stock contra bodega para cada componente con item asociado.
                    Si falta stock, la línea queda con flag <em className="text-amber-300">pendiente de aprovisionamiento</em>.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-glass pt-4">
                <button type="button" onClick={() => setModo("manual")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-4 py-2 text-sm font-medium text-foreground/90 transition hover:border-glass-strong hover:bg-glass-elev">
                  Cancelar
                </button>
                <button type="button" onClick={handleGenerarDesdePlantilla} disabled={!plantillaSeleccionada || creandoDesdePlantilla}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-4 py-2 text-sm font-medium text-white shadow-sm glow-copper-sm inset-highlight-md transition hover:glow-copper disabled:opacity-60">
                  <Wand2 className="h-3.5 w-3.5" />
                  {creandoDesdePlantilla ? "Generando…" : "Generar cotización"}
                </button>
              </div>
            </div>
          </Panel>
        )}
      </div>

      <Toaster richColors position="top-right" theme="dark" />
    </div>
  );
}

function ModeBtn({
  active, onClick, icon, children, disabled, title,
}: {
  active: boolean; onClick: () => void; icon: React.ReactNode;
  children: React.ReactNode; disabled?: boolean; title?: string;
}) {
  const cls = active
    ? "inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-3.5 py-2 text-xs font-medium text-white shadow-sm glow-copper-sm inset-highlight-md"
    : "inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-3.5 py-2 text-xs font-medium text-foreground/90 transition hover:border-glass-strong hover:bg-glass-elev disabled:opacity-40 disabled:pointer-events-none";
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} className={cls}>
      {icon} {children}
    </button>
  );
}
