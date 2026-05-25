"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, AlertTriangle, Calendar, Warehouse } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Toaster } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import {
  StockRow, Ubicacion, getAlertas, listStock, listUbicaciones,
} from "@/lib/inventario";

interface AlertasState {
  stock_bajo_reorden: Array<{ item_id: number; codigo_interno: string; nombre: string; unidad_medida: string; punto_reorden: number; stock_actual: number }>;
  lotes_por_vencer: Array<{ id: number; numero_lote: string; fecha_vencimiento: string | null; items?: { id: number; codigo_interno: string; nombre: string; unidad_medida: string } }>;
}

export default function StockPage() {
  const [stock, setStock] = useState<StockRow[]>([]);
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [ubicacionId, setUbicacionId] = useState<number | "">("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [alertas, setAlertas] = useState<AlertasState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listUbicaciones().then((r) => setUbicaciones(r.data)).catch(() => {});
    getAlertas().then((r) => setAlertas(r.data)).catch(() => setAlertas({ stock_bajo_reorden: [], lotes_por_vencer: [] }));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listStock({ ubicacion_id: ubicacionId || undefined, q: q || undefined });
      setStock(res.data);
    } finally { setLoading(false); }
  }, [ubicacionId, q]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(t);
  }, [qInput]);

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { href: "/inventario", label: "Bodega" }, { label: "Stock" }]}
        title="Stock"
        titleAccent="actual"
        meta={<span>{stock.length} fila{stock.length === 1 ? "" : "s"} · inventario por item y ubicación</span>}
      />

      <div className="space-y-6 pt-6">
        {/* Tarjetas de alertas */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Panel
            title="Stock bajo reorden"
            subtitle={`${alertas?.stock_bajo_reorden.length ?? 0} items requieren reposición`}
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
            action={alertas && alertas.stock_bajo_reorden.length > 0 && <Badge variant="warning">{alertas.stock_bajo_reorden.length}</Badge>}
          >
            {!alertas || alertas.stock_bajo_reorden.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-green-500/25 bg-green-500/[0.04] py-4">
                <span className="text-xs text-green-300">✓ Sin alertas</span>
              </div>
            ) : (
              <ul className="space-y-2 text-sm">
                {alertas.stock_bajo_reorden.slice(0, 5).map((a) => (
                  <li key={a.item_id} className="flex items-center justify-between rounded-md border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2">
                    <span className="font-medium">{a.nombre}</span>
                    <span className="font-mono text-xs">
                      <span className="text-rose-300">{a.stock_actual}</span>
                      <span className="text-muted-foreground"> / reorden {a.punto_reorden} {a.unidad_medida}</span>
                    </span>
                  </li>
                ))}
                {alertas.stock_bajo_reorden.length > 5 && (
                  <li className="text-xs text-muted-foreground">y {alertas.stock_bajo_reorden.length - 5} más…</li>
                )}
              </ul>
            )}
          </Panel>

          <Panel
            title="Lotes por vencer"
            subtitle="Próximos 90 días"
            icon={<Calendar className="h-3.5 w-3.5" />}
            action={alertas && alertas.lotes_por_vencer.length > 0 && <Badge variant="destructive">{alertas.lotes_por_vencer.length}</Badge>}
          >
            {!alertas || alertas.lotes_por_vencer.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-green-500/25 bg-green-500/[0.04] py-4">
                <span className="text-xs text-green-300">✓ Sin lotes próximos a vencer</span>
              </div>
            ) : (
              <ul className="space-y-2 text-sm">
                {alertas.lotes_por_vencer.slice(0, 5).map((l) => (
                  <li key={l.id} className="flex items-center justify-between rounded-md border border-rose-500/20 bg-rose-500/[0.04] px-3 py-2">
                    <span className="font-medium">{l.items?.nombre ?? "—"}</span>
                    <span className="font-mono text-xs">
                      <span className="text-copper">lote {l.numero_lote}</span>
                      <span className="text-muted-foreground"> · vence {l.fecha_vencimiento?.split("T")[0]}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </section>

        {/* Tabla de stock */}
        <Panel padded={false}>
          <div className="flex flex-wrap items-center gap-2 border-b border-glass px-5 py-3">
            <div className="relative flex-1 min-w-[18rem] max-w-sm">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Buscar item por código o nombre…" className="h-8 border-glass bg-glass pl-8 text-sm" />
            </div>
            <Select value={ubicacionId === "" ? "_" : ubicacionId.toString()} onValueChange={(v) => setUbicacionId(v === "_" ? "" : Number(v))}>
              <SelectTrigger className="h-8 w-56 border-glass bg-glass text-xs"><SelectValue placeholder="Ubicación" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">Todas las ubicaciones</SelectItem>
                {ubicaciones.map((u) => (
                  <SelectItem key={u.id} value={u.id.toString()}>{u.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="border-glass bg-glass hover:bg-glass">
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Código</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Item</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Ubicación</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Lote</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Cantidad</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Unidad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Cargando…</TableCell></TableRow>
              ) : stock.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-10 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Warehouse className="h-5 w-5" />
                    <span className="text-sm">Sin stock con esos filtros</span>
                  </div>
                </TableCell></TableRow>
              ) : (
                stock.map((s) => (
                  <TableRow key={s.id} className="border-glass hover:bg-glass">
                    <TableCell className="font-mono text-xs text-copper">{s.items.codigo_interno}</TableCell>
                    <TableCell className="font-medium">{s.items.nombre}</TableCell>
                    <TableCell className="text-sm text-foreground/85">{s.ubicaciones.nombre}</TableCell>
                    <TableCell className="font-mono text-xs">{s.lotes?.numero_lote ?? <span className="text-muted-foreground/50">—</span>}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">{Number(s.cantidad).toFixed(3).replace(/\.?0+$/, "")}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{s.items.unidad_medida}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Panel>

        <p className="font-mono text-[10.5px] italic text-muted-foreground/70">
          El stock se actualiza automáticamente al registrar movimientos · máximo 500 filas por consulta.
        </p>
      </div>

      <Toaster richColors position="top-right" theme="dark" />
    </div>
  );
}
