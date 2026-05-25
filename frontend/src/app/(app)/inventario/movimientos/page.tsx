"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, ArrowRight, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader, HeaderActionPrimary } from "@/components/page-header";
import { Panel } from "@/components/panel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem as SelectItemUI,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Toaster, toast } from "sonner";
import {
  Movimiento,
  MovimientoInput,
  TipoMovimiento,
  createMovimiento,
  listMovimientos,
  tipoMovLabel,
  tipoMovVariant,
} from "@/lib/inventario";
import { ApiError } from "@/lib/api";
import { MovimientoForm } from "./movimiento-form";

const PAGE_LIMIT = 25;

export default function MovimientosPage() {
  const [data, setData] = useState<Movimiento[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [tipo, setTipo] = useState<TipoMovimiento | "">("");
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listMovimientos({
        page,
        limit: PAGE_LIMIT,
        tipo: tipo || undefined,
      });
      setData(res.data);
      setTotal(res.pagination.total);
    } finally {
      setLoading(false);
    }
  }, [page, tipo]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  async function handleSubmit(payload: MovimientoInput) {
    try {
      await createMovimiento(payload);
      toast.success("Movimiento registrado");
      setDialogOpen(false);
      load();
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { error?: string };
        const msg = body?.error === "stock_insuficiente" ? "Stock insuficiente para esta salida"
          : body?.error === "lote_requerido" ? "Este item requiere lote"
          : body?.error === "lote_invalido" ? "El lote no corresponde a este item"
          : `Error ${err.status}: ${body?.error ?? "desconocido"}`;
        toast.error(msg);
      } else {
        toast.error("Error registrando movimiento");
      }
      throw err;
    }
  }

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { href: "/inventario", label: "Bodega" }, { label: "Movimientos" }]}
        title="Movimientos"
        titleAccent="de stock"
        meta={<span>Histórico inmutable · entradas, salidas, transferencias y ajustes</span>}
        actions={
          <HeaderActionPrimary onClick={() => setDialogOpen(true)} icon={<Plus className="h-3.5 w-3.5" />}>
            Registrar movimiento
          </HeaderActionPrimary>
        }
      />

      <div className="space-y-6 pt-6">
        <Panel padded={false}>
          <div className="flex flex-wrap items-center gap-2 border-b border-glass px-5 py-3">
            <Select value={tipo || "_"} onValueChange={(v) => { setPage(1); setTipo(v === "_" ? "" : v as TipoMovimiento); }}>
              <SelectTrigger className="h-8 w-56 border-glass bg-glass text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItemUI value="_">Todos los tipos</SelectItemUI>
                <SelectItemUI value="entrada">Entrada</SelectItemUI>
                <SelectItemUI value="salida">Salida</SelectItemUI>
                <SelectItemUI value="transferencia">Transferencia</SelectItemUI>
                <SelectItemUI value="ajuste_positivo">Ajuste positivo</SelectItemUI>
                <SelectItemUI value="ajuste_negativo">Ajuste negativo</SelectItemUI>
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="border-glass bg-glass hover:bg-glass">
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Fecha</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Tipo</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Item</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Origen → Destino</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Lote</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Cantidad</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Ref · motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Cargando…</TableCell></TableRow>
              ) : data.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-10 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <ArrowLeftRight className="h-5 w-5" />
                    <span className="text-sm">Sin movimientos registrados</span>
                  </div>
                </TableCell></TableRow>
              ) : (
                data.map((m) => (
                  <TableRow key={m.id} className="border-glass hover:bg-glass">
                    <TableCell className="font-mono text-xs text-foreground/80">{m.fecha.split("T")[0]}</TableCell>
                    <TableCell><Badge variant={tipoMovVariant(m.tipo)}>{tipoMovLabel(m.tipo)}</Badge></TableCell>
                    <TableCell>
                      <p className="font-medium">{m.items?.nombre ?? "—"}</p>
                      <p className="font-mono text-[10.5px] text-copper">{m.items?.codigo_interno}</p>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="text-muted-foreground">{m.ubicaciones_movimientos_stock_ubicacion_origen_idToubicaciones?.nombre ?? "—"}</span>
                      <ArrowRight className="mx-1.5 inline h-3 w-3 text-copper" />
                      <span className="text-foreground/85">{m.ubicaciones_movimientos_stock_ubicacion_destino_idToubicaciones?.nombre ?? "—"}</span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{m.lotes?.numero_lote ?? <span className="text-muted-foreground/50">—</span>}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                      {Number(m.cantidad).toFixed(3).replace(/\.?0+$/, "")}
                      <span className="ml-1 text-[10px] text-muted-foreground">{m.items?.unidad_medida}</span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {m.referencia_tipo && <Badge variant="muted" className="mr-1">{m.referencia_tipo}</Badge>}
                      <span className="text-foreground/85">{m.motivo}</span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between border-t border-glass px-5 py-3 text-sm">
            <p className="font-mono text-[11px] text-muted-foreground">
              {total === 0 ? "Sin resultados" : `${total} movimiento${total === 1 ? "" : "s"} · página ${page}/${totalPages}`}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="border-glass-mid bg-glass">Anterior</Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="border-glass-mid bg-glass">Siguiente</Button>
            </div>
          </div>
        </Panel>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar movimiento</DialogTitle>
            <DialogDescription>
              El stock se actualiza automaticamente. Los movimientos son inmutables: para corregir un error, registra un movimiento contrario (ajuste).
            </DialogDescription>
          </DialogHeader>
          {dialogOpen && (
            <MovimientoForm
              onCancel={() => setDialogOpen(false)}
              onSubmit={handleSubmit}
            />
          )}
        </DialogContent>
      </Dialog>

      <Toaster richColors position="top-right" theme="dark" />
    </div>
  );
}
