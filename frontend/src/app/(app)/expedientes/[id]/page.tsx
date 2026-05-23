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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Toaster, toast } from "sonner";
import {
  Expediente,
  ExpedienteHito,
  aprobarHito,
  canalOrigenLabel,
  estadoExpedienteVariant,
  estadoHitoIcon,
  estadoHitoVariant,
  getExpediente,
  iniciarHito,
  rechazarHito,
} from "@/lib/expedientes";
import { ApiError } from "@/lib/api";

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
            const puedeIniciar = h.estado === "no_iniciado" || h.estado === "bloqueado";
            const puedeAprobar = h.estado === "en_curso";
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
                    {h.notas && (
                      <p className="mt-2 rounded bg-muted px-2 py-1 text-xs whitespace-pre-wrap">{h.notas}</p>
                    )}

                    {/* Acciones */}
                    {(puedeIniciar || puedeAprobar) && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {puedeIniciar && (
                          <Button size="sm" variant="outline" onClick={() => handleIniciar(h)} disabled={isWorking}>
                            <Play className="mr-1 h-3.5 w-3.5" /> Iniciar
                          </Button>
                        )}
                        {puedeAprobar && (
                          <>
                            <Button size="sm" onClick={() => handleAprobar(h)} disabled={isWorking}>
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Aprobar
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleRechazar(h)}
                              disabled={isWorking}
                            >
                              <XCircle className="mr-1 h-3.5 w-3.5" /> Rechazar
                            </Button>
                          </>
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

      {/* Visitas tecnicas + informes */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-bold">
              <ClipboardCheck className="mr-1 inline h-5 w-5" />
              Visitas tecnicas
            </h3>
            <span className="text-xs text-muted-foreground">{visitas.length} registrada(s)</span>
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
                <li key={i.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <p className="font-mono font-medium">{i.numero}</p>
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
