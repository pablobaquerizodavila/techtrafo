"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  CATEGORIAS_LABEL, CategoriaComponente, CotizacionPlantilla,
  PlantillaComponente, PlantillaCreateInput, TipoServicioPlantilla,
} from "@/lib/cotizacion-plantillas";

interface Props {
  initial?: CotizacionPlantilla | null;
  onSubmit: (payload: PlantillaCreateInput) => Promise<void>;
  onCancel: () => void;
}

function compVacio(orden: number): PlantillaComponente {
  return {
    orden,
    categoria: "materia_prima",
    item_id: null,
    descripcion: "",
    cantidad_default: 1,
    unidad_medida: "unid",
    precio_unitario_default: 0,
    costo_unitario_default: null,
    tiempo_aprovisionamiento_default: 0,
    notas: null,
  };
}

export function PlantillaForm({ initial, onSubmit, onCancel }: Props) {
  const [codigo, setCodigo] = useState(initial?.codigo ?? "");
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? "");
  const [tipoServicio, setTipoServicio] = useState<TipoServicioPlantilla>(initial?.tipo_servicio ?? "fabricacion");
  const [kvaMin, setKvaMin] = useState(initial?.capacidad_kva_min?.toString() ?? "");
  const [kvaMax, setKvaMax] = useState(initial?.capacidad_kva_max?.toString() ?? "");
  const [margen, setMargen] = useState(Number(initial?.margen_porcentaje_default ?? 25));
  const [contingencia, setContingencia] = useState(Number(initial?.contingencia_porcentaje ?? 5));
  const [iva, setIva] = useState(Number(initial?.iva_porcentaje_default ?? 15));
  const [tiempoBase, setTiempoBase] = useState(initial?.tiempo_entrega_base_dias ?? 30);
  const [condicionesPago, setCondicionesPago] = useState(initial?.condiciones_pago_default ?? "");
  const [observaciones, setObservaciones] = useState(initial?.observaciones_default ?? "");
  const [componentes, setComponentes] = useState<PlantillaComponente[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial?.plantilla_componentes) {
      setComponentes(initial.plantilla_componentes.map((c) => ({
        ...c,
        cantidad_default: Number(c.cantidad_default),
        precio_unitario_default: Number(c.precio_unitario_default),
        costo_unitario_default: c.costo_unitario_default != null ? Number(c.costo_unitario_default) : null,
      })));
    } else {
      setComponentes([compVacio(1)]);
    }
  }, [initial]);

  function updateComp<K extends keyof PlantillaComponente>(i: number, key: K, value: PlantillaComponente[K]) {
    setComponentes((arr) => arr.map((c, idx) => idx === i ? { ...c, [key]: value } : c));
  }
  function addComp() {
    setComponentes((arr) => [...arr, compVacio(arr.length + 1)]);
  }
  function removeComp(i: number) {
    setComponentes((arr) => arr.filter((_, idx) => idx !== i));
  }

  async function handleSubmit() {
    if (!codigo.trim() || !nombre.trim() || componentes.length === 0) return;
    setSaving(true);
    try {
      await onSubmit({
        codigo: codigo.trim(),
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        tipo_servicio: tipoServicio,
        capacidad_kva_min: kvaMin ? Number(kvaMin) : null,
        capacidad_kva_max: kvaMax ? Number(kvaMax) : null,
        margen_porcentaje_default: margen,
        contingencia_porcentaje: contingencia,
        iva_porcentaje_default: iva,
        tiempo_entrega_base_dias: tiempoBase,
        condiciones_pago_default: condicionesPago.trim() || null,
        observaciones_default: observaciones.trim() || null,
        componentes: componentes.map((c, i) => ({
          orden: c.orden ?? i + 1,
          categoria: c.categoria,
          item_id: c.item_id,
          descripcion: c.descripcion,
          cantidad_default: c.cantidad_default,
          unidad_medida: c.unidad_medida,
          precio_unitario_default: c.precio_unitario_default,
          costo_unitario_default: c.costo_unitario_default,
          tiempo_aprovisionamiento_default: c.tiempo_aprovisionamiento_default,
          notas: c.notas,
        })),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <section className="grid grid-cols-2 gap-3 rounded-md border p-4">
        <div className="space-y-1">
          <Label htmlFor="codigo">Código *</Label>
          <Input id="codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="PLT-REP-500" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tipo">Tipo de servicio *</Label>
          <Select value={tipoServicio} onValueChange={(v) => setTipoServicio(v as TipoServicioPlantilla)}>
            <SelectTrigger id="tipo"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="reparacion">Reparación</SelectItem>
              <SelectItem value="fabricacion">Fabricación</SelectItem>
              <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
              <SelectItem value="otro">Otro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-1">
          <Label htmlFor="nombre">Nombre *</Label>
          <Input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Reparación transformador trifásico 500 kVA" />
        </div>
        <div className="col-span-2 space-y-1">
          <Label htmlFor="desc">Descripción</Label>
          <Textarea id="desc" rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="kva_min">kVA mínimo (aplicable)</Label>
          <Input id="kva_min" type="number" value={kvaMin} onChange={(e) => setKvaMin(e.target.value)} placeholder="250" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="kva_max">kVA máximo</Label>
          <Input id="kva_max" type="number" value={kvaMax} onChange={(e) => setKvaMax(e.target.value)} placeholder="750" />
        </div>
        <div className="space-y-1">
          <Label>Margen comercial %</Label>
          <Input type="number" step="0.1" value={margen} onChange={(e) => setMargen(Number(e.target.value))} />
        </div>
        <div className="space-y-1">
          <Label>Contingencia %</Label>
          <Input type="number" step="0.1" value={contingencia} onChange={(e) => setContingencia(Number(e.target.value))} />
        </div>
        <div className="space-y-1">
          <Label>IVA %</Label>
          <Input type="number" step="0.1" value={iva} onChange={(e) => setIva(Number(e.target.value))} />
        </div>
        <div className="space-y-1">
          <Label>Tiempo entrega base (días)</Label>
          <Input type="number" value={tiempoBase} onChange={(e) => setTiempoBase(Number(e.target.value))} />
        </div>
        <div className="col-span-2 space-y-1">
          <Label htmlFor="cp">Condiciones de pago (default)</Label>
          <Input id="cp" value={condicionesPago} onChange={(e) => setCondicionesPago(e.target.value)} placeholder="50% anticipo / 50% contra entrega" />
        </div>
        <div className="col-span-2 space-y-1">
          <Label htmlFor="obs">Observaciones (default)</Label>
          <Textarea id="obs" rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
        </div>
      </section>

      {/* Componentes */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Componentes ({componentes.length})</h3>
          <Button type="button" variant="outline" size="sm" onClick={addComp}>
            <Plus className="mr-1 h-4 w-4" /> Agregar componente
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead className="w-40">Categoría</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="w-20">item_id</TableHead>
              <TableHead className="w-20">Cant.</TableHead>
              <TableHead className="w-20">Unid.</TableHead>
              <TableHead className="w-28">Precio U.</TableHead>
              <TableHead className="w-24">Costo U.</TableHead>
              <TableHead className="w-20">Días apro.</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {componentes.map((c, i) => (
              <TableRow key={i}>
                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                <TableCell>
                  <Select value={c.categoria} onValueChange={(v) => updateComp(i, "categoria", v as CategoriaComponente)}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(CATEGORIAS_LABEL) as CategoriaComponente[]).map((k) => (
                        <SelectItem key={k} value={k}>{CATEGORIAS_LABEL[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input className="h-8" value={c.descripcion} onChange={(e) => updateComp(i, "descripcion", e.target.value)} placeholder="Descripción de la línea" />
                </TableCell>
                <TableCell>
                  <Input className="h-8" type="number" value={c.item_id ?? ""} onChange={(e) => updateComp(i, "item_id", e.target.value ? Number(e.target.value) : null)} placeholder="—" title="ID del item de bodega (opcional). Si se setea, se valida stock al usar la plantilla." />
                </TableCell>
                <TableCell>
                  <Input className="h-8" type="number" step="0.01" value={c.cantidad_default} onChange={(e) => updateComp(i, "cantidad_default", Number(e.target.value))} />
                </TableCell>
                <TableCell>
                  <Input className="h-8" value={c.unidad_medida} onChange={(e) => updateComp(i, "unidad_medida", e.target.value)} />
                </TableCell>
                <TableCell>
                  <Input className="h-8" type="number" step="0.01" value={c.precio_unitario_default} onChange={(e) => updateComp(i, "precio_unitario_default", Number(e.target.value))} />
                </TableCell>
                <TableCell>
                  <Input className="h-8" type="number" step="0.01" value={c.costo_unitario_default ?? ""} onChange={(e) => updateComp(i, "costo_unitario_default", e.target.value ? Number(e.target.value) : null)} placeholder="—" title="Costo interno (opcional). Si no hay precio_unitario, se calcula desde costo × (1+contingencia) × (1+margen)" />
                </TableCell>
                <TableCell>
                  <Input className="h-8" type="number" value={c.tiempo_aprovisionamiento_default} onChange={(e) => updateComp(i, "tiempo_aprovisionamiento_default", Number(e.target.value))} title="Días estimados si NO hay stock (solo aplica si tiene item_id)" />
                </TableCell>
                <TableCell>
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeComp(i)} disabled={componentes.length === 1}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">
          <strong>item_id</strong>: si se setea, al generar la cotización se valida stock en bodega; si falta, la línea queda marcada como pendiente de aprovisionamiento con los <strong>Días apro.</strong> indicados. <strong>Costo U.</strong>: si <strong>Precio U.</strong>={"0"}, se calcula como costo × (1+contingencia%) × (1+margen%).
        </p>
      </section>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button onClick={handleSubmit} disabled={saving || !codigo.trim() || !nombre.trim()}>
          {saving ? "Guardando..." : (initial ? "Actualizar plantilla" : "Crear plantilla")}
        </Button>
      </div>
    </div>
  );
}
