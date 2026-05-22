"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Package, Warehouse, ArrowLeftRight, AlertTriangle, ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

  const cards = [
    { href: "/inventario/items", title: "Items", desc: "Catalogo maestro (insumos, componentes, productos)", icon: Package, badge: resumen?.items_activos },
    { href: "/inventario/stock", title: "Stock actual", desc: "Inventario por ubicacion con alertas", icon: Warehouse, badge: resumen?.stock_filas },
    { href: "/inventario/movimientos", title: "Movimientos", desc: "Entradas, salidas, transferencias y ajustes", icon: ArrowLeftRight, badge: resumen?.total_movimientos_mes },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-3xl font-bold">Bodega</h2>
        <p className="text-muted-foreground">Gestion de inventario, lotes, movimientos y trazabilidad</p>
      </header>

      {/* Alertas destacadas */}
      {resumen && (resumen.alertas_reorden > 0 || resumen.alertas_vencer > 0) && (
        <Card className="border-orange-200 bg-orange-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center text-base">
              <AlertTriangle className="mr-2 h-4 w-4 text-orange-600" />
              Atencion requerida
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 text-sm">
              {resumen.alertas_reorden > 0 && (
                <Link href="/inventario/stock" className="hover:underline">
                  <Badge variant="warning">{resumen.alertas_reorden}</Badge> items bajo punto de reorden
                </Link>
              )}
              {resumen.alertas_vencer > 0 && (
                <Link href="/inventario/stock" className="hover:underline">
                  <Badge variant="destructive">{resumen.alertas_vencer}</Badge> lotes por vencer (90d)
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {cards.map(({ href, title, desc, icon: Icon, badge }) => (
          <Link key={href} href={href}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-lg">
                  <span className="flex items-center"><Icon className="mr-2 h-5 w-5" /> {title}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardTitle>
                <CardDescription>{desc}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{badge ?? "—"}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
