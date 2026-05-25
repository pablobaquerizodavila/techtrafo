"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  FolderOpen, CheckCircle2, XCircle, Zap, ChevronRight,
  Calendar, AlertTriangle, RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader, HeaderActionGhost } from "@/components/page-header";
import { Panel, StatCard } from "@/components/panel";
import {
  PortalExpedienteResumen, PortalResumen,
  listMisExpedientes, getPortalResumen,
} from "@/lib/portal";
import { ApiError } from "@/lib/api";

export default function PortalPage() {
  const [exps, setExps] = useState<PortalExpedienteResumen[]>([]);
  const [resumen, setResumen] = useState<PortalResumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r1, r2] = await Promise.all([listMisExpedientes(), getPortalResumen()]);
      setExps(r1.data);
      setResumen(r2.data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError("Tu usuario todavía no está asociado a una empresa. Pedile al equipo de TECHTRAFO que te vincule a tu compañía desde el panel de administración.");
      } else {
        setError(err instanceof Error ? err.message : "Error cargando tus pedidos");
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-copper border-t-transparent" />
          <span className="text-sm">Cargando tus pedidos…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader breadcrumb={[{ label: "Portal" }, { label: "Mi cuenta" }]} title="Mi" titleAccent="cuenta" meta={<span>Portal de seguimiento</span>} />
        <div className="pt-6">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-6 inset-highlight">
            <div className="flex items-start gap-3 text-amber-200">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const activos = exps.filter((e) => e.estado === "activo");
  const finalizados = exps.filter((e) => e.estado !== "activo");

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: "Portal" }, { label: "Mi cuenta" }]}
        title="Mi"
        titleAccent="cuenta"
        meta={<span>Seguimiento de tus pedidos a TECHTRAFO</span>}
        liveIndicator={{ label: "live" }}
        actions={
          <HeaderActionGhost onClick={load} icon={<RefreshCw className="h-3.5 w-3.5" />}>
            Refrescar
          </HeaderActionGhost>
        }
      />

      <div className="space-y-6 pt-6">
        {/* KPIs */}
        {resumen && (
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard icon={<FolderOpen className="h-3.5 w-3.5" />} label="Pedidos activos" value={resumen.por_estado["activo"] ?? 0} sub="En curso ahora" tone="copper" />
            <StatCard icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Completados" value={resumen.por_estado["ganado"] ?? 0} sub="Entregados" tone="green" />
            <StatCard icon={<XCircle className="h-3.5 w-3.5" />} label="No concretados" value={(resumen.por_estado["perdido"] ?? 0) + (resumen.por_estado["cancelado"] ?? 0)} sub="Cancelados o perdidos" />
            <StatCard icon={<Zap className="h-3.5 w-3.5" />} label="Transformadores" value={resumen.transformadores_registrados} sub="Registrados en tu cuenta" tone="teal" />
          </section>
        )}

        {/* Activos */}
        <Panel title="Pedidos en curso" subtitle={`${activos.length} pedido${activos.length === 1 ? "" : "s"} activo${activos.length === 1 ? "" : "s"}`} icon={<FolderOpen className="h-3.5 w-3.5" />}>
          {activos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-glass bg-glass py-6">
              <FolderOpen className="h-5 w-5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">No tenés pedidos activos en este momento</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activos.map((e) => <ExpedienteCard key={e.id} e={e} />)}
            </div>
          )}
        </Panel>

        {/* Históricos */}
        {finalizados.length > 0 && (
          <Panel title="Histórico" subtitle={`${finalizados.length} pedido${finalizados.length === 1 ? "" : "s"} cerrado${finalizados.length === 1 ? "" : "s"}`}>
            <div className="space-y-3">
              {finalizados.map((e) => <ExpedienteCard key={e.id} e={e} historico />)}
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

function ExpedienteCard({ e, historico }: { e: PortalExpedienteResumen; historico?: boolean }) {
  const visibles = e.expediente_hitos.filter((h) => h.visible_cliente);
  const total = visibles.length;
  const completados = visibles.filter((h) => h.estado === "completado").length;
  const pct = total > 0 ? Math.round((completados / total) * 100) : 0;
  const enCurso = visibles.find((h) => h.estado === "en_curso");

  const tipoLabel = (e.tipo_servicio_confirmado ?? e.tipo_servicio_estimado ?? "—")
    .replace(/^./, (c) => c.toUpperCase());

  const estadoBadge = e.estado === "ganado"
    ? { variant: "success" as const, label: "Completado" }
    : e.estado === "perdido"
      ? { variant: "destructive" as const, label: "No concretado" }
      : e.estado === "cancelado"
        ? { variant: "muted" as const, label: "Cancelado" }
        : { variant: "copper" as const, label: "En proceso" };

  return (
    <Link
      href={`/portal/expediente/${e.id}`}
      className={`group block rounded-xl border border-glass bg-glass p-4 transition hover:border-glass-mid hover:bg-glass-elev ${historico ? "opacity-75" : ""}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-copper">{e.codigo}</span>
            <Badge variant={estadoBadge.variant}>{estadoBadge.label}</Badge>
          </div>
          <p className="mt-1 text-sm">
            <strong>{tipoLabel}</strong>
            {e.transformadores && (
              <span className="ml-2 text-muted-foreground">
                · {e.transformadores.marca} {e.transformadores.modelo}
                {" · "}
                <span className="text-ttteal">
                  {e.transformadores.capacidad_kva >= 1000
                    ? `${(e.transformadores.capacidad_kva / 1000).toFixed(0)} MVA`
                    : `${e.transformadores.capacidad_kva} kVA`}
                </span>
              </span>
            )}
          </p>
          {e.descripcion_problema && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{e.descripcion_problema}</p>
          )}
          <p className="mt-2 inline-flex items-center gap-1 font-mono text-[10.5px] text-muted-foreground">
            <Calendar className="h-3 w-3" />
            Iniciado {new Date(e.fecha_apertura).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" })}
            {e.fecha_cierre && <> · finalizado {new Date(e.fecha_cierre).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" })}</>}
          </p>

          {!historico && total > 0 && (
            <>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{enCurso ? <>→ <span className="text-foreground">{enCurso.nombre}</span></> : `${completados}/${total} pasos`}</span>
                <span className="font-mono font-semibold text-copper">{pct}%</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-glass-elev">
                <div className={`h-full rounded-full transition-all ${pct >= 80 ? "bg-green-500" : pct >= 40 ? "bg-gradient-to-r from-ttteal to-copper" : "bg-copper"}`} style={{ width: `${pct}%` }} />
              </div>
            </>
          )}
        </div>
        <ChevronRight className="mt-1 h-5 w-5 text-muted-foreground/40 transition group-hover:text-copper" />
      </div>
    </Link>
  );
}
