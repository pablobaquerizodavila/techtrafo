"use client";

import { useEffect, useState, useCallback } from "react";
import { UserPlus, KeyRound, UserX, UserCheck, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  AccesoCliente,
  crearAcceso,
  deleteAcceso,
  listAccesos,
  resetPasswordAcceso,
  toggleAcceso,
} from "@/lib/clientes";
import { ApiError } from "@/lib/api";

const ERR: Record<string, string> = {
  email_duplicado: "Ya existe un usuario con ese email",
  email_o_usuario_duplicado: "Ese email ya está en uso",
  rol_cliente_no_existe: "Falta el rol 'cliente' en el sistema",
  acceso_con_historial: "No se puede borrar: el acceso tiene historial",
};
function msg(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const code = (err.body as { error?: string })?.error;
    return (code && ERR[code]) || `Error ${err.status}`;
  }
  return fallback;
}

export function ClienteAccesos({ clienteId }: { clienteId: number }) {
  const [accesos, setAccesos] = useState<AccesoCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  // form nuevo acceso
  const [email, setEmail] = useState("");
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [password, setPassword] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAccesos(clienteId);
      setAccesos(res.data);
    } catch (err) {
      toast.error(msg(err, "Error cargando accesos"));
    } finally {
      setLoading(false);
    }
  }, [clienteId]);

  useEffect(() => { load(); }, [load]);

  function resetForm() {
    setEmail(""); setNombres(""); setApellidos(""); setPassword(""); setShowForm(false);
  }

  async function handleCrear() {
    if (!email.trim() || !nombres.trim() || !apellidos.trim() || password.length < 8) {
      toast.error("Completá email, nombre, apellido y una contraseña de 8+ caracteres");
      return;
    }
    setBusy(true);
    try {
      await crearAcceso(clienteId, { email: email.trim(), nombres: nombres.trim(), apellidos: apellidos.trim(), password });
      toast.success("Acceso creado");
      resetForm();
      await load();
    } catch (err) {
      toast.error(msg(err, "Error creando acceso"));
    } finally {
      setBusy(false);
    }
  }

  async function handleReset(a: AccesoCliente) {
    const nueva = window.prompt(`Nueva contraseña para ${a.email} (mínimo 8 caracteres):`);
    if (nueva === null) return;
    if (nueva.length < 8) { toast.error("La contraseña debe tener 8+ caracteres"); return; }
    try {
      await resetPasswordAcceso(clienteId, a.id, nueva);
      toast.success("Contraseña actualizada (se cerró su sesión)");
    } catch (err) {
      toast.error(msg(err, "Error"));
    }
  }

  async function handleToggle(a: AccesoCliente) {
    try {
      await toggleAcceso(clienteId, a.id, !a.activo);
      toast.success(a.activo ? "Acceso desactivado" : "Acceso activado");
      await load();
    } catch (err) {
      toast.error(msg(err, "Error"));
    }
  }

  async function handleDelete(a: AccesoCliente) {
    if (!window.confirm(`¿Eliminar el acceso ${a.email}? El cliente ya no podrá entrar con esa cuenta.`)) return;
    try {
      await deleteAcceso(clienteId, a.id);
      toast.success("Acceso eliminado");
      await load();
    } catch (err) {
      toast.error(msg(err, "Error"));
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-glass bg-glass/40 p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Acceso al portal</p>
          <p className="text-[11px] text-muted-foreground">
            Logins con los que el cliente ve sus expedientes en el portal
          </p>
        </div>
        {!showForm && (
          <Button type="button" size="sm" variant="outline" onClick={() => setShowForm(true)}>
            <UserPlus className="mr-1 h-3.5 w-3.5" /> Agregar acceso
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
        </div>
      ) : accesos.length === 0 && !showForm ? (
        <p className="py-1 text-xs text-muted-foreground">Sin accesos. Agregá uno para que el cliente pueda entrar al portal.</p>
      ) : (
        <ul className="space-y-1.5">
          {accesos.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 rounded-md border border-glass bg-background/40 px-2.5 py-1.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-xs font-medium">{a.nombres} {a.apellidos}</span>
                  {!a.activo && <Badge variant="muted" className="text-[9px]">inactivo</Badge>}
                </div>
                <div className="truncate font-mono text-[10.5px] text-muted-foreground">{a.email}</div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <button type="button" onClick={() => handleReset(a)} title="Resetear contraseña"
                  className="rounded p-1.5 text-muted-foreground hover:bg-glass-elev hover:text-copper">
                  <KeyRound className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => handleToggle(a)} title={a.activo ? "Desactivar" : "Activar"}
                  className="rounded p-1.5 text-muted-foreground hover:bg-glass-elev hover:text-copper">
                  {a.activo ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                </button>
                <button type="button" onClick={() => handleDelete(a)} title="Eliminar acceso"
                  className="rounded p-1.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showForm && (
        <div className="space-y-2 rounded-md border border-copper/30 bg-copper/[0.04] p-2.5">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Nombres</Label>
              <Input className="h-8 text-sm" value={nombres} onChange={(e) => setNombres(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Apellidos</Label>
              <Input className="h-8 text-sm" value={apellidos} onChange={(e) => setApellidos(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[11px]">Email de login</Label>
              <Input className="h-8 text-sm" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="persona@empresa.com" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Contraseña (8+ caracteres)</Label>
              <Input className="h-8 text-sm" type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={resetForm} disabled={busy}>Cancelar</Button>
            <Button type="button" size="sm" onClick={handleCrear} disabled={busy}>
              {busy ? "Creando…" : "Crear acceso"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
