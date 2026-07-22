"use client";

import { useCallback, useEffect, useState } from "react";
import { History } from "lucide-react";
import { Panel } from "@/components/panel";
import { HistorialItem, EstadoReq, historial, estadoReqLabel } from "@/lib/requerimientos";

interface Props { id: string }

const ACCION_LABELS: Record<string, string> = {
  creado: "Creado",
  cambio_estado: "Cambio de estado",
  cambio_prioridad: "Cambio de prioridad",
  asignado: "Asignación de responsable",
  estimado: "Estimación de entrega",
  solicitud_info: "Solicitud de información",
  comentario: "Comentario",
  adjunto: "Adjunto agregado",
  editado: "Edición",
  cancelado: "Cancelado",
};

function accionLabel(a: string): string {
  return ACCION_LABELS[a] ?? a.replaceAll("_", " ");
}

function estadoTxt(v: unknown): string {
  if (typeof v !== "string" || !v) return String(v ?? "—");
  return estadoReqLabel(v as EstadoReq);
}

function detalleTexto(h: HistorialItem): string | null {
  const d = h.detalle ?? {};
  if ("de" in d && "a" in d) return `${estadoTxt(d.de)} → ${estadoTxt(d.a)}`;
  if ("desde" in d && "hasta" in d) return `${estadoTxt(d.desde)} → ${estadoTxt(d.hasta)}`;
  if ("anterior" in d && "nuevo" in d) return `${estadoTxt(d.anterior)} → ${estadoTxt(d.nuevo)}`;
  if ("estado" in d) return estadoTxt(d.estado);
  if ("prioridad" in d) return String(d.prioridad);
  if ("mensaje" in d) return String(d.mensaje);
  if ("fecha_estimada_entrega" in d) return String(d.fecha_estimada_entrega);
  const keys = Object.keys(d);
  if (keys.length === 0) return null;
  return JSON.stringify(d);
}

function usuarioNombre(h: HistorialItem): string {
  const u = h.usuarios;
  if (!u) return "Sistema";
  return [u.nombres, u.apellidos].filter(Boolean).join(" ").trim() || "Sistema";
}

export function HistorialPanel({ id }: Props) {
  const [items, setItems] = useState<HistorialItem[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await historial(id);
      setItems(r.data);
    } catch { /* silent */ }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  return (
    <Panel
      title="Historial"
      subtitle={`${items.length} evento${items.length === 1 ? "" : "s"}`}
      icon={<History className="h-3.5 w-3.5" />}
    >
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-glass bg-glass py-6">
          <History className="h-5 w-5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Sin eventos registrados</p>
        </div>
      ) : (
        <ol className="relative space-y-4 border-l border-glass pl-5">
          {items.map((h) => {
            const detalle = detalleTexto(h);
            return (
              <li key={h.id} className="relative">
                <span className="absolute -left-[1.4rem] top-1.5 h-2 w-2 rounded-full border border-copper/50 bg-copper/30" />
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-medium text-foreground/90">{accionLabel(h.accion)}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {new Date(h.created_at).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}
                  </span>
                </div>
                {detalle && (
                  <p className="mt-0.5 font-mono text-xs text-foreground/70">{detalle}</p>
                )}
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {usuarioNombre(h)}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
