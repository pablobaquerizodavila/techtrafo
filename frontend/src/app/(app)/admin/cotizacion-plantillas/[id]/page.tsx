"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toaster, toast } from "sonner";
import { CotizacionPlantilla, getPlantilla, updatePlantilla } from "@/lib/cotizacion-plantillas";
import { ApiError } from "@/lib/api";
import { PlantillaForm } from "../plantilla-form";

interface PageProps { params: Promise<{ id: string }>; }

export default function EditarPlantillaPage({ params }: PageProps) {
  const router = useRouter();
  const [id, setId] = useState<number | null>(null);
  const [plantilla, setPlantilla] = useState<CotizacionPlantilla | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { params.then(({ id }) => setId(Number(id))); }, [params]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await getPlantilla(id);
      setPlantilla(res.data);
    } catch (err) {
      toast.error(err instanceof ApiError ? `Error ${err.status}` : "Error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);

  if (loading && !plantilla) return <p className="text-muted-foreground">Cargando...</p>;
  if (!plantilla) return null;

  return (
    <div className="space-y-6">
      <header>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link href="/admin/cotizacion-plantillas"><ChevronLeft className="mr-1 h-4 w-4" /> Volver</Link>
        </Button>
        <h2 className="text-3xl font-bold">{plantilla.codigo}</h2>
        <p className="text-muted-foreground">{plantilla.nombre}</p>
      </header>
      <PlantillaForm
        initial={plantilla}
        onCancel={() => router.push("/admin/cotizacion-plantillas")}
        onSubmit={async (payload) => {
          try {
            const res = await updatePlantilla(plantilla.id, payload);
            toast.success("Plantilla actualizada");
            setPlantilla(res.data);
          } catch (err) {
            const msg = err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error";
            toast.error(msg);
            throw err;
          }
        }}
      />
      <Toaster richColors position="top-right" />
    </div>
  );
}
