"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search, Eye, Pencil, FileText } from "lucide-react";
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
import { PageHeader, HeaderActionPrimary } from "@/components/page-header";
import { Panel } from "@/components/panel";
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

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setQ(qInput.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { label: "Cotizaciones" }]}
        title="Cotizaciones"
        titleAccent="comerciales"
        meta={<span>{total} cotizaci{total === 1 ? "ón" : "ones"} · flujo comercial</span>}
        actions={
          <HeaderActionPrimary href="/cotizaciones/nueva" icon={<Plus className="h-3.5 w-3.5" />}>
            Nueva cotización
          </HeaderActionPrimary>
        }
      />

      <div className="space-y-6 pt-6">
        <Panel padded={false}>
          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2 border-b border-glass px-5 py-3">
            <div className="relative flex-1 min-w-[18rem] max-w-sm">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Buscar por código, RUC o cliente…"
                className="h-8 border-glass bg-glass pl-8 text-sm"
              />
            </div>
            <Select value={estado || "_"} onValueChange={(v) => { setPage(1); setEstado(v === "_" ? "" : (v as EstadoCotizacion)); }}>
              <SelectTrigger className="h-8 w-44 border-glass bg-glass text-xs"><SelectValue placeholder="Estado" /></SelectTrigger>
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
            <Select value={tipoServicio || "_"} onValueChange={(v) => { setPage(1); setTipoServicio(v === "_" ? "" : (v as TipoServicio)); }}>
              <SelectTrigger className="h-8 w-44 border-glass bg-glass text-xs"><SelectValue placeholder="Tipo servicio" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">Todos los tipos</SelectItem>
                <SelectItem value="reparacion">Reparación</SelectItem>
                <SelectItem value="fabricacion">Fabricación</SelectItem>
                <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tabla */}
          <Table>
            <TableHeader>
              <TableRow className="border-glass bg-glass hover:bg-glass">
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Código</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Cliente</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Tipo</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Emisión</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Válida hasta</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Total</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Estado</TableHead>
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
                    <FileText className="h-5 w-5" />
                    <span className="text-sm">Sin cotizaciones que coincidan</span>
                  </div>
                </TableCell></TableRow>
              ) : (
                data.map((c) => (
                  <TableRow key={c.id} className="border-glass group hover:bg-glass">
                    <TableCell className="font-mono text-xs text-foreground/90">{c.codigo}</TableCell>
                    <TableCell>
                      <p className="font-medium">{c.clientes?.razon_social ?? "—"}</p>
                      <p className="font-mono text-xs text-muted-foreground">{c.clientes?.ruc_cedula}</p>
                    </TableCell>
                    <TableCell className="text-sm capitalize text-foreground/80">{c.tipo_servicio}</TableCell>
                    <TableCell className="font-mono text-xs text-foreground/80">{c.fecha_emision.split("T")[0]}</TableCell>
                    <TableCell className="font-mono text-xs text-foreground/80">{c.fecha_validez?.split("T")[0] ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums text-copper">${Number(c.total).toFixed(2)}</TableCell>
                    <TableCell><Badge variant={estadoVariant(c.estado)}>{c.estado}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" asChild className="text-muted-foreground hover:bg-glass-elev hover:text-copper">
                        <Link href={`/cotizaciones/${c.id}`} aria-label={`Ver/editar ${c.codigo}`}>
                          {c.estado === "borrador" ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Paginación */}
          <div className="flex items-center justify-between border-t border-glass px-5 py-3 text-sm">
            <p className="font-mono text-[11px] text-muted-foreground">
              {total === 0 ? "Sin resultados" : `${total} cotizaci${total === 1 ? "ón" : "ones"} · página ${page}/${totalPages}`}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="border-glass-mid bg-glass">Anterior</Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="border-glass-mid bg-glass">Siguiente</Button>
            </div>
          </div>
        </Panel>
      </div>

      <Toaster richColors position="top-right" theme="dark" />
    </div>
  );
}
