"use client";

import { useEffect, useState } from "react";

/**
 * Reloj y fecha que se renderizan client-side en la zona horaria del usuario.
 * Evita el bug clásico de SSR en UTC. Refresca cada 30s para mantenerse live.
 *
 * Usa la zona horaria America/Guayaquil por default (TECHTRAFO opera desde Samborondón, EC).
 */
export function LiveTime({
  tz = "America/Guayaquil",
}: {
  tz?: string;
}) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  // Antes del primer mount no renderizamos para evitar mismatch SSR/CSR.
  if (!now) return <span className="inline-block w-10 text-muted-foreground/40">--:--</span>;
  return (
    <span>
      {now.toLocaleTimeString("es-EC", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
      })}
    </span>
  );
}

/** Fecha actual con weekday/día/mes en español, zona horaria America/Guayaquil. */
export function LiveDate({
  tz = "America/Guayaquil",
}: {
  tz?: string;
}) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    // Una sola vez al día sería suficiente, pero re-evaluamos cada 5 min por simplicidad
    const t = setInterval(() => setNow(new Date()), 5 * 60_000);
    return () => clearInterval(t);
  }, []);
  if (!now) return <span className="inline-block w-32 text-muted-foreground/40">— — — —</span>;
  return (
    <span className="capitalize">
      {now.toLocaleDateString("es-EC", {
        timeZone: tz,
        weekday: "long",
        day: "numeric",
        month: "long",
      })}
    </span>
  );
}
