"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Truck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Toaster, toast } from "sonner";
import { PageHeader, HeaderActionGhost } from "@/components/page-header";
import { Panel } from "@/components/panel";
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
    if (!form.razon_social.trim()) { toast.error("La razón social es obligatoria"); return; }
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
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { href: "/admin/proveedores", label: "Proveedores" }, { label: "Nuevo" }]}
        title="Nuevo"
        titleAccent="proveedor"
        meta={<span>Solo razón social es obligatoria · el resto se completa después</span>}
        actions={<HeaderActionGhost href="/admin/proveedores" icon={<ChevronLeft className="h-3.5 w-3.5" />}>Volver</HeaderActionGhost>}
      />

      <form onSubmit={onSubmit} className="space-y-6 pt-6">
        <Panel title="Identificación" icon={<Truck className="h-3.5 w-3.5" />}>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field label="Razón social" required full><Input value={form.razon_social} onChange={(e) => set("razon_social", e.target.value)} required className="h-10 border-glass bg-glass" /></Field>
            <Field label="Nombre comercial"><Input value={form.nombre_comercial ?? ""} onChange={(e) => set("nombre_comercial", e.target.value)} className="h-10 border-glass bg-glass" /></Field>
            <Field label="RUC / identificación fiscal"><Input value={form.ruc ?? ""} onChange={(e) => set("ruc", e.target.value)} className="h-10 border-glass bg-glass font-mono" /></Field>
            <Field label="País"><Input value={form.pais ?? ""} onChange={(e) => set("pais", e.target.value)} className="h-10 border-glass bg-glass" /></Field>
            <Field label="Ciudad"><Input value={form.ciudad ?? ""} onChange={(e) => set("ciudad", e.target.value)} className="h-10 border-glass bg-glass" /></Field>
          </div>
        </Panel>

        <Panel title="Contacto comercial">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field label="Nombre"><Input value={form.contacto_nombre ?? ""} onChange={(e) => set("contacto_nombre", e.target.value)} className="h-10 border-glass bg-glass" /></Field>
            <Field label="Cargo"><Input value={form.contacto_cargo ?? ""} onChange={(e) => set("contacto_cargo", e.target.value)} className="h-10 border-glass bg-glass" /></Field>
            <Field label="Email"><Input type="email" value={form.contacto_email ?? ""} onChange={(e) => set("contacto_email", e.target.value)} className="h-10 border-glass bg-glass" /></Field>
            <Field label="Teléfono"><Input value={form.contacto_telefono ?? ""} onChange={(e) => set("contacto_telefono", e.target.value)} className="h-10 border-glass bg-glass" /></Field>
          </div>
        </Panel>

        <Panel title="Condiciones comerciales" subtitle="Valores por defecto para las OCs">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <Field label="Condiciones de pago" cols={2}>
              <Input placeholder="contado / crédito 30 días / 50% anticipo" value={form.condiciones_pago_default ?? ""} onChange={(e) => set("condiciones_pago_default", e.target.value)} className="h-10 border-glass bg-glass" />
            </Field>
            <Field label="Moneda"><Input value={form.moneda_default ?? "USD"} onChange={(e) => set("moneda_default", e.target.value)} maxLength={3} className="h-10 border-glass bg-glass font-mono" /></Field>
            <Field label="Tiempo entrega (días)">
              <Input type="number" value={form.tiempo_entrega_default_dias ?? ""}
                onChange={(e) => set("tiempo_entrega_default_dias", e.target.value ? Number(e.target.value) : null)}
                className="h-10 border-glass bg-glass font-mono" />
            </Field>
            <Field label="Incoterm"><Input placeholder="FOB / CIF / DAP" value={form.incoterm_default ?? ""} onChange={(e) => set("incoterm_default", e.target.value)} className="h-10 border-glass bg-glass font-mono" /></Field>
          </div>
        </Panel>

        <Panel title="Capacidades">
          <div className="space-y-5">
            <Field label="Certificaciones · texto libre">
              <Textarea placeholder="ISO 9001:2015, IEC 60076, ASTM D877…" rows={2}
                value={form.certificaciones ?? ""} onChange={(e) => set("certificaciones", e.target.value)} className="border-glass bg-glass" />
            </Field>
            <Field label="Productos / familias que suministra">
              <Textarea placeholder="Cobre electrolítico, aislantes, aceite dieléctrico, núcleos…" rows={2}
                value={form.productos_que_suministra ?? ""} onChange={(e) => set("productos_que_suministra", e.target.value)} className="border-glass bg-glass" />
            </Field>
            <Field label="Observaciones">
              <Textarea rows={2} value={form.observaciones ?? ""} onChange={(e) => set("observaciones", e.target.value)} className="border-glass bg-glass" />
            </Field>
          </div>
        </Panel>

        <div className="flex justify-end gap-2 border-t border-glass pt-5">
          <Link href="/admin/proveedores"
            className="inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-4 py-2 text-sm font-medium text-foreground/90 transition hover:border-glass-strong hover:bg-glass-elev">
            Cancelar
          </Link>
          <button type="submit" disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-4 py-2 text-sm font-medium text-white shadow-sm glow-copper-sm inset-highlight-md transition hover:glow-copper disabled:opacity-60">
            {saving ? "Guardando…" : "Crear proveedor"}
          </button>
        </div>
      </form>

      <Toaster richColors theme="dark" />
    </div>
  );
}

function Field({ label, required, full, cols, children }: { label: string; required?: boolean; full?: boolean; cols?: number; children: React.ReactNode }) {
  const colSpan = full ? "md:col-span-2" : cols === 2 ? "md:col-span-2" : "";
  return (
    <div className={`space-y-1.5 ${colSpan}`}>
      <Label className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}{required && <span className="ml-1 text-copper">*</span>}
      </Label>
      {children}
    </div>
  );
}
