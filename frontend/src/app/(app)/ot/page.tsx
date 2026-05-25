"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search, Eye, AlertTriangle, Factory, Zap, Clock, Activity } from "lucide-react";
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
import { Panel, StatCard } from "@/components/panel";
import {
  OT, EstadoOT, TipoRuta, PrioridadOT,
  estadoOTVariant, prioridadVariant, tipoRutaLabel,
  getResumenOT, listOT,
} from "@/lib/ot";

const PAGE_LIMIT = 25;

interface Resumen {
  por_estado: Record<string, number>;
  urgentes_abiertas: number;
  atrasadas: number;
}

export default function OTPage() {
  const [data, setData] = useState<OT[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<EstadoOT | "">("");
  const [tipoRuta, setTipoRuta] = useState<TipoRuta | "">("");
  const [prioridad, setPrioridad] = useState<PrioridadOT | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listOT({
        page, limit: PAGE_LIMIT,
        q: q || undefined,
        estado: estado || undefined,
        tipo_ruta: tipoRuta || undefined,
        prioridad: prioridad || undefined,
      });
      setData(res.data);
      setTotal(res.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando OT");
    } finally {
      setLoading(false);
    }
  }, [page, q, estado, tipoRuta, prioridad]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    getResumenOT().then((r) => setResumen(r.data)).catch(() => setResumen(null));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setQ(qInput.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));
  const totalKpi = resumen
    ? (resumen.por_estado["en_curso"] ?? 0) +
      (resumen.por_estado["planeada"] ?? 0) +
      (resumen.por_estado["pausada"] ?? 0)
    : 0;

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { label: "Órdenes de trabajo" }]}
        title="Órdenes"
        titleAccent="de trabajo"
        meta={resumen ? <span>{totalKpi} OT activas · {resumen.atrasadas} atrasadas · {resumen.urgentes_abiertas} urgentes</span> : undefined}
        liveIndicator={resumen ? { label: "live", tone: resumen.atrasadas > 0 ? "copper" : "green" } : undefined}
        actions={
          <HeaderActionPrimary href="/ot/nueva" icon={<Plus className="h-3.5 w-3.5" />}>
            Nueva OT
          </HeaderActionPrimary>
        }
      />

      <div className="space-y-6 pt-6">
        {/* KPIs */}
        {resumen && (
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              icon={<Activity className="h-3.5 w-3.5" />}
              label="En curso"
              value={resumen.por_estado["en_curso"] ?? 0}
              sub={`${resumen.por_estado["planeada"] ?? 0} planeadas`}
              tone="copper"
            />
            <StatCard
              icon={<Clock className="h-3.5 w-3.5" />}
              label="Planeadas"
              value={resumen.por_estado["planeada"] ?? 0}
              sub="Aún no inician"
            />
            <StatCard
              icon={<Zap className="h-3.5 w-3.5" />}
              label="Urgentes abiertas"
              value={resumen.urgentes_abiertas}
              sub={resumen.urgentes_abiertas > 0 ? "Prioridad URG" : "Sin urgentes"}
              tone={resumen.urgentes_abiertas > 0 ? "rose" : "default"}
            />
            <StatCard
              icon={<AlertTriangle className="h-3.5 w-3.5" />}
              label="Atrasadas"
              value={resumen.atrasadas}
              sub={resumen.atrasadas > 0 ? "Fin planeado vencido" : "Sin atrasos"}
              tone={resumen.atrasadas > 0 ? "rose" : "default"}
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
                placeholder="Buscar por código, contrato, cliente…"
                className="h-8 border-glass bg-glass pl-8 text-sm"
              />
            </div>
            <Select value={estado || "_"} onValueChange={(v) => { setPage(1); setEstado(v === "_" ? "" : (v as EstadoOT)); }}>
              <SelectTrigger className="h-8 w-40 border-glass bg-glass text-xs"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">Todos los estados</SelectItem>
                <SelectItem value="planeada">Planeada</SelectItem>
                <SelectItem value="en_curso">En curso</SelectItem>
                <SelectItem value="pausada">Pausada</SelectItem>
                <SelectItem value="completada">Completada</SelectItem>
                <SelectItem value="cancelada">Cancelada</SelectItem>
              </SelectContent>
            </Select>
            <Select value={tipoRuta || "_"} onValueChange={(v) => { setPage(1); setTipoRuta(v === "_" ? "" : (v as TipoRuta)); }}>
              <SelectTrigger className="h-8 w-40 border-glass bg-glass text-xs"><SelectValue placeholder="Tipo ruta" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">Todas las rutas</SelectItem>
                <SelectItem value="reparacion">Reparación</SelectItem>
                <SelectItem value="fabricacion">Fabricación</SelectItem>
                <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
              </SelectContent>
            </Select>
            <Select value={prioridad || "_"} onValueChange={(v) => { setPage(1); setPrioridad(v === "_" ? "" : (v as PrioridadOT)); }}>
              <SelectTrigger className="h-8 w-36 border-glass bg-glass text-xs"><SelectValue placeholder="Prioridad" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">Todas</SelectItem>
                <SelectItem value="urgente">Urgente</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="baja">Baja</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tabla */}
          <Table>
            <TableHeader>
              <TableRow className="border-glass bg-glass hover:bg-glass">
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Código</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Cliente / Contrato</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Tipo</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Prioridad</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Responsable</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Fin planeado</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Pasos</TableHead>
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
                    <Factory className="h-5 w-5" />
                    <span className="text-sm">Sin OT que coincidan</span>
                  </div>
                </TableCell></TableRow>
              ) : (
                data.map((ot) => {
                  const atrasada = ot.fecha_fin_planeada && new Date(ot.fecha_fin_planeada) < new Date()
                    && ["planeada", "en_curso", "pausada"].includes(ot.estado);
                  return (
                    <TableRow key={ot.id} className={`border-glass group ${atrasada ? "bg-rose-500/[0.04] hover:bg-rose-500/[0.08]" : "hover:bg-glass"}`}>
                      <TableCell className="font-mono text-xs text-foreground/90">{ot.codigo ?? "—"}</TableCell>
                      <TableCell>
                        <p className="font-medium">{ot.contratos?.clientes?.razon_social ?? "—"}</p>
                        <p className="font-mono text-xs text-muted-foreground">{ot.contratos?.codigo}</p>
                      </TableCell>
                      <TableCell className="text-sm text-foreground/80">{tipoRutaLabel(ot.tipo_ruta)}</TableCell>
                      <TableCell>
                        <Badge variant={prioridadVariant(ot.prioridad)}>{ot.prioridad}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-foreground/80">
                        {ot.usuarios_ot_responsable_idTousuarios
                          ? `${ot.usuarios_ot_responsable_idTousuarios.nombres} ${ot.usuarios_ot_responsable_idTousuarios.apellidos}`
                          : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <span className={atrasada ? "text-rose-300" : "text-foreground/80"}>
                          {ot.fecha_fin_planeada?.split("T")[0] ?? "—"}
                        </span>
                        {atrasada && <AlertTriangle className="ml-1 inline h-3 w-3 text-rose-400" />}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {ot._count?.ot_pasos ?? 0}
                      </TableCell>
                      <TableCell><Badge variant={estadoOTVariant(ot.estado)}>{ot.estado.replaceAll("_", " ")}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" asChild className="text-muted-foreground hover:bg-glass-elev hover:text-copper">
                          <Link href={`/ot/${ot.id}`} aria-label={`Ver ${ot.codigo}`}>
                            <Eye className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          {/* Paginación */}
          <div className="flex items-center justify-between border-t border-glass px-5 py-3 text-sm">
            <p className="font-mono text-[11px] text-muted-foreground">
              {total === 0 ? "Sin resultados" : `${total} OT · página ${page}/${totalPages}`}
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
