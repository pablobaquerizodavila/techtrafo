"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Toaster, toast } from "sonner";
import {
  HitoPlantilla, RolAdmin,
  listHitoPlantillas, listRolesAdmin, updateHitoPlantilla,
} from "@/lib/admin";
import { ApiError } from "@/lib/api";

interface EditForm {
  nombre: string;
  sla_horas: string;
  requiere_aprobacion: boolean;
  rol_aprobador_id: number | null;
  visible_cliente: boolean;
  activo: boolean;
}

export default function HitoPlantillasPage() {
  const [data, setData] = useState<HitoPlantilla[]>([]);
  const [roles, setRoles] = useState<RolAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<HitoPlantilla | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listHitoPlantillas();
      setData(r.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    listRolesAdmin().then((r) => setRoles(r.data.filter((x) => x.activo))).catch(() => {});
  }, []);

  function openEdit(p: HitoPlantilla) {
    setEditing(p);
    setForm({
      nombre: p.nombre,
      sla_horas: p.sla_horas?.toString() ?? "",
      requiere_aprobacion: p.requiere_aprobacion,
      rol_aprobador_id: p.rol_aprobador_id,
      visible_cliente: p.visible_cliente,
      activo: p.activo,
    });
  }

  async function handleSave() {
    if (!editing || !form) return;
    const payload: Parameters<typeof updateHitoPlantilla>[1] = {};
    if (form.nombre.trim() !== editing.nombre) payload.nombre = form.nombre.trim();
    const slaParsed = form.sla_horas.trim() === "" ? null : Number(form.sla_horas);
    if (slaParsed !== editing.sla_horas) {
      if (slaParsed !== null && (!Number.isFinite(slaParsed) || slaParsed <= 0)) {
        toast.error("SLA invalido: debe ser entero positivo o vacio");
        return;
      }
      payload.sla_horas = slaParsed;
    }
    if (form.requiere_aprobacion !== editing.requiere_aprobacion) payload.requiere_aprobacion = form.requiere_aprobacion;
    if (form.rol_aprobador_id !== editing.rol_aprobador_id) payload.rol_aprobador_id = form.rol_aprobador_id;
    if (form.visible_cliente !== editing.visible_cliente) payload.visible_cliente = form.visible_cliente;
    if (form.activo !== editing.activo) payload.activo = form.activo;

    if (Object.keys(payload).length === 0) {
      setEditing(null); setForm(null);
      return;
    }
    setSaving(true);
    try {
      await updateHitoPlantilla(editing.id, payload);
      toast.success(`Plantilla ${editing.codigo} actualizada`);
      setEditing(null); setForm(null);
      load();
    } catch (err) {
      const code = err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error";
      toast.error(code);
    } finally {
      setSaving(false);
    }
  }

  const grouped = data.reduce<Record<string, HitoPlantilla[]>>((acc, p) => {
    (acc[p.tipo_servicio] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { label: "Admin" }, { label: "Hitos" }]}
        title="Hitos"
        titleAccent="del catálogo"
        meta={<span>SLA, aprobaciones y visibilidad por hito · solo aplica a expedientes nuevos</span>}
      />

      <div className="space-y-6 pt-6">
        {loading ? (
          <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
            <div className="flex flex-col items-center gap-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-copper border-t-transparent" />
              <span className="text-sm">Cargando…</span>
            </div>
          </div>
        ) : (
          Object.entries(grouped).map(([tipo, plantillas]) => (
            <Panel
              key={tipo}
              title={tipo.charAt(0).toUpperCase() + tipo.slice(1)}
              subtitle={`${plantillas.length} hito${plantillas.length === 1 ? "" : "s"} en este tipo de servicio`}
              icon={<FolderOpen className="h-3.5 w-3.5" />}
              padded={false}
            >
              <Table>
                <TableHeader>
                  <TableRow className="border-glass bg-glass hover:bg-glass">
                    <TableHead className="w-12 font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">#</TableHead>
                    <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Código</TableHead>
                    <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Nombre</TableHead>
                    <TableHead className="text-right font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">SLA (h)</TableHead>
                    <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Aprobación</TableHead>
                    <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Visible cliente</TableHead>
                    <TableHead className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Estado</TableHead>
                    <TableHead className="text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plantillas.map((p) => (
                    <TableRow key={p.id} className="border-glass hover:bg-glass">
                      <TableCell className="font-mono text-muted-foreground">{p.orden}</TableCell>
                      <TableCell className="font-mono text-xs text-copper">{p.codigo}</TableCell>
                      <TableCell className="text-sm">{p.nombre}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {p.sla_horas ?? <span className="text-muted-foreground/50">—</span>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.requiere_aprobacion
                          ? <Badge variant="warning">{p.roles?.nombre ?? "?"}</Badge>
                          : <span className="text-muted-foreground/60">—</span>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.visible_cliente ? <Badge variant="teal">sí</Badge> : <span className="text-muted-foreground/60">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.activo ? "success" : "muted"}>{p.activo ? "activo" : "inactivo"}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <button type="button" onClick={() => openEdit(p)} title="Editar"
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-glass-elev hover:text-copper">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          ))
        )}
      </div>

      {/* Dialog editar */}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) { setEditing(null); setForm(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar plantilla de hito</DialogTitle>
            <DialogDescription>
              {editing && (<><span className="font-mono">{editing.codigo}</span> — orden {editing.orden} en <strong>{editing.tipo_servicio}</strong></>)}
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="p_nombre">Nombre</Label>
                <Input id="p_nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="p_sla">SLA en horas (vacio = sin SLA)</Label>
                <Input
                  id="p_sla" type="number" min="1" max="8760"
                  value={form.sla_horas}
                  onChange={(e) => setForm({ ...form, sla_horas: e.target.value })}
                  placeholder="Ej: 48"
                />
                <p className="text-xs text-muted-foreground">
                  Tiempo maximo antes de marcar el hito como estancado en el dashboard.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox" id="p_req_aprob"
                  checked={form.requiere_aprobacion}
                  onChange={(e) => setForm({ ...form, requiere_aprobacion: e.target.checked })}
                />
                <Label htmlFor="p_req_aprob" className="cursor-pointer">Requiere aprobacion</Label>
              </div>
              {form.requiere_aprobacion && (
                <div className="space-y-1 pl-6">
                  <Label htmlFor="p_rol">Rol que aprueba</Label>
                  <Select
                    value={form.rol_aprobador_id?.toString() ?? ""}
                    onValueChange={(v) => setForm({ ...form, rol_aprobador_id: v ? Number(v) : null })}
                  >
                    <SelectTrigger id="p_rol"><SelectValue placeholder="Sin rol" /></SelectTrigger>
                    <SelectContent>
                      {roles.map((r) => (
                        <SelectItem key={r.id} value={r.id.toString()}>{r.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox" id="p_visible_cliente"
                  checked={form.visible_cliente}
                  onChange={(e) => setForm({ ...form, visible_cliente: e.target.checked })}
                />
                <Label htmlFor="p_visible_cliente" className="cursor-pointer">Visible al cliente en el portal</Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox" id="p_activo"
                  checked={form.activo}
                  onChange={(e) => setForm({ ...form, activo: e.target.checked })}
                />
                <Label htmlFor="p_activo" className="cursor-pointer">Activo (se incluye en nuevos expedientes)</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditing(null); setForm(null); }} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Guardando..." : "Guardar cambios"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster richColors position="top-right" theme="dark" />
    </div>
  );
}
