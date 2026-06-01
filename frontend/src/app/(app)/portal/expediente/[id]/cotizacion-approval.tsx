"use client";

import { useState } from "react";
import { FileText, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { aprobarCotizacion, rechazarCotizacion, verCotizacionPdfUrl } from "@/lib/portal";
import { ApiError } from "@/lib/api";

interface Props {
  cotizacion: { id: number; codigo: string; total: string };
  /** Se llama tras aprobar/rechazar con éxito para recargar el expediente. */
  onDone: () => void;
}

function errMsg(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const code = (err.body as { error?: string })?.error;
    if (code === "cotizacion_no_enviada") return "Esta cotización ya no está disponible para aprobar.";
    if (code === "hito_no_en_aprobacion") return "El proceso ya avanzó. Recargá la página.";
    if (code === "not_found") return "No encontramos esta cotización.";
    return `Error ${err.status}`;
  }
  return fallback;
}

export function CotizacionApproval({ cotizacion, onDone }: Props) {
  const [busy, setBusy] = useState<null | "aprobar" | "rechazar">(null);
  const [showReject, setShowReject] = useState(false);
  const [motivo, setMotivo] = useState("");

  const totalFmt = `USD ${Number(cotizacion.total).toFixed(2)}`;

  function verPdf() {
    window.open(verCotizacionPdfUrl(cotizacion.id), "_blank", "noopener,noreferrer");
  }

  async function aprobar() {
    if (!window.confirm(`¿Aprobar la cotización ${cotizacion.codigo} por ${totalFmt}? Con esto autorizás continuar con el contrato.`)) return;
    setBusy("aprobar");
    try {
      await aprobarCotizacion(cotizacion.id);
      toast.success("¡Cotización aprobada! Continuamos con tu pedido.");
      onDone();
    } catch (err) {
      toast.error(errMsg(err, "No se pudo aprobar"));
      setBusy(null);
    }
  }

  async function rechazar() {
    if (motivo.trim().length < 3) { toast.error("Contanos brevemente el motivo del rechazo"); return; }
    setBusy("rechazar");
    try {
      await rechazarCotizacion(cotizacion.id, motivo.trim());
      toast.success("Cotización rechazada. Tu ejecutivo fue notificado y te contactará.");
      onDone();
    } catch (err) {
      toast.error(errMsg(err, "No se pudo rechazar"));
      setBusy(null);
    }
  }

  return (
    <section
      className="overflow-hidden rounded-xl border border-copper/40 bg-glass p-6 inset-highlight"
      style={{ backgroundImage: "radial-gradient(ellipse 80% 100% at 100% 0%, rgba(255,107,53,0.12), transparent 60%)" }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-copper">Acción requerida</p>
          <h3 className="mt-1 font-display text-2xl font-semibold tracking-tight">Tu cotización está lista</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Revisá la cotización <span className="font-mono text-copper">{cotizacion.codigo}</span> y decidí si la aprobás.
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Total</p>
          <p className="font-display text-3xl font-semibold tabular-nums text-copper text-glow-copper">{totalFmt}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <Button type="button" variant="outline" onClick={verPdf}>
          <FileText className="mr-1.5 h-4 w-4" /> Ver cotización (PDF)
        </Button>
        <Button type="button" onClick={aprobar} disabled={busy !== null}
          className="bg-green-600 text-white hover:bg-green-500">
          {busy === "aprobar" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
          Aprobar
        </Button>
        <Button type="button" variant="outline" onClick={() => setShowReject((v) => !v)} disabled={busy !== null}
          className="border-rose-500/40 text-rose-300 hover:bg-rose-500/10">
          <XCircle className="mr-1.5 h-4 w-4" /> Rechazar
        </Button>
      </div>

      {showReject && (
        <div className="mt-4 space-y-2 rounded-lg border border-rose-500/30 bg-rose-500/[0.05] p-3">
          <label className="text-[11px] font-medium text-rose-200">Motivo del rechazo (lo verá tu ejecutivo)</label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Ej.: el precio excede el presupuesto, necesito ajustar el alcance, etc."
            className="w-full resize-y rounded-md border border-glass bg-background/50 px-3 py-2 text-sm outline-none focus:border-rose-500/50"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => { setShowReject(false); setMotivo(""); }} disabled={busy !== null}>
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={rechazar} disabled={busy !== null}
              className="bg-rose-600 text-white hover:bg-rose-500">
              {busy === "rechazar" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Confirmar rechazo
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
