"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, FileText } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, HeaderActionGhost } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import {
  createSolicitudCompra,
  Departamento, DEPARTAMENTO_LABEL,
  Prioridad, PRIORIDAD_LABEL,
  fmtMoneda,
} from "@/lib/compras";
import { listItems, Item } from "@/lib/inventario";
import { ApiError } from "@/lib/api";

// ─── tipos locales ──────────────────────────────────────────────────
interface LineaForm {
  id: string; // key local (UUID para React key)
  descripcion: string;
  unidad_medida: string;
  cantidad_solicitada: string;
  precio_referencial: string;
  item_id: number | null;
  // búsqueda inline de ítem
  itemQuery: string;
  itemResults: Item[];
  showDropdown: boolean;
}

function newLinea(orden: number): LineaForm {
  return {
    id: `l-${orden}-${Date.now()}`,
    descripcion: "",
    unidad_medida: "unid",
    cantidad_solicitada: "1",
    precio_referencial: "0",
    item_id: null,
    itemQuery: "",
    itemResults: [],
    showDropdown: false,
  };
}

const DEPARTAMENTOS: Departamento[] = [
  "produccion", "ingenieria", "mantenimiento", "bodega",
  "calidad", "comercial", "gerencia", "compras",
];
const PRIORIDADES: Prioridad[] = ["baja", "media", "alta", "urgente", "critica"];

// ─── componente ─────────────────────────────────────────────────────
export default function NuevaSCPage() {
  const router = useRouter();

  // cabecera
  const [dpto, setDpto] = useState<Departamento>("compras");
  const [prioridad, setPrioridad] = useState<Prioridad>("media");
  const [fechaRequerida, setFechaRequerida] = useState("");
  const [justificacion, setJustificacion] = useState("");
  const [observaciones, setObservaciones] = useState("");

  // líneas
  const [lineas, setLineas] = useState<LineaForm[]>([newLinea(1)]);
  const [saving, setSaving] = useState(false);

  // total estimado
  const total = lineas.reduce((acc, l) => {
    const q = parseFloat(l.cantidad_solicitada) || 0;
    const p = parseFloat(l.precio_referencial) || 0;
    return acc + q * p;
  }, 0);

  // ── helpers de líneas ──────────────────────────────────────────
  const addLinea = () => setLineas((prev) => [...prev, newLinea(prev.length + 1)]);
  const removeLinea = (id: string) => setLineas((prev) => prev.filter((l) => l.id !== id));
  const patchLinea = (id: string, patch: Partial<LineaForm>) =>
    setLineas((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  // ── búsqueda de ítem inline ────────────────────────────────────
  const buscarItem = useCallback(async (lineaId: string, q: string) => {
    patchLinea(lineaId, { itemQuery: q, showDropdown: q.length >= 2 });
    if (q.length < 2) { patchLinea(lineaId, { itemResults: [] }); return; }
    try {
      const res = await listItems({ q, limit: 10, estado: "activo" });
      patchLinea(lineaId, { itemResults: res.data });
    } catch {
      // si no hay permiso de inventario, simplemente no muestra resultados
      patchLinea(lineaId, { itemResults: [] });
    }
  }, []);

  const seleccionarItem = (lineaId: string, item: Item) => {
    patchLinea(lineaId, {
      item_id: Number(item.id),
      descripcion: item.nombre,
      unidad_medida: item.unidad_medida,
      itemQuery: `${item.codigo_interno} — ${item.nombre}`,
      showDropdown: false,
      itemResults: [],
    });
  };

  // ── submit ─────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    for (const l of lineas) {
      if (!l.descripcion.trim()) { toast.error("Todas las líneas deben tener descripción"); return; }
      if (parseFloat(l.cantidad_solicitada) <= 0) { toast.error("Cantidad debe ser mayor a 0"); return; }
    }
    setSaving(true);
    try {
      const payload = {
        departamento_solicitante: dpto,
        prioridad,
        fecha_requerida: fechaRequerida || null,
        justificacion: justificacion || null,
        observaciones: observaciones || null,
        origen: "manual" as const,
        moneda: "USD",
        lineas: lineas.map((l, i) => ({
          orden: i + 1,
          item_id: l.item_id ?? null,
          descripcion: l.descripcion.trim(),
          unidad_medida: l.unidad_medida || "unid",
          cantidad_solicitada: parseFloat(l.cantidad_solicitada) || 1,
          precio_referencial: parseFloat(l.precio_referencial) || 0,
          moneda: "USD",
        })),
      };
      const res = await createSolicitudCompra(payload);
      toast.success(`SC creada: ${res.data.codigo}`);
      setTimeout(() => router.push(`/compras/solicitudes/${res.data.id}`), 800);
    } catch (err) {
      const msg = err instanceof ApiError
        ? `Error ${err.status}: ${(err as any).body?.details ? JSON.stringify((err as any).body.details) : err.message}`
        : "Error al crear la solicitud";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        breadcrumb={[
          { href: "/dashboard", label: "Panel" },
          { href: "/compras", label: "Compras" },
          { href: "/compras/solicitudes", label: "Solicitudes" },
          { label: "Nueva SC" },
        ]}
        title="Nueva solicitud"
        titleAccent="de compra"
        meta={<span>Origen manual · estado inicial: <strong>Borrador</strong></span>}
        actions={<HeaderActionGhost href="/compras/solicitudes">← Volver</HeaderActionGhost>}
      />

      <form onSubmit={handleSubmit} className="space-y-6 pt-6">
        {/* ── Cabecera ──────────────────────────────────────── */}
        <Panel>
          <h2 className="mb-4 text-sm font-semibold text-foreground/80">Datos generales</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Departamento solicitante *</Label>
              <Select value={dpto} onValueChange={(v) => setDpto(v as Departamento)}>
                <SelectTrigger className="bg-glass border-glass-mid">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTAMENTOS.map((d) => (
                    <SelectItem key={d} value={d}>{DEPARTAMENTO_LABEL[d]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Prioridad</Label>
              <Select value={prioridad} onValueChange={(v) => setPrioridad(v as Prioridad)}>
                <SelectTrigger className="bg-glass border-glass-mid">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORIDADES.map((p) => (
                    <SelectItem key={p} value={p}>{PRIORIDAD_LABEL[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Fecha requerida</Label>
              <Input
                type="date"
                value={fechaRequerida}
                onChange={(e) => setFechaRequerida(e.target.value)}
                className="bg-glass border-glass-mid"
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Justificación</Label>
              <Textarea
                value={justificacion}
                onChange={(e) => setJustificacion(e.target.value)}
                placeholder="Motivo de la compra…"
                rows={3}
                className="bg-glass border-glass-mid resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Observaciones internas</Label>
              <Textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Notas adicionales…"
                rows={3}
                className="bg-glass border-glass-mid resize-none"
              />
            </div>
          </div>
        </Panel>

        {/* ── Líneas ────────────────────────────────────────── */}
        <Panel padded={false}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-glass">
            <h2 className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
              <FileText className="h-4 w-4 text-copper" />
              Líneas de solicitud
            </h2>
            <button
              type="button"
              onClick={addLinea}
              className="inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-3 py-1.5 text-xs font-medium text-foreground/80 transition hover:border-copper/60 hover:text-copper"
            >
              <Plus className="h-3.5 w-3.5" /> Agregar línea
            </button>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="border-glass bg-glass hover:bg-glass">
                <TableHead className="w-8 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">#</TableHead>
                <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
                  Descripción / Búsqueda de ítem
                </TableHead>
                <TableHead className="w-24 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">U.M.</TableHead>
                <TableHead className="w-28 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Cantidad *</TableHead>
                <TableHead className="w-32 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Precio ref.</TableHead>
                <TableHead className="w-28 text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Subtotal</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineas.map((l, idx) => (
                <TableRow key={l.id} className="border-glass hover:bg-glass align-top">
                  <TableCell className="pt-3 text-xs text-muted-foreground tabular-nums">{idx + 1}</TableCell>

                  {/* Descripción + búsqueda ítem */}
                  <TableCell className="py-2">
                    <div className="relative space-y-1">
                      {/* Campo búsqueda ítem */}
                      <div className="relative">
                        <Input
                          value={l.itemQuery}
                          onChange={(e) => buscarItem(l.id, e.target.value)}
                          onBlur={() => setTimeout(() => patchLinea(l.id, { showDropdown: false }), 200)}
                          placeholder="Buscar ítem de inventario (opcional)…"
                          className="bg-glass border-glass-mid text-xs h-7"
                        />
                        {l.showDropdown && l.itemResults.length > 0 && (
                          <div className="absolute z-10 w-full mt-0.5 rounded-lg border border-glass-mid bg-background shadow-lg max-h-40 overflow-y-auto">
                            {l.itemResults.map((item) => (
                              <button
                                key={String(item.id)}
                                type="button"
                                onMouseDown={() => seleccionarItem(l.id, item)}
                                className="w-full text-left px-3 py-1.5 text-xs hover:bg-glass-elev flex items-center gap-2"
                              >
                                <span className="font-mono text-copper">{item.codigo_interno}</span>
                                <span className="text-foreground/80">{item.nombre}</span>
                                <span className="ml-auto text-muted-foreground">{item.unidad_medida}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Descripción libre */}
                      <Input
                        required
                        value={l.descripcion}
                        onChange={(e) => patchLinea(l.id, { descripcion: e.target.value })}
                        placeholder="Descripción del artículo *"
                        className="bg-glass border-glass-mid text-xs h-7"
                      />
                    </div>
                  </TableCell>

                  <TableCell className="py-2">
                    <Input
                      value={l.unidad_medida}
                      onChange={(e) => patchLinea(l.id, { unidad_medida: e.target.value })}
                      className="bg-glass border-glass-mid text-xs h-7 w-20"
                      placeholder="unid"
                    />
                  </TableCell>

                  <TableCell className="py-2">
                    <Input
                      type="number"
                      min="0.001"
                      step="any"
                      required
                      value={l.cantidad_solicitada}
                      onChange={(e) => patchLinea(l.id, { cantidad_solicitada: e.target.value })}
                      className="bg-glass border-glass-mid text-xs h-7 w-24 tabular-nums"
                    />
                  </TableCell>

                  <TableCell className="py-2">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={l.precio_referencial}
                      onChange={(e) => patchLinea(l.id, { precio_referencial: e.target.value })}
                      className="bg-glass border-glass-mid text-xs h-7 w-28 tabular-nums"
                      placeholder="0.00"
                    />
                  </TableCell>

                  <TableCell className="py-2 text-right font-mono text-xs tabular-nums text-foreground/80">
                    {fmtMoneda((parseFloat(l.cantidad_solicitada) || 0) * (parseFloat(l.precio_referencial) || 0))}
                  </TableCell>

                  <TableCell className="py-2">
                    <button
                      type="button"
                      onClick={() => removeLinea(l.id)}
                      disabled={lineas.length === 1}
                      className="rounded p-1 text-muted-foreground transition hover:text-destructive disabled:opacity-30 disabled:pointer-events-none"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Total */}
          <div className="flex justify-end px-4 py-3 border-t border-glass">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">Total estimado:</span>
              <span className="font-mono font-semibold text-foreground tabular-nums">{fmtMoneda(total)}</span>
            </div>
          </div>
        </Panel>

        {/* ── Acciones ──────────────────────────────────────── */}
        <div className="flex justify-end gap-3 pb-8">
          <HeaderActionGhost href="/compras/solicitudes">Cancelar</HeaderActionGhost>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-4 py-2 text-xs font-medium text-white shadow-sm glow-copper-sm inset-highlight-md transition-shadow hover:glow-copper disabled:opacity-50 disabled:pointer-events-none"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Guardando…" : "Crear solicitud"}
          </button>
        </div>
      </form>

      <Toaster richColors theme="dark" />
    </div>
  );
}
