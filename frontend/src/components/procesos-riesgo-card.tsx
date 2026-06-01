"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { AlarmClock, RefreshCw } from "lucide-react";
import { Panel } from "@/components/panel";
import { api, ApiError } from "@/lib/api";

interface ProcesoRiesgo {
  expediente_id: number;
  expediente_codigo: string;
  cliente_nombre: string | null;
  hito_id: number;
  hito_codigo: string;
  hito_nombre: string;
  sla_horas: number;
  horas_transcurridas: number;
  porcentaje: number;
}
interface Response { data: ProcesoRiesgo[] }

// 80-89 amarillo · 90-99 naranja · 100+ rojo
function colorFor(pct: number) {
  if (pct >= 100) return { text: "text-rose-300", bg: "bg-rose-500/15", border: "border-rose-500/40", dot: "bg-rose-400" };
  if (pct >= 90) return { text: "text-orange-300", bg: "bg-orange-500/15", border: "border-orange-500/40", dot: "bg-orange-400" };
  return { text: "text-amber-300", bg: "bg-amber-500/15", border: "border-amber-500/40", dot: "bg-amber-400" };
}

export function ProcesosRiesgoCard({ className }: { className?: string }) {
  const [data, setData] = useState<ProcesoRiesgo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isAuto = false) => {
    if (!isAuto) setLoading(true);
    setRefreshing(true);
    try {
      const res = await api.get<Response>("/api/dashboard/procesos-en-riesgo");
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? `Error ${err.status}` : "No se pudo cargar");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 60_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <Panel
      title="Etapas en riesgo por tiempo"
      subtitle="En curso · ≥80% del SLA consumido · sin resolver · de mayor a menor"
      icon={<AlarmClock className="h-3.5 w-3.5" />}
      className={className}
      action={
        <button onClick={() => load()} disabled={loading || refreshing}
          className="inline-flex items-center gap-1.5 rounded-md border border-glass bg-glass px-2 py-1 text-[11px] text-muted-foreground hover:bg-glass-elev disabled:opacity-50">
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} /> {refreshing ? "Actualizando" : "Actualizar"}
        </button>
      }
    >
      {error ? (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">{error}</div>
      ) : loading && data.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">Cargando…</div>
      ) : data.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">Ninguna etapa en riesgo de tiempo. 👍</div>
      ) : (
        <ol className="space-y-1.5">
          {data.map((p) => {
            const c = colorFor(p.porcentaje);
            return (
              <li key={p.hito_id}>
                <Link href={`/expedientes/${p.expediente_id}`}
                  className={`group flex items-center gap-3 rounded-lg border ${c.border} ${c.bg} px-3 py-2 transition hover:brightness-110`}>
                  <div className={`flex h-11 w-16 shrink-0 flex-col items-center justify-center rounded-md ${c.text}`}>
                    <span className="font-display text-base font-semibold leading-none tabular-nums">{p.porcentaje}%</span>
                    <span className="mt-0.5 font-mono text-[9px] opacity-70">{p.horas_transcurridas}h/{p.sla_horas}h</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.hito_nombre}</p>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="font-mono text-copper">{p.expediente_codigo}</span>
                      {p.cliente_nombre && (<><span className="text-muted-foreground/40">·</span><span className="truncate">{p.cliente_nombre}</span></>)}
                    </div>
                  </div>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${c.dot}`} />
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
