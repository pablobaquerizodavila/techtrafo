"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search, Eye, Zap, Factory } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Toaster } from "sonner";
import { PageHeader, HeaderActionPrimary } from "@/components/page-header";
import { Panel } from "@/components/panel";
import {
  Transformador, TipoTransformador, EstadoTransformador,
  estadoLabel, estadoVariant, formatCapacidad, listTransformadores, tipoLabel,
} from "@/lib/transformadores";

const PAGE_LIMIT = 25;

export default function TransformadoresPage() {
  const [data, setData] = useState<Transformador[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState<TipoTransformador | "">("");
  const [estado, setEstado] = useState<EstadoTransformador | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listTransformadores({
        page, limit: PAGE_LIMIT,
        q: q || undefined,
        tipo: tipo || undefined,
        estado: estado || undefined,
      });
      setData(res.data);
      setTotal(res.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando");
    } finally {
      setLoading(false);
    }
  }, [page, q, tipo, estado]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); setQ(qInput.trim()); }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { label: "Transformadores" }]}
        title="Transformadores"
        titleAccent="del cliente"
        meta={<span>{total} equipo{total === 1 ? "" : "s"} · historial completo de intervenciones</span>}
        actions={
          <HeaderActionPrimary href="/transformadores/nuevo" icon={<Plus className="h-3.5 w-3.5" />}>
            Nuevo transformador
          </HeaderActionPrimary>
        }
      />

      <div className="space-y-6 pt-6">
        <Panel padded={false}>
          <div className="flex flex-wrap items-center gap-2 border-b border-glass px-5 py-3">
            <div className="relative flex-1 min-w-[18rem] max-w-sm">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Buscar código, serie, marca, cliente…" className="h-8 border-glass bg-glass pl-8 text-sm" />
            </div>
            <Select value={tipo || "_"} onValueChange={(v) => { setPage(1); setTipo(v === "_" ? "" : (v as TipoTransformador)); }}>
              <SelectTrigger className="h-8 w-44 border-glass bg-glass text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">Todos los tipos</SelectItem>
                <SelectItem value="distribucion">Distribución</SelectItem>
                <SelectItem value="potencia">Potencia</SelectItem>
                <SelectItem value="seco">Seco</SelectItem>
                <SelectItem value="aceite">Aceite</SelectItem>
                <SelectItem value="pedestal">Pedestal</SelectItem>
                <SelectItem value="subestacion">Subestación</SelectItem>
                <SelectItem value="especial">Especial</SelectItem>
              </SelectContent>
            </Select>
            <Select value={estado || "_"} onValueChange={(v) => { setPage(1); setEstado(v === "_" ? "" : (v as EstadoTransformador)); }}>
              <SelectTrigger className="h-8 w-44 border-glass bg-glass text-xs"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">Todos los estados</SelectItem>
                <SelectItem value="en_servicio">En servicio</SelectItem>
                <SelectItem value="en_taller">En taller</SelectItem>
                <SelectItem value="en_almacen">En almacén</SelectItem>
                <SelectItem value="fuera_de_servicio">Fuera de servicio</SelectItem>
                <SelectItem value="dado_de_baja">Dado de baja</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="border-glass bg-glass hover:bg-glass">
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Código</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Marca / Modelo</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Serie</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Cliente</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Tipo</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Capacidad</TableHead>
                <TableHead className="text-center font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">OT</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Estado</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">Cargando…</TableCell></TableRow>
              ) : error ? (
                <TableRow><TableCell colSpan={9} className="py-8 text-center text-sm text-rose-400">{error}</TableCell></TableRow>
              ) : data.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="py-10 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Zap className="h-5 w-5" />
                    <span className="text-sm">Sin transformadores · agregá el primero</span>
                  </div>
                </TableCell></TableRow>
              ) : (
                data.map((t) => (
                  <TableRow key={t.id} className="border-glass hover:bg-glass">
                    <TableCell className="font-mono text-xs text-copper">{t.codigo_interno ?? "—"}</TableCell>
                    <TableCell>
                      <p className="font-medium">{t.marca ?? "—"}</p>
                      <p className="font-mono text-[10.5px] text-muted-foreground">{t.modelo ?? "—"}</p>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-foreground/80">{t.numero_serie ?? <span className="text-muted-foreground/50">—</span>}</TableCell>
                    <TableCell className="text-sm">
                      {t.clientes?.razon_social ?? <span className="italic text-muted-foreground">sin asignar</span>}
                    </TableCell>
                    <TableCell className="text-sm capitalize text-foreground/80">{tipoLabel(t.tipo)}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold tabular-nums text-ttteal">{formatCapacidad(t.capacidad_kva)}</TableCell>
                    <TableCell className="text-center text-sm">
                      {(t._count?.ot ?? 0) > 0 ? (
                        <Badge variant="copper"><Factory className="mr-1 h-3 w-3" />{t._count?.ot}</Badge>
                      ) : <span className="text-muted-foreground/50">—</span>}
                    </TableCell>
                    <TableCell><Badge variant={estadoVariant(t.estado)}>{estadoLabel(t.estado)}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Link href={`/transformadores/${t.id}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-glass-elev hover:text-copper">
                        <Eye className="h-3.5 w-3.5" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between border-t border-glass px-5 py-3 text-sm">
            <p className="font-mono text-[11px] text-muted-foreground">
              {total === 0 ? "Sin resultados" : `${total} transformador${total === 1 ? "" : "es"} · página ${page}/${totalPages}`}
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
