"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Lightbulb, Paperclip } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Toaster, toast } from "sonner";
import { PageHeader, HeaderActionGhost } from "@/components/page-header";
import { Panel } from "@/components/panel";
import {
  TipoReq, PrioridadReq, crear, subirAdjunto, TIPOS, PRIORIDADES,
} from "@/lib/requerimientos";
import { ApiError } from "@/lib/api";

const MODULOS = [
  "Compras", "Ventas/Cotizaciones", "Contratos", "Inventario",
  "Producción/OT", "Garantías", "Clientes", "Usuarios/Admin", "Dashboard", "Otro",
];

function errMsg(err: unknown): string {
  if (err instanceof ApiError) {
    const code = String((err.body as { error?: string })?.error ?? err.status);
    const map: Record<string, string> = {
      validacion: "Revisá los campos obligatorios",
      sin_permiso: "No tenés permiso para crear requerimientos",
    };
    return map[code] ?? code;
  }
  return "Error inesperado";
}

export default function NuevaRequerimientoPage() {
  const router = useRouter();

  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<TipoReq | "">("");
  const [modulo, setModulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [problema, setProblema] = useState("");
  const [resultado, setResultado] = useState("");
  const [prioridad, setPrioridad] = useState<PrioridadReq>("media");
  const [fechaRequerida, setFechaRequerida] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!titulo.trim()) { setError("El título es obligatorio"); return; }
    if (!tipo) { setError("Seleccioná el tipo de requerimiento"); return; }
    if (!descripcion.trim()) { setError("La descripción es obligatoria"); return; }

    setSubmitting(true);
    try {
      const { data } = await crear({
        titulo: titulo.trim(),
        tipo: tipo as TipoReq,
        modulo_relacionado: modulo.trim() || null,
        descripcion: descripcion.trim(),
        problema: problema.trim() || null,
        resultado_esperado: resultado.trim() || null,
        prioridad_sugerida: prioridad,
        fecha_requerida: fechaRequerida || null,
      });

      for (const file of files) {
        try {
          await subirAdjunto(data.id, file);
        } catch {
          toast.error(`No se pudo subir: ${file.name}`);
        }
      }

      toast.success("Requerimiento creado");
      router.push(`/requerimientos/${data.id}`);
    } catch (err) {
      const msg = errMsg(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { href: "/requerimientos", label: "Requerimientos" }, { label: "Nuevo" }]}
        title="Nuevo"
        titleAccent="requerimiento"
        meta={<span>Describí qué necesitás; el equipo de desarrollo lo revisará y priorizará</span>}
        actions={<HeaderActionGhost href="/requerimientos" icon={<ChevronLeft className="h-3.5 w-3.5" />}>Volver</HeaderActionGhost>}
      />

      <form onSubmit={handleSubmit} className="space-y-6 pt-6">
        {/* Qué necesitás */}
        <Panel title="Qué necesitás" subtitle="Título, tipo y módulo relacionado" icon={<Lightbulb className="h-3.5 w-3.5" />}>
          <div className="space-y-5">
            <FormField label="Título" required htmlFor="titulo">
              <Input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ej: Agregar filtro por rango de fechas al listado de compras"
                className="h-10 border-glass bg-glass" maxLength={200} />
            </FormField>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <FormField label="Tipo" required htmlFor="tipo">
                <Select value={tipo || undefined} onValueChange={(v) => setTipo(v as TipoReq)}>
                  <SelectTrigger id="tipo" className="h-10 border-glass bg-glass"><SelectValue placeholder="Seleccioná un tipo" /></SelectTrigger>
                  <SelectContent>
                    {TIPOS.map((t) => (<SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Módulo relacionado" htmlFor="modulo">
                <Input id="modulo" value={modulo} onChange={(e) => setModulo(e.target.value)}
                  list="modulos-list" placeholder="Ej: Compras" className="h-10 border-glass bg-glass" />
                <datalist id="modulos-list">
                  {MODULOS.map((m) => (<option key={m} value={m} />))}
                </datalist>
              </FormField>
            </div>
          </div>
        </Panel>

        {/* Detalle */}
        <Panel title="Detalle" subtitle="Descripción, problema y resultado esperado">
          <div className="space-y-5">
            <FormField label="Descripción" required htmlFor="desc">
              <Textarea id="desc" rows={4} value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Explicá con detalle qué querés que se haga…" className="border-glass bg-glass" />
            </FormField>
            <FormField label="Problema o situación actual" htmlFor="problema">
              <Textarea id="problema" rows={3} value={problema} onChange={(e) => setProblema(e.target.value)}
                placeholder="¿Qué dificultad o carencia estás enfrentando hoy?" className="border-glass bg-glass" />
            </FormField>
            <FormField label="Resultado esperado" htmlFor="resultado">
              <Textarea id="resultado" rows={3} value={resultado} onChange={(e) => setResultado(e.target.value)}
                placeholder="¿Cómo se vería la solución ideal?" className="border-glass bg-glass" />
            </FormField>
          </div>
        </Panel>

        {/* Prioridad + adjuntos */}
        <Panel title="Prioridad y adjuntos" subtitle="Urgencia sugerida y archivos de apoyo">
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <FormField label="Prioridad sugerida" htmlFor="prioridad">
                <Select value={prioridad} onValueChange={(v) => setPrioridad(v as PrioridadReq)}>
                  <SelectTrigger id="prioridad" className="h-10 border-glass bg-glass"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORIDADES.map((p) => (<SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Fecha requerida" htmlFor="fecha">
                <Input id="fecha" type="date" value={fechaRequerida} onChange={(e) => setFechaRequerida(e.target.value)}
                  className="h-10 border-glass bg-glass" />
              </FormField>
            </div>
            <FormField label="Adjuntos" htmlFor="adjuntos">
              <Input id="adjuntos" type="file" multiple
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                className="border-glass bg-glass" />
              {files.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {files.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 font-mono text-[10.5px] text-muted-foreground">
                      <Paperclip className="h-3 w-3" /> {f.name} · {(f.size / 1024).toFixed(1)} KB
                    </li>
                  ))}
                </ul>
              )}
            </FormField>
          </div>
        </Panel>

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-300 inset-highlight" role="alert">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-glass pt-5">
          <button type="button" onClick={() => router.back()} disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-4 py-2 text-sm font-medium text-foreground/90 transition hover:border-glass-strong hover:bg-glass-elev disabled:opacity-40">
            Cancelar
          </button>
          <button type="submit" disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-4 py-2 text-sm font-medium text-white shadow-sm glow-copper-sm inset-highlight-md transition hover:glow-copper disabled:opacity-60">
            {submitting ? "Creando…" : "Crear requerimiento"}
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
