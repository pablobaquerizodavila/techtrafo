"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Coins } from "lucide-react";
import { PageHeader, HeaderActionGhost } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CobroRow, getCobros, fmtMoneda, TIPO_LABEL, rangoPeriodo } from "@/lib/finanzas";
import { ApiError } from "@/lib/api";

const TIPO_PAGO_BADGE: Record<string, "copper" | "teal" | "success"> = {
  anticipo: "copper", hito: "teal", saldo: "success",
};

export default function CobrosPage() {
  const inicial = rangoPeriodo("anio");
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [tipo, setTipo] = useState<string>("_");
  const [rows, setRows] = useState<CobroRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getCobros({ desde, hasta });
      setRows(r.data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 403 ? "Sin permiso" : `Error ${err.status}`) : "Error cargando");
    } finally {
      setLoading(false);
    }
  }, [desde, hasta]);

  useEffect(() => { load(); }, [load]);

  const filtradas = useMemo(() => rows.filter((r) => tipo === "_" || r.tipo_pago === tipo), [rows, tipo]);
  const total = filtradas.reduce((acc, r) => acc + r.monto_pagado, 0);

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { href: "/finanzas", label: "Finanzas" }, { label: "Cobros" }]}
        title="Cobros"
        titleAccent="registrados"
        meta={<span>{filtradas.length} cobros · total <span className="font-mono text-green-300">{fmtMoneda(total)}</span></span>}
        actions={<HeaderActionGhost href="/finanzas" icon={<ChevronLeft className="h-3.5 w-3.5" />}>Volver</HeaderActionGhost>}
      />

      <div className="space-y-4 pt-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Desde</Label>
            <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9 border-glass bg-glass text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Hasta</Label>
            <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-9 border-glass bg-glass text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Tipo de pago</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger className="h-9 w-40 border-glass bg-glass text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">Todos</SelectItem>
                <SelectItem value="anticipo">Anticipo</SelectItem>
                <SelectItem value="hito">Hito</SelectItem>
                <SelectItem value="saldo">Saldo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Panel padded={false}>
          <Table>
            <TableHeader>
              <TableRow className="border-glass bg-glass hover:bg-glass">
                <TableHead className="w-28 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Fecha</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Contrato</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Cliente</TableHead>
                <TableHead className="w-24 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Pago</TableHead>
                <TableHead className="w-28 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Tipo orden</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Referencia</TableHead>
                <TableHead className="w-32 text-right font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Monto</TableHead>
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
                    <Coins className="h-5 w-5" /><span className="text-sm">Sin cobros en el rango</span>
                  </div>
                </TableCell></TableRow>
              ) : filtradas.map((r, i) => (
                <TableRow key={`${r.contrato_id}-${i}`} className="border-glass hover:bg-glass">
                  <TableCell className="font-mono text-xs text-muted-foreground">{r.fecha_pagado ?? "—"}</TableCell>
                  <TableCell>
                    <Link href={`/contratos/${r.contrato_id}`} className="font-mono text-xs text-copper hover:underline">{r.contrato_codigo ?? `#${r.contrato_id}`}</Link>
                  </TableCell>
                  <TableCell className="text-sm">{r.cliente ?? "—"}</TableCell>
                  <TableCell><Badge variant={TIPO_PAGO_BADGE[r.tipo_pago] ?? "muted"} className="capitalize">{r.tipo_pago}</Badge></TableCell>
                  <TableCell className="text-xs text-foreground/80">{TIPO_LABEL[r.tipo_servicio] ?? r.tipo_servicio}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.referencia ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold text-green-300">{fmtMoneda(r.monto_pagado)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      </div>
    </div>
  );
}
