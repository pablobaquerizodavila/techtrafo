"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Movimientos de stock</h2>
          <p className="text-muted-foreground">Histórico de entradas, salidas, transferencias y ajustes</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Registrar movimiento
        </Button>
      </header>

      <div className="flex gap-3">
        <Select
          value={tipo || "_"}
          onValueChange={(v) => { setPage(1); setTipo(v === "_" ? "" : v as TipoMovimiento); }}
        >
          <SelectTrigger className="w-56"><SelectValue placeholder="Tipo" /></SelectTrigger>
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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Origen → Destino</TableHead>
              <TableHead>Lote</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead>Ref / Motivo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Sin movimientos registrados</TableCell></TableRow>
            ) : (
              data.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-xs">{m.fecha.split("T")[0]}</TableCell>
                  <TableCell><Badge variant={tipoMovVariant(m.tipo)}>{tipoMovLabel(m.tipo)}</Badge></TableCell>
                  <TableCell className="font-medium">
                    {m.items?.nombre ?? "—"}
                    <div className="text-xs text-muted-foreground font-mono">{m.items?.codigo_interno}</div>
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="text-muted-foreground">{m.ubicaciones_movimientos_stock_ubicacion_origen_idToubicaciones?.nombre ?? "—"}</span>
                    <ArrowRight className="mx-1 inline h-3 w-3 text-muted-foreground" />
                    <span>{m.ubicaciones_movimientos_stock_ubicacion_destino_idToubicaciones?.nombre ?? "—"}</span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{m.lotes?.numero_lote ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {Number(m.cantidad).toFixed(3).replace(/\.?0+$/, "")} {m.items?.unidad_medida}
                  </TableCell>
                  <TableCell className="text-xs">
                    {m.referencia_tipo && <Badge variant="muted" className="mr-1">{m.referencia_tipo}</Badge>}
                    {m.motivo}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <p className="text-muted-foreground">
          {total === 0 ? "Sin resultados" : `${total} movimiento${total === 1 ? "" : "s"} - pagina ${page}/${totalPages}`}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Anterior</Button>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Siguiente</Button>
        </div>
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

      <Toaster richColors position="top-right" />
    </div>
  );
}
