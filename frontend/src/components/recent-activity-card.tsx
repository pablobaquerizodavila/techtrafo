"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Activity, FileText, PackageCheck, Factory, ShoppingCart, UserPlus, RefreshCw, Inbox,
} from "lucide-react";
import { Panel } from "@/components/panel";
import { api, ApiError } from "@/lib/api";

type TipoActividad = "cotizacion" | "recepcion" | "ot" | "solicitud_compra" | "cliente_nuevo";

interface Actividad {
  tipo: TipoActividad;
  ref_id: string;
  codigo: string | null;
  label: string;
  contexto: string | null;
  monto: number | null;
  moneda: string;
  fecha: string;
}

interface Response { data: Actividad[] }

const TIPO_CFG: Record<TipoActividad, {
  label: string;
  icon: React.ReactNode;
  href: (refId: string) => string;
  iconCls: string;
  chip: string;
}> = {
  cotizacion: {
    label: "Cotización",
    icon: <FileText className="h-3.5 w-3.5" />,
    href: (id) => `/cotizaciones/${id}`,
    iconCls: "text-copper bg-copper/10 border-copper/30",
    chip: "border-copper/30 bg-copper/10 text-copper",
  },
  recepcion: {
    label: "Recepción",
    icon: <PackageCheck className="h-3.5 w-3.5" />,
    href: (id) => `/compras/recepciones/${id}`,
    iconCls: "text-green-400 bg-green-500/10 border-green-500/30",
    chip: "border-green-500/30 bg-green-500/10 text-green-300",
  },
  ot: {
    label: "Orden de trabajo",
    icon: <Factory className="h-3.5 w-3.5" />,
    href: (id) => `/ot/${id}`,
    iconCls: "text-ttteal bg-ttteal/10 border-ttteal/30",
    chip: "border-ttteal/30 bg-ttteal/10 text-ttteal",
  },
  solicitud_compra: {
    label: "Solicitud compra",
    icon: <ShoppingCart className="h-3.5 w-3.5" />,
    href: (id) => `/compras/solicitudes/${id}`,
    iconCls: "text-amber-400 bg-amber-500/10 border-amber-500/30",
    chip: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  },
  cliente_nuevo: {
    label: "Cliente nuevo",
    icon: <UserPlus className="h-3.5 w-3.5" />,
    href: (id) => `/clientes?id=${id}`,
    iconCls: "text-violet-400 bg-violet-500/10 border-violet-500/30",
    chip: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  },
};

function tiempoRelativo(iso: string): string {
  const fecha = new Date(iso);
  const ahora = new Date();
  const diffSec = Math.max(0, Math.floor((ahora.getTime() - fecha.getTime()) / 1000));
  if (diffSec < 60) return "hace un momento";
  if (diffSec < 3600) {
    const m = Math.floor(diffSec / 60);
    return `hace ${m} min`;
  }
  if (diffSec < 86400) {
    const h = Math.floor(diffSec / 3600);
    return `hace ${h} h`;
  }
  if (diffSec < 604800) {
    const d = Math.floor(diffSec / 86400);
    return `hace ${d} d`;
  }
  return fecha.toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" });
}

function fmtMoneda(n: number, moneda: string): string {
  try {
    return new Intl.NumberFormat("es-EC", { style: "currency", currency: moneda }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

export function RecentActivityCard({ className }: { className?: string }) {
  const [data, setData] = useState<Actividad[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isAuto = false) => {
    if (!isAuto) setLoading(true);
    setRefreshing(true);
    try {
      const res = await api.get<Response>("/api/dashboard/actividad-reciente");
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? `Error ${err.status}` : "No se pudo cargar la actividad");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 60_000); // refresh 1 min
    return () => clearInterval(t);
  }, [load]);

  return (
    <Panel
      title="Actividad reciente"
      subtitle="Pulso del sistema · últimas 12 operaciones"
      icon={<Activity className="h-3.5 w-3.5" />}
      className={className}
      action={
        <button
          type="button"
          onClick={() => load()}
          disabled={loading || refreshing}
          aria-label="Refrescar actividad"
          className="inline-flex items-center gap-1 rounded-md border border-glass-mid bg-glass px-2 py-1 font-mono text-[10px] text-muted-foreground transition hover:border-glass-strong hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Actualizando" : "Actualizar"}
        </button>
      }
    >
      {error ? (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/[0.06] p-3 text-xs text-rose-300">
          {error}
        </div>
      ) : loading && data.length === 0 ? (
        <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
          Cargando actividad…
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-glass bg-glass py-8">
          <Inbox className="h-5 w-5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Aún no hay actividad registrada.</p>
          <p className="font-mono text-[10px] text-muted-foreground/70">
            Cuando emitas cotizaciones, registres recepciones o crees clientes,
            aparecerán acá.
          </p>
        </div>
      ) : (
        <>
          <ol className="space-y-1.5">
            {data.map((a, i) => {
              const cfg = TIPO_CFG[a.tipo];
              return (
                <li key={`${a.tipo}-${a.ref_id}-${i}`}>
                  <Link
                    href={cfg.href(a.ref_id)}
                    className="group flex items-start gap-3 rounded-lg border border-glass bg-glass px-3 py-2.5 transition hover:border-glass-mid hover:bg-glass-elev"
                  >
                    <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${cfg.iconCls}`}>
                      {cfg.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-xs font-medium text-foreground/90 group-hover:text-copper">
                          {a.label}
                        </span>
                        <span className={`shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${cfg.chip}`}>
                          {cfg.label}
                        </span>
                        {a.monto !== null && (
                          <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-foreground/85">
                            {fmtMoneda(a.monto, a.moneda)}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        {a.contexto && <span className="truncate">{a.contexto}</span>}
                        {a.contexto && <span className="text-muted-foreground/40">·</span>}
                        <span className="shrink-0 font-mono text-[10px]">{tiempoRelativo(a.fecha)}</span>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 border-t border-glass pt-3 font-mono text-[10px] text-muted-foreground/70">
            Auto-refresh cada minuto · click en cada fila para ir al detalle
          </p>
        </>
      )}
    </Panel>
  );
}
