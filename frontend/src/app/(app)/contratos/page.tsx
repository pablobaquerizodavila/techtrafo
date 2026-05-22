"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Search, Eye } from "lucide-react";
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
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Contratos</h2>
          <p className="text-muted-foreground">Contratos firmados con plan de pagos</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/cotizaciones?estado=aprobada">
            Ver cotizaciones aprobadas →
          </Link>
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Buscar por codigo, RUC o cliente" className="pl-9" />
        </div>
        <Select value={estado || "_"} onValueChange={(v) => { setPage(1); setEstado(v === "_" ? "" : v as EstadoContrato); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_">Todos los estados</SelectItem>
            <SelectItem value="vigente">Vigente</SelectItem>
            <SelectItem value="suspendido">Suspendido</SelectItem>
            <SelectItem value="completado">Completado</SelectItem>
            <SelectItem value="cancelado">Cancelado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Codigo</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Cotizacion</TableHead>
              <TableHead>Firma</TableHead>
              <TableHead>Fin estimado</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Sin contratos. Convierte una cotizacion aprobada para empezar.</TableCell></TableRow>
            ) : (
              data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-sm">{c.codigo}</TableCell>
                  <TableCell className="font-medium">
                    {c.clientes?.razon_social ?? "—"}
                    <div className="text-xs text-muted-foreground font-mono">{c.clientes?.ruc_cedula}</div>
                  </TableCell>
                  <TableCell className="text-sm font-mono">{c.cotizaciones?.codigo ?? "—"}</TableCell>
                  <TableCell className="text-sm">{c.fecha_firma?.split("T")[0]}</TableCell>
                  <TableCell className="text-sm">{c.fecha_fin_estimada?.split("T")[0] ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">${Number(c.monto_total).toFixed(2)}</TableCell>
                  <TableCell><Badge variant={estadoContratoVariant(c.estado)}>{c.estado}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" asChild>
                      <Link href={`/contratos/${c.id}`} aria-label={`Ver ${c.codigo}`}>
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

      <div className="flex items-center justify-between text-sm">
        <p className="text-muted-foreground">
          {total === 0 ? "Sin resultados" : `${total} contrato${total === 1 ? "" : "s"} - pagina ${page}/${totalPages}`}
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
