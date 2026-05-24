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

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getResumenExpedientes()
      .then((r) => setResumen(r.data))
      .catch(() => setResumen(null));
  }, []);

  // Debounce busqueda
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
          <h2 className="text-3xl font-bold">Expedientes</h2>
          <p className="text-muted-foreground">Pedidos de cliente: hoja de ruta y monitoreo</p>
        </div>
        <Button asChild>
          <Link href="/expedientes/nuevo">
            <Plus className="mr-2 h-4 w-4" /> Nuevo expediente
          </Link>
        </Button>
      </header>

      {/* KPIs */}
      {resumen && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-md border p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-primary/10 p-2">
                <FolderOpen className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Activos</p>
                <p className="text-2xl font-bold">{resumen.total_activos}</p>
              </div>
            </div>
          </div>
          <button
            type="button"
            className={`rounded-md border p-4 text-left transition hover:bg-accent ${soloEstancados ? "border-destructive bg-destructive/5" : ""}`}
            onClick={() => {
              setPage(1);
              setSoloEstancados((v) => !v);
            }}
          >
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-destructive/10 p-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Estancados {soloEstancados && "(filtrado)"}
                </p>
                <p className="text-2xl font-bold text-destructive">{resumen.total_estancados}</p>
              </div>
            </div>
          </button>
          <div className="rounded-md border p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-green-100 p-2">
                <TrendingUp className="h-5 w-5 text-green-700" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ganados</p>
                <p className="text-2xl font-bold">{resumen.por_estado["ganado"] ?? 0}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Buscar por codigo, RUC o cliente"
            className="pl-9"
            disabled={soloEstancados}
          />
        </div>
        <Select
          value={estado || "_"}
          onValueChange={(v) => {
            setPage(1);
            setEstado(v === "_" ? "" : (v as EstadoExpediente));
          }}
          disabled={soloEstancados}
        >
          <SelectTrigger className="w-44"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_">Todos los estados</SelectItem>
            <SelectItem value="activo">Activo</SelectItem>
            <SelectItem value="ganado">Ganado</SelectItem>
            <SelectItem value="perdido">Perdido</SelectItem>
            <SelectItem value="cancelado">Cancelado</SelectItem>
          </SelectContent>
        </Select>
        {soloEstancados && (
          <Button variant="outline" size="sm" onClick={() => setSoloEstancados(false)}>
            Quitar filtro de estancados
          </Button>
        )}
      </div>

      {/* Tabla */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Codigo</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead>Apertura</TableHead>
              <TableHead>Ejecutivo</TableHead>
              {soloEstancados && <TableHead>Hito estancado</TableHead>}
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={soloEstancados ? 9 : 8} className="text-center text-muted-foreground">
                  Cargando...
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={soloEstancados ? 9 : 8} className="text-center text-destructive">
                  {error}
                </TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={soloEstancados ? 9 : 8} className="text-center text-muted-foreground">
                  {soloEstancados ? "Sin expedientes estancados" : "Sin expedientes que coincidan"}
                </TableCell>
              </TableRow>
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
                  <TableRow key={`${r.expediente_id}-${r.hito_codigo}`} className="bg-destructive/5">
                    <TableCell className="font-mono text-sm">{r.expediente_codigo}</TableCell>
                    <TableCell className="font-medium">{r.cliente_nombre}</TableCell>
                    <TableCell colSpan={3} className="text-sm">
                      <Badge variant="destructive" className="mr-2">
                        <AlertTriangle className="mr-1 h-3 w-3" /> {r.hito_nombre}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
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
                      <Button variant="ghost" size="icon" asChild>
                        <Link href={`/expedientes/${r.expediente_id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              data.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-sm">{e.codigo}</TableCell>
                  <TableCell className="font-medium">
                    {e.clientes?.razon_social ?? "—"}
                    <div className="text-xs text-muted-foreground font-mono">{e.clientes?.ruc_cedula}</div>
                  </TableCell>
                  <TableCell className="capitalize text-sm">
                    {e.tipo_servicio_confirmado ?? e.tipo_servicio_estimado ?? "—"}
                    {!e.tipo_servicio_confirmado && (
                      <span className="ml-1 text-xs text-muted-foreground">(est.)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{canalOrigenLabel(e.canal_origen)}</TableCell>
                  <TableCell className="text-sm">{e.fecha_apertura.split("T")[0]}</TableCell>
                  <TableCell className="text-sm">
                    {e.usuarios_expedientes_ejecutivo_idTousuarios
                      ? `${e.usuarios_expedientes_ejecutivo_idTousuarios.nombres} ${e.usuarios_expedientes_ejecutivo_idTousuarios.apellidos}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={estadoExpedienteVariant(e.estado)}>{e.estado}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" asChild>
                      <Link href={`/expedientes/${e.id}`} aria-label={`Ver ${e.codigo}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {!soloEstancados && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            {total === 0
              ? "Sin resultados"
              : `${total} expediente${total === 1 ? "" : "s"} - pagina ${page}/${totalPages}`}
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
      )}

      <Toaster richColors position="top-right" />
    </div>
  );
}
