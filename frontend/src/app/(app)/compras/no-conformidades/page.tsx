"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { AlertTriangle, FileWarning } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import { PageHeader, HeaderActionGhost } from "@/components/page-header";
import { Panel } from "@/components/panel";
import {
  NoConformidad,
  estadoBadge,
  getNoConformidades,
} from "@/lib/no-conformidades";
import { ApiError } from "@/lib/api";

type FiltroEstado = "todos" | "abierta" | "en_proceso" | "cerrada";

const FILTROS: Array<{ value: FiltroEstado; label: string }> = [
  { value: "todos",      label: "Todas" },
  { value: "abierta",    label: "Abiertas" },
  { value: "en_proceso", label: "En proceso" },
  { value: "cerrada",    label: "Cerradas" },
];

export default function NoConformidadesListPage() {
  const [filtro, setFiltro] = useState<FiltroEstado>("todos");
  const [items, setItems] = useState<NoConformidad[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getNoConformidades({
        estado: filtro === "todos" ? undefined : filtro,
      });
      setItems(res.data);
    } catch (err) {
      toast.error(err instanceof ApiError ? `Error ${err.status}` : "Error cargando no conformidades");
    } finally {
      setLoading(false);
    }
  }, [filtro]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <PageHeader
        breadcrumb={[
          { href: "/dashboard", label: "Panel" },
          { href: "/compras", label: "Compras" },
          { label: "No conformidades" },
        ]}
        title="No conformidades"
        titleAccent="calidad"
        meta={<span>Registros de ítems rechazados o con defectos en recepciones</span>}
        actions={<HeaderActionGhost href="/compras">← Compras</HeaderActionGhost>}
      />

      <div className="space-y-6 pt-6">
        {/* Filtros */}
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFiltro(f.value)}
              className={
                filtro === f.value
                  ? "inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-3 py-1.5 text-xs font-medium text-white glow-copper-sm inset-highlight-md"
                  : "inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-3 py-1.5 text-xs font-medium text-foreground/80 transition hover:border-glass-strong hover:bg-glass-elev"
              }
            >
              {f.label}
            </button>
          ))}
        </div>

        <Panel padded={false}>
          <Table>
            <TableHeader>
              <TableRow className="border-glass bg-glass hover:bg-glass">
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Código</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Tipo</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Descripción</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Proveedor</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Recepción</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Líneas NC</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Fecha</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">Cargando…</TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <FileWarning className="h-5 w-5" />
                      <span className="text-sm">No hay no conformidades con ese filtro</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((nc) => {
                  const badge = estadoBadge(nc.estado);
                  return (
                    <TableRow key={nc.id} className="border-glass hover:bg-glass">
                      <TableCell className="font-mono text-xs">
                        <Link href={`/compras/no-conformidades/${nc.id}`} className="text-copper hover:underline">
                          {nc.codigo}
                        </Link>
                      </TableCell>
                      <TableCell className="capitalize text-sm text-foreground/80">{nc.tipo}</TableCell>
                      <TableCell className="max-w-[260px] text-sm text-foreground/80">
                        <span className="line-clamp-2">{nc.descripcion}</span>
                      </TableCell>
                      <TableCell className="text-sm text-foreground/80">
                        {nc.proveedores?.razon_social ?? <span className="text-muted-foreground/50">—</span>}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-foreground/80">
                        {nc.recepciones ? (
                          <Link href={`/compras/recepciones/${nc.recepcion_id}`} className="text-copper/70 hover:text-copper hover:underline">
                            #{nc.recepcion_id}
                          </Link>
                        ) : (
                          `#${nc.recepcion_id}`
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-center text-foreground/80">
                        {nc._count?.nc_lineas ?? 0}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {new Date(nc.created_at).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" })}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                          {nc.estado !== "cerrada" && <AlertTriangle className="h-3 w-3" />}
                          {badge.label}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Panel>
      </div>

      <Toaster richColors theme="dark" />
    </div>
  );
}
