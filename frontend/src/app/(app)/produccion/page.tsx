"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity, AlertTriangle, AlertOctagon, ArrowUpRight, BellRing,
  CheckCircle2, ChevronRight, Clock, Eye, Factory, Flag, Gauge,
  LayoutDashboard, RefreshCw, Search, Truck, Users, Zap,
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
  verde:    { label: "En tiempo",   dot: "bg-emerald-500", bar: "bg-emerald-500", text: "text-emerald-700", soft: "bg-emerald-50",  ring: "ring-emerald-200",  hex: "#10b981" },
  amarillo: { label: "En riesgo",   dot: "bg-amber-500",   bar: "bg-amber-500",   text: "text-amber-700",   soft: "bg-amber-50",    ring: "ring-amber-200",    hex: "#f59e0b" },
  rojo:     { label: "Atrasado",    dot: "bg-rose-500",    bar: "bg-rose-500",    text: "text-rose-700",    soft: "bg-rose-50",     ring: "ring-rose-200",     hex: "#f43f5e" },
  azul:     { label: "Terminado",   dot: "bg-sky-500",     bar: "bg-sky-500",     text: "text-sky-700",     soft: "bg-sky-50",      ring: "ring-sky-200",      hex: "#0ea5e9" },
  gris:     { label: "No iniciado", dot: "bg-slate-400",   bar: "bg-slate-400",   text: "text-slate-600",   soft: "bg-slate-50",    ring: "ring-slate-200",    hex: "#94a3b8" },
} as const;

type SemaforoKey = keyof typeof SEMAFORO_CFG;

export default function ProduccionDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  if (loading && !data) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm">Cargando dashboard de producción…</p>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-rose-700">
        <p className="font-semibold">Error al cargar el dashboard</p>
        <p className="mt-1 text-sm">{error}</p>
      </div>
    );
  }
  if (!data) return null;

  const totalSemaforo = data.semaforo.verde + data.semaforo.amarillo + data.semaforo.rojo + data.semaforo.azul + data.semaforo.gris;
  const otActivas = (data.kpis.ot_por_estado["en_curso"] ?? 0) + (data.kpis.ot_por_estado["planeada"] ?? 0) + (data.kpis.ot_por_estado["pausada"] ?? 0);
  const otCompletadas = data.kpis.ot_por_estado["completada"] ?? 0;
  const totalRiesgo = data.kpis.ot_urgentes_abiertas + data.kpis.ot_atrasadas + data.kpis.expedientes_estancados;
  const horaGen = new Date(data.generado_en).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="-m-8 min-h-screen bg-slate-50/50">
      {/* ───── Header sticky ───── */}
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/80 px-8 py-5 backdrop-blur-md">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-500">
              <Link href="/dashboard" className="hover:text-slate-700">Panel</Link>
              <ChevronRight className="h-3 w-3" />
              <span>Producción</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
                Dashboard de planta
              </h1>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Live · {horaGen}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Vista ejecutiva en tiempo real · refresco automático cada 60s
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading} className="bg-white">
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refrescar
            </Button>
          </div>
        </div>
      </header>

      <div className="space-y-6 p-8">
        {/* ───── KPI hero ───── */}
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <HeroKpi
            label="OT activas"
            value={otActivas}
            sub={`${data.kpis.ot_por_estado["en_curso"] ?? 0} en curso · ${data.kpis.ot_por_estado["planeada"] ?? 0} planeadas`}
            icon={<Factory className="h-4 w-4" />}
            accent="indigo"
            href="/ot"
          />
          <HeroKpi
            label="Completadas"
            value={otCompletadas}
            sub={`${data.kpis.expedientes_por_estado["ganado"] ?? 0} expedientes ganados`}
            icon={<CheckCircle2 className="h-4 w-4" />}
            accent="emerald"
          />
          <HeroKpi
            label="OT en riesgo"
            value={totalRiesgo}
            sub={`${data.kpis.ot_urgentes_abiertas} urgentes · ${data.kpis.ot_atrasadas} atrasadas · ${data.kpis.expedientes_estancados} estancados`}
            icon={<AlertOctagon className="h-4 w-4" />}
            accent={totalRiesgo > 0 ? "rose" : "slate"}
          />
          <HeroKpi
            label="Expedientes activos"
            value={data.kpis.expedientes_activos}
            sub={`${data.kpis.notificaciones_pendientes} notificaciones pendientes`}
            icon={<Flag className="h-4 w-4" />}
            accent="amber"
            href="/expedientes"
          />
        </section>

        {/* ───── Row: Semáforo donut + Próximas entregas + Alertas ───── */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Donut semáforo */}
          <Panel
            title="Estado del pipeline"
            subtitle={`${totalSemaforo} fases activas en planta`}
            icon={<Gauge className="h-4 w-4" />}
          >
            <div className="flex items-center gap-6">
              <Donut
                size={148}
                stroke={18}
                slices={(["verde", "amarillo", "rojo", "azul", "gris"] as const)
                  .map((k) => ({ value: data.semaforo[k], color: SEMAFORO_CFG[k].hex }))
                  .filter((s) => s.value > 0)}
                centerValue={otActivas}
                centerLabel="OT activas"
              />
              <ul className="flex-1 space-y-2">
                {(["verde", "amarillo", "rojo", "azul", "gris"] as const).map((c) => {
                  const cfg = SEMAFORO_CFG[c];
                  const n = data.semaforo[c];
                  const pct = totalSemaforo > 0 ? Math.round((n / totalSemaforo) * 100) : 0;
                  return (
                    <li key={c} className="flex items-center gap-2.5">
                      <span className={`h-2.5 w-2.5 rounded-full ${cfg.dot}`} />
                      <span className="flex-1 text-xs text-slate-600">{cfg.label}</span>
                      <span className="text-xs font-mono font-semibold tabular-nums text-slate-900">{n}</span>
                      <span className="w-9 text-right text-[10px] text-slate-400 tabular-nums">{pct}%</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Panel>

          {/* Próximas entregas */}
          <Panel
            title="Próximas entregas"
            subtitle="Compromisos a 7 días"
            icon={<Truck className="h-4 w-4" />}
            action={data.proximas_entregas.length > 0 && <span className="text-xs text-slate-400">{data.proximas_entregas.length} OT</span>}
          >
            {data.proximas_entregas.length === 0 ? (
              <EmptyState message="Sin entregas planeadas en los próximos 7 días" />
            ) : (
              <ul className="space-y-1">
                {data.proximas_entregas.slice(0, 6).map((e) => {
                  const dias = e.dias_para;
                  const urg = dias !== null && dias <= 2;
                  return (
                    <li key={e.id}>
                      <Link
                        href={`/ot/${e.id}`}
                        className="group flex items-center gap-3 rounded-md px-2 py-2 hover:bg-slate-50"
                      >
                        <div className={`flex h-9 w-12 flex-col items-center justify-center rounded-md text-center ${urg ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200" : "bg-slate-100 text-slate-600"}`}>
                          <span className="text-[10px] font-medium uppercase leading-none">
                            {dias === 0 ? "Hoy" : dias === 1 ? "Mañ." : "d"}
                          </span>
                          <span className="text-sm font-bold leading-tight tabular-nums">
                            {dias === 0 || dias === 1 ? "" : dias}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">{e.cliente ?? "Sin cliente"}</p>
                          <p className="truncate font-mono text-xs text-slate-500">{e.codigo}</p>
                        </div>
                        <ArrowUpRight className="h-3.5 w-3.5 text-slate-300 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-slate-700" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          {/* Alertas */}
          <Panel
            title="Alertas activas"
            subtitle={data.alertas.length === 0 ? "Todo bajo control" : `${data.alertas.length} requieren atención`}
            icon={<BellRing className="h-4 w-4" />}
            action={data.alertas.length > 0 && (
              <Badge variant="destructive" className="font-mono text-[10px]">{data.alertas.length}</Badge>
            )}
          >
            {data.alertas.length === 0 ? (
              <EmptyState message="Sin alertas activas — sistema saludable" tone="positive" />
            ) : (
              <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {data.alertas.map((a) => {
                  const sevCfg =
                    a.severidad === "alta"  ? { dot: "bg-rose-500",  text: "text-rose-700",  border: "border-l-rose-500"  } :
                    a.severidad === "media" ? { dot: "bg-amber-500", text: "text-amber-700", border: "border-l-amber-500" } :
                                              { dot: "bg-sky-500",   text: "text-sky-700",   border: "border-l-sky-500"   };
                  return (
                    <li key={a.id} className={`flex items-start gap-2 rounded-md border-l-2 ${sevCfg.border} bg-slate-50/70 px-3 py-2`}>
                      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${sevCfg.dot}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs leading-snug text-slate-700">{a.mensaje}</p>
                        {a.ref && (
                          <Link
                            href={a.ref.tipo === "ot" ? `/ot/${a.ref.id}` : `/expedientes/${a.ref.id}`}
                            className={`mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-medium ${sevCfg.text} hover:underline`}
                          >
                            Abrir <ArrowUpRight className="h-2.5 w-2.5" />
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </section>

        {/* ───── Matriz comparativa ───── */}
        <Panel
          title="Matriz de seguimiento"
          subtitle={`${matrizFiltrada.length} de ${data.matriz.length} órdenes y expedientes`}
          icon={<LayoutDashboard className="h-4 w-4" />}
          padded={false}
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
            <div className="relative flex-1 min-w-[14rem]">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                className="h-8 border-slate-200 pl-8 text-sm"
                placeholder="Buscar código, cliente, responsable…"
                value={filtroBusq}
                onChange={(e) => setFiltroBusq(e.target.value)}
              />
            </div>
            <Select value={filtroOrigen || "_"} onValueChange={(v) => setFiltroOrigen(v === "_" ? "" : v)}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Origen" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">OT + Exp</SelectItem>
                <SelectItem value="ot">Solo OT</SelectItem>
                <SelectItem value="expediente">Solo Exp.</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroTipo || "_"} onValueChange={(v) => setFiltroTipo(v === "_" ? "" : v)}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">Todos los tipos</SelectItem>
                <SelectItem value="reparacion">Reparación</SelectItem>
                <SelectItem value="fabricacion">Fabricación</SelectItem>
                <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroSemaforo || "_"} onValueChange={(v) => setFiltroSemaforo(v === "_" ? "" : v)}>
              <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Semáforo" /></SelectTrigger>
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

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-100 bg-slate-50/50 hover:bg-slate-50/50">
                  <TableHead className="w-2"></TableHead>
                  <TableHead className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Origen</TableHead>
                  <TableHead className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Código</TableHead>
                  <TableHead className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Cliente</TableHead>
                  <TableHead className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Tipo · Capacidad</TableHead>
                  <TableHead className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Fase actual</TableHead>
                  <TableHead className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Avance</TableHead>
                  <TableHead className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Compromiso</TableHead>
                  <TableHead className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Responsable</TableHead>
                  <TableHead className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Estado</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matrizFiltrada.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="py-10 text-center text-sm text-slate-400">
                      Sin órdenes activas con esos filtros
                    </TableCell>
                  </TableRow>
                ) : matrizFiltrada.map((m) => {
                  const cfg = SEMAFORO_CFG[m.semaforo as SemaforoKey];
                  const capacidadFmt = m.capacidad_kva
                    ? m.capacidad_kva >= 1000 ? `${(m.capacidad_kva / 1000).toFixed(1)} MVA` : `${m.capacidad_kva} kVA`
                    : null;
                  return (
                    <TableRow key={`${m.origen}-${m.id}`} className="border-slate-100 group hover:bg-slate-50/60">
                      <TableCell><span className={`block h-2 w-2 rounded-full ${cfg.dot}`} title={cfg.label} /></TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${m.origen === "ot" ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200" : "bg-purple-50 text-purple-700 ring-1 ring-purple-200"}`}>
                          {m.origen === "ot" ? "OT" : "EXP"}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs font-medium text-slate-700">{m.codigo ?? "—"}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm text-slate-700" title={m.cliente ?? undefined}>{m.cliente ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        <span className="capitalize text-slate-600">{m.tipo}</span>
                        {capacidadFmt && <span className="ml-1.5 font-mono text-slate-400">· {capacidadFmt}</span>}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate text-xs text-slate-600">{m.fase_actual ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full transition-all ${m.avance_pct >= 80 ? "bg-emerald-500" : m.avance_pct >= 40 ? "bg-sky-500" : "bg-slate-400"}`}
                              style={{ width: `${m.avance_pct}%` }}
                            />
                          </div>
                          <span className="font-mono text-[11px] tabular-nums text-slate-600">{m.avance_pct}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {m.fecha_compromiso ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-600">{m.fecha_compromiso.split("T")[0]}</span>
                            {m.dias_diff !== null && (
                              <span className={`rounded px-1 py-0.5 text-[10px] tabular-nums ${m.dias_diff < 0 ? "bg-rose-50 text-rose-700" : m.dias_diff <= 3 ? "bg-amber-50 text-amber-700" : "text-slate-400"}`}>
                                {m.dias_diff >= 0 ? "+" : ""}{m.dias_diff}d
                              </span>
                            )}
                          </div>
                        ) : <span className="text-slate-400">—</span>}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate text-xs text-slate-600">{m.responsable ?? "—"}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium capitalize text-slate-700">
                          {m.estado.replaceAll("_", " ")}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={m.origen === "ot" ? `/ot/${m.id}` : `/expedientes/${m.id}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Panel>

        {/* ───── Row: Capacidad / Causas / Productividad ───── */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Capacidad de planta */}
          <Panel
            title="Capacidad de planta"
            subtitle="Carga actual por área productiva"
            icon={<Gauge className="h-4 w-4" />}
          >
            {data.capacidad_planta.por_area.length === 0 ? (
              <EmptyState message="Sin áreas registradas" />
            ) : (
              <ul className="space-y-3">
                {data.capacidad_planta.por_area.map((a) => {
                  const tone = a.carga_pct >= 85 ? "rose" : a.carga_pct >= 65 ? "amber" : "emerald";
                  const toneCfg = {
                    rose:    { bar: "bg-rose-500",    text: "text-rose-700",    bg: "bg-rose-50"    },
                    amber:   { bar: "bg-amber-500",   text: "text-amber-700",   bg: "bg-amber-50"   },
                    emerald: { bar: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50" },
                  }[tone];
                  return (
                    <li key={a.codigo}>
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 font-medium text-slate-700">
                          <span className="h-2 w-2 rounded-full" style={{ background: a.color_hex }} />
                          {a.area}
                        </span>
                        <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] tabular-nums ${toneCfg.bg} ${toneCfg.text}`}>
                          {a.carga_pct}%
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${toneCfg.bar}`} style={{ width: `${a.carga_pct}%` }} />
                      </div>
                      <p className="mt-1 text-[10px] text-slate-400">
                        {a.ot_activas} activas · {a.completados_mes} completadas este mes
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-4 border-t border-slate-100 pt-3 text-[10px] italic text-slate-400">
              Capacidad nominal: 5 pasos simultáneos por área
            </p>
          </Panel>

          {/* Causas de demora */}
          <Panel
            title="Causas de demora"
            subtitle="Ranking por impacto en días perdidos"
            icon={<AlertTriangle className="h-4 w-4" />}
          >
            {data.causas_demora.causas.length === 0 ? (
              <EmptyState message="Aún no se reportaron reprocesos" tone="positive" />
            ) : (
              <ul className="space-y-2.5">
                {data.causas_demora.causas.slice(0, 6).map((c, i) => {
                  const max = Math.max(...data.causas_demora.causas.map((x) => x.dias_perdidos));
                  const widthPct = max > 0 ? (c.dias_perdidos / max) * 100 : 0;
                  return (
                    <li key={c.codigo} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="flex min-w-0 items-center gap-2 text-slate-700">
                          <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-slate-100 text-[10px] font-bold text-slate-500">
                            {i + 1}
                          </span>
                          <span className="truncate font-medium">{c.causa}</span>
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-slate-500 tabular-nums">
                          {c.dias_perdidos}d · {c.incidencias}×
                        </span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-500" style={{ width: `${widthPct}%` }} />
                      </div>
                      {c.abiertas > 0 && (
                        <p className="text-[10px] text-rose-600">
                          ⚠ {c.abiertas} incidencia{c.abiertas === 1 ? "" : "s"} sin resolver
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          {/* Productividad por responsable */}
          <Panel
            title="Productividad (30d)"
            subtitle="Horas registradas y OT intervenidas"
            icon={<Users className="h-4 w-4" />}
          >
            {data.productividad.por_responsable.length === 0 ? (
              <EmptyState message="Aún no se registran tiempos" />
            ) : (
              <ul className="space-y-3">
                {data.productividad.por_responsable.slice(0, 6).map((r) => {
                  const max = Math.max(...data.productividad.por_responsable.map((x) => x.horas_mes));
                  const widthPct = max > 0 ? (r.horas_mes / max) * 100 : 0;
                  const iniciales = r.nombre.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
                  return (
                    <li key={r.usuario_id} className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-100 to-slate-200 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">
                        {iniciales}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-0.5 flex items-baseline justify-between gap-2">
                          <span className="truncate text-xs font-medium text-slate-700">{r.nombre}</span>
                          <span className="shrink-0 font-mono text-[11px] tabular-nums text-slate-900">
                            {r.horas_mes.toFixed(0)}h
                          </span>
                        </div>
                        <div className="h-1 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-indigo-500" style={{ width: `${widthPct}%` }} />
                        </div>
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {r.ot_intervenidas_mes} OT · {r.pasos_completados_mes} pasos
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </section>

        {/* ───── Rankings ───── */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel
            title="Fases con más demora"
            subtitle="Top 5 cuellos de botella detectados"
            icon={<Clock className="h-4 w-4 text-rose-500" />}
          >
            {data.ranking_fases_demora.length === 0 ? (
              <EmptyState message="Sin fases estancadas detectadas" tone="positive" />
            ) : (
              <ul className="space-y-2">
                {data.ranking_fases_demora.map((r, i) => (
                  <li key={r.codigo} className="flex items-center justify-between rounded-md border border-rose-100 bg-rose-50/50 px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-rose-600 ring-1 ring-rose-200">
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium text-slate-800">{r.nombre}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-rose-700">
                        +{r.promedio_exceso_horas}h <span className="font-normal text-rose-500">sobre SLA</span>
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {r.cant_estancados} caso{r.cant_estancados === 1 ? "" : "s"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Cumplimiento por cliente"
            subtitle="OT entregadas a tiempo vs total"
            icon={<Activity className="h-4 w-4" />}
          >
            {data.cumplimiento_cliente.length === 0 ? (
              <EmptyState message="Aún sin OT completadas para medir" />
            ) : (
              <ul className="space-y-3">
                {data.cumplimiento_cliente.map((r) => {
                  const tone = r.cumplimiento_pct >= 80 ? "emerald" : r.cumplimiento_pct >= 50 ? "amber" : "rose";
                  const toneBar = { emerald: "bg-emerald-500", amber: "bg-amber-500", rose: "bg-rose-500" }[tone];
                  const toneText = { emerald: "text-emerald-700", amber: "text-amber-700", rose: "text-rose-700" }[tone];
                  return (
                    <li key={r.cliente}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="truncate font-medium text-slate-700">{r.cliente}</span>
                        <span className={`shrink-0 font-mono tabular-nums ${toneText}`}>
                          {r.cumplimiento_pct}% <span className="text-slate-400">({r.a_tiempo}/{r.total})</span>
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${toneBar}`} style={{ width: `${r.cumplimiento_pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </section>
      </div>

      <Toaster richColors position="top-right" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Componentes auxiliares
// ═══════════════════════════════════════════════════════════════

function Panel({
  title, subtitle, icon, action, children, padded = true,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  padded?: boolean;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            {icon && <span className="text-slate-400">{icon}</span>}
            {title}
          </h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}

function HeroKpi({
  label, value, sub, icon, accent, href,
}: {
  label: string;
  value: number;
  sub: string;
  icon: React.ReactNode;
  accent: "indigo" | "emerald" | "rose" | "amber" | "slate";
  href?: string;
}) {
  const cfg = {
    indigo:  { iconBg: "bg-indigo-50 text-indigo-600 ring-indigo-100",   accentBar: "bg-indigo-500"  },
    emerald: { iconBg: "bg-emerald-50 text-emerald-600 ring-emerald-100", accentBar: "bg-emerald-500" },
    rose:    { iconBg: "bg-rose-50 text-rose-600 ring-rose-100",         accentBar: "bg-rose-500"    },
    amber:   { iconBg: "bg-amber-50 text-amber-600 ring-amber-100",      accentBar: "bg-amber-500"   },
    slate:   { iconBg: "bg-slate-100 text-slate-500 ring-slate-200",     accentBar: "bg-slate-300"   },
  }[accent];

  const inner = (
    <div className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-all hover:border-slate-300 hover:shadow-md">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${cfg.accentBar}`} />
      <div className="mb-3 flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</span>
        <div className={`flex h-7 w-7 items-center justify-center rounded-md ring-1 ${cfg.iconBg}`}>
          {icon}
        </div>
      </div>
      <p className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-[11px] leading-tight text-slate-500">{sub}</p>
      {href && (
        <ArrowUpRight className="absolute bottom-3 right-3 h-3.5 w-3.5 text-slate-300 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-slate-600" />
      )}
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}

function Donut({
  size, stroke, slices, centerValue, centerLabel,
}: {
  size: number;
  stroke: number;
  slices: { value: number; color: string }[];
  centerValue: number;
  centerLabel: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="#f1f5f9" strokeWidth={stroke}
        />
        {total > 0 && slices.map((s, i) => {
          const len = (s.value / total) * circ;
          const dash = `${len} ${circ - len}`;
          const node = (
            <circle
              key={i}
              cx={size / 2} cy={size / 2} r={radius}
              fill="none" stroke={s.color} strokeWidth={stroke}
              strokeDasharray={dash} strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += len;
          return node;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold tabular-nums tracking-tight text-slate-900">{centerValue}</span>
        <span className="text-[10px] uppercase tracking-wider text-slate-500">{centerLabel}</span>
      </div>
    </div>
  );
}

function EmptyState({ message, tone = "neutral" }: { message: string; tone?: "neutral" | "positive" }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-md border border-dashed py-6 ${tone === "positive" ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200 bg-slate-50/40"}`}>
      <p className={`text-xs ${tone === "positive" ? "text-emerald-600" : "text-slate-400"}`}>
        {tone === "positive" && "✓ "}{message}
      </p>
    </div>
  );
}
