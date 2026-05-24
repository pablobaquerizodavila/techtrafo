"use client";

import { useEffect, useState } from "react";
import { Save, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster, toast } from "sonner";
import { AuthUser, changeMyPassword, getCurrentUser, updateMyProfile } from "@/lib/auth";
import { ApiError } from "@/lib/api";

export default function PerfilPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Perfil
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [telefono, setTelefono] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Password
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [newPwdConfirm, setNewPwdConfirm] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  useEffect(() => {
    getCurrentUser().then((u) => {
      setUser(u);
      if (u) {
        setNombres(u.nombres);
        setApellidos(u.apellidos);
      }
      setLoading(false);
    });
  }, []);

  async function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const payload: Parameters<typeof updateMyProfile>[0] = {};
    if (nombres.trim() !== user.nombres) payload.nombres = nombres.trim();
    if (apellidos.trim() !== user.apellidos) payload.apellidos = apellidos.trim();
    if (telefono.trim() !== "") payload.telefono = telefono.trim();
    if (Object.keys(payload).length === 0) {
      toast.info("No hay cambios para guardar");
      return;
    }
    setSavingProfile(true);
    try {
      const res = await updateMyProfile(payload);
      toast.success("Perfil actualizado");
      setUser({ ...user, nombres: res.data.nombres, apellidos: res.data.apellidos });
      setTelefono(res.data.telefono ?? "");
    } catch (err) {
      const code = err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error";
      toast.error(code);
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd.length < 8) {
      toast.error("Minimo 8 caracteres");
      return;
    }
    if (newPwd !== newPwdConfirm) {
      toast.error("Las passwords no coinciden");
      return;
    }
    if (newPwd === currentPwd) {
      toast.error("La password nueva debe ser distinta de la actual");
      return;
    }
    setSavingPwd(true);
    try {
      await changeMyPassword(currentPwd, newPwd);
      toast.success("Password actualizada");
      setCurrentPwd("");
      setNewPwd("");
      setNewPwdConfirm("");
    } catch (err) {
      const code = err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error";
      const msg =
        code === "current_password_invalida" ? "La password actual es incorrecta"
        : code === "password_igual_a_la_actual" ? "La password nueva debe ser distinta de la actual"
        : code;
      toast.error(msg);
    } finally {
      setSavingPwd(false);
    }
  }

  if (loading) return <p className="text-muted-foreground">Cargando perfil...</p>;
  if (!user) return <p className="text-destructive">Sesion no valida</p>;

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-bold">Mi perfil</h2>
        <p className="text-muted-foreground">Edita tu informacion personal y cambia tu password.</p>
      </header>

      {/* Info cuenta */}
      <section className="space-y-3 rounded-md border bg-muted/20 p-4 text-sm">
        <div className="flex items-baseline gap-2">
          <span className="text-muted-foreground">Email:</span>
          <span className="font-mono">{user.email}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-muted-foreground">Rol:</span>
          <span>{user.rol_nombre ?? <em className="text-muted-foreground">sin rol</em>}</span>
        </div>
        <p className="text-xs text-muted-foreground">El email y el rol los administra el equipo. Si necesitas cambiarlos, contacta al administrador.</p>
      </section>

      {/* Form perfil */}
      <section>
        <h3 className="mb-3 text-xl font-bold">Informacion personal</h3>
        <form onSubmit={handleProfileSubmit} className="max-w-xl space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="nombres">Nombres *</Label>
              <Input id="nombres" value={nombres} onChange={(e) => setNombres(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="apellidos">Apellidos *</Label>
              <Input id="apellidos" value={apellidos} onChange={(e) => setApellidos(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="telefono">Telefono</Label>
            <Input id="telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="(opcional)" />
          </div>
          <Button type="submit" disabled={savingProfile}>
            <Save className="mr-1 h-4 w-4" />
            {savingProfile ? "Guardando..." : "Guardar cambios"}
          </Button>
        </form>
      </section>

      {/* Form password */}
      <section>
        <h3 className="mb-3 text-xl font-bold">Cambiar password</h3>
        <form onSubmit={handlePasswordSubmit} className="max-w-xl space-y-3">
          <div className="space-y-1">
            <Label htmlFor="current_pwd">Password actual *</Label>
            <Input id="current_pwd" type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} autoComplete="current-password" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new_pwd">Password nueva *</Label>
            <Input id="new_pwd" type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="Minimo 8 caracteres" autoComplete="new-password" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new_pwd_confirm">Confirmar password nueva *</Label>
            <Input id="new_pwd_confirm" type="password" value={newPwdConfirm} onChange={(e) => setNewPwdConfirm(e.target.value)} autoComplete="new-password" required />
            {newPwdConfirm && newPwd !== newPwdConfirm && (
              <p className="text-xs text-destructive">Las passwords no coinciden</p>
            )}
          </div>
          <Button type="submit" disabled={savingPwd || newPwd.length < 8 || newPwd !== newPwdConfirm || !currentPwd}>
            <KeyRound className="mr-1 h-4 w-4" />
            {savingPwd ? "Guardando..." : "Cambiar password"}
          </Button>
        </form>
      </section>

      <Toaster richColors position="top-right" />
    </div>
  );
}
