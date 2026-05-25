"use client";

import { useEffect, useState, useCallback, use as usePromise } from "react";
import Link from "next/link";
import { ChevronLeft, Pencil, Save, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import {
  archiveProveedor, getProveedor, ItemProveedor, Proveedor, ProveedorCreateInput,
  updateProveedor, fmtMoneda,
} from "@/lib/compras";
import { ApiError } from "@/lib/api";

interface ProveedorFull extends Proveedor {
  item_proveedores: ItemProveedor[];
  _count: { ordenes_compra: number };
}

const ESTADO_COLOR: Record<string, string> = {
  activo: "bg-green-100 text-green-800",
  inactivo: "bg-gray-200 text-gray-700",
  bloqueado: "bg-red-100 text-red-800",
};

export default function ProveedorDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const provId = Number(id);
  const [prov, setProv] = useState<ProveedorFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<ProveedorCreateInput>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getProveedor(provId);
      setProv(res.data);
      setForm({
        razon_social: res.data.razon_social,
        nombre_comercial: res.data.nombre_comercial ?? "",
        ruc: res.data.ruc ?? "",
        pais: res.data.pais,
        ciudad: res.data.ciudad ?? "",
        contacto_nombre: res.data.contacto_nombre ?? "",
        contacto_cargo: res.data.contacto_cargo ?? "",
        contacto_email: res.data.contacto_email ?? "",
        contacto_telefono: res.data.contacto_telefono ?? "",
        condiciones_pago_default: res.data.condiciones_pago_default ?? "",
        moneda_default: res.data.moneda_default,
        tiempo_entrega_default_dias: res.data.tiempo_entrega_default_dias,
        incoterm_default: res.data.incoterm_default ?? "",
        certificaciones: res.data.certificaciones ?? "",
        productos_que_suministra: res.data.productos_que_suministra ?? "",
        observaciones: res.data.observaciones ?? "",
        estado: res.data.estado,
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? `Error ${err.status}` : "Error cargando proveedor");
    } finally {
      setLoading(false);
    }
  }, [provId]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    try {
      await updateProveedor(provId, form);
      toast.success("Proveedor actualizado");
      setEditing(false);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error");
    }
  }

  async function handleArchivar() {
    if (!window.confirm("¿Marcar proveedor como inactivo? Ya no aparece en nuevos comprobantes.")) return;
    try {
      await archiveProveedor(provId);
      toast.success("Proveedor archivado");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error");
    }
  }

  if (loading || !prov) {
    return <div className="p-8 text-muted-foreground">Cargando…</div>;
  }

  return (
    <div className="max-w-4xl space-y-6">
      <Toaster richColors />
      <Link href="/admin/proveedores" className="inline-flex items-center text-sm text-muted-foreground hover:underline">
        <ChevronLeft className="mr-1 h-4 w-4" /> Volver
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <div className="font-mono text-xs text-muted-foreground">{prov.codigo}</div>
          <h1 className="text-2xl font-bold">{prov.razon_social}</h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge className={ESTADO_COLOR[prov.estado] ?? ""}>{prov.estado}</Badge>
            <span className="text-sm text-muted-foreground">
              {prov._count.ordenes_compra} órdenes históricas
              {prov.calificacion && ` · calificación ${Number(prov.calificacion).toFixed(1)}/100`}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {!editing ? (
            <>
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="mr-2 h-4 w-4" /> Editar
              </Button>
              {prov.estado === "activo" && (
                <Button variant="outline" onClick={handleArchivar}>
                  <Trash2 className="mr-2 h-4 w-4" /> Archivar
                </Button>
              )}
            </>
          ) : (
            <>
              <Button onClick={handleSave}><Save className="mr-2 h-4 w-4" /> Guardar</Button>
              <Button variant="outline" onClick={() => { setEditing(false); load(); }}>
                <X className="mr-2 h-4 w-4" /> Cancelar
              </Button>
            </>
          )}
        </div>
      </div>

      <section className="rounded-md border bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase text-muted-foreground">Identificación y contacto</h2>
        <div className="grid grid-cols-2 gap-4">
          {editing ? (
            <>
              <div className="col-span-2"><Label>Razón social</Label><Input value={form.razon_social ?? ""} onChange={(e) => setForm((f) => ({ ...f, razon_social: e.target.value }))} /></div>
              <div><Label>Nombre comercial</Label><Input value={form.nombre_comercial ?? ""} onChange={(e) => setForm((f) => ({ ...f, nombre_comercial: e.target.value }))} /></div>
              <div><Label>RUC</Label><Input value={form.ruc ?? ""} onChange={(e) => setForm((f) => ({ ...f, ruc: e.target.value }))} /></div>
              <div><Label>País</Label><Input value={form.pais ?? ""} onChange={(e) => setForm((f) => ({ ...f, pais: e.target.value }))} /></div>
              <div><Label>Ciudad</Label><Input value={form.ciudad ?? ""} onChange={(e) => setForm((f) => ({ ...f, ciudad: e.target.value }))} /></div>
              <div><Label>Contacto</Label><Input value={form.contacto_nombre ?? ""} onChange={(e) => setForm((f) => ({ ...f, contacto_nombre: e.target.value }))} /></div>
              <div><Label>Cargo</Label><Input value={form.contacto_cargo ?? ""} onChange={(e) => setForm((f) => ({ ...f, contacto_cargo: e.target.value }))} /></div>
              <div><Label>Email</Label><Input type="email" value={form.contacto_email ?? ""} onChange={(e) => setForm((f) => ({ ...f, contacto_email: e.target.value }))} /></div>
              <div><Label>Teléfono</Label><Input value={form.contacto_telefono ?? ""} onChange={(e) => setForm((f) => ({ ...f, contacto_telefono: e.target.value }))} /></div>
              <div><Label>Condiciones de pago</Label><Input value={form.condiciones_pago_default ?? ""} onChange={(e) => setForm((f) => ({ ...f, condiciones_pago_default: e.target.value }))} /></div>
              <div><Label>Moneda</Label><Input value={form.moneda_default ?? "USD"} maxLength={3} onChange={(e) => setForm((f) => ({ ...f, moneda_default: e.target.value }))} /></div>
              <div><Label>Tiempo entrega días</Label><Input type="number" value={form.tiempo_entrega_default_dias ?? ""} onChange={(e) => setForm((f) => ({ ...f, tiempo_entrega_default_dias: e.target.value ? Number(e.target.value) : null }))} /></div>
              <div className="col-span-2"><Label>Certificaciones</Label><Textarea rows={2} value={form.certificaciones ?? ""} onChange={(e) => setForm((f) => ({ ...f, certificaciones: e.target.value }))} /></div>
              <div className="col-span-2"><Label>Productos que suministra</Label><Textarea rows={2} value={form.productos_que_suministra ?? ""} onChange={(e) => setForm((f) => ({ ...f, productos_que_suministra: e.target.value }))} /></div>
              <div className="col-span-2"><Label>Observaciones</Label><Textarea rows={2} value={form.observaciones ?? ""} onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))} /></div>
              <div><Label>Estado</Label>
                <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.estado ?? "activo"} onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value as "activo" | "inactivo" | "bloqueado" }))}>
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                  <option value="bloqueado">Bloqueado</option>
                </select>
              </div>
            </>
          ) : (
            <>
              <KV label="Nombre comercial" value={prov.nombre_comercial} />
              <KV label="RUC" value={prov.ruc} />
              <KV label="País" value={prov.pais} />
              <KV label="Ciudad" value={prov.ciudad} />
              <KV label="Contacto" value={prov.contacto_nombre} />
              <KV label="Cargo" value={prov.contacto_cargo} />
              <KV label="Email" value={prov.contacto_email} />
              <KV label="Teléfono" value={prov.contacto_telefono} />
              <KV label="Pago default" value={prov.condiciones_pago_default} />
              <KV label="Moneda" value={prov.moneda_default} />
              <KV label="Tiempo entrega" value={prov.tiempo_entrega_default_dias ? `${prov.tiempo_entrega_default_dias} días` : null} />
              <KV label="Incoterm" value={prov.incoterm_default} />
              <KV label="Certificaciones" value={prov.certificaciones} span={2} />
              <KV label="Suministra" value={prov.productos_que_suministra} span={2} />
              <KV label="Observaciones" value={prov.observaciones} span={2} />
            </>
          )}
        </div>
      </section>

      <section className="rounded-md border bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase text-muted-foreground">
          Items que suministra ({prov.item_proveedores.length})
        </h2>
        {prov.item_proveedores.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no se han asociado items a este proveedor. Desde la ficha de un item de bodega podrás agregarlo a la lista de proveedores.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código item</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead className="text-right">Tiempo entrega</TableHead>
                <TableHead>Principal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prov.item_proveedores.map((ip) => (
                <TableRow key={ip.id}>
                  <TableCell className="font-mono text-xs">{ip.items?.codigo_interno ?? "—"}</TableCell>
                  <TableCell>{ip.items?.nombre ?? "—"}</TableCell>
                  <TableCell className="text-right">{fmtMoneda(ip.precio_unitario, ip.moneda)}</TableCell>
                  <TableCell>{ip.unidad_medida}</TableCell>
                  <TableCell className="text-right">{ip.tiempo_entrega_dias != null ? `${ip.tiempo_entrega_dias} días` : "—"}</TableCell>
                  <TableCell>{ip.es_principal && <Badge className="bg-blue-100 text-blue-800">Principal</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

function KV({ label, value, span = 1 }: { label: string; value: string | null | undefined; span?: 1 | 2 }) {
  return (
    <div className={span === 2 ? "col-span-2" : ""}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{value ?? "—"}</div>
    </div>
  );
}
