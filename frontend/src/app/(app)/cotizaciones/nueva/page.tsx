"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toaster, toast } from "sonner";
import { createCotizacion } from "@/lib/cotizaciones";
import { getExpediente } from "@/lib/expedientes";
import { ApiError } from "@/lib/api";
import { CotizacionForm } from "../cotizacion-form";

export default function NuevaCotizacionPage() {
  const router = useRouter();
  const params = useSearchParams();

  // Si se viene desde el flujo de un expediente, recibimos expediente_id por
  // query y pre-rellenamos el cliente. Al crear, se vincula automaticamente
  // (expedientes.cotizacion_id = nueva.id), lo que dispara el trigger que
  // avanza el hito "Cotizacion emitida".
  const expedienteIdQuery = params.get("expediente_id");
  const expedienteId = expedienteIdQuery ? Number(expedienteIdQuery) : null;

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

  const initialForm = useMemo(() => {
    if (!clienteIdPrefill) return undefined;
    return { cliente_id: clienteIdPrefill };
  }, [clienteIdPrefill]);

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
            ? `Emisión de cotización para el expediente ${expedienteCodigo ?? expedienteId}. Al crearla queda vinculada y el hito avanza automáticamente.`
            : "Crea una cotización en estado borrador. Puedes editarla libremente antes de enviarla."}
        </p>
      </header>

      <CotizacionForm
        initial={initialForm}
        onCancel={() => router.push(expedienteId ? `/expedientes/${expedienteId}` : "/cotizaciones")}
        onSubmit={async (payload) => {
          try {
            const res = await createCotizacion({
              ...payload,
              expediente_id: expedienteId ?? undefined,
            });
            toast.success(`Cotización ${res.data.codigo} creada`);
            // Si vinimos desde un expediente, volvemos ahi (el hito avanza solo)
            if (expedienteId) {
              router.push(`/expedientes/${expedienteId}`);
            } else {
              router.push(`/cotizaciones/${res.data.id}`);
            }
          } catch (err) {
            const msg =
              err instanceof ApiError
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
