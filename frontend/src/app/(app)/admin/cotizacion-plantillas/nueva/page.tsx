"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toaster, toast } from "sonner";
import { createPlantilla } from "@/lib/cotizacion-plantillas";
import { ApiError } from "@/lib/api";
import { PlantillaForm } from "../plantilla-form";

export default function NuevaPlantillaPage() {
  const router = useRouter();
  return (
    <div className="space-y-6">
      <header>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link href="/admin/cotizacion-plantillas"><ChevronLeft className="mr-1 h-4 w-4" /> Volver</Link>
        </Button>
        <h2 className="text-3xl font-bold">Nueva plantilla de cotización</h2>
      </header>
      <PlantillaForm
        onCancel={() => router.push("/admin/cotizacion-plantillas")}
        onSubmit={async (payload) => {
          try {
            const res = await createPlantilla(payload);
            toast.success(`Plantilla ${res.data.codigo} creada`);
            router.push(`/admin/cotizacion-plantillas/${res.data.id}`);
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
