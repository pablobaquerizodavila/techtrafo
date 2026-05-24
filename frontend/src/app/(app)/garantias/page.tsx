"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, AlertTriangle, Clock, MessageSquareWarning, Eye, Search } from "lucide-react";
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
    <div className="space-y-6">
      <header>
        <h2 className="flex items-center gap-2 text-3xl font-bold">
          <ShieldCheck className="h-7 w-7" /> Garantías
        </h2>
        <p className="text-muted-foreground">Cobertura activa de equipos entregados</p>
      </header>

      {resumen && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi icon={<ShieldCheck className="h-4 w-4 text-green-700" />} label="Vigentes" value={resumen.vigentes} tone="success" />
          <button
            type="button"
            className={`rounded-md border p-3 text-left transition hover:bg-accent ${porVencer ? "border-yellow-500 bg-yellow-50" : ""}`}
            onClick={() => { setPage(1); setPorVencer((v) => !v); }}
          >
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-4 w-4 text-yellow-600" /> Por vencer 30d
            </div>
            <p className="text-2xl font-bold text-yellow-700">{resumen.por_vencer_30d}</p>
          </button>
          <Kpi icon={<AlertTriangle className="h-4 w-4 text-destructive" />} label="Vencidas no cerradas" value={resumen.vencidas_no_cerradas} tone={resumen.vencidas_no_cerradas > 0 ? "destructive" : "muted"} />
          <Kpi icon={<MessageSquareWarning className="h-4 w-4 text-destructive" />} label="Reclamos abiertos" value={resumen.reclamos_abiertos} tone={resumen.reclamos_abiertos > 0 ? "destructive" : "muted"} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Buscar por código, cliente, trafo" className="pl-9" disabled={porVencer} />
        </div>
        <Select value={estado || "_"} onValueChange={(v) => { setPage(1); setEstado(v === "_" ? "" : (v as EstadoGarantia)); }} disabled={porVencer}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_">Todos los estados</SelectItem>
            <SelectItem value="vigente">Vigente</SelectItem>
            <SelectItem value="vencida">Vencida</SelectItem>
            <SelectItem value="suspendida">Suspendida</SelectItem>
            <SelectItem value="cancelada">Cancelada</SelectItem>
          </SelectContent>
        </Select>
        {porVencer && (
          <Button variant="outline" size="sm" onClick={() => setPorVencer(false)}>Quitar filtro 30d</Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Equipo</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead>Vence</TableHead>
              <TableHead className="text-center">Reclamos</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Sin garantías que coincidan</TableCell></TableRow>
            ) : data.map((g) => {
              const dias = Math.round((new Date(g.fecha_fin).getTime() - Date.now()) / 86400000);
              const vencidaProxima = g.estado === "vigente" && dias <= 30 && dias >= 0;
              return (
                <TableRow key={g.id} className={vencidaProxima ? "bg-yellow-50/50" : ""}>
                  <TableCell className="font-mono text-sm">{g.codigo}</TableCell>
                  <TableCell className="text-sm">{g.clientes?.razon_social ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {g.transformadores ? (
                      <>
                        <p className="font-medium">{g.transformadores.codigo_interno}</p>
                        <p className="text-muted-foreground">
                          {g.transformadores.marca} · {g.transformadores.capacidad_kva >= 1000
                            ? `${(g.transformadores.capacidad_kva / 1000).toFixed(0)} MVA`
                            : `${g.transformadores.capacidad_kva} kVA`}
                        </p>
                      </>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-xs">{g.ot?.codigo ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {g.fecha_fin.split("T")[0]}
                    {g.estado === "vigente" && (
                      <span className={`ml-1 ${dias < 0 ? "text-destructive font-semibold" : dias <= 30 ? "text-yellow-700" : "text-muted-foreground"}`}>
                        ({dias >= 0 ? "+" : ""}{dias}d)
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-center text-xs">
                    {g._count?.reclamos ? (
                      <Badge variant="outline">{g._count.reclamos}</Badge>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={estadoGarVariant(g.estado)}>{g.estado}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" asChild>
                      <Link href={`/garantias/${g.id}`}><Eye className="h-4 w-4" /></Link>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <p className="text-muted-foreground">{total === 0 ? "Sin resultados" : `${total} garantía(s) · página ${page}/${totalPages}`}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Anterior</Button>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Siguiente</Button>
        </div>
      </div>

      <Toaster richColors position="top-right" />
    </div>
  );
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone?: "success" | "destructive" | "muted" }) {
  const cls = tone === "success" ? "border-green-500/30 bg-green-50/50"
    : tone === "destructive" ? "border-destructive/30 bg-destructive/5"
    : "";
  return (
    <div className={`rounded-md border p-3 ${cls}`}>
      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
