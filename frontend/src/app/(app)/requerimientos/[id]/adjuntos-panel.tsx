"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Paperclip, Upload, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Panel } from "@/components/panel";
import { Adjunto, adjuntos, subirAdjunto, urlAdjunto } from "@/lib/requerimientos";

interface Props { id: string; puedeSubir: boolean }

function formatTamano(bytes?: string | number | null): string {
  if (bytes === null || bytes === undefined) return "—";
  const n = Number(bytes);
  if (Number.isNaN(n)) return "—";
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024).toFixed(1)} KB`;
}

export function AdjuntosPanel({ id, puedeSubir }: Props) {
  const [items, setItems] = useState<Adjunto[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await adjuntos(id);
      setItems(r.data);
    } catch { /* silent */ }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await subirAdjunto(id, file);
      toast.success(`Subido: ${file.name}`);
      load();
    } catch (err) {
      const e2 = err as { status?: number; body?: { error?: string; mime?: string; max_bytes?: number } };
      if (e2.status === 413 || e2.body?.error === "archivo_muy_grande") {
        toast.error(e2.body?.max_bytes ? `Máximo ${Math.round(e2.body.max_bytes / 1024 / 1024)} MB` : "Archivo demasiado grande");
      } else if (e2.body?.error === "tipo_no_permitido") {
        toast.error(`Tipo no permitido: ${e2.body.mime ?? ""}`);
      } else {
        toast.error("Error subiendo archivo");
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Panel
      title="Adjuntos"
      subtitle={`${items.length} archivo${items.length === 1 ? "" : "s"}`}
      icon={<Paperclip className="h-3.5 w-3.5" />}
    >
      <div className="space-y-4">
        {puedeSubir && (
          <div className="space-y-1.5">
            <Input ref={inputRef} type="file" onChange={handleFile} disabled={busy} className="border-glass bg-glass" />
            {busy && (
              <p className="flex items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground">
                <Upload className="h-3 w-3 animate-pulse" /> Subiendo…
              </p>
            )}
          </div>
        )}

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-glass bg-glass py-6">
            <Paperclip className="h-5 w-5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Sin adjuntos</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((a) => (
              <li key={a.id} className="flex items-center gap-3 rounded-lg border border-glass bg-glass-elev p-2.5 text-sm inset-highlight">
                <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <a
                    href={urlAdjunto(id, a.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate font-medium text-copper hover:underline"
                  >
                    {a.nombre_original ?? "archivo"}
                  </a>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {formatTamano(a.tamano_bytes)}
                    {" · "}{new Date(a.created_at).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
