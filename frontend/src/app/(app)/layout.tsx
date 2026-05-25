import { cookies } from "next/headers";
import Link from "next/link";
import { LogoutButton } from "./logout-button";
import { NotifLink } from "./notif-link";
import { SessionExpiredButton } from "./session-expired-button";

interface MeResponse {
  user: {
    id: string;
    email: string;
    nombres: string;
    apellidos: string;
    rol_nombre: string | null;
    es_super_admin: boolean;
    permisos: Record<string, boolean>;
    cliente_id: number | null;
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
  const puedeVerCompras = hasPerm(user, "compras", "read");
  const puedeVerProveedores = hasPerm(user, "proveedores", "read") || puedeVerCompras;
  // Cliente externo: vista simplificada (rol cliente con cliente_id asociado)
  const esCliente = user?.rol_nombre === "cliente" && user.cliente_id !== null;

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 border-r bg-muted/20 p-4">
        <div className="mb-6">
          <h1 className="text-xl font-bold">TECHTRAFO</h1>
          <p className="text-xs text-muted-foreground">
            {esCliente ? "Portal de seguimiento" : "Panel de gestion"}
          </p>
        </div>
        <nav className="space-y-1 text-sm">
          {esCliente ? (
            <>
              {/* Vista simplificada para cliente externo */}
              <Link href="/portal" className="block rounded px-3 py-2 font-medium hover:bg-accent hover:text-accent-foreground">
                🏠 Mi cuenta
              </Link>
              {user && <NotifLink />}
            </>
          ) : (
            <>
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
                  <Link href="/transformadores" className="block rounded px-3 py-2 hover:bg-accent hover:text-accent-foreground">
                    ⚡ Transformadores
                  </Link>
                  <Link href="/garantias" className="block rounded px-3 py-2 hover:bg-accent hover:text-accent-foreground">
                    🛡️ Garantías
                  </Link>
                  <Link href="/produccion" className="block rounded px-3 py-2 hover:bg-accent hover:text-accent-foreground font-medium">
                    📊 Dashboard producción
                  </Link>
                </>
              )}
              <Link href="/inventario" className="block rounded px-3 py-2 hover:bg-accent hover:text-accent-foreground">
                Bodega
              </Link>
              {puedeVerCompras && (
                <>
                  <Link href="/compras" className="block rounded px-3 py-2 hover:bg-accent hover:text-accent-foreground font-medium">
                    🛒 Compras
                  </Link>
                  <Link href="/compras/solicitudes" className="block rounded px-3 py-1.5 pl-7 text-xs hover:bg-accent hover:text-accent-foreground">
                    Solicitudes
                  </Link>
                  <Link href="/compras/ordenes-compra" className="block rounded px-3 py-1.5 pl-7 text-xs hover:bg-accent hover:text-accent-foreground">
                    Órdenes de compra
                  </Link>
                  <Link href="/compras/recepciones" className="block rounded px-3 py-1.5 pl-7 text-xs hover:bg-accent hover:text-accent-foreground">
                    Recepciones
                  </Link>
                  <Link href="/admin/proveedores" className="block rounded px-3 py-1.5 pl-7 text-xs hover:bg-accent hover:text-accent-foreground">
                    Proveedores
                  </Link>
                </>
              )}

              {(puedeAdminUsuarios || puedeAdminRoles) && (
                <>
                  <div className="mt-4 px-3 text-xs font-semibold uppercase text-muted-foreground">Administracion</div>
                  {puedeAdminUsuarios && (
                    <Link href="/admin/usuarios" className="block rounded px-3 py-2 hover:bg-accent hover:text-accent-foreground">
                      Usuarios
                    </Link>
                  )}
                  {puedeAdminRoles && (
                    <>
                      <Link href="/admin/roles" className="block rounded px-3 py-2 hover:bg-accent hover:text-accent-foreground">
                        Roles y permisos
                      </Link>
                      <Link href="/admin/hito-plantillas" className="block rounded px-3 py-2 hover:bg-accent hover:text-accent-foreground">
                        Hitos del catalogo
                      </Link>
                      <Link href="/admin/cotizacion-plantillas" className="block rounded px-3 py-2 hover:bg-accent hover:text-accent-foreground">
                        Plantillas de cotizacion
                      </Link>
                    </>
                  )}
                  {puedeVerProveedores && !puedeVerCompras && (
                    <Link href="/admin/proveedores" className="block rounded px-3 py-2 hover:bg-accent hover:text-accent-foreground">
                      Proveedores
                    </Link>
                  )}
                </>
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
            <Link href="/perfil" className="mb-1 block rounded px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground">
              Mi perfil
            </Link>
            <LogoutButton />
          </div>
        ) : (
          <div className="mt-8 rounded border border-yellow-500/40 bg-yellow-50/60 p-3 text-xs">
            <p className="mb-2 font-semibold text-yellow-800">Sin sesión activa</p>
            <p className="mb-2 text-yellow-700">Tu cookie expiró. Volvé a iniciar sesión.</p>
            <SessionExpiredButton />
          </div>
        )}
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
