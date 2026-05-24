"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, Play, Pause, CheckCircle2, XCircle, AlertTriangle,
  Ban, ShieldCheck, SkipForward, ExternalLink, User, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Toaster, toast } from "sonner";
import {
  OT, OTPaso, ResultadoGate,
  estadoOTVariant, estadoPasoIcon, estadoPasoVariant, prioridadVariant, tipoRutaLabel,
  getOT, iniciarOT, pausarOT, completarOT, cancelarOT,
  iniciarPaso, completarPaso, rechazarPaso, saltarPaso,
} from "@/lib/ot";
import { ApiError } from "@/lib/api";
import { TiemposReprocesosPanel } from "./tiempos-reprocesos-panel";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function OTDetallePage({ params }: PageProps) {
  const router = useRouter();
  const [id, setId] = useState<number | null>(null);
  const [ot, setOT] = useState<OT | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  useEffect(() => { params.then(({ id }) => setId(Number(id))); }, [params]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getOT(id);
      setOT(res.data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setError("OT no encontrada");
      else setError(err instanceof Error ? err.message : "Error cargando");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);

  function errMsg(err: unknown): string {
    if (err instanceof ApiError) {
      const code = String((err.body as { error?: string })?.error ?? err.status);
      const map: Record<string, string> = {
        transicion_invalida: "Transición no permitida desde el estado actual",
        pasos_pendientes: "Hay pasos sin completar — no se puede cerrar la OT",
        ot_no_en_curso: "La OT debe estar en curso para operar pasos",
        no_se_puede_saltar_gate: "Los gates de calidad no pueden saltarse",
        resultado_gate_requerido: "Indica si el gate fue aprobado, rechazado o con observaciones",
        solo_gates: "Esta acción solo aplica a pasos de tipo gate",
      };
      return map[code] ?? code;
    }
    return "Error";
  }

  async function actOT(label: string, fn: () => Promise<unknown>) {
    if (!window.confirm(`${label}?`)) return;
    setWorking(label);
    try {
      await fn();
      toast.success(label);
      load();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setWorking(null);
    }
  }

  async function handleCancelarOT() {
    if (!ot) return;
    const motivo = window.prompt("Motivo de cancelación:");
    if (!motivo || motivo.trim().length < 3) return;
    setWorking("cancelar");
    try {
      await cancelarOT(ot.id, motivo.trim());
      toast.success("OT cancelada");
      load();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setWorking(null);
    }
  }

  async function handleCompletarPaso(p: OTPaso) {
    if (!ot) return;
    if (p.es_gate) {
      const res = window.prompt(
        `Gate "${p.nombre}".\nIndicá resultado: aprobado | rechazado | con_observaciones`,
        "aprobado",
      );
      if (!res) return;
      const resultado = res.trim().toLowerCase() as ResultadoGate;
      if (!["aprobado", "rechazado", "con_observaciones"].includes(resultado)) {
        toast.error("Resultado inválido. Usa: aprobado / rechazado / con_observaciones");
        return;
      }
      const observaciones = window.prompt("Observaciones (opcional):") ?? "";
      setWorking(`paso-${p.id}`);
      try {
        await completarPaso(ot.id, p.id, { resultado_gate: resultado, observaciones: observaciones || null });
        toast.success("Gate cerrado");
        load();
      } catch (err) {
        toast.error(errMsg(err));
      } finally {
        setWorking(null);
      }
    } else {
      const observaciones = window.prompt("Observaciones (opcional):") ?? "";
      setWorking(`paso-${p.id}`);
      try {
        await completarPaso(ot.id, p.id, { observaciones: observaciones || null });
        toast.success("Paso completado");
        load();
      } catch (err) {
        toast.error(errMsg(err));
      } finally {
        setWorking(null);
      }
    }
  }

  async function handleRechazarPaso(p: OTPaso) {
    if (!ot) return;
    const obs = window.prompt(`Motivo de rechazo del gate "${p.nombre}":`);
    if (!obs || obs.trim().length < 3) return;
    setWorking(`paso-${p.id}`);
    try {
      await rechazarPaso(ot.id, p.id, obs.trim());
      toast.success("Gate rechazado");
      load();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setWorking(null);
    }
  }

  async function handleSaltarPaso(p: OTPaso) {
    if (!ot) return;
    if (!window.confirm(`Saltar el paso "${p.nombre}"? Quedará marcado como no aplicable.`)) return;
    setWorking(`paso-${p.id}`);
    try {
      await saltarPaso(ot.id, p.id);
      toast.success("Paso saltado");
      load();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setWorking(null);
    }
  }

  if (loading && !ot) return <div className="text-muted-foreground">Cargando OT...</div>;
  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/ot"><ChevronLeft className="mr-1 h-4 w-4" /> Volver</Link>
        </Button>
        <p className="text-destructive">{error}</p>
      </div>
    );
  }
  if (!ot) return null;

  const pasos = ot.ot_pasos ?? [];
  const completos = pasos.filter((p) => p.estado === "completado" || p.estado === "saltado").length;
  const pctProgress = pasos.length ? Math.round((completos / pasos.length) * 100) : 0;

  const atrasada = ot.fecha_fin_planeada && new Date(ot.fecha_fin_planeada) < new Date()
    && ["planeada", "en_curso", "pausada"].includes(ot.estado);

  return (
    <div className="space-y-6">
      <header>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link href="/ot"><ChevronLeft className="mr-1 h-4 w-4" /> Volver a OT</Link>
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold">{ot.codigo ?? `OT #${ot.id}`}</h2>
            <p className="text-muted-foreground">
              {ot.contratos?.clientes?.razon_social} · contrato{" "}
              <Link href={`/contratos/${ot.contratos?.id}`} className="text-primary hover:underline">
                {ot.contratos?.codigo}
              </Link>
              {" · "}
              <span className="capitalize">{tipoRutaLabel(ot.tipo_ruta)}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {atrasada && (
              <Badge variant="destructive" className="text-sm">
                <AlertTriangle className="mr-1 h-4 w-4" /> Atrasada
              </Badge>
            )}
            <Badge variant={prioridadVariant(ot.prioridad)}>{ot.prioridad}</Badge>
            <Badge variant={estadoOTVariant(ot.estado)} className="text-base">{ot.estado.toUpperCase()}</Badge>
          </div>
        </div>
      </header>

      {/* Transiciones de OT */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-3">
        <span className="text-sm font-medium">Acciones:</span>
        {(ot.estado === "planeada" || ot.estado === "pausada") && (
          <Button size="sm" onClick={() => actOT("Iniciar OT", () => iniciarOT(ot.id))} disabled={working !== null}>
            <Play className="mr-1 h-3.5 w-3.5" /> {ot.estado === "pausada" ? "Reanudar" : "Iniciar"}
          </Button>
        )}
        {ot.estado === "en_curso" && (
          <>
            <Button size="sm" variant="outline" onClick={() => actOT("Pausar OT", () => pausarOT(ot.id))} disabled={working !== null}>
              <Pause className="mr-1 h-3.5 w-3.5" /> Pausar
            </Button>
            <Button size="sm" variant="default" onClick={() => actOT("Completar OT", () => completarOT(ot.id))} disabled={working !== null}>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Completar OT
            </Button>
          </>
        )}
        {ot.estado !== "completada" && ot.estado !== "cancelada" && (
          <Button size="sm" variant="destructive" onClick={handleCancelarOT} disabled={working !== null}>
            <Ban className="mr-1 h-3.5 w-3.5" /> Cancelar
          </Button>
        )}
      </div>

      {ot.motivo_cancelacion && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <strong>Motivo de cancelación:</strong> {ot.motivo_cancelacion}
        </div>
      )}

      {/* Info principal */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-md border p-4 text-sm">
          <h3 className="mb-2 font-semibold">Responsable</h3>
          {ot.usuarios_ot_responsable_idTousuarios ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="h-4 w-4" />
              <span>
                {ot.usuarios_ot_responsable_idTousuarios.nombres} {ot.usuarios_ot_responsable_idTousuarios.apellidos}
              </span>
            </div>
          ) : <p className="text-muted-foreground">Sin asignar</p>}
        </div>
        <div className="rounded-md border p-4 text-sm">
          <h3 className="mb-2 font-semibold">Fechas planeadas</h3>
          <p className="text-muted-foreground">
            Inicio: {ot.fecha_inicio_planeada?.split("T")[0] ?? "—"}<br />
            Fin: {ot.fecha_fin_planeada?.split("T")[0] ?? "—"}
          </p>
        </div>
        <div className="rounded-md border p-4 text-sm">
          <h3 className="mb-2 font-semibold">Fechas reales</h3>
          <p className="text-muted-foreground">
            Inicio: {ot.fecha_inicio_real ? new Date(ot.fecha_inicio_real).toLocaleString("es-EC") : "—"}<br />
            Fin: {ot.fecha_fin_real ? new Date(ot.fecha_fin_real).toLocaleString("es-EC") : "—"}
          </p>
        </div>
      </div>

      {/* Transformador vinculado */}
      {ot.transformadores && (
        <Link
          href={`/transformadores/${ot.transformadores.id}`}
          className="block rounded-md border p-4 transition hover:border-primary hover:bg-accent"
        >
          <div className="flex items-center gap-3">
            <Zap className="h-6 w-6 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-semibold">
                {ot.transformadores.codigo_interno} —{" "}
                {ot.transformadores.marca ?? ""} {ot.transformadores.modelo ?? ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {ot.transformadores.capacidad_kva >= 1000
                  ? `${(ot.transformadores.capacidad_kva / 1000).toFixed(ot.transformadores.capacidad_kva % 1000 === 0 ? 0 : 2)} MVA`
                  : `${ot.transformadores.capacidad_kva} kVA`}
                {" · "}{ot.transformadores.tipo}
                {ot.transformadores.numero_serie && ` · serie ${ot.transformadores.numero_serie}`}
              </p>
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </div>
        </Link>
      )}

      {ot.descripcion && (
        <div className="rounded-md border bg-muted/20 p-4 text-sm">
          <h3 className="mb-1 font-semibold">Descripción</h3>
          <p className="whitespace-pre-wrap text-muted-foreground">{ot.descripcion}</p>
        </div>
      )}

      {/* Vínculos */}
      {(ot.expedientes && ot.expedientes.length > 0) && (
        <div className="rounded-md border p-3 text-sm">
          Expediente vinculado:{" "}
          {ot.expedientes.map((e) => (
            <Link key={e.id} href={`/expedientes/${e.id}`} className="ml-1 inline-flex items-center gap-1 text-primary hover:underline">
              {e.codigo} <ExternalLink className="h-3 w-3" />
            </Link>
          ))}
        </div>
      )}

      {/* Pipeline de pasos */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xl font-bold">Pasos de producción</h3>
          <span className="text-sm text-muted-foreground">
            {completos} / {pasos.length} pasos ({pctProgress}%)
          </span>
        </div>
        <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${pctProgress}%` }} />
        </div>

        <div className="space-y-2">
          {pasos.map((p) => {
            const isBusy = working === `paso-${p.id}`;
            const puedeIniciar = p.estado === "pendiente" && ot.estado === "en_curso";
            const puedeOperar = (p.estado === "en_curso" || p.estado === "pendiente") && ot.estado === "en_curso";
            return (
              <div
                key={p.id}
                className={`rounded-md border p-3 ${
                  p.estado === "rechazado" ? "border-destructive bg-destructive/5"
                  : p.estado === "en_curso" ? "border-primary bg-primary/5"
                  : p.estado === "completado" ? "bg-green-50/50" : ""
                } ${p.es_gate ? "border-l-4 border-l-yellow-500" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-background text-lg font-bold">
                    {estadoPasoIcon(p.estado)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">
                          {p.numero}. {p.nombre}
                          {p.es_gate && (
                            <Badge variant="warning" className="ml-2 text-xs">
                              <ShieldCheck className="mr-1 h-3 w-3" /> GATE {p.numero_gate}
                            </Badge>
                          )}
                        </p>
                        {p.descripcion && (
                          <p className="text-xs text-muted-foreground">{p.descripcion}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {p.resultado_gate && (
                          <Badge variant={p.resultado_gate === "aprobado" ? "success" : p.resultado_gate === "rechazado" ? "destructive" : "warning"} className="text-xs">
                            {p.resultado_gate}
                          </Badge>
                        )}
                        <Badge variant={estadoPasoVariant(p.estado)}>{p.estado}</Badge>
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-muted-foreground md:grid-cols-3">
                      {p.usuarios_ot_pasos_ejecutado_porTousuarios && (
                        <p>Ejecutó: {p.usuarios_ot_pasos_ejecutado_porTousuarios.nombres} {p.usuarios_ot_pasos_ejecutado_porTousuarios.apellidos}</p>
                      )}
                      {p.fecha_inicio && <p>Inicio: {new Date(p.fecha_inicio).toLocaleString("es-EC")}</p>}
                      {p.fecha_fin && <p>Fin: {new Date(p.fecha_fin).toLocaleString("es-EC")}</p>}
                      {p.usuarios_ot_pasos_aprobado_porTousuarios && (
                        <p>Aprobó: {p.usuarios_ot_pasos_aprobado_porTousuarios.nombres} {p.usuarios_ot_pasos_aprobado_porTousuarios.apellidos}</p>
                      )}
                    </div>

                    {p.observaciones && (
                      <p className="mt-2 rounded bg-muted px-2 py-1 text-xs whitespace-pre-wrap">{p.observaciones}</p>
                    )}

                    {puedeOperar && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {puedeIniciar && (
                          <Button size="sm" variant="outline" onClick={() => actOT("Iniciar paso", () => iniciarPaso(ot.id, p.id))} disabled={isBusy}>
                            <Play className="mr-1 h-3.5 w-3.5" /> Iniciar
                          </Button>
                        )}
                        <Button size="sm" onClick={() => handleCompletarPaso(p)} disabled={isBusy}>
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Completar
                        </Button>
                        {p.es_gate && (
                          <Button size="sm" variant="destructive" onClick={() => handleRechazarPaso(p)} disabled={isBusy}>
                            <XCircle className="mr-1 h-3.5 w-3.5" /> Rechazar
                          </Button>
                        )}
                        {!p.es_gate && (
                          <Button size="sm" variant="ghost" onClick={() => handleSaltarPaso(p)} disabled={isBusy}>
                            <SkipForward className="mr-1 h-3.5 w-3.5" /> Saltar
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Panel de tiempos + reprocesos (migration 013) */}
      <TiemposReprocesosPanel otId={ot.id} pasos={pasos} />

      <Toaster richColors position="top-right" />
    </div>
  );
}
