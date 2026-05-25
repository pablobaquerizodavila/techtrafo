"use client";

import { useEffect, useState } from "react";
import { Save, KeyRound, User as UserIcon, Shield } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster, toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { AuthUser, changeMyPassword, getCurrentUser, updateMyProfile } from "@/lib/auth";
import { ApiError } from "@/lib/api";

export default function PerfilPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [telefono, setTelefono] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [newPwdConfirm, setNewPwdConfirm] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  useEffect(() => {
    getCurrentUser().then((u) => {
      setUser(u);
      if (u) { setNombres(u.nombres); setApellidos(u.apellidos); }
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
    if (Object.keys(payload).length === 0) { toast.info("No hay cambios para guardar"); return; }
    setSavingProfile(true);
    try {
      const res = await updateMyProfile(payload);
      toast.success("Perfil actualizado");
      setUser({ ...user, nombres: res.data.nombres, apellidos: res.data.apellidos });
      setTelefono(res.data.telefono ?? "");
    } catch (err) {
      const code = err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error";
      toast.error(code);
    } finally { setSavingProfile(false); }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd.length < 8) { toast.error("Mínimo 8 caracteres"); return; }
    if (newPwd !== newPwdConfirm) { toast.error("Las contraseñas no coinciden"); return; }
    if (newPwd === currentPwd) { toast.error("La nueva debe ser distinta de la actual"); return; }
    setSavingPwd(true);
    try {
      await changeMyPassword(currentPwd, newPwd);
      toast.success("Contraseña actualizada");
      setCurrentPwd(""); setNewPwd(""); setNewPwdConfirm("");
    } catch (err) {
      const code = err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error";
      const msg = code === "current_password_invalida" ? "La contraseña actual es incorrecta"
        : code === "password_igual_a_la_actual" ? "La nueva debe ser distinta de la actual" : code;
      toast.error(msg);
    } finally { setSavingPwd(false); }
  }

  if (loading) {
    return (
      <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-copper border-t-transparent" />
          <span className="text-sm">Cargando perfil…</span>
        </div>
      </div>
    );
  }
  if (!user) {
    return (
      <div>
        <PageHeader breadcrumb={[{ href: "/dashboard", label: "Panel" }, { label: "Perfil" }]} title="Sesión" titleAccent="no válida" />
        <div className="pt-6"><div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-200 inset-highlight"><p className="text-sm">No se pudo cargar tu usuario.</p></div></div>
      </div>
    );
  }

  const iniciales = (user.nombres?.[0] ?? "") + (user.apellidos?.[0] ?? "");

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { label: "Mi perfil" }]}
        title="Mi"
        titleAccent="perfil"
        meta={<span>Información personal y contraseña</span>}
      />

      <div className="space-y-6 pt-6">
        {/* Info de cuenta */}
        <Panel title="Cuenta" subtitle="Email y rol administrados por el equipo" icon={<UserIcon className="h-3.5 w-3.5" />}>
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-ttteal to-ttteal-deep font-display text-lg font-bold text-background inset-highlight-md">
              {iniciales.toUpperCase()}
            </div>
            <div className="space-y-1">
              <p className="font-display text-base font-semibold">{user.nombres} {user.apellidos}</p>
              <p className="font-mono text-xs text-muted-foreground">{user.email}</p>
              <p className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-wider text-copper">
                <Shield className="h-3 w-3" /> {user.rol_nombre ?? "sin rol"}{user.es_super_admin ? " · super admin" : ""}
              </p>
            </div>
          </div>
          <p className="mt-4 border-t border-glass pt-3 text-xs text-muted-foreground">
            El email y el rol los administra el equipo. Si necesitás cambiarlos, contactá al administrador.
          </p>
        </Panel>

        {/* Información personal */}
        <Panel title="Información personal" subtitle="Tu nombre y teléfono">
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nombres" required htmlFor="nombres">
                <Input id="nombres" value={nombres} onChange={(e) => setNombres(e.target.value)} required className="h-10 border-glass bg-glass" />
              </Field>
              <Field label="Apellidos" required htmlFor="apellidos">
                <Input id="apellidos" value={apellidos} onChange={(e) => setApellidos(e.target.value)} required className="h-10 border-glass bg-glass" />
              </Field>
            </div>
            <Field label="Teléfono" htmlFor="telefono">
              <Input id="telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="opcional" className="h-10 border-glass bg-glass" />
            </Field>
            <div className="border-t border-glass pt-4">
              <button type="submit" disabled={savingProfile}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-4 py-2 text-sm font-medium text-white shadow-sm glow-copper-sm inset-highlight-md transition hover:glow-copper disabled:opacity-60">
                <Save className="h-3.5 w-3.5" />
                {savingProfile ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </form>
        </Panel>

        {/* Cambiar contraseña */}
        <Panel title="Cambiar contraseña" subtitle="Mínimo 8 caracteres" icon={<KeyRound className="h-3.5 w-3.5" />}>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <Field label="Contraseña actual" required htmlFor="current_pwd">
              <Input id="current_pwd" type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} autoComplete="current-password" required className="h-10 border-glass bg-glass" />
            </Field>
            <Field label="Contraseña nueva" required htmlFor="new_pwd">
              <Input id="new_pwd" type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="Mínimo 8 caracteres" autoComplete="new-password" required className="h-10 border-glass bg-glass" />
            </Field>
            <Field label="Confirmar contraseña nueva" required htmlFor="new_pwd_confirm">
              <Input id="new_pwd_confirm" type="password" value={newPwdConfirm} onChange={(e) => setNewPwdConfirm(e.target.value)} autoComplete="new-password" required className="h-10 border-glass bg-glass" />
              {newPwdConfirm && newPwd !== newPwdConfirm && (
                <p className="mt-1 text-xs text-rose-300">Las contraseñas no coinciden</p>
              )}
            </Field>
            <div className="border-t border-glass pt-4">
              <button type="submit" disabled={savingPwd || newPwd.length < 8 || newPwd !== newPwdConfirm || !currentPwd}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-4 py-2 text-sm font-medium text-white shadow-sm glow-copper-sm inset-highlight-md transition hover:glow-copper disabled:opacity-40">
                <KeyRound className="h-3.5 w-3.5" />
                {savingPwd ? "Guardando…" : "Cambiar contraseña"}
              </button>
            </div>
          </form>
        </Panel>
      </div>

      <Toaster richColors position="top-right" theme="dark" />
    </div>
  );
}

function Field({ label, required, htmlFor, children }: { label: string; required?: boolean; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}{required && <span className="ml-1 text-copper">*</span>}
      </Label>
      {children}
    </div>
  );
}
