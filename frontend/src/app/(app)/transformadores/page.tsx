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
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-3xl font-bold">
            <Zap className="h-7 w-7" /> Transformadores
          </h2>
          <p className="text-muted-foreground">Equipos del cliente — historial completo de intervenciones</p>
        </div>
        <Button asChild>
          <Link href="/transformadores/nuevo">
            <Plus className="mr-2 h-4 w-4" /> Nuevo transformador
          </Link>
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Buscar código, serie, marca, cliente"
            className="pl-9"
          />
        </div>
        <Select value={tipo || "_"} onValueChange={(v) => { setPage(1); setTipo(v === "_" ? "" : (v as TipoTransformador)); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Tipo" /></SelectTrigger>
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
          <SelectTrigger className="w-44"><SelectValue placeholder="Estado" /></SelectTrigger>
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

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Marca / Modelo</TableHead>
              <TableHead>Serie</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Capacidad</TableHead>
              <TableHead className="text-center">Intervenciones</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : error ? (
              <TableRow><TableCell colSpan={9} className="text-center text-destructive">{error}</TableCell></TableRow>
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Sin transformadores. Agregá el primero con "Nuevo transformador"</TableCell></TableRow>
            ) : (
              data.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-sm">{t.codigo_interno ?? "—"}</TableCell>
                  <TableCell>
                    <p className="font-medium">{t.marca ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{t.modelo ?? "—"}</p>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{t.numero_serie ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {t.clientes?.razon_social ?? <span className="text-muted-foreground">— sin asignar —</span>}
                  </TableCell>
                  <TableCell className="text-sm">{tipoLabel(t.tipo)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatCapacidad(t.capacidad_kva)}</TableCell>
                  <TableCell className="text-center text-sm">
                    {t._count?.ot ?? 0 > 0 ? (
                      <Badge variant="outline">
                        <Factory className="mr-1 h-3 w-3" /> {t._count?.ot}
                      </Badge>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell><Badge variant={estadoVariant(t.estado)}>{estadoLabel(t.estado)}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" asChild>
                      <Link href={`/transformadores/${t.id}`}><Eye className="h-4 w-4" /></Link>
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
          {total === 0 ? "Sin resultados" : `${total} transformador${total === 1 ? "" : "es"} - página ${page}/${totalPages}`}
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
