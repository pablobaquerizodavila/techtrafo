"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Send, CheckCircle2, XCircle, Ban, FileText, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Toaster, toast } from "sonner";
import {
  Cotizacion,
  TransicionAccion,
  estadoVariant,
  getCotizacion,
  transicionCotizacion,
  transicionesPosibles,
  updateCotizacion,
} from "@/lib/cotizaciones";
import { ApiError } from "@/lib/api";
import { CotizacionForm } from "../cotizacion-form";

interface PageProps {
  params: Promise<{ id: string }>;
}

const accionConfig: Record<TransicionAccion, { label: string; icon: typeof Send; variant: "default" | "outline" | "destructive" }> = {
  enviar: { label: "Enviar al cliente", icon: Send, variant: "default" },
  aprobar: { label: "Marcar como aprobada", icon: CheckCircle2, variant: "default" },
  rechazar: { label: "Marcar como rechazada", icon: XCircle, variant: "destructive" },
  cancelar: { label: "Cancelar", icon: Ban, variant: "destructive" },
  vencer: { label: "Marcar como vencida", icon: Clock, variant: "outline" },
  convertir: { label: "Convertir a contrato", icon: FileText, variant: "default" },
};

export default function CotizacionDetallePage({ params }: PageProps) {
  const router = useRouter();
  const [id, setId] = useState<number | null>(null);
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then(({ id }) => setId(Number(id)));
  }, [params]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getCotizacion(id);
      setCotizacion(res.data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError("Cotizacion no encontrada");
      } else {
        setError(err instanceof Error ? err.message : "Error cargando");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) load();
  }, [id, load]);

  async function handleTransicion(accion: TransicionAccion) {
    if (!cotizacion) return;
    // Convertir tiene flujo propio: navegar a /contratos/nuevo precargado
    if (accion === "convertir") {
      router.push(`/contratos/nuevo?cotizacion=${cotizacion.id}`);
      return;
    }
    if (["rechazar", "cancelar", "vencer"].includes(accion)) {
      const motivo = window.prompt(`Motivo de ${accion}:`);
      if (motivo === null) return;
      try {
        await transicionCotizacion(cotizacion.id, accion, motivo);
        toast.success(`Cotizacion ${accion === "cancelar" ? "cancelada" : accion + "da"}`);
        load();
      } catch (err) {
        toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error");
      }
      return;
    }
    if (!window.confirm(`Confirmar: ${accionConfig[accion].label}?`)) return;
    try {
      await transicionCotizacion(cotizacion.id, accion);
      toast.success(`Estado actualizado`);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error");
    }
  }

  if (loading && !cotizacion) {
    return <div className="text-muted-foreground">Cargando cotizacion...</div>;
  }
  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/cotizaciones"><ChevronLeft className="mr-1 h-4 w-4" /> Volver</Link>
        </Button>
        <p className="text-destructive">{error}</p>
      </div>
    );
  }
  if (!cotizacion) return null;

  const editable = cotizacion.estado !== "convertida" && cotizacion.estado !== "cancelada" && cotizacion.estado !== "rechazada";
  const transiciones = transicionesPosibles(cotizacion.estado);

  return (
    <div className="space-y-6">
      <header>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link href="/cotizaciones">
            <ChevronLeft className="mr-1 h-4 w-4" /> Volver a cotizaciones
          </Link>
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">{cotizacion.codigo}</h2>
            <p className="text-muted-foreground">
              {cotizacion.clientes?.razon_social} ({cotizacion.clientes?.ruc_cedula})
              {" · "}revision {cotizacion.revision_actual}
            </p>
          </div>
          <Badge variant={estadoVariant(cotizacion.estado)} className="text-base">
            {cotizacion.estado.toUpperCase()}
          </Badge>
        </div>
      </header>

      {/* Botones de transicion */}
      {transiciones.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-3">
          <span className="text-sm font-medium">Acciones:</span>
          {transiciones.map((accion) => {
            const cfg = accionConfig[accion];
            const Icon = cfg.icon;
            return (
              <Button
                key={accion}
                variant={cfg.variant}
                size="sm"
                onClick={() => handleTransicion(accion)}
              >
                <Icon className="mr-2 h-4 w-4" /> {cfg.label}
              </Button>
            );
          })}
        </div>
      )}

      {/* Revisiones (si hay) */}
      {cotizacion.cotizacion_revisiones && cotizacion.cotizacion_revisiones.length > 0 && (
        <details className="rounded-md border p-3 text-sm">
          <summary className="cursor-pointer font-medium">
            {cotizacion.cotizacion_revisiones.length} revision{cotizacion.cotizacion_revisiones.length === 1 ? "" : "es"} previas
          </summary>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {cotizacion.cotizacion_revisiones.map((r) => (
              <li key={r.id}>
                <span className="font-mono">rev {r.revision}</span>
                {" · "}
                {new Date(r.created_at).toLocaleString("es-EC")}
                {r.motivo && ` · ${r.motivo}`}
              </li>
            ))}
          </ul>
        </details>
      )}

      <CotizacionForm
        initial={cotizacion}
        readOnly={!editable}
        onCancel={() => router.push("/cotizaciones")}
        onSubmit={async (payload) => {
          try {
            const res = await updateCotizacion(cotizacion.id, payload);
            toast.success(`Cotizacion ${res.data.codigo} actualizada`);
            setCotizacion(res.data);
          } catch (err) {
            const msg = err instanceof ApiError
              ? typeof err.body === "object" && err.body !== null && "error" in err.body
                ? String((err.body as { error: string }).error)
                : `Error ${err.status}`
              : "Error inesperado";
            toast.error(msg);
            throw err;
          }
        }}
      />

      <Toaster richColors position="top-right" />
    </div>
  );
}
