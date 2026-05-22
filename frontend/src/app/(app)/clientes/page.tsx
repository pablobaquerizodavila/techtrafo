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
  Cliente,
  EstadoCliente,
  Segmento,
  Sector,
  archiveCliente,
  createCliente,
  listClientes,
  updateCliente,
} from "@/lib/clientes";
import { ApiError } from "@/lib/api";
import { ClienteForm } from "./cliente-form";

const PAGE_LIMIT = 25;

type DialogMode = { kind: "closed" } | { kind: "create" } | { kind: "edit"; cliente: Cliente };

export default function ClientesPage() {
  const [data, setData] = useState<Cliente[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [estado, setEstado] = useState<EstadoCliente | "">("");
  const [segmento, setSegmento] = useState<Segmento | "">("");
  const [sector, setSector] = useState<Sector | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogMode>({ kind: "closed" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listClientes({
        page,
        limit: PAGE_LIMIT,
        q: q || undefined,
        estado: estado || undefined,
        segmento: segmento || undefined,
        sector: sector || undefined,
      });
      setData(res.data);
      setTotal(res.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando clientes");
    } finally {
      setLoading(false);
    }
  }, [page, q, estado, segmento, sector]);

  useEffect(() => {
    load();
  }, [load]);

  // Debounce de la busqueda
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setQ(qInput.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  async function handleCreate(payload: Parameters<typeof createCliente>[0]) {
    try {
      await createCliente(payload);
      toast.success("Cliente creado");
      setDialog({ kind: "closed" });
      load();
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 409
          ? "Ya existe un cliente con ese RUC/Cedula"
          : "Error creando cliente";
      toast.error(msg);
      throw err;
    }
  }

  async function handleUpdate(id: number, payload: Parameters<typeof updateCliente>[1]) {
    try {
      await updateCliente(id, payload);
      toast.success("Cliente actualizado");
      setDialog({ kind: "closed" });
      load();
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 409
          ? "Ya existe un cliente con ese RUC/Cedula"
          : "Error actualizando cliente";
      toast.error(msg);
      throw err;
    }
  }

  async function handleArchive(cliente: Cliente) {
    const ok = window.confirm(`Archivar el cliente "${cliente.razon_social}"?`);
    if (!ok) return;
    try {
      await archiveCliente(cliente.id);
      toast.success("Cliente archivado");
      load();
    } catch {
      toast.error("Error archivando cliente");
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Clientes</h2>
          <p className="text-muted-foreground">Gestion de clientes y prospectos</p>
        </div>
        <Button onClick={() => setDialog({ kind: "create" })}>
          <Plus className="mr-2 h-4 w-4" /> Nuevo cliente
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Buscar por razon social o RUC"
            className="pl-9"
          />
        </div>

        <Select
          value={estado || "_"}
          onValueChange={(v) => {
            setPage(1);
            setEstado(v === "_" ? "" : (v as EstadoCliente));
          }}
        >
          <SelectTrigger className="w-44"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_">Todos (vigentes)</SelectItem>
            <SelectItem value="activo">Activo</SelectItem>
            <SelectItem value="inactivo">Inactivo</SelectItem>
            <SelectItem value="bloqueado">Bloqueado</SelectItem>
            <SelectItem value="archivado">Archivado</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={segmento || "_"}
          onValueChange={(v) => {
            setPage(1);
            setSegmento(v === "_" ? "" : (v as Segmento));
          }}
        >
          <SelectTrigger className="w-44"><SelectValue placeholder="Segmento" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_">Todos los segmentos</SelectItem>
            <SelectItem value="industrial">Industrial</SelectItem>
            <SelectItem value="distribuidora">Distribuidora</SelectItem>
            <SelectItem value="constructora">Constructora</SelectItem>
            <SelectItem value="otro">Otro</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={sector || "_"}
          onValueChange={(v) => {
            setPage(1);
            setSector(v === "_" ? "" : (v as Sector));
          }}
        >
          <SelectTrigger className="w-40"><SelectValue placeholder="Sector" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_">Privado y publico</SelectItem>
            <SelectItem value="privado">Privado</SelectItem>
            <SelectItem value="publico">Publico</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>RUC / Cedula</TableHead>
              <TableHead>Razon social</TableHead>
              <TableHead>Segmento</TableHead>
              <TableHead>Sector</TableHead>
              <TableHead>Ciudad</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-destructive">
                  {error}
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No hay clientes que coincidan con los filtros.
                </TableCell>
              </TableRow>
            ) : (
              data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.ruc_cedula}</TableCell>
                  <TableCell className="font-medium">{c.razon_social}</TableCell>
                  <TableCell>{c.segmento ?? "—"}</TableCell>
                  <TableCell>{c.sector ?? "—"}</TableCell>
                  <TableCell>{c.ciudad ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={estadoBadge(c.estado)}>{c.estado}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDialog({ kind: "edit", cliente: c })}
                      aria-label={`Editar ${c.razon_social}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {c.estado !== "archivado" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleArchive(c)}
                        aria-label={`Archivar ${c.razon_social}`}
                      >
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
          {total === 0 ? "Sin resultados" : `${total} cliente${total === 1 ? "" : "s"} - pagina ${page}/${totalPages}`}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            Anterior
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            Siguiente
          </Button>
        </div>
      </div>

      <Dialog
        open={dialog.kind !== "closed"}
        onOpenChange={(open) => !open && setDialog({ kind: "closed" })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog.kind === "edit" ? "Editar cliente" : "Nuevo cliente"}
            </DialogTitle>
            <DialogDescription>
              {dialog.kind === "edit"
                ? "Actualiza los datos del cliente y guarda."
                : "Completa los datos del cliente. Los campos marcados con * son obligatorios."}
            </DialogDescription>
          </DialogHeader>
          {dialog.kind !== "closed" && (
            <ClienteForm
              initial={dialog.kind === "edit" ? dialog.cliente : null}
              onCancel={() => setDialog({ kind: "closed" })}
              onSubmit={async (payload) => {
                if (dialog.kind === "edit") {
                  await handleUpdate(dialog.cliente.id, payload);
                } else {
                  await handleCreate(payload);
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Toaster richColors position="top-right" />
    </div>
  );
}

function estadoBadge(estado: EstadoCliente): "success" | "muted" | "destructive" | "warning" {
  switch (estado) {
    case "activo":
      return "success";
    case "inactivo":
      return "muted";
    case "bloqueado":
      return "destructive";
    case "archivado":
      return "warning";
  }
}
