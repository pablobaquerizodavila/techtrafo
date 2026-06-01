"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Plus, Trash2, FileSignature } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import { PageHeader, HeaderActionGhost } from "@/components/page-header";
import { Panel } from "@/components/panel";
import {
  ContratoPlantilla, ContratoPlantillaInput, TipoServicioPlantilla, PlanPagoTipo,
  TipoPagoPreset, CondicionDisparo, VARIABLES_CONTRATO,
  createContratoPlantilla, updateContratoPlantilla,
} from "@/lib/contrato-plantillas";
import { ApiError } from "@/lib/api";

interface PagoRow {
  _id: string;
  numero: number;
  tipo: TipoPagoPreset;
  descripcion: string;
  condicion_disparo: CondicionDisparo | null;
  monto_porcentaje: number | null;
}

function nuevoPago(numero: number): PagoRow {
  return { _id: crypto.randomUUID(), numero, tipo: numero === 1 ? "anticipo" : "saldo", descripcion: "", condicion_disparo: "fecha_fija", monto_porcentaje: null };
}

export function ContratoPlantillaForm({ initial }: { initial?: ContratoPlantilla | null }) {
  const router = useRouter();
  const editing = !!initial;

  const [codigo, setCodigo] = useState(initial?.codigo ?? "");
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [tipoServicio, setTipoServicio] = useState<TipoServicioPlantilla>(initial?.tipo_servicio ?? "otro");
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? "");
  const [planPago, setPlanPago] = useState<PlanPagoTipo>(initial?.plan_pago_tipo ?? "anticipo_y_saldo");
  const [clausulas, setClausulas] = useState(initial?.clausulas ?? "");
  const [activo, setActivo] = useState(initial?.activo ?? true);
  const [pagos, setPagos] = useState<PagoRow[]>(
    initial?.pagos?.length
      ? initial.pagos.map((p) => ({
          _id: crypto.randomUUID(), numero: p.numero, tipo: p.tipo,
          descripcion: p.descripcion ?? "", condicion_disparo: p.condicion_disparo,
          monto_porcentaje: p.monto_porcentaje == null ? null : Number(p.monto_porcentaje),
        }))
      : [nuevoPago(1), nuevoPago(2)],
  );
  const [submitting, setSubmitting] = useState(false);

  function updatePago<K extends keyof PagoRow>(idx: number, key: K, value: PagoRow[K]) {
    setPagos((prev) => { const next = [...prev]; next[idx] = { ...next[idx], [key]: value }; return next; });
  }
  function addPago() { setPagos((prev) => [...prev, nuevoPago(prev.length + 1)]); }
  function removePago(idx: number) {
    setPagos((prev) => prev.filter((_, i) => i !== idx).map((p, i) => ({ ...p, numero: i + 1 })));
  }

  const totalPct = pagos.reduce((acc, p) => acc + (Number(p.monto_porcentaje) || 0), 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (codigo.trim().length < 2 || nombre.trim().length < 2) { toast.error("Código y nombre son obligatorios"); return; }
    const payload: ContratoPlantillaInput = {
      codigo: codigo.trim(),
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || null,
      tipo_servicio: tipoServicio,
      clausulas: clausulas.trim() || null,
      plan_pago_tipo: planPago,
      activo,
      pagos: pagos.map((p, i) => ({
        numero: i + 1,
        tipo: p.tipo,
        descripcion: p.descripcion.trim() || null,
        condicion_disparo: p.condicion_disparo,
        monto_porcentaje: p.monto_porcentaje == null || p.monto_porcentaje === ("" as unknown) ? null : Number(p.monto_porcentaje),
      })),
    };
    setSubmitting(true);
    try {
      if (editing) {
        await updateContratoPlantilla(initial!.id, payload);
        toast.success("Plantilla actualizada");
      } else {
        await createContratoPlantilla(payload);
        toast.success("Plantilla creada");
      }
      router.push("/admin/contrato-plantillas");
    } catch (err) {
      const code = err instanceof ApiError ? (err.body as { error?: string })?.error : null;
      toast.error(
        code === "codigo_duplicado" ? "Ya existe una plantilla con ese código"
          : code === "rol_no_designado" ? "No tenés permiso para modificar plantillas"
          : "Error guardando la plantilla",
      );
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { label: "Admin" }, { href: "/admin/contrato-plantillas", label: "Plantillas contrato" }, { label: editing ? "Editar" : "Nueva" }]}
        title={editing ? "Editar" : "Nueva"}
        titleAccent="plantilla de contrato"
        actions={<HeaderActionGhost href="/admin/contrato-plantillas" icon={<ChevronLeft className="h-3.5 w-3.5" />}>Volver</HeaderActionGhost>}
      />

      <form onSubmit={handleSubmit} className="space-y-6 pt-6">
        <Panel title="Datos de la plantilla" icon={<FileSignature className="h-3.5 w-3.5" />}>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field label="Código" required>
              <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={30} placeholder="PLT-CONTRATO-..." className="h-10 border-glass bg-glass" />
            </Field>
            <Field label="Nombre" required>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={200} className="h-10 border-glass bg-glass" />
            </Field>
            <Field label="Tipo de servicio">
              <Select value={tipoServicio} onValueChange={(v) => setTipoServicio(v as TipoServicioPlantilla)}>
                <SelectTrigger className="h-10 border-glass bg-glass"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="reparacion">Reparación</SelectItem>
                  <SelectItem value="fabricacion">Fabricación</SelectItem>
                  <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Plan de pago">
              <Select value={planPago} onValueChange={(v) => setPlanPago(v as PlanPagoTipo)}>
                <SelectTrigger className="h-10 border-glass bg-glass"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="anticipo_y_saldo">Anticipo + saldo</SelectItem>
                  <SelectItem value="hitos">Por hitos</SelectItem>
                  <SelectItem value="mensual">Mensual</SelectItem>
                  <SelectItem value="contado">Contado</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="mt-5">
            <Field label="Descripción">
              <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} className="border-glass bg-glass" />
            </Field>
          </div>
          {editing && (
            <label className="mt-4 flex w-fit cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="h-3.5 w-3.5 accent-copper" />
              <span className="text-foreground/85">Plantilla activa</span>
            </label>
          )}
        </Panel>

        <Panel title="Cláusulas" subtitle="Texto legal del contrato. Usá variables {{...}} que se rellenan al emitirlo.">
          <div className="mb-3 rounded-lg border border-glass bg-glass/40 p-3">
            <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Variables disponibles (clic para copiar):</p>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES_CONTRATO.map((v) => (
                <button key={v.key} type="button" title={v.desc}
                  onClick={() => { setClausulas((c) => `${c}{{${v.key}}}`); }}
                  className="rounded border border-copper/30 bg-copper/[0.06] px-1.5 py-0.5 font-mono text-[10.5px] text-copper hover:bg-copper/15">
                  {`{{${v.key}}}`}
                </button>
              ))}
            </div>
          </div>
          <Textarea value={clausulas} onChange={(e) => setClausulas(e.target.value)} rows={12}
            placeholder="PRIMERA — PARTES: …{{cliente_razon_social}}…, representada por {{representante_legal_nombre}} ({{representante_legal_cargo}})…"
            className="border-glass bg-glass font-mono text-[13px] leading-relaxed" />
        </Panel>

        <Panel
          title="Plan de pagos (preset)"
          subtitle={`${pagos.length} pago${pagos.length === 1 ? "" : "s"} · suma ${totalPct.toFixed(0)}%`}
          padded={false}
          action={
            <button type="button" onClick={addPago} className="inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-2.5 py-1 text-xs font-medium text-foreground/90 hover:bg-glass-elev">
              <Plus className="h-3.5 w-3.5" /> Agregar pago
            </button>
          }
        >
          <Table>
            <TableHeader>
              <TableRow className="border-glass bg-glass hover:bg-glass">
                <TableHead className="w-12 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">#</TableHead>
                <TableHead className="w-32 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Tipo</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Descripción</TableHead>
                <TableHead className="w-44 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Condición</TableHead>
                <TableHead className="w-24 text-right font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">%</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagos.map((p, idx) => (
                <TableRow key={p._id} className="border-glass hover:bg-glass">
                  <TableCell className="font-mono text-xs text-muted-foreground">{p.numero}</TableCell>
                  <TableCell>
                    <Select value={p.tipo} onValueChange={(v) => updatePago(idx, "tipo", v as TipoPagoPreset)}>
                      <SelectTrigger className="h-8 border-glass bg-glass text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="anticipo">Anticipo</SelectItem>
                        <SelectItem value="hito">Hito</SelectItem>
                        <SelectItem value="saldo">Saldo</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input value={p.descripcion} onChange={(e) => updatePago(idx, "descripcion", e.target.value)} placeholder="Descripción" className="h-8 border-glass bg-glass text-sm" />
                  </TableCell>
                  <TableCell>
                    <Select value={p.condicion_disparo ?? "_"} onValueChange={(v) => updatePago(idx, "condicion_disparo", v === "_" ? null : v as CondicionDisparo)}>
                      <SelectTrigger className="h-8 border-glass bg-glass text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_">Sin condición</SelectItem>
                        <SelectItem value="fecha_fija">Fecha fija</SelectItem>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="al_completar_ot">Al completar OT</SelectItem>
                        <SelectItem value="al_pasar_gate">Al pasar gate</SelectItem>
                        <SelectItem value="al_entregar">Al entregar</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input type="number" step="0.01" min="0" max="100" value={p.monto_porcentaje ?? ""} onChange={(e) => updatePago(idx, "monto_porcentaje", e.target.value === "" ? null : Number(e.target.value))} className="h-8 border-glass bg-glass text-right font-mono text-xs" />
                  </TableCell>
                  <TableCell>
                    <button type="button" onClick={() => removePago(idx)} disabled={pagos.length === 1} className="rounded p-1 text-rose-400 hover:bg-rose-500/10 disabled:opacity-30 disabled:pointer-events-none" aria-label="Eliminar pago">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>

        <div className="flex justify-end gap-2 border-t border-glass pt-5">
          <button type="button" onClick={() => router.push("/admin/contrato-plantillas")} disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-4 py-2 text-sm font-medium text-foreground/90 hover:bg-glass-elev disabled:opacity-40">
            Cancelar
          </button>
          <button type="submit" disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-4 py-2 text-sm font-medium text-white shadow-sm glow-copper-sm inset-highlight-md hover:glow-copper disabled:opacity-60">
            {submitting ? "Guardando…" : editing ? "Guardar cambios" : "Crear plantilla"}
          </button>
        </div>
      </form>

      <Toaster richColors position="top-right" theme="dark" />
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}{required && <span className="ml-1 text-copper">*</span>}
      </Label>
      {children}
    </div>
  );
}
