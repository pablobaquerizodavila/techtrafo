"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search, Eye, AlertTriangle, Factory, Zap, Clock } from "lucide-react";
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

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Órdenes de Trabajo</h2>
          <p className="text-muted-foreground">Planificación y ejecución en planta</p>
        </div>
        <Button asChild>
          <Link href="/ot/nueva">
            <Plus className="mr-2 h-4 w-4" /> Nueva OT
          </Link>
        </Button>
      </header>

      {resumen && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <KpiCard
            icon={<Factory className="h-5 w-5 text-primary" />}
            label="En curso"
            value={resumen.por_estado["en_curso"] ?? 0}
            tone="primary"
          />
          <KpiCard
            icon={<Clock className="h-5 w-5 text-yellow-700" />}
            label="Planeadas"
            value={resumen.por_estado["planeada"] ?? 0}
            tone="muted"
          />
          <KpiCard
            icon={<Zap className="h-5 w-5 text-destructive" />}
            label="Urgentes abiertas"
            value={resumen.urgentes_abiertas}
            tone="destructive"
          />
          <KpiCard
            icon={<AlertTriangle className="h-5 w-5 text-destructive" />}
            label="Atrasadas"
            value={resumen.atrasadas}
            tone="destructive"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Buscar por código, contrato, cliente"
            className="pl-9"
          />
        </div>
        <Select value={estado || "_"} onValueChange={(v) => { setPage(1); setEstado(v === "_" ? "" : (v as EstadoOT)); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Estado" /></SelectTrigger>
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
          <SelectTrigger className="w-44"><SelectValue placeholder="Tipo ruta" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_">Todas las rutas</SelectItem>
            <SelectItem value="reparacion">Reparación</SelectItem>
            <SelectItem value="fabricacion">Fabricación</SelectItem>
            <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
          </SelectContent>
        </Select>
        <Select value={prioridad || "_"} onValueChange={(v) => { setPage(1); setPrioridad(v === "_" ? "" : (v as PrioridadOT)); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Prioridad" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_">Todas</SelectItem>
            <SelectItem value="urgente">Urgente</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="baja">Baja</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Cliente / Contrato</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Prioridad</TableHead>
              <TableHead>Responsable</TableHead>
              <TableHead>Fin planeado</TableHead>
              <TableHead>Pasos</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : error ? (
              <TableRow><TableCell colSpan={9} className="text-center text-destructive">{error}</TableCell></TableRow>
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Sin OT que coincidan</TableCell></TableRow>
            ) : (
              data.map((ot) => {
                const atrasada = ot.fecha_fin_planeada && new Date(ot.fecha_fin_planeada) < new Date()
                  && ["planeada", "en_curso", "pausada"].includes(ot.estado);
                return (
                  <TableRow key={ot.id} className={atrasada ? "bg-destructive/5" : ""}>
                    <TableCell className="font-mono text-sm">{ot.codigo ?? "—"}</TableCell>
                    <TableCell>
                      <p className="font-medium">{ot.contratos?.clientes?.razon_social ?? "—"}</p>
                      <p className="text-xs text-muted-foreground font-mono">{ot.contratos?.codigo}</p>
                    </TableCell>
                    <TableCell className="text-sm">{tipoRutaLabel(ot.tipo_ruta)}</TableCell>
                    <TableCell>
                      <Badge variant={prioridadVariant(ot.prioridad)}>{ot.prioridad}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {ot.usuarios_ot_responsable_idTousuarios
                        ? `${ot.usuarios_ot_responsable_idTousuarios.nombres} ${ot.usuarios_ot_responsable_idTousuarios.apellidos}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {ot.fecha_fin_planeada?.split("T")[0] ?? "—"}
                      {atrasada && <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-destructive" />}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {ot._count?.ot_pasos ?? 0} pasos
                    </TableCell>
                    <TableCell><Badge variant={estadoOTVariant(ot.estado)}>{ot.estado}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" asChild>
                        <Link href={`/ot/${ot.id}`} aria-label={`Ver ${ot.codigo}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <p className="text-muted-foreground">
          {total === 0 ? "Sin resultados" : `${total} OT - página ${page}/${totalPages}`}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Anterior</Button>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Siguiente</Button>
        </div>
      </div>

      <Toaster richColors position="top-right" />
    </div>
  );
}

function KpiCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "primary" | "muted" | "destructive" }) {
  const bg = tone === "destructive" ? "bg-destructive/10" : tone === "primary" ? "bg-primary/10" : "bg-muted";
  const text = tone === "destructive" ? "text-destructive" : "";
  return (
    <div className="rounded-md border p-4">
      <div className="flex items-center gap-3">
        <div className={`rounded-md p-2 ${bg}`}>{icon}</div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`text-2xl font-bold ${text}`}>{value}</p>
        </div>
      </div>
    </div>
  );
}
