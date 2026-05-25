"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Pencil, Archive, Users } from "lucide-react";
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
import { PageHeader, HeaderActionPrimary } from "@/components/page-header";
import { Panel } from "@/components/panel";
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

  useEffect(() => { load(); }, [load]);

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
      const msg = err instanceof ApiError && err.status === 409 ? "Ya existe un cliente con ese RUC/Cédula" : "Error creando cliente";
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
      const msg = err instanceof ApiError && err.status === 409 ? "Ya existe un cliente con ese RUC/Cédula" : "Error actualizando cliente";
      toast.error(msg);
      throw err;
    }
  }

  async function handleArchive(cliente: Cliente) {
    const ok = window.confirm(`¿Archivar el cliente "${cliente.razon_social}"?`);
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
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { label: "Clientes" }]}
        title="Cartera"
        titleAccent="de clientes"
        meta={<span>{total} cliente{total === 1 ? "" : "s"} · prospectos y vigentes</span>}
        actions={
          <HeaderActionPrimary onClick={() => setDialog({ kind: "create" })} icon={<Plus className="h-3.5 w-3.5" />}>
            Nuevo cliente
          </HeaderActionPrimary>
        }
      />

      <div className="space-y-6 pt-6">
        <Panel padded={false}>
          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2 border-b border-glass px-5 py-3">
            <div className="relative flex-1 min-w-[16rem] max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Buscar por razón social o RUC…"
                className="h-8 border-glass bg-glass pl-8 text-sm"
              />
            </div>

            <Select value={estado || "_"} onValueChange={(v) => { setPage(1); setEstado(v === "_" ? "" : (v as EstadoCliente)); }}>
              <SelectTrigger className="h-8 w-40 border-glass bg-glass text-xs"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">Todos (vigentes)</SelectItem>
                <SelectItem value="activo">Activo</SelectItem>
                <SelectItem value="inactivo">Inactivo</SelectItem>
                <SelectItem value="bloqueado">Bloqueado</SelectItem>
                <SelectItem value="archivado">Archivado</SelectItem>
              </SelectContent>
            </Select>

            <Select value={segmento || "_"} onValueChange={(v) => { setPage(1); setSegmento(v === "_" ? "" : (v as Segmento)); }}>
              <SelectTrigger className="h-8 w-40 border-glass bg-glass text-xs"><SelectValue placeholder="Segmento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">Todos los segmentos</SelectItem>
                <SelectItem value="industrial">Industrial</SelectItem>
                <SelectItem value="distribuidora">Distribuidora</SelectItem>
                <SelectItem value="constructora">Constructora</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sector || "_"} onValueChange={(v) => { setPage(1); setSector(v === "_" ? "" : (v as Sector)); }}>
              <SelectTrigger className="h-8 w-36 border-glass bg-glass text-xs"><SelectValue placeholder="Sector" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">Privado y público</SelectItem>
                <SelectItem value="privado">Privado</SelectItem>
                <SelectItem value="publico">Público</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tabla */}
          <Table>
            <TableHeader>
              <TableRow className="border-glass bg-glass hover:bg-glass">
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">RUC / Cédula</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Razón social</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Segmento</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Sector</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Ciudad</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Estado</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Cargando…</TableCell></TableRow>
              ) : error ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-rose-400">{error}</TableCell></TableRow>
              ) : data.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-10 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Users className="h-5 w-5" />
                    <span className="text-sm">No hay clientes que coincidan</span>
                  </div>
                </TableCell></TableRow>
              ) : (
                data.map((c) => (
                  <TableRow key={c.id} className="border-glass group hover:bg-glass">
                    <TableCell className="font-mono text-xs text-foreground/85">{c.ruc_cedula}</TableCell>
                    <TableCell className="font-medium">{c.razon_social}</TableCell>
                    <TableCell className="text-sm capitalize text-foreground/75">{c.segmento ?? "—"}</TableCell>
                    <TableCell className="text-sm capitalize text-foreground/75">{c.sector ?? "—"}</TableCell>
                    <TableCell className="text-sm text-foreground/75">{c.ciudad ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={estadoBadge(c.estado)}>{c.estado}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDialog({ kind: "edit", cliente: c })}
                        aria-label={`Editar ${c.razon_social}`}
                        className="text-muted-foreground hover:bg-glass-elev hover:text-copper"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {c.estado !== "archivado" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleArchive(c)}
                          aria-label={`Archivar ${c.razon_social}`}
                          className="text-muted-foreground hover:bg-glass-elev hover:text-amber-400"
                        >
                          <Archive className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Paginación */}
          <div className="flex items-center justify-between border-t border-glass px-5 py-3 text-sm">
            <p className="font-mono text-[11px] text-muted-foreground">
              {total === 0 ? "Sin resultados" : `${total} cliente${total === 1 ? "" : "s"} · página ${page}/${totalPages}`}
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
            <DialogTitle>{dialog.kind === "edit" ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
            <DialogDescription>
              {dialog.kind === "edit"
                ? "Actualizá los datos del cliente y guardá."
                : "Completá los datos del cliente. Los campos marcados con * son obligatorios."}
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

      <Toaster richColors position="top-right" theme="dark" />
    </div>
  );
}

function estadoBadge(estado: EstadoCliente): "success" | "muted" | "destructive" | "warning" {
  switch (estado) {
    case "activo":    return "success";
    case "inactivo":  return "muted";
    case "bloqueado": return "destructive";
    case "archivado": return "warning";
  }
}
