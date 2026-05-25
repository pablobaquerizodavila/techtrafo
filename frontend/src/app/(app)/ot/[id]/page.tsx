"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, Play, Pause, CheckCircle2, XCircle, AlertTriangle,
  Ban, ShieldCheck, SkipForward, ExternalLink, User, Zap, Factory,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Toaster, toast } from "sonner";
import { PageHeader, HeaderActionGhost } from "@/components/page-header";
import { Panel } from "@/components/panel";
import {
  OT, OTPaso, ResultadoGate,
  estadoOTVariant, estadoPasoIcon, estadoPasoVariant, prioridadVariant, tipoRutaLabel,
  getOT, iniciarOT, pausarOT, completarOT, cancelarOT,
  iniciarPaso, completarPaso, rechazarPaso, saltarPaso,
} from "@/lib/ot";
import { ApiError } from "@/lib/api";
import { TiemposReprocesosPanel } from "./tiempos-reprocesos-panel";
import { GanttOT } from "./gantt";
import { EvidenciasPanel } from "./evidencias-panel";
import { AuditoriaPanel } from "./auditoria-panel";
import { PdfButton } from "../../pdf-button";

interface PageProps { params: Promise<{ id: string }> }

function actionClass(tone: "primary" | "ghost" | "destructive") {
  return tone === "primary"
    ? "inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-3 py-1.5 text-xs font-medium text-white shadow-sm glow-copper-sm inset-highlight-md transition hover:glow-copper disabled:opacity-50 disabled:pointer-events-none"
    : tone === "destructive"
    ? "inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/15 disabled:opacity-50 disabled:pointer-events-none"
    : "inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-3 py-1.5 text-xs font-medium text-foreground/90 transition hover:border-glass-strong hover:bg-glass-elev disabled:opacity-50 disabled:pointer-events-none";
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
        resultado_gate_requerido: "Indicá si el gate fue aprobado, rechazado o con observaciones",
        solo_gates: "Esta acción solo aplica a pasos de tipo gate",
      };
      return map[code] ?? code;
    }
    return "Error";
  }

  async function actOT(label: string, fn: () => Promise<unknown>) {
    if (!window.confirm(`${label}?`)) return;
    setWorking(label);
    try { await fn(); toast.success(label); load(); }
    catch (err) { toast.error(errMsg(err)); }
    finally { setWorking(null); }
  }

  async function handleCancelarOT() {
    if (!ot) return;
    const motivo = window.prompt("Motivo de cancelación:");
    if (!motivo || motivo.trim().length < 3) return;
    setWorking("cancelar");
    try { await cancelarOT(ot.id, motivo.trim()); toast.success("OT cancelada"); load(); }
    catch (err) { toast.error(errMsg(err)); }
    finally { setWorking(null); }
  }

  async function handleCompletarPaso(p: OTPaso) {
    if (!ot) return;
    if (p.es_gate) {
      const res = window.prompt(`Gate "${p.nombre}".\nResultado: aprobado | rechazado | con_observaciones`, "aprobado");
      if (!res) return;
      const resultado = res.trim().toLowerCase() as ResultadoGate;
      if (!["aprobado", "rechazado", "con_observaciones"].includes(resultado)) {
        toast.error("Resultado inválido. Usá: aprobado / rechazado / con_observaciones");
        return;
      }
      const observaciones = window.prompt("Observaciones (opcional):") ?? "";
      setWorking(`paso-${p.id}`);
      try { await completarPaso(ot.id, p.id, { resultado_gate: resultado, observaciones: observaciones || null }); toast.success("Gate cerrado"); load(); }
      catch (err) { toast.error(errMsg(err)); }
      finally { setWorking(null); }
    } else {
      const observaciones = window.prompt("Observaciones (opcional):") ?? "";
      setWorking(`paso-${p.id}`);
      try { await completarPaso(ot.id, p.id, { observaciones: observaciones || null }); toast.success("Paso completado"); load(); }
      catch (err) { toast.error(errMsg(err)); }
      finally { setWorking(null); }
    }
  }

  async function handleRechazarPaso(p: OTPaso) {
    if (!ot) return;
    const obs = window.prompt(`Motivo de rechazo del gate "${p.nombre}":`);
    if (!obs || obs.trim().length < 3) return;
    setWorking(`paso-${p.id}`);
    try { await rechazarPaso(ot.id, p.id, obs.trim()); toast.success("Gate rechazado"); load(); }
    catch (err) { toast.error(errMsg(err)); }
    finally { setWorking(null); }
  }

  async function handleSaltarPaso(p: OTPaso) {
    if (!ot) return;
    if (!window.confirm(`¿Saltar el paso "${p.nombre}"? Quedará marcado como no aplicable.`)) return;
    setWorking(`paso-${p.id}`);
    try { await saltarPaso(ot.id, p.id); toast.success("Paso saltado"); load(); }
    catch (err) { toast.error(errMsg(err)); }
    finally { setWorking(null); }
  }

  if (loading && !ot) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-copper border-t-transparent" />
          <span className="text-sm">Cargando OT…</span>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div>
        <PageHeader breadcrumb={[{ href: "/dashboard", label: "Panel" }, { href: "/ot", label: "Órdenes" }, { label: "Error" }]} title="OT" titleAccent="no encontrada" />
        <div className="pt-6">
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-200 inset-highlight"><p className="text-sm">{error}</p></div>
        </div>
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
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { href: "/ot", label: "Órdenes" }, { label: ot.codigo ?? `#${ot.id}` }]}
        title={ot.codigo ?? `OT #${ot.id}`}
        titleAccent={ot.contratos?.clientes?.razon_social ?? ""}
        meta={
          <>
            <Badge variant={estadoOTVariant(ot.estado)}>{ot.estado.replaceAll("_", " ")}</Badge>
            <Badge variant={prioridadVariant(ot.prioridad)}>{ot.prioridad}</Badge>
            {atrasada && <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" /> atrasada</Badge>}
            <span className="text-muted-foreground/40">·</span>
            <span className="capitalize">{tipoRutaLabel(ot.tipo_ruta)}</span>
            {ot.contratos && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span>
                  Contrato{" "}
                  <Link href={`/contratos/${ot.contratos.id}`} className="font-mono text-copper hover:underline">
                    {ot.contratos.codigo}
                  </Link>
                </span>
              </>
            )}
          </>
        }
        actions={
          <>
            <HeaderActionGhost href="/ot" icon={<ChevronLeft className="h-3.5 w-3.5" />}>Volver</HeaderActionGhost>
            <PdfButton recurso="ot" id={ot.id} />
          </>
        }
      />

      <div className="space-y-6 pt-6">
        {/* Acciones OT */}
        <Panel title="Acciones disponibles" subtitle="Transiciones de la OT" icon={<Factory className="h-3.5 w-3.5" />}>
          <div className="flex flex-wrap items-center gap-2">
            {(ot.estado === "planeada" || ot.estado === "pausada") && (
              <button type="button" onClick={() => actOT("Iniciar OT", () => iniciarOT(ot.id))} disabled={working !== null} className={actionClass("primary")}>
                <Play className="h-3.5 w-3.5" /> {ot.estado === "pausada" ? "Reanudar" : "Iniciar"}
              </button>
            )}
            {ot.estado === "en_curso" && (
              <>
                <button type="button" onClick={() => actOT("Pausar OT", () => pausarOT(ot.id))} disabled={working !== null} className={actionClass("ghost")}>
                  <Pause className="h-3.5 w-3.5" /> Pausar
                </button>
                <button type="button" onClick={() => actOT("Completar OT", () => completarOT(ot.id))} disabled={working !== null} className={actionClass("primary")}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Completar OT
                </button>
              </>
            )}
            {ot.estado !== "completada" && ot.estado !== "cancelada" && (
              <button type="button" onClick={handleCancelarOT} disabled={working !== null} className={actionClass("destructive")}>
                <Ban className="h-3.5 w-3.5" /> Cancelar
              </button>
            )}
            {ot.estado === "completada" && (
              <span className="font-mono text-[11px] text-muted-foreground">OT completada · sin acciones disponibles</span>
            )}
          </div>
        </Panel>

        {ot.motivo_cancelacion && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.05] px-5 py-3 text-sm inset-highlight">
            <strong className="text-rose-300">Motivo de cancelación:</strong>{" "}
            <span className="text-foreground/85">{ot.motivo_cancelacion}</span>
          </div>
        )}

        {/* Info principal */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Panel title="Responsable">
            {ot.usuarios_ot_responsable_idTousuarios ? (
              <div className="flex items-center gap-2 text-foreground/85">
                <div className="grid h-9 w-9 place-items-center rounded-lg border border-glass-mid bg-gradient-to-br from-copper/15 to-ttteal/15 font-display text-[11px] font-bold inset-highlight">
                  {((ot.usuarios_ot_responsable_idTousuarios.nombres?.[0] ?? "") + (ot.usuarios_ot_responsable_idTousuarios.apellidos?.[0] ?? "")).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium">{ot.usuarios_ot_responsable_idTousuarios.nombres} {ot.usuarios_ot_responsable_idTousuarios.apellidos}</p>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Líder de la OT</p>
                </div>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" /> Sin asignar
              </p>
            )}
          </Panel>
          <Panel title="Fechas planeadas">
            <dl className="space-y-1.5 font-mono text-xs">
              <KVLine label="Inicio" value={ot.fecha_inicio_planeada?.split("T")[0] ?? "—"} />
              <KVLine label="Fin" value={ot.fecha_fin_planeada?.split("T")[0] ?? "—"} tone={atrasada ? "rose" : undefined} />
            </dl>
          </Panel>
          <Panel title="Fechas reales">
            <dl className="space-y-1.5 font-mono text-xs">
              <KVLine label="Inicio" value={ot.fecha_inicio_real ? new Date(ot.fecha_inicio_real).toLocaleString("es-EC", { timeZone: "America/Guayaquil" }) : "—"} />
              <KVLine label="Fin" value={ot.fecha_fin_real ? new Date(ot.fecha_fin_real).toLocaleString("es-EC", { timeZone: "America/Guayaquil" }) : "—"} />
            </dl>
          </Panel>
        </section>

        {/* Transformador vinculado */}
        {ot.transformadores && (
          <Link
            href={`/transformadores/${ot.transformadores.id}`}
            className="group block overflow-hidden rounded-xl border border-glass bg-glass p-4 inset-highlight transition hover:border-glass-mid hover:bg-glass-elev"
            style={{ backgroundImage: "radial-gradient(ellipse 50% 80% at 0% 50%, rgba(255,107,53,0.06), transparent 60%)" }}
          >
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-copper to-copper-deep text-white shadow-md glow-copper-sm inset-highlight-md">
                <Zap className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display text-sm font-semibold">
                  <span className="font-mono">{ot.transformadores.codigo_interno}</span>
                  <span className="mx-2 text-muted-foreground/40">·</span>
                  {ot.transformadores.marca ?? ""} {ot.transformadores.modelo ?? ""}
                </p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  <span className="text-ttteal">{ot.transformadores.capacidad_kva >= 1000 ? `${(ot.transformadores.capacidad_kva / 1000).toFixed(ot.transformadores.capacidad_kva % 1000 === 0 ? 0 : 2)} MVA` : `${ot.transformadores.capacidad_kva} kVA`}</span>
                  <span className="mx-1.5 text-muted-foreground/40">·</span>
                  <span className="capitalize">{ot.transformadores.tipo}</span>
                  {ot.transformadores.numero_serie && (
                    <>
                      <span className="mx-1.5 text-muted-foreground/40">·</span>
                      serie {ot.transformadores.numero_serie}
                    </>
                  )}
                </p>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground/50 transition-colors group-hover:text-copper" />
            </div>
          </Link>
        )}

        {ot.descripcion && (
          <Panel title="Descripción">
            <p className="whitespace-pre-wrap text-sm text-foreground/85">{ot.descripcion}</p>
          </Panel>
        )}

        {ot.expedientes && ot.expedientes.length > 0 && (
          <div className="rounded-xl border border-glass bg-glass px-4 py-3 text-sm inset-highlight">
            <span className="text-muted-foreground">Expediente vinculado: </span>
            {ot.expedientes.map((e) => (
              <Link key={e.id} href={`/expedientes/${e.id}`} className="ml-1 inline-flex items-center gap-1 font-mono text-copper hover:underline">
                {e.codigo} <ExternalLink className="h-3 w-3" />
              </Link>
            ))}
          </div>
        )}

        {/* Pipeline de pasos */}
        <Panel
          title="Pasos de producción"
          subtitle={`${completos} / ${pasos.length} pasos · ${pctProgress}% completado`}
          action={
            <div className="flex w-32 items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-glass-elev">
                <div
                  className={`h-full rounded-full transition-all ${pctProgress >= 80 ? "bg-green-500" : pctProgress >= 40 ? "bg-gradient-to-r from-ttteal to-copper" : "bg-muted-foreground/50"}`}
                  style={{ width: `${pctProgress}%` }}
                />
              </div>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{pctProgress}%</span>
            </div>
          }
        >
          <div className="space-y-2.5">
            {pasos.map((p) => {
              const isBusy = working === `paso-${p.id}`;
              const puedeIniciar = p.estado === "pendiente" && ot.estado === "en_curso";
              const puedeOperar = (p.estado === "en_curso" || p.estado === "pendiente") && ot.estado === "en_curso";

              const stepTone =
                p.estado === "rechazado"  ? "border-rose-500/30 bg-rose-500/[0.04]" :
                p.estado === "en_curso"   ? "border-copper/30 bg-copper/[0.04]" :
                p.estado === "completado" ? "border-green-500/25 bg-green-500/[0.03]" :
                p.estado === "saltado"    ? "border-glass bg-glass/40" :
                                            "border-glass bg-glass";

              return (
                <div key={p.id} className={`overflow-hidden rounded-xl border ${stepTone} inset-highlight ${p.es_gate ? "border-l-4 border-l-amber-500" : ""}`}>
                  <div className="flex items-start gap-3 p-4">
                    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border ${
                      p.estado === "completado" ? "border-green-500/40 bg-green-500/15 text-green-300" :
                      p.estado === "en_curso"   ? "border-copper/40 bg-copper/15 text-copper" :
                      p.estado === "rechazado"  ? "border-rose-500/40 bg-rose-500/15 text-rose-300" :
                                                  "border-glass-mid bg-glass-elev text-muted-foreground"
                    } font-display text-lg font-bold`}>
                      {estadoPasoIcon(p.estado)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-display text-sm font-semibold tracking-tight">
                            <span className="font-mono text-muted-foreground">{p.numero}.</span> {p.nombre}
                            {p.es_gate && (
                              <Badge variant="warning" className="ml-2">
                                <ShieldCheck className="mr-1 h-3 w-3" /> GATE {p.numero_gate}
                              </Badge>
                            )}
                          </p>
                          {p.descripcion && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{p.descripcion}</p>
                          )}
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-2">
                          {p.resultado_gate && (
                            <Badge variant={p.resultado_gate === "aprobado" ? "success" : p.resultado_gate === "rechazado" ? "destructive" : "warning"}>
                              {p.resultado_gate}
                            </Badge>
                          )}
                          <Badge variant={estadoPasoVariant(p.estado)}>{p.estado}</Badge>
                        </div>
                      </div>

                      <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 font-mono text-[10.5px] text-muted-foreground md:grid-cols-3">
                        {p.usuarios_ot_pasos_ejecutado_porTousuarios && (
                          <p>Ejecutó: <span className="text-foreground/75">{p.usuarios_ot_pasos_ejecutado_porTousuarios.nombres} {p.usuarios_ot_pasos_ejecutado_porTousuarios.apellidos}</span></p>
                        )}
                        {p.fecha_inicio && <p>Inicio: <span className="text-foreground/75">{new Date(p.fecha_inicio).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}</span></p>}
                        {p.fecha_fin && <p>Fin: <span className="text-foreground/75">{new Date(p.fecha_fin).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}</span></p>}
                        {p.usuarios_ot_pasos_aprobado_porTousuarios && (
                          <p>Aprobó: <span className="text-foreground/75">{p.usuarios_ot_pasos_aprobado_porTousuarios.nombres} {p.usuarios_ot_pasos_aprobado_porTousuarios.apellidos}</span></p>
                        )}
                      </div>

                      {p.observaciones && (
                        <p className="mt-2 whitespace-pre-wrap rounded-lg border border-glass bg-glass-elev px-3 py-2 text-xs text-foreground/80">{p.observaciones}</p>
                      )}

                      {puedeOperar && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {puedeIniciar && (
                            <button type="button" onClick={() => actOT("Iniciar paso", () => iniciarPaso(ot.id, p.id))} disabled={isBusy} className={actionClass("ghost")}>
                              <Play className="h-3 w-3" /> Iniciar
                            </button>
                          )}
                          <button type="button" onClick={() => handleCompletarPaso(p)} disabled={isBusy} className={actionClass("primary")}>
                            <CheckCircle2 className="h-3 w-3" /> Completar
                          </button>
                          {p.es_gate && (
                            <button type="button" onClick={() => handleRechazarPaso(p)} disabled={isBusy} className={actionClass("destructive")}>
                              <XCircle className="h-3 w-3" /> Rechazar
                            </button>
                          )}
                          {!p.es_gate && (
                            <button type="button" onClick={() => handleSaltarPaso(p)} disabled={isBusy} className={`${actionClass("ghost")} opacity-70`}>
                              <SkipForward className="h-3 w-3" /> Saltar
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        {/* Sub-paneles (mantenidos, rebrand visual aplicado en sus archivos) */}
        <TiemposReprocesosPanel otId={ot.id} pasos={pasos} />
        <GanttOT otId={ot.id} />
        <EvidenciasPanel otId={ot.id} pasos={pasos} />
        <AuditoriaPanel otId={ot.id} />
      </div>

      <Toaster richColors position="top-right" theme="dark" />
    </div>
  );
}

function KVLine({ label, value, tone }: { label: string; value: string; tone?: "rose" }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`tabular-nums ${tone === "rose" ? "text-rose-300" : "text-foreground/90"}`}>{value}</dd>
    </div>
  );
}
