"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, FileText, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Toaster, toast } from "sonner";
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
      if (expedienteId) {
        router.push(`/expedientes/${expedienteId}`);
      } else {
        router.push(`/cotizaciones/${res.data.id}`);
      }
    } catch (err) {
      const msg = err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error";
      toast.error(msg);
    } finally {
      setCreandoDesdePlantilla(false);
    }
  }

  if (expedienteId && cargandoCtx) {
    return <div className="p-6 text-muted-foreground">Cargando contexto del expediente...</div>;
  }

  return (
    <div className="space-y-6">
      <header>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link href={expedienteId ? `/expedientes/${expedienteId}` : "/cotizaciones"}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            {expedienteId ? `Volver al expediente ${expedienteCodigo ?? ""}` : "Volver a cotizaciones"}
          </Link>
        </Button>
        <h2 className="text-3xl font-bold">Nueva cotización</h2>
        <p className="text-muted-foreground">
          {expedienteId
            ? `Emisión para el expediente ${expedienteCodigo ?? expedienteId}.`
            : "Crea una cotización en estado borrador."}
        </p>
      </header>

      {/* Selector de modo */}
      <div className="rounded-md border bg-muted/20 p-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={modo === "manual" ? "default" : "outline"}
            size="sm"
            onClick={() => setModo("manual")}
          >
            <FileText className="mr-1 h-4 w-4" /> Manual (línea por línea)
          </Button>
          <Button
            variant={modo === "plantilla" ? "default" : "outline"}
            size="sm"
            onClick={() => setModo("plantilla")}
            disabled={plantillas.length === 0 || !clienteIdPrefill}
            title={!clienteIdPrefill ? "Solo disponible con expediente vinculado" : ""}
          >
            <Wand2 className="mr-1 h-4 w-4" /> Desde plantilla
          </Button>
        </div>
        {modo === "plantilla" && plantillas.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            No hay plantillas activas. Crealas en <Link href="/admin/cotizacion-plantillas" className="underline">admin / plantillas</Link>.
          </p>
        )}
        {modo === "plantilla" && !clienteIdPrefill && (
          <p className="mt-2 text-sm text-muted-foreground">
            La generación desde plantilla requiere venir desde un expediente (`?expediente_id=...`).
          </p>
        )}
      </div>

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
        <div className="space-y-4 rounded-md border p-4">
          <div className="space-y-1">
            <Label>Seleccionar plantilla *</Label>
            <Select
              value={plantillaSeleccionada?.toString() ?? ""}
              onValueChange={(v) => setPlantillaSeleccionada(Number(v))}
            >
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {plantillas.map((p) => (
                  <SelectItem key={p.id} value={p.id.toString()}>
                    <span className="font-mono text-xs">{p.codigo}</span> · {p.nombre}
                    {(p.capacidad_kva_min || p.capacidad_kva_max) && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({p.capacidad_kva_min ?? "—"}–{p.capacidad_kva_max ?? "—"} kVA)
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {plantillaActual && (
            <div className="rounded border bg-muted/30 p-3 text-sm">
              <p className="font-semibold">{plantillaActual.nombre}</p>
              <p className="text-muted-foreground">{plantillaActual.descripcion}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <Badge variant="muted">Tipo: {plantillaActual.tipo_servicio}</Badge>
                <Badge variant="muted">Margen {Number(plantillaActual.margen_porcentaje_default).toFixed(1)}%</Badge>
                <Badge variant="muted">Contingencia {Number(plantillaActual.contingencia_porcentaje).toFixed(1)}%</Badge>
                <Badge variant="muted">IVA {Number(plantillaActual.iva_porcentaje_default).toFixed(1)}%</Badge>
                <Badge variant="muted">Entrega base {plantillaActual.tiempo_entrega_base_dias}d</Badge>
                <Badge variant="muted">
                  <FileText className="mr-1 h-3 w-3" />
                  {plantillaActual._count?.plantilla_componentes ?? 0} componentes
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Al generar la cotización, el sistema verifica stock contra bodega para cada componente con item asociado.
                Si falta stock, la línea queda con flag <em>pendiente de aprovisionamiento</em>.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t pt-3">
            <Button variant="outline" onClick={() => setModo("manual")}>Cancelar</Button>
            <Button onClick={handleGenerarDesdePlantilla} disabled={!plantillaSeleccionada || creandoDesdePlantilla}>
              <Wand2 className="mr-1 h-4 w-4" />
              {creandoDesdePlantilla ? "Generando..." : "Generar cotización"}
            </Button>
          </div>
        </div>
      )}

      <Toaster richColors position="top-right" />
    </div>
  );
}
