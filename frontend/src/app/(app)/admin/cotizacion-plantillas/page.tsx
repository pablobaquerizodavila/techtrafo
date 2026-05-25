"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, Plus, Pencil, Archive, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import { CotizacionPlantilla, archivePlantilla, listPlantillas } from "@/lib/cotizacion-plantillas";
import { ApiError } from "@/lib/api";

export default function PlantillasCotizacionListPage() {
  const [items, setItems] = useState<CotizacionPlantilla[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactivas, setShowInactivas] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listPlantillas({ activo: !showInactivas });
      setItems(res.data);
    } catch (err) {
      toast.error(err instanceof ApiError ? `Error ${err.status}` : "Error cargando plantillas");
    } finally {
      setLoading(false);
    }
  }, [showInactivas]);

  useEffect(() => { load(); }, [load]);

  async function handleArchivar(p: CotizacionPlantilla) {
    if (!window.confirm(`Archivar plantilla "${p.nombre}"? Ya no aparecerá al crear cotizaciones, pero las cotizaciones existentes la siguen referenciando.`)) return;
    try {
      await archivePlantilla(p.id);
      toast.success("Plantilla archivada");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error");
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2">
            <Link href="/admin"><ChevronLeft className="mr-1 h-4 w-4" /> Volver a admin</Link>
          </Button>
          <h2 className="text-3xl font-bold">Plantillas de cotización</h2>
          <p className="text-muted-foreground">
            Plantillas pre-armadas con materia prima, mano de obra, servicios y costos. Permiten emitir cotizaciones automáticamente con check de stock contra bodega.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/cotizacion-plantillas/nueva">
            <Plus className="mr-1 h-4 w-4" /> Nueva plantilla
          </Link>
        </Button>
      </header>

      <div className="flex items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showInactivas} onChange={(e) => setShowInactivas(e.target.checked)} />
          Mostrar archivadas
        </label>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-28">Código</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead className="w-32">Tipo</TableHead>
            <TableHead className="w-24">kVA</TableHead>
            <TableHead className="w-20">Margen</TableHead>
            <TableHead className="w-20">IVA</TableHead>
            <TableHead className="w-24">Componentes</TableHead>
            <TableHead className="w-20">Estado</TableHead>
            <TableHead className="w-28 text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground">Cargando...</TableCell>
            </TableRow>
          ) : items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground">
                No hay plantillas {showInactivas ? "archivadas" : "activas"}.
              </TableCell>
            </TableRow>
          ) : items.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-mono text-xs">{p.codigo}</TableCell>
              <TableCell className="font-medium">
                {p.nombre}
                {p.descripcion && <div className="text-xs text-muted-foreground">{p.descripcion}</div>}
              </TableCell>
              <TableCell className="capitalize text-sm">{p.tipo_servicio}</TableCell>
              <TableCell className="text-sm">
                {p.capacidad_kva_min || p.capacidad_kva_max
                  ? `${p.capacidad_kva_min ?? "—"} – ${p.capacidad_kva_max ?? "—"}`
                  : "—"}
              </TableCell>
              <TableCell className="text-sm">{Number(p.margen_porcentaje_default).toFixed(1)}%</TableCell>
              <TableCell className="text-sm">{Number(p.iva_porcentaje_default).toFixed(1)}%</TableCell>
              <TableCell className="text-sm">
                <FileText className="mr-1 inline h-3 w-3" />
                {p._count?.plantilla_componentes ?? 0}
              </TableCell>
              <TableCell>
                <Badge variant={p.activo ? "success" : "muted"}>
                  {p.activo ? "activa" : "archivada"}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="icon" asChild title="Editar">
                  <Link href={`/admin/cotizacion-plantillas/${p.id}`}>
                    <Pencil className="h-4 w-4" />
                  </Link>
                </Button>
                {p.activo && (
                  <Button variant="ghost" size="icon" onClick={() => handleArchivar(p)} title="Archivar">
                    <Archive className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Toaster richColors position="top-right" />
    </div>
  );
}
