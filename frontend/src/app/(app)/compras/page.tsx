"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  AlertTriangle, ShoppingCart, FileText, PackageCheck, Users, TrendingUp, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import {
  AlertaStock, ComprasKPIs, generarSCDesdeAlertas, getAlertasStock, getComprasKPIs, fmtMoneda,
} from "@/lib/compras";
import { ApiError } from "@/lib/api";

const ALERTA_LABEL: Record<string, { label: string; cls: string }> = {
  sin_stock: { label: "Sin stock", cls: "bg-red-100 text-red-800" },
  bajo_minimo: { label: "Bajo mínimo", cls: "bg-amber-100 text-amber-800" },
  bajo_reorden: { label: "Bajo punto reorden", cls: "bg-yellow-100 text-yellow-800" },
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
    if (seleccion.length === 0) {
      toast.warning("Selecciona al menos un item");
      return;
    }
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
    <div className="space-y-6">
      <Toaster richColors />
      <div>
        <h1 className="text-2xl font-bold">Compras</h1>
        <p className="text-sm text-muted-foreground">
          Resumen operativo del módulo de compras. Flujo: solicitud → orden de compra → recepción → bodega.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          label="OCs abiertas"
          value={kpis?.ocs_abiertas ?? "—"}
          extra={kpis?.ocs_retrasadas ? `${kpis.ocs_retrasadas} retrasadas` : undefined}
          href="/compras/ordenes-compra?estado=enviada"
          icon={<ShoppingCart className="h-5 w-5" />}
          tone="indigo"
        />
        <KpiCard
          label="Solicitudes por aprobar"
          value={kpis?.solicitudes_pendientes_aprobacion ?? "—"}
          href="/compras/solicitudes?estado=enviada"
          icon={<FileText className="h-5 w-5" />}
          tone="amber"
        />
        <KpiCard
          label="Recepciones pendientes"
          value={kpis?.recepciones_pendientes ?? "—"}
          href="/compras/recepciones?estado=borrador"
          icon={<PackageCheck className="h-5 w-5" />}
          tone="purple"
        />
        <KpiCard
          label="Alertas de stock"
          value={kpis?.alertas_stock ?? "—"}
          href="#alertas"
          icon={<AlertTriangle className="h-5 w-5" />}
          tone={kpis && kpis.alertas_stock > 0 ? "red" : "gray"}
        />
        <KpiCard
          label="Proveedores activos"
          value={kpis?.proveedores_activos ?? "—"}
          href="/admin/proveedores"
          icon={<Users className="h-5 w-5" />}
          tone="gray"
        />
        <div className="col-span-3 flex flex-col justify-between rounded-md border bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4" /> Comprado en el mes
          </div>
          <div className="mt-2 text-3xl font-bold">{fmtMoneda(kpis?.total_comprado_mes)}</div>
          <p className="text-xs text-muted-foreground">
            Suma de OCs emitidas este mes (excluye canceladas y rechazadas).
          </p>
        </div>
      </div>

      <section id="alertas" className="rounded-md border bg-white">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold">Alertas de stock</h2>
            <p className="text-xs text-muted-foreground">
              Items con stock por debajo de su punto de reorden. Selecciona los que querés solicitar para generar una SC borrador.
            </p>
          </div>
          {seleccion.length > 0 && (
            <Button onClick={handleGenerarSC} disabled={generando}>
              {generando ? "Generando…" : `Generar SC con ${seleccion.length} items`}
            </Button>
          )}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Stock actual</TableHead>
              <TableHead className="text-right">Reorden</TableHead>
              <TableHead className="text-right">Máximo</TableHead>
              <TableHead className="text-right">Sugerido</TableHead>
              <TableHead>Alerta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Cargando…</TableCell></TableRow>
            ) : alertas.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Ningún item en alerta. Bodega en orden.</TableCell></TableRow>
            ) : (
              alertas.map((a) => (
                <TableRow key={a.item_id}>
                  <TableCell>
                    <input type="checkbox" checked={seleccion.includes(a.item_id)} onChange={() => toggleItem(a.item_id)} />
                  </TableCell>
                  <TableCell>
                    <div className="font-mono text-xs text-muted-foreground">{a.codigo_interno}</div>
                    <div className="text-sm">{a.nombre}</div>
                  </TableCell>
                  <TableCell className="text-right font-semibold">{a.stock_total} {a.unidad_medida}</TableCell>
                  <TableCell className="text-right text-sm">{a.punto_reorden}</TableCell>
                  <TableCell className="text-right text-sm">{a.stock_maximo}</TableCell>
                  <TableCell className="text-right font-semibold text-blue-700">{a.cantidad_sugerida_reposicion}</TableCell>
                  <TableCell>
                    <Badge className={ALERTA_LABEL[a.nivel_alerta]?.cls ?? ""}>{ALERTA_LABEL[a.nivel_alerta]?.label ?? a.nivel_alerta}</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      <div className="grid grid-cols-3 gap-4">
        <QuickLink href="/compras/solicitudes" title="Solicitudes de compra" desc="SC enviadas, aprobadas, rechazadas" />
        <QuickLink href="/compras/ordenes-compra" title="Órdenes de compra" desc="OCs por aprobar, enviadas, en tránsito" />
        <QuickLink href="/compras/recepciones" title="Recepciones" desc="Materiales recibidos y por confirmar" />
      </div>
    </div>
  );
}

function KpiCard({ label, value, extra, href, icon, tone }: {
  label: string; value: number | string; extra?: string; href: string;
  icon: React.ReactNode; tone: "indigo" | "amber" | "purple" | "red" | "gray";
}) {
  const toneCls = {
    indigo: "border-indigo-200 bg-indigo-50/40",
    amber:  "border-amber-200 bg-amber-50/40",
    purple: "border-purple-200 bg-purple-50/40",
    red:    "border-red-200 bg-red-50/40",
    gray:   "border-gray-200 bg-white",
  }[tone];
  return (
    <Link href={href} className={`rounded-md border ${toneCls} p-4 transition hover:shadow`}>
      <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
      {extra && <div className="text-xs text-red-700">{extra}</div>}
    </Link>
  );
}

function QuickLink({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} className="flex items-center justify-between rounded-md border bg-white p-4 transition hover:bg-muted/30">
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
