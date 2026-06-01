"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Pencil, Archive, FileSignature } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import { PageHeader, HeaderActionPrimary } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { ContratoPlantilla, archiveContratoPlantilla, listContratoPlantillas } from "@/lib/contrato-plantillas";
import { ApiError } from "@/lib/api";

const PLAN_LABEL: Record<string, string> = {
  anticipo_y_saldo: "Anticipo + saldo", hitos: "Por hitos", mensual: "Mensual", contado: "Contado", otro: "Otro",
};

export default function PlantillasContratoListPage() {
  const [items, setItems] = useState<ContratoPlantilla[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactivas, setShowInactivas] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listContratoPlantillas({ activo: !showInactivas });
      setItems(res.data);
    } catch (err) {
      toast.error(err instanceof ApiError ? `Error ${err.status}` : "Error cargando plantillas");
    } finally {
      setLoading(false);
    }
  }, [showInactivas]);

  useEffect(() => { load(); }, [load]);

  async function handleArchivar(p: ContratoPlantilla) {
    if (!window.confirm(`¿Archivar plantilla "${p.nombre}"? Ya no aparecerá al emitir contratos.`)) return;
    try {
      await archiveContratoPlantilla(p.id);
      toast.success("Plantilla archivada");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error");
    }
  }

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { label: "Admin" }, { label: "Plantillas contrato" }]}
        title="Plantillas"
        titleAccent="de contrato"
        meta={<span>Cláusulas legales con variables + preset de plan de pago · se aplican al emitir un contrato</span>}
        actions={
          <HeaderActionPrimary href="/admin/contrato-plantillas/nueva" icon={<Plus className="h-3.5 w-3.5" />}>
            Nueva plantilla
          </HeaderActionPrimary>
        }
      />

      <div className="space-y-6 pt-6">
        <Panel padded={false}>
          <div className="flex items-center gap-2 border-b border-glass px-5 py-3 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showInactivas} onChange={(e) => setShowInactivas(e.target.checked)} className="h-3.5 w-3.5 accent-copper" />
              <span className="text-foreground/85">Mostrar archivadas</span>
            </label>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="border-glass bg-glass hover:bg-glass">
                <TableHead className="w-36 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Código</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Nombre</TableHead>
                <TableHead className="w-32 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Tipo</TableHead>
                <TableHead className="w-36 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Plan de pago</TableHead>
                <TableHead className="w-20 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Pagos</TableHead>
                <TableHead className="w-24 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Estado</TableHead>
                <TableHead className="w-28 text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Cargando…</TableCell></TableRow>
              ) : items.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-10 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <FileSignature className="h-5 w-5" />
                    <span className="text-sm">No hay plantillas {showInactivas ? "archivadas" : "activas"}</span>
                  </div>
                </TableCell></TableRow>
              ) : items.map((p) => (
                <TableRow key={p.id} className="border-glass hover:bg-glass">
                  <TableCell className="font-mono text-xs text-copper">{p.codigo}</TableCell>
                  <TableCell>
                    <p className="font-medium">{p.nombre}</p>
                    {p.descripcion && <p className="text-xs text-muted-foreground">{p.descripcion}</p>}
                  </TableCell>
                  <TableCell className="text-sm capitalize text-foreground/80">{p.tipo_servicio}</TableCell>
                  <TableCell className="text-sm text-foreground/80">{PLAN_LABEL[p.plan_pago_tipo] ?? p.plan_pago_tipo}</TableCell>
                  <TableCell className="text-sm">
                    <Badge variant="teal">{p._count?.pagos ?? 0}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.activo ? "success" : "muted"}>{p.activo ? "activa" : "archivada"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/admin/contrato-plantillas/${p.id}`} title="Editar"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-glass-elev hover:text-copper">
                      <Pencil className="h-3.5 w-3.5" />
                    </Link>
                    {p.activo && (
                      <button type="button" onClick={() => handleArchivar(p)} title="Archivar"
                        className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-rose-400 hover:bg-rose-500/10">
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      </div>

      <Toaster richColors position="top-right" theme="dark" />
    </div>
  );
}
