"use client";

import { useEffect, useState } from "react";
import { FileDown, Mail, Send } from "lucide-react";
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

interface Props {
  open: boolean;
  onClose: () => void;
  informeId: number | null;
}

const LABELS: Record<string, string> = {
  estado_general: "Estado general",
  estado_aceite: "Estado del aceite",
  color_aceite: "Color del aceite",
  ruidos_anomalos: "Ruidos anómalos",
  temperatura_externa_c: "Temperatura externa (°C)",
  resistencia_aislamiento_mohm: "Resistencia aislamiento (MΩ)",
  voltaje_primario_v: "Voltaje primario (V)",
  voltaje_secundario_v: "Voltaje secundario (V)",
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
  const [emailMode, setEmailMode] = useState(false);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [asunto, setAsunto] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!open || !informeId) {
      setInf(null);
      setEmailMode(false);
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
      setEmailMode(false);
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

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{inf ? `Informe técnico ${inf.numero}` : "Informe técnico"}</DialogTitle>
          {inf && (
            <DialogDescription>
              Expediente {inf.expedientes?.codigo}{inf.expedientes?.clientes?.razon_social && ` · ${inf.expedientes.clientes.razon_social}`}
            </DialogDescription>
          )}
        </DialogHeader>

        {loading && <p className="text-muted-foreground">Cargando...</p>}

        {inf && !emailMode && (
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
                {Array.isArray(inf.datos_inspeccion.hallazgos) && inf.datos_inspeccion.hallazgos.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-semibold text-muted-foreground">Hallazgos detectados</p>
                    <ul className="ml-4 list-disc text-sm">
                      {(inf.datos_inspeccion.hallazgos as string[]).map((h) => (
                        <li key={h}>{h.replace(/_/g, " ")}</li>
                      ))}
                    </ul>
                  </div>
                )}
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

        {inf && emailMode && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              El PDF se adjuntará automáticamente. El correo sale desde <strong>notificaciones@medicvip.org</strong>.
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

        <DialogFooter className="gap-2">
          {!emailMode ? (
            <>
              <Button variant="outline" onClick={onClose}>Cerrar</Button>
              <Button variant="outline" onClick={descargarPdf}>
                <FileDown className="mr-1 h-4 w-4" /> Descargar PDF
              </Button>
              <Button onClick={() => setEmailMode(true)}>
                <Mail className="mr-1 h-4 w-4" /> Enviar por email
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setEmailMode(false)} disabled={enviando}>← Volver</Button>
              <Button onClick={handleEnviar} disabled={enviando || !to.trim()}>
                <Send className="mr-1 h-4 w-4" />
                {enviando ? "Enviando..." : "Enviar"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
