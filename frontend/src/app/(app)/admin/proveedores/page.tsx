"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import { listProveedores, Proveedor } from "@/lib/compras";
import { ApiError } from "@/lib/api";

const ESTADO_COLOR: Record<string, string> = {
  activo: "bg-green-100 text-green-800",
  inactivo: "bg-gray-200 text-gray-700",
  bloqueado: "bg-red-100 text-red-800",
};

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
    <div className="space-y-6">
      <Toaster richColors />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Proveedores</h1>
          <p className="text-sm text-muted-foreground">
            Catálogo maestro de proveedores. Cada uno puede tener N items con precio y tiempo de entrega vigentes.
          </p>
        </div>
        <Link href="/admin/proveedores/nuevo">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo proveedor
          </Button>
        </Link>
      </div>

      <div className="flex gap-2">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por razón social, código, RUC…"
            className="pl-10"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className="rounded-md border bg-background px-3 text-sm"
          value={estado}
          onChange={(e) => setEstado(e.target.value as "activo" | "inactivo" | "bloqueado" | "todos")}
        >
          <option value="activo">Activos</option>
          <option value="inactivo">Inactivos</option>
          <option value="bloqueado">Bloqueados</option>
          <option value="todos">Todos</option>
        </select>
      </div>

      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Razón social</TableHead>
              <TableHead>RUC</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead className="text-right">Calificación</TableHead>
              <TableHead className="text-right">Órdenes</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Cargando…</TableCell></TableRow>
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Sin proveedores con esos filtros.</TableCell></TableRow>
            ) : (
              items.map((p) => (
                <TableRow key={p.id} className="hover:bg-muted/40">
                  <TableCell className="font-mono text-xs">
                    <Link className="text-blue-700 underline-offset-2 hover:underline" href={`/admin/proveedores/${p.id}`}>
                      {p.codigo}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{p.razon_social}</div>
                    {p.nombre_comercial && <div className="text-xs text-muted-foreground">{p.nombre_comercial}</div>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.ruc ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {p.contacto_nombre ?? "—"}
                    {p.contacto_email && <div className="text-muted-foreground">{p.contacto_email}</div>}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {p.calificacion ? `${Number(p.calificacion).toFixed(1)} / 100` : "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm">{p.total_ordenes}</TableCell>
                  <TableCell>
                    <Badge className={ESTADO_COLOR[p.estado] ?? ""}>{p.estado}</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
