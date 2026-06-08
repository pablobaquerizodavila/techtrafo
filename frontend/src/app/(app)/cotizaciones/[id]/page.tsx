"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, Send, CheckCircle2, XCircle, Ban, FileText, Clock,
  ShieldCheck, AlertCircle, ArrowUpToLine, History,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Toaster, toast } from "sonner";
import { PageHeader, HeaderActionGhost } from "@/components/page-header";
import { Panel } from "@/components/panel";
import {
  Cotizacion,
  RevisionHistorialItem,
  TransicionAccion,
  aprobarRevisionInterna,
  escalarRevisionInterna,
  estadoVariant,
  getCotizacion,
  getRevisionHistorial,
  nivelRevisionLabel,
  rechazarRevisionInterna,
  rolDeNivelRevision,
  solicitarRevisionInterna,
  transicionCotizacion,
  transicionCotizacionForzada,
  getConfigMargen,
  ConfigMargenRow,
  transicionesPosibles,
  updateCotizacion,
} from "@/lib/cotizaciones";
import { AuthUser, getCurrentUser } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { CotizacionForm } from "../cotizacion-form";
import { PdfButton } from "../../pdf-button";

interface PageProps { params: Promise<{ id: string }> }

const ROLES_OVERRIDE = ["presidencia", "gerencia_general", "gerencia_comercial"];

const accionConfig: Record<TransicionAccion, { label: string; icon: typeof Send; tone: "primary" | "ghost" | "destructive" }> = {
  enviar:    { label: "Enviar al cliente",     icon: Send,         tone: "primary" },
  aprobar:   { label: "Marcar como aprobada",  icon: CheckCircle2, tone: "primary" },
  rechazar:  { label: "Marcar como rechazada", icon: XCircle,      tone: "destructive" },
  cancelar:  { label: "Cancelar",              icon: Ban,          tone: "destructive" },
  vencer:    { label: "Marcar como vencida",   icon: Clock,        tone: "ghost" },
  convertir: { label: "Convertir a contrato",  icon: FileText,     tone: "primary" },
};

function actionClass(tone: "primary" | "ghost" | "destructive") {
  return tone === "primary"
    ? "inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-3 py-1.5 text-xs font-medium text-white shadow-sm glow-copper-sm inset-highlight-md transition hover:glow-copper disabled:opacity-50 disabled:pointer-events-none"
    : tone === "destructive"
    ? "inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/15 disabled:opacity-50 disabled:pointer-events-none"
    : "inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-3 py-1.5 text-xs font-medium text-foreground/90 transition hover:border-glass-strong hover:bg-glass-elev disabled:opacity-50 disabled:pointer-events-none";
}

export default function CotizacionDetallePage({ params }: PageProps) {
  const router = useRouter();
  const [id, setId] = useState<number | null>(null);
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [historial, setHistorial] = useState<RevisionHistorialItem[]>([]);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);
  const [working, setWorking] = useState(false);
  const [configMargen, setConfigMargen] = useState<Record<string, number>>({});
  const [showMargenDialog, setShowMargenDialog] = useState(false);
  const [margenDialogInfo, setMargenDialogInfo] = useState<{
    margen_actual: number;
    margen_minimo: number;
    tipo_servicio: string;
  } | null>(null);

  useEffect(() => { params.then(({ id }) => setId(Number(id))); }, [params]);
  useEffect(() => { getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null)); }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getCotizacion(id);
      setCotizacion(res.data);
      const h = await getRevisionHistorial(id);
      setHistorial(h.data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setError("Cotización no encontrada");
      else setError(err instanceof Error ? err.message : "Error cargando");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);

  useEffect(() => {
    getConfigMargen()
      .then((rows) => {
        const map: Record<string, number> = {};
        for (const row of rows) map[row.tipo_servicio] = Number(row.margen_minimo);
        setConfigMargen(map);
      })
      .catch(() => {}); // non-blocking
  }, []);

  async function handleTransicion(accion: TransicionAccion, forzar = false) {
    if (!cotizacion) return;
    if (accion === "convertir") { router.push(`/contratos/nuevo?cotizacion=${cotizacion.id}`); return; }
    if (["rechazar", "cancelar", "vencer"].includes(accion)) {
      const motivo = window.prompt(`Motivo de ${accion}:`);
      if (motivo === null) return;
      try {
        await transicionCotizacion(cotizacion.id, accion, motivo);
        toast.success(`Cotizacion ${accion === "cancelar" ? "cancelada" : accion + "da"}`);
        load();
      } catch (err) {
        toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error");
      }
      return;
    }
    if (accion !== "enviar" && !window.confirm(`Confirmar: ${accionConfig[accion].label}?`)) return;
    try {
      const fn = forzar ? transicionCotizacionForzada : transicionCotizacion;
      await fn(cotizacion.id, accion);
      toast.success("Estado actualizado");
      setShowMargenDialog(false);
      setMargenDialogInfo(null);
      load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const body = err.body as { error?: string; margen_actual?: number; margen_minimo?: number; tipo_servicio?: string; puede_forzar?: boolean };
        if (body.error === "margen_insuficiente") {
          if (body.puede_forzar) {
            setMargenDialogInfo({
              margen_actual: body.margen_actual ?? 0,
              margen_minimo: body.margen_minimo ?? 0,
              tipo_servicio: body.tipo_servicio ?? cotizacion.tipo_servicio,
            });
            setShowMargenDialog(true);
          } else {
            toast.error(
              `Margen insuficiente: ${body.margen_actual ?? 0}% (minimo ${body.margen_minimo ?? 0}% para ${body.tipo_servicio}). Contacta a gerencia.`
            );
          }
          return;
        }
      }
      toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error");
    }
  }

  async function handleSolicitar() {
    if (!cotizacion) return;
    if (!window.confirm("¿Solicitar revisión interna? Se enviará al rol de Gerencia Comercial para aprobación.")) return;
    setWorking(true);
    try { await solicitarRevisionInterna(cotizacion.id); toast.success("Revisión interna solicitada"); load(); }
    catch (err) { toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error"); }
    finally { setWorking(false); }
  }
  async function handleAprobarRev() {
    if (!cotizacion) return;
    const notas = window.prompt("Notas opcionales para la aprobación:") ?? undefined;
    setWorking(true);
    try { await aprobarRevisionInterna(cotizacion.id, notas || undefined); toast.success("Aprobación interna registrada"); load(); }
    catch (err) { toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error"); }
    finally { setWorking(false); }
  }
  async function handleRechazarRev() {
    if (!cotizacion) return;
    const motivo = window.prompt("Motivo del rechazo interno (obligatorio):");
    if (!motivo || motivo.trim() === "") return;
    setWorking(true);
    try { await rechazarRevisionInterna(cotizacion.id, motivo.trim()); toast.success("Cotización rechazada internamente"); load(); }
    catch (err) { toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error"); }
    finally { setWorking(false); }
  }
  async function handleEscalarRev() {
    if (!cotizacion) return;
    const nivelActual = cotizacion.revision_interna_nivel ?? 1;
    if (nivelActual >= 3) { toast.error("Ya está en el nivel máximo (presidencia)"); return; }
    const siguiente = rolDeNivelRevision(nivelActual + 1);
    const mensaje = window.prompt(`Mensaje para ${siguiente} (obligatorio):`);
    if (!mensaje || mensaje.trim() === "") return;
    setWorking(true);
    try { const res = await escalarRevisionInterna(cotizacion.id, mensaje.trim()); toast.success(`Escalada a ${res.rol_destino}`); load(); }
    catch (err) { toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error"); }
    finally { setWorking(false); }
  }

  if (loading && !cotizacion) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-copper border-t-transparent" />
          <span className="text-sm">Cargando cotización…</span>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div>
        <PageHeader breadcrumb={[{ href: "/dashboard", label: "Panel" }, { href: "/cotizaciones", label: "Cotizaciones" }, { label: "Error" }]} title="Cotización" titleAccent="no encontrada" />
        <div className="pt-6">
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-200 inset-highlight"><p className="text-sm">{error}</p></div>
        </div>
      </div>
    );
  }
  if (!cotizacion) return null;

  const editable = cotizacion.estado !== "convertida" && cotizacion.estado !== "cancelada" && cotizacion.estado !== "rechazada";
  const transiciones = transicionesPosibles(cotizacion.estado);

  // -------- Gating revisión interna --------
  const rev = cotizacion.revision_interna_estado;
  const nivelActual = cotizacion.revision_interna_nivel ?? 1;
  const rolEsperado = rolDeNivelRevision(nivelActual);
  const userRol = currentUser?.rol_nombre ?? "";
  const esOverride = !!currentUser?.es_super_admin || ROLES_OVERRIDE.includes(userRol);
  const userEsResponsableNivel = userRol === rolEsperado || esOverride;
  const esCreadorOAdmin = currentUser?.id === cotizacion.vendedor_id || esOverride;
  const puedeSolicitar = (rev === "no_solicitada" || rev === "rechazada") && cotizacion.estado === "borrador" && esCreadorOAdmin;
  const puedeActuar = rev === "pendiente" && userEsResponsableNivel;
  const puedeEscalar = puedeActuar && nivelActual < 3;
  const transicionesFiltradas = transiciones.filter((a) => !(a === "enviar" && rev !== "aprobada"));

  // Tono del panel de revisión según estado
  const revPanelTone =
    rev === "aprobada"  ? "border-green-500/30 bg-green-500/[0.04]" :
    rev === "pendiente" ? "border-ttteal/30 bg-ttteal/[0.04]" :
    rev === "rechazada" ? "border-rose-500/30 bg-rose-500/[0.04]" :
                          "border-glass bg-glass";

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { href: "/cotizaciones", label: "Cotizaciones" }, { label: cotizacion.codigo }]}
        title={cotizacion.codigo}
        titleAccent={cotizacion.clientes?.razon_social ?? ""}
        meta={
          <>
            <Badge variant={estadoVariant(cotizacion.estado)}>{cotizacion.estado}</Badge>
            <span className="text-muted-foreground/40">·</span>
            <span>Revisión <span className="font-mono text-foreground">{cotizacion.revision_actual}</span></span>
            <span className="text-muted-foreground/40">·</span>
            <span>{cotizacion.clientes?.ruc_cedula}</span>
          </>
        }
        actions={
          <>
            <HeaderActionGhost href="/cotizaciones" icon={<ChevronLeft className="h-3.5 w-3.5" />}>Volver</HeaderActionGhost>
            <PdfButton recurso="cotizacion" id={cotizacion.id} />
          </>
        }
      />

      <div className="space-y-6 pt-6">
        {/* Revisión interna */}
        <section className={`overflow-hidden rounded-xl border ${revPanelTone} inset-highlight`}>
          <div className="flex items-center justify-between border-b border-glass px-5 py-3.5">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-4 w-4 text-copper" />
              <h3 className="font-display text-sm font-semibold tracking-tight">Revisión interna</h3>
              <Badge variant={
                rev === "aprobada"  ? "success" :
                rev === "pendiente" ? "teal" :
                rev === "rechazada" ? "destructive" :
                                      "muted"
              }>
                {rev === "no_solicitada" ? "no solicitada" : rev}
              </Badge>
              {rev === "pendiente" && (
                <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
                  · esperando <span className="text-foreground">{nivelRevisionLabel(nivelActual)}</span>
                </span>
              )}
            </div>
          </div>
          <div className="p-5">
            {rev === "no_solicitada" && cotizacion.estado === "borrador" && (
              <p className="mb-3 text-sm text-muted-foreground">
                Antes de enviar al cliente, esta cotización debe aprobarse internamente: primero Gerencia Comercial, con escalamientos a Gerencia General y Presidencia si es necesario.
              </p>
            )}
            {rev === "rechazada" && (
              <div className="mb-3 text-sm">
                <p className="font-medium text-rose-300">Motivo del rechazo</p>
                <p className="mt-0.5 whitespace-pre-wrap text-foreground/85">{cotizacion.revision_interna_motivo_rechazo ?? "—"}</p>
                <p className="mt-2 text-xs text-muted-foreground">Corregí las líneas o condiciones y volvé a solicitar la revisión.</p>
              </div>
            )}
            {rev === "aprobada" && (
              <p className="mb-3 text-sm text-muted-foreground">
                Aprobada internamente el {cotizacion.revision_interna_resuelta_at ? new Date(cotizacion.revision_interna_resuelta_at).toLocaleString("es-EC", { timeZone: "America/Guayaquil" }) : "—"}. Ya podés enviarla al cliente desde el bloque de acciones.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {puedeSolicitar && (
                <button type="button" onClick={handleSolicitar} disabled={working} className={actionClass("primary")}>
                  <Send className="h-3.5 w-3.5" /> Solicitar revisión interna
                </button>
              )}
              {puedeActuar && (
                <>
                  <button type="button" onClick={handleAprobarRev} disabled={working} className={actionClass("primary")}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Aprobar internamente
                  </button>
                  <button type="button" onClick={handleRechazarRev} disabled={working} className={actionClass("destructive")}>
                    <XCircle className="h-3.5 w-3.5" /> Rechazar
                  </button>
                  {puedeEscalar && (
                    <button type="button" onClick={handleEscalarRev} disabled={working} className={actionClass("ghost")}>
                      <ArrowUpToLine className="h-3.5 w-3.5" /> Escalar a {nivelRevisionLabel(nivelActual + 1)}
                    </button>
                  )}
                </>
              )}
              {rev === "pendiente" && !puedeActuar && (
                <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <AlertCircle className="h-3 w-3" />
                  Solo {nivelRevisionLabel(nivelActual)} (o override) puede aprobar/rechazar/escalar.
                </p>
              )}
              {historial.length > 0 && (
                <button type="button" onClick={() => setMostrarHistorial((v) => !v)} className={actionClass("ghost")}>
                  <History className="h-3.5 w-3.5" />
                  {mostrarHistorial ? "Ocultar historial" : `Ver historial (${historial.length})`}
                </button>
              )}
            </div>

            {mostrarHistorial && historial.length > 0 && (
              <div className="mt-4 space-y-1.5 rounded-lg border border-glass bg-background/40 p-3 font-mono text-[11px]">
                {historial.map((h) => (
                  <div key={h.id} className="flex items-start justify-between gap-3 border-b border-glass pb-1.5 last:border-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <span className="text-muted-foreground">{new Date(h.created_at).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}</span>
                      <span className="mx-1.5 text-muted-foreground/40">·</span>
                      <strong className="text-foreground/90">{h.accion}</strong>
                      <span className="mx-1.5 text-muted-foreground/40">·</span>
                      <span className="text-copper">{nivelRevisionLabel(h.nivel)}</span>
                      <span className="mx-1.5 text-muted-foreground/40">·</span>
                      <span className="text-muted-foreground">
                        {h.nombres ? `${h.nombres} ${h.apellidos ?? ""}` : "—"}
                        {h.rol_actuante && ` (${h.rol_actuante})`}
                      </span>
                    </div>
                    {h.notas && <span className="max-w-md italic text-muted-foreground">&ldquo;{h.notas}&rdquo;</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Acciones de transición */}
        {transicionesFiltradas.length > 0 && (
          <Panel title="Acciones disponibles" subtitle="Transiciones de estado">
            <div className="flex flex-wrap items-center gap-2">
              {/* Indicador de margen minimo */}
              {cotizacion.margen_porcentaje !== null && cotizacion.tipo_servicio && configMargen[cotizacion.tipo_servicio] !== undefined && (() => {
                const margenActual = Number(cotizacion.margen_porcentaje);
                const margenMin = configMargen[cotizacion.tipo_servicio];
                const diff = margenActual - margenMin;
                const color = diff >= 0
                  ? "text-green-400 bg-green-500/10 border-green-500/20"
                  : diff >= -5
                  ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
                  : "text-rose-400 bg-rose-500/10 border-rose-500/20";
                const icon = diff >= 0 ? "✓" : "✗";
                return (
                  <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium ${color}`}>
                    Margen: {margenActual}% {icon} (min {margenMin}%)
                  </span>
                );
              })()}
              {transicionesFiltradas.map((accion) => {
                const cfg = accionConfig[accion];
                const Icon = cfg.icon;
                return (
                  <button key={accion} type="button" onClick={() => handleTransicion(accion)} className={actionClass(cfg.tone)}>
                    <Icon className="h-3.5 w-3.5" /> {cfg.label}
                  </button>
                );
              })}
              {transiciones.includes("enviar") && rev !== "aprobada" && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <AlertCircle className="h-3 w-3" />
                  &ldquo;Enviar al cliente&rdquo; requiere aprobación interna primero.
                </span>
              )}
            </div>
          </Panel>
        )}

        {/* Revisiones previas (snapshots) */}
        {cotizacion.cotizacion_revisiones && cotizacion.cotizacion_revisiones.length > 0 && (
          <details className="rounded-xl border border-glass bg-glass p-4 text-sm inset-highlight">
            <summary className="cursor-pointer font-display text-sm font-semibold tracking-tight">
              {cotizacion.cotizacion_revisiones.length} revisión{cotizacion.cotizacion_revisiones.length === 1 ? "" : "es"} previas
            </summary>
            <ul className="mt-3 space-y-1 font-mono text-[11px] text-muted-foreground">
              {cotizacion.cotizacion_revisiones.map((r) => (
                <li key={r.id} className="border-b border-glass pb-1 last:border-0 last:pb-0">
                  <span className="text-copper">rev {r.revision}</span>
                  <span className="mx-1.5 text-muted-foreground/40">·</span>
                  <span>{new Date(r.created_at).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}</span>
                  {r.motivo && <span className="ml-1.5 text-foreground/70">· {r.motivo}</span>}
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* Form (no rebrand profundo — Ola 2B) */}
        <CotizacionForm
          initial={cotizacion}
          readOnly={!editable}
          onCancel={() => router.push("/cotizaciones")}
          onSubmit={async (payload) => {
            try {
              const res = await updateCotizacion(cotizacion.id, payload);
              toast.success(`Cotización ${res.data.codigo} actualizada`);
              setCotizacion(res.data);
            } catch (err) {
              const msg = err instanceof ApiError
                ? typeof err.body === "object" && err.body !== null && "error" in err.body
                  ? String((err.body as { error: string }).error)
                  : `Error ${err.status}`
                : "Error inesperado";
              toast.error(msg);
              throw err;
            }
          }}
        />
      </div>

      {/* Dialogo de confirmacion para margen forzado */}
      {showMargenDialog && margenDialogInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-glass bg-[#1a1d23] p-6 shadow-2xl inset-highlight">
            <h3 className="mb-2 font-display text-base font-semibold text-rose-300">
              Margen por debajo del minimo
            </h3>
            <p className="mb-5 text-sm text-foreground/80">
              El margen actual{" "}
              <span className="font-semibold text-foreground">({margenDialogInfo.margen_actual}%)</span>{" "}
              esta por debajo del minimo para{" "}
              <span className="font-semibold text-foreground capitalize">{margenDialogInfo.tipo_servicio}</span>{" "}
              ({margenDialogInfo.margen_minimo}%). Se registrara una nota automatica en la cotizacion.
              <br /><br />
              ¿Confirmar emision de todas formas?
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setShowMargenDialog(false); setMargenDialogInfo(null); }}
                className={actionClass("ghost")}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleTransicion("enviar", true)}
                className={actionClass("destructive")}
              >
                Emitir de todas formas
              </button>
            </div>
          </div>
        </div>
      )}

      <Toaster richColors position="top-right" theme="dark" />
    </div>
  );
}
