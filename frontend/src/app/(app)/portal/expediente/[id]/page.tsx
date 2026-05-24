"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft, CheckCircle2, Clock, Circle, Zap, Calendar, FileText, FileSignature,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    try {
      const r = await getMiExpediente(id);
      setExp(r.data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setError("Este pedido no existe o no te pertenece");
      else setError(err instanceof Error ? err.message : "Error cargando");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);

  if (loading && !exp) return <div className="text-muted-foreground">Cargando...</div>;
  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/portal"><ChevronLeft className="mr-1 h-4 w-4" /> Volver</Link>
        </Button>
        <p className="text-destructive">{error}</p>
      </div>
    );
  }
  if (!exp) return null;

  const tipoLabel = (exp.tipo_servicio_confirmado ?? exp.tipo_servicio_estimado ?? "—")
    .replace(/^./, (c) => c.toUpperCase());

  return (
    <div className="space-y-6">
      <header>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link href="/portal"><ChevronLeft className="mr-1 h-4 w-4" /> Volver a mis pedidos</Link>
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold">{exp.codigo}</h2>
            <p className="text-muted-foreground">
              {tipoLabel}
              {exp.transformadores && (
                <>
                  {" · "}
                  <span>
                    {exp.transformadores.marca} {exp.transformadores.modelo}{" "}
                    {exp.transformadores.capacidad_kva >= 1000
                      ? `${(exp.transformadores.capacidad_kva / 1000).toFixed(0)} MVA`
                      : `${exp.transformadores.capacidad_kva} kVA`}
                  </span>
                </>
              )}
            </p>
          </div>
          <Badge variant={exp.estado === "ganado" ? "success" : exp.estado === "activo" ? "default" : "muted"} className="text-base">
            {exp.estado === "activo" ? "EN PROCESO" : exp.estado === "ganado" ? "COMPLETADO" : exp.estado.toUpperCase()}
          </Badge>
        </div>
      </header>

      {/* Estado actual ejecutivo */}
      <section className="rounded-md border border-primary/30 bg-primary/5 p-6">
        <p className="text-xs uppercase text-muted-foreground">Estado actual</p>
        <h3 className="mt-1 text-2xl font-bold text-primary">{exp.portal_meta.fase_actual_label}</h3>
        {exp.portal_meta.proximo_paso_label && (
          <p className="mt-1 text-sm text-muted-foreground">
            Próximo: {exp.portal_meta.proximo_paso_label}
          </p>
        )}
        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1">
            <div className="h-3 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${exp.portal_meta.avance_pct}%` }}
              />
            </div>
          </div>
          <span className="text-2xl font-bold">{exp.portal_meta.avance_pct}%</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {exp.portal_meta.completados} de {exp.portal_meta.total} etapas completadas
        </p>
      </section>

      {/* Info equipo */}
      {exp.transformadores && (
        <section className="rounded-md border p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Zap className="h-4 w-4 text-yellow-600" /> Tu equipo
          </h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm md:grid-cols-4">
            <dt className="text-muted-foreground">Marca:</dt><dd>{exp.transformadores.marca ?? "—"}</dd>
            <dt className="text-muted-foreground">Modelo:</dt><dd>{exp.transformadores.modelo ?? "—"}</dd>
            <dt className="text-muted-foreground">Capacidad:</dt>
            <dd className="font-mono">
              {exp.transformadores.capacidad_kva >= 1000
                ? `${(exp.transformadores.capacidad_kva / 1000).toFixed(0)} MVA`
                : `${exp.transformadores.capacidad_kva} kVA`}
            </dd>
            <dt className="text-muted-foreground">Tipo:</dt><dd className="capitalize">{exp.transformadores.tipo}</dd>
            {exp.transformadores.numero_serie && (
              <>
                <dt className="text-muted-foreground">Serie:</dt>
                <dd className="font-mono">{exp.transformadores.numero_serie}</dd>
              </>
            )}
          </dl>
        </section>
      )}

      {/* Timeline simplificado */}
      <section>
        <h3 className="mb-3 text-lg font-bold">Ruta del proceso</h3>
        <ol className="relative space-y-3 border-l-2 border-muted pl-6">
          {exp.expediente_hitos.map((h) => {
            const completado = h.estado === "completado";
            const enCurso = h.estado === "en_curso";
            const Icon = completado ? CheckCircle2 : enCurso ? Clock : Circle;
            return (
              <li key={h.id} className="relative">
                <span
                  className={`absolute -left-[34px] flex h-7 w-7 items-center justify-center rounded-full border-2 bg-background
                    ${completado ? "border-green-500 text-green-600" : enCurso ? "border-primary text-primary animate-pulse" : "border-muted text-muted-foreground"}`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className={`rounded-md border p-3 ${enCurso ? "border-primary bg-primary/5" : completado ? "bg-green-50/50" : "bg-muted/20"}`}>
                  <p className="font-semibold">
                    {h.emoji && <span className="mr-1">{h.emoji}</span>}
                    {h.label_cliente}
                  </p>
                  {h.descripcion_cliente && (
                    <p className="text-xs text-muted-foreground">{h.descripcion_cliente}</p>
                  )}
                  {(h.fecha_inicio || h.fecha_fin) && (
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {h.fecha_inicio && <>Iniciado {new Date(h.fecha_inicio).toLocaleDateString("es-EC")}</>}
                      {h.fecha_fin && <> · finalizado {new Date(h.fecha_fin).toLocaleDateString("es-EC")}</>}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Documentos aprobados */}
      {(exp.cotizaciones || exp.contratos) && (
        <section>
          <h3 className="mb-3 text-lg font-bold">Documentos</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {exp.cotizaciones && (
              <div className="rounded-md border p-4 text-sm">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <p className="font-semibold">Cotización {exp.cotizaciones.codigo}</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Emitida {new Date(exp.cotizaciones.fecha_emision).toLocaleDateString("es-EC")}
                </p>
                <p className="mt-1 font-mono text-right">USD {Number(exp.cotizaciones.total).toFixed(2)}</p>
                <Badge variant="outline" className="mt-2 capitalize">{exp.cotizaciones.estado}</Badge>
              </div>
            )}
            {exp.contratos && (
              <div className="rounded-md border p-4 text-sm">
                <div className="flex items-center gap-2">
                  <FileSignature className="h-5 w-5 text-primary" />
                  <p className="font-semibold">Contrato {exp.contratos.codigo}</p>
                </div>
                {exp.contratos.fecha_firma && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Firmado {new Date(exp.contratos.fecha_firma).toLocaleDateString("es-EC")}
                  </p>
                )}
                <p className="mt-1 font-mono text-right">USD {Number(exp.contratos.monto_total).toFixed(2)}</p>
                <Badge variant="outline" className="mt-2 capitalize">{exp.contratos.estado}</Badge>
              </div>
            )}
          </div>
        </section>
      )}

      {exp.descripcion_problema && (
        <section className="rounded-md border bg-muted/20 p-4 text-sm">
          <h3 className="mb-1 font-semibold">Lo que pediste</h3>
          <p className="whitespace-pre-wrap text-muted-foreground">{exp.descripcion_problema}</p>
        </section>
      )}
    </div>
  );
}
