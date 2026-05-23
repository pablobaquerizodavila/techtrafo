"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
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
import { Toaster, toast } from "sonner";
import { listClientes, Cliente } from "@/lib/clientes";
import {
  CanalOrigen,
  TipoServicioEstimado,
  createExpediente,
} from "@/lib/expedientes";
import { ApiError } from "@/lib/api";

export default function NuevoExpedientePage() {
  const router = useRouter();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [tipoServicio, setTipoServicio] = useState<TipoServicioEstimado>("reparacion");
  const [canal, setCanal] = useState<CanalOrigen | "">("");
  const [descripcion, setDescripcion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listClientes({ limit: 200 })
      .then((r) => setClientes(r.data))
      .catch(() => setClientes([]));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!clienteId) {
      setError("Selecciona un cliente");
      return;
    }
    setSubmitting(true);
    try {
      const res = await createExpediente({
        cliente_id: clienteId,
        tipo_servicio_estimado: tipoServicio,
        canal_origen: canal || null,
        descripcion_problema: descripcion.trim() || null,
      });
      toast.success(`Expediente ${res.data.codigo} creado`);
      router.push(`/expedientes/${res.data.id}`);
    } catch (err) {
      const msg =
        err instanceof ApiError
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
    <div className="space-y-6">
      <header>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link href="/expedientes">
            <ChevronLeft className="mr-1 h-4 w-4" /> Volver a expedientes
          </Link>
        </Button>
        <h2 className="text-3xl font-bold">Nuevo expediente</h2>
        <p className="text-muted-foreground">
          Registra el pedido de un cliente. Al guardar se instancia automaticamente la hoja de ruta de hitos.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
        <div className="space-y-2">
          <Label htmlFor="cliente">Cliente *</Label>
          <Select
            value={clienteId?.toString() ?? ""}
            onValueChange={(v) => setClienteId(v ? Number(v) : null)}
          >
            <SelectTrigger id="cliente">
              <SelectValue placeholder="Selecciona un cliente" />
            </SelectTrigger>
            <SelectContent>
              {clientes.map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>
                  {c.razon_social} ({c.ruc_cedula})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="tipo_servicio">Tipo de servicio estimado *</Label>
            <Select value={tipoServicio} onValueChange={(v) => setTipoServicio(v as TipoServicioEstimado)}>
              <SelectTrigger id="tipo_servicio">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reparacion">Reparacion</SelectItem>
                <SelectItem value="fabricacion">Fabricacion</SelectItem>
                <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Se confirma luego de la visita tecnica. Define el flujo inicial de hitos.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="canal">Canal de origen</Label>
            <Select value={canal || "_"} onValueChange={(v) => setCanal(v === "_" ? "" : (v as CanalOrigen))}>
              <SelectTrigger id="canal">
                <SelectValue placeholder="Selecciona el canal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_">— Sin especificar —</SelectItem>
                <SelectItem value="web">Web</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="telefono">Telefono</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="referido">Referido</SelectItem>
                <SelectItem value="visita_directa">Visita directa</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="descripcion">Descripcion del problema / requerimiento</Label>
          <Textarea
            id="descripcion"
            rows={5}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Ej: Transformador de 500 KVA con falla en bobinado primario, requiere diagnostico en sitio."
          />
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={() => router.push("/expedientes")} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creando..." : "Crear expediente"}
          </Button>
        </div>
      </form>

      <Toaster richColors position="top-right" />
    </div>
  );
}
