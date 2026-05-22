"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search, Eye, Pencil } from "lucide-react";
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
import { Toaster } from "sonner";
import {
  Cotizacion,
  EstadoCotizacion,
  TipoServicio,
  estadoVariant,
  listCotizaciones,
} from "@/lib/cotizaciones";

const PAGE_LIMIT = 25;

export default function CotizacionesPage() {
  const [data, setData] = useState<Cotizacion[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<EstadoCotizacion | "">("");
  const [tipoServicio, setTipoServicio] = useState<TipoServicio | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listCotizaciones({
        page,
        limit: PAGE_LIMIT,
        q: q || undefined,
        estado: estado || undefined,
        tipo_servicio: tipoServicio || undefined,
      });
      setData(res.data);
      setTotal(res.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando cotizaciones");
    } finally {
      setLoading(false);
    }
  }, [page, q, estado, tipoServicio]);

  useEffect(() => {
    load();
  }, [load]);

  // Debounce de busqueda
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setQ(qInput.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Cotizaciones</h2>
          <p className="text-muted-foreground">Gestion del flujo comercial</p>
        </div>
        <Button asChild>
          <Link href="/cotizaciones/nueva">
            <Plus className="mr-2 h-4 w-4" /> Nueva cotizacion
          </Link>
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Buscar por codigo, RUC o cliente"
            className="pl-9"
          />
        </div>
        <Select
          value={estado || "_"}
          onValueChange={(v) => {
            setPage(1);
            setEstado(v === "_" ? "" : (v as EstadoCotizacion));
          }}
        >
          <SelectTrigger className="w-44"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_">Todos los estados</SelectItem>
            <SelectItem value="borrador">Borrador</SelectItem>
            <SelectItem value="enviada">Enviada</SelectItem>
            <SelectItem value="aprobada">Aprobada</SelectItem>
            <SelectItem value="rechazada">Rechazada</SelectItem>
            <SelectItem value="vencida">Vencida</SelectItem>
            <SelectItem value="cancelada">Cancelada</SelectItem>
            <SelectItem value="convertida">Convertida</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={tipoServicio || "_"}
          onValueChange={(v) => {
            setPage(1);
            setTipoServicio(v === "_" ? "" : (v as TipoServicio));
          }}
        >
          <SelectTrigger className="w-44"><SelectValue placeholder="Tipo servicio" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_">Todos los tipos</SelectItem>
            <SelectItem value="reparacion">Reparacion</SelectItem>
            <SelectItem value="fabricacion">Fabricacion</SelectItem>
            <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
            <SelectItem value="otro">Otro</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Codigo</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Emision</TableHead>
              <TableHead>Valida hasta</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : error ? (
              <TableRow><TableCell colSpan={8} className="text-center text-destructive">{error}</TableCell></TableRow>
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Sin cotizaciones que coincidan</TableCell></TableRow>
            ) : (
              data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-sm">{c.codigo}</TableCell>
                  <TableCell className="font-medium">
                    {c.clientes?.razon_social ?? "—"}
                    <div className="text-xs text-muted-foreground font-mono">{c.clientes?.ruc_cedula}</div>
                  </TableCell>
                  <TableCell className="capitalize">{c.tipo_servicio}</TableCell>
                  <TableCell className="text-sm">{c.fecha_emision.split("T")[0]}</TableCell>
                  <TableCell className="text-sm">{c.fecha_validez?.split("T")[0] ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">${Number(c.total).toFixed(2)}</TableCell>
                  <TableCell><Badge variant={estadoVariant(c.estado)}>{c.estado}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" asChild>
                      <Link href={`/cotizaciones/${c.id}`} aria-label={`Ver/editar ${c.codigo}`}>
                        {c.estado === "borrador" ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <p className="text-muted-foreground">
          {total === 0 ? "Sin resultados" : `${total} cotizacion${total === 1 ? "" : "es"} - pagina ${page}/${totalPages}`}
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

      <Toaster richColors position="top-right" />
    </div>
  );
}
