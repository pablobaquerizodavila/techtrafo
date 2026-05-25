"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, AlertTriangle, CheckCircle2, XCircle, ClipboardCheck, ExternalLink, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "sonner";
import { PageHeader, HeaderActionGhost } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { Notificacion, listNotificaciones } from "@/lib/expedientes";

function iconoTipo(tipo: string) {
  switch (tipo) {
    case "hito_estancado": return <AlertTriangle className="h-4 w-4 text-rose-400" />;
    case "hito_espera_aprobacion": return <ClipboardCheck className="h-4 w-4 text-amber-400" />;
    case "hito_aprobado": return <CheckCircle2 className="h-4 w-4 text-green-400" />;
    case "hito_rechazado": return <XCircle className="h-4 w-4 text-rose-400" />;
    default: return <Bell className="h-4 w-4 text-muted-foreground" />;
  }
}

function labelTipo(tipo: string): string {
  return ({
    hito_estancado: "Estancamiento",
    hito_espera_aprobacion: "Esperando aprobación",
    hito_aprobado: "Aprobado",
    hito_rechazado: "Rechazado",
  } as Record<string, string>)[tipo] ?? tipo;
}

function toneItem(tipo: string): "rose" | "amber" | "green" | "glass" {
  if (tipo === "hito_estancado" || tipo === "hito_rechazado") return "rose";
  if (tipo === "hito_espera_aprobacion") return "amber";
  if (tipo === "hito_aprobado") return "green";
  return "glass";
}

export default function NotificacionesPage() {
  const [data, setData] = useState<Notificacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { const res = await listNotificaciones(50); setData(res.data); }
    catch (err) { setError(err instanceof Error ? err.message : "Error cargando notificaciones"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { label: "Notificaciones" }]}
        title="Notificaciones"
        titleAccent="recientes"
        meta={<span>{data.length} notif · alertas de hitos estancados, aprobaciones y resoluciones</span>}
        liveIndicator={data.some((n) => n.tipo === "hito_estancado") ? { label: "alertas", tone: "copper" } : undefined}
        actions={
          <HeaderActionGhost onClick={load} icon={<RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />}>
            Refrescar
          </HeaderActionGhost>
        }
      />

      <div className="space-y-6 pt-6">
        {loading && data.length === 0 ? (
          <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
            <div className="flex flex-col items-center gap-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-copper border-t-transparent" />
              <span className="text-sm">Cargando notificaciones…</span>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-200 inset-highlight">
            <p className="text-sm">{error}</p>
          </div>
        ) : data.length === 0 ? (
          <Panel>
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-green-500/25 bg-green-500/[0.04] py-10">
              <Bell className="h-6 w-6 text-green-400" />
              <p className="text-sm text-green-300">Sin notificaciones todavía</p>
              <p className="text-xs text-muted-foreground">Bandeja al día</p>
            </div>
          </Panel>
        ) : (
          <ul className="space-y-2">
            {data.map((n) => {
              const expedienteId = (n.contexto?.["expediente_id"] as number | undefined) ?? null;
              const tone = toneItem(n.tipo);
              const toneCfg = {
                rose:  "border-rose-500/30 bg-rose-500/[0.05] border-l-2 border-l-rose-500",
                amber: "border-amber-500/30 bg-amber-500/[0.05] border-l-2 border-l-amber-500",
                green: "border-green-500/30 bg-green-500/[0.04] border-l-2 border-l-green-500",
                glass: "border-glass bg-glass border-l-2 border-l-glass-mid",
              }[tone];
              return (
                <li key={n.id} className={`rounded-xl border p-4 inset-highlight ${toneCfg}`}>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0 rounded-md border border-glass bg-glass-elev p-1.5">
                      {iconoTipo(n.tipo)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium">{n.asunto}</p>
                        <Badge variant={n.enviado ? "success" : "warning"}>
                          {n.enviado ? "enviado" : "pendiente"}
                        </Badge>
                      </div>
                      <p className="mt-1 font-mono text-[10.5px] text-muted-foreground">
                        <span className="text-copper">{labelTipo(n.tipo)}</span>
                        {" · "}{new Date(n.created_at).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}
                        {n.fecha_envio && ` · enviado ${new Date(n.fecha_envio).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}`}
                      </p>
                      {expedienteId && (
                        <Link href={`/expedientes/${expedienteId}`}
                          className="mt-2 inline-flex items-center gap-1 text-xs text-copper hover:underline">
                          Ver expediente <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Toaster richColors position="top-right" theme="dark" />
    </div>
  );
}
