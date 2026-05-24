"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  FolderOpen, CheckCircle2, XCircle, Zap, ChevronRight,
  Calendar, AlertTriangle, RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
        setError(
          "Tu usuario todavía no está asociado a una empresa. Pedile al equipo de TECHTRAFO que te vincule a tu compañía desde el panel de administración.",
        );
      } else {
        setError(err instanceof Error ? err.message : "Error cargando tus pedidos");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-muted-foreground">Cargando tus pedidos...</div>;

  if (error) {
    return (
      <div className="space-y-6">
        <header>
          <h2 className="text-3xl font-bold">Mi cuenta</h2>
          <p className="text-muted-foreground">Portal de seguimiento</p>
        </header>
        <div className="rounded-md border border-yellow-500/40 bg-yellow-50/60 p-6 text-sm text-yellow-800">
          <AlertTriangle className="mb-2 inline h-5 w-5" /> {error}
        </div>
      </div>
    );
  }

  const activos = exps.filter((e) => e.estado === "activo");
  const finalizados = exps.filter((e) => e.estado !== "activo");

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Mi cuenta</h2>
          <p className="text-muted-foreground">Seguimiento de tus pedidos a TECHTRAFO</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="mr-1 h-4 w-4" /> Refrescar
        </Button>
      </header>

      {/* KPIs sencillos */}
      {resumen && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard icon={<FolderOpen className="h-4 w-4 text-primary" />} label="Pedidos activos" value={resumen.por_estado["activo"] ?? 0} tone="primary" />
          <KpiCard icon={<CheckCircle2 className="h-4 w-4 text-green-700" />} label="Completados" value={resumen.por_estado["ganado"] ?? 0} tone="success" />
          <KpiCard icon={<XCircle className="h-4 w-4 text-muted-foreground" />} label="No concretados" value={(resumen.por_estado["perdido"] ?? 0) + (resumen.por_estado["cancelado"] ?? 0)} />
          <KpiCard icon={<Zap className="h-4 w-4 text-yellow-600" />} label="Transformadores" value={resumen.transformadores_registrados} />
        </div>
      )}

      {/* Activos */}
      <section>
        <h3 className="mb-3 text-lg font-bold">Pedidos en curso</h3>
        {activos.length === 0 ? (
          <p className="rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            No tenés pedidos activos en este momento.
          </p>
        ) : (
          <div className="space-y-3">
            {activos.map((e) => <ExpedienteCard key={e.id} e={e} />)}
          </div>
        )}
      </section>

      {/* Historicos */}
      {finalizados.length > 0 && (
        <section>
          <h3 className="mb-3 text-lg font-bold text-muted-foreground">Histórico</h3>
          <div className="space-y-3">
            {finalizados.map((e) => <ExpedienteCard key={e.id} e={e} historico />)}
          </div>
        </section>
      )}
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
        : { variant: "default" as const, label: "En proceso" };

  return (
    <Link
      href={`/portal/expediente/${e.id}`}
      className={`block rounded-md border p-4 transition hover:border-primary hover:bg-accent ${historico ? "opacity-75" : ""}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm">{e.codigo}</span>
            <Badge variant={estadoBadge.variant} className="text-xs">{estadoBadge.label}</Badge>
          </div>
          <p className="mt-1 text-sm">
            <strong>{tipoLabel}</strong>
            {e.transformadores && (
              <span className="ml-2 text-muted-foreground">
                · {e.transformadores.marca} {e.transformadores.modelo}
                {" · "}
                {e.transformadores.capacidad_kva >= 1000
                  ? `${(e.transformadores.capacidad_kva / 1000).toFixed(0)} MVA`
                  : `${e.transformadores.capacidad_kva} kVA`}
              </span>
            )}
          </p>
          {e.descripcion_problema && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{e.descripcion_problema}</p>
          )}
          <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            Iniciado {new Date(e.fecha_apertura).toLocaleDateString("es-EC")}
            {e.fecha_cierre && <> · finalizado {new Date(e.fecha_cierre).toLocaleDateString("es-EC")}</>}
          </p>

          {!historico && total > 0 && (
            <>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span>{enCurso ? `→ ${enCurso.nombre}` : `${completados}/${total} pasos`}</span>
                <span className="font-semibold">{pct}%</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
            </>
          )}
        </div>
        <ChevronRight className="mt-1 h-5 w-5 text-muted-foreground" />
      </div>
    </Link>
  );
}

function KpiCard({ icon, label, value, tone }: {
  icon: React.ReactNode; label: string; value: number;
  tone?: "primary" | "success";
}) {
  const cls = tone === "primary" ? "border-primary/30 bg-primary/5"
    : tone === "success" ? "border-green-500/30 bg-green-50/50"
    : "";
  return (
    <div className={`rounded-md border p-3 ${cls}`}>
      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">{icon} {label}</div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
