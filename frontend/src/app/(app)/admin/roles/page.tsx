"use client";

import { useEffect, useState } from "react";
import { Save, Plus, Trash2, KeySquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PageHeader, HeaderActionPrimary } from "@/components/page-header";
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

  if (loading) {
    return (
      <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-copper border-t-transparent" />
          <span className="text-sm">Cargando roles…</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { label: "Admin" }, { label: "Roles" }]}
        title="Roles"
        titleAccent="y permisos"
        meta={<span>Definí qué puede hacer cada rol · solo super admin edita</span>}
        actions={
          <HeaderActionPrimary onClick={() => setNewDialogOpen(true)} icon={<Plus className="h-3.5 w-3.5" />}>
            Nuevo rol
          </HeaderActionPrimary>
        }
      />

      <div className="space-y-4 pt-6">
        {roles.map((rol) => {
          const dirty = isDirty(rol.id);
          const hasAll = rol.permisos?.all === true;
          return (
            <section key={rol.id} className="overflow-hidden rounded-xl border border-glass bg-glass inset-highlight">
              <div className="flex items-start justify-between gap-3 border-b border-glass px-5 py-3.5">
                <div className="flex items-start gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-glass-mid bg-glass-elev text-copper">
                    <KeySquare className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="flex items-center gap-2 font-display text-sm font-semibold tracking-tight capitalize">
                      {rol.nombre}
                      {rol.es_super_admin && <Badge variant="copper">super admin</Badge>}
                      {hasAll && !rol.es_super_admin && <Badge variant="teal">all-access</Badge>}
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">{rol.descripcion ?? "Sin descripción"}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {dirty && (
                    <button type="button" onClick={() => guardar(rol.id)} disabled={saving === rol.id}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-3 py-1.5 text-xs font-medium text-white shadow-sm glow-copper-sm inset-highlight-md transition hover:glow-copper disabled:opacity-60">
                      <Save className="h-3.5 w-3.5" />
                      {saving === rol.id ? "Guardando…" : "Guardar"}
                    </button>
                  )}
                  {!rol.es_super_admin && (
                    <button type="button" onClick={() => handleEliminar(rol)} aria-label="Eliminar rol"
                      className="rounded-md p-1.5 text-rose-400 hover:bg-rose-500/10">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="p-5">
                {rol.es_super_admin ? (
                  <p className="rounded-lg border border-copper/20 bg-copper/[0.05] px-3 py-2 text-xs italic text-copper-soft">
                    Super admin tiene todos los permisos por diseño · no requiere configuración manual.
                  </p>
                ) : hasAll ? (
                  <p className="rounded-lg border border-ttteal/20 bg-ttteal/[0.05] px-3 py-2 text-xs italic text-ttteal-soft">
                    Permiso comodín <span className="font-mono">{`{ "all": true }`}</span>. Para usar permisos granulares, destildalo y configurá los módulos.
                  </p>
                ) : null}

                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {catalogo.map(({ modulo, acciones }) => (
                    <div key={modulo} className="rounded-lg border border-glass bg-glass-elev p-3">
                      <h4 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-copper">{modulo}</h4>
                      <div className="space-y-1.5">
                        {acciones.map((accion) => {
                          const clave = `${modulo}.${accion}`;
                          const checked = getEffective(rol.id, clave);
                          return (
                            <label key={accion} className="flex cursor-pointer items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={rol.es_super_admin}
                                onChange={() => togglePermiso(rol.id, clave)}
                                className="h-3.5 w-3.5 accent-copper"
                              />
                              <span className="capitalize text-foreground/85">{accion}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          );
        })}
      </div>

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

      <Toaster richColors position="top-right" theme="dark" />
    </div>
  );
}
