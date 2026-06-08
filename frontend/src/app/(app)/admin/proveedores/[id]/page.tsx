"use client";

import { useEffect, useState, useCallback, use as usePromise } from "react";
import { ChevronLeft, Pencil, Save, X, Trash2, Truck, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster, toast } from "sonner";
import { PageHeader, HeaderActionGhost } from "@/components/page-header";
import { Panel } from "@/components/panel";
import {
  archiveProveedor, getProveedor, ItemProveedor, Proveedor, ProveedorCreateInput,
  updateProveedor, fmtMoneda,
} from "@/lib/compras";
import { ApiError } from "@/lib/api";
import {
  AccesoProveedor,
  AccesoProveedorCreateInput,
  listAccesosProveedor,
  crearAccesoProveedor,
  toggleAccesoProveedor,
  deleteAccesoProveedor,
} from "@/lib/proveedor-portal";

interface ProveedorFull extends Proveedor {
  item_proveedores: ItemProveedor[];
  _count: { ordenes_compra: number };
}

function actionClass(tone: "primary" | "ghost" | "destructive") {
  return tone === "primary"
    ? "inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-3.5 py-2 text-xs font-medium text-white glow-copper-sm inset-highlight-md transition hover:glow-copper disabled:opacity-60"
    : tone === "destructive"
    ? "inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs font-medium text-rose-300 transition hover:bg-rose-500/15 disabled:opacity-60"
    : "inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-3.5 py-2 text-xs font-medium text-foreground/90 transition hover:border-glass-strong hover:bg-glass-elev disabled:opacity-60";
}

export default function ProveedorDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const provId = Number(id);
  const [prov, setProv] = useState<ProveedorFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<ProveedorCreateInput>>({});
  const [accesos, setAccesos] = useState<AccesoProveedor[]>([]);
  const [loadingAccesos, setLoadingAccesos] = useState(false);
  const [newAcceso, setNewAcceso] = useState<AccesoProveedorCreateInput>({ email: "", nombres: "", apellidos: "", password: "" });
  const [creatingAcceso, setCreatingAcceso] = useState(false);

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

  const loadAccesos = useCallback(async () => {
    setLoadingAccesos(true);
    try {
      const res = await listAccesosProveedor(provId);
      setAccesos(res.data);
    } catch {
      // silent
    } finally {
      setLoadingAccesos(false);
    }
  }, [provId]);

  useEffect(() => { loadAccesos(); }, [loadAccesos]);

  async function handleCrearAcceso() {
    if (!newAcceso.email.trim() || !newAcceso.nombres.trim() || !newAcceso.apellidos.trim() || !newAcceso.password.trim()) {
      toast.error("Completa todos los campos del nuevo acceso");
      return;
    }
    setCreatingAcceso(true);
    try {
      await crearAccesoProveedor(provId, newAcceso);
      toast.success("Acceso creado");
      setNewAcceso({ email: "", nombres: "", apellidos: "", password: "" });
      await loadAccesos();
    } catch (err) {
      toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error al crear acceso");
    }
    setCreatingAcceso(false);
  }

  async function handleToggleAcceso(userId: string, activo: boolean) {
    try {
      await toggleAccesoProveedor(provId, userId, activo);
      setAccesos((prev) => prev.map((a) => a.id === userId ? { ...a, activo } : a));
    } catch {
      toast.error("Error al cambiar estado del acceso");
    }
  }

  async function handleDeleteAcceso(userId: string) {
    if (!window.confirm("Eliminar acceso permanentemente?")) return;
    try {
      await deleteAccesoProveedor(provId, userId);
      setAccesos((prev) => prev.filter((a) => a.id !== userId));
      toast.success("Acceso eliminado");
    } catch {
      toast.error("Error al eliminar acceso");
    }
  }

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
    return (
      <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-copper border-t-transparent" />
          <span className="text-sm">Cargando proveedor…</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { href: "/admin/proveedores", label: "Proveedores" }, { label: prov.codigo }]}
        title={prov.codigo}
        titleAccent={prov.razon_social}
        meta={
          <>
            <Badge variant={prov.estado === "activo" ? "success" : prov.estado === "bloqueado" ? "destructive" : "muted"}>{prov.estado}</Badge>
            <span className="text-muted-foreground/40">·</span>
            <span>{prov._count.ordenes_compra} órdenes históricas</span>
            {prov.calificacion && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3 w-3 text-amber-400" />
                  <span className="font-mono">{Number(prov.calificacion).toFixed(1)}/100</span>
                </span>
              </>
            )}
          </>
        }
        actions={
          <>
            <HeaderActionGhost href="/admin/proveedores" icon={<ChevronLeft className="h-3.5 w-3.5" />}>Volver</HeaderActionGhost>
            {!editing ? (
              <>
                <button type="button" onClick={() => setEditing(true)} className={actionClass("ghost")}>
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </button>
                {prov.estado === "activo" && (
                  <button type="button" onClick={handleArchivar} className={actionClass("destructive")}>
                    <Trash2 className="h-3.5 w-3.5" /> Archivar
                  </button>
                )}
              </>
            ) : (
              <>
                <button type="button" onClick={handleSave} className={actionClass("primary")}>
                  <Save className="h-3.5 w-3.5" /> Guardar
                </button>
                <button type="button" onClick={() => { setEditing(false); load(); }} className={actionClass("ghost")}>
                  <X className="h-3.5 w-3.5" /> Cancelar
                </button>
              </>
            )}
          </>
        }
      />

      <div className="space-y-6 pt-6">
        <Panel title="Identificación y contacto" icon={<Truck className="h-3.5 w-3.5" />}>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {editing ? (
              <>
                <FormField label="Razón social" full><Input value={form.razon_social ?? ""} onChange={(e) => setForm((f) => ({ ...f, razon_social: e.target.value }))} className="h-10 border-glass bg-glass" /></FormField>
                <FormField label="Nombre comercial"><Input value={form.nombre_comercial ?? ""} onChange={(e) => setForm((f) => ({ ...f, nombre_comercial: e.target.value }))} className="h-10 border-glass bg-glass" /></FormField>
                <FormField label="RUC"><Input value={form.ruc ?? ""} onChange={(e) => setForm((f) => ({ ...f, ruc: e.target.value }))} className="h-10 border-glass bg-glass font-mono" /></FormField>
                <FormField label="País"><Input value={form.pais ?? ""} onChange={(e) => setForm((f) => ({ ...f, pais: e.target.value }))} className="h-10 border-glass bg-glass" /></FormField>
                <FormField label="Ciudad"><Input value={form.ciudad ?? ""} onChange={(e) => setForm((f) => ({ ...f, ciudad: e.target.value }))} className="h-10 border-glass bg-glass" /></FormField>
                <FormField label="Contacto"><Input value={form.contacto_nombre ?? ""} onChange={(e) => setForm((f) => ({ ...f, contacto_nombre: e.target.value }))} className="h-10 border-glass bg-glass" /></FormField>
                <FormField label="Cargo"><Input value={form.contacto_cargo ?? ""} onChange={(e) => setForm((f) => ({ ...f, contacto_cargo: e.target.value }))} className="h-10 border-glass bg-glass" /></FormField>
                <FormField label="Email"><Input type="email" value={form.contacto_email ?? ""} onChange={(e) => setForm((f) => ({ ...f, contacto_email: e.target.value }))} className="h-10 border-glass bg-glass" /></FormField>
                <FormField label="Teléfono"><Input value={form.contacto_telefono ?? ""} onChange={(e) => setForm((f) => ({ ...f, contacto_telefono: e.target.value }))} className="h-10 border-glass bg-glass" /></FormField>
                <FormField label="Condiciones de pago"><Input value={form.condiciones_pago_default ?? ""} onChange={(e) => setForm((f) => ({ ...f, condiciones_pago_default: e.target.value }))} className="h-10 border-glass bg-glass" /></FormField>
                <FormField label="Moneda"><Input value={form.moneda_default ?? "USD"} maxLength={3} onChange={(e) => setForm((f) => ({ ...f, moneda_default: e.target.value }))} className="h-10 border-glass bg-glass font-mono" /></FormField>
                <FormField label="Tiempo entrega (días)"><Input type="number" value={form.tiempo_entrega_default_dias ?? ""} onChange={(e) => setForm((f) => ({ ...f, tiempo_entrega_default_dias: e.target.value ? Number(e.target.value) : null }))} className="h-10 border-glass bg-glass font-mono" /></FormField>
                <FormField label="Certificaciones" full><Textarea rows={2} value={form.certificaciones ?? ""} onChange={(e) => setForm((f) => ({ ...f, certificaciones: e.target.value }))} className="border-glass bg-glass" /></FormField>
                <FormField label="Productos que suministra" full><Textarea rows={2} value={form.productos_que_suministra ?? ""} onChange={(e) => setForm((f) => ({ ...f, productos_que_suministra: e.target.value }))} className="border-glass bg-glass" /></FormField>
                <FormField label="Observaciones" full><Textarea rows={2} value={form.observaciones ?? ""} onChange={(e) => setForm((f) => ({ ...f, observaciones: e.target.value }))} className="border-glass bg-glass" /></FormField>
                <FormField label="Estado">
                  <Select value={form.estado ?? "activo"} onValueChange={(v) => setForm((f) => ({ ...f, estado: v as "activo" | "inactivo" | "bloqueado" }))}>
                    <SelectTrigger className="h-10 border-glass bg-glass"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="activo">Activo</SelectItem>
                      <SelectItem value="inactivo">Inactivo</SelectItem>
                      <SelectItem value="bloqueado">Bloqueado</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
              </>
            ) : (
              <>
                <KV label="Nombre comercial" value={prov.nombre_comercial} />
                <KV label="RUC" value={prov.ruc} mono />
                <KV label="País" value={prov.pais} />
                <KV label="Ciudad" value={prov.ciudad} />
                <KV label="Contacto" value={prov.contacto_nombre} />
                <KV label="Cargo" value={prov.contacto_cargo} />
                <KV label="Email" value={prov.contacto_email} mono />
                <KV label="Teléfono" value={prov.contacto_telefono} mono />
                <KV label="Pago default" value={prov.condiciones_pago_default} />
                <KV label="Moneda" value={prov.moneda_default} mono />
                <KV label="Tiempo entrega" value={prov.tiempo_entrega_default_dias ? `${prov.tiempo_entrega_default_dias} días` : null} mono />
                <KV label="Incoterm" value={prov.incoterm_default} mono />
                <KV label="Certificaciones" value={prov.certificaciones} full />
                <KV label="Suministra" value={prov.productos_que_suministra} full />
                <KV label="Observaciones" value={prov.observaciones} full />
              </>
            )}
          </div>
        </Panel>

        <Panel
          title="Items que suministra"
          subtitle={`${prov.item_proveedores.length} ítem${prov.item_proveedores.length === 1 ? "" : "s"} asociado${prov.item_proveedores.length === 1 ? "" : "s"}`}
          padded={prov.item_proveedores.length === 0}
        >
          {prov.item_proveedores.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no se han asociado items a este proveedor. Desde la ficha de un item de bodega podrás agregarlo a la lista de proveedores.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-glass bg-glass hover:bg-glass">
                  <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Código item</TableHead>
                  <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Descripción</TableHead>
                  <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Precio</TableHead>
                  <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Unidad</TableHead>
                  <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Tiempo entrega</TableHead>
                  <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Principal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prov.item_proveedores.map((ip) => (
                  <TableRow key={ip.id} className="border-glass hover:bg-glass">
                    <TableCell className="font-mono text-xs text-copper">{ip.items?.codigo_interno ?? "—"}</TableCell>
                    <TableCell className="text-sm">{ip.items?.nombre ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">{fmtMoneda(ip.precio_unitario, ip.moneda)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{ip.unidad_medida}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{ip.tiempo_entrega_dias != null ? `${ip.tiempo_entrega_dias}d` : <span className="text-muted-foreground/50">—</span>}</TableCell>
                    <TableCell>{ip.es_principal && <Badge variant="copper">Principal</Badge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
        <Panel title="Acceso al portal de proveedor" padded>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Los accesos permiten al proveedor ingresar al portal de proveedor para ver sus OCs, registrar acuse de recibo y subir facturas.
            </p>
            {loadingAccesos ? (
              <p className="text-xs text-muted-foreground">Cargando accesos...</p>
            ) : accesos.length === 0 ? (
              <p className="text-xs text-muted-foreground">No hay accesos configurados.</p>
            ) : (
              <div className="space-y-2">
                {accesos.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-lg border border-glass-mid bg-glass px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{a.nombres} {a.apellidos}</div>
                      <div className="text-xs text-muted-foreground font-mono">{a.email}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleAcceso(a.id, !a.activo)}
                      className={`text-xs px-2 py-0.5 rounded-full ${a.activo ? "bg-green-500/15 text-green-400" : "bg-rose-500/15 text-rose-400"}`}
                    >
                      {a.activo ? "Activo" : "Inactivo"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteAcceso(a.id)}
                      className="text-muted-foreground/50 hover:text-rose-400 transition-colors"
                      title="Eliminar acceso"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="border border-glass-mid rounded-lg p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nuevo acceso</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  placeholder="Nombres"
                  value={newAcceso.nombres}
                  onChange={(e) => setNewAcceso((a) => ({ ...a, nombres: e.target.value }))}
                  className="h-9 rounded-md border border-glass bg-glass px-3 text-sm focus:outline-none focus:ring-1 focus:ring-copper/50"
                />
                <input
                  type="text"
                  placeholder="Apellidos"
                  value={newAcceso.apellidos}
                  onChange={(e) => setNewAcceso((a) => ({ ...a, apellidos: e.target.value }))}
                  className="h-9 rounded-md border border-glass bg-glass px-3 text-sm focus:outline-none focus:ring-1 focus:ring-copper/50"
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={newAcceso.email}
                  onChange={(e) => setNewAcceso((a) => ({ ...a, email: e.target.value }))}
                  className="h-9 rounded-md border border-glass bg-glass px-3 text-sm focus:outline-none focus:ring-1 focus:ring-copper/50"
                />
                <input
                  type="password"
                  placeholder="Contrasena (min. 8 caracteres)"
                  value={newAcceso.password}
                  onChange={(e) => setNewAcceso((a) => ({ ...a, password: e.target.value }))}
                  className="h-9 rounded-md border border-glass bg-glass px-3 text-sm focus:outline-none focus:ring-1 focus:ring-copper/50"
                />
              </div>
              <button
                type="button"
                onClick={handleCrearAcceso}
                disabled={creatingAcceso}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-3.5 py-2 text-xs font-medium text-white glow-copper-sm inset-highlight-md transition hover:glow-copper disabled:opacity-60"
              >
                {creatingAcceso ? "Creando..." : "Crear acceso"}
              </button>
            </div>
          </div>
        </Panel>
      </div>

      <Toaster richColors theme="dark" />
    </div>
  );
}

function FormField({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${full ? "md:col-span-2" : ""}`}>
      <Label className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function KV({ label, value, full, mono }: { label: string; value: string | null | undefined; full?: boolean; mono?: boolean }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <dt className="mb-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`text-sm text-foreground/90 ${mono ? "font-mono" : ""}`}>{value ?? "—"}</dd>
    </div>
  );
}
