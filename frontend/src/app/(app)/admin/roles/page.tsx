"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Toaster, toast } from "sonner";
import {
  PermisoCatalogoEntry,
  RolAdmin,
  getCatalogoPermisos,
  listRolesAdmin,
  updateRolPermisos,
} from "@/lib/admin";

export default function RolesAdminPage() {
  const [roles, setRoles] = useState<RolAdmin[]>([]);
  const [catalogo, setCatalogo] = useState<PermisoCatalogoEntry[]>([]);
  const [editing, setEditing] = useState<Record<number, Record<string, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([listRolesAdmin(), getCatalogoPermisos()])
      .then(([r, c]) => {
        setRoles(r.data);
        setCatalogo(c.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
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
      // Construir el set completo de permisos para guardar: original + cambios
      const merged: Record<string, boolean> = { ...rol.permisos };
      // Aplicar los toggles editados (incluso si quedaron en false los borramos para no inflar el JSONB)
      const editado = editing[rolId] ?? {};
      for (const [k, v] of Object.entries(editado)) {
        if (v) merged[k] = true;
        else delete merged[k];
      }
      // Quitar tambien los originales en false (limpieza)
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

  if (loading) return <p className="text-muted-foreground">Cargando roles...</p>;

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-3xl font-bold">Roles y permisos</h2>
        <p className="text-muted-foreground">
          Define que puede hacer cada rol. Solo el super admin puede editar estos permisos.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Roles marcados como <Badge variant="warning">super admin</Badge> tienen todos los permisos automaticamente.
        </p>
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
                {dirty && (
                  <Button onClick={() => guardar(rol.id)} disabled={saving === rol.id}>
                    <Save className="mr-2 h-4 w-4" />
                    {saving === rol.id ? "Guardando..." : "Guardar cambios"}
                  </Button>
                )}
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

      <Toaster richColors position="top-right" />
    </div>
  );
}
