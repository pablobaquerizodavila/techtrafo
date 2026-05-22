"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem as SelectItemUI,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Categoria, Item, ItemInput, TipoItem, listCategorias } from "@/lib/inventario";

interface Props {
  initial?: Item | null;
  onSubmit: (payload: ItemInput) => Promise<void>;
  onCancel: () => void;
}

type Trazabilidad = "sin" | "lote" | "serie";

export function ItemForm({ initial, onSubmit, onCancel }: Props) {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [codigoInterno, setCodigoInterno] = useState(initial?.codigo_interno ?? "");
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? "");
  const [categoriaId, setCategoriaId] = useState<number | null>(initial?.categoria_id ?? null);
  const [tipoItem, setTipoItem] = useState<TipoItem>(initial?.tipo_item ?? "insumo");
  const [unidadMedida, setUnidadMedida] = useState(initial?.unidad_medida ?? "unid");

  // Estado consolidado de trazabilidad (en lugar de 2 checkboxes separados)
  const [trazabilidad, setTrazabilidad] = useState<Trazabilidad>(() => {
    if (initial?.controla_serie) return "serie";
    if (initial?.controla_lote) return "lote";
    return "sin";
  });

  const [controlaStock, setControlaStock] = useState(initial?.controla_stock ?? true);
  const [costoRef, setCostoRef] = useState(initial?.costo_referencia ? Number(initial.costo_referencia) : 0);
  const [precioRef, setPrecioRef] = useState(initial?.precio_referencia ? Number(initial.precio_referencia) : 0);
  const [stockMin, setStockMin] = useState(initial?.stock_minimo ? Number(initial.stock_minimo) : 0);
  const [stockMax, setStockMax] = useState(initial?.stock_maximo ? Number(initial.stock_maximo) : 0);
  const [puntoReorden, setPuntoReorden] = useState(initial?.punto_reorden ? Number(initial.punto_reorden) : 0);
  const [proveedor, setProveedor] = useState(initial?.proveedor_preferido ?? "");
  const [pesoKg, setPesoKg] = useState<number | "">(initial?.peso_kg ? Number(initial.peso_kg) : "");
  const [notas, setNotas] = useState(initial?.notas ?? "");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCategorias().then((r) => setCategorias(r.data)).catch(() => setCategorias([]));
  }, []);

  // Reglas de negocio: servicios no controlan stock
  useEffect(() => {
    if (tipoItem === "servicio") {
      setControlaStock(false);
      setTrazabilidad("sin");
    }
  }, [tipoItem]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!categoriaId) {
      setError("Selecciona una categoria");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        codigo_interno: codigoInterno.trim(),
        categoria_id: categoriaId,
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || null,
        tipo_item: tipoItem,
        unidad_medida: unidadMedida.trim() || "unid",
        controla_stock: controlaStock,
        controla_lote: trazabilidad === "lote",
        controla_serie: trazabilidad === "serie",
        costo_referencia: Number(costoRef) || 0,
        precio_referencia: Number(precioRef) || 0,
        stock_minimo: Number(stockMin) || 0,
        stock_maximo: Number(stockMax) || 0,
        punto_reorden: Number(puntoReorden) || 0,
        proveedor_preferido: proveedor.trim() || null,
        peso_kg: pesoKg === "" ? null : Number(pesoKg),
        notas: notas.trim() || null,
        estado: initial?.estado ?? "activo",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="codigo_interno">Codigo interno *</Label>
          <Input
            id="codigo_interno"
            value={codigoInterno}
            onChange={(e) => setCodigoInterno(e.target.value)}
            placeholder="Ej: ACE-DIALA-S4"
            required
            maxLength={50}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="categoria">Categoria *</Label>
          <Select value={categoriaId?.toString() ?? ""} onValueChange={(v) => setCategoriaId(v ? Number(v) : null)}>
            <SelectTrigger id="categoria"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
            <SelectContent>
              {categorias.map((c) => (
                <SelectItemUI key={c.id} value={c.id.toString()}>{c.nombre}</SelectItemUI>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre *</Label>
        <Input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={200} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="descripcion">Descripcion</Label>
        <Textarea id="descripcion" rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="tipo_item">Tipo *</Label>
          <Select value={tipoItem} onValueChange={(v) => setTipoItem(v as TipoItem)}>
            <SelectTrigger id="tipo_item"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItemUI value="insumo">Insumo</SelectItemUI>
              <SelectItemUI value="componente">Componente</SelectItemUI>
              <SelectItemUI value="herramienta">Herramienta</SelectItemUI>
              <SelectItemUI value="servicio">Servicio</SelectItemUI>
              <SelectItemUI value="producto_terminado">Producto terminado</SelectItemUI>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="unidad">Unidad *</Label>
          <Input id="unidad" value={unidadMedida} onChange={(e) => setUnidadMedida(e.target.value)} required maxLength={20} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="peso">Peso (kg)</Label>
          <Input id="peso" type="number" step="0.001" min="0" value={pesoKg} onChange={(e) => setPesoKg(e.target.value === "" ? "" : Number(e.target.value))} />
        </div>
      </div>

      {/* Trazabilidad + control de stock */}
      <div className="rounded-md border p-4">
        <h3 className="mb-3 text-sm font-semibold">Trazabilidad y stock</h3>
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <input
              id="controla_stock"
              type="checkbox"
              checked={controlaStock}
              disabled={tipoItem === "servicio"}
              onChange={(e) => setControlaStock(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="controla_stock" className="cursor-pointer">
              Controlar stock {tipoItem === "servicio" && <span className="text-xs text-muted-foreground">(deshabilitado para servicios)</span>}
            </Label>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Trazabilidad por unidad:</Label>
            <div className="flex gap-2">
              {[
                { v: "sin", l: "Sin trazabilidad" },
                { v: "lote", l: "Por lote (ej: aceite)" },
                { v: "serie", l: "Por serie (ej: trafo)" },
              ].map(({ v, l }) => (
                <Button
                  key={v}
                  type="button"
                  variant={trazabilidad === v ? "default" : "outline"}
                  size="sm"
                  disabled={!controlaStock}
                  onClick={() => setTrazabilidad(v as Trazabilidad)}
                >
                  {l}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="costo">Costo referencia (USD)</Label>
          <Input id="costo" type="number" step="0.01" min="0" value={costoRef} onChange={(e) => setCostoRef(Number(e.target.value))} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="precio">Precio referencia (USD)</Label>
          <Input id="precio" type="number" step="0.01" min="0" value={precioRef} onChange={(e) => setPrecioRef(Number(e.target.value))} />
        </div>
      </div>

      {controlaStock && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="stock_min">Stock minimo</Label>
            <Input id="stock_min" type="number" step="0.001" min="0" value={stockMin} onChange={(e) => setStockMin(Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reorden">Punto reorden</Label>
            <Input id="reorden" type="number" step="0.001" min="0" value={puntoReorden} onChange={(e) => setPuntoReorden(Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="stock_max">Stock maximo</Label>
            <Input id="stock_max" type="number" step="0.001" min="0" value={stockMax} onChange={(e) => setStockMax(Number(e.target.value))} />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="proveedor">Proveedor preferido</Label>
        <Input id="proveedor" value={proveedor} onChange={(e) => setProveedor(e.target.value)} maxLength={200} placeholder="Ej: Shell Ecuador" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="notas">Notas internas</Label>
        <Textarea id="notas" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
      </div>

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>Cancelar</Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Guardando..." : initial ? "Actualizar" : "Crear item"}
        </Button>
      </div>
    </form>
  );
}
