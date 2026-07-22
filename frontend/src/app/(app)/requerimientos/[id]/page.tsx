"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft, ArrowRight, UserPlus, Flag, CalendarClock, HelpCircle, Ban, ClipboardList,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Toaster, toast } from "sonner";
import { PageHeader, HeaderActionGhost } from "@/components/page-header";
import { Panel } from "@/components/panel";
import {
  Requerimiento, EstadoReq, PrioridadReq,
  estadoReqVariant, prioridadReqVariant, estadoReqLabel, tipoReqLabel, prioridadLabel,
  solicitanteNombre, responsableNombre,
  obtener, cambiarEstado, cambiarPrioridad, asignar, estimar, solicitarInfo, cancelar,
  PRIORIDADES,
} from "@/lib/requerimientos";
import { getCurrentUser, hasPermission, AuthUser } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { ComentariosPanel } from "./comentarios-panel";
import { AdjuntosPanel } from "./adjuntos-panel";
import { HistorialPanel } from "./historial-panel";

interface PageProps { params: Promise<{ id: string }> }

// Máquina de estados — espejo de backend/src/routes/requerimientos.ts
const TRANSICIONES: Record<EstadoReq, EstadoReq[]> = {
  registrado: ["en_revision", "rechazado", "cancelado"],
  en_revision: ["pendiente_informacion", "aprobado", "rechazado", "cancelado"],
  pendiente_informacion: ["en_revision", "cancelado"],
  aprobado: ["en_planificacion", "cancelado"],
  en_planificacion: ["en_desarrollo", "cancelado"],
  en_desarrollo: ["en_pruebas", "pendiente_informacion", "cancelado"],
  en_pruebas: ["listo_produccion", "en_desarrollo", "cancelado"],
  listo_produccion: ["completado", "cancelado"],
  completado: [],
  rechazado: [],
  cancelado: [],
};

const ESTADOS_EDITABLES_DUENO: EstadoReq[] = ["registrado", "en_revision", "pendiente_informacion"];

function actionClass(tone: "primary" | "ghost" | "destructive") {
  return tone === "primary"
    ? "inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-3 py-1.5 text-xs font-medium text-white shadow-sm glow-copper-sm inset-highlight-md transition hover:glow-copper disabled:opacity-50 disabled:pointer-events-none"
    : tone === "destructive"
    ? "inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/15 disabled:opacity-50 disabled:pointer-events-none"
    : "inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-3 py-1.5 text-xs font-medium text-foreground/90 transition hover:border-glass-strong hover:bg-glass-elev disabled:opacity-50 disabled:pointer-events-none";
}

function fechaLarga(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-EC", { timeZone: "America/Guayaquil" });
}

function fechaCorta(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" });
}

export default function RequerimientoDetallePage({ params }: PageProps) {
  const [id, setId] = useState<string | null>(null);
  const [req, setReq] = useState<Requerimiento | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  useEffect(() => { params.then(({ id }) => setId(id)); }, [params]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await obtener(id);
      setReq(res.data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setError("Requerimiento no encontrado");
      else setError(err instanceof Error ? err.message : "Error cargando");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);
  useEffect(() => { getCurrentUser().then(setUser).catch(() => setUser(null)); }, []);

  function errMsg(err: unknown): string {
    if (err instanceof ApiError) {
      const code = String((err.body as { error?: string })?.error ?? err.status);
      const map: Record<string, string> = {
        transicion_invalida: "Transición no permitida",
        requiere_responsable: "Asigná un responsable antes de completar",
        sin_permiso: "No tenés permiso",
        usuario_invalido: "Usuario inválido",
        not_found: "No encontrado",
      };
      return map[code] ?? code;
    }
    return "Error";
  }

  async function act(label: string, fn: () => Promise<unknown>) {
    if (!window.confirm(`${label}?`)) return;
    setWorking(label);
    try { await fn(); toast.success(label); load(); }
    catch (err) { toast.error(errMsg(err)); }
    finally { setWorking(null); }
  }

  async function handleAsignar() {
    if (!req) return;
    const uuid = window.prompt("UUID del usuario responsable:");
    if (!uuid || uuid.trim().length < 8) return;
    setWorking("asignar");
    try { await asignar(req.id, uuid.trim()); toast.success("Responsable asignado"); load(); }
    catch (err) { toast.error(errMsg(err)); }
    finally { setWorking(null); }
  }

  async function handlePrioridad() {
    if (!req) return;
    const val = window.prompt(`Prioridad definitiva (${PRIORIDADES.map((p) => p.value).join(" / ")}):`, req.prioridad ?? req.prioridad_sugerida);
    if (!val) return;
    const p = val.trim().toLowerCase() as PrioridadReq;
    if (!PRIORIDADES.some((x) => x.value === p)) { toast.error("Prioridad inválida"); return; }
    setWorking("prioridad");
    try { await cambiarPrioridad(req.id, p); toast.success("Prioridad actualizada"); load(); }
    catch (err) { toast.error(errMsg(err)); }
    finally { setWorking(null); }
  }

  async function handleEstimar() {
    if (!req) return;
    const val = window.prompt("Fecha estimada de entrega (AAAA-MM-DD):", req.fecha_estimada_entrega?.split("T")[0] ?? "");
    if (!val || !/^\d{4}-\d{2}-\d{2}$/.test(val.trim())) { if (val) toast.error("Formato de fecha inválido"); return; }
    setWorking("estimar");
    try { await estimar(req.id, val.trim()); toast.success("Estimación registrada"); load(); }
    catch (err) { toast.error(errMsg(err)); }
    finally { setWorking(null); }
  }

  async function handleSolicitarInfo() {
    if (!req) return;
    const msg = window.prompt("¿Qué información necesitás del solicitante?");
    if (!msg || msg.trim().length < 3) return;
    setWorking("solicitar-info");
    try { await solicitarInfo(req.id, msg.trim()); toast.success("Información solicitada"); load(); }
    catch (err) { toast.error(errMsg(err)); }
    finally { setWorking(null); }
  }

  if (loading && !req) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-copper border-t-transparent" />
          <span className="text-sm">Cargando requerimiento…</span>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div>
        <PageHeader breadcrumb={[{ href: "/dashboard", label: "Panel" }, { href: "/requerimientos", label: "Requerimientos" }, { label: "Error" }]} title="Requerimiento" titleAccent="no encontrado" />
        <div className="pt-6">
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-200 inset-highlight"><p className="text-sm">{error}</p></div>
        </div>
      </div>
    );
  }
  if (!req) return null;

  const gestiona = hasPermission(user, "desarrollo", "gestionar");
  const esDueno = user?.id === req.solicitante_id;
  const prioridadActual = req.prioridad ?? req.prioridad_sugerida;
  const transiciones = TRANSICIONES[req.estado] ?? [];
  const puedeCancelarDueno = esDueno && ESTADOS_EDITABLES_DUENO.includes(req.estado);
  const hayAcciones = gestiona || puedeCancelarDueno;

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { href: "/requerimientos", label: "Requerimientos" }, { label: req.codigo }]}
        title={req.codigo}
        titleAccent={req.titulo}
        meta={
          <>
            <Badge variant={estadoReqVariant(req.estado)}>{estadoReqLabel(req.estado)}</Badge>
            <Badge variant={prioridadReqVariant(prioridadActual)}>{prioridadLabel(prioridadActual)}</Badge>
            <span className="text-muted-foreground/40">·</span>
            <span>{tipoReqLabel(req.tipo)}</span>
            {req.modulo_relacionado && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span>{req.modulo_relacionado}</span>
              </>
            )}
          </>
        }
        actions={<HeaderActionGhost href="/requerimientos" icon={<ChevronLeft className="h-3.5 w-3.5" />}>Volver</HeaderActionGhost>}
      />

      <div className="space-y-6 pt-6">
        {/* Acciones */}
        {hayAcciones && (
          <Panel title="Acciones disponibles" subtitle="Triage, transiciones y gestión" icon={<ClipboardList className="h-3.5 w-3.5" />}>
            <div className="flex flex-wrap items-center gap-2">
              {gestiona && transiciones.filter((t) => t !== "cancelado").map((estado) => (
                <button
                  key={estado}
                  type="button"
                  onClick={() => act(`Pasar a "${estadoReqLabel(estado)}"`, () => cambiarEstado(req.id, estado))}
                  disabled={working !== null}
                  className={actionClass(estado === "rechazado" ? "destructive" : "primary")}
                >
                  <ArrowRight className="h-3.5 w-3.5" /> {estadoReqLabel(estado)}
                </button>
              ))}
              {gestiona && (
                <>
                  <button type="button" onClick={handleAsignar} disabled={working !== null} className={actionClass("ghost")}>
                    <UserPlus className="h-3.5 w-3.5" /> Asignar responsable
                  </button>
                  <button type="button" onClick={handlePrioridad} disabled={working !== null} className={actionClass("ghost")}>
                    <Flag className="h-3.5 w-3.5" /> Prioridad definitiva
                  </button>
                  <button type="button" onClick={handleEstimar} disabled={working !== null} className={actionClass("ghost")}>
                    <CalendarClock className="h-3.5 w-3.5" /> Estimar entrega
                  </button>
                  <button type="button" onClick={handleSolicitarInfo} disabled={working !== null} className={actionClass("ghost")}>
                    <HelpCircle className="h-3.5 w-3.5" /> Solicitar info
                  </button>
                </>
              )}
              {(gestiona && transiciones.includes("cancelado")) || puedeCancelarDueno ? (
                <button
                  type="button"
                  onClick={() => act("Cancelar requerimiento", () => cancelar(req.id))}
                  disabled={working !== null}
                  className={actionClass("destructive")}
                >
                  <Ban className="h-3.5 w-3.5" /> Cancelar requerimiento
                </button>
              ) : null}
              {transiciones.length === 0 && !puedeCancelarDueno && !gestiona && (
                <span className="font-mono text-[11px] text-muted-foreground">Sin acciones disponibles</span>
              )}
            </div>
          </Panel>
        )}

        {/* Datos principales */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Panel title="Solicitante">
            <p className="text-sm font-medium text-foreground/90">{solicitanteNombre(req)}</p>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Quien lo pidió</p>
          </Panel>
          <Panel title="Responsable">
            <p className="text-sm font-medium text-foreground/90">{responsableNombre(req)}</p>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Asignado al desarrollo</p>
          </Panel>
          <Panel title="Prioridad">
            <div className="flex items-center gap-2">
              <Badge variant={prioridadReqVariant(prioridadActual)}>{prioridadLabel(prioridadActual)}</Badge>
              {req.prioridad && req.prioridad !== req.prioridad_sugerida && (
                <span className="font-mono text-[10px] text-muted-foreground">sugerida: {prioridadLabel(req.prioridad_sugerida)}</span>
              )}
            </div>
            <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {req.prioridad ? "Definitiva" : "Sugerida (sin triage)"}
            </p>
          </Panel>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Panel title="Fechas">
            <dl className="space-y-1.5 font-mono text-xs">
              <KVLine label="Creado" value={fechaLarga(req.created_at)} />
              <KVLine label="Requerida" value={fechaCorta(req.fecha_requerida)} />
              <KVLine label="Estimada" value={fechaCorta(req.fecha_estimada_entrega)} />
            </dl>
          </Panel>
          <Panel title="Tipo" className="md:col-span-2">
            <p className="text-sm text-foreground/85">{tipoReqLabel(req.tipo)}</p>
            {req.modulo_relacionado && (
              <p className="mt-1 text-sm text-muted-foreground">Módulo: {req.modulo_relacionado}</p>
            )}
          </Panel>
        </section>

        <Panel title="Descripción">
          <p className="whitespace-pre-wrap text-sm text-foreground/85">{req.descripcion}</p>
        </Panel>

        {req.problema && (
          <Panel title="Problema o situación actual">
            <p className="whitespace-pre-wrap text-sm text-foreground/85">{req.problema}</p>
          </Panel>
        )}

        {req.resultado_esperado && (
          <Panel title="Resultado esperado">
            <p className="whitespace-pre-wrap text-sm text-foreground/85">{req.resultado_esperado}</p>
          </Panel>
        )}

        {/* Sub-paneles */}
        <ComentariosPanel id={req.id} puedeComentar={gestiona || esDueno} />
        <AdjuntosPanel id={req.id} puedeSubir={gestiona || esDueno} />
        <HistorialPanel id={req.id} />
      </div>

      <Toaster richColors position="top-right" theme="dark" />
    </div>
  );
}

function KVLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums text-foreground/90">{value}</dd>
    </div>
  );
}
