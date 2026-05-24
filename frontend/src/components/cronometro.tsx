"use client";

import { useEffect, useState } from "react";

interface CronometroProps {
  /** ISO string del inicio del hito. Si no esta, devuelve "—". */
  startIso?: string | null;
  /** ISO string del fin. Si esta, el cronometro queda congelado en la duracion total. */
  endIso?: string | null;
  /** Visual: tamano pequeno (default) o normal. */
  size?: "sm" | "md";
  /** Si true, agrega un puntito pulsante cuando esta corriendo. */
  showPulse?: boolean;
  className?: string;
}

/**
 * Convierte ms a "HH:MM:SS". Soporta duraciones de varios dias (no se rolea a 24h).
 */
export function formatHMS(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Cronometro de hito.
 *
 * - Si tiene endIso: muestra la duracion total (fija, endIso - startIso).
 * - Si tiene solo startIso: muestra duracion en vivo (now - startIso, tick 1s).
 * - Si no tiene startIso: muestra "—".
 *
 * El interval solo se monta cuando esta corriendo (start sin end). Cuando el
 * hito completa, el componente se desuscribe y queda congelado.
 */
export function Cronometro({
  startIso,
  endIso,
  size = "sm",
  showPulse = true,
  className = "",
}: CronometroProps) {
  const startMs = startIso ? Date.parse(startIso) : null;
  const endMs = endIso ? Date.parse(endIso) : null;
  const corriendo = startMs !== null && endMs === null;

  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!corriendo) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [corriendo]);

  if (startMs === null) {
    return <span className={`text-muted-foreground ${className}`}>—</span>;
  }

  const ms = (endMs ?? now) - startMs;
  const texto = formatHMS(ms);
  const sizeClass = size === "md" ? "text-base" : "text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono tabular-nums ${sizeClass} ${corriendo ? "text-primary" : "text-foreground"} ${className}`}
      title={corriendo ? "Hito en curso (vivo)" : "Duracion total del hito"}
    >
      {corriendo && showPulse && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
      )}
      {texto}
    </span>
  );
}

/**
 * Suma de duraciones (en ms) de una lista de hitos. Para los en curso
 * usa now como cota superior; los completados usan fecha_fin.
 *
 * Pure helper - sin React hooks.
 */
export function sumarDuracionMs(
  hitos: Array<{ fecha_inicio?: string | null; fecha_fin?: string | null }>,
  nowMs: number = Date.now(),
): number {
  let total = 0;
  for (const h of hitos) {
    if (!h.fecha_inicio) continue;
    const start = Date.parse(h.fecha_inicio);
    const end = h.fecha_fin ? Date.parse(h.fecha_fin) : nowMs;
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      total += end - start;
    }
  }
  return total;
}

interface TiempoTotalProps {
  hitos: Array<{ fecha_inicio?: string | null; fecha_fin?: string | null }>;
}

/**
 * Sumatoria reactiva de todos los hitos del expediente.
 * Si alguno esta en curso (start sin end), tick cada 1s.
 */
export function TiempoTotal({ hitos }: TiempoTotalProps) {
  const hayEnCurso = hitos.some((h) => h.fecha_inicio && !h.fecha_fin);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!hayEnCurso) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hayEnCurso]);

  const totalMs = sumarDuracionMs(hitos, now);
  const horasDecimales = totalMs / 3_600_000;

  return (
    <div className="rounded-md border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Tiempo total acumulado</p>
          <p className="text-xs text-muted-foreground">
            Suma de duraciones de todos los hitos (completados + en curso).
          </p>
        </div>
        <div className="text-right">
          <p className={`font-mono tabular-nums text-2xl font-bold ${hayEnCurso ? "text-primary" : ""}`}>
            {formatHMS(totalMs)}
          </p>
          <p className="text-xs text-muted-foreground">
            {horasDecimales.toFixed(2)} h{hayEnCurso && " · vivo"}
          </p>
        </div>
      </div>
    </div>
  );
}
