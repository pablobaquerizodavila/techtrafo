"use client";

import { useCallback, useEffect, useState } from "react";
import { History, ChevronDown, ChevronUp, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AuditEntry, getAuditoriaOT } from "@/lib/dashboard-e";

interface Props { otId: number }

const ACCION_LABEL: Record<string, { label: string; variant: "default" | "success" | "destructive" | "warning" | "muted" }> = {
  INSERT: { label: "creado", variant: "success" },
  UPDATE: { label: "actualizado", variant: "default" },
  DELETE: { label: "eliminado", variant: "destructive" },
};

const ENTIDAD_LABEL: Record<string, string> = {
  "produccion.ot": "OT",
  "produccion.ot_pasos": "paso",
  "produccion.ot_evidencias": "evidencia",
  "produccion.tiempos_trabajo": "tiempo trabajo",
  "produccion.reprocesos": "reproceso",
};

export function AuditoriaPanel({ otId }: Props) {
  const [data, setData] = useState<AuditEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getAuditoriaOT(otId);
      setData(r.data);
    } finally {
      setLoading(false);
    }
  }, [otId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  function toggle(id: number) {
    const n = new Set(expanded);
    if (n.has(id)) n.delete(id); else n.add(id);
    setExpanded(n);
  }

  // Detectar campos que cambiaron entre valor_anterior y valor_nuevo
  function diffKeys(prev: Record<string, unknown> | null, next: Record<string, unknown> | null): string[] {
    if (!prev && next) return Object.keys(next);
    if (!prev || !next) return [];
    const out: string[] = [];
    for (const k of new Set([...Object.keys(prev), ...Object.keys(next)])) {
      if (k === "updated_at" || k === "actualizado_por") continue;
      if (JSON.stringify(prev[k]) !== JSON.stringify(next[k])) out.push(k);
    }
    return out;
  }

  return (
    <section className="overflow-hidden rounded-xl border border-glass bg-glass inset-highlight">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left transition hover:bg-glass-elev"
      >
        <h3 className="flex items-center gap-2 font-display text-sm font-semibold tracking-tight">
          <History className="h-4 w-4 text-copper" /> Trazabilidad de cambios
          {data.length > 0 && open && <Badge variant="muted">{data.length} eventos</Badge>}
        </h3>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="border-t border-glass p-5">
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando historial…</p>
          ) : data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay eventos registrados todavía</p>
          ) : (
            <ol className="space-y-2">
              {data.map((e) => {
                const acc = ACCION_LABEL[e.accion] ?? { label: e.accion.toLowerCase(), variant: "muted" as const };
                const entLabel = e.entidad ? (ENTIDAD_LABEL[e.entidad] ?? e.entidad) : "—";
                const cambios = diffKeys(e.valor_anterior, e.valor_nuevo);
                const isExpanded = expanded.has(e.id);
                return (
                  <li key={e.id} className="rounded-lg border border-glass bg-glass p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="flex items-center gap-2">
                          <Badge variant={acc.variant}>{acc.label}</Badge>
                          <strong className="text-foreground/90">{entLabel}</strong>
                          {e.entidad_id && <span className="font-mono text-[10px] text-muted-foreground">#{e.entidad_id}</span>}
                        </p>
                        <p className="mt-1 font-mono text-[10.5px] text-muted-foreground">
                          {e.usuario ? (
                            <><User className="mr-1 inline h-3 w-3" />{e.usuario.nombres} {e.usuario.apellidos}</>
                          ) : (
                            <span className="italic">sistema</span>
                          )}
                          {" · "}{new Date(e.created_at).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}
                        </p>
                        {e.accion === "UPDATE" && cambios.length > 0 && (
                          <p className="mt-1 text-xs">
                            Cambió: <span className="font-mono text-copper">{cambios.join(", ")}</span>
                          </p>
                        )}
                      </div>
                      <button type="button" onClick={() => toggle(e.id)} className="rounded-md border border-glass-mid bg-glass px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-glass-elev hover:text-foreground">
                        {isExpanded ? "Ocultar" : "Detalle"}
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                        {e.valor_anterior && (
                          <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.04] p-2.5">
                            <p className="mb-1 font-mono text-[9.5px] font-semibold uppercase tracking-wider text-rose-300">Antes</p>
                            <pre className="overflow-x-auto scroll-discreet font-mono text-[10px] text-foreground/80">{JSON.stringify(e.valor_anterior, null, 2)}</pre>
                          </div>
                        )}
                        {e.valor_nuevo && (
                          <div className="rounded-lg border border-green-500/25 bg-green-500/[0.04] p-2.5">
                            <p className="mb-1 font-mono text-[9.5px] font-semibold uppercase tracking-wider text-green-300">Después</p>
                            <pre className="overflow-x-auto scroll-discreet font-mono text-[10px] text-foreground/80">{JSON.stringify(e.valor_nuevo, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
