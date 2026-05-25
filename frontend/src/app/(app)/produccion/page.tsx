"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity, AlertTriangle, AlertOctagon, ArrowUpRight, BellRing,
  CheckCircle2, ChevronRight, Clock, Eye, Factory, Flag, Gauge,
  LayoutDashboard, RefreshCw, Search, Truck, Users, Zap,
} from "lucide-react";
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
  verde:    { label: "En tiempo",   dot: "bg-green-500 glow-green",   text: "text-green-300",  hex: "#22c55e", glow: "drop-shadow(0 0 6px rgba(34,197,94,0.6))"  },
  amarillo: { label: "En riesgo",   dot: "bg-amber-500",              text: "text-amber-300",  hex: "#f59e0b", glow: "none" },
  rojo:     { label: "Atrasado",    dot: "bg-rose-500 glow-rose",     text: "text-rose-300",   hex: "#ef4444", glow: "drop-shadow(0 0 8px rgba(239,68,68,0.7))"   },
  azul:     { label: "Terminado",   dot: "bg-ttteal glow-teal-sm",    text: "text-ttteal-soft",hex: "#4fd1c5", glow: "drop-shadow(0 0 6px rgba(79,209,197,0.4))" },
  gris:     { label: "No iniciado", dot: "bg-muted-foreground/60",    text: "text-muted-foreground", hex: "rgba(255,255,255,0.18)", glow: "none" },
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
      <div className="-m-8 flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-copper border-t-transparent" />
          <p className="text-sm">Cargando dashboard de producción…</p>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="-m-8 p-8">
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-200 inset-highlight">
          <p className="font-display text-base font-semibold">Error al cargar el dashboard</p>
          <p className="mt-1 text-sm text-rose-200/80">{error}</p>
        </div>
      </div>
    );
  }
  if (!data) return null;

  const totalSemaforo = data.semaforo.verde + data.semaforo.amarillo + data.semaforo.rojo + data.semaforo.azul + data.semaforo.gris;
  const otActivas = (data.kpis.ot_por_estado["en_curso"] ?? 0) + (data.kpis.ot_por_estado["planeada"] ?? 0) + (data.kpis.ot_por_estado["pausada"] ?? 0);
  const otCompletadas = data.kpis.ot_por_estado["completada"] ?? 0;
  const totalRiesgo = data.kpis.ot_urgentes_abiertas + data.kpis.ot_atrasadas + data.kpis.expedientes_estancados;
  const horaGen = new Date(data.generado_en).toLocaleTimeString("es-EC", {
    timeZone: "America/Guayaquil",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="-m-8">
      {/* ───── Header sticky ───── */}
      <header className="sticky top-0 z-20 border-b border-glass bg-background/70 px-8 py-5 backdrop-blur-xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-glass bg-glass px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">Panel</Link>
              <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
              <span className="text-foreground">Producción</span>
            </div>
            <h1 className="font-display text-4xl font-semibold tracking-tight">
              <span className="bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-transparent">Dashboard </span>
              <span className="bg-gradient-to-br from-copper to-copper-soft bg-clip-text italic text-transparent">de planta</span>
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/25 bg-green-500/[0.08] px-2.5 py-1 text-green-400">
                <span className="led-green" />
                Telemetría · 60s · {horaGen}
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span>{otActivas} OT activas · {totalRiesgo} en riesgo · {data.alertas.length} alertas</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              disabled={loading}
              className="border-glass-mid bg-glass backdrop-blur hover:bg-glass-elev"
            >
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refrescar
            </Button>
          </div>
        </div>
      </header>

      <div className="space-y-6 p-8">
        {/* ───── KPI hero ───── */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <HeroKpi
            label="OT activas"
            value={otActivas}
            sub={`${data.kpis.ot_por_estado["en_curso"] ?? 0} en curso · ${data.kpis.ot_por_estado["planeada"] ?? 0} planeadas`}
            icon={<Factory className="h-4 w-4" />}
            accent="copper"
            href="/ot"
          />
          <HeroKpi
            label="Completadas"
            value={otCompletadas}
            sub={`${data.kpis.expedientes_por_estado["ganado"] ?? 0} expedientes ganados`}
            icon={<CheckCircle2 className="h-4 w-4" />}
            accent="green"
          />
          <HeroKpi
            label="OT en riesgo"
            value={totalRiesgo}
            sub={`${data.kpis.ot_urgentes_abiertas} urgentes · ${data.kpis.ot_atrasadas} atrasadas · ${data.kpis.expedientes_estancados} estancados`}
            icon={<AlertOctagon className="h-4 w-4" />}
            accent={totalRiesgo > 0 ? "rose" : "muted"}
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

        {/* ───── Donut + Próximas entregas + Alertas ───── */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Donut */}
          <Panel
            title="Estado del pipeline"
            subtitle={`${totalSemaforo} fases activas`}
            icon={<Gauge className="h-3.5 w-3.5" />}
          >
            <div className="flex items-center gap-6">
              <Donut
                size={148}
                stroke={18}
                slices={(["verde", "amarillo", "rojo", "azul", "gris"] as const)
                  .map((k) => ({ value: data.semaforo[k], color: SEMAFORO_CFG[k].hex, glow: SEMAFORO_CFG[k].glow }))
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
                    <li key={c} className="flex items-center gap-2.5 border-b border-glass pb-2 last:border-b-0 last:pb-0">
                      <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                      <span className="flex-1 text-xs text-muted-foreground">{cfg.label}</span>
                      <span className="font-mono text-xs font-semibold tabular-nums">{n}</span>
                      <span className="w-9 text-right font-mono text-[10px] text-muted-foreground/70 tabular-nums">{pct}%</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Panel>

          {/* Próximas entregas */}
          <Panel
            title="Próximas entregas"
            subtitle="7 días"
            icon={<Truck className="h-3.5 w-3.5" />}
            action={data.proximas_entregas.length > 0 && (
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {data.proximas_entregas.length} OT
              </span>
            )}
          >
            {data.proximas_entregas.length === 0 ? (
              <EmptyState message="Sin entregas planeadas en los próximos 7 días" />
            ) : (
              <ul className="space-y-2">
                {data.proximas_entregas.slice(0, 6).map((e) => {
                  const dias = e.dias_para;
                  const urg = dias !== null && dias <= 2;
                  return (
                    <li key={e.id}>
                      <Link
                        href={`/ot/${e.id}`}
                        className="group flex items-center gap-3 rounded-lg border border-glass bg-glass px-2.5 py-2 transition hover:border-glass-mid hover:bg-glass-elev"
                      >
                        <div className={`flex h-9 w-12 flex-col items-center justify-center rounded-md border text-center ${urg ? "border-rose-500/40 bg-rose-500/10" : "border-glass-mid bg-glass-elev"}`}>
                          <span className={`font-mono text-[9px] font-medium uppercase leading-none ${urg ? "text-rose-300" : "text-muted-foreground"}`}>
                            {dias === 0 ? "Hoy" : dias === 1 ? "Mañ." : "d"}
                          </span>
                          <span className={`font-display text-sm font-bold leading-tight tabular-nums ${urg ? "text-rose-400" : "text-foreground"}`}>
                            {dias === 0 || dias === 1 ? "" : dias}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{e.cliente ?? "Sin cliente"}</p>
                          <p className="truncate font-mono text-xs text-muted-foreground">{e.codigo}</p>
                        </div>
                        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/40 transition group-hover:text-copper" />
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
            icon={<BellRing className="h-3.5 w-3.5" />}
            action={data.alertas.length > 0 && (
              <span className="inline-flex items-center rounded-full border border-rose-500/30 bg-rose-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-rose-300 num">
                {data.alertas.length}
              </span>
            )}
          >
            {data.alertas.length === 0 ? (
              <EmptyState message="Sin alertas activas — sistema saludable" tone="positive" />
            ) : (
              <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1 scroll-discreet">
                {data.alertas.map((a) => {
                  const sevCfg =
                    a.severidad === "alta"  ? { dot: "bg-rose-500 glow-rose",  text: "text-rose-300",  border: "border-l-rose-500"  } :
                    a.severidad === "media" ? { dot: "bg-amber-500",           text: "text-amber-300", border: "border-l-amber-500" } :
                                              { dot: "bg-ttteal glow-teal-sm", text: "text-ttteal-soft", border: "border-l-ttteal" };
                  return (
                    <li key={a.id} className={`flex items-start gap-2 rounded-md border-l-2 ${sevCfg.border} bg-glass px-3 py-2`}>
                      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${sevCfg.dot}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs leading-snug text-foreground/90">{a.mensaje}</p>
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

        {/* ───── Matriz ───── */}
        <Panel
          title="Matriz de seguimiento"
          subtitle={`${matrizFiltrada.length} de ${data.matriz.length} órdenes y expedientes`}
          icon={<LayoutDashboard className="h-3.5 w-3.5" />}
          padded={false}
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-glass px-5 py-3">
            <div className="relative flex-1 min-w-[14rem]">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-8 border-glass bg-glass pl-8 text-sm focus:border-glass-strong"
                placeholder="Buscar código, cliente, responsable…"
                value={filtroBusq}
                onChange={(e) => setFiltroBusq(e.target.value)}
              />
            </div>
            <Select value={filtroOrigen || "_"} onValueChange={(v) => setFiltroOrigen(v === "_" ? "" : v)}>
              <SelectTrigger className="h-8 w-32 border-glass bg-glass text-xs"><SelectValue placeholder="Origen" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">OT + Exp</SelectItem>
                <SelectItem value="ot">Solo OT</SelectItem>
                <SelectItem value="expediente">Solo Exp.</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroTipo || "_"} onValueChange={(v) => setFiltroTipo(v === "_" ? "" : v)}>
              <SelectTrigger className="h-8 w-36 border-glass bg-glass text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">Todos los tipos</SelectItem>
                <SelectItem value="reparacion">Reparación</SelectItem>
                <SelectItem value="fabricacion">Fabricación</SelectItem>
                <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroSemaforo || "_"} onValueChange={(v) => setFiltroSemaforo(v === "_" ? "" : v)}>
              <SelectTrigger className="h-8 w-32 border-glass bg-glass text-xs"><SelectValue placeholder="Semáforo" /></SelectTrigger>
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
                <TableRow className="border-glass bg-glass hover:bg-glass">
                  <TableHead className="w-2"></TableHead>
                  <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Origen</TableHead>
                  <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Código</TableHead>
                  <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Cliente</TableHead>
                  <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Tipo · Capacidad</TableHead>
                  <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Fase actual</TableHead>
                  <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Avance</TableHead>
                  <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Compromiso</TableHead>
                  <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Responsable</TableHead>
                  <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Estado</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matrizFiltrada.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="py-10 text-center text-sm text-muted-foreground">
                      Sin órdenes activas con esos filtros
                    </TableCell>
                  </TableRow>
                ) : matrizFiltrada.map((m) => {
                  const cfg = SEMAFORO_CFG[m.semaforo as SemaforoKey];
                  const capacidadFmt = m.capacidad_kva
                    ? m.capacidad_kva >= 1000 ? `${(m.capacidad_kva / 1000).toFixed(1)} MVA` : `${m.capacidad_kva} kVA`
                    : null;
                  return (
                    <TableRow key={`${m.origen}-${m.id}`} className="border-glass group hover:bg-glass">
                      <TableCell><span className={`block h-2 w-2 rounded-full ${cfg.dot}`} title={cfg.label} /></TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${m.origen === "ot" ? "border border-copper/30 bg-copper/10 text-copper" : "border border-ttteal/30 bg-ttteal/10 text-ttteal"}`}>
                          {m.origen === "ot" ? "OT" : "EXP"}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs font-medium text-foreground/90">{m.codigo ?? "—"}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm text-foreground/85" title={m.cliente ?? undefined}>{m.cliente ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        <span className="capitalize text-foreground/75">{m.tipo}</span>
                        {capacidadFmt && <span className="ml-1.5 font-mono text-ttteal">· {capacidadFmt}</span>}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate text-xs text-muted-foreground">{m.fase_actual ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-glass-elev">
                            <div
                              className={`h-full rounded-full transition-all ${m.avance_pct >= 80 ? "bg-green-500" : m.avance_pct >= 40 ? "bg-gradient-to-r from-ttteal to-copper" : "bg-muted-foreground/50"}`}
                              style={{ width: `${m.avance_pct}%` }}
                            />
                          </div>
                          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{m.avance_pct}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {m.fecha_compromiso ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground">{m.fecha_compromiso.split("T")[0]}</span>
                            {m.dias_diff !== null && (
                              <span className={`rounded px-1 py-0.5 text-[10px] tabular-nums ${m.dias_diff < 0 ? "bg-rose-500/15 text-rose-300" : m.dias_diff <= 3 ? "bg-amber-500/15 text-amber-300" : "text-muted-foreground/50"}`}>
                                {m.dias_diff >= 0 ? "+" : ""}{m.dias_diff}d
                              </span>
                            )}
                          </div>
                        ) : <span className="text-muted-foreground/50">—</span>}
                      </TableCell>
                      <TableCell className="max-w-[140px] truncate text-xs text-muted-foreground">{m.responsable ?? "—"}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center rounded-full border border-glass bg-glass-elev px-2 py-0.5 font-mono text-[10px] font-medium capitalize text-muted-foreground">
                          {m.estado.replaceAll("_", " ")}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={m.origen === "ot" ? `/ot/${m.id}` : `/expedientes/${m.id}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-glass-elev hover:text-copper"
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

        {/* ───── Capacidad / Causas / Productividad ───── */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Capacidad */}
          <Panel
            title="Capacidad de planta"
            subtitle="Carga actual por área productiva"
            icon={<Gauge className="h-3.5 w-3.5" />}
          >
            {data.capacidad_planta.por_area.length === 0 ? (
              <EmptyState message="Sin áreas registradas" />
            ) : (
              <ul className="space-y-3">
                {data.capacidad_planta.por_area.map((a) => {
                  const tone = a.carga_pct >= 85 ? "rose" : a.carga_pct >= 65 ? "amber" : "green";
                  const toneCfg = {
                    rose:  { bar: "bg-gradient-to-r from-amber-500 to-rose-500", text: "text-rose-300",  bg: "bg-rose-500/15"  },
                    amber: { bar: "bg-amber-500",                                text: "text-amber-300", bg: "bg-amber-500/15" },
                    green: { bar: "bg-green-500",                                text: "text-green-300", bg: "bg-green-500/15" },
                  }[tone];
                  return (
                    <li key={a.codigo}>
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 font-medium text-foreground/90">
                          <span className="h-2 w-2 rounded-full" style={{ background: a.color_hex }} />
                          {a.area}
                        </span>
                        <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] tabular-nums ${toneCfg.bg} ${toneCfg.text}`}>
                          {a.carga_pct}%
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-glass-elev">
                        <div className={`h-full rounded-full ${toneCfg.bar}`} style={{ width: `${a.carga_pct}%` }} />
                      </div>
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                        {a.ot_activas} activas · {a.completados_mes} completadas este mes
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-4 border-t border-glass pt-3 font-mono text-[10px] italic text-muted-foreground/70">
              Capacidad nominal: 5 pasos simultáneos por área
            </p>
          </Panel>

          {/* Causas */}
          <Panel
            title="Causas de demora"
            subtitle="Ranking por impacto en días perdidos"
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
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
                        <span className="flex min-w-0 items-center gap-2 text-foreground/90">
                          <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-glass-elev font-mono text-[10px] font-bold text-muted-foreground">
                            {i + 1}
                          </span>
                          <span className="truncate font-medium">{c.causa}</span>
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                          {c.dias_perdidos}d · {c.incidencias}×
                        </span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-glass-elev">
                        <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-copper" style={{ width: `${widthPct}%` }} />
                      </div>
                      {c.abiertas > 0 && (
                        <p className="font-mono text-[10px] text-rose-300">
                          ⚠ {c.abiertas} incidencia{c.abiertas === 1 ? "" : "s"} sin resolver
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          {/* Productividad */}
          <Panel
            title="Productividad 30d"
            subtitle="Horas registradas y OT intervenidas"
            icon={<Users className="h-3.5 w-3.5" />}
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
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-glass-mid bg-gradient-to-br from-copper/15 to-ttteal/15 font-display text-[11px] font-bold text-foreground inset-highlight">
                        {iniciales}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-0.5 flex items-baseline justify-between gap-2">
                          <span className="truncate text-xs font-medium">{r.nombre}</span>
                          <span className="shrink-0 font-display text-base font-semibold tabular-nums text-copper text-glow-copper">
                            {r.horas_mes.toFixed(0)}<span className="text-[10px] text-muted-foreground font-normal">h</span>
                          </span>
                        </div>
                        <div className="h-1 overflow-hidden rounded-full bg-glass-elev">
                          <div className="h-full rounded-full bg-copper" style={{ width: `${widthPct}%` }} />
                        </div>
                        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
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
            subtitle="Top 5 cuellos de botella"
            icon={<Clock className="h-3.5 w-3.5" />}
          >
            {data.ranking_fases_demora.length === 0 ? (
              <EmptyState message="Sin fases estancadas detectadas" tone="positive" />
            ) : (
              <ul className="space-y-2">
                {data.ranking_fases_demora.map((r, i) => (
                  <li key={r.codigo} className="flex items-center justify-between rounded-lg border border-rose-500/20 bg-rose-500/[0.05] px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="grid h-6 w-6 place-items-center rounded-full border border-rose-500/30 bg-rose-500/10 font-mono text-xs font-bold text-rose-300">
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium text-foreground/90">{r.nombre}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-xs font-semibold text-rose-300">
                        +{r.promedio_exceso_horas}h <span className="font-normal text-rose-300/70">sobre SLA</span>
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground">
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
            icon={<Activity className="h-3.5 w-3.5" />}
          >
            {data.cumplimiento_cliente.length === 0 ? (
              <EmptyState message="Aún sin OT completadas para medir" />
            ) : (
              <ul className="space-y-3">
                {data.cumplimiento_cliente.map((r) => {
                  const tone = r.cumplimiento_pct >= 80 ? "green" : r.cumplimiento_pct >= 50 ? "amber" : "rose";
                  const toneBar = { green: "bg-green-500", amber: "bg-amber-500", rose: "bg-rose-500" }[tone];
                  const toneText = { green: "text-green-300", amber: "text-amber-300", rose: "text-rose-300" }[tone];
                  return (
                    <li key={r.cliente}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="truncate font-medium text-foreground/90">{r.cliente}</span>
                        <span className={`shrink-0 font-mono tabular-nums ${toneText}`}>
                          {r.cumplimiento_pct}% <span className="text-muted-foreground/60">({r.a_tiempo}/{r.total})</span>
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-glass-elev">
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

      <Toaster richColors position="top-right" theme="dark" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Componentes
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
    <section className="overflow-hidden rounded-xl border border-glass bg-glass inset-highlight">
      <div className="flex items-start justify-between gap-3 border-b border-glass px-5 py-3.5">
        <div>
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold tracking-tight">
            {icon && <span className="text-copper">{icon}</span>}
            {title}
          </h3>
          {subtitle && <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{subtitle}</p>}
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
  accent: "copper" | "green" | "rose" | "amber" | "muted";
  href?: string;
}) {
  const cfg = {
    copper: { iconBg: "bg-copper/10 text-copper border-copper/25",       accent: "bg-gradient-to-r from-copper to-copper-soft", val: "text-foreground" },
    green:  { iconBg: "bg-green-500/10 text-green-400 border-green-500/25", accent: "bg-green-500", val: "text-foreground" },
    rose:   { iconBg: "bg-rose-500/10 text-rose-400 border-rose-500/25", accent: "bg-rose-500 glow-rose", val: "text-rose-400 text-glow-rose" },
    amber:  { iconBg: "bg-amber-500/10 text-amber-400 border-amber-500/22", accent: "bg-amber-500", val: "text-foreground" },
    muted:  { iconBg: "bg-glass text-muted-foreground border-glass",     accent: "bg-muted-foreground/30", val: "text-foreground" },
  }[accent];

  const inner = (
    <div className="group relative overflow-hidden rounded-xl border border-glass bg-glass p-4 inset-highlight transition-all hover:-translate-y-px hover:border-glass-mid hover:bg-glass-elev">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${cfg.accent}`} />
      <div className="mb-3 flex items-start justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{label}</span>
        <div className={`grid h-7 w-7 place-items-center rounded-md border ${cfg.iconBg}`}>
          {icon}
        </div>
      </div>
      <p className={`font-display text-3xl font-semibold tabular-nums tracking-tight ${cfg.val}`}>{value}</p>
      <p className="mt-1 font-mono text-[10.5px] leading-tight text-muted-foreground">{sub}</p>
      {href && (
        <ArrowUpRight className="absolute bottom-3 right-3 h-3.5 w-3.5 text-muted-foreground/30 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-copper" />
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
  slices: { value: number; color: string; glow: string }[];
  centerValue: number;
  centerLabel: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size, filter: "drop-shadow(0 4px 20px rgba(0,0,0,0.4))" }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke}
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
              style={{ filter: s.glow }}
            />
          );
          offset += len;
          return node;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-3xl font-semibold tabular-nums tracking-tight bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-transparent">{centerValue}</span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{centerLabel}</span>
      </div>
    </div>
  );
}

function EmptyState({ message, tone = "neutral" }: { message: string; tone?: "neutral" | "positive" }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-md border border-dashed py-6 ${tone === "positive" ? "border-green-500/25 bg-green-500/[0.04]" : "border-glass bg-glass"}`}>
      <p className={`text-xs ${tone === "positive" ? "text-green-300" : "text-muted-foreground"}`}>
        {tone === "positive" && "✓ "}{message}
      </p>
    </div>
  );
}
