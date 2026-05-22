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
import {
  Item,
  Lote,
  MovimientoInput,
  ReferenciaTipo,
  TipoMovimiento,
  Ubicacion,
  createLote,
  listItems,
  listLotes,
  listUbicaciones,
} from "@/lib/inventario";

interface Props {
  onSubmit: (payload: MovimientoInput) => Promise<void>;
  onCancel: () => void;
}

export function MovimientoForm({ onSubmit, onCancel }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);

  const [tipo, setTipo] = useState<TipoMovimiento>("entrada");
  const [itemId, setItemId] = useState<number | null>(null);
  const [ubicacionOrigenId, setUbicacionOrigenId] = useState<number | null>(null);
  const [ubicacionDestinoId, setUbicacionDestinoId] = useState<number | null>(null);
  const [loteId, setLoteId] = useState<number | null>(null);
  const [nuevoLote, setNuevoLote] = useState({ numero: "", proveedor: "", fecha_vencimiento: "" });
  const [cantidad, setCantidad] = useState(0);
  const [costoUnit, setCostoUnit] = useState<number | "">("");
  const [referenciaTipo, setReferenciaTipo] = useState<ReferenciaTipo | "">("");
  const [motivo, setMotivo] = useState("");
  const [observaciones, setObservaciones] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listItems({ limit: 200, estado: "activo" }).then((r) => setItems(r.data)).catch(() => {});
    listUbicaciones().then((r) => setUbicaciones(r.data)).catch(() => {});
  }, []);

  // Cargar lotes cuando cambia el item (si controla_lote)
  useEffect(() => {
    setLoteId(null);
    setNuevoLote({ numero: "", proveedor: "", fecha_vencimiento: "" });
    if (!itemId) { setLotes([]); return; }
    const item = items.find((i) => i.id === itemId);
    if (item?.controla_lote) {
      listLotes(itemId).then((r) => setLotes(r.data)).catch(() => setLotes([]));
    } else {
      setLotes([]);
    }
  }, [itemId, items]);

  const itemSeleccionado = items.find((i) => i.id === itemId);
  const requiereLote = itemSeleccionado?.controla_lote ?? false;
  const necesitaOrigen = ["salida", "ajuste_negativo", "transferencia"].includes(tipo);
  const necesitaDestino = ["entrada", "ajuste_positivo", "transferencia"].includes(tipo);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!itemId) { setError("Selecciona un item"); return; }
    if (cantidad <= 0) { setError("La cantidad debe ser mayor a 0"); return; }
    if (necesitaOrigen && !ubicacionOrigenId) { setError("Selecciona ubicacion de origen"); return; }
    if (necesitaDestino && !ubicacionDestinoId) { setError("Selecciona ubicacion de destino"); return; }
    if (tipo === "transferencia" && ubicacionOrigenId === ubicacionDestinoId) {
      setError("Origen y destino deben ser diferentes en transferencia"); return;
    }

    setSubmitting(true);
    try {
      // Si necesita lote y se quiere crear uno nuevo (no se selecciono uno)
      let finalLoteId = loteId;
      if (requiereLote && !finalLoteId && tipo === "entrada" && nuevoLote.numero.trim()) {
        const loteRes = await createLote({
          item_id: itemId,
          numero_lote: nuevoLote.numero.trim(),
          proveedor: nuevoLote.proveedor.trim() || null,
          fecha_vencimiento: nuevoLote.fecha_vencimiento || null,
        });
        finalLoteId = loteRes.data.id;
      }

      if (requiereLote && !finalLoteId) {
        setError("Item con lote: selecciona un lote existente o crea uno nuevo");
        setSubmitting(false);
        return;
      }

      await onSubmit({
        tipo,
        item_id: itemId,
        ubicacion_origen_id: necesitaOrigen ? ubicacionOrigenId : null,
        ubicacion_destino_id: necesitaDestino ? ubicacionDestinoId : null,
        lote_id: requiereLote ? finalLoteId : null,
        cantidad,
        costo_unitario: costoUnit === "" ? null : Number(costoUnit),
        referencia_tipo: referenciaTipo || null,
        motivo: motivo.trim() || null,
        observaciones: observaciones.trim() || null,
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
          <Label htmlFor="tipo">Tipo de movimiento *</Label>
          <Select value={tipo} onValueChange={(v) => setTipo(v as TipoMovimiento)}>
            <SelectTrigger id="tipo"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItemUI value="entrada">Entrada (compra, devolucion)</SelectItemUI>
              <SelectItemUI value="salida">Salida (consumo, venta)</SelectItemUI>
              <SelectItemUI value="transferencia">Transferencia entre ubicaciones</SelectItemUI>
              <SelectItemUI value="ajuste_positivo">Ajuste positivo (inventario fisico)</SelectItemUI>
              <SelectItemUI value="ajuste_negativo">Ajuste negativo (merma, dano)</SelectItemUI>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="item">Item *</Label>
          <Select value={itemId?.toString() ?? ""} onValueChange={(v) => setItemId(v ? Number(v) : null)}>
            <SelectTrigger id="item"><SelectValue placeholder="Selecciona un item" /></SelectTrigger>
            <SelectContent>
              {items.filter((i) => i.controla_stock).map((i) => (
                <SelectItemUI key={i.id} value={i.id.toString()}>
                  {i.nombre} ({i.codigo_interno})
                </SelectItemUI>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {necesitaOrigen && (
        <div className="space-y-2">
          <Label htmlFor="origen">Ubicacion origen *</Label>
          <Select value={ubicacionOrigenId?.toString() ?? ""} onValueChange={(v) => setUbicacionOrigenId(v ? Number(v) : null)}>
            <SelectTrigger id="origen"><SelectValue placeholder="Desde..." /></SelectTrigger>
            <SelectContent>
              {ubicaciones.map((u) => (
                <SelectItemUI key={u.id} value={u.id.toString()}>{u.nombre}</SelectItemUI>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {necesitaDestino && (
        <div className="space-y-2">
          <Label htmlFor="destino">Ubicacion destino *</Label>
          <Select value={ubicacionDestinoId?.toString() ?? ""} onValueChange={(v) => setUbicacionDestinoId(v ? Number(v) : null)}>
            <SelectTrigger id="destino"><SelectValue placeholder="Hacia..." /></SelectTrigger>
            <SelectContent>
              {ubicaciones.map((u) => (
                <SelectItemUI key={u.id} value={u.id.toString()}>{u.nombre}</SelectItemUI>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {requiereLote && (
        <div className="rounded-md border p-3">
          <Label className="text-sm">Lote (requerido para este item)</Label>
          {lotes.length > 0 && (
            <Select value={loteId?.toString() ?? ""} onValueChange={(v) => setLoteId(v ? Number(v) : null)}>
              <SelectTrigger className="mt-2"><SelectValue placeholder="Selecciona un lote existente" /></SelectTrigger>
              <SelectContent>
                {lotes.map((l) => (
                  <SelectItemUI key={l.id} value={l.id.toString()}>
                    {l.numero_lote}{l.proveedor ? ` · ${l.proveedor}` : ""}{l.fecha_vencimiento ? ` · vence ${l.fecha_vencimiento.split("T")[0]}` : ""}
                  </SelectItemUI>
                ))}
              </SelectContent>
            </Select>
          )}
          {tipo === "entrada" && !loteId && (
            <div className="mt-3 space-y-2 rounded bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">O crea un lote nuevo:</p>
              <Input placeholder="Numero de lote *" value={nuevoLote.numero} onChange={(e) => setNuevoLote((p) => ({ ...p, numero: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Proveedor" value={nuevoLote.proveedor} onChange={(e) => setNuevoLote((p) => ({ ...p, proveedor: e.target.value }))} />
                <Input type="date" placeholder="Vencimiento" value={nuevoLote.fecha_vencimiento} onChange={(e) => setNuevoLote((p) => ({ ...p, fecha_vencimiento: e.target.value }))} />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cantidad">Cantidad *</Label>
          <Input id="cantidad" type="number" step="0.001" min="0.001" value={cantidad || ""} onChange={(e) => setCantidad(Number(e.target.value))} required />
        </div>
        {(tipo === "entrada" || tipo === "ajuste_positivo") && (
          <div className="space-y-2">
            <Label htmlFor="costo">Costo unitario ($)</Label>
            <Input id="costo" type="number" step="0.01" min="0" value={costoUnit} onChange={(e) => setCostoUnit(e.target.value === "" ? "" : Number(e.target.value))} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="ref_tipo">Referencia</Label>
          <Select value={referenciaTipo || "_"} onValueChange={(v) => setReferenciaTipo(v === "_" ? "" : v as ReferenciaTipo)}>
            <SelectTrigger id="ref_tipo"><SelectValue placeholder="Tipo de referencia" /></SelectTrigger>
            <SelectContent>
              <SelectItemUI value="_">Sin referencia</SelectItemUI>
              <SelectItemUI value="compra">Compra</SelectItemUI>
              <SelectItemUI value="ot">OT (orden de trabajo)</SelectItemUI>
              <SelectItemUI value="devolucion">Devolucion</SelectItemUI>
              <SelectItemUI value="inventario_fisico">Inventario fisico</SelectItemUI>
              <SelectItemUI value="manual">Manual</SelectItemUI>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="motivo">Motivo</Label>
          <Input id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: Compra inicial, consumo OT-2026-0001" />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="observaciones">Observaciones</Label>
        <Textarea id="observaciones" rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
      </div>

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>Cancelar</Button>
        <Button type="submit" disabled={submitting}>{submitting ? "Registrando..." : "Registrar movimiento"}</Button>
      </div>
    </form>
  );
}
