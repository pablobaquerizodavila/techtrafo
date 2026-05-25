"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, FolderOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Toaster, toast } from "sonner";
import { PageHeader, HeaderActionGhost } from "@/components/page-header";
import { Panel } from "@/components/panel";
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
    if (!clienteId) { setError("Seleccioná un cliente"); return; }
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
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { href: "/expedientes", label: "Expedientes" }, { label: "Nuevo" }]}
        title="Nuevo"
        titleAccent="expediente"
        meta={<span>Al guardar se instancia automáticamente la hoja de ruta de hitos</span>}
        actions={<HeaderActionGhost href="/expedientes" icon={<ChevronLeft className="h-3.5 w-3.5" />}>Volver</HeaderActionGhost>}
      />

      <form onSubmit={handleSubmit} className="space-y-6 pt-6">
        <Panel title="Cliente y origen" icon={<FolderOpen className="h-3.5 w-3.5" />}>
          <div className="space-y-5">
            <FormField label="Cliente" required htmlFor="cliente">
              <Select value={clienteId?.toString() ?? ""} onValueChange={(v) => setClienteId(v ? Number(v) : null)}>
                <SelectTrigger id="cliente" className="h-10 border-glass bg-glass"><SelectValue placeholder="Seleccioná un cliente" /></SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.razon_social} <span className="font-mono text-xs text-muted-foreground">({c.ruc_cedula})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <FormField label="Tipo de servicio estimado" required htmlFor="tipo_servicio">
                <Select value={tipoServicio} onValueChange={(v) => setTipoServicio(v as TipoServicioEstimado)}>
                  <SelectTrigger id="tipo_servicio" className="h-10 border-glass bg-glass"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reparacion">Reparación</SelectItem>
                    <SelectItem value="fabricacion">Fabricación</SelectItem>
                    <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">Se confirma luego de la visita técnica. Define el flujo inicial de hitos.</p>
              </FormField>
              <FormField label="Canal de origen" htmlFor="canal">
                <Select value={canal || "_"} onValueChange={(v) => setCanal(v === "_" ? "" : (v as CanalOrigen))}>
                  <SelectTrigger id="canal" className="h-10 border-glass bg-glass"><SelectValue placeholder="Seleccioná el canal" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_">— Sin especificar —</SelectItem>
                    <SelectItem value="web">Web</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="telefono">Teléfono</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="referido">Referido</SelectItem>
                    <SelectItem value="visita_directa">Visita directa</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            </div>
          </div>
        </Panel>

        <Panel title="Descripción del problema" subtitle="Información que ayudará al diagnóstico técnico">
          <FormField label="Descripción / requerimiento" htmlFor="descripcion">
            <Textarea id="descripcion" rows={5} value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej: Transformador de 500 kVA con falla en bobinado primario, requiere diagnóstico en sitio."
              className="border-glass bg-glass" />
          </FormField>
        </Panel>

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-300 inset-highlight" role="alert">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-glass pt-5">
          <button type="button" onClick={() => router.push("/expedientes")} disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-4 py-2 text-sm font-medium text-foreground/90 transition hover:border-glass-strong hover:bg-glass-elev disabled:opacity-40">
            Cancelar
          </button>
          <button type="submit" disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-4 py-2 text-sm font-medium text-white shadow-sm glow-copper-sm inset-highlight-md transition hover:glow-copper disabled:opacity-60">
            {submitting ? "Creando…" : "Crear expediente"}
          </button>
        </div>
      </form>

      <Toaster richColors position="top-right" theme="dark" />
    </div>
  );
}

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
