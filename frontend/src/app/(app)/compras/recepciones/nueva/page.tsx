"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import {
  createRecepcion, getOrdenCompra, OrdenCompra, RecepcionLineaInput,
} from "@/lib/compras";
import { listUbicaciones, Ubicacion } from "@/lib/inventario";
import { ApiError } from "@/lib/api";

interface LineaForm {
  orden_compra_linea_id: number;
  item_codigo: string;
  descripcion: string;
  unidad_medida: string;
  saldo: number;
  precio_oc: number;
  cantidad_recibida: number;
  cantidad_rechazada: number;
  precio_real: number | null;
  resultado_inspeccion: "aprobado" | "rechazado" | "observado" | "pendiente_inspeccion";
  motivo_rechazo: string;
  ubicacion_id: number | null;
}

export default function NuevaRecepcionPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const ocId = Number(sp.get("oc") ?? 0);
  const [oc, setOc] = useState<OrdenCompra | null>(null);
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [lineas, setLineas] = useState<LineaForm[]>([]);
  const [guia, setGuia] = useState("");
  const [factNum, setFactNum] = useState("");
  const [factFecha, setFactFecha] = useState("");
  const [estadoGeneral, setEstadoGeneral] = useState<"bueno" | "observado" | "danado" | "incompleto">("bueno");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!ocId) return;
    try {
      const [ocRes, ubRes] = await Promise.all([
        getOrdenCompra(ocId),
        listUbicaciones(false),
      ]);
      setOc(ocRes.data);
      setUbicaciones(ubRes.data);
      const defaultUb = ubRes.data[0]?.id ?? null;
      const initial = (ocRes.data.orden_compra_lineas ?? [])
        .filter((l) => l.estado_linea !== "recibida" && l.estado_linea !== "cancelada")
        .map((l) => {
          const saldo = Math.max(Number(l.cantidad_solicitada) - Number(l.cantidad_recibida ?? 0), 0);
          return {
            orden_compra_linea_id: Number(l.id),
            item_codigo: l.items?.codigo_interno ?? "—",
            descripcion: l.descripcion,
            unidad_medida: l.unidad_medida,
            saldo,
            precio_oc: Number(l.precio_unitario),
            cantidad_recibida: saldo,
            cantidad_rechazada: 0,
            precio_real: null,
            resultado_inspeccion: "aprobado" as const,
            motivo_rechazo: "",
            ubicacion_id: l.ubicacion_destino_id ?? defaultUb,
          };
        });
      setLineas(initial);
    } catch (err) {
      toast.error(err instanceof ApiError ? `Error ${err.status}` : "Error cargando OC");
    }
  }, [ocId]);

  useEffect(() => { load(); }, [load]);

  function updateLinea(idx: number, patch: Partial<LineaForm>) {
    setLineas((curr) => curr.map((l, i) => i === idx ? { ...l, ...patch } : l));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!oc) return;
    const lineasInput: RecepcionLineaInput[] = lineas
      .filter((l) => l.cantidad_recibida > 0 || l.cantidad_rechazada > 0)
      .map((l) => ({
        orden_compra_linea_id: l.orden_compra_linea_id,
        cantidad_recibida: l.cantidad_recibida,
        cantidad_rechazada: l.cantidad_rechazada,
        precio_real: l.precio_real ?? undefined,
        resultado_inspeccion: l.resultado_inspeccion,
        motivo_rechazo: l.resultado_inspeccion === "rechazado" ? l.motivo_rechazo : undefined,
        ubicacion_id: l.ubicacion_id ?? undefined,
      }));
    if (lineasInput.length === 0) {
      toast.error("Indicá al menos una cantidad recibida o rechazada");
      return;
    }
    setSaving(true);
    try {
      const res = await createRecepcion({
        orden_compra_id: oc.id,
        guia_remision_numero: guia || null,
        factura_numero: factNum || null,
        factura_fecha: factFecha || null,
        estado_general: estadoGeneral,
        observaciones: obs || null,
        lineas: lineasInput,
      });
      toast.success(`Recepción ${res.data.codigo} creada en borrador. Confirmala para impactar bodega.`);
      router.push(`/compras/recepciones/${res.data.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  if (!ocId) {
    return (
      <div className="p-8 space-y-4">
        <p>Necesitás especificar una OC en el query string (<code>?oc=ID</code>).</p>
        <Link href="/compras/ordenes-compra"><Button variant="outline">Ver OCs</Button></Link>
      </div>
    );
  }
  if (!oc) return <div className="p-8 text-muted-foreground">Cargando OC…</div>;

  return (
    <div className="max-w-5xl space-y-6">
      <Toaster richColors />
      <Link href={`/compras/ordenes-compra/${oc.id}`} className="inline-flex items-center text-sm text-muted-foreground hover:underline">
        <ChevronLeft className="mr-1 h-4 w-4" /> Volver a la OC
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Registrar recepción contra OC {oc.codigo}</h1>
        <p className="text-sm text-muted-foreground">
          Proveedor: {oc.proveedores?.razon_social}. Las cantidades se descuentan del saldo pendiente.
          Si el precio real difiere del precio de la OC, se actualiza el costo del item en bodega y se guarda en historial.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        <section className="rounded-md border bg-white p-6 space-y-4">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Documentos</h2>
          <div className="grid grid-cols-3 gap-4">
            <div><Label>Guía de remisión</Label><Input value={guia} onChange={(e) => setGuia(e.target.value)} /></div>
            <div><Label>Factura</Label><Input value={factNum} onChange={(e) => setFactNum(e.target.value)} /></div>
            <div><Label>Fecha factura</Label><Input type="date" value={factFecha} onChange={(e) => setFactFecha(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Estado físico general</Label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={estadoGeneral}
                onChange={(e) => setEstadoGeneral(e.target.value as "bueno" | "observado" | "danado" | "incompleto")}
              >
                <option value="bueno">Bueno</option>
                <option value="observado">Observado</option>
                <option value="danado">Dañado</option>
                <option value="incompleto">Incompleto</option>
              </select>
            </div>
          </div>
          <div>
            <Label>Observaciones</Label>
            <Textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>
        </section>

        <section className="rounded-md border bg-white p-6 space-y-4">
          <h2 className="text-sm font-semibold uppercase text-muted-foreground">Líneas</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="text-right">Recibida</TableHead>
                <TableHead className="text-right">Rechazada</TableHead>
                <TableHead className="text-right">Precio real</TableHead>
                <TableHead>Inspección</TableHead>
                <TableHead>Ubicación bodega</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineas.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">La OC no tiene líneas pendientes.</TableCell></TableRow>
              ) : (
                lineas.map((l, i) => (
                  <TableRow key={l.orden_compra_linea_id}>
                    <TableCell className="max-w-xs">
                      <div className="font-mono text-xs text-muted-foreground">{l.item_codigo}</div>
                      <div className="text-sm">{l.descripcion}</div>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{l.saldo} {l.unidad_medida}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number" step="any" min="0" max={l.saldo}
                        className="h-8 w-24 text-right"
                        value={l.cantidad_recibida}
                        onChange={(e) => updateLinea(i, { cantidad_recibida: Number(e.target.value) })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number" step="any" min="0"
                        className="h-8 w-20 text-right"
                        value={l.cantidad_rechazada}
                        onChange={(e) => updateLinea(i, { cantidad_rechazada: Number(e.target.value) })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number" step="any" min="0"
                        placeholder={l.precio_oc.toFixed(2)}
                        className="h-8 w-28 text-right"
                        value={l.precio_real ?? ""}
                        onChange={(e) => updateLinea(i, { precio_real: e.target.value ? Number(e.target.value) : null })}
                      />
                    </TableCell>
                    <TableCell>
                      <select
                        className="h-8 rounded-md border bg-background px-2 text-xs"
                        value={l.resultado_inspeccion}
                        onChange={(e) => updateLinea(i, { resultado_inspeccion: e.target.value as LineaForm["resultado_inspeccion"] })}
                      >
                        <option value="aprobado">Aprobado</option>
                        <option value="observado">Observado</option>
                        <option value="rechazado">Rechazado</option>
                        <option value="pendiente_inspeccion">Pendiente</option>
                      </select>
                    </TableCell>
                    <TableCell>
                      <select
                        className="h-8 rounded-md border bg-background px-2 text-xs"
                        value={l.ubicacion_id ?? ""}
                        onChange={(e) => updateLinea(i, { ubicacion_id: e.target.value ? Number(e.target.value) : null })}
                      >
                        <option value="">—</option>
                        {ubicaciones.map((u) => (
                          <option key={u.id} value={u.id}>{u.codigo}</option>
                        ))}
                      </select>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground">
            Tip: dejá la columna "precio real" vacía si el precio de la OC se mantiene. Llenala solo cuando el proveedor facturó distinto.
          </p>
        </section>

        <div className="flex justify-end gap-2">
          <Link href={`/compras/ordenes-compra/${oc.id}`}><Button type="button" variant="outline">Cancelar</Button></Link>
          <Button type="submit" disabled={saving}>
            <Save className="mr-2 h-4 w-4" /> {saving ? "Guardando…" : "Crear recepción (borrador)"}
          </Button>
        </div>
      </form>
    </div>
  );
}
