"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search, Eye, AlertTriangle, FolderOpen, TrendingUp } from "lucide-react";
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
import { Panel, StatCard } from "@/components/panel";
import {
  Expediente,
  EstadoExpediente,
  canalOrigenLabel,
  estadoExpedienteVariant,
  getResumenExpedientes,
  listExpedientes,
} from "@/lib/expedientes";

const PAGE_LIMIT = 25;

interface Resumen {
  total_activos: number;
  total_estancados: number;
  por_estado: Record<string, number>;
}

export default function ExpedientesPage() {
  const [data, setData] = useState<Expediente[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<EstadoExpediente | "">("");
  const [soloEstancados, setSoloEstancados] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listExpedientes({
        page,
        limit: PAGE_LIMIT,
        q: q || undefined,
        estado: estado || undefined,
        estancados: soloEstancados || undefined,
      });
      setData(res.data);
      setTotal(res.pagination.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando expedientes");
    } finally {
      setLoading(false);
    }
  }, [page, q, estado, soloEstancados]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    getResumenExpedientes()
      .then((r) => setResumen(r.data))
      .catch(() => setResumen(null));
  }, []);

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
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { label: "Expedientes" }]}
        title="Expedientes"
        titleAccent="de cliente"
        meta={resumen ? <span>{resumen.total_activos} activos · {resumen.total_estancados} estancados · {resumen.por_estado["ganado"] ?? 0} ganados</span> : undefined}
        liveIndicator={resumen ? { label: "live", tone: resumen.total_estancados > 0 ? "copper" : "green" } : undefined}
        actions={
          <HeaderActionPrimary href="/expedientes/nuevo" icon={<Plus className="h-3.5 w-3.5" />}>
            Nuevo expediente
          </HeaderActionPrimary>
        }
      />

      <div className="space-y-6 pt-6">
        {/* KPIs */}
        {resumen && (
          <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <StatCard
              icon={<FolderOpen className="h-3.5 w-3.5" />}
              label="Activos"
              value={resumen.total_activos}
              sub="En gestión / activos"
              tone="copper"
            />
            <StatCard
              icon={<AlertTriangle className="h-3.5 w-3.5" />}
              label={`Estancados${soloEstancados ? " · filtrado" : ""}`}
              value={resumen.total_estancados}
              sub={resumen.total_estancados > 0 ? "Hitos sobre SLA · clic para filtrar" : "Ningún hito vencido"}
              tone={resumen.total_estancados > 0 ? "rose" : "default"}
              onClick={() => { setPage(1); setSoloEstancados((v) => !v); }}
              active={soloEstancados}
            />
            <StatCard
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              label="Ganados"
              value={resumen.por_estado["ganado"] ?? 0}
              sub="Convertidos a contrato"
              tone="green"
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
                placeholder="Buscar por código, RUC o cliente…"
                className="h-8 border-glass bg-glass pl-8 text-sm"
                disabled={soloEstancados}
              />
            </div>
            <Select
              value={estado || "_"}
              onValueChange={(v) => { setPage(1); setEstado(v === "_" ? "" : (v as EstadoExpediente)); }}
              disabled={soloEstancados}
            >
              <SelectTrigger className="h-8 w-44 border-glass bg-glass text-xs"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">Todos los estados</SelectItem>
                <SelectItem value="activo">Activo</SelectItem>
                <SelectItem value="ganado">Ganado</SelectItem>
                <SelectItem value="perdido">Perdido</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            {soloEstancados && (
              <Button variant="outline" size="sm" onClick={() => setSoloEstancados(false)} className="border-rose-500/30 bg-rose-500/[0.06] text-rose-300 hover:bg-rose-500/10">
                Quitar filtro de estancados
              </Button>
            )}
          </div>

          {/* Tabla */}
          <Table>
            <TableHeader>
              <TableRow className="border-glass bg-glass hover:bg-glass">
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Código</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Cliente</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Tipo</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Canal</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Apertura</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Ejecutivo</TableHead>
                {soloEstancados && <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Hito estancado</TableHead>}
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Estado</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={soloEstancados ? 9 : 8} className="py-8 text-center text-sm text-muted-foreground">Cargando…</TableCell></TableRow>
              ) : error ? (
                <TableRow><TableCell colSpan={soloEstancados ? 9 : 8} className="py-8 text-center text-sm text-rose-400">{error}</TableCell></TableRow>
              ) : data.length === 0 ? (
                <TableRow><TableCell colSpan={soloEstancados ? 9 : 8} className="py-10 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <FolderOpen className="h-5 w-5" />
                    <span className="text-sm">{soloEstancados ? "Sin expedientes estancados" : "Sin expedientes que coincidan"}</span>
                  </div>
                </TableCell></TableRow>
              ) : soloEstancados ? (
                // Modo estancados: filas de la vista (estructura distinta)
                data.map((row) => {
                  const r = row as unknown as {
                    expediente_id: number;
                    expediente_codigo: string;
                    cliente_nombre: string;
                    hito_codigo: string;
                    hito_nombre: string;
                    horas_transcurridas: number;
                    sla_horas: number;
                    expediente_estado: string;
                  };
                  return (
                    <TableRow key={`${r.expediente_id}-${r.hito_codigo}`} className="border-glass bg-rose-500/[0.04] hover:bg-rose-500/[0.08]">
                      <TableCell className="font-mono text-xs text-foreground/90">{r.expediente_codigo}</TableCell>
                      <TableCell className="font-medium">{r.cliente_nombre}</TableCell>
                      <TableCell colSpan={3} className="text-sm">
                        <Badge variant="destructive" className="mr-2">
                          <AlertTriangle className="mr-1 h-3 w-3" /> {r.hito_nombre}
                        </Badge>
                        <span className="font-mono text-xs text-muted-foreground">
                          {Number(r.horas_transcurridas).toFixed(1)}h / SLA {r.sla_horas}h
                        </span>
                      </TableCell>
                      <TableCell colSpan={2}></TableCell>
                      <TableCell>
                        <Badge variant={estadoExpedienteVariant(r.expediente_estado as EstadoExpediente)}>
                          {r.expediente_estado}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" asChild className="text-muted-foreground hover:bg-glass-elev hover:text-copper">
                          <Link href={`/expedientes/${r.expediente_id}`}>
                            <Eye className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                data.map((e) => (
                  <TableRow key={e.id} className="border-glass group hover:bg-glass">
                    <TableCell className="font-mono text-xs text-foreground/90">{e.codigo}</TableCell>
                    <TableCell>
                      <p className="font-medium">{e.clientes?.razon_social ?? "—"}</p>
                      <p className="font-mono text-xs text-muted-foreground">{e.clientes?.ruc_cedula}</p>
                    </TableCell>
                    <TableCell className="text-sm capitalize text-foreground/80">
                      {e.tipo_servicio_confirmado ?? e.tipo_servicio_estimado ?? "—"}
                      {!e.tipo_servicio_confirmado && (
                        <span className="ml-1 font-mono text-[10px] text-muted-foreground">(est.)</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-foreground/80">{canalOrigenLabel(e.canal_origen)}</TableCell>
                    <TableCell className="font-mono text-xs text-foreground/80">{e.fecha_apertura.split("T")[0]}</TableCell>
                    <TableCell className="text-sm text-foreground/80">
                      {e.usuarios_expedientes_ejecutivo_idTousuarios
                        ? `${e.usuarios_expedientes_ejecutivo_idTousuarios.nombres} ${e.usuarios_expedientes_ejecutivo_idTousuarios.apellidos}`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={estadoExpedienteVariant(e.estado)}>{e.estado}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" asChild className="text-muted-foreground hover:bg-glass-elev hover:text-copper">
                        <Link href={`/expedientes/${e.id}`} aria-label={`Ver ${e.codigo}`}>
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
          {!soloEstancados && (
            <div className="flex items-center justify-between border-t border-glass px-5 py-3 text-sm">
              <p className="font-mono text-[11px] text-muted-foreground">
                {total === 0 ? "Sin resultados" : `${total} expediente${total === 1 ? "" : "s"} · página ${page}/${totalPages}`}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="border-glass-mid bg-glass">Anterior</Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="border-glass-mid bg-glass">Siguiente</Button>
              </div>
            </div>
          )}
        </Panel>
      </div>

      <Toaster richColors position="top-right" theme="dark" />
    </div>
  );
}
