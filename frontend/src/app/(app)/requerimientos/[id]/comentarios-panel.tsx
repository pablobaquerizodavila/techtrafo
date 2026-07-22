"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Panel } from "@/components/panel";
import { Comentario, comentarios, comentar } from "@/lib/requerimientos";

interface Props { id: string; puedeComentar: boolean }

function autorNombre(c: Comentario): string {
  const u = c.usuarios;
  if (!u) return "—";
  return [u.nombres, u.apellidos].filter(Boolean).join(" ").trim() || "—";
}

export function ComentariosPanel({ id, puedeComentar }: Props) {
  const [items, setItems] = useState<Comentario[]>([]);
  const [cuerpo, setCuerpo] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await comentarios(id);
      setItems(r.data);
    } catch { /* silent */ }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function handleEnviar() {
    const texto = cuerpo.trim();
    if (!texto) { toast.error("Escribí un comentario"); return; }
    setBusy(true);
    try {
      await comentar(id, texto);
      setCuerpo("");
      toast.success("Comentario agregado");
      load();
    } catch {
      toast.error("No se pudo agregar el comentario");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Comentarios"
      subtitle={`${items.length} comentario${items.length === 1 ? "" : "s"}`}
      icon={<MessageSquare className="h-3.5 w-3.5" />}
    >
      <div className="space-y-4">
        {puedeComentar && (
          <div className="space-y-2">
            <Textarea
              rows={3}
              value={cuerpo}
              onChange={(e) => setCuerpo(e.target.value)}
              placeholder="Escribí un comentario…"
              className="border-glass bg-glass"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleEnviar}
                disabled={busy || !cuerpo.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-3 py-1.5 text-xs font-medium text-white shadow-sm glow-copper-sm inset-highlight-md transition hover:glow-copper disabled:opacity-50 disabled:pointer-events-none"
              >
                <Send className="h-3.5 w-3.5" /> {busy ? "Enviando…" : "Agregar"}
              </button>
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-glass bg-glass py-6">
            <MessageSquare className="h-5 w-5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Aún no hay comentarios</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((c) => (
              <li key={c.id} className="rounded-lg border border-glass bg-glass-elev px-4 py-3 inset-highlight">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-sm font-medium">{autorNombre(c)}</span>
                  {c.es_tecnico && <Badge variant="warning">Técnico</Badge>}
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    {new Date(c.created_at).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-foreground/85">{c.cuerpo}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
