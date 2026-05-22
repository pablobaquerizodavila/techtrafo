"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Pencil, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Items</h2>
          <p className="text-muted-foreground">Catalogo maestro de bodega</p>
        </div>
        <Button onClick={() => setDialog({ kind: "create" })}>
          <Plus className="mr-2 h-4 w-4" /> Nuevo item
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Buscar por codigo o nombre" className="pl-9" />
        </div>
        <Select
          value={tipoItem || "_"}
          onValueChange={(v) => { setPage(1); setTipoItem(v === "_" ? "" : v as TipoItem); }}
        >
          <SelectTrigger className="w-44"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_">Todos los tipos</SelectItem>
            <SelectItem value="insumo">Insumo</SelectItem>
            <SelectItem value="componente">Componente</SelectItem>
            <SelectItem value="herramienta">Herramienta</SelectItem>
            <SelectItem value="servicio">Servicio</SelectItem>
            <SelectItem value="producto_terminado">Producto terminado</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={categoriaId === "" ? "_" : categoriaId.toString()}
          onValueChange={(v) => { setPage(1); setCategoriaId(v === "_" ? "" : Number(v)); }}
        >
          <SelectTrigger className="w-56"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_">Todas las categorias</SelectItem>
            {categorias.map((c) => (
              <SelectItem key={c.id} value={c.id.toString()}>{c.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Codigo</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Unidad</TableHead>
              <TableHead>Trazabilidad</TableHead>
              <TableHead className="text-right">Precio ref.</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : error ? (
              <TableRow><TableCell colSpan={8} className="text-center text-destructive">{error}</TableCell></TableRow>
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Sin items que coincidan</TableCell></TableRow>
            ) : (
              data.map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="font-mono text-xs">{it.codigo_interno}</TableCell>
                  <TableCell className="font-medium">{it.nombre}</TableCell>
                  <TableCell className="text-sm">{it.categorias_item?.nombre ?? "—"}</TableCell>
                  <TableCell className="text-sm">{tipoItemLabel(it.tipo_item)}</TableCell>
                  <TableCell className="text-sm">{it.unidad_medida}</TableCell>
                  <TableCell>
                    {it.controla_serie ? <Badge variant="warning">Serie</Badge>
                     : it.controla_lote ? <Badge variant="default">Lote</Badge>
                     : !it.controla_stock ? <Badge variant="muted">Sin stock</Badge>
                     : <Badge variant="muted">Cantidad</Badge>}
                  </TableCell>
                  <TableCell className="text-right font-mono">${Number(it.precio_referencia).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setDialog({ kind: "edit", item: it })} aria-label="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {it.estado !== "descontinuado" && (
                      <Button variant="ghost" size="icon" onClick={() => handleArchive(it)} aria-label="Descontinuar">
                        <Archive className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <p className="text-muted-foreground">
          {total === 0 ? "Sin resultados" : `${total} item${total === 1 ? "" : "s"} - pagina ${page}/${totalPages}`}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Anterior</Button>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Siguiente</Button>
        </div>
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

      <Toaster richColors position="top-right" />
    </div>
  );
}
