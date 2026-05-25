"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  ClipboardCheck,
  ExternalLink,
  User,
  Mail,
  Phone,
  Clock,
  RotateCcw,
  Undo2,
  ArrowUpToLine,
  Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Cronometro, TiempoTotal } from "@/components/cronometro";
import { VisitaTecnicaForm } from "@/components/visita-tecnica-form";
import { InformeTecnicoDialog } from "@/components/informe-tecnico-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Toaster, toast } from "sonner";
import { PdfButton } from "../../pdf-button";
import {
  Expediente,
  ExpedienteHito,
  aprobarHito,
  canalOrigenLabel,
  cancelarExpediente,
  escalarHito,
  esOverrideExpediente,
  estadoExpedienteVariant,
  estadoHitoIcon,
  estadoHitoVariant,
  getExpediente,
  iniciarHito,
  puedeActuarEnHito,
  reabrirHitoAnterior,
  reactivarExpediente,
  rechazarHito,
  reintentarHito,
  updateHitoSla,
} from "@/lib/expedientes";
import { AuthUser, getCurrentUser, hasPermission } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { RolAdmin, listRolesAdmin } from "@/lib/admin";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ExpedienteDetallePage({ params }: PageProps) {
  const router = useRouter();
  const [id, setId] = useState<number | null>(null);
  const [expediente, setExpediente] = useState<Expediente | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<number | null>(null);
  const [slaDialog, setSlaDialog] = useState<{ hito: ExpedienteHito } | null>(null);
  const [slaInput, setSlaInput] = useState("");
  const [savingSla, setSavingSla] = useState(false);
  const [visitaFormOpen, setVisitaFormOpen] = useState(false);
  const [informeDialogId, setInformeDialogId] = useState<number | null>(null);
  const [rechazoDialog, setRechazoDialog] = useState<
    | { kind: "closed" }
    | { kind: "reabrir-anterior"; hito: ExpedienteHito; hitoAnteriorId: number | null }
    | { kind: "escalar"; hito: ExpedienteHito; mensaje: string; rolDestinoId: number | null }
    | { kind: "cancelar"; motivo: string }
  >({ kind: "closed" });
  const [savingRechazoAccion, setSavingRechazoAccion] = useState(false);
  const [rolesGerencia, setRolesGerencia] = useState<RolAdmin[]>([]);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [reactivando, setReactivando] = useState(false);

  useEffect(() => {
    getCurrentUser().then(setCurrentUser).catch(() => setCurrentUser(null));
  }, []);

  useEffect(() => {
    listRolesAdmin()
      .then((r) => {
        const gerencias = r.data.filter((x) => x.activo && x.nombre.startsWith("gerencia"));
        setRolesGerencia(gerencias);
      })
      .catch(() => setRolesGerencia([]));
  }, []);

  useEffect(() => {
    params.then(({ id }) => setId(Number(id)));
  }, [params]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getExpediente(id);
      setExpediente(res.data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError("Expediente no encontrado");
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

  async function handleIniciar(hito: ExpedienteHito) {
    if (!expediente) return;
    if (!window.confirm(`Iniciar el hito "${hito.nombre}"?`)) return;
    setWorking(hito.id);
    try {
      await iniciarHito(expediente.id, hito.id);
      toast.success("Hito iniciado");
      load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error",
      );
    } finally {
      setWorking(null);
    }
  }

  async function handleAprobar(hito: ExpedienteHito) {
    if (!expediente) return;
    const notas = window.prompt("Notas de aprobacion (opcional):") ?? "";
    if (!window.confirm(`Aprobar el hito "${hito.nombre}"? Se activara el siguiente paso automaticamente.`)) return;
    setWorking(hito.id);
    try {
      await aprobarHito(expediente.id, hito.id, notas || undefined);
      toast.success("Hito aprobado");
      load();
    } catch (err) {
      const code = err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "error";
      const msg =
        code === "rol_aprobador_incorrecto"
          ? "No tienes el rol requerido para aprobar este hito"
          : code === "ya_completado"
            ? "El hito ya esta completado"
            : code;
      toast.error(msg);
    } finally {
      setWorking(null);
    }
  }

  function openSlaDialog(hito: ExpedienteHito) {
    setSlaDialog({ hito });
    setSlaInput(hito.sla_horas?.toString() ?? "");
  }

  async function handleSlaSubmit() {
    if (!slaDialog || !expediente) return;
    const h = slaDialog.hito;
    const parsed = slaInput.trim() === "" ? null : Number(slaInput);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed <= 0 || parsed > 8760)) {
      toast.error("SLA invalido: entero positivo (1-8760) o vacio");
      return;
    }
    if (parsed === h.sla_horas) {
      setSlaDialog(null);
      return;
    }
    setSavingSla(true);
    try {
      await updateHitoSla(expediente.id, h.id, parsed);
      toast.success(`SLA del hito "${h.nombre}" actualizado`);
      setSlaDialog(null);
      load();
    } catch (err) {
      const code = err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error";
      toast.error(code);
    } finally {
      setSavingSla(false);
    }
  }

  async function handleReintentarHito(hito: ExpedienteHito) {
    if (!expediente) return;
    if (!window.confirm(`Reintentar el hito "${hito.nombre}"? Volvera a estado no iniciado y se borrara el motivo del rechazo.`)) return;
    setSavingRechazoAccion(true);
    try {
      await reintentarHito(expediente.id, hito.id);
      toast.success("Hito reabierto. Podes iniciarlo de nuevo.");
      load();
    } catch (err) {
      const code = err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error";
      toast.error(code);
    } finally {
      setSavingRechazoAccion(false);
    }
  }

  async function handleReabrirAnteriorSubmit() {
    if (!expediente || rechazoDialog.kind !== "reabrir-anterior") return;
    if (!rechazoDialog.hitoAnteriorId) {
      toast.error("Seleccioná el hito anterior a reabrir");
      return;
    }
    setSavingRechazoAccion(true);
    try {
      await reabrirHitoAnterior(expediente.id, rechazoDialog.hito.id, rechazoDialog.hitoAnteriorId);
      toast.success("Hitos reabiertos");
      setRechazoDialog({ kind: "closed" });
      load();
    } catch (err) {
      const code = err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error";
      toast.error(code);
    } finally {
      setSavingRechazoAccion(false);
    }
  }

  async function handleEscalarSubmit() {
    if (!expediente || rechazoDialog.kind !== "escalar") return;
    if (!rechazoDialog.mensaje.trim()) {
      toast.error("Escribí un mensaje para la escalación");
      return;
    }
    if (!rechazoDialog.rolDestinoId) {
      toast.error("Seleccioná a qué rol escalar");
      return;
    }
    setSavingRechazoAccion(true);
    try {
      await escalarHito(
        expediente.id,
        rechazoDialog.hito.id,
        rechazoDialog.mensaje.trim(),
        rechazoDialog.rolDestinoId,
      );
      toast.success("Hito escalado · email encolado a los destinatarios");
      setRechazoDialog({ kind: "closed" });
      load();
    } catch (err) {
      const code = err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error";
      toast.error(code);
    } finally {
      setSavingRechazoAccion(false);
    }
  }

  async function handleReactivarExpediente() {
    if (!expediente) return;
    if (!window.confirm(`Reactivar el expediente ${expediente.codigo}? Vuelve a estado activo y se borra el motivo de cierre.`)) return;
    setReactivando(true);
    try {
      await reactivarExpediente(expediente.id);
      toast.success(`Expediente ${expediente.codigo} reactivado`);
      load();
    } catch (err) {
      const code = err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error";
      toast.error(code);
    } finally {
      setReactivando(false);
    }
  }

  async function handleCancelarExpedienteSubmit() {
    if (!expediente || rechazoDialog.kind !== "cancelar") return;
    if (!rechazoDialog.motivo.trim()) {
      toast.error("Escribí el motivo del cierre");
      return;
    }
    setSavingRechazoAccion(true);
    try {
      await cancelarExpediente(expediente.id, rechazoDialog.motivo.trim());
      toast.success("Expediente cerrado");
      setRechazoDialog({ kind: "closed" });
      load();
    } catch (err) {
      const code = err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error";
      toast.error(code);
    } finally {
      setSavingRechazoAccion(false);
    }
  }

  async function handleRechazar(hito: ExpedienteHito) {
    if (!expediente) return;
    const motivo = window.prompt(`Motivo de rechazo del hito "${hito.nombre}":`);
    if (!motivo || !motivo.trim()) return;
    setWorking(hito.id);
    try {
      await rechazarHito(expediente.id, hito.id, motivo.trim());
      toast.success("Hito rechazado");
      load();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error",
      );
    } finally {
      setWorking(null);
    }
  }

  if (loading && !expediente) {
    return <div className="text-muted-foreground">Cargando expediente...</div>;
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/expedientes">
            <ChevronLeft className="mr-1 h-4 w-4" /> Volver
          </Link>
        </Button>
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (!expediente) return null;

  const hitos = expediente.expediente_hitos ?? [];
  const visitas = expediente.visitas_tecnicas ?? [];
  const informes = expediente.informes_tecnicos ?? [];
  const algunoEstancado = hitos.some((h) => h.estancado);

  return (
    <div className="space-y-6">
      <header>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link href="/expedientes">
            <ChevronLeft className="mr-1 h-4 w-4" /> Volver a expedientes
          </Link>
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold">{expediente.codigo}</h2>
            <p className="text-muted-foreground">
              {expediente.clientes?.razon_social} ({expediente.clientes?.ruc_cedula}) ·{" "}
              {canalOrigenLabel(expediente.canal_origen)} ·{" "}
              <span className="capitalize">
                {expediente.tipo_servicio_confirmado ?? expediente.tipo_servicio_estimado}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {algunoEstancado && (
              <Badge variant="destructive" className="text-sm">
                <AlertTriangle className="mr-1 h-4 w-4" /> Hito estancado
              </Badge>
            )}
            <Badge variant={estadoExpedienteVariant(expediente.estado)} className="text-base">
              {expediente.estado.toUpperCase()}
            </Badge>
            {["cancelado", "ganado", "perdido"].includes(expediente.estado)
              && hasPermission(currentUser, "expedientes", "reactivar") && (
              <Button size="sm" variant="outline" onClick={handleReactivarExpediente} disabled={reactivando}>
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                {reactivando ? "Reactivando..." : "Reactivar"}
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Info cliente + ejecutivo */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-md border p-4 text-sm">
          <h3 className="mb-2 font-semibold">Cliente</h3>
          <div className="space-y-1 text-muted-foreground">
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5" />
              <span>{expediente.clientes?.razon_social}</span>
            </div>
            {expediente.clientes?.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5" />
                <span>{expediente.clientes.email}</span>
              </div>
            )}
            {expediente.clientes?.telefono && (
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5" />
                <span>{expediente.clientes.telefono}</span>
              </div>
            )}
          </div>
        </div>
        <div className="rounded-md border p-4 text-sm">
          <h3 className="mb-2 font-semibold">Ejecutivo asignado</h3>
          {expediente.usuarios_expedientes_ejecutivo_idTousuarios ? (
            <div className="text-muted-foreground">
              <p>
                {expediente.usuarios_expedientes_ejecutivo_idTousuarios.nombres}{" "}
                {expediente.usuarios_expedientes_ejecutivo_idTousuarios.apellidos}
              </p>
              {expediente.usuarios_expedientes_ejecutivo_idTousuarios.email && (
                <p className="text-xs">{expediente.usuarios_expedientes_ejecutivo_idTousuarios.email}</p>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">Sin asignar</p>
          )}
        </div>
        <div className="rounded-md border p-4 text-sm">
          <h3 className="mb-2 font-semibold">Fechas</h3>
          <div className="space-y-1 text-muted-foreground">
            <p>Apertura: {expediente.fecha_apertura.split("T")[0]}</p>
            {expediente.fecha_cierre && <p>Cierre: {expediente.fecha_cierre.split("T")[0]}</p>}
          </div>
        </div>
      </div>

      {expediente.descripcion_problema && (
        <div className="rounded-md border bg-muted/20 p-4 text-sm">
          <h3 className="mb-1 font-semibold">Descripcion del problema</h3>
          <p className="whitespace-pre-wrap text-muted-foreground">{expediente.descripcion_problema}</p>
        </div>
      )}

      {/* Documentos relacionados */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <DocCard
          label="Cotizacion"
          href={expediente.cotizaciones ? `/cotizaciones/${expediente.cotizaciones.id}` : null}
          codigo={expediente.cotizaciones?.codigo}
          estado={expediente.cotizaciones?.estado}
        />
        <DocCard
          label="Contrato"
          href={expediente.contratos ? `/contratos/${expediente.contratos.id}` : null}
          codigo={expediente.contratos?.codigo}
          estado={expediente.contratos?.estado}
        />
        <DocCard
          label="Orden de Trabajo"
          href={null /* TODO: ruta OT cuando exista */}
          codigo={expediente.ot?.codigo}
          estado={expediente.ot?.estado}
        />
        <DocCard
          label="Garantia"
          href={null /* TODO: ruta garantias cuando exista */}
          codigo={expediente.garantias?.codigo}
          estado={expediente.garantias?.estado}
        />
      </div>

      {/* Pipeline de hitos */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xl font-bold">Hoja de ruta · Hitos</h3>
          <span className="text-sm text-muted-foreground">
            {hitos.filter((h) => h.estado === "completado").length} / {hitos.length} completados
          </span>
        </div>

        <div className="space-y-2">
          {hitos.map((h) => {
            const isWorking = working === h.id;
            const estadoPermiteIniciar = h.estado === "no_iniciado" || h.estado === "bloqueado";
            const estadoPermiteAprobar = h.estado === "en_curso";
            // Gating por rol — el backend valida igual, esto solo oculta botones.
            const canIniciar  = estadoPermiteIniciar  && puedeActuarEnHito(currentUser, h, "iniciar");
            const canAprobar  = estadoPermiteAprobar  && puedeActuarEnHito(currentUser, h, "aprobar");
            const canRechazar = estadoPermiteAprobar  && puedeActuarEnHito(currentUser, h, "rechazar");
            const canReintentar  = puedeActuarEnHito(currentUser, h, "reintentar");
            const canReabrir     = puedeActuarEnHito(currentUser, h, "reabrir_anterior");
            const canEscalar     = puedeActuarEnHito(currentUser, h, "escalar");
            const canCancelarExp = esOverrideExpediente(currentUser);
            const canEditarSla   = esOverrideExpediente(currentUser);
            // Atajo al documento relacionado del hito (para que el aprobador pueda
            // revisarlo antes de aprobar/rechazar). Si el hito menciona cotizacion/
            // contrato/OT/informe y el expediente tiene el doc emitido, render boton.
            const codigoHito = h.codigo.toLowerCase();
            let docRelacionado: { label: string; href?: string; onClick?: () => void; estado?: string } | null = null;
            if (codigoHito.includes("cotizacion") && expediente.cotizaciones) {
              docRelacionado = {
                label: `Ver cotización ${expediente.cotizaciones.codigo}`,
                href: `/cotizaciones/${expediente.cotizaciones.id}`,
                estado: expediente.cotizaciones.estado,
              };
            } else if (codigoHito.includes("contrato") && expediente.contratos) {
              docRelacionado = {
                label: `Ver contrato ${expediente.contratos.codigo}`,
                href: `/contratos/${expediente.contratos.id}`,
                estado: expediente.contratos.estado,
              };
            } else if ((codigoHito.includes("orden_trabajo") || codigoHito.startsWith("ot_")) && expediente.ot) {
              docRelacionado = {
                label: `Ver OT ${expediente.ot.codigo}`,
                href: `/ot/${expediente.ot.id}`,
                estado: expediente.ot.estado,
              };
            } else if (codigoHito.includes("informe_tecnico") && expediente.informes_tecnicos && expediente.informes_tecnicos.length > 0) {
              const inf = expediente.informes_tecnicos[0];
              docRelacionado = {
                label: `Ver informe ${inf.numero}`,
                onClick: () => setInformeDialogId(inf.id),
                estado: inf.estado,
              };
            }
            return (
              <div
                key={h.id}
                className={`rounded-md border p-3 ${h.estancado ? "border-destructive bg-destructive/5" : h.estado === "en_curso" ? "border-primary bg-primary/5" : h.estado === "completado" ? "bg-green-50/50" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-background text-lg font-bold">
                    {estadoHitoIcon(h.estado, h.estancado)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">
                          {h.orden}. {h.nombre}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {h.codigo}
                          {h.visible_cliente && " · visible al cliente"}
                          {h.requiere_aprobacion && h.roles && ` · aprueba: ${h.roles.nombre}`}
                          {h.sla_horas && ` · SLA ${h.sla_horas}h`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Cronometro startIso={h.fecha_inicio} endIso={h.fecha_fin} />
                        {h.estancado && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            {h.horas_transcurridas?.toFixed(1)}h / {h.sla_horas}h
                          </Badge>
                        )}
                        <Badge variant={estadoHitoVariant(h.estado, h.estancado)}>{h.estado}</Badge>
                      </div>
                    </div>

                    {/* Detalle */}
                    <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-muted-foreground md:grid-cols-3">
                      {h.usuarios_expediente_hitos_responsable_idTousuarios && (
                        <p>
                          Responsable: {h.usuarios_expediente_hitos_responsable_idTousuarios.nombres}{" "}
                          {h.usuarios_expediente_hitos_responsable_idTousuarios.apellidos}
                        </p>
                      )}
                      {h.fecha_inicio && <p>Inicio: {new Date(h.fecha_inicio).toLocaleString("es-EC")}</p>}
                      {h.fecha_fin && <p>Fin: {new Date(h.fecha_fin).toLocaleString("es-EC")}</p>}
                      {h.usuarios_expediente_hitos_aprobado_porTousuarios && (
                        <p>
                          Aprobado por: {h.usuarios_expediente_hitos_aprobado_porTousuarios.nombres}{" "}
                          {h.usuarios_expediente_hitos_aprobado_porTousuarios.apellidos}
                        </p>
                      )}
                    </div>

                    {h.motivo_rechazo && (
                      <p className="mt-2 rounded bg-destructive/10 px-2 py-1 text-xs text-destructive">
                        <strong>Motivo rechazo:</strong> {h.motivo_rechazo}
                      </p>
                    )}
                    {h.estado === "rechazado" && (canReintentar || canReabrir || canEscalar || canCancelarExp) && (
                      <div className="mt-2 rounded-md border border-orange-300 bg-orange-50 p-3">
                        <p className="mb-2 text-xs font-semibold text-orange-900">¿Cómo seguimos?</p>
                        <div className="flex flex-wrap gap-2">
                          {canReintentar && (
                            <Button size="sm" variant="outline" onClick={() => handleReintentarHito(h)} disabled={savingRechazoAccion}>
                              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reintentar este hito
                            </Button>
                          )}
                          {canReabrir && (
                            <Button size="sm" variant="outline" onClick={() => setRechazoDialog({ kind: "reabrir-anterior", hito: h, hitoAnteriorId: null })} disabled={savingRechazoAccion}>
                              <Undo2 className="mr-1 h-3.5 w-3.5" /> Volver a un hito anterior
                            </Button>
                          )}
                          {canEscalar && (
                            <Button size="sm" variant="outline" onClick={() => {
                              const defaultRol = rolesGerencia.find((r) => r.nombre === "gerencia_comercial") ?? rolesGerencia[0] ?? null;
                              setRechazoDialog({ kind: "escalar", hito: h, mensaje: "", rolDestinoId: defaultRol?.id ?? null });
                            }} disabled={savingRechazoAccion}>
                              <ArrowUpToLine className="mr-1 h-3.5 w-3.5" /> Escalar
                            </Button>
                          )}
                          {canCancelarExp && (
                            <Button size="sm" variant="destructive" onClick={() => setRechazoDialog({ kind: "cancelar", motivo: h.motivo_rechazo ?? "" })} disabled={savingRechazoAccion}>
                              <Ban className="mr-1 h-3.5 w-3.5" /> Cerrar expediente
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                    {h.notas && (
                      <p className="mt-2 rounded bg-muted px-2 py-1 text-xs whitespace-pre-wrap">{h.notas}</p>
                    )}

                    {/* Acciones */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {docRelacionado && (
                        docRelacionado.href ? (
                          <Button asChild size="sm" variant="outline">
                            <Link href={docRelacionado.href}>
                              <ExternalLink className="mr-1 h-3.5 w-3.5" />
                              {docRelacionado.label}
                              {docRelacionado.estado && (
                                <Badge variant="muted" className="ml-2 text-[10px]">
                                  {docRelacionado.estado}
                                </Badge>
                              )}
                            </Link>
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={docRelacionado.onClick}>
                            <ExternalLink className="mr-1 h-3.5 w-3.5" />
                            {docRelacionado.label}
                            {docRelacionado.estado && (
                              <Badge variant="muted" className="ml-2 text-[10px]">
                                {docRelacionado.estado}
                              </Badge>
                            )}
                          </Button>
                        )
                      )}
                      {canIniciar && (
                        <Button size="sm" variant="outline" onClick={() => handleIniciar(h)} disabled={isWorking}>
                          <Play className="mr-1 h-3.5 w-3.5" /> Iniciar
                        </Button>
                      )}
                      {canAprobar && (
                        <Button size="sm" onClick={() => handleAprobar(h)} disabled={isWorking}>
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Aprobar
                        </Button>
                      )}
                      {canRechazar && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRechazar(h)}
                          disabled={isWorking}
                        >
                          <XCircle className="mr-1 h-3.5 w-3.5" /> Rechazar
                        </Button>
                      )}
                      {canEditarSla && (
                        <Button size="sm" variant="ghost" onClick={() => openSlaDialog(h)} title="Editar SLA solo para este expediente">
                          <Clock className="mr-1 h-3.5 w-3.5" /> SLA
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {hitos.length > 0 && (
          <div className="mt-4">
            <TiempoTotal hitos={hitos} />
          </div>
        )}
      </section>

      {/* Visitas tecnicas + informes */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-bold">
              <ClipboardCheck className="mr-1 inline h-5 w-5" />
              Visitas tecnicas
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{visitas.length} registrada(s)</span>
              <Button size="sm" onClick={() => setVisitaFormOpen(true)}>+ Nueva visita</Button>
            </div>
          </div>
          {visitas.length === 0 ? (
            <p className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
              Sin visitas tecnicas registradas
            </p>
          ) : (
            <ul className="space-y-2">
              {visitas.map((v) => (
                <li key={v.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {v.fecha_programada ? new Date(v.fecha_programada).toLocaleString("es-EC") : "Sin fecha"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {v.ubicacion_tipo === "sitio_cliente"
                          ? "Sitio cliente"
                          : v.ubicacion_tipo === "planta"
                            ? "Planta"
                            : "Virtual"}
                        {v.direccion && ` · ${v.direccion}`}
                      </p>
                    </div>
                    <Badge
                      variant={
                        v.estado === "realizada" ? "success" : v.estado === "cancelada" ? "destructive" : "default"
                      }
                    >
                      {v.estado}
                    </Badge>
                  </div>
                  {v.recomendacion && (
                    <p className="mt-1 text-xs">
                      Recomendacion: <strong className="capitalize">{v.recomendacion}</strong>
                    </p>
                  )}
                  {v.hallazgos && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{v.hallazgos}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-bold">
              <FileText className="mr-1 inline h-5 w-5" />
              Informes tecnicos
            </h3>
            <span className="text-xs text-muted-foreground">{informes.length} registrado(s)</span>
          </div>
          {informes.length === 0 ? (
            <p className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
              Sin informes tecnicos
            </p>
          ) : (
            <ul className="space-y-2">
              {informes.map((i) => (
                <li key={i.id} className="cursor-pointer rounded-md border p-3 text-sm transition hover:border-primary hover:bg-accent/30" onClick={() => setInformeDialogId(i.id)}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono font-medium">{i.numero}</p>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          i.estado === "aprobado"
                            ? "success"
                            : i.estado === "rechazado"
                              ? "destructive"
                              : i.estado === "en_revision"
                                ? "warning"
                                : "muted"
                        }
                      >
                        {i.estado}
                      </Badge>
                      <span className="text-xs text-muted-foreground">click para ver</span>
                    </div>
                  </div>
                  {i.decision_tecnica && (
                    <p className="mt-1 text-xs">
                      Decision: <strong className="capitalize">{i.decision_tecnica}</strong>
                    </p>
                  )}
                  {i.diagnostico_completo && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{i.diagnostico_completo}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Dialog open={!!slaDialog} onOpenChange={(open) => { if (!open) { setSlaDialog(null); setSlaInput(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar SLA del hito</DialogTitle>
            <DialogDescription>
              {slaDialog && (
                <>Cambia el SLA <strong>solo para este expediente</strong>. La plantilla del catalogo queda igual ({slaDialog.hito.nombre}).</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="sla_input">SLA en horas (vacio = sin SLA)</Label>
            <Input
              id="sla_input" type="number" min="1" max="8760"
              value={slaInput}
              onChange={(e) => setSlaInput(e.target.value)}
              placeholder="Ej: 48"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Tiempo maximo antes de marcar el hito como estancado. Rango 1 - 8760 horas (1 ano).
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSlaDialog(null); setSlaInput(""); }} disabled={savingSla}>Cancelar</Button>
            <Button onClick={handleSlaSubmit} disabled={savingSla}>{savingSla ? "Guardando..." : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <VisitaTecnicaForm
        open={visitaFormOpen}
        onClose={() => setVisitaFormOpen(false)}
        onSaved={({ informeCreadoId }) => {
          if (informeCreadoId) {
            setInformeDialogId(informeCreadoId);
          }
          load();
        }}
        expedienteId={expediente.id}
      />

      <InformeTecnicoDialog
        open={informeDialogId !== null}
        onClose={() => setInformeDialogId(null)}
        informeId={informeDialogId}
      />

      {/* Dialog reabrir hito anterior */}
      <Dialog
        open={rechazoDialog.kind === "reabrir-anterior"}
        onOpenChange={(o) => !o && setRechazoDialog({ kind: "closed" })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Volver a un hito anterior</DialogTitle>
            <DialogDescription>
              {rechazoDialog.kind === "reabrir-anterior" && (
                <>Reabrir este hito ({rechazoDialog.hito.nombre}) y un hito anterior que necesite corrección.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="hito_ant">Hito anterior a reabrir</Label>
            <select
              id="hito_ant"
              className="w-full rounded border bg-background px-2 py-1.5 text-sm"
              value={rechazoDialog.kind === "reabrir-anterior" && rechazoDialog.hitoAnteriorId !== null ? String(rechazoDialog.hitoAnteriorId) : ""}
              onChange={(e) => {
                if (rechazoDialog.kind !== "reabrir-anterior") return;
                setRechazoDialog({ ...rechazoDialog, hitoAnteriorId: e.target.value ? Number(e.target.value) : null });
              }}
            >
              <option value="">— Seleccionar —</option>
              {expediente && rechazoDialog.kind === "reabrir-anterior" &&
                hitos
                  .filter((x) => x.orden < rechazoDialog.hito.orden)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.orden}. {x.nombre} ({x.estado})
                    </option>
                  ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRechazoDialog({ kind: "closed" })} disabled={savingRechazoAccion}>Cancelar</Button>
            <Button onClick={handleReabrirAnteriorSubmit} disabled={savingRechazoAccion}>
              {savingRechazoAccion ? "Reabriendo..." : "Reabrir hitos"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog escalar */}
      <Dialog
        open={rechazoDialog.kind === "escalar"}
        onOpenChange={(o) => !o && setRechazoDialog({ kind: "closed" })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escalar el hito</DialogTitle>
            <DialogDescription>
              {rechazoDialog.kind === "escalar" && (
                <>Marca este hito como escalado a gerencia. Queda registrado en el historial con tu mensaje. El próximo paso lo decide quien lo recibe.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="esc_rol">Escalar a *</Label>
            <select
              id="esc_rol"
              className="w-full rounded border bg-background px-2 py-1.5 text-sm"
              value={rechazoDialog.kind === "escalar" && rechazoDialog.rolDestinoId !== null ? String(rechazoDialog.rolDestinoId) : ""}
              onChange={(e) => {
                if (rechazoDialog.kind !== "escalar") return;
                setRechazoDialog({ ...rechazoDialog, rolDestinoId: e.target.value ? Number(e.target.value) : null });
              }}
            >
              <option value="">— Seleccionar —</option>
              {rolesGerencia.map((r) => (
                <option key={r.id} value={r.id}>{r.nombre}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Todos los usuarios aprobados con este rol recibirán un email con el contexto del hito y tu mensaje. El worker de notificaciones lo procesa en máximo 5 minutos.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="esc_msg">Mensaje para la escalación *</Label>
            <textarea
              id="esc_msg"
              rows={4}
              className="w-full rounded border bg-background px-2 py-1.5 text-sm"
              placeholder="Ej: Cliente no permitió acceso al equipo. Requiere intervención comercial para coordinar visita."
              value={rechazoDialog.kind === "escalar" ? rechazoDialog.mensaje : ""}
              onChange={(e) => {
                if (rechazoDialog.kind !== "escalar") return;
                setRechazoDialog({ ...rechazoDialog, mensaje: e.target.value });
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRechazoDialog({ kind: "closed" })} disabled={savingRechazoAccion}>Cancelar</Button>
            <Button onClick={handleEscalarSubmit} disabled={savingRechazoAccion}>
              {savingRechazoAccion ? "Escalando..." : "Escalar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog cancelar expediente */}
      <Dialog
        open={rechazoDialog.kind === "cancelar"}
        onOpenChange={(o) => !o && setRechazoDialog({ kind: "closed" })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cerrar expediente</DialogTitle>
            <DialogDescription>
              {expediente && (
                <>Cerrar el expediente <strong>{expediente.codigo}</strong> como no viable. La hoja de ruta queda como historial. Esta acción no se puede revertir desde la UI.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancel_motivo">Motivo del cierre *</Label>
            <textarea
              id="cancel_motivo"
              rows={3}
              className="w-full rounded border bg-background px-2 py-1.5 text-sm"
              placeholder="Ej: Equipo no viable según diagnóstico"
              value={rechazoDialog.kind === "cancelar" ? rechazoDialog.motivo : ""}
              onChange={(e) => {
                if (rechazoDialog.kind !== "cancelar") return;
                setRechazoDialog({ ...rechazoDialog, motivo: e.target.value });
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRechazoDialog({ kind: "closed" })} disabled={savingRechazoAccion}>Cancelar</Button>
            <Button variant="destructive" onClick={handleCancelarExpedienteSubmit} disabled={savingRechazoAccion}>
              {savingRechazoAccion ? "Cerrando..." : "Cerrar expediente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster richColors position="top-right" />
    </div>
  );
}

function DocCard({
  label,
  href,
  codigo,
  estado,
}: {
  label: string;
  href: string | null;
  codigo: string | undefined;
  estado: string | undefined;
}) {
  if (!codigo) {
    return (
      <div className="rounded-md border bg-muted/10 p-3 text-sm">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <p className="text-muted-foreground">— sin generar —</p>
      </div>
    );
  }
  const inner = (
    <div className="rounded-md border p-3 text-sm transition hover:border-primary">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="flex items-center gap-1 font-mono">
        {codigo}
        {href && <ExternalLink className="h-3 w-3" />}
      </p>
      {estado && (
        <p className="mt-1 text-xs text-muted-foreground capitalize">{estado}</p>
      )}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
