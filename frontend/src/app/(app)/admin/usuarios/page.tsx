"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, CheckCircle2, XCircle, UserX, UserCheck, Pencil, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Toaster, toast } from "sonner";
import {
  EstadoAprobacion,
  RolAdmin,
  UsuarioAdmin,
  aprobarUsuario,
  estadoAprobVariant,
  listRolesAdmin,
  listUsuariosAdmin,
  rechazarUsuario,
  resetPasswordUsuarioAdmin,
  updateUsuarioAdmin,
} from "@/lib/admin";
import { ApiError } from "@/lib/api";

const PAGE_LIMIT = 25;

type DialogState =
  | { kind: "closed" }
  | { kind: "aprobar"; user: UsuarioAdmin }
  | { kind: "rechazar"; user: UsuarioAdmin }
  | { kind: "editar"; user: UsuarioAdmin }
  | { kind: "reset-password"; user: UsuarioAdmin };

interface EditForm {
  email: string;
  nombres: string;
  apellidos: string;
  telefono: string;
  rol_id: number | null;
}

export default function UsuariosAdminPage() {
  const [data, setData] = useState<UsuarioAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<EstadoAprobacion | "">("pendiente");
  const [roles, setRoles] = useState<RolAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" });
  const [rolSeleccionado, setRolSeleccionado] = useState<number | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState("");
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    listRolesAdmin().then((r) => setRoles(r.data.filter((x) => x.activo))).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listUsuariosAdmin({
        page, limit: PAGE_LIMIT,
        q: q || undefined,
        estado: estado || undefined,
      });
      setData(res.data);
      setTotal(res.pagination.total);
    } finally {
      setLoading(false);
    }
  }, [page, q, estado]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); setQ(qInput.trim()); }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  async function handleAprobar() {
    if (dialog.kind !== "aprobar" || !rolSeleccionado) return;
    try {
      await aprobarUsuario(dialog.user.id, rolSeleccionado);
      toast.success(`${dialog.user.nombres} aprobado`);
      setDialog({ kind: "closed" });
      setRolSeleccionado(null);
      load();
    } catch (err) {
      const e = err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error";
      toast.error(e);
    }
  }

  async function handleRechazar() {
    if (dialog.kind !== "rechazar" || !motivoRechazo.trim()) return;
    try {
      await rechazarUsuario(dialog.user.id, motivoRechazo.trim());
      toast.success(`${dialog.user.nombres} rechazado`);
      setDialog({ kind: "closed" });
      setMotivoRechazo("");
      load();
    } catch (err) {
      const e = err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error";
      toast.error(e);
    }
  }

  async function toggleActivo(u: UsuarioAdmin) {
    if (!window.confirm(`${u.activo ? "Desactivar" : "Activar"} a ${u.email}?`)) return;
    try {
      await updateUsuarioAdmin(u.id, { activo: !u.activo });
      toast.success("Estado actualizado");
      load();
    } catch (err) {
      const e = err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error";
      toast.error(e);
    }
  }

  function openEditar(u: UsuarioAdmin) {
    setEditForm({
      email: u.email,
      nombres: u.nombres,
      apellidos: u.apellidos,
      telefono: u.telefono ?? "",
      rol_id: u.rol_id,
    });
    setDialog({ kind: "editar", user: u });
  }

  async function handleEditarSubmit() {
    if (dialog.kind !== "editar" || !editForm) return;
    const u = dialog.user;
    const payload: Parameters<typeof updateUsuarioAdmin>[1] = {};
    if (editForm.email !== u.email) payload.email = editForm.email.trim();
    if (editForm.nombres !== u.nombres) payload.nombres = editForm.nombres.trim();
    if (editForm.apellidos !== u.apellidos) payload.apellidos = editForm.apellidos.trim();
    if ((editForm.telefono || "") !== (u.telefono ?? "")) payload.telefono = editForm.telefono.trim() || null;
    if (editForm.rol_id !== u.rol_id) payload.rol_id = editForm.rol_id;
    if (Object.keys(payload).length === 0) {
      setDialog({ kind: "closed" });
      return;
    }
    setSavingEdit(true);
    try {
      await updateUsuarioAdmin(u.id, payload);
      toast.success(`Usuario ${u.email} actualizado`);
      setDialog({ kind: "closed" });
      setEditForm(null);
      load();
    } catch (err) {
      const code = err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error";
      const msg =
        code === "email_en_uso" ? "Ese email ya esta en uso por otro usuario"
        : code === "super_admin_required" ? "Solo un super admin puede asignar el rol super_admin"
        : code === "super_admin_required_to_edit_super_admin" ? "Solo un super admin puede editar otro super admin"
        : code;
      toast.error(msg);
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleResetPasswordSubmit() {
    if (dialog.kind !== "reset-password") return;
    if (newPassword.length < 8) {
      toast.error("Minimo 8 caracteres");
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      toast.error("Las passwords no coinciden");
      return;
    }
    setSavingPassword(true);
    try {
      await resetPasswordUsuarioAdmin(dialog.user.id, newPassword);
      toast.success(`Password actualizada. Comunicasela a ${dialog.user.email} fuera de banda.`);
      setDialog({ kind: "closed" });
      setNewPassword("");
      setNewPasswordConfirm("");
    } catch (err) {
      const code = err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error";
      const msg =
        code === "super_admin_required_to_reset_super_admin" ? "Solo un super admin puede resetear el password de otro super admin"
        : code;
      toast.error(msg);
    } finally {
      setSavingPassword(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-3xl font-bold">Usuarios</h2>
        <p className="text-muted-foreground">Administracion de usuarios, aprobacion de solicitudes y asignacion de roles</p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Buscar por nombre o email" className="pl-9" />
        </div>
        <Select value={estado || "_"} onValueChange={(v) => { setPage(1); setEstado(v === "_" ? "" : v as EstadoAprobacion); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_">Todos los estados</SelectItem>
            <SelectItem value="pendiente">Pendientes</SelectItem>
            <SelectItem value="aprobado">Aprobados</SelectItem>
            <SelectItem value="rechazado">Rechazados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Telefono</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Solicitud</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Sin usuarios con esos filtros</TableCell></TableRow>
            ) : (
              data.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="font-medium">{u.nombres} {u.apellidos}</div>
                  </TableCell>
                  <TableCell className="text-sm">{u.email}</TableCell>
                  <TableCell className="text-sm font-mono">{u.telefono ?? u.telefono_solicitud ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {u.roles?.nombre ?? <span className="text-muted-foreground italic">sin rol</span>}
                    {u.roles?.es_super_admin && <Badge variant="warning" className="ml-2">super</Badge>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={estadoAprobVariant(u.estado_aprobacion)}>{u.estado_aprobacion}</Badge>
                    {!u.activo && <Badge variant="muted" className="ml-1">inactivo</Badge>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {u.created_at.split("T")[0]}
                    {u.motivo_rechazo && <div className="text-destructive">Motivo: {u.motivo_rechazo}</div>}
                  </TableCell>
                  <TableCell className="text-right">
                    {u.estado_aprobacion === "pendiente" && (
                      <>
                        <Button variant="default" size="sm" onClick={() => setDialog({ kind: "aprobar", user: u })}>
                          <CheckCircle2 className="mr-1 h-3 w-3" /> Aprobar
                        </Button>
                        <Button variant="destructive" size="sm" className="ml-2" onClick={() => setDialog({ kind: "rechazar", user: u })}>
                          <XCircle className="mr-1 h-3 w-3" /> Rechazar
                        </Button>
                      </>
                    )}
                    {u.estado_aprobacion === "aprobado" && (
                      <div className="flex justify-end gap-1">
                        <Button variant="outline" size="sm" onClick={() => openEditar(u)} title="Editar info">
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setDialog({ kind: "reset-password", user: u })} title="Resetear password">
                          <KeyRound className="h-3 w-3" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => toggleActivo(u)} title={u.activo ? "Desactivar" : "Activar"}>
                          {u.activo ? <UserX className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <p className="text-muted-foreground">{total === 0 ? "Sin resultados" : `${total} - pagina ${page}/${totalPages}`}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Anterior</Button>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Siguiente</Button>
        </div>
      </div>

      {/* Dialog aprobar */}
      <Dialog open={dialog.kind === "aprobar"} onOpenChange={(open) => !open && setDialog({ kind: "closed" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprobar usuario</DialogTitle>
            <DialogDescription>
              {dialog.kind === "aprobar" && (
                <>Asigna un rol a <strong>{dialog.user.nombres} {dialog.user.apellidos}</strong> ({dialog.user.email})</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rol_aprobar">Rol *</Label>
            <Select value={rolSeleccionado?.toString() ?? ""} onValueChange={(v) => setRolSeleccionado(v ? Number(v) : null)}>
              <SelectTrigger id="rol_aprobar"><SelectValue placeholder="Seleccionar rol..." /></SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id.toString()}>
                    {r.nombre}{r.es_super_admin && " (super admin)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ kind: "closed" })}>Cancelar</Button>
            <Button onClick={handleAprobar} disabled={!rolSeleccionado}>Aprobar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog rechazar */}
      <Dialog open={dialog.kind === "rechazar"} onOpenChange={(open) => !open && setDialog({ kind: "closed" })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar solicitud</DialogTitle>
            <DialogDescription>
              {dialog.kind === "rechazar" && (
                <>Rechazar la solicitud de <strong>{dialog.user.email}</strong>. El usuario vera este motivo si intenta iniciar sesion.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo">Motivo *</Label>
            <Input id="motivo" value={motivoRechazo} onChange={(e) => setMotivoRechazo(e.target.value)} placeholder="Ej: Email externo, no es del personal" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ kind: "closed" })}>Cancelar</Button>
            <Button variant="destructive" onClick={handleRechazar} disabled={!motivoRechazo.trim()}>Rechazar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog editar */}
      <Dialog open={dialog.kind === "editar"} onOpenChange={(open) => { if (!open) { setDialog({ kind: "closed" }); setEditForm(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
            <DialogDescription>
              {dialog.kind === "editar" && (<>Cambios sobre <strong>{dialog.user.email}</strong></>)}
            </DialogDescription>
          </DialogHeader>
          {editForm && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="edit_email">Email</Label>
                <Input id="edit_email" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="edit_nombres">Nombres</Label>
                  <Input id="edit_nombres" value={editForm.nombres} onChange={(e) => setEditForm({ ...editForm, nombres: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit_apellidos">Apellidos</Label>
                  <Input id="edit_apellidos" value={editForm.apellidos} onChange={(e) => setEditForm({ ...editForm, apellidos: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit_telefono">Telefono</Label>
                <Input id="edit_telefono" value={editForm.telefono} onChange={(e) => setEditForm({ ...editForm, telefono: e.target.value })} placeholder="(opcional)" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit_rol">Rol</Label>
                <Select value={editForm.rol_id?.toString() ?? ""} onValueChange={(v) => setEditForm({ ...editForm, rol_id: v ? Number(v) : null })}>
                  <SelectTrigger id="edit_rol"><SelectValue placeholder="Sin rol" /></SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id.toString()}>
                        {r.nombre}{r.es_super_admin && " (super admin)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialog({ kind: "closed" }); setEditForm(null); }} disabled={savingEdit}>Cancelar</Button>
            <Button onClick={handleEditarSubmit} disabled={savingEdit || !editForm?.email || !editForm?.nombres || !editForm?.apellidos}>
              {savingEdit ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog reset password */}
      <Dialog open={dialog.kind === "reset-password"} onOpenChange={(open) => { if (!open) { setDialog({ kind: "closed" }); setNewPassword(""); setNewPasswordConfirm(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resetear password</DialogTitle>
            <DialogDescription>
              {dialog.kind === "reset-password" && (
                <>Definir una password nueva para <strong>{dialog.user.email}</strong>. El sistema no le va a notificar — comunicasela vos fuera de banda.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="new_pwd">Password nueva</Label>
              <Input id="new_pwd" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Minimo 8 caracteres" autoFocus />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new_pwd_confirm">Confirmar password</Label>
              <Input id="new_pwd_confirm" type="password" value={newPasswordConfirm} onChange={(e) => setNewPasswordConfirm(e.target.value)} />
              {newPasswordConfirm && newPassword !== newPasswordConfirm && (
                <p className="text-xs text-destructive">Las passwords no coinciden</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialog({ kind: "closed" }); setNewPassword(""); setNewPasswordConfirm(""); }} disabled={savingPassword}>Cancelar</Button>
            <Button onClick={handleResetPasswordSubmit} disabled={savingPassword || newPassword.length < 8 || newPassword !== newPasswordConfirm}>
              {savingPassword ? "Guardando..." : "Resetear password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Toaster richColors position="top-right" />
    </div>
  );
}
