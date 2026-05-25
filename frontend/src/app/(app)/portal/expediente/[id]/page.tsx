"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, CheckCircle2, Clock, Circle, Zap, Calendar, FileText, FileSignature } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader, HeaderActionGhost } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { PortalExpedienteDetalle, getMiExpediente } from "@/lib/portal";
import { ApiError } from "@/lib/api";

interface PageProps { params: Promise<{ id: string }> }

export default function MiExpedienteDetallePage({ params }: PageProps) {
  const [id, setId] = useState<number | null>(null);
  const [exp, setExp] = useState<PortalExpedienteDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { params.then(({ id }) => setId(Number(id))); }, [params]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try { const r = await getMiExpediente(id); setExp(r.data); }
    catch (err) {
      if (err instanceof ApiError && err.status === 404) setError("Este pedido no existe o no te pertenece");
      else setError(err instanceof Error ? err.message : "Error cargando");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);

  if (loading && !exp) {
    return (
      <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-copper border-t-transparent" />
          <span className="text-sm">Cargando…</span>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div>
        <PageHeader breadcrumb={[{ label: "Portal" }, { label: "Error" }]} title="Pedido" titleAccent="no disponible" actions={<HeaderActionGhost href="/portal" icon={<ChevronLeft className="h-3.5 w-3.5" />}>Volver</HeaderActionGhost>} />
        <div className="pt-6"><div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-200 inset-highlight"><p className="text-sm">{error}</p></div></div>
      </div>
    );
  }
  if (!exp) return null;

  const tipoLabel = (exp.tipo_servicio_confirmado ?? exp.tipo_servicio_estimado ?? "—")
    .replace(/^./, (c) => c.toUpperCase());

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: "Portal" }, { href: "/portal", label: "Mis pedidos" }, { label: exp.codigo }]}
        title={exp.codigo}
        titleAccent={tipoLabel}
        meta={
          <>
            <Badge variant={exp.estado === "ganado" ? "success" : exp.estado === "activo" ? "copper" : "muted"}>
              {exp.estado === "activo" ? "en proceso" : exp.estado === "ganado" ? "completado" : exp.estado}
            </Badge>
            {exp.transformadores && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span>{exp.transformadores.marca} {exp.transformadores.modelo}</span>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-ttteal">
                  {exp.transformadores.capacidad_kva >= 1000
                    ? `${(exp.transformadores.capacidad_kva / 1000).toFixed(0)} MVA`
                    : `${exp.transformadores.capacidad_kva} kVA`}
                </span>
              </>
            )}
          </>
        }
        actions={<HeaderActionGhost href="/portal" icon={<ChevronLeft className="h-3.5 w-3.5" />}>Volver</HeaderActionGhost>}
      />

      <div className="space-y-6 pt-6">
        {/* Estado actual destacado */}
        <section className="overflow-hidden rounded-xl border border-copper/30 bg-glass p-6 inset-highlight"
          style={{ backgroundImage: "radial-gradient(ellipse 70% 100% at 0% 50%, rgba(255,107,53,0.10), transparent 60%)" }}>
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Estado actual</p>
          <h3 className="mt-1 font-display text-3xl font-semibold tracking-tight">
            <span className="bg-gradient-to-br from-copper to-copper-soft bg-clip-text text-transparent">
              {exp.portal_meta.fase_actual_label}
            </span>
          </h3>
          {exp.portal_meta.proximo_paso_label && (
            <p className="mt-1 text-sm text-muted-foreground">
              Próximo: <span className="text-foreground">{exp.portal_meta.proximo_paso_label}</span>
            </p>
          )}
          <div className="mt-5 flex items-center gap-4">
            <div className="flex-1">
              <div className="h-3 overflow-hidden rounded-full bg-glass-elev">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-ttteal to-copper transition-all"
                  style={{ width: `${exp.portal_meta.avance_pct}%` }}
                />
              </div>
            </div>
            <span className="font-display text-3xl font-semibold tabular-nums text-copper text-glow-copper">{exp.portal_meta.avance_pct}%</span>
          </div>
          <p className="mt-2 font-mono text-[10.5px] text-muted-foreground">
            {exp.portal_meta.completados} de {exp.portal_meta.total} etapas completadas
          </p>
        </section>

        {/* Info equipo */}
        {exp.transformadores && (
          <Panel title="Tu equipo" icon={<Zap className="h-3.5 w-3.5" />}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:grid-cols-4">
              <KV label="Marca" value={exp.transformadores.marca ?? "—"} />
              <KV label="Modelo" value={exp.transformadores.modelo ?? "—"} />
              <KV label="Capacidad" value={
                exp.transformadores.capacidad_kva >= 1000
                  ? `${(exp.transformadores.capacidad_kva / 1000).toFixed(0)} MVA`
                  : `${exp.transformadores.capacidad_kva} kVA`
              } mono />
              <KV label="Tipo" value={<span className="capitalize">{exp.transformadores.tipo}</span>} />
              {exp.transformadores.numero_serie && (
                <KV label="Serie" value={exp.transformadores.numero_serie} mono />
              )}
            </dl>
          </Panel>
        )}

        {/* Timeline */}
        <Panel title="Ruta del proceso" subtitle="Tu pedido paso a paso">
          <ol className="relative space-y-3 border-l-2 border-glass pl-6">
            {exp.expediente_hitos.map((h) => {
              const completado = h.estado === "completado";
              const enCurso = h.estado === "en_curso";
              const Icon = completado ? CheckCircle2 : enCurso ? Clock : Circle;
              return (
                <li key={h.id} className="relative">
                  <span
                    className={`absolute -left-[34px] flex h-7 w-7 items-center justify-center rounded-full border-2
                      ${completado ? "border-green-500/50 bg-green-500/15 text-green-300"
                        : enCurso ? "border-copper/60 bg-copper/15 text-copper animate-pulse glow-copper-sm"
                        : "border-glass-mid bg-glass-elev text-muted-foreground"}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className={`rounded-xl border p-3
                    ${enCurso ? "border-copper/30 bg-copper/[0.05]"
                      : completado ? "border-green-500/25 bg-green-500/[0.04]"
                      : "border-glass bg-glass"}`}>
                    <p className="font-semibold">
                      {h.emoji && <span className="mr-1.5">{h.emoji}</span>}
                      {h.label_cliente}
                    </p>
                    {h.descripcion_cliente && (
                      <p className="text-xs text-muted-foreground">{h.descripcion_cliente}</p>
                    )}
                    {(h.fecha_inicio || h.fecha_fin) && (
                      <p className="mt-1 inline-flex items-center gap-1 font-mono text-[10.5px] text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {h.fecha_inicio && <>Iniciado {new Date(h.fecha_inicio).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" })}</>}
                        {h.fecha_fin && <> · finalizado {new Date(h.fecha_fin).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" })}</>}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </Panel>

        {/* Documentos */}
        {(exp.cotizaciones || exp.contratos) && (
          <Panel title="Documentos" subtitle="Cotización y contrato vinculados">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {exp.cotizaciones && (
                <div className="rounded-xl border border-glass bg-glass-elev p-4 text-sm inset-highlight">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-copper" />
                    <p className="font-semibold">Cotización <span className="font-mono text-copper">{exp.cotizaciones.codigo}</span></p>
                  </div>
                  <p className="mt-1 font-mono text-[10.5px] text-muted-foreground">
                    Emitida {new Date(exp.cotizaciones.fecha_emision).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" })}
                  </p>
                  <p className="mt-2 text-right font-mono text-lg font-semibold tabular-nums text-copper">USD {Number(exp.cotizaciones.total).toFixed(2)}</p>
                  <Badge variant="outline" className="mt-1 capitalize">{exp.cotizaciones.estado}</Badge>
                </div>
              )}
              {exp.contratos && (
                <div className="rounded-xl border border-glass bg-glass-elev p-4 text-sm inset-highlight">
                  <div className="flex items-center gap-2">
                    <FileSignature className="h-5 w-5 text-ttteal" />
                    <p className="font-semibold">Contrato <span className="font-mono text-ttteal">{exp.contratos.codigo}</span></p>
                  </div>
                  {exp.contratos.fecha_firma && (
                    <p className="mt-1 font-mono text-[10.5px] text-muted-foreground">
                      Firmado {new Date(exp.contratos.fecha_firma).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" })}
                    </p>
                  )}
                  <p className="mt-2 text-right font-mono text-lg font-semibold tabular-nums text-ttteal">USD {Number(exp.contratos.monto_total).toFixed(2)}</p>
                  <Badge variant="outline" className="mt-1 capitalize">{exp.contratos.estado}</Badge>
                </div>
              )}
            </div>
          </Panel>
        )}

        {exp.descripcion_problema && (
          <Panel title="Lo que pediste">
            <p className="whitespace-pre-wrap text-sm text-foreground/85">{exp.descripcion_problema}</p>
          </Panel>
        )}
      </div>
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
