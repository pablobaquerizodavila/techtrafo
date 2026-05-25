"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Upload, File as FileIcon, FileText, Trash2, Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Evidencia, eliminarEvidencia, listEvidencias, subirEvidencia, urlEvidencia,
} from "@/lib/dashboard-e";
import { OTPaso } from "@/lib/ot";

interface Props { otId: number; pasos: OTPaso[] }

export function EvidenciasPanel({ otId, pasos }: Props) {
  const [evs, setEvs] = useState<Evidencia[]>([]);
  const [open, setOpen] = useState(false);
  const [previewing, setPreviewing] = useState<Evidencia | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await listEvidencias(otId);
      setEvs(r.data);
    } catch { /* silent */ }
  }, [otId]);
  useEffect(() => { load(); }, [load]);

  async function handleEliminar(ev: Evidencia) {
    if (!window.confirm(`Eliminar "${ev.titulo}"?`)) return;
    try {
      await eliminarEvidencia(otId, ev.id);
      toast.success("Eliminado");
      load();
    } catch {
      toast.error("Error eliminando");
    }
  }

  const fotos = evs.filter((e) => e.tipo === "foto");
  const otros = evs.filter((e) => e.tipo !== "foto");

  return (
    <section className="overflow-hidden rounded-xl border border-glass bg-glass inset-highlight">
      <div className="flex items-center justify-between border-b border-glass px-5 py-3.5">
        <h3 className="flex items-center gap-2 font-display text-sm font-semibold tracking-tight">
          <Camera className="h-4 w-4 text-copper" /> Evidencias
        </h3>
        <Badge variant="outline">{evs.length} archivo{evs.length === 1 ? "" : "s"}</Badge>
      </div>
      <div className="p-5">

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button type="button" className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-3 py-1.5 text-xs font-medium text-foreground/90 transition hover:border-glass-strong hover:bg-glass-elev">
            <Upload className="h-3.5 w-3.5" /> Subir archivo
          </button>
        </DialogTrigger>
        <SubirForm otId={otId} pasos={pasos} onSaved={() => { setOpen(false); load(); }} />
      </Dialog>

      {/* Galería de fotos */}
      {fotos.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Fotos ({fotos.length})</p>
          <div className="grid grid-cols-3 gap-2 md:grid-cols-4 lg:grid-cols-6">
            {fotos.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setPreviewing(f)}
                className="group relative overflow-hidden rounded-lg border border-glass bg-glass-elev"
              >
                <img
                  src={urlEvidencia(otId, f.id)}
                  alt={f.titulo ?? "evidencia"}
                  className="aspect-square w-full object-cover transition group-hover:opacity-80"
                />
                <div className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 via-black/40 to-transparent px-1.5 py-1 text-[10px] text-white">
                  {f.titulo}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Otros (PDF / video / etc) */}
      {otros.length > 0 && (
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Otros archivos ({otros.length})</p>
          <ul className="space-y-2">
            {otros.map((e) => (
              <li key={e.id} className="flex items-center gap-3 rounded-lg border border-glass bg-glass-elev p-2.5 text-sm">
                {e.tipo === "pdf" ? <FileText className="h-5 w-5 text-rose-400" /> : <FileIcon className="h-5 w-5 text-muted-foreground" />}
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium">{e.titulo}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {e.tipo} · {e.tamanio_bytes ? `${(Number(e.tamanio_bytes) / 1024).toFixed(1)} KB` : "—"}
                    {e.ot_pasos && ` · paso ${e.ot_pasos.numero}`}
                    {" · "}{new Date(e.created_at).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" })}
                  </p>
                </div>
                <a href={urlEvidencia(otId, e.id)} target="_blank" rel="noopener noreferrer" className="rounded p-1 text-muted-foreground hover:bg-glass hover:text-copper">
                  <Eye className="h-4 w-4" />
                </a>
                <button onClick={() => handleEliminar(e)} className="rounded p-1 text-rose-400 hover:bg-rose-500/10">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {evs.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-glass bg-glass py-6">
          <Camera className="h-5 w-5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Aún no hay evidencias cargadas</p>
        </div>
      )}
      </div>

      {/* Preview de foto (lightbox simple) */}
      {previewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreviewing(null)}
        >
          <div className="relative max-h-full max-w-4xl">
            <button
              className="absolute -top-10 right-0 rounded p-1 text-white hover:bg-white/10"
              onClick={(e) => { e.stopPropagation(); setPreviewing(null); }}
            >
              <X className="h-6 w-6" />
            </button>
            <img
              src={urlEvidencia(otId, previewing.id)}
              alt={previewing.titulo ?? ""}
              className="max-h-[85vh] rounded shadow-lg"
              onClick={(e) => e.stopPropagation()}
            />
            <p className="mt-2 text-center text-sm text-white">{previewing.titulo}</p>
            <div className="mt-1 text-center">
              <button
                onClick={(e) => { e.stopPropagation(); handleEliminar(previewing); setPreviewing(null); }}
                className="text-xs text-red-300 hover:underline"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function SubirForm({ otId, pasos, onSaved }: { otId: number; pasos: OTPaso[]; onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [pasoId, setPasoId] = useState("_");
  const [tipo, setTipo] = useState<Evidencia["tipo"] | "_">("_");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { toast.error("Seleccioná un archivo"); return; }
    setBusy(true);
    try {
      await subirEvidencia(otId, file, {
        titulo: titulo.trim() || file.name,
        descripcion: descripcion.trim() || undefined,
        paso_id: pasoId === "_" ? null : Number(pasoId),
        tipo: tipo === "_" ? undefined : tipo,
      });
      toast.success(`Subido: ${file.name}`);
      onSaved();
      setFile(null); setTitulo(""); setDescripcion(""); setPasoId("_"); setTipo("_");
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      const e2 = err as { body?: { error?: string; mime?: string; max_bytes?: number } };
      if (e2.body?.error === "tipo_no_permitido") toast.error(`Tipo no permitido: ${e2.body.mime}`);
      else if (e2.body?.error === "archivo_muy_grande") toast.error(`Máximo ${Math.round((e2.body.max_bytes ?? 0) / 1024 / 1024)} MB`);
      else toast.error("Error subiendo archivo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Subir evidencia</DialogTitle>
        <DialogDescription>
          Fotos (jpg, png, webp), PDFs, videos o documentos. Máximo 20 MB.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1">
          <Label>Archivo *</Label>
          <Input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf,video/mp4,video/webm,.xlsx,.csv,.txt"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (f && !titulo) setTitulo(f.name);
            }}
            required
          />
          {file && (
            <p className="text-[10px] text-muted-foreground">
              {file.name} · {(file.size / 1024).toFixed(1)} KB · {file.type}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <Label>Título</Label>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej: Bobinado primario antes de armado" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Paso (opcional)</Label>
            <Select value={pasoId} onValueChange={setPasoId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">— OT general —</SelectItem>
                {pasos.map((p) => (
                  <SelectItem key={p.id} value={p.id.toString()}>{p.numero}. {p.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Tipo (auto si no se elige)</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as Evidencia["tipo"] | "_")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">Auto-detectar</SelectItem>
                <SelectItem value="foto">Foto</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="medicion">Medición</SelectItem>
                <SelectItem value="video">Video</SelectItem>
                <SelectItem value="certificado">Certificado</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label>Descripción</Label>
          <Textarea rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={busy || !file}>{busy ? "Subiendo..." : "Subir"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
