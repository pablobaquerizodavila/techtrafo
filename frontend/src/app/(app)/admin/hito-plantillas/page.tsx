"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <div className="space-y-6">
      <header>
        <h2 className="text-3xl font-bold">Hitos del catalogo</h2>
        <p className="text-muted-foreground">
          SLA, aprobaciones y visibilidad por hito. Estos valores se aplican a expedientes <strong>nuevos</strong>;
          los existentes mantienen sus SLA actuales (editable por hito en el detalle del expediente).
        </p>
      </header>

      {loading ? (
        <p className="text-muted-foreground">Cargando...</p>
      ) : (
        Object.entries(grouped).map(([tipo, plantillas]) => (
          <section key={tipo}>
            <h3 className="mb-2 text-xl font-bold capitalize">{tipo}</h3>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Codigo</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead className="text-right">SLA (h)</TableHead>
                    <TableHead>Aprobacion</TableHead>
                    <TableHead>Visible cliente</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plantillas.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-muted-foreground">{p.orden}</TableCell>
                      <TableCell className="font-mono text-xs">{p.codigo}</TableCell>
                      <TableCell>{p.nombre}</TableCell>
                      <TableCell className="text-right font-mono">
                        {p.sla_horas ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.requiere_aprobacion
                          ? <Badge variant="warning">{p.roles?.nombre ?? "?"}</Badge>
                          : <span className="text-muted-foreground">no</span>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.visible_cliente ? "si" : <span className="text-muted-foreground">no</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.activo ? "success" : "muted"}>{p.activo ? "activo" : "inactivo"}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => openEdit(p)} title="Editar">
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        ))
      )}

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

      <Toaster richColors position="top-right" />
    </div>
  );
}
