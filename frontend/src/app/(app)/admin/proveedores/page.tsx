"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Search, Truck, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Toaster, toast } from "sonner";
import { PageHeader, HeaderActionPrimary } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { listProveedores, Proveedor } from "@/lib/compras";
import { ApiError } from "@/lib/api";

export default function ProveedoresListPage() {
  const [items, setItems] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [estado, setEstado] = useState<"activo" | "inactivo" | "bloqueado" | "todos">("activo");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listProveedores({
        estado: estado === "todos" ? undefined : estado,
        q: q.trim() || undefined,
      });
      setItems(res.data);
    } catch (err) {
      toast.error(err instanceof ApiError ? `Error ${err.status}` : "Error cargando proveedores");
    } finally {
      setLoading(false);
    }
  }, [estado, q]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { label: "Admin" }, { label: "Proveedores" }]}
        title="Proveedores"
        titleAccent="catálogo"
        meta={<span>Cada proveedor puede tener N items con precio y tiempo de entrega vigentes</span>}
        actions={
          <HeaderActionPrimary href="/admin/proveedores/nuevo" icon={<Plus className="h-3.5 w-3.5" />}>
            Nuevo proveedor
          </HeaderActionPrimary>
        }
      />

      <div className="space-y-6 pt-6">
        <Panel padded={false}>
          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2 border-b border-glass px-5 py-3">
            <div className="relative flex-1 min-w-[18rem] max-w-sm">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por razón social, código, RUC…"
                className="h-8 border-glass bg-glass pl-8 text-sm"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Select value={estado} onValueChange={(v) => setEstado(v as "activo" | "inactivo" | "bloqueado" | "todos")}>
              <SelectTrigger className="h-8 w-36 border-glass bg-glass text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="activo">Activos</SelectItem>
                <SelectItem value="inactivo">Inactivos</SelectItem>
                <SelectItem value="bloqueado">Bloqueados</SelectItem>
                <SelectItem value="todos">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tabla */}
          <Table>
            <TableHeader>
              <TableRow className="border-glass bg-glass hover:bg-glass">
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Código</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Razón social</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">RUC</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Contacto</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Calificación</TableHead>
                <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Órdenes</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Cargando…</TableCell></TableRow>
              ) : items.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-10 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Truck className="h-5 w-5" />
                    <span className="text-sm">Sin proveedores con esos filtros</span>
                  </div>
                </TableCell></TableRow>
              ) : (
                items.map((p) => (
                  <TableRow key={p.id} className="border-glass hover:bg-glass">
                    <TableCell className="font-mono text-xs">
                      <Link className="text-copper hover:underline" href={`/admin/proveedores/${p.id}`}>
                        {p.codigo}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{p.razon_social}</p>
                      {p.nombre_comercial && <p className="text-xs text-muted-foreground">{p.nombre_comercial}</p>}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-foreground/80">{p.ruc ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      <span className="text-foreground/85">{p.contacto_nombre ?? "—"}</span>
                      {p.contacto_email && <p className="font-mono text-[10.5px] text-muted-foreground">{p.contacto_email}</p>}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.calificacion ? (
                        <span className="inline-flex items-center gap-1 font-mono text-xs">
                          <Star className="h-3 w-3 text-amber-400" />
                          <span className="text-foreground/90">{Number(p.calificacion).toFixed(1)}</span>
                          <span className="text-muted-foreground/60">/100</span>
                        </span>
                      ) : <span className="text-muted-foreground/50">—</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-foreground/85">{p.total_ordenes}</TableCell>
                    <TableCell>
                      <Badge variant={p.estado === "activo" ? "success" : p.estado === "bloqueado" ? "destructive" : "muted"}>
                        {p.estado}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Panel>
      </div>

      <Toaster richColors theme="dark" />
    </div>
  );
}
