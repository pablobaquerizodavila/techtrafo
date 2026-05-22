"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listClientes, Cliente } from "@/lib/clientes";
import {
  Cotizacion,
  CotizacionCreateInput,
  CotizacionLinea,
  TipoServicio,
  calcularSubtotalLinea,
  calcularTotales,
} from "@/lib/cotizaciones";

interface Props {
  initial?: Cotizacion | null;
  readOnly?: boolean;
  onSubmit: (payload: CotizacionCreateInput) => Promise<void>;
  onCancel: () => void;
}

type LineaForm = Omit<CotizacionLinea, "id" | "subtotal_linea">;

function lineaVacia(orden: number): LineaForm {
  return {
    orden,
    item_id: null,
    descripcion: "",
    cantidad: 1,
    unidad_medida: "unid",
    precio_unitario: 0,
    descuento_linea_porcentaje: 0,
    costo_unitario: null,
    notas: null,
  };
}

export function CotizacionForm({ initial, readOnly = false, onSubmit, onCancel }: Props) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState<number | null>(initial?.cliente_id ?? null);
  const [tipoServicio, setTipoServicio] = useState<TipoServicio>(initial?.tipo_servicio ?? "fabricacion");
  const [fechaEmision, setFechaEmision] = useState(
    initial?.fecha_emision ? initial.fecha_emision.split("T")[0] : new Date().toISOString().split("T")[0],
  );
  const [fechaValidez, setFechaValidez] = useState(
    initial?.fecha_validez ? initial.fecha_validez.split("T")[0] : "",
  );
  const [descuentoGlobal, setDescuentoGlobal] = useState(
    initial?.descuento_global ? Number(initial.descuento_global) : 0,
  );
  const [ivaPorcentaje, setIvaPorcentaje] = useState(
    initial?.iva_porcentaje ? Number(initial.iva_porcentaje) : 15,
  );
  const [condicionesPago, setCondicionesPago] = useState(initial?.condiciones_pago ?? "");
  const [tiempoEntrega, setTiempoEntrega] = useState(initial?.tiempo_entrega ?? "");
  const [observaciones, setObservaciones] = useState(initial?.observaciones ?? "");
  const [notasInternas, setNotasInternas] = useState(initial?.notas_internas ?? "");
  const [margenPorcentaje, setMargenPorcentaje] = useState<number | "">(
    initial?.margen_porcentaje ? Number(initial.margen_porcentaje) : "",
  );

  const [lineas, setLineas] = useState<LineaForm[]>(() => {
    if (initial?.cotizacion_lineas?.length) {
      return initial.cotizacion_lineas.map((l) => ({
        orden: l.orden,
        item_id: l.item_id,
        descripcion: l.descripcion,
        cantidad: Number(l.cantidad),
        unidad_medida: l.unidad_medida,
        precio_unitario: Number(l.precio_unitario),
        descuento_linea_porcentaje: Number(l.descuento_linea_porcentaje),
        costo_unitario: l.costo_unitario != null ? Number(l.costo_unitario) : null,
        notas: l.notas,
      }));
    }
    return [lineaVacia(1)];
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar clientes activos al montar
  useEffect(() => {
    listClientes({ limit: 100 }).then((r) => setClientes(r.data)).catch(() => setClientes([]));
  }, []);

  const totales = useMemo(
    () => calcularTotales(lineas, ivaPorcentaje, descuentoGlobal),
    [lineas, ivaPorcentaje, descuentoGlobal],
  );

  function updateLinea<K extends keyof LineaForm>(index: number, key: K, value: LineaForm[K]) {
    setLineas((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  }

  function addLinea() {
    setLineas((prev) => [...prev, lineaVacia(prev.length + 1)]);
  }

  function removeLinea(index: number) {
    setLineas((prev) => prev.filter((_, i) => i !== index).map((l, i) => ({ ...l, orden: i + 1 })));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!clienteId) {
      setError("Selecciona un cliente");
      return;
    }
    if (lineas.length === 0) {
      setError("Agrega al menos una linea");
      return;
    }
    const lineaInvalida = lineas.findIndex((l) => !l.descripcion.trim() || l.cantidad <= 0 || l.precio_unitario < 0);
    if (lineaInvalida >= 0) {
      setError(`Linea ${lineaInvalida + 1} invalida (descripcion vacia, cantidad <= 0 o precio negativo)`);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        cliente_id: clienteId,
        tipo_servicio: tipoServicio,
        fecha_emision: fechaEmision,
        fecha_validez: fechaValidez || null,
        descuento_global: descuentoGlobal,
        iva_porcentaje: ivaPorcentaje,
        margen_porcentaje: margenPorcentaje === "" ? null : Number(margenPorcentaje),
        condiciones_pago: condicionesPago.trim() || null,
        tiempo_entrega: tiempoEntrega.trim() || null,
        observaciones: observaciones.trim() || null,
        notas_internas: notasInternas.trim() || null,
        lineas: lineas.map((l) => ({
          orden: l.orden,
          item_id: l.item_id,
          descripcion: l.descripcion.trim(),
          cantidad: Number(l.cantidad),
          unidad_medida: l.unidad_medida,
          precio_unitario: Number(l.precio_unitario),
          descuento_linea_porcentaje: Number(l.descuento_linea_porcentaje),
          costo_unitario: l.costo_unitario != null ? Number(l.costo_unitario) : null,
          notas: l.notas,
        })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Cabecera */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cliente">Cliente *</Label>
          <Select
            value={clienteId?.toString() ?? ""}
            onValueChange={(v) => setClienteId(v ? Number(v) : null)}
            disabled={readOnly}
          >
            <SelectTrigger id="cliente">
              <SelectValue placeholder="Selecciona un cliente" />
            </SelectTrigger>
            <SelectContent>
              {clientes.map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>
                  {c.razon_social} ({c.ruc_cedula})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tipo_servicio">Tipo de servicio *</Label>
          <Select value={tipoServicio} onValueChange={(v) => setTipoServicio(v as TipoServicio)} disabled={readOnly}>
            <SelectTrigger id="tipo_servicio">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="reparacion">Reparacion (Ruta A)</SelectItem>
              <SelectItem value="fabricacion">Fabricacion (Ruta B)</SelectItem>
              <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
              <SelectItem value="otro">Otro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="fecha_emision">Fecha de emision *</Label>
          <Input
            id="fecha_emision"
            type="date"
            value={fechaEmision}
            onChange={(e) => setFechaEmision(e.target.value)}
            disabled={readOnly}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="fecha_validez">Valida hasta</Label>
          <Input
            id="fecha_validez"
            type="date"
            value={fechaValidez}
            onChange={(e) => setFechaValidez(e.target.value)}
            disabled={readOnly}
            min={fechaEmision}
          />
        </div>
      </div>

      {/* Tabla de lineas */}
      <div className="rounded-md border">
        <div className="flex items-center justify-between p-3">
          <h3 className="text-sm font-semibold">Lineas de la cotizacion</h3>
          {!readOnly && (
            <Button type="button" variant="outline" size="sm" onClick={addLinea}>
              <Plus className="mr-1 h-4 w-4" /> Agregar linea
            </Button>
          )}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Descripcion</TableHead>
              <TableHead className="w-24">Cant.</TableHead>
              <TableHead className="w-20">Unidad</TableHead>
              <TableHead className="w-28">Precio U.</TableHead>
              <TableHead className="w-20">Desc %</TableHead>
              <TableHead className="w-28 text-right">Subtotal</TableHead>
              {!readOnly && <TableHead className="w-12"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineas.map((linea, i) => (
              <TableRow key={i}>
                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                <TableCell>
                  <Input
                    value={linea.descripcion}
                    onChange={(e) => updateLinea(i, "descripcion", e.target.value)}
                    placeholder="Descripcion del item o servicio"
                    disabled={readOnly}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.001"
                    min="0.001"
                    value={linea.cantidad}
                    onChange={(e) => updateLinea(i, "cantidad", Number(e.target.value))}
                    disabled={readOnly}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={linea.unidad_medida}
                    onChange={(e) => updateLinea(i, "unidad_medida", e.target.value)}
                    disabled={readOnly}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={linea.precio_unitario}
                    onChange={(e) => updateLinea(i, "precio_unitario", Number(e.target.value))}
                    disabled={readOnly}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={linea.descuento_linea_porcentaje}
                    onChange={(e) => updateLinea(i, "descuento_linea_porcentaje", Number(e.target.value))}
                    disabled={readOnly}
                  />
                </TableCell>
                <TableCell className="text-right font-mono">{calcularSubtotalLinea(linea).toFixed(2)}</TableCell>
                {!readOnly && (
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLinea(i)}
                      disabled={lineas.length === 1}
                      aria-label="Eliminar linea"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Resumen + ajustes */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-md border bg-muted/20 p-4">
          <h3 className="text-sm font-semibold">Ajustes globales</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="descuento_global" className="text-xs">Descuento global ($)</Label>
              <Input
                id="descuento_global"
                type="number"
                step="0.01"
                min="0"
                value={descuentoGlobal}
                onChange={(e) => setDescuentoGlobal(Number(e.target.value))}
                disabled={readOnly}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="iva_porcentaje" className="text-xs">IVA %</Label>
              <Input
                id="iva_porcentaje"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={ivaPorcentaje}
                onChange={(e) => setIvaPorcentaje(Number(e.target.value))}
                disabled={readOnly}
              />
            </div>
            <div className="space-y-1 col-span-2">
              <Label htmlFor="margen" className="text-xs">Margen interno % (analisis, no se muestra al cliente)</Label>
              <Input
                id="margen"
                type="number"
                step="0.01"
                value={margenPorcentaje}
                onChange={(e) => setMargenPorcentaje(e.target.value === "" ? "" : Number(e.target.value))}
                disabled={readOnly}
              />
            </div>
          </div>
        </div>

        <div className="rounded-md border bg-primary/5 p-4">
          <h3 className="mb-3 text-sm font-semibold">Totales</h3>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal lineas:</dt>
              <dd className="font-mono">${(totales.subtotal + descuentoGlobal).toFixed(2)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Descuento global:</dt>
              <dd className="font-mono text-destructive">−${descuentoGlobal.toFixed(2)}</dd>
            </div>
            <div className="flex justify-between border-t pt-1">
              <dt>Subtotal:</dt>
              <dd className="font-mono font-semibold">${totales.subtotal.toFixed(2)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">IVA ({ivaPorcentaje}%):</dt>
              <dd className="font-mono">${totales.iva_valor.toFixed(2)}</dd>
            </div>
            <div className="flex justify-between border-t border-primary pt-2 text-base">
              <dt className="font-bold">TOTAL:</dt>
              <dd className="font-mono font-bold">${totales.total.toFixed(2)}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Notas / condiciones */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="condiciones_pago">Condiciones de pago</Label>
          <Textarea
            id="condiciones_pago"
            rows={2}
            value={condicionesPago}
            onChange={(e) => setCondicionesPago(e.target.value)}
            placeholder="Ej: 50% anticipo, 50% contra entrega"
            disabled={readOnly}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tiempo_entrega">Tiempo de entrega</Label>
          <Input
            id="tiempo_entrega"
            value={tiempoEntrega}
            onChange={(e) => setTiempoEntrega(e.target.value)}
            placeholder="Ej: 45 dias laborables"
            disabled={readOnly}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="observaciones">Observaciones (visible al cliente)</Label>
          <Textarea
            id="observaciones"
            rows={2}
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            disabled={readOnly}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="notas_internas">Notas internas (no visibles al cliente)</Label>
          <Textarea
            id="notas_internas"
            rows={2}
            value={notasInternas}
            onChange={(e) => setNotasInternas(e.target.value)}
            disabled={readOnly}
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">{error}</p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          {readOnly ? "Cerrar" : "Cancelar"}
        </Button>
        {!readOnly && (
          <Button type="submit" disabled={submitting}>
            {submitting ? "Guardando..." : initial ? "Guardar cambios" : "Crear cotizacion"}
          </Button>
        )}
      </div>
    </form>
  );
}
