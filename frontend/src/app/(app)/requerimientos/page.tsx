"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus, Search, Eye, Download, ClipboardList, Inbox, Wrench, Hammer,
  HelpCircle, CheckCircle2, AlertTriangle,
} from "lucide-react";
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
import { PageHeader, HeaderActionPrimary, HeaderActionGhost } from "@/components/page-header";
import { Panel, StatCard } from "@/components/panel";
import {
  Requerimiento, ResumenReq, EstadoReq, PrioridadReq, TipoReq,
  estadoReqVariant, prioridadReqVariant, estadoReqLabel, tipoReqLabel,
  solicitanteNombre, responsableNombre,
  listar, resumen, urlExport,
  ESTADOS, PRIORIDADES, TIPOS, BANDEJAS,
} from "@/lib/requerimientos";

const PAGE_LIMIT = 25;

function fechaCorta(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" });
}

export default function RequerimientosPage() {
  const [data, setData] = useState<Requerimiento[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<EstadoReq | "">("");
  const [prioridad, setPrioridad] = useState<PrioridadReq | "">("");
  const [tipo, setTipo] = useState<TipoReq | "">("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [bandeja, setBandeja] = useState("todos");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<ResumenReq | null>(null);

  const filtros = {
    q: q || undefined,
    estado: estado || undefined,
    prioridad: prioridad || undefined,
    tipo: tipo || undefined,
    desde: desde || undefined,
    hasta: hasta || undefined,
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await listar({
        page, limit: PAGE_LIMIT, bandeja,
        q: q || undefined,
        estado: estado || undefined,
        prioridad: prioridad || undefined,
        tipo: tipo || undefined,
        desde: desde || undefined,
        hasta: hasta || undefined,
      });
      setData(r.data);
      setTotal(r.pagination.total);
      setTotalPages(Math.max(1, r.pagination.total_pages));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando requerimientos");
    } finally {
      setLoading(false);
    }
  }, [page, bandeja, q, estado, prioridad, tipo, desde, hasta]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    resumen({ bandeja }).then((r) => setRes(r.data)).catch(() => setRes(null));
  }, [bandeja]);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setQ(qInput.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const porEstado = res?.por_estado ?? {};

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { label: "Requerimientos" }]}
        title="Requerimientos"
        titleAccent="de desarrollo"
        meta={res ? <span>{res.total} en total · {res.vencidos} vencidos</span> : undefined}
        liveIndicator={res ? { label: "live", tone: res.vencidos > 0 ? "copper" : "green" } : undefined}
        actions={
          <>
            <HeaderActionGhost href={urlExport({ ...filtros, bandeja })} icon={<Download className="h-3.5 w-3.5" />}>
              Exportar CSV
            </HeaderActionGhost>
            <HeaderActionPrimary href="/requerimientos/nueva" icon={<Plus className="h-3.5 w-3.5" />}>
              Nuevo requerimiento
            </HeaderActionPrimary>
          </>
        }
      />

      <div className="space-y-6 pt-6">
        {/* Bandejas */}
        <div className="flex flex-wrap gap-1.5">
          {BANDEJAS.map((b) => {
            const activa = bandeja === b.key;
            return (
              <button
                key={b.key}
                type="button"
                onClick={() => { setBandeja(b.key); setPage(1); }}
                className={`rounded-lg border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition ${
                  activa
                    ? "border-copper/40 bg-copper/10 text-copper glow-copper-sm"
                    : "border-glass bg-glass text-muted-foreground hover:border-glass-mid hover:bg-glass-elev hover:text-foreground/80"
                }`}
              >
                {b.label}
              </button>
            );
          })}
        </div>

        {/* KPIs */}
        {res && (
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <StatCard icon={<ClipboardList className="h-3.5 w-3.5" />} label="Total" value={res.total} tone="copper" />
            <StatCard icon={<Inbox className="h-3.5 w-3.5" />} label="Nuevos" value={porEstado["registrado"] ?? 0} sub="Sin revisar" />
            <StatCard icon={<Search className="h-3.5 w-3.5" />} label="En revisión" value={porEstado["en_revision"] ?? 0} tone="amber" />
            <StatCard icon={<Hammer className="h-3.5 w-3.5" />} label="En desarrollo" value={porEstado["en_desarrollo"] ?? 0} tone="teal" />
            <StatCard icon={<HelpCircle className="h-3.5 w-3.5" />} label="Pend. info" value={porEstado["pendiente_informacion"] ?? 0} tone="amber" />
            <StatCard icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Completados" value={porEstado["completado"] ?? 0} tone="green" />
            <StatCard
              icon={<AlertTriangle className="h-3.5 w-3.5" />}
              label="Vencidos"
              value={res.vencidos}
              sub={res.vencidos > 0 ? "Fecha requerida vencida" : "Sin vencidos"}
              tone={res.vencidos > 0 ? "rose" : "default"}
            />
          </section>
        )}

        <Panel padded={false}>
          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2 border-b border-glass px-5 py-3">
            <div className="relative flex-1 min-w-[16rem] max-w-sm">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Buscar por código, título, descripción…"
                className="h-8 border-glass bg-glass pl-8 text-sm"
              />
            </div>
            <Select value={estado || "_"} onValueChange={(v) => { setPage(1); setEstado(v === "_" ? "" : (v as EstadoReq)); }}>
              <SelectTrigger className="h-8 w-44 border-glass bg-glass text-xs"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">Todos los estados</SelectItem>
                {ESTADOS.map((e) => (<SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={prioridad || "_"} onValueChange={(v) => { setPage(1); setPrioridad(v === "_" ? "" : (v as PrioridadReq)); }}>
              <SelectTrigger className="h-8 w-36 border-glass bg-glass text-xs"><SelectValue placeholder="Prioridad" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">Todas las prioridades</SelectItem>
                {PRIORIDADES.map((p) => (<SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={tipo || "_"} onValueChange={(v) => { setPage(1); setTipo(v === "_" ? "" : (v as TipoReq)); }}>
              <SelectTrigger className="h-8 w-44 border-glass bg-glass text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">Todos los tipos</SelectItem>
                {TIPOS.map((t) => (<SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={desde}
              onChange={(e) => { setPage(1); setDesde(e.target.value); }}
              className="h-8 w-36 border-glass bg-glass text-xs"
              aria-label="Desde"
            />
            <Input
              type="date"
              value={hasta}
              min={desde}
              onChange={(e) => { setPage(1); setHasta(e.target.value); }}
              className="h-8 w-36 border-glass bg-glass text-xs"
              aria-label="Hasta"
            />
          </div>

          {/* Tabla */}
          <Table>
            <TableHeader>
              <TableRow className="border-glass bg-glass hover:bg-glass">
                {["Código", "Título", "Tipo", "Estado", "Prioridad", "Solicitante", "Responsable", "Creado", "Últ. actualización"].map((h) => (
                  <TableHead key={h} className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">{h}</TableHead>
                ))}
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">Cargando…</TableCell></TableRow>
              ) : error ? (
                <TableRow><TableCell colSpan={10} className="py-8 text-center text-sm text-rose-400">{error}</TableCell></TableRow>
              ) : data.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="py-10 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <ClipboardList className="h-5 w-5" />
                    <span className="text-sm">Sin requerimientos que coincidan</span>
                  </div>
                </TableCell></TableRow>
              ) : (
                data.map((r) => (
                  <TableRow key={r.id} className="group border-glass hover:bg-glass">
                    <TableCell className="font-mono text-xs text-foreground/90">{r.codigo}</TableCell>
                    <TableCell className="max-w-xs">
                      <p className="truncate font-medium">{r.titulo}</p>
                      {r.modulo_relacionado && (
                        <p className="font-mono text-[10px] text-muted-foreground">{r.modulo_relacionado}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-foreground/80">{tipoReqLabel(r.tipo)}</TableCell>
                    <TableCell><Badge variant={estadoReqVariant(r.estado)}>{estadoReqLabel(r.estado)}</Badge></TableCell>
                    <TableCell><Badge variant={prioridadReqVariant(r.prioridad ?? r.prioridad_sugerida)}>{(r.prioridad ?? r.prioridad_sugerida)}</Badge></TableCell>
                    <TableCell className="text-sm text-foreground/80">{solicitanteNombre(r)}</TableCell>
                    <TableCell className="text-sm text-foreground/80">{responsableNombre(r)}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{fechaCorta(r.created_at)}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{fechaCorta(r.updated_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" asChild className="text-muted-foreground hover:bg-glass-elev hover:text-copper">
                        <Link href={`/requerimientos/${r.id}`} aria-label={`Ver ${r.codigo}`}>
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
              {total === 0 ? "Sin resultados" : `${total} requerimientos · página ${page}/${totalPages}`}
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
