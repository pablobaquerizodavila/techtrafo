"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Wallet, Coins, AlertTriangle, TrendingUp, RefreshCw, FileSignature, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Panel, StatCard } from "@/components/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  ResumenFinanzas, getResumenFinanzas, fmtMoneda, rangoPeriodo,
} from "@/lib/finanzas";
import { IngresosBar, CarteraPie, CobrosLine } from "@/components/finanzas/charts";
import { ApiError } from "@/lib/api";

type Periodo = "mes" | "anio" | "todo";
const PERIODO_LABEL: Record<Periodo, string> = { mes: "Este mes", anio: "Este año", todo: "Histórico" };

const ESTADO_BADGE: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  pagado: "success", parcial: "warning", pendiente: "muted", vencido: "destructive", cancelado: "muted",
};

export default function FinanzasResumenPage() {
  const [periodo, setPeriodo] = useState<Periodo>("anio");
  const [data, setData] = useState<ResumenFinanzas | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: Periodo, isAuto = false) => {
    if (!isAuto) setLoading(true);
    setRefreshing(true);
    try {
      const res = await getResumenFinanzas(rangoPeriodo(p));
      setData(res.data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 403 ? "No tenés permiso para ver finanzas." : `Error ${err.status}`) : "No se pudo cargar");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(periodo);
    const t = setInterval(() => load(periodo, true), 60_000);
    return () => clearInterval(t);
  }, [periodo, load]);

  const t = data?.totales;
  const pvc = data?.pagos_vs_cotizaciones;
  const maxPvc = pvc ? Math.max(pvc.cotizado_aprobado, pvc.contratado, pvc.cobrado, 1) : 1;

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { label: "Finanzas" }]}
        title="Finanzas"
        titleAccent="resumen"
        meta={<span>Ingresos, cartera y cobros en tiempo real · auto-refresh 60s</span>}
        actions={
          <div className="flex items-center gap-1.5">
            {(["mes", "anio", "todo"] as Periodo[]).map((p) => (
              <button key={p} type="button" onClick={() => setPeriodo(p)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${periodo === p ? "border-copper/50 bg-copper/15 text-copper" : "border-glass bg-glass text-muted-foreground hover:bg-glass-elev"}`}>
                {PERIODO_LABEL[p]}
              </button>
            ))}
            <button type="button" onClick={() => load(periodo)} disabled={refreshing}
              className="ml-1 inline-flex items-center gap-1 rounded-md border border-glass bg-glass px-2 py-1 text-xs text-muted-foreground hover:bg-glass-elev disabled:opacity-50">
              <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        }
      />

      <div className="space-y-6 pt-6">
        {error ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-sm text-rose-200">{error}</div>
        ) : loading && !data ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Cargando finanzas…</div>
        ) : (
          <>
            {/* KPIs */}
            <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
              <StatCard label="Contratado" value={fmtMoneda(t?.contratado)} sub="Firmado en el período" tone="copper" icon={<FileSignature className="h-3.5 w-3.5" />} />
              <StatCard label="Cobrado" value={fmtMoneda(t?.cobrado)} sub="Entró a caja en el período" tone="green" icon={<Coins className="h-3.5 w-3.5" />} />
              <StatCard label="Por cobrar" value={fmtMoneda(t?.por_cobrar)} sub="Saldo pendiente actual" tone="amber" icon={<Wallet className="h-3.5 w-3.5" />} />
              <StatCard label="Cartera vencida" value={fmtMoneda(t?.cartera_vencida)} sub="Pasó la fecha esperada" tone="rose" icon={<AlertTriangle className="h-3.5 w-3.5" />} />
              <StatCard label="Anticipos" value={fmtMoneda(t?.anticipos_cobrados)} sub="Cobrados en el período" tone="teal" icon={<TrendingUp className="h-3.5 w-3.5" />} />
            </section>

            {/* Gráficos */}
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Panel title="Ingresos por tipo de orden" subtitle="Contratado · cobrado · por cobrar (acumulado)" className="lg:col-span-2">
                {data && <IngresosBar data={data.por_tipo} />}
              </Panel>
              <Panel title="Cartera vencida por antigüedad" subtitle="Distribución por días de mora">
                {data && <CarteraPie data={data.cartera_aging} />}
              </Panel>
              <Panel title="Tendencia de cobros" subtitle="Últimos 12 meses">
                {data && <CobrosLine data={data.tendencia_cobros} />}
              </Panel>
            </section>

            {/* Pagos vs Cotizaciones */}
            <Panel title="Pagos vs Cotizaciones" subtitle="Embudo comercial → financiero del período">
              <div className="space-y-3">
                {([
                  { label: "Cotizado aprobado", val: pvc?.cotizado_aprobado ?? 0, color: "bg-ttteal" },
                  { label: "Contratado", val: pvc?.contratado ?? 0, color: "bg-copper" },
                  { label: "Cobrado", val: pvc?.cobrado ?? 0, color: "bg-green-500" },
                ]).map((b) => (
                  <div key={b.label}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{b.label}</span>
                      <span className="font-mono font-semibold text-foreground">{fmtMoneda(b.val)}</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-glass-elev">
                      <div className={`h-full rounded-full ${b.color} transition-all`} style={{ width: `${Math.max(2, (b.val / maxPvc) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            {/* Estado de cobros + quick links */}
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Panel title="Estado de cobros" subtitle="Cuotas por estado" padded={false}>
                <Table>
                  <TableHeader>
                    <TableRow className="border-glass bg-glass hover:bg-glass">
                      <TableHead className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Estado</TableHead>
                      <TableHead className="w-20 text-right font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Cuotas</TableHead>
                      <TableHead className="w-32 text-right font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.por_estado_pago ?? []).length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">Sin cuotas registradas</TableCell></TableRow>
                    ) : data?.por_estado_pago.map((e) => (
                      <TableRow key={e.estado} className="border-glass hover:bg-glass">
                        <TableCell><Badge variant={ESTADO_BADGE[e.estado] ?? "muted"} className="capitalize">{e.estado}</Badge></TableCell>
                        <TableCell className="text-right font-mono text-sm">{e.cantidad}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmtMoneda(e.monto)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Panel>

              <Panel title="Ver en detalle" subtitle="Listados filtrables">
                <div className="space-y-2">
                  <QuickLink href="/finanzas/cartera" icon={<AlertTriangle className="h-4 w-4 text-rose-400" />} title="Cartera vencida" sub={`${fmtMoneda(t?.cartera_vencida)} en mora`} />
                  <QuickLink href="/finanzas/cobros" icon={<Coins className="h-4 w-4 text-green-400" />} title="Cobros registrados" sub="Pagos recibidos, filtrables por fecha" />
                </div>
              </Panel>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function QuickLink({ href, icon, title, sub }: { href: string; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-lg border border-glass bg-glass-elev px-3 py-2.5 transition hover:border-glass-mid hover:bg-glass">
      <div className="grid h-9 w-9 place-items-center rounded-md border border-glass bg-glass">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
