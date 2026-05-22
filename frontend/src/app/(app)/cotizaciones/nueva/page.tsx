"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toaster, toast } from "sonner";
import { createCotizacion } from "@/lib/cotizaciones";
import { ApiError } from "@/lib/api";
import { CotizacionForm } from "../cotizacion-form";

export default function NuevaCotizacionPage() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <header>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link href="/cotizaciones">
            <ChevronLeft className="mr-1 h-4 w-4" /> Volver a cotizaciones
          </Link>
        </Button>
        <h2 className="text-3xl font-bold">Nueva cotizacion</h2>
        <p className="text-muted-foreground">
          Crea una cotizacion en estado borrador. Puedes editarla libremente antes de enviarla.
        </p>
      </header>

      <CotizacionForm
        onCancel={() => router.push("/cotizaciones")}
        onSubmit={async (payload) => {
          try {
            const res = await createCotizacion(payload);
            toast.success(`Cotizacion ${res.data.codigo} creada`);
            router.push(`/cotizaciones/${res.data.id}`);
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
