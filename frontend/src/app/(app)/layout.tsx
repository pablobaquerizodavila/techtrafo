import { cookies } from "next/headers";
import Link from "next/link";
import { LogoutButton } from "./logout-button";
import { NotifLink } from "./notif-link";

interface MeResponse {
  user: {
    id: string;
    email: string;
    nombres: string;
    apellidos: string;
    rol_nombre: string | null;
    es_super_admin: boolean;
    permisos: Record<string, boolean>;
  };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

async function fetchMe(): Promise<MeResponse["user"] | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
  try {
    const res = await fetch(`${API_URL}/api/auth/me`, {
      headers: { Cookie: cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as MeResponse;
    return data.user;
  } catch {
    return null;
  }
}

function hasPerm(user: MeResponse["user"] | null, mod: string, accion: string): boolean {
  if (!user) return false;
  if (user.es_super_admin) return true;
  const p = user.permisos ?? {};
  return p[`${mod}.${accion}`] === true || p[mod] === true || p.all === true;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await fetchMe();
  const puedeAdminUsuarios = hasPerm(user, "admin", "usuarios");
  const puedeAdminRoles = user?.es_super_admin ?? false;
  const puedeVerExpedientes = hasPerm(user, "expedientes", "read");
  const puedeVerOT = hasPerm(user, "ot", "read");

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r bg-muted/20 p-4">
        <div className="mb-6">
          <h1 className="text-xl font-bold">TECHTRAFO</h1>
          <p className="text-xs text-muted-foreground">Panel de gestion</p>
        </div>
        <nav className="space-y-1 text-sm">
          <Link href="/dashboard" className="block rounded px-3 py-2 hover:bg-accent hover:text-accent-foreground">
            Dashboard
          </Link>
          <Link href="/clientes" className="block rounded px-3 py-2 hover:bg-accent hover:text-accent-foreground">
            Clientes
          </Link>
          {puedeVerExpedientes && (
            <Link href="/expedientes" className="block rounded px-3 py-2 hover:bg-accent hover:text-accent-foreground">
              Expedientes
            </Link>
          )}
          {user && <NotifLink />}
          <Link href="/cotizaciones" className="block rounded px-3 py-2 hover:bg-accent hover:text-accent-foreground">
            Cotizaciones
          </Link>
          <Link href="/contratos" className="block rounded px-3 py-2 hover:bg-accent hover:text-accent-foreground">
            Contratos
          </Link>
          {puedeVerOT && (
            <>
              <Link href="/ot" className="block rounded px-3 py-2 hover:bg-accent hover:text-accent-foreground">
                Órdenes de trabajo
              </Link>
              <Link href="/produccion" className="block rounded px-3 py-2 hover:bg-accent hover:text-accent-foreground font-medium">
                📊 Dashboard producción
              </Link>
            </>
          )}
          <Link href="/inventario" className="block rounded px-3 py-2 hover:bg-accent hover:text-accent-foreground">
            Bodega
          </Link>

          {(puedeAdminUsuarios || puedeAdminRoles) && (
            <>
              <div className="mt-4 px-3 text-xs font-semibold uppercase text-muted-foreground">Administracion</div>
              {puedeAdminUsuarios && (
                <Link href="/admin/usuarios" className="block rounded px-3 py-2 hover:bg-accent hover:text-accent-foreground">
                  Usuarios
                </Link>
              )}
              {puedeAdminRoles && (
                <Link href="/admin/roles" className="block rounded px-3 py-2 hover:bg-accent hover:text-accent-foreground">
                  Roles y permisos
                </Link>
              )}
            </>
          )}
        </nav>

        {user ? (
          <div className="mt-8 border-t pt-4">
            <div className="mb-2 px-3 text-xs">
              <div className="font-medium truncate">{user.nombres} {user.apellidos}</div>
              <div className="text-muted-foreground">{user.rol_nombre ?? "sin rol"}</div>
            </div>
            <LogoutButton />
          </div>
        ) : (
          <div className="mt-8 rounded border border-yellow-500/40 bg-yellow-50/60 p-3 text-xs">
            <p className="mb-2 font-semibold text-yellow-800">Sin sesión activa</p>
            <p className="mb-2 text-yellow-700">Tu cookie expiró. Volvé a iniciar sesión.</p>
            <Link href="/login" className="inline-block rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90">
              Ir al login
            </Link>
          </div>
        )}
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
