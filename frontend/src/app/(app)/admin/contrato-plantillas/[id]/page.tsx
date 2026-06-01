"use client";

import { useEffect, useState } from "react";
import { ContratoPlantilla, getContratoPlantilla } from "@/lib/contrato-plantillas";
import { ContratoPlantillaForm } from "../plantilla-form";

interface PageProps { params: Promise<{ id: string }> }

export default function EditarContratoPlantillaPage({ params }: PageProps) {
  const [plantilla, setPlantilla] = useState<ContratoPlantilla | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    params.then(({ id }) => {
      getContratoPlantilla(Number(id))
        .then((r) => setPlantilla(r.data))
        .catch(() => setError("No se pudo cargar la plantilla"));
    });
  }, [params]);

  if (error) {
    return <div className="pt-6"><div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-200">{error}</div></div>;
  }
  if (!plantilla) {
    return (
      <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-copper border-t-transparent" />
          <span className="text-sm">Cargando…</span>
        </div>
      </div>
    );
  }
  return <ContratoPlantillaForm initial={plantilla} />;
}
