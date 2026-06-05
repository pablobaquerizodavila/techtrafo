"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import { fmtMoneda, TIPO_LABEL, ResumenFinanzas } from "@/lib/finanzas";

const AXIS = "#94a3b8";
const GRID = "rgba(255,255,255,0.06)";
const tooltipStyle = { background: "#0b1220", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, fontSize: 12 };
const COL = { contratado: "#c2703d", cobrado: "#22c55e", por_cobrar: "#f59e0b" };
const AGING_COL: Record<string, string> = { "0-30": "#f59e0b", "31-60": "#fb923c", "61-90": "#f97316", "90+": "#f43f5e" };

/** Ingresos por tipo de orden (contratado / cobrado / por cobrar). */
export function IngresosBar({ data }: { data: ResumenFinanzas["por_tipo"] }) {
  const rows = data.map((d) => ({ ...d, tipo: TIPO_LABEL[d.tipo_servicio] ?? d.tipo_servicio }));
  if (rows.length === 0) return <Vacio />;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="tipo" tick={{ fill: AXIS, fontSize: 11 }} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis tick={{ fill: AXIS, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={48} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => fmtMoneda(Number(v))} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
        <Legend formatter={(v: string) => <span style={{ color: AXIS, fontSize: 11 }}>{v}</span>} />
        <Bar dataKey="contratado" name="Contratado" fill={COL.contratado} radius={[3, 3, 0, 0]} />
        <Bar dataKey="cobrado" name="Cobrado" fill={COL.cobrado} radius={[3, 3, 0, 0]} />
        <Bar dataKey="por_cobrar" name="Por cobrar" fill={COL.por_cobrar} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Cartera vencida por antigüedad (días). */
export function CarteraPie({ data }: { data: ResumenFinanzas["cartera_aging"] }) {
  const rows = data.filter((d) => d.monto > 0);
  if (rows.length === 0) return <Vacio mensaje="Sin cartera vencida 👍" />;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={rows} dataKey="monto" nameKey="rango" cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={2}>
          {rows.map((r) => <Cell key={r.rango} fill={AGING_COL[r.rango] ?? "#f43f5e"} stroke="#0b1220" />)}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => fmtMoneda(Number(v))} />
        <Legend formatter={(v) => <span style={{ color: AXIS, fontSize: 11 }}>{v} días</span>} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Tendencia de cobros (12 meses). */
export function CobrosLine({ data }: { data: ResumenFinanzas["tendencia_cobros"] }) {
  if (data.length === 0) return <Vacio />;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="mes" tick={{ fill: AXIS, fontSize: 10 }} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis tick={{ fill: AXIS, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={48} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown) => fmtMoneda(Number(v))} />
        <Line type="monotone" dataKey="monto" name="Cobrado" stroke="#2dd4bf" strokeWidth={2} dot={{ r: 3, fill: "#2dd4bf" }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function Vacio({ mensaje = "Sin datos en el período" }: { mensaje?: string }) {
  return <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">{mensaje}</div>;
}
