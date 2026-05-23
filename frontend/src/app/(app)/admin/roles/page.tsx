"use client";

import { useEffect, useState } from "react";
import { Save, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Toaster, toast } from "sonner";
import {
  PermisoCatalogoEntry,
  RolAdmin,
  createRol,
  deleteRol,
  getCatalogoPermisos,
  listRolesAdmin,
  updateRolPermisos,
} from "@/lib/admin";
import { ApiError } from "@/lib/api";

export default function RolesAdminPage() {
  const [roles, setRoles] = useState<RolAdmin[]>([]);
  const [catalogo, setCatalogo] = useState<PermisoCatalogoEntry[]>([]);
  const [editing, setEditing] = useState<Record<number, Record<string, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [newRol, setNewRol] = useState({ nombre: "", descripcion: "" });
  const [creating, setCreating] = useState(false);

  function loadAll() {
    return Promise.all([listRolesAdmin(), getCatalogoPermisos()])
      .then(([r, c]) => {
        setRoles(r.data);
        setCatalogo(c.data);
      })
      .catch(() => {});
  }

  useEffect(() => {
    loadAll().finally(() => setLoading(false));
  }, []);

  function togglePermiso(rolId: number, clave: string) {
    setEditing((prev) => {
      const actual = prev[rolId] ?? roles.find((r) => r.id === rolId)?.permisos ?? {};
      return { ...prev, [rolId]: { ...actual, [clave]: !actual[clave] } };
    });
  }

  function getEffective(rolId: number, clave: string): boolean {
    const editado = editing[rolId];
    if (editado && Object.prototype.hasOwnProperty.call(editado, clave)) return editado[clave];
    const rol = roles.find((r) => r.id === rolId);
    return rol?.permisos?.[clave] === true;
  }

  function isDirty(rolId: number): boolean {
    const editado = editing[rolId];
    if (!editado) return false;
    const rol = roles.find((r) => r.id === rolId);
    const original = rol?.permisos ?? {};
    return Object.keys(editado).some((k) => editado[k] !== (original[k] === true));
  }

  async function guardar(rolId: number) {
    const rol = roles.find((r) => r.id === rolId);
    if (!rol) return;
    setSaving(rolId);
    try {
      const merged: Record<string, boolean> = { ...rol.permisos };
      const editado = editing[rolId] ?? {};
      for (const [k, v] of Object.entries(editado)) {
        if (v) merged[k] = true;
        else delete merged[k];
      }
      for (const [k, v] of Object.entries(merged)) {
        if (v !== true) delete merged[k];
      }
      const res = await updateRolPermisos(rolId, merged);
      setRoles((prev) => prev.map((r) => (r.id === rolId ? res.data : r)));
      setEditing((prev) => {
        const next = { ...prev };
        delete next[rolId];
        return next;
      });
      toast.success(`Permisos de ${rol.nombre} actualizados`);
    } catch {
      toast.error("Error guardando");
    } finally {
      setSaving(null);
    }
  }

  async function handleCrear() {
    if (!newRol.nombre.trim()) return;
    setCreating(true);
    try {
      await createRol({
        nombre: newRol.nombre.trim().toLowerCase(),
        descripcion: newRol.descripcion.trim() || null,
        permisos: {},
      });
      toast.success(`Rol ${newRol.nombre} creado`);
      setNewDialogOpen(false);
      setNewRol({ nombre: "", descripcion: "" });
      await loadAll();
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { error?: string; details?: { nombre?: string[] } };
        if (body?.error === "nombre_duplicado") toast.error("Ya existe un rol con ese nombre");
        else if (body?.details?.nombre) toast.error(body.details.nombre[0]);
        else toast.error("Error creando rol");
      } else {
        toast.error("Error creando rol");
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleEliminar(rol: RolAdmin) {
    if (!window.confirm(`Eliminar el rol "${rol.nombre}"? Esta accion no se puede deshacer.`)) return;
    try {
      await deleteRol(rol.id);
      toast.success(`Rol ${rol.nombre} eliminado`);
      await loadAll();
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { error?: string; count?: number };
        if (body?.error === "rol_con_usuarios") {
          toast.error(`No se puede eliminar: ${body.count} usuario(s) tienen este rol`);
        } else if (body?.error === "no_se_puede_borrar_super_admin") {
          toast.error("No se puede eliminar el rol super admin");
        } else {
          toast.error("Error eliminando rol");
        }
      } else {
        toast.error("Error eliminando rol");
      }
    }
  }

  if (loading) return <p className="text-muted-foreground">Cargando roles...</p>;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Roles y permisos</h2>
          <p className="text-muted-foreground">
            Define que puede hacer cada rol. Solo el super admin puede editar estos permisos.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Roles marcados como <Badge variant="warning">super admin</Badge> tienen todos los permisos automaticamente.
          </p>
        </div>
        <Button onClick={() => setNewDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Nuevo rol
        </Button>
      </header>

      {roles.map((rol) => {
        const dirty = isDirty(rol.id);
        const hasAll = rol.permisos?.all === true;
        return (
          <Card key={rol.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {rol.nombre}
                    {rol.es_super_admin && <Badge variant="warning">super admin</Badge>}
                    {hasAll && !rol.es_super_admin && <Badge variant="default">all-access</Badge>}
                  </CardTitle>
                  <CardDescription>{rol.descripcion ?? "Sin descripcion"}</CardDescription>
                </div>
                <div className="flex gap-2">
                  {dirty && (
                    <Button onClick={() => guardar(rol.id)} disabled={saving === rol.id}>
                      <Save className="mr-2 h-4 w-4" />
                      {saving === rol.id ? "Guardando..." : "Guardar"}
                    </Button>
                  )}
                  {!rol.es_super_admin && (
                    <Button variant="ghost" size="icon" onClick={() => handleEliminar(rol)} aria-label="Eliminar rol">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {rol.es_super_admin ? (
                <p className="text-sm text-muted-foreground italic">
                  Super admin tiene todos los permisos por diseno; no requiere configuracion manual.
                </p>
              ) : hasAll ? (
                <p className="text-sm text-muted-foreground italic">
                  Este rol tiene el permiso comodin {`{ "all": true }`}. Para usar permisos granulares,
                  destildalo y configura los modulos individualmente.
                </p>
              ) : null}

              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {catalogo.map(({ modulo, acciones }) => (
                  <div key={modulo} className="rounded-md border p-3">
                    <h4 className="mb-2 text-sm font-semibold capitalize">{modulo}</h4>
                    <div className="space-y-1">
                      {acciones.map((accion) => {
                        const clave = `${modulo}.${accion}`;
                        const checked = getEffective(rol.id, clave);
                        return (
                          <label key={accion} className="flex cursor-pointer items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={rol.es_super_admin}
                              onChange={() => togglePermiso(rol.id, clave)}
                              className="h-4 w-4"
                            />
                            <span className="capitalize">{accion}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {/* Dialog crear rol */}
      <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo rol</DialogTitle>
            <DialogDescription>
              El rol se crea sin permisos. Luego configuras la matriz desde la tarjeta del rol.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="rol_nombre">Nombre interno *</Label>
              <Input
                id="rol_nombre"
                value={newRol.nombre}
                onChange={(e) => setNewRol((p) => ({ ...p, nombre: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }))}
                placeholder="ej: supervisor_planta"
                maxLength={50}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">Solo minusculas, numeros y guion bajo.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rol_desc">Descripcion</Label>
              <Textarea
                id="rol_desc"
                rows={2}
                value={newRol.descripcion}
                onChange={(e) => setNewRol((p) => ({ ...p, descripcion: e.target.value }))}
                placeholder="Para que se usa este rol"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDialogOpen(false)} disabled={creating}>Cancelar</Button>
            <Button onClick={handleCrear} disabled={creating || !newRol.nombre.trim()}>
              {creating ? "Creando..." : "Crear rol"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster richColors position="top-right" />
    </div>
  );
}
