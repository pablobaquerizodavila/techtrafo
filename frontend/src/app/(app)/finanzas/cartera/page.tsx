"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, AlertTriangle } from "lucide-react";
import { PageHeader, HeaderActionGhost } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CarteraRow, getCarteraVencida, fmtMoneda, TIPO_LABEL } from "@/lib/finanzas";
import { ApiError } from "@/lib/api";

function colorDias(d: number): string {
  if (d > 90) return "text-rose-400";
  if (d > 30) return "text-orange-400";
  return "text-amber-400";
}

export default function CarteraVencidaPage() {
  const [rows, setRows] = useState<CarteraRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tipo, setTipo] = useState<string>("_");
  const [q, setQ] = useState("");

  useEffect(() => {
    getCarteraVencida()
      .then((r) => setRows(r.data))
      .catch((err) => setError(err instanceof ApiError ? (err.status === 403 ? "Sin permiso" : `Error ${err.status}`) : "Error cargando"))
      .finally(() => setLoading(false));
  }, []);

  const filtradas = useMemo(() => rows.filter((r) =>
    (tipo === "_" || r.tipo_servicio === tipo) &&
    (q.trim() === "" || (r.cliente ?? "").toLowerCase().includes(q.toLowerCase()) || (r.contrato_codigo ?? "").toLowerCase().includes(q.toLowerCase())),
  ), [rows, tipo, q]);

  const total = filtradas.reduce((acc, r) => acc + r.monto_pendiente, 0);

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { href: "/finanzas", label: "Finanzas" }, { label: "Cartera vencida" }]}
        title="Cartera"
        titleAccent="vencida"
        meta={<span>{filtradas.length} cuotas vencidas · <span className="font-mono text-rose-300">{fmtMoneda(total)}</span> en mora</span>}
        actions={<HeaderActionGhost href="/finanzas" icon={<ChevronLeft className="h-3.5 w-3.5" />}>Volver</HeaderActionGhost>}
      />

      <div className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente o contrato…" className="h-9 w-64 border-glass bg-glass text-sm" />
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger className="h-9 w-44 border-glass bg-glass text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_">Todos los tipos</SelectItem>
              <SelectItem value="fabricacion">Fabricación</SelectItem>
              <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
              <SelectItem value="reparacion">Reparación</SelectItem>
              <SelectItem value="otro">Otro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Panel padded={false}>
          <Table>
            <TableHeader>
              <TableRow className="border-glass bg-glass hover:bg-glass">
                <TableHead className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Contrato</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Cliente</TableHead>
                <TableHead className="w-28 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Tipo</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Cuota</TableHead>
                <TableHead className="w-28 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Vencía</TableHead>
                <TableHead className="w-24 text-right font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Días</TableHead>
                <TableHead className="w-32 text-right font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Pendiente</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Cargando…</TableCell></TableRow>
              ) : error ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-rose-300">{error}</TableCell></TableRow>
              ) : filtradas.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-10 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <AlertTriangle className="h-5 w-5" /><span className="text-sm">Sin cartera vencida 👍</span>
                  </div>
                </TableCell></TableRow>
              ) : filtradas.map((r) => (
                <TableRow key={`${r.contrato_id}-${r.pago_numero}`} className="border-glass hover:bg-glass">
                  <TableCell>
                    <Link href={`/contratos/${r.contrato_id}`} className="font-mono text-xs text-copper hover:underline">{r.contrato_codigo ?? `#${r.contrato_id}`}</Link>
                  </TableCell>
                  <TableCell className="text-sm">{r.cliente ?? "—"}</TableCell>
                  <TableCell className="text-xs text-foreground/80">{TIPO_LABEL[r.tipo_servicio] ?? r.tipo_servicio}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">#{r.pago_numero} {r.descripcion ?? ""}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{r.fecha_esperada ?? "—"}</TableCell>
                  <TableCell className={`text-right font-mono text-sm font-semibold ${colorDias(r.dias_vencido)}`}>{r.dias_vencido}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold text-rose-300">{fmtMoneda(r.monto_pendiente)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      </div>
    </div>
  );
}
