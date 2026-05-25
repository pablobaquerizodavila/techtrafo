"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, AlertTriangle, Clock, MessageSquareWarning, Eye, Search, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Toaster } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Panel, StatCard } from "@/components/panel";
import {
  Garantia, EstadoGarantia, ResumenGarantias,
  estadoGarVariant, getResumenGarantias, listGarantias,
} from "@/lib/garantias";

const PAGE_LIMIT = 25;

export default function GarantiasPage() {
  const [data, setData] = useState<Garantia[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<EstadoGarantia | "">("");
  const [porVencer, setPorVencer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [resumen, setResumen] = useState<ResumenGarantias | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listGarantias({
        page, limit: PAGE_LIMIT,
        q: q || undefined,
        estado: estado || undefined,
        por_vencer_30d: porVencer || undefined,
      });
      setData(r.data);
      setTotal(r.pagination.total);
    } finally {
      setLoading(false);
    }
  }, [page, q, estado, porVencer]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { getResumenGarantias().then((r) => setResumen(r.data)).catch(() => setResumen(null)); }, []);

  useEffect(() => {
    const t = setTimeout(() => { setPage(1); setQ(qInput.trim()); }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { label: "Garantías" }]}
        title="Garantías"
        titleAccent="y posventa"
        meta={resumen ? <span>{resumen.vigentes} vigentes · {resumen.por_vencer_30d} por vencer · {resumen.reclamos_abiertos} reclamos</span> : undefined}
        liveIndicator={resumen ? { label: "live", tone: resumen.reclamos_abiertos > 0 || resumen.vencidas_no_cerradas > 0 ? "copper" : "green" } : undefined}
      />

      <div className="space-y-6 pt-6">
        {resumen && (
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              icon={<ShieldCheck className="h-3.5 w-3.5" />}
              label="Vigentes"
              value={resumen.vigentes}
              sub="Cobertura activa"
              tone="green"
            />
            <StatCard
              icon={<Clock className="h-3.5 w-3.5" />}
              label={`Por vencer 30d${porVencer ? " · filtrado" : ""}`}
              value={resumen.por_vencer_30d}
              sub={resumen.por_vencer_30d > 0 ? "Clic para filtrar" : "Sin vencimientos"}
              tone={resumen.por_vencer_30d > 0 ? "amber" : "default"}
              onClick={() => { setPage(1); setPorVencer((v) => !v); }}
              active={porVencer}
            />
            <StatCard
              icon={<AlertTriangle className="h-3.5 w-3.5" />}
              label="Vencidas no cerradas"
              value={resumen.vencidas_no_cerradas}
              sub={resumen.vencidas_no_cerradas > 0 ? "Sin cierre formal" : "Todas cerradas"}
              tone={resumen.vencidas_no_cerradas > 0 ? "rose" : "default"}
            />
            <StatCard
              icon={<MessageSquareWarning className="h-3.5 w-3.5" />}
              label="Reclamos abiertos"
              value={resumen.reclamos_abiertos}
              sub={resumen.reclamos_abiertos > 0 ? "Atender posventa" : "Sin reclamos"}
              tone={resumen.reclamos_abiertos > 0 ? "rose" : "default"}
            />
          </section>
        )}

        <Panel padded={false}>
          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2 border-b border-glass px-5 py-3">
            <div className="relative flex-1 min-w-[18rem] max-w-sm">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Buscar por código, cliente, transformador…"
                className="h-8 border-glass bg-glass pl-8 text-sm"
                disabled={porVencer}
              />
            </div>
            <Select value={estado || "_"} onValueChange={(v) => { setPage(1); setEstado(v === "_" ? "" : (v as EstadoGarantia)); }} disabled={porVencer}>
              <SelectTrigger className="h-8 w-44 border-glass bg-glass text-xs"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">Todos los estados</SelectItem>
                <SelectItem value="vigente">Vigente</SelectItem>
                <SelectItem value="vencida">Vencida</SelectItem>
                <SelectItem value="suspendida">Suspendida</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
            {porVencer && (
              <Button variant="outline" size="sm" onClick={() => setPorVencer(false)} className="border-amber-500/30 bg-amber-500/[0.06] text-amber-300 hover:bg-amber-500/10">
                Quitar filtro 30d
              </Button>
            )}
          </div>

          {/* Tabla */}
          <Table>
            <TableHeader>
              <TableRow className="border-glass bg-glass hover:bg-glass">
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Código</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Cliente</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Equipo</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Origen</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Vence</TableHead>
                <TableHead className="text-center font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Reclamos</TableHead>
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
                    <Shield className="h-5 w-5" />
                    <span className="text-sm">Sin garantías que coincidan</span>
                  </div>
                </TableCell></TableRow>
              ) : data.map((g) => {
                const dias = Math.round((new Date(g.fecha_fin).getTime() - Date.now()) / 86400000);
                const vencidaProxima = g.estado === "vigente" && dias <= 30 && dias >= 0;
                return (
                  <TableRow key={g.id} className={`border-glass group ${vencidaProxima ? "bg-amber-500/[0.04] hover:bg-amber-500/[0.08]" : "hover:bg-glass"}`}>
                    <TableCell className="font-mono text-xs text-foreground/90">{g.codigo}</TableCell>
                    <TableCell className="text-sm">{g.clientes?.razon_social ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {g.transformadores ? (
                        <>
                          <p className="font-mono font-medium text-foreground/90">{g.transformadores.codigo_interno}</p>
                          <p className="font-mono text-[10.5px] text-muted-foreground">
                            {g.transformadores.marca} · <span className="text-ttteal">{g.transformadores.capacidad_kva >= 1000 ? `${(g.transformadores.capacidad_kva / 1000).toFixed(0)} MVA` : `${g.transformadores.capacidad_kva} kVA`}</span>
                          </p>
                        </>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-foreground/80">{g.ot?.codigo ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      <span className="text-foreground/80">{g.fecha_fin.split("T")[0]}</span>
                      {g.estado === "vigente" && (
                        <span className={`ml-1.5 rounded px-1 py-0.5 text-[10px] ${dias < 0 ? "bg-rose-500/15 text-rose-300" : dias <= 30 ? "bg-amber-500/15 text-amber-300" : "text-muted-foreground/60"}`}>
                          {dias >= 0 ? "+" : ""}{dias}d
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-xs">
                      {g._count?.reclamos ? (
                        <Badge variant="outline">{g._count.reclamos}</Badge>
                      ) : <span className="text-muted-foreground/50">—</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={estadoGarVariant(g.estado)}>{g.estado}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" asChild className="text-muted-foreground hover:bg-glass-elev hover:text-copper">
                        <Link href={`/garantias/${g.id}`}><Eye className="h-3.5 w-3.5" /></Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Paginación */}
          <div className="flex items-center justify-between border-t border-glass px-5 py-3 text-sm">
            <p className="font-mono text-[11px] text-muted-foreground">
              {total === 0 ? "Sin resultados" : `${total} garantía${total === 1 ? "" : "s"} · página ${page}/${totalPages}`}
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
