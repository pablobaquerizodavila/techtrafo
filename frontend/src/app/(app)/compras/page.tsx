"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  AlertTriangle, ShoppingCart, FileText, PackageCheck, Users, TrendingUp, ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Panel, StatCard } from "@/components/panel";
import {
  AlertaStock, ComprasKPIs, generarSCDesdeAlertas, getAlertasStock, getComprasKPIs, fmtMoneda,
} from "@/lib/compras";
import { ApiError } from "@/lib/api";

const ALERTA_BADGE: Record<string, "destructive" | "warning" | "muted"> = {
  sin_stock: "destructive",
  bajo_minimo: "warning",
  bajo_reorden: "warning",
};
const ALERTA_LABEL: Record<string, string> = {
  sin_stock: "Sin stock",
  bajo_minimo: "Bajo mínimo",
  bajo_reorden: "Bajo punto reorden",
};

export default function ComprasDashboardPage() {
  const [kpis, setKpis] = useState<ComprasKPIs | null>(null);
  const [alertas, setAlertas] = useState<AlertaStock[]>([]);
  const [seleccion, setSeleccion] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [generando, setGenerando] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [k, a] = await Promise.all([getComprasKPIs(), getAlertasStock()]);
      setKpis(k.data);
      setAlertas(a.data);
    } catch (err) {
      toast.error(err instanceof ApiError ? `Error ${err.status}` : "Error cargando dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggleItem(id: number) {
    setSeleccion((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  }

  async function handleGenerarSC() {
    if (seleccion.length === 0) { toast.warning("Seleccioná al menos un item"); return; }
    setGenerando(true);
    try {
      const res = await generarSCDesdeAlertas(seleccion);
      const codigo = (res as { data?: { codigo?: string } }).data?.codigo;
      toast.success(`Solicitud ${codigo ?? "creada"} en borrador`);
      setSeleccion([]);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error");
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { label: "Compras" }]}
        title="Compras"
        titleAccent="dashboard"
        meta={<span>Flujo: solicitud → orden de compra → recepción → bodega</span>}
        liveIndicator={kpis && kpis.alertas_stock > 0 ? { label: "alertas", tone: "copper" } : undefined}
      />

      <div className="space-y-6 pt-6">
        {/* KPIs grid */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
          <StatCard
            label="OCs abiertas"
            value={kpis?.ocs_abiertas ?? "—"}
            sub={kpis?.ocs_retrasadas ? `${kpis.ocs_retrasadas} retrasadas` : "Sin retrasos"}
            icon={<ShoppingCart className="h-3.5 w-3.5" />}
            tone={kpis?.ocs_retrasadas ? "amber" : "copper"}
          />
          <StatCard
            label="Solicitudes pendientes"
            value={kpis?.solicitudes_pendientes_aprobacion ?? "—"}
            sub="Por aprobar"
            icon={<FileText className="h-3.5 w-3.5" />}
            tone={kpis && kpis.solicitudes_pendientes_aprobacion > 0 ? "amber" : "default"}
          />
          <StatCard
            label="Recepciones pendientes"
            value={kpis?.recepciones_pendientes ?? "—"}
            sub="En borrador"
            icon={<PackageCheck className="h-3.5 w-3.5" />}
            tone={kpis && kpis.recepciones_pendientes > 0 ? "teal" : "default"}
          />
          <StatCard
            label="Alertas de stock"
            value={kpis?.alertas_stock ?? "—"}
            sub={kpis && kpis.alertas_stock > 0 ? "Items bajo reorden" : "Bodega en orden"}
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
            tone={kpis && kpis.alertas_stock > 0 ? "rose" : "default"}
          />
          <StatCard
            label="Proveedores activos"
            value={kpis?.proveedores_activos ?? "—"}
            sub="Catálogo vigente"
            icon={<Users className="h-3.5 w-3.5" />}
          />
        </section>

        {/* Comprado en el mes */}
        <Panel title="Comprado este mes" subtitle="Suma de OCs emitidas · excluye canceladas y rechazadas" icon={<TrendingUp className="h-3.5 w-3.5" />}>
          <p className="font-display text-4xl font-semibold tabular-nums tracking-tight text-copper text-glow-copper">
            {fmtMoneda(kpis?.total_comprado_mes)}
          </p>
        </Panel>

        {/* Alertas de stock */}
        <Panel
          title="Alertas de stock"
          subtitle="Items con stock por debajo de su punto de reorden"
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          padded={false}
          action={
            seleccion.length > 0 && (
              <button type="button" onClick={handleGenerarSC} disabled={generando}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-3 py-1.5 text-xs font-medium text-white glow-copper-sm inset-highlight-md transition hover:glow-copper disabled:opacity-60">
                {generando ? "Generando…" : `Generar SC con ${seleccion.length} items`}
              </button>
            )
          }
        >
          <Table>
            <TableHeader>
              <TableRow className="border-glass bg-glass hover:bg-glass">
                <TableHead className="w-8"></TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Item</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Stock</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Reorden</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Máximo</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Sugerido</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Alerta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Cargando…</TableCell></TableRow>
              ) : alertas.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-10 text-center">
                  <div className="flex flex-col items-center gap-2 text-green-300">
                    <PackageCheck className="h-5 w-5 text-green-400" />
                    <span className="text-sm">✓ Ningún item en alerta · bodega en orden</span>
                  </div>
                </TableCell></TableRow>
              ) : (
                alertas.map((a) => (
                  <TableRow key={a.item_id} className="border-glass hover:bg-glass">
                    <TableCell>
                      <input type="checkbox" checked={seleccion.includes(a.item_id)} onChange={() => toggleItem(a.item_id)} className="h-3.5 w-3.5 accent-copper" />
                    </TableCell>
                    <TableCell>
                      <p className="font-mono text-[10.5px] text-muted-foreground">{a.codigo_interno}</p>
                      <p className="text-sm">{a.nombre}</p>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold tabular-nums text-rose-300">
                      {a.stock_total} <span className="text-[10px] text-muted-foreground">{a.unidad_medida}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-foreground/80">{a.punto_reorden}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-foreground/80">{a.stock_maximo}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold tabular-nums text-copper">{a.cantidad_sugerida_reposicion}</TableCell>
                    <TableCell>
                      <Badge variant={ALERTA_BADGE[a.nivel_alerta] ?? "muted"}>
                        {ALERTA_LABEL[a.nivel_alerta] ?? a.nivel_alerta}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Panel>

        {/* Quick links */}
        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <QuickLink href="/compras/solicitudes" title="Solicitudes de compra" desc="SC enviadas, aprobadas, rechazadas" icon={<FileText className="h-4 w-4" />} />
          <QuickLink href="/compras/ordenes-compra" title="Órdenes de compra" desc="OCs por aprobar, enviadas, en tránsito" icon={<ShoppingCart className="h-4 w-4" />} />
          <QuickLink href="/compras/recepciones" title="Recepciones" desc="Materiales recibidos y por confirmar" icon={<PackageCheck className="h-4 w-4" />} />
        </section>
      </div>

      <Toaster richColors theme="dark" />
    </div>
  );
}

function QuickLink({ href, title, desc, icon }: { href: string; title: string; desc: string; icon: React.ReactNode }) {
  return (
    <Link href={href} className="group flex items-center justify-between rounded-xl border border-glass bg-glass p-4 inset-highlight transition hover:border-glass-mid hover:bg-glass-elev">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-lg border border-glass bg-glass-elev text-muted-foreground transition group-hover:text-copper">
          {icon}
        </div>
        <div>
          <p className="font-display text-sm font-semibold tracking-tight">{title}</p>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground/40 transition group-hover:text-copper" />
    </Link>
  );
}
