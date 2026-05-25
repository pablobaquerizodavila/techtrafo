"use client";

import { useEffect, useState } from "react";
import { CalendarRange, ShieldCheck } from "lucide-react";
import { GanttData, GanttPaso, getGanttOT } from "@/lib/dashboard-e";

const ROW_H = 28;
const ROW_GAP = 4;
const PAD_LEFT = 200;   // espacio para nombre del paso
const PAD_RIGHT = 16;
const HEADER_H = 36;
const FOOTER_H = 24;

interface Props { otId: number }

export function GanttOT({ otId }: Props) {
  const [data, setData] = useState<GanttData | null>(null);
  const [w, setW] = useState(900);

  useEffect(() => {
    getGanttOT(otId).then((r) => setData(r.data)).catch(() => setData(null));
  }, [otId]);

  useEffect(() => {
    function onResize() {
      const el = document.getElementById(`gantt-${otId}`);
      if (el) setW(Math.max(600, el.clientWidth - 8));
    }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [otId]);

  if (!data) {
    return (
      <section className="overflow-hidden rounded-xl border border-glass bg-glass p-5 inset-highlight">
        <p className="text-xs text-muted-foreground">Cargando Gantt…</p>
      </section>
    );
  }

  const desde = new Date(data.rango.desde).getTime();
  const hasta = new Date(data.rango.hasta).getTime();
  const totalMs = Math.max(1, hasta - desde);
  const chartW = w - PAD_LEFT - PAD_RIGHT;
  const x = (t: number) => PAD_LEFT + ((t - desde) / totalMs) * chartW;
  const today = Date.now();
  const todayInRange = today >= desde && today <= hasta;

  const totalH = HEADER_H + data.pasos.length * (ROW_H + ROW_GAP) + FOOTER_H;

  // Genera ticks (5 etiquetas equidistantes para legibilidad)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((p) => ({
    t: desde + p * totalMs,
    pct: p,
  }));

  return (
    <section id={`gantt-${otId}`} className="overflow-hidden rounded-xl border border-glass bg-glass p-5 inset-highlight">
      <div className="mb-3 flex items-center gap-2 font-display text-sm font-semibold tracking-tight">
        <CalendarRange className="h-4 w-4 text-copper" /> Gantt
        <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">pasos planificados vs reales</span>
      </div>
      <svg width={w} height={totalH} className="block">
        {/* Cabecera con ticks de tiempo */}
        <line x1={PAD_LEFT} y1={HEADER_H - 4} x2={w - PAD_RIGHT} y2={HEADER_H - 4} stroke="rgba(255,255,255,0.12)" />
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={x(t.t)} y1={HEADER_H - 8} x2={x(t.t)} y2={HEADER_H - 2} stroke="rgba(255,255,255,0.18)" />
            <text x={x(t.t)} y={HEADER_H - 12} textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"} fontSize="10" fill="rgba(245,245,244,0.55)" fontFamily="var(--font-mono)">
              {new Date(t.t).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil", day: "2-digit", month: "short" })}
            </text>
          </g>
        ))}

        {/* Línea de HOY */}
        {todayInRange && (
          <g>
            <line x1={x(today)} y1={HEADER_H - 4} x2={x(today)} y2={totalH - FOOTER_H} stroke="#ff6b35" strokeWidth="1.5" strokeDasharray="4,4" style={{ filter: "drop-shadow(0 0 4px rgba(255,107,53,0.5))" }} />
            <text x={x(today) + 4} y={HEADER_H + 10} fontSize="10" fill="#ff6b35" fontWeight="600" fontFamily="var(--font-mono)">HOY</text>
          </g>
        )}

        {/* Filas */}
        {data.pasos.map((p, i) => {
          const y = HEADER_H + i * (ROW_H + ROW_GAP);
          return <PasoRow key={p.id} paso={p} y={y} x={x} />;
        })}

        {/* Leyenda al pie */}
        <g transform={`translate(${PAD_LEFT}, ${totalH - 14})`} fontFamily="var(--font-mono)">
          <rect x={0} y={-6} width={10} height={8} fill="rgba(255,255,255,0.18)" />
          <text x={14} y={2} fontSize="10" fill="rgba(245,245,244,0.55)">Plan</text>
          <rect x={50} y={-6} width={10} height={8} fill="#4fd1c5" />
          <text x={64} y={2} fontSize="10" fill="rgba(245,245,244,0.55)">En curso</text>
          <rect x={120} y={-6} width={10} height={8} fill="#22c55e" />
          <text x={134} y={2} fontSize="10" fill="rgba(245,245,244,0.55)">Completado</text>
          <rect x={215} y={-6} width={10} height={8} fill="#ef4444" />
          <text x={229} y={2} fontSize="10" fill="rgba(245,245,244,0.55)">Rechazado</text>
        </g>
      </svg>
    </section>
  );
}

function PasoRow({ paso, y, x }: { paso: GanttPaso; y: number; x: (t: number) => number }) {
  const planX1 = x(new Date(paso.plan_inicio).getTime());
  const planX2 = x(new Date(paso.plan_fin).getTime());
  const planW = Math.max(2, planX2 - planX1);

  const realStart = paso.real_inicio ? new Date(paso.real_inicio).getTime() : null;
  const realEnd = paso.real_fin ? new Date(paso.real_fin).getTime() : (paso.estado === "en_curso" ? Date.now() : null);

  const realX1 = realStart ? x(realStart) : null;
  const realX2 = realEnd ? x(realEnd) : null;
  const realW = realX1 && realX2 ? Math.max(2, realX2 - realX1) : 0;

  const realColor =
    paso.estado === "completado" ? "#22c55e" :
    paso.estado === "rechazado"  ? "#ef4444" :
    paso.estado === "saltado"    ? "rgba(255,255,255,0.25)" :
    paso.estado === "en_curso"   ? "#4fd1c5" : "rgba(255,255,255,0.2)";

  return (
    <g>
      {/* Label del paso */}
      <text x={PAD_LEFT - 8} y={y + ROW_H / 2 + 4} textAnchor="end" fontSize="11" fill="rgba(245,245,244,0.9)">
        <tspan fill="rgba(245,245,244,0.5)" fontFamily="var(--font-mono)">{paso.numero}.</tspan>{" "}
        {paso.nombre.length > 22 ? paso.nombre.slice(0, 20) + "…" : paso.nombre}
        {paso.es_gate && <tspan fill="#f59e0b"> ⚐</tspan>}
      </text>

      {/* Barra plan (gris translúcido) */}
      <rect x={planX1} y={y + 6} width={planW} height={ROW_H - 12} fill="rgba(255,255,255,0.12)" rx="2">
        <title>{`Plan: ${new Date(paso.plan_inicio).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" })} → ${new Date(paso.plan_fin).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" })}`}</title>
      </rect>

      {/* Barra real (encima, color según estado) */}
      {realX1 != null && realW > 0 && (
        <rect x={realX1} y={y + 2} width={realW} height={ROW_H - 4} fill={realColor} rx="3" style={{
          filter: paso.estado === "completado" ? "drop-shadow(0 0 4px rgba(34,197,94,0.4))"
                : paso.estado === "rechazado" ? "drop-shadow(0 0 6px rgba(239,68,68,0.5))"
                : paso.estado === "en_curso" ? "drop-shadow(0 0 4px rgba(79,209,197,0.4))"
                : "none"
        }}>
          <title>{`Real: ${paso.real_inicio ? new Date(paso.real_inicio).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" }) : "?"} → ${paso.real_fin ? new Date(paso.real_fin).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" }) : "ahora"}`}</title>
        </rect>
      )}

      {/* Borde de area si existe */}
      {paso.area && (
        <rect x={planX1} y={y + 6} width={planW} height={ROW_H - 12} fill="none" stroke={paso.area.color} strokeWidth="1.5" rx="2" opacity={0.6} />
      )}
    </g>
  );
}
