"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Package, Warehouse, ArrowLeftRight, AlertTriangle, ChevronRight, Boxes } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { Panel, StatCard } from "@/components/panel";
import { getAlertas, listItems, listMovimientos, listStock } from "@/lib/inventario";

interface Resumen {
  items_activos: number;
  total_movimientos_mes: number;
  stock_filas: number;
  alertas_reorden: number;
  alertas_vencer: number;
}

export default function InventarioHubPage() {
  const [resumen, setResumen] = useState<Resumen | null>(null);

  useEffect(() => {
    Promise.all([
      listItems({ limit: 1, estado: "activo" }),
      listMovimientos({ limit: 1 }),
      listStock({}),
      getAlertas(),
    ]).then(([items, movs, stock, alertas]) => {
      setResumen({
        items_activos: items.pagination.total,
        total_movimientos_mes: movs.pagination.total,
        stock_filas: stock.data.length,
        alertas_reorden: alertas.data.stock_bajo_reorden.length,
        alertas_vencer: alertas.data.lotes_por_vencer.length,
      });
    }).catch(() => setResumen({ items_activos: 0, total_movimientos_mes: 0, stock_filas: 0, alertas_reorden: 0, alertas_vencer: 0 }));
  }, []);

  const cards: Array<{ href: string; title: string; desc: string; icon: typeof Package; badge: number | undefined; tone: "copper" | "teal" | "default" }> = [
    { href: "/inventario/items", title: "Items", desc: "Catálogo maestro · insumos, componentes, productos", icon: Package, badge: resumen?.items_activos, tone: "copper" },
    { href: "/inventario/stock", title: "Stock actual", desc: "Inventario por ubicación con alertas", icon: Warehouse, badge: resumen?.stock_filas, tone: "teal" },
    { href: "/inventario/movimientos", title: "Movimientos", desc: "Entradas, salidas, transferencias y ajustes", icon: ArrowLeftRight, badge: resumen?.total_movimientos_mes, tone: "default" },
  ];

  const hayAlertas = resumen && (resumen.alertas_reorden > 0 || resumen.alertas_vencer > 0);

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { label: "Bodega" }]}
        title="Bodega"
        titleAccent="e inventario"
        meta={<span>Gestión de inventario · lotes, movimientos y trazabilidad</span>}
        liveIndicator={hayAlertas ? { label: "alertas", tone: "copper" } : undefined}
      />

      <div className="space-y-6 pt-6">
        {/* Alertas destacadas */}
        {hayAlertas && (
          <Panel
            title="Atención requerida"
            subtitle="Items que necesitan acción"
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
          >
            <div className="flex flex-wrap gap-3 text-sm">
              {resumen!.alertas_reorden > 0 && (
                <Link href="/inventario/stock" className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.05] px-3 py-1.5 text-amber-200 transition hover:bg-amber-500/10">
                  <Badge variant="warning">{resumen!.alertas_reorden}</Badge>
                  <span>items bajo punto de reorden</span>
                </Link>
              )}
              {resumen!.alertas_vencer > 0 && (
                <Link href="/inventario/stock" className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/[0.05] px-3 py-1.5 text-rose-200 transition hover:bg-rose-500/10">
                  <Badge variant="destructive">{resumen!.alertas_vencer}</Badge>
                  <span>lotes por vencer (90d)</span>
                </Link>
              )}
            </div>
          </Panel>
        )}

        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {cards.map((c) => (
            <Link key={c.href} href={c.href} className="group">
              <StatCard
                label={c.title}
                value={c.badge ?? "—"}
                sub={c.desc}
                icon={<c.icon className="h-3.5 w-3.5" />}
                tone={c.tone}
              />
            </Link>
          ))}
        </section>

        <Panel title="Acerca de Bodega" icon={<Boxes className="h-3.5 w-3.5" />}>
          <p className="text-sm text-muted-foreground">
            Bodega gestiona el catálogo de items, su stock por ubicación con soporte de lotes y series,
            y registra todos los movimientos (entradas por recepción de OC, salidas por OT, transferencias y ajustes).
            Las alertas de stock alimentan el módulo de Compras para generar Solicitudes de Compra automáticamente.
          </p>
        </Panel>
      </div>
    </div>
  );
}
