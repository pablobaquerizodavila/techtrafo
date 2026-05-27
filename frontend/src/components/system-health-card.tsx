"use client";

import { useEffect, useState, useCallback } from "react";
import { Activity, RefreshCw, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Panel } from "@/components/panel";
import { api, ApiError } from "@/lib/api";

interface HealthCheck {
  name: string;
  category: "database" | "cache" | "telemetry" | "monitoring" | "frontend" | "mail" | "network";
  status: "up" | "down" | "degraded";
  latency_ms: number;
  message?: string;
}

interface HealthResponse {
  timestamp: string;
  summary: {
    total: number;
    up: number;
    down: number;
    degraded: number;
    status: "up" | "down" | "degraded";
  };
  checks: HealthCheck[];
}

const CATEGORY_LABEL: Record<HealthCheck["category"], string> = {
  database: "Base de datos",
  cache: "Cache",
  telemetry: "Telemetría",
  monitoring: "Monitoreo",
  frontend: "Frontend",
  mail: "Email",
  network: "Red",
};

function StatusDot({ status }: { status: HealthCheck["status"] }) {
  const cls =
    status === "up"
      ? "led-green"
      : status === "degraded"
      ? "inline-block h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]"
      : "inline-block h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.6)]";
  return <span className={cls} />;
}

function StatusBadge({ status }: { status: HealthCheck["status"] }) {
  if (status === "up") {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[10px] font-medium text-green-400">
        <StatusDot status="up" /> Operativo
      </span>
    );
  }
  if (status === "degraded") {
    return (
      <span className="inline-flex items-center gap-1 font-mono text-[10px] font-medium text-amber-400">
        <StatusDot status="degraded" /> Degradado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[10px] font-medium text-rose-400">
      <StatusDot status="down" /> Caído
    </span>
  );
}

function fmtLatency(ms: number): string {
  if (ms <= 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function SystemHealthCard() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isAuto = false) => {
    if (!isAuto) setLoading(true);
    setRefreshing(true);
    try {
      const res = await api.get<HealthResponse>("/api/system/health");
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? `Error ${err.status}` : "No se pudo consultar el estado");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const summary = data?.summary;
  const headerIcon =
    summary?.status === "up" ? (
      <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
    ) : summary?.status === "degraded" ? (
      <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
    ) : summary?.status === "down" ? (
      <XCircle className="h-3.5 w-3.5 text-rose-400" />
    ) : (
      <Activity className="h-3.5 w-3.5" />
    );

  const subtitle = summary
    ? `${summary.up}/${summary.total} servicios operativos${summary.down > 0 ? ` · ${summary.down} caído${summary.down === 1 ? "" : "s"}` : ""}${summary.degraded > 0 ? ` · ${summary.degraded} degradado${summary.degraded === 1 ? "" : "s"}` : ""}`
    : "Consultando…";

  return (
    <Panel
      title="Estado del sistema"
      subtitle={subtitle}
      icon={headerIcon}
      action={
        <button
          type="button"
          onClick={() => load()}
          disabled={loading || refreshing}
          aria-label="Refrescar estado"
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
      ) : loading && !data ? (
        <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
          Cargando estado…
        </div>
      ) : data ? (
        <>
          <ul className="space-y-1.5">
            {data.checks.map((c) => (
              <li
                key={c.name}
                className="flex items-center justify-between gap-3 rounded-lg border border-glass bg-glass px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs text-foreground/85">{c.name}</span>
                    <span className="rounded-full border border-glass bg-glass-elev px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                      {CATEGORY_LABEL[c.category]}
                    </span>
                  </div>
                  {c.message && c.status !== "up" && (
                    <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/80">
                      {c.message}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {fmtLatency(c.latency_ms)}
                  </span>
                  <StatusBadge status={c.status} />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between border-t border-glass pt-3 font-mono text-[10px] text-muted-foreground/70">
            <span>Auto-refresh cada 30 s</span>
            <span>
              Última lectura:{" "}
              <span className="text-foreground/80">
                {new Date(data.timestamp).toLocaleTimeString("es-EC", { timeZone: "America/Guayaquil" })}
              </span>
            </span>
          </div>
        </>
      ) : null}
    </Panel>
  );
}
