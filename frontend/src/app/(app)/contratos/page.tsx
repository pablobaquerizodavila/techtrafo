"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Search, Eye, FileSignature, ArrowRight } from "lucide-react";
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
import { PageHeader, HeaderActionGhost } from "@/components/page-header";
import { Panel } from "@/components/panel";
import {
  Contrato,
  EstadoContrato,
  estadoContratoVariant,
  listContratos,
} from "@/lib/contratos";

const PAGE_LIMIT = 25;

export default function ContratosPage() {
  const [data, setData] = useState<Contrato[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<EstadoContrato | "">("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listContratos({
        page,
        limit: PAGE_LIMIT,
        q: q || undefined,
        estado: estado || undefined,
      });
      setData(res.data);
      setTotal(res.pagination.total);
    } finally {
      setLoading(false);
    }
  }, [page, q, estado]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); setQ(qInput.trim()); }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { label: "Contratos" }]}
        title="Contratos"
        titleAccent="firmados"
        meta={<span>{total} contrato{total === 1 ? "" : "s"} · plan de pagos por hitos</span>}
        actions={
          <HeaderActionGhost href="/cotizaciones?estado=aprobada" icon={<ArrowRight className="h-3.5 w-3.5" />}>
            Cotizaciones aprobadas
          </HeaderActionGhost>
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
            <Select value={estado || "_"} onValueChange={(v) => { setPage(1); setEstado(v === "_" ? "" : v as EstadoContrato); }}>
              <SelectTrigger className="h-8 w-44 border-glass bg-glass text-xs"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">Todos los estados</SelectItem>
                <SelectItem value="vigente">Vigente</SelectItem>
                <SelectItem value="suspendido">Suspendido</SelectItem>
                <SelectItem value="completado">Completado</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tabla */}
          <Table>
            <TableHeader>
              <TableRow className="border-glass bg-glass hover:bg-glass">
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Código</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Cliente</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Cotización</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Firma</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Fin estimado</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Monto</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Estado</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Cargando…</TableCell></TableRow>
              ) : data.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="py-10 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <FileSignature className="h-5 w-5" />
                    <span className="text-sm">Sin contratos · convertí una cotización aprobada para empezar</span>
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
                    <TableCell className="font-mono text-xs text-foreground/80">{c.cotizaciones?.codigo ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-foreground/80">{c.fecha_firma?.split("T")[0]}</TableCell>
                    <TableCell className="font-mono text-xs text-foreground/80">{c.fecha_fin_estimada?.split("T")[0] ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums text-copper">${Number(c.monto_total).toFixed(2)}</TableCell>
                    <TableCell><Badge variant={estadoContratoVariant(c.estado)}>{c.estado}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" asChild className="text-muted-foreground hover:bg-glass-elev hover:text-copper">
                        <Link href={`/contratos/${c.id}`} aria-label={`Ver ${c.codigo}`}>
                          <Eye className="h-3.5 w-3.5" />
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
              {total === 0 ? "Sin resultados" : `${total} contrato${total === 1 ? "" : "s"} · página ${page}/${totalPages}`}
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
