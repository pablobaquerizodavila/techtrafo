import { cookies } from "next/headers";
import Link from "next/link";
import {
  Bell, Boxes, BookOpen, ClipboardList, FileSignature, FileText, Factory, FolderOpen,
  Gauge, KeySquare, LayoutDashboard, PackageCheck, Search, Shield, ShoppingCart,
  Truck, Users, UsersRound, Wallet, Coins, AlertTriangle, Zap,
} from "lucide-react";
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

function iniciales(nombres: string, apellidos: string): string {
  const n = (nombres || "").trim().split(/\s+/)[0]?.[0] ?? "";
  const a = (apellidos || "").trim().split(/\s+/)[0]?.[0] ?? "";
  return (n + a).toUpperCase() || "·";
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await fetchMe();
  const puedeAdminUsuarios = hasPerm(user, "admin", "usuarios");
  const puedeAdminRoles = user?.es_super_admin ?? false;
  const puedeVerExpedientes = hasPerm(user, "expedientes", "read");
  const puedeVerOT = hasPerm(user, "ot", "read");
  const puedeVerCompras = hasPerm(user, "compras", "read");
  const puedeVerProveedores = hasPerm(user, "proveedores", "read") || puedeVerCompras;
  const puedeVerFinanzas = hasPerm(user, "finanzas", "read");
  const esCliente = user?.rol_nombre === "cliente" && user.cliente_id !== null;

  return (
    <div className="flex min-h-screen">
      {/* ═════════════ Sidebar — Voltage OS ═════════════ */}
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-glass bg-glass px-3 py-5 backdrop-blur-xl">
        {/* Brand */}
        <div className="mb-4 flex items-center gap-3 border-b border-glass px-2 pb-4">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-copper to-copper-deep text-white shadow-lg glow-copper inset-highlight-md">
            <Zap className="h-5 w-5" strokeWidth={2.4} />
          </div>
          <div className="leading-tight">
            <h1 className="font-display text-lg font-semibold tracking-tight">Techtrafo</h1>
            <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted-foreground">
              {esCliente ? "Portal · 0.6" : "Voltage OS · 0.6"}
            </p>
          </div>
        </div>

        {/* Quick search (visual stub — ⌘K hook futuro) */}
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder={esCliente ? "Buscar..." : "Buscar OT, cliente..."}
            className="w-full rounded-lg border border-glass bg-glass px-3 py-2 pl-8 pr-10 font-sans text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-glass-strong focus:bg-glass-elev focus:outline-none"
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-glass bg-glass px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
            ⌘K
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-4 overflow-y-auto pr-1 scroll-discreet">
          {esCliente ? (
            <NavGroup label="Portal">
              <NavLink href="/portal" icon={<LayoutDashboard className="h-4 w-4" />}>Mi cuenta</NavLink>
              {user && <NotifLink />}
            </NavGroup>
          ) : (
            <>
              <NavGroup label="Operación">
                <NavLink href="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />}>Inicio</NavLink>
                {puedeVerOT && (
                  <NavLink href="/produccion" icon={<Gauge className="h-4 w-4" />}>Dashboard planta</NavLink>
                )}
                {puedeVerOT && (
                  <NavLink href="/ot" icon={<Factory className="h-4 w-4" />}>Órdenes de trabajo</NavLink>
                )}
                {puedeVerExpedientes && (
                  <NavLink href="/expedientes" icon={<FolderOpen className="h-4 w-4" />}>Expedientes</NavLink>
                )}
                {puedeVerOT && (
                  <NavLink href="/transformadores" icon={<Zap className="h-4 w-4" />}>Transformadores</NavLink>
                )}
              </NavGroup>

              <NavGroup label="Comercial">
                <NavLink href="/cotizaciones" icon={<FileText className="h-4 w-4" />}>Cotizaciones</NavLink>
                <NavLink href="/contratos" icon={<FileSignature className="h-4 w-4" />}>Contratos</NavLink>
                <NavLink href="/clientes" icon={<Users className="h-4 w-4" />}>Clientes</NavLink>
              </NavGroup>

              <NavGroup label="Soporte">
                <NavLink href="/inventario" icon={<Boxes className="h-4 w-4" />}>Bodega</NavLink>
                {puedeVerOT && (
                  <NavLink href="/garantias" icon={<Shield className="h-4 w-4" />}>Garantías</NavLink>
                )}
                {user && <NotifLink />}
              </NavGroup>

              {puedeVerCompras && (
                <NavGroup label="Compras">
                  <NavLink href="/compras" icon={<ShoppingCart className="h-4 w-4" />}>Resumen</NavLink>
                  <NavSubLink href="/compras/solicitudes" icon={<ClipboardList className="h-3 w-3" />}>Solicitudes</NavSubLink>
                  <NavSubLink href="/compras/ordenes-compra" icon={<FileText className="h-3 w-3" />}>Órdenes de compra</NavSubLink>
                  <NavSubLink href="/compras/recepciones" icon={<PackageCheck className="h-3 w-3" />}>Recepciones</NavSubLink>
                  <NavSubLink href="/admin/proveedores" icon={<Truck className="h-3 w-3" />}>Proveedores</NavSubLink>
                </NavGroup>
              )}

              {puedeVerFinanzas && (
                <NavGroup label="Finanzas">
                  <NavLink href="/finanzas" icon={<Wallet className="h-4 w-4" />}>Resumen</NavLink>
                  <NavSubLink href="/finanzas/cartera" icon={<AlertTriangle className="h-3 w-3" />}>Cartera vencida</NavSubLink>
                  <NavSubLink href="/finanzas/cobros" icon={<Coins className="h-3 w-3" />}>Cobros</NavSubLink>
                </NavGroup>
              )}

              {(puedeAdminUsuarios || puedeAdminRoles || (puedeVerProveedores && !puedeVerCompras)) && (
                <NavGroup label="Administración">
                  {puedeAdminUsuarios && (
                    <NavLink href="/admin/usuarios" icon={<UsersRound className="h-4 w-4" />}>Usuarios</NavLink>
                  )}
                  {puedeAdminRoles && (
                    <>
                      <NavLink href="/admin/roles" icon={<KeySquare className="h-4 w-4" />}>Roles y permisos</NavLink>
                      <NavLink href="/admin/hito-plantillas" icon={<FolderOpen className="h-4 w-4" />}>Hitos del catálogo</NavLink>
                      <NavLink href="/admin/cotizacion-plantillas" icon={<FileText className="h-4 w-4" />}>Plantillas cotización</NavLink>
                      <NavLink href="/admin/contrato-plantillas" icon={<FileSignature className="h-4 w-4" />}>Plantillas contrato</NavLink>
                    </>
                  )}
                  {puedeVerProveedores && !puedeVerCompras && (
                    <NavLink href="/admin/proveedores" icon={<Truck className="h-4 w-4" />}>Proveedores</NavLink>
                  )}
                </NavGroup>
              )}

              <NavGroup label="Ayuda">
                <NavLink href="/manual" icon={<BookOpen className="h-4 w-4" />}>Manual de procesos</NavLink>
              </NavGroup>
            </>
          )}
        </nav>

        {/* User card + system status */}
        <div className="mt-3 border-t border-glass pt-3">
          {user ? (
            <>
              <div className="flex items-center gap-3 rounded-xl border border-glass bg-glass p-2.5 inset-highlight">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-ttteal to-ttteal-deep font-display text-xs font-bold text-background inset-highlight-md">
                  {iniciales(user.nombres, user.apellidos)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{user.nombres} {user.apellidos}</p>
                  <p className="truncate font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                    {user.rol_nombre ?? "sin rol"}{user.es_super_admin ? " · ★" : ""}
                  </p>
                </div>
                <Link
                  href="/perfil"
                  className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-glass-hover hover:text-foreground"
                  aria-label="Mi perfil"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                </Link>
              </div>
              <div className="mt-3 flex items-center justify-between px-2">
                <span className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  <span className="led-green" /> Sistema · 99.8%
                </span>
                <LogoutButton />
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3 inset-highlight">
              <div className="mb-1.5 flex items-center gap-1.5">
                <Bell className="h-3.5 w-3.5 text-amber-400" />
                <p className="text-xs font-semibold text-amber-200">Sin sesión activa</p>
              </div>
              <p className="mb-2.5 text-[11px] leading-snug text-amber-200/80">
                Tu cookie expiró. Volvé a iniciar sesión.
              </p>
              <SessionExpiredButton />
            </div>
          )}
        </div>
      </aside>

      {/* ═════════════ Main ═════════════ */}
      <main className="flex-1 overflow-x-hidden p-8">{children}</main>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Sidebar helpers
// ═══════════════════════════════════════════════════════════════

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 px-3 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/60">
        {label}
      </p>
      <div className="space-y-px">{children}</div>
    </div>
  );
}

function NavLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-glass hover:text-foreground"
    >
      <span className="text-muted-foreground/70 transition-colors group-hover:text-copper">{icon}</span>
      <span className="flex-1">{children}</span>
    </Link>
  );
}

function NavSubLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2 rounded-lg px-3 py-1.5 pl-9 text-[11.5px] text-muted-foreground/80 transition-colors hover:bg-glass hover:text-foreground"
    >
      <span className="text-muted-foreground/50">{icon}</span>
      <span className="flex-1">{children}</span>
    </Link>
  );
}
