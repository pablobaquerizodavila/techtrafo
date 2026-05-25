"use client";

import { useEffect, useState } from "react";
import { FileDown, Mail, Pencil, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  InformeTecnico, enviarInformePorEmail, getInforme,
} from "@/lib/informes-tecnicos";
import { ApiError } from "@/lib/api";
import { InformeTecnicoForm } from "./informe-tecnico-form";

interface Props {
  open: boolean;
  onClose: () => void;
  informeId: number | null;
}

type Mode = "view" | "edit" | "email";

const LABELS: Record<string, string> = {
  // Heredados de la visita
  estado_general: "Estado general",
  estado_aceite: "Estado del aceite",
  color_aceite: "Color del aceite",
  ruidos_anomalos: "Ruidos anómalos",
  temperatura_externa_c: "Temperatura externa (°C)",
  resistencia_aislamiento_mohm: "Resistencia aislamiento (MΩ)",
  voltaje_primario_v: "Voltaje primario (V)",
  voltaje_secundario_v: "Voltaje secundario (V)",
  // Propios del informe
  causa_raiz: "Causa raíz",
  severidad: "Severidad",
  vida_util_restante: "Vida útil restante",
  riesgo_si_no_actuar: "Riesgo si no se actúa",
  repuestos_locales: "Repuestos locales",
  tiempo_aprovisionamiento_dias: "Tiempo aprovisionamiento (días)",
  tiempo_estimado_dias: "Tiempo trabajo estimado (días)",
  costo_estimado_rango: "Rango de costo (USD)",
};

const LISTAS: Record<string, string> = {
  hallazgos: "Hallazgos detectados",
  componentes_afectados: "Componentes afectados",
  trabajos_requeridos: "Trabajos requeridos",
};

function fmtValor(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "string") return v.replace(/_/g, " ");
  return String(v);
}

export function InformeTecnicoDialog({ open, onClose, informeId }: Props) {
  const [inf, setInf] = useState<InformeTecnico | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("view");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [asunto, setAsunto] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!open || !informeId) {
      setInf(null);
      setMode("view");
      return;
    }
    setLoading(true);
    getInforme(informeId)
      .then((r) => {
        setInf(r.data);
        const cliente = r.data.expedientes?.clientes?.razon_social ?? "";
        setAsunto(`[TECHTRAFO] Informe técnico ${r.data.numero}`);
        setMensaje(
          `Adjuntamos el informe técnico ${r.data.numero} correspondiente al expediente ${r.data.expedientes?.codigo ?? ""}${cliente ? ` (${cliente})` : ""}.\n\nSaludos cordiales,\nEquipo técnico TECHTRAFO`,
        );
      })
      .catch(() => toast.error("Error cargando informe"))
      .finally(() => setLoading(false));
  }, [open, informeId]);

  async function handleEnviar() {
    if (!informeId || !to.trim()) {
      toast.error("Falta destinatario");
      return;
    }
    setEnviando(true);
    try {
      const res = await enviarInformePorEmail(informeId, {
        to: to.trim(),
        cc: cc.trim() || undefined,
        asunto: asunto.trim() || undefined,
        mensaje: mensaje.trim() || undefined,
      });
      toast.success(
        res.status === "dry_run"
          ? `SMTP en dry-run · destinatario: ${res.destinatario}`
          : `Email enviado a ${res.destinatario} (${res.adjunto_kb} KB)`,
      );
      setMode("view");
    } catch (err) {
      const code = err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error";
      toast.error(code);
    } finally {
      setEnviando(false);
    }
  }

  function descargarPdf() {
    if (!informeId) return;
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";
    window.open(`${apiBase}/api/pdf/informe-tecnico/${informeId}?nivel=2`, "_blank", "noopener,noreferrer");
  }

  const editable = inf && (inf.estado === "borrador" || inf.estado === "rechazado");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {inf ? `Informe técnico ${inf.numero}` : "Informe técnico"}
            {mode === "edit" && " · edición"}
          </DialogTitle>
          {inf && (
            <DialogDescription>
              Expediente {inf.expedientes?.codigo}{inf.expedientes?.clientes?.razon_social && ` · ${inf.expedientes.clientes.razon_social}`}
            </DialogDescription>
          )}
        </DialogHeader>

        {loading && <p className="text-muted-foreground">Cargando...</p>}

        {inf && mode === "view" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Estado</p>
                <Badge variant={inf.estado === "aprobado" ? "success" : inf.estado === "rechazado" ? "destructive" : inf.estado === "en_revision" ? "warning" : "muted"}>
                  {inf.estado.replace("_", " ")}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Decisión técnica</p>
                <p className="font-semibold capitalize">{inf.decision_tecnica ?? "—"}</p>
              </div>
              {inf.visitas_tecnicas?.fecha_realizada && (
                <div>
                  <p className="text-xs text-muted-foreground">Visita realizada</p>
                  <p>{new Date(inf.visitas_tecnicas.fecha_realizada).toLocaleString("es-EC")}</p>
                </div>
              )}
              {inf.fecha_aprobacion && (
                <div>
                  <p className="text-xs text-muted-foreground">Fecha aprobación</p>
                  <p>{new Date(inf.fecha_aprobacion).toLocaleString("es-EC")}</p>
                </div>
              )}
            </div>

            {inf.datos_inspeccion && Object.keys(inf.datos_inspeccion).length > 0 && (
              <section>
                <h4 className="mb-2 text-sm font-semibold text-muted-foreground">Datos de inspección</h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border bg-muted/20 p-3 text-sm">
                  {Object.entries(LABELS).map(([k, label]) => {
                    const v = (inf.datos_inspeccion as Record<string, unknown>)[k];
                    if (v === undefined || v === null || v === "") return null;
                    return (
                      <div key={k} className="flex justify-between">
                        <span className="text-muted-foreground">{label}:</span>
                        <span className="font-medium">{fmtValor(v)}</span>
                      </div>
                    );
                  })}
                </div>
                {Object.entries(LISTAS).map(([k, label]) => {
                  const lista = (inf.datos_inspeccion as Record<string, unknown>)[k];
                  if (!Array.isArray(lista) || lista.length === 0) return null;
                  return (
                    <div key={k} className="mt-2">
                      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
                      <ul className="ml-4 list-disc text-sm">
                        {(lista as string[]).map((h) => (
                          <li key={h}>{h.replace(/_/g, " ")}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </section>
            )}

            {inf.justificacion && (
              <section>
                <h4 className="mb-1 text-sm font-semibold text-muted-foreground">Justificación</h4>
                <p className="whitespace-pre-wrap rounded-md border bg-muted/20 p-3 text-sm">{inf.justificacion}</p>
              </section>
            )}

            {inf.diagnostico_completo && (
              <section>
                <h4 className="mb-1 text-sm font-semibold text-muted-foreground">Diagnóstico completo</h4>
                <p className="whitespace-pre-wrap rounded-md border bg-muted/20 p-3 text-sm">{inf.diagnostico_completo}</p>
              </section>
            )}
          </div>
        )}

        {inf && mode === "edit" && (
          <InformeTecnicoForm
            informe={inf}
            onCancel={() => setMode("view")}
            onSaved={(actualizado) => {
              setInf(actualizado);
              setMode("view");
            }}
          />
        )}

        {inf && mode === "email" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              El PDF se adjuntará automáticamente. El correo sale desde <strong>notificaciones@techtrafo.com</strong>.
            </p>
            <div className="space-y-1">
              <Label htmlFor="to">Para *</Label>
              <Input id="to" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="cliente@empresa.com" autoFocus />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cc">CC (opcional)</Label>
              <Input id="cc" type="email" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="copia@empresa.com" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="asunto">Asunto</Label>
              <Input id="asunto" value={asunto} onChange={(e) => setAsunto(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mensaje">Mensaje</Label>
              <Textarea id="mensaje" rows={6} value={mensaje} onChange={(e) => setMensaje(e.target.value)} />
            </div>
          </div>
        )}

        {/* Footer solo si NO estamos en edit (el form tiene su propio footer) */}
        {mode !== "edit" && (
          <DialogFooter className="gap-2">
            {mode === "view" ? (
              <>
                <Button variant="outline" onClick={onClose}>Cerrar</Button>
                {editable && (
                  <Button variant="outline" onClick={() => setMode("edit")}>
                    <Pencil className="mr-1 h-4 w-4" /> Editar
                  </Button>
                )}
                <Button variant="outline" onClick={descargarPdf}>
                  <FileDown className="mr-1 h-4 w-4" /> Descargar PDF
                </Button>
                <Button onClick={() => setMode("email")}>
                  <Mail className="mr-1 h-4 w-4" /> Enviar por email
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setMode("view")} disabled={enviando}>← Volver</Button>
                <Button onClick={handleEnviar} disabled={enviando || !to.trim()}>
                  <Send className="mr-1 h-4 w-4" />
                  {enviando ? "Enviando..." : "Enviar"}
                </Button>
              </>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
