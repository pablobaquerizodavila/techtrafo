"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Pencil, Archive, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  SelectItem,
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
  archiveItem,
  Categoria,
  createItem,
  Item,
  ItemInput,
  listCategorias,
  listItems,
  TipoItem,
  tipoItemLabel,
  updateItem,
} from "@/lib/inventario";
import { ApiError } from "@/lib/api";
import { ItemForm } from "./item-form";

const PAGE_LIMIT = 25;

type DialogMode = { kind: "closed" } | { kind: "create" } | { kind: "edit"; item: Item };

export default function ItemsPage() {
  const [data, setData] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [tipoItem, setTipoItem] = useState<TipoItem | "">("");
  const [categoriaId, setCategoriaId] = useState<number | "">("");
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogMode>({ kind: "closed" });

  useEffect(() => {
    listCategorias().then((r) => setCategorias(r.data)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listItems({
        page,
        limit: PAGE_LIMIT,
        q: q || undefined,
        tipo_item: tipoItem || undefined,
        categoria_id: categoriaId || undefined,
      });
      setData(res.data);
      setTotal(res.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando");
    } finally {
      setLoading(false);
    }
  }, [page, q, tipoItem, categoriaId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setTimeout(() => { setPage(1); setQ(qInput.trim()); }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  async function handleSubmit(payload: ItemInput) {
    try {
      if (dialog.kind === "edit") {
        await updateItem(dialog.item.id, payload);
        toast.success("Item actualizado");
      } else {
        await createItem(payload);
        toast.success("Item creado");
      }
      setDialog({ kind: "closed" });
      load();
    } catch (err) {
      const msg = err instanceof ApiError && err.status === 409
        ? "Ya existe un item con ese codigo interno"
        : "Error guardando";
      toast.error(msg);
      throw err;
    }
  }

  async function handleArchive(item: Item) {
    if (!window.confirm(`Descontinuar "${item.nombre}"?`)) return;
    try {
      await archiveItem(item.id);
      toast.success("Item descontinuado");
      load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { error?: string; cantidad?: number };
        toast.error(`No se puede: tiene stock activo (${body.cantidad ?? "?"} unidades)`);
      } else {
        toast.error("Error descontinuando");
      }
    }
  }

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { href: "/inventario", label: "Bodega" }, { label: "Items" }]}
        title="Items"
        titleAccent="del catálogo"
        meta={<span>{total} item{total === 1 ? "" : "s"} · catálogo maestro de bodega</span>}
        actions={
          <HeaderActionPrimary onClick={() => setDialog({ kind: "create" })} icon={<Plus className="h-3.5 w-3.5" />}>
            Nuevo item
          </HeaderActionPrimary>
        }
      />

      <div className="space-y-6 pt-6">
        <Panel padded={false}>
          <div className="flex flex-wrap items-center gap-2 border-b border-glass px-5 py-3">
            <div className="relative flex-1 min-w-[18rem] max-w-sm">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Buscar por código o nombre…" className="h-8 border-glass bg-glass pl-8 text-sm" />
            </div>
            <Select value={tipoItem || "_"} onValueChange={(v) => { setPage(1); setTipoItem(v === "_" ? "" : v as TipoItem); }}>
              <SelectTrigger className="h-8 w-44 border-glass bg-glass text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">Todos los tipos</SelectItem>
                <SelectItem value="insumo">Insumo</SelectItem>
                <SelectItem value="componente">Componente</SelectItem>
                <SelectItem value="herramienta">Herramienta</SelectItem>
                <SelectItem value="servicio">Servicio</SelectItem>
                <SelectItem value="producto_terminado">Producto terminado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoriaId === "" ? "_" : categoriaId.toString()} onValueChange={(v) => { setPage(1); setCategoriaId(v === "_" ? "" : Number(v)); }}>
              <SelectTrigger className="h-8 w-56 border-glass bg-glass text-xs"><SelectValue placeholder="Categoría" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">Todas las categorías</SelectItem>
                {categorias.map((c) => (
                  <SelectItem key={c.id} value={c.id.toString()}>{c.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="border-glass bg-glass hover:bg-glass">
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Código</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Nombre</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Categoría</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Tipo</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Unidad</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Trazabilidad</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Precio ref.</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Cargando…</TableCell></TableRow>
              ) : error ? (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-rose-400">{error}</TableCell></TableRow>
              ) : data.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="py-10 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Package className="h-5 w-5" />
                    <span className="text-sm">Sin items que coincidan</span>
                  </div>
                </TableCell></TableRow>
              ) : (
                data.map((it) => (
                  <TableRow key={it.id} className="border-glass hover:bg-glass">
                    <TableCell className="font-mono text-xs text-copper">{it.codigo_interno}</TableCell>
                    <TableCell className="font-medium">{it.nombre}</TableCell>
                    <TableCell className="text-sm text-foreground/80">{it.categorias_item?.nombre ?? "—"}</TableCell>
                    <TableCell className="text-sm capitalize text-foreground/80">{tipoItemLabel(it.tipo_item)}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{it.unidad_medida}</TableCell>
                    <TableCell>
                      {it.controla_serie ? <Badge variant="warning">Serie</Badge>
                       : it.controla_lote ? <Badge variant="teal">Lote</Badge>
                       : !it.controla_stock ? <Badge variant="muted">Sin stock</Badge>
                       : <Badge variant="muted">Cantidad</Badge>}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums text-copper">${Number(it.precio_referencia).toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <button type="button" onClick={() => setDialog({ kind: "edit", item: it })} aria-label="Editar"
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-glass-elev hover:text-copper">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {it.estado !== "descontinuado" && (
                        <button type="button" onClick={() => handleArchive(it)} aria-label="Descontinuar"
                          className="ml-1 rounded-md p-1.5 text-rose-400 hover:bg-rose-500/10">
                          <Archive className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between border-t border-glass px-5 py-3 text-sm">
            <p className="font-mono text-[11px] text-muted-foreground">
              {total === 0 ? "Sin resultados" : `${total} item${total === 1 ? "" : "s"} · página ${page}/${totalPages}`}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="border-glass-mid bg-glass">Anterior</Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="border-glass-mid bg-glass">Siguiente</Button>
            </div>
          </div>
        </Panel>
      </div>

      <Dialog open={dialog.kind !== "closed"} onOpenChange={(open) => !open && setDialog({ kind: "closed" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog.kind === "edit" ? "Editar item" : "Nuevo item"}</DialogTitle>
            <DialogDescription>
              {dialog.kind === "edit" ? "Modifica los datos del item." : "Crea un item del catalogo de bodega."}
            </DialogDescription>
          </DialogHeader>
          {dialog.kind !== "closed" && (
            <ItemForm
              initial={dialog.kind === "edit" ? dialog.item : null}
              onCancel={() => setDialog({ kind: "closed" })}
              onSubmit={handleSubmit}
            />
          )}
        </DialogContent>
      </Dialog>

      <Toaster richColors position="top-right" theme="dark" />
    </div>
  );
}
