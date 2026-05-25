"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Toaster, toast } from "sonner";
import { createProveedor, ProveedorCreateInput } from "@/lib/compras";
import { ApiError } from "@/lib/api";

export default function NuevoProveedorPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProveedorCreateInput>({
    razon_social: "",
    nombre_comercial: "",
    ruc: "",
    pais: "Ecuador",
    ciudad: "",
    contacto_nombre: "",
    contacto_cargo: "",
    contacto_email: "",
    contacto_telefono: "",
    condiciones_pago_default: "",
    moneda_default: "USD",
    tiempo_entrega_default_dias: 14,
    incoterm_default: "",
    certificaciones: "",
    productos_que_suministra: "",
    observaciones: "",
    estado: "activo",
  });

  function set<K extends keyof ProveedorCreateInput>(k: K, v: ProveedorCreateInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.razon_social.trim()) {
      toast.error("La razón social es obligatoria");
      return;
    }
    setSaving(true);
    try {
      const res = await createProveedor(form);
      toast.success(`Proveedor ${res.data.codigo} creado`);
      router.push(`/admin/proveedores/${res.data.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Toaster richColors />
      <Link href="/admin/proveedores" className="inline-flex items-center text-sm text-muted-foreground hover:underline">
        <ChevronLeft className="mr-1 h-4 w-4" /> Volver a proveedores
      </Link>

      <h1 className="text-2xl font-bold">Nuevo proveedor</h1>

      <form onSubmit={onSubmit} className="space-y-6 rounded-md border bg-white p-6">
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Identificación</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Razón social <span className="text-red-600">*</span></Label>
              <Input value={form.razon_social} onChange={(e) => set("razon_social", e.target.value)} required />
            </div>
            <div>
              <Label>Nombre comercial</Label>
              <Input value={form.nombre_comercial ?? ""} onChange={(e) => set("nombre_comercial", e.target.value)} />
            </div>
            <div>
              <Label>RUC / identificación fiscal</Label>
              <Input value={form.ruc ?? ""} onChange={(e) => set("ruc", e.target.value)} />
            </div>
            <div>
              <Label>País</Label>
              <Input value={form.pais ?? ""} onChange={(e) => set("pais", e.target.value)} />
            </div>
            <div>
              <Label>Ciudad</Label>
              <Input value={form.ciudad ?? ""} onChange={(e) => set("ciudad", e.target.value)} />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Contacto comercial</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Nombre</Label>
              <Input value={form.contacto_nombre ?? ""} onChange={(e) => set("contacto_nombre", e.target.value)} />
            </div>
            <div>
              <Label>Cargo</Label>
              <Input value={form.contacto_cargo ?? ""} onChange={(e) => set("contacto_cargo", e.target.value)} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.contacto_email ?? ""} onChange={(e) => set("contacto_email", e.target.value)} />
            </div>
            <div>
              <Label>Teléfono</Label>
              <Input value={form.contacto_telefono ?? ""} onChange={(e) => set("contacto_telefono", e.target.value)} />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Condiciones comerciales (default)</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <Label>Condiciones de pago</Label>
              <Input
                placeholder="contado / crédito 30 días / 50% anticipo"
                value={form.condiciones_pago_default ?? ""}
                onChange={(e) => set("condiciones_pago_default", e.target.value)}
              />
            </div>
            <div>
              <Label>Moneda</Label>
              <Input value={form.moneda_default ?? "USD"} onChange={(e) => set("moneda_default", e.target.value)} maxLength={3} />
            </div>
            <div>
              <Label>Tiempo entrega (días)</Label>
              <Input
                type="number"
                value={form.tiempo_entrega_default_dias ?? ""}
                onChange={(e) => set("tiempo_entrega_default_dias", e.target.value ? Number(e.target.value) : null)}
              />
            </div>
            <div>
              <Label>Incoterm</Label>
              <Input placeholder="FOB / CIF / DAP" value={form.incoterm_default ?? ""} onChange={(e) => set("incoterm_default", e.target.value)} />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Capacidades</h2>
          <div>
            <Label>Certificaciones (texto libre)</Label>
            <Textarea
              placeholder="ISO 9001:2015, IEC 60076, ASTM D877…"
              rows={2}
              value={form.certificaciones ?? ""}
              onChange={(e) => set("certificaciones", e.target.value)}
            />
          </div>
          <div>
            <Label>Productos / familias que suministra</Label>
            <Textarea
              placeholder="Cobre electrolítico, aislantes, aceite dieléctrico, núcleos…"
              rows={2}
              value={form.productos_que_suministra ?? ""}
              onChange={(e) => set("productos_que_suministra", e.target.value)}
            />
          </div>
          <div>
            <Label>Observaciones</Label>
            <Textarea rows={2} value={form.observaciones ?? ""} onChange={(e) => set("observaciones", e.target.value)} />
          </div>
        </section>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Link href="/admin/proveedores">
            <Button type="button" variant="outline">Cancelar</Button>
          </Link>
          <Button type="submit" disabled={saving}>{saving ? "Guardando…" : "Crear proveedor"}</Button>
        </div>
      </form>
    </div>
  );
}
