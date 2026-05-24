"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity, AlertTriangle, AlertOctagon, BellRing,
  CheckCircle2, Clock, Eye, Factory, Flag, Gauge, LayoutDashboard,
  PieChart, RefreshCw, Truck, Users, Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Toaster } from "sonner";
import { DashboardData, MatrizFila, getDashboardProduccion } from "@/lib/produccion";

const SEMAFORO_CFG = {
  verde:    { label: "En tiempo",  color: "bg-green-500",  text: "text-green-700"  },
  amarillo: { label: "En riesgo",  color: "bg-yellow-500", text: "text-yellow-700" },
  rojo:     { label: "Atrasado",   color: "bg-red-500",    text: "text-red-700"    },
  azul:     { label: "Terminado",  color: "bg-blue-500",   text: "text-blue-700"   },
  gris:     { label: "No iniciado", color: "bg-gray-400",  text: "text-gray-700"   },
} as const;

export default function ProduccionDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Filtros de matriz (cliente)
  const [filtroBusq, setFiltroBusq] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<string>("");
  const [filtroSemaforo, setFiltroSemaforo] = useState<string>("");
  const [filtroOrigen, setFiltroOrigen] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getDashboardProduccion();
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  // Refresh automatico cada 60s
  useEffect(() => {
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const matrizFiltrada: MatrizFila[] = useMemo(() => {
    if (!data) return [];
    const q = filtroBusq.trim().toLowerCase();
    return data.matriz.filter((m) => {
      if (filtroTipo && m.tipo !== filtroTipo) return false;
      if (filtroSemaforo && m.semaforo !== filtroSemaforo) return false;
      if (filtroOrigen && m.origen !== filtroOrigen) return false;
      if (q) {
        const txt = `${m.codigo ?? ""} ${m.cliente ?? ""} ${m.responsable ?? ""} ${m.fase_actual ?? ""}`.toLowerCase();
        if (!txt.includes(q)) return false;
      }
      return true;
    });
  }, [data, filtroBusq, filtroTipo, filtroSemaforo, filtroOrigen]);

  if (loading && !data) return <div className="text-muted-foreground">Cargando dashboard...</div>;
  if (error) return <div className="text-destructive">{error}</div>;
  if (!data) return null;

  const totalSemaforo = data.semaforo.verde + data.semaforo.amarillo + data.semaforo.rojo + data.semaforo.azul + data.semaforo.gris;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-3xl font-bold">
            <LayoutDashboard className="h-7 w-7" /> Producción
          </h2>
          <p className="text-muted-foreground">
            Vista ejecutiva de planta — generado {new Date(data.generado_en).toLocaleTimeString("es-EC")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className="mr-1 h-4 w-4" /> Refrescar
        </Button>
      </header>

      {/* KPIs ejecutivos */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">Resumen ejecutivo</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          <Kpi icon={<Factory className="h-4 w-4" />} label="OT activas"
               value={(data.kpis.ot_por_estado["en_curso"] ?? 0) + (data.kpis.ot_por_estado["planeada"] ?? 0) + (data.kpis.ot_por_estado["pausada"] ?? 0)} />
          <Kpi icon={<Activity className="h-4 w-4" />} label="OT en curso"
               value={data.kpis.ot_por_estado["en_curso"] ?? 0} tone="primary" />
          <Kpi icon={<CheckCircle2 className="h-4 w-4" />} label="OT completadas"
               value={data.kpis.ot_por_estado["completada"] ?? 0} tone="success" />
          <Kpi icon={<Zap className="h-4 w-4" />} label="Urgentes abiertas"
               value={data.kpis.ot_urgentes_abiertas} tone={data.kpis.ot_urgentes_abiertas > 0 ? "destructive" : "muted"} />
          <Kpi icon={<AlertTriangle className="h-4 w-4" />} label="OT atrasadas"
               value={data.kpis.ot_atrasadas} tone={data.kpis.ot_atrasadas > 0 ? "destructive" : "muted"} />
          <Kpi icon={<AlertOctagon className="h-4 w-4" />} label="Hitos estancados"
               value={data.kpis.expedientes_estancados} tone={data.kpis.expedientes_estancados > 0 ? "destructive" : "muted"} />
          <Kpi icon={<Flag className="h-4 w-4" />} label="Expedientes activos"
               value={data.kpis.expedientes_activos} />
          <Kpi icon={<Flag className="h-4 w-4" />} label="Expedientes ganados"
               value={data.kpis.expedientes_por_estado["ganado"] ?? 0} tone="success" />
          <Kpi icon={<BellRing className="h-4 w-4" />} label="Notif pendientes"
               value={data.kpis.notificaciones_pendientes} tone={data.kpis.notificaciones_pendientes > 0 ? "warning" : "muted"} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Semaforo */}
        <section className="rounded-md border p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Gauge className="h-4 w-4" /> Semáforo de fases ({totalSemaforo})
          </h3>
          <div className="space-y-2">
            {(["verde", "amarillo", "rojo", "azul", "gris"] as const).map((c) => {
              const cfg = SEMAFORO_CFG[c];
              const n = data.semaforo[c];
              const pct = totalSemaforo > 0 ? Math.round((n / totalSemaforo) * 100) : 0;
              return (
                <div key={c}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className={cfg.text}>{cfg.label}</span>
                    <span className="text-muted-foreground">{n} ({pct}%)</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded bg-muted">
                    <div className={`h-full ${cfg.color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Próximas entregas */}
        <section className="rounded-md border p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Truck className="h-4 w-4" /> Próximas entregas (7 días)
          </h3>
          {data.proximas_entregas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin entregas planeadas en los próximos 7 días</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.proximas_entregas.map((e) => (
                <li key={e.id} className="flex items-center justify-between">
                  <Link href={`/ot/${e.id}`} className="font-mono text-primary hover:underline">{e.codigo}</Link>
                  <span className="text-xs text-muted-foreground line-clamp-1 mx-2 flex-1">{e.cliente}</span>
                  <Badge variant={e.dias_para !== null && e.dias_para <= 2 ? "destructive" : "warning"}>
                    {e.dias_para === 0 ? "Hoy" : e.dias_para === 1 ? "Mañana" : `${e.dias_para}d`}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Alertas activas */}
        <section className="rounded-md border p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <BellRing className="h-4 w-4" /> Alertas activas ({data.alertas.length})
          </h3>
          {data.alertas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin alertas — todo bajo control</p>
          ) : (
            <ul className="space-y-2 text-sm max-h-72 overflow-y-auto">
              {data.alertas.map((a) => (
                <li key={a.id} className="flex items-start gap-2 rounded border-l-4 border-l-destructive bg-destructive/5 p-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div className="flex-1">
                    <p className="text-xs">{a.mensaje}</p>
                    {a.ref && (
                      <Link
                        href={a.ref.tipo === "ot" ? `/ot/${a.ref.id}` : `/expedientes/${a.ref.id}`}
                        className="text-xs text-primary hover:underline"
                      >
                        Abrir →
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Matriz comparativa */}
      <section className="rounded-md border">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <LayoutDashboard className="h-4 w-4" /> Matriz comparativa ({matrizFiltrada.length} de {data.matriz.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            <Input
              className="w-56"
              placeholder="Buscar código, cliente, responsable..."
              value={filtroBusq}
              onChange={(e) => setFiltroBusq(e.target.value)}
            />
            <Select value={filtroOrigen || "_"} onValueChange={(v) => setFiltroOrigen(v === "_" ? "" : v)}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Origen" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">OT + Exp</SelectItem>
                <SelectItem value="ot">Solo OT</SelectItem>
                <SelectItem value="expediente">Solo Expedientes</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroTipo || "_"} onValueChange={(v) => setFiltroTipo(v === "_" ? "" : v)}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">Todos los tipos</SelectItem>
                <SelectItem value="reparacion">Reparación</SelectItem>
                <SelectItem value="fabricacion">Fabricación</SelectItem>
                <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroSemaforo || "_"} onValueChange={(v) => setFiltroSemaforo(v === "_" ? "" : v)}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Semáforo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">Todos</SelectItem>
                <SelectItem value="verde">En tiempo</SelectItem>
                <SelectItem value="amarillo">En riesgo</SelectItem>
                <SelectItem value="rojo">Atrasado</SelectItem>
                <SelectItem value="azul">Terminado</SelectItem>
                <SelectItem value="gris">No iniciado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-2"></TableHead>
              <TableHead>Origen</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Capacidad</TableHead>
              <TableHead>Fase actual</TableHead>
              <TableHead>Avance</TableHead>
              <TableHead>Compromiso</TableHead>
              <TableHead>Responsable</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matrizFiltrada.length === 0 ? (
              <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground">Sin órdenes activas con esos filtros</TableCell></TableRow>
            ) : matrizFiltrada.map((m) => {
              const cfg = SEMAFORO_CFG[m.semaforo];
              return (
                <TableRow key={`${m.origen}-${m.id}`}>
                  <TableCell><span className={`inline-block h-3 w-3 rounded-full ${cfg.color}`} title={cfg.label} /></TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{m.origen === "ot" ? "OT" : "EXP"}</Badge></TableCell>
                  <TableCell className="font-mono text-sm">{m.codigo ?? "—"}</TableCell>
                  <TableCell className="text-sm">{m.cliente ?? "—"}</TableCell>
                  <TableCell className="text-sm capitalize">{m.tipo}</TableCell>
                  <TableCell className="text-sm font-mono">
                    {m.capacidad_kva ? (m.capacidad_kva >= 1000 ? `${(m.capacidad_kva / 1000).toFixed(0)} MVA` : `${m.capacidad_kva} kVA`) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-xs">{m.fase_actual ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-primary" style={{ width: `${m.avance_pct}%` }} />
                      </div>
                      <span className="text-xs">{m.avance_pct}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    {m.fecha_compromiso ? (
                      <>
                        {m.fecha_compromiso.split("T")[0]}
                        {m.dias_diff !== null && (
                          <span className={`ml-1 ${m.dias_diff < 0 ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                            ({m.dias_diff >= 0 ? "+" : ""}{m.dias_diff}d)
                          </span>
                        )}
                      </>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-xs">{m.responsable ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{m.estado}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" asChild>
                      <Link href={m.origen === "ot" ? `/ot/${m.id}` : `/expedientes/${m.id}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>

      {/* Rankings + Cumplimiento */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-md border p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-destructive" /> Fases con más demora (top 5)
          </h3>
          {data.ranking_fases_demora.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin fases estancadas detectadas 🎉</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.ranking_fases_demora.map((r, i) => (
                <li key={r.codigo} className="flex items-center justify-between rounded bg-destructive/5 p-2">
                  <span><strong className="mr-2">#{i + 1}</strong>{r.nombre}</span>
                  <span className="text-xs text-destructive">
                    {r.cant_estancados} caso{r.cant_estancados === 1 ? "" : "s"} · +{r.promedio_exceso_horas}h sobre SLA
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-md border p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4" /> Cumplimiento por cliente (top 10)
          </h3>
          {data.cumplimiento_cliente.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún sin OT completadas para medir</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.cumplimiento_cliente.map((r) => (
                <li key={r.cliente}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="line-clamp-1">{r.cliente}</span>
                    <span className="text-muted-foreground">{r.a_tiempo}/{r.total} ({r.cumplimiento_pct}%)</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded bg-muted">
                    <div
                      className={`h-full ${r.cumplimiento_pct >= 80 ? "bg-green-500" : r.cumplimiento_pct >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
                      style={{ width: `${r.cumplimiento_pct}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Capacidad / Causas / Productividad — data REAL desde migration 013 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Capacidad de planta */}
        <section className="rounded-md border p-4">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Gauge className="h-4 w-4" /> Capacidad de planta por área
          </h4>
          {data.capacidad_planta.por_area.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin áreas registradas</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {data.capacidad_planta.por_area.map((a) => (
                <li key={a.codigo}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ background: a.color_hex }} />
                      {a.area}
                    </span>
                    <span className="text-muted-foreground">{a.carga_pct}% · {a.ot_activas} OT</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded bg-muted">
                    <div
                      className={`h-full ${a.carga_pct >= 85 ? "bg-red-500" : a.carga_pct >= 65 ? "bg-yellow-500" : "bg-green-500"}`}
                      style={{ width: `${a.carga_pct}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[10px] text-muted-foreground italic">
            % calculado sobre capacidad nominal de 5 pasos simultáneos por área
          </p>
        </section>

        {/* Causas de demora */}
        <section className="rounded-md border p-4">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <PieChart className="h-4 w-4" /> Causas de demora
          </h4>
          {data.causas_demora.causas.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aún no se reportaron reprocesos</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {data.causas_demora.causas.map((c) => (
                <li key={c.codigo} className="flex items-center justify-between gap-2">
                  <span className="flex-1 line-clamp-1">{c.causa}</span>
                  <span className="text-right text-muted-foreground">
                    <strong>{c.incidencias}×</strong> · {c.dias_perdidos}d
                    {c.abiertas > 0 && <span className="ml-1 text-destructive">({c.abiertas} abiertas)</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Productividad por responsable */}
        <section className="rounded-md border p-4">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Clock className="h-4 w-4" /> Productividad por responsable (30 días)
          </h4>
          {data.productividad.por_responsable.length === 0 ? (
            <p className="text-xs text-muted-foreground">Aún no se registran tiempos</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {data.productividad.por_responsable.map((r) => (
                <li key={r.usuario_id}>
                  <div className="mb-0.5 flex items-center justify-between">
                    <span className="font-medium line-clamp-1">{r.nombre}</span>
                    <span className="text-muted-foreground">{r.horas_mes.toFixed(1)}h</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {r.ot_intervenidas_mes} OT · {r.pasos_completados_mes} pasos completados
                  </p>
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

function Kpi({ icon, label, value, tone = "default" }: {
  icon: React.ReactNode; label: string; value: number;
  tone?: "default" | "primary" | "success" | "destructive" | "warning" | "muted";
}) {
  const tones = {
    default: "border-border",
    primary: "border-primary/30 bg-primary/5",
    success: "border-green-500/30 bg-green-50/50",
    destructive: "border-destructive/30 bg-destructive/5",
    warning: "border-yellow-500/30 bg-yellow-50/50",
    muted: "border-border bg-muted/20",
  } as const;
  return (
    <div className={`rounded-md border p-3 ${tones[tone]}`}>
      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
        {icon} <span>{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

