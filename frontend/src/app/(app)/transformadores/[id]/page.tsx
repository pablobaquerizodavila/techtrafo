"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft, Zap, User, MapPin, Calendar, Factory, ExternalLink,
  Wrench, CheckCircle2, Clock, History,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "sonner";
import { PageHeader, HeaderActionGhost } from "@/components/page-header";
import { Panel, StatCard } from "@/components/panel";
import {
  Transformador, estadoLabel, estadoVariant, formatCapacidad, getTransformador, tipoLabel,
} from "@/lib/transformadores";
import { ApiError } from "@/lib/api";

interface PageProps { params: Promise<{ id: string }> }

export default function TransformadorDetallePage({ params }: PageProps) {
  const [id, setId] = useState<number | null>(null);
  const [trf, setTrf] = useState<Transformador | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { params.then(({ id }) => setId(Number(id))); }, [params]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try { const res = await getTransformador(id); setTrf(res.data); }
    catch (err) {
      if (err instanceof ApiError && err.status === 404) setError("Transformador no encontrado");
      else setError(err instanceof Error ? err.message : "Error cargando");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);

  if (loading && !trf) {
    return (
      <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-copper border-t-transparent" />
          <span className="text-sm">Cargando transformador…</span>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div>
        <PageHeader breadcrumb={[{ href: "/dashboard", label: "Panel" }, { href: "/transformadores", label: "Transformadores" }, { label: "Error" }]} title="Transformador" titleAccent="no encontrado" />
        <div className="pt-6"><div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-200 inset-highlight"><p className="text-sm">{error}</p></div></div>
      </div>
    );
  }
  if (!trf) return null;

  const ot = trf.ot ?? [];
  const stats = trf.historial_stats;

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { href: "/transformadores", label: "Transformadores" }, { label: trf.codigo_interno ?? `#${trf.id}` }]}
        title={trf.codigo_interno ?? `Transformador #${trf.id}`}
        titleAccent={trf.marca && trf.modelo ? `${trf.marca} ${trf.modelo}` : trf.marca ?? trf.modelo ?? ""}
        meta={
          <>
            <Badge variant={estadoVariant(trf.estado)}>{estadoLabel(trf.estado)}</Badge>
            {trf.numero_serie && (<><span className="text-muted-foreground/40">·</span><span>serie <span className="font-mono text-foreground">{trf.numero_serie}</span></span></>)}
            <span className="text-muted-foreground/40">·</span>
            <span className="text-ttteal">{formatCapacidad(trf.capacidad_kva)}</span>
          </>
        }
        actions={<HeaderActionGhost href="/transformadores" icon={<ChevronLeft className="h-3.5 w-3.5" />}>Volver</HeaderActionGhost>}
      />

      <div className="space-y-6 pt-6">
        {/* Hero card del transformador */}
        <div className="overflow-hidden rounded-xl border border-glass-mid bg-glass p-6 inset-highlight"
          style={{ backgroundImage: "radial-gradient(ellipse 50% 80% at 0% 50%, rgba(255,107,53,0.06), transparent 60%)" }}>
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-xl bg-gradient-to-br from-copper to-copper-deep text-white shadow-lg glow-copper inset-highlight-md">
              <Zap className="h-7 w-7" strokeWidth={2.2} />
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{tipoLabel(trf.tipo)}</p>
              <p className="font-display text-2xl font-semibold tracking-tight">
                <span className="text-ttteal">{formatCapacidad(trf.capacidad_kva)}</span>
              </p>
              {trf.ubicacion_actual && (
                <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" /> {trf.ubicacion_actual}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Stats banner */}
        {stats && stats.total_intervenciones > 0 && (
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard icon={<History className="h-3.5 w-3.5" />} label="Intervenciones" value={stats.total_intervenciones} sub="Histórico total" />
            <StatCard icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Completadas" value={stats.completadas} sub="Cerradas con éxito" tone="green" />
            <StatCard icon={<Clock className="h-3.5 w-3.5" />} label="En curso" value={stats.en_curso} sub="Trabajos activos" tone={stats.en_curso > 0 ? "copper" : "default"} />
            <StatCard icon={<Calendar className="h-3.5 w-3.5" />} label="Última intervención" value={stats.ultima_intervencion ? new Date(stats.ultima_intervencion).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" }) : "—"} sub="Fecha del último servicio" />
          </section>
        )}

        {/* Características + cliente */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="Características técnicas" icon={<Zap className="h-3.5 w-3.5" />}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <KV label="Tipo" value={tipoLabel(trf.tipo)} />
              <KV label="Capacidad" value={formatCapacidad(trf.capacidad_kva)} mono />
              <KV label="Tensión primaria" value={trf.tension_primaria_kv != null ? `${trf.tension_primaria_kv} kV` : "—"} mono />
              <KV label="Tensión secundaria" value={trf.tension_secundaria_v != null ? `${trf.tension_secundaria_v} V` : "—"} mono />
              <KV label="Conexión" value={trf.conexion ?? "—"} mono />
              <KV label="Grupo vectorial" value={trf.grupo_vectorial ?? "—"} mono />
              <KV label="Fases" value={trf.numero_fases ? `${trf.numero_fases}φ` : "—"} mono />
              <KV label="Frecuencia" value={trf.frecuencia_hz ? `${trf.frecuencia_hz} Hz` : "—"} mono />
              <KV label="Refrigeración" value={trf.refrigeracion ?? "—"} />
              <KV label="Año fabricación" value={trf.anio_fabricacion ?? "—"} mono />
            </dl>
          </Panel>

          <div className="space-y-4">
            <Panel title="Cliente propietario" icon={<User className="h-3.5 w-3.5" />}>
              {trf.clientes ? (
                <div className="space-y-1.5 text-sm">
                  <p className="font-medium">{trf.clientes.razon_social}</p>
                  <p className="font-mono text-[10.5px] text-muted-foreground">{trf.clientes.ruc_cedula}</p>
                  {trf.clientes.email && <p className="font-mono text-xs text-muted-foreground">{trf.clientes.email}</p>}
                  {trf.clientes.telefono && <p className="font-mono text-xs text-muted-foreground">{trf.clientes.telefono}</p>}
                </div>
              ) : <p className="text-sm text-muted-foreground italic">Sin asignar</p>}
            </Panel>

            {(trf.peso_kg || trf.ancho_mm || trf.alto_mm || trf.profundidad_mm) && (
              <Panel title="Dimensiones físicas">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm font-mono">
                  {trf.peso_kg && <KV label="Peso" value={`${trf.peso_kg} kg`} mono />}
                  {trf.ancho_mm && <KV label="Ancho" value={`${trf.ancho_mm} mm`} mono />}
                  {trf.alto_mm && <KV label="Alto" value={`${trf.alto_mm} mm`} mono />}
                  {trf.profundidad_mm && <KV label="Profundidad" value={`${trf.profundidad_mm} mm`} mono />}
                </dl>
              </Panel>
            )}
          </div>
        </section>

        {trf.observaciones && (
          <Panel title="Observaciones">
            <p className="whitespace-pre-wrap text-sm text-foreground/85">{trf.observaciones}</p>
          </Panel>
        )}

        {/* Historial de OT */}
        <Panel
          title="Historial de intervenciones"
          subtitle={`${ot.length} OT${ot.length === 1 ? "" : "s"} sobre este equipo`}
          icon={<Wrench className="h-3.5 w-3.5" />}
        >
          {ot.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-glass bg-glass py-6">
              <Factory className="h-5 w-5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Este transformador todavía no tiene OT registradas</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {ot.map((o) => (
                <li key={o.id} className="rounded-xl border border-glass bg-glass p-4 text-sm transition hover:border-glass-mid hover:bg-glass-elev">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        <Link href={`/ot/${o.id}`} className="font-mono text-copper hover:underline">{o.codigo}</Link>
                        <Badge variant="muted">{o.tipo_ruta}</Badge>
                        <Badge variant="outline">{o.prioridad}</Badge>
                      </p>
                      {o.descripcion && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{o.descripcion}</p>
                      )}
                      <p className="mt-1 font-mono text-[10.5px] text-muted-foreground">
                        Creada: {new Date(o.created_at).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" })}
                        {o.fecha_inicio_real && ` · iniciada ${new Date(o.fecha_inicio_real).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" })}`}
                        {o.fecha_fin_real && ` · finalizada ${new Date(o.fecha_fin_real).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" })}`}
                        {o.contratos?.codigo && ` · contrato ${o.contratos.codigo}`}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <Badge variant={o.estado === "completada" ? "success" : o.estado === "cancelada" ? "destructive" : "copper"}>
                        {o.estado.replaceAll("_", " ")}
                      </Badge>
                      <Link href={`/ot/${o.id}`}
                        className="inline-flex items-center gap-1 rounded-md border border-glass-mid bg-glass px-2.5 py-1 text-[11px] font-medium text-foreground/90 transition hover:border-glass-strong hover:bg-glass-elev">
                        Abrir <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Toaster richColors position="top-right" theme="dark" />
    </div>
  );
}

function KV({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-foreground/90" : "text-foreground/90"}>{value}</dd>
    </>
  );
}
