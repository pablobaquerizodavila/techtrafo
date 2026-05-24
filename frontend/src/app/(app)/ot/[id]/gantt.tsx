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

  if (!data) return <p className="text-xs text-muted-foreground">Cargando Gantt...</p>;

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
    <div id={`gantt-${otId}`} className="rounded-md border bg-white p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <CalendarRange className="h-4 w-4" /> Gantt — pasos planificados vs reales
      </div>
      <svg width={w} height={totalH} className="block">
        {/* Cabecera con ticks de tiempo */}
        <line x1={PAD_LEFT} y1={HEADER_H - 4} x2={w - PAD_RIGHT} y2={HEADER_H - 4} stroke="#cbd5e1" />
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={x(t.t)} y1={HEADER_H - 8} x2={x(t.t)} y2={HEADER_H - 2} stroke="#94a3b8" />
            <text x={x(t.t)} y={HEADER_H - 12} textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"} fontSize="10" fill="#475569">
              {new Date(t.t).toLocaleDateString("es-EC", { day: "2-digit", month: "short" })}
            </text>
          </g>
        ))}

        {/* Linea de HOY */}
        {todayInRange && (
          <g>
            <line x1={x(today)} y1={HEADER_H - 4} x2={x(today)} y2={totalH - FOOTER_H} stroke="#ef4444" strokeWidth="1.5" strokeDasharray="4,4" />
            <text x={x(today) + 4} y={HEADER_H + 10} fontSize="10" fill="#ef4444" fontWeight="600">HOY</text>
          </g>
        )}

        {/* Filas */}
        {data.pasos.map((p, i) => {
          const y = HEADER_H + i * (ROW_H + ROW_GAP);
          return <PasoRow key={p.id} paso={p} y={y} x={x} />;
        })}

        {/* Leyenda al pie */}
        <g transform={`translate(${PAD_LEFT}, ${totalH - 14})`}>
          <rect x={0} y={-6} width={10} height={8} fill="#cbd5e1" />
          <text x={14} y={2} fontSize="10" fill="#475569">Plan</text>
          <rect x={50} y={-6} width={10} height={8} fill="#3b82f6" />
          <text x={64} y={2} fontSize="10" fill="#475569">Real</text>
          <rect x={100} y={-6} width={10} height={8} fill="#10b981" />
          <text x={114} y={2} fontSize="10" fill="#475569">Completado</text>
          <rect x={195} y={-6} width={10} height={8} fill="#ef4444" />
          <text x={209} y={2} fontSize="10" fill="#475569">Rechazado</text>
        </g>
      </svg>
    </div>
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
    paso.estado === "completado" ? "#10b981" :
    paso.estado === "rechazado"  ? "#ef4444" :
    paso.estado === "saltado"    ? "#94a3b8" :
    paso.estado === "en_curso"   ? "#3b82f6" : "#cbd5e1";

  return (
    <g>
      {/* Label del paso */}
      <text x={PAD_LEFT - 8} y={y + ROW_H / 2 + 4} textAnchor="end" fontSize="11" fill="#0f172a">
        {paso.numero}. {paso.nombre.length > 22 ? paso.nombre.slice(0, 20) + "…" : paso.nombre}
        {paso.es_gate && " ⚐"}
      </text>

      {/* Barra plan (gris claro) */}
      <rect x={planX1} y={y + 6} width={planW} height={ROW_H - 12} fill="#cbd5e1" rx="2" opacity={0.5}>
        <title>{`Plan: ${new Date(paso.plan_inicio).toLocaleDateString()} → ${new Date(paso.plan_fin).toLocaleDateString()}`}</title>
      </rect>

      {/* Barra real (encima, color según estado) */}
      {realX1 != null && realW > 0 && (
        <rect x={realX1} y={y + 2} width={realW} height={ROW_H - 4} fill={realColor} rx="3">
          <title>{`Real: ${paso.real_inicio ? new Date(paso.real_inicio).toLocaleDateString() : "?"} → ${paso.real_fin ? new Date(paso.real_fin).toLocaleDateString() : "ahora"}`}</title>
        </rect>
      )}

      {/* Borde de area si existe */}
      {paso.area && (
        <rect x={planX1} y={y + 6} width={planW} height={ROW_H - 12} fill="none" stroke={paso.area.color} strokeWidth="1.5" rx="2" />
      )}
    </g>
  );
}
