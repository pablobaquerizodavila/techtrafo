"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, Send, CheckCircle2, XCircle, Ban, FileText, Clock,
  ShieldCheck, AlertCircle, ArrowUpToLine, History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Toaster, toast } from "sonner";
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
  transicionesPosibles,
  updateCotizacion,
} from "@/lib/cotizaciones";
import { AuthUser, getCurrentUser } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { CotizacionForm } from "../cotizacion-form";
import { PdfButton } from "../../pdf-button";

interface PageProps {
  params: Promise<{ id: string }>;
}

const ROLES_OVERRIDE = ["presidencia", "gerencia_general", "gerencia_comercial"];

const accionConfig: Record<TransicionAccion, { label: string; icon: typeof Send; variant: "default" | "outline" | "destructive" }> = {
  enviar: { label: "Enviar al cliente", icon: Send, variant: "default" },
  aprobar: { label: "Marcar como aprobada", icon: CheckCircle2, variant: "default" },
  rechazar: { label: "Marcar como rechazada", icon: XCircle, variant: "destructive" },
  cancelar: { label: "Cancelar", icon: Ban, variant: "destructive" },
  vencer: { label: "Marcar como vencida", icon: Clock, variant: "outline" },
  convertir: { label: "Convertir a contrato", icon: FileText, variant: "default" },
};

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

  useEffect(() => {
    params.then(({ id }) => setId(Number(id)));
  }, [params]);

  useEffect(() => {
    getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null));
  }, []);

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
      if (err instanceof ApiError && err.status === 404) {
        setError("Cotizacion no encontrada");
      } else {
        setError(err instanceof Error ? err.message : "Error cargando");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) load();
  }, [id, load]);

  async function handleTransicion(accion: TransicionAccion) {
    if (!cotizacion) return;
    if (accion === "convertir") {
      router.push(`/contratos/nuevo?cotizacion=${cotizacion.id}`);
      return;
    }
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
    if (!window.confirm(`Confirmar: ${accionConfig[accion].label}?`)) return;
    try {
      await transicionCotizacion(cotizacion.id, accion);
      toast.success(`Estado actualizado`);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error");
    }
  }

  async function handleSolicitar() {
    if (!cotizacion) return;
    if (!window.confirm("Solicitar revisión interna de esta cotización? Se enviará al rol de Gerencia Comercial para aprobación.")) return;
    setWorking(true);
    try {
      await solicitarRevisionInterna(cotizacion.id);
      toast.success("Revisión interna solicitada");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error");
    } finally { setWorking(false); }
  }
  async function handleAprobarRev() {
    if (!cotizacion) return;
    const notas = window.prompt("Notas opcionales para la aprobación:") ?? undefined;
    setWorking(true);
    try {
      await aprobarRevisionInterna(cotizacion.id, notas || undefined);
      toast.success("Aprobación interna registrada — la cotización ya puede enviarse al cliente");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error");
    } finally { setWorking(false); }
  }
  async function handleRechazarRev() {
    if (!cotizacion) return;
    const motivo = window.prompt("Motivo del rechazo interno (obligatorio):");
    if (!motivo || motivo.trim() === "") return;
    setWorking(true);
    try {
      await rechazarRevisionInterna(cotizacion.id, motivo.trim());
      toast.success("Cotización rechazada internamente — el creador puede corregir y re-solicitar");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error");
    } finally { setWorking(false); }
  }
  async function handleEscalarRev() {
    if (!cotizacion) return;
    const nivelActual = cotizacion.revision_interna_nivel ?? 1;
    if (nivelActual >= 3) {
      toast.error("Ya está en el nivel máximo (presidencia)");
      return;
    }
    const siguiente = rolDeNivelRevision(nivelActual + 1);
    const mensaje = window.prompt(`Mensaje para ${siguiente} (obligatorio):`);
    if (!mensaje || mensaje.trim() === "") return;
    setWorking(true);
    try {
      const res = await escalarRevisionInterna(cotizacion.id, mensaje.trim());
      toast.success(`Escalada a ${res.rol_destino}`);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error");
    } finally { setWorking(false); }
  }

  if (loading && !cotizacion) {
    return <div className="text-muted-foreground">Cargando cotizacion...</div>;
  }
  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/cotizaciones"><ChevronLeft className="mr-1 h-4 w-4" /> Volver</Link>
        </Button>
        <p className="text-destructive">{error}</p>
      </div>
    );
  }
  if (!cotizacion) return null;

  const editable = cotizacion.estado !== "convertida" && cotizacion.estado !== "cancelada" && cotizacion.estado !== "rechazada";
  const transiciones = transicionesPosibles(cotizacion.estado);

  // -------- Gating de la revision interna --------
  const rev = cotizacion.revision_interna_estado;
  const nivelActual = cotizacion.revision_interna_nivel ?? 1;
  const rolEsperado = rolDeNivelRevision(nivelActual);
  const userRol = currentUser?.rol_nombre ?? "";
  const esOverride = !!currentUser?.es_super_admin || ROLES_OVERRIDE.includes(userRol);
  const userEsResponsableNivel = userRol === rolEsperado || esOverride;
  // Solo el creador (o override) puede solicitar revision
  const esCreadorOAdmin = currentUser?.id === cotizacion.vendedor_id || esOverride;
  const puedeSolicitar = (rev === "no_solicitada" || rev === "rechazada") && cotizacion.estado === "borrador" && esCreadorOAdmin;
  const puedeActuar = rev === "pendiente" && userEsResponsableNivel;
  const puedeEscalar = puedeActuar && nivelActual < 3;
  // Bloquear el boton 'Enviar al cliente' si revision interna no esta aprobada
  const transicionesFiltradas = transiciones.filter((a) => !(a === "enviar" && rev !== "aprobada"));

  return (
    <div className="space-y-6">
      <header>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link href="/cotizaciones">
            <ChevronLeft className="mr-1 h-4 w-4" /> Volver a cotizaciones
          </Link>
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold">{cotizacion.codigo}</h2>
            <p className="text-muted-foreground">
              {cotizacion.clientes?.razon_social} ({cotizacion.clientes?.ruc_cedula})
              {" · "}revision {cotizacion.revision_actual}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={estadoVariant(cotizacion.estado)} className="text-base">
              {cotizacion.estado.toUpperCase()}
            </Badge>
            <PdfButton recurso="cotizacion" id={cotizacion.id} />
          </div>
        </div>
      </header>

      {/* Panel de revision interna */}
      <section className={
        rev === "aprobada" ? "rounded-md border border-green-300 bg-green-50 p-4"
        : rev === "pendiente" ? "rounded-md border border-blue-300 bg-blue-50 p-4"
        : rev === "rechazada" ? "rounded-md border border-destructive bg-destructive/5 p-4"
        : "rounded-md border bg-muted/20 p-4"
      }>
        <div className="mb-2 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          <h3 className="text-sm font-semibold">Revisión interna</h3>
          <Badge variant={
            rev === "aprobada" ? "success"
            : rev === "pendiente" ? "default"
            : rev === "rechazada" ? "destructive"
            : "muted"
          }>
            {rev === "no_solicitada" ? "no solicitada" : rev}
          </Badge>
          {rev === "pendiente" && (
            <span className="text-xs text-muted-foreground">
              · Esperando aprobación de <strong>{nivelRevisionLabel(nivelActual)}</strong>
            </span>
          )}
        </div>

        {rev === "no_solicitada" && cotizacion.estado === "borrador" && (
          <p className="text-sm text-muted-foreground">
            Antes de poder enviar al cliente, esta cotización debe ser aprobada internamente: primero por Gerencia Comercial, con escalamientos a Gerencia General y Presidencia si es necesario.
          </p>
        )}
        {rev === "rechazada" && (
          <div className="text-sm">
            <p className="font-medium text-destructive">Motivo:</p>
            <p className="whitespace-pre-wrap">{cotizacion.revision_interna_motivo_rechazo ?? "—"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Corrige las líneas o condiciones y vuelve a solicitar la revisión.
            </p>
          </div>
        )}
        {rev === "aprobada" && (
          <p className="text-sm text-muted-foreground">
            Aprobada internamente el {cotizacion.revision_interna_resuelta_at ? new Date(cotizacion.revision_interna_resuelta_at).toLocaleString("es-EC") : "—"}.
            Ya puedes enviarla al cliente desde el bloque de acciones.
          </p>
        )}

        {/* Botones de accion */}
        <div className="mt-3 flex flex-wrap gap-2">
          {puedeSolicitar && (
            <Button size="sm" onClick={handleSolicitar} disabled={working}>
              <Send className="mr-1 h-3.5 w-3.5" /> Solicitar revisión interna
            </Button>
          )}
          {puedeActuar && (
            <>
              <Button size="sm" onClick={handleAprobarRev} disabled={working}>
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Aprobar internamente
              </Button>
              <Button size="sm" variant="destructive" onClick={handleRechazarRev} disabled={working}>
                <XCircle className="mr-1 h-3.5 w-3.5" /> Rechazar
              </Button>
              {puedeEscalar && (
                <Button size="sm" variant="outline" onClick={handleEscalarRev} disabled={working}>
                  <ArrowUpToLine className="mr-1 h-3.5 w-3.5" />
                  Escalar a {nivelRevisionLabel(nivelActual + 1)}
                </Button>
              )}
            </>
          )}
          {rev === "pendiente" && !puedeActuar && (
            <p className="text-xs text-muted-foreground">
              <AlertCircle className="mr-1 inline h-3 w-3" />
              Solo {nivelRevisionLabel(nivelActual)} (o presidencia/gerencia general/gerencia comercial como override) puede aprobar/rechazar/escalar.
            </p>
          )}
          {historial.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setMostrarHistorial((v) => !v)}>
              <History className="mr-1 h-3.5 w-3.5" />
              {mostrarHistorial ? "Ocultar historial" : `Ver historial (${historial.length})`}
            </Button>
          )}
        </div>

        {/* Historial */}
        {mostrarHistorial && historial.length > 0 && (
          <div className="mt-3 space-y-1 rounded border bg-background p-2 text-xs">
            {historial.map((h) => (
              <div key={h.id} className="flex items-start justify-between gap-2 border-b pb-1 last:border-0 last:pb-0">
                <div>
                  <span className="font-mono">{new Date(h.created_at).toLocaleString("es-EC")}</span>
                  {" · "}
                  <strong>{h.accion}</strong>
                  {" · "}
                  <span>{nivelRevisionLabel(h.nivel)}</span>
                  {" · "}
                  <span className="text-muted-foreground">
                    {h.nombres ? `${h.nombres} ${h.apellidos ?? ""}` : "—"}
                    {h.rol_actuante && ` (${h.rol_actuante})`}
                  </span>
                </div>
                {h.notas && <span className="max-w-md text-muted-foreground italic">"{h.notas}"</span>}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Botones de transicion */}
      {transicionesFiltradas.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 p-3">
          <span className="text-sm font-medium">Acciones:</span>
          {transicionesFiltradas.map((accion) => {
            const cfg = accionConfig[accion];
            const Icon = cfg.icon;
            return (
              <Button
                key={accion}
                variant={cfg.variant}
                size="sm"
                onClick={() => handleTransicion(accion)}
              >
                <Icon className="mr-2 h-4 w-4" /> {cfg.label}
              </Button>
            );
          })}
          {/* Hint si 'enviar' fue ocultado por falta de revision interna */}
          {transiciones.includes("enviar") && rev !== "aprobada" && (
            <span className="text-xs text-muted-foreground">
              <AlertCircle className="mr-1 inline h-3 w-3" />
              "Enviar al cliente" requiere aprobación interna primero.
            </span>
          )}
        </div>
      )}

      {/* Revisiones (snapshots de cambios) */}
      {cotizacion.cotizacion_revisiones && cotizacion.cotizacion_revisiones.length > 0 && (
        <details className="rounded-md border p-3 text-sm">
          <summary className="cursor-pointer font-medium">
            {cotizacion.cotizacion_revisiones.length} revision{cotizacion.cotizacion_revisiones.length === 1 ? "" : "es"} previas
          </summary>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {cotizacion.cotizacion_revisiones.map((r) => (
              <li key={r.id}>
                <span className="font-mono">rev {r.revision}</span>
                {" · "}
                {new Date(r.created_at).toLocaleString("es-EC")}
                {r.motivo && ` · ${r.motivo}`}
              </li>
            ))}
          </ul>
        </details>
      )}

      <CotizacionForm
        initial={cotizacion}
        readOnly={!editable}
        onCancel={() => router.push("/cotizaciones")}
        onSubmit={async (payload) => {
          try {
            const res = await updateCotizacion(cotizacion.id, payload);
            toast.success(`Cotizacion ${res.data.codigo} actualizada`);
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

      <Toaster richColors position="top-right" />
    </div>
  );
}
