import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  LayoutDashboard, Users, FileText, FileSignature, Factory, FolderOpen,
  Boxes, Bell, Shield, ArrowRight, AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SessionExpiredButton } from "../session-expired-button";

interface AuthMeResponse {
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

async function fetchCurrentUser(): Promise<AuthMeResponse["user"] | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
  try {
    const res = await fetch(`${API_URL}/api/auth/me`, {
      headers: { Cookie: cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as AuthMeResponse;
    return data.user;
  } catch {
    return null;
  }
}

function hasPerm(user: AuthMeResponse["user"] | null, mod: string, accion: string): boolean {
  if (!user) return false;
  if (user.es_super_admin) return true;
  const p = user.permisos ?? {};
  return p[`${mod}.${accion}`] === true || p[mod] === true || p.all === true;
}

interface ModuloAcceso {
  href: string;
  titulo: string;
  descripcion: string;
  icono: React.ReactNode;
  disponible: boolean;
  destacado?: boolean;
}

export default async function DashboardPage() {
  const user = await fetchCurrentUser();

  // Si es un usuario cliente vinculado a empresa, lo mandamos al portal
  if (user?.rol_nombre === "cliente" && user.cliente_id !== null) {
    redirect("/portal");
  }

  // -------- Sesión inválida o expirada --------
  if (!user) {
    return (
      <div className="space-y-6">
        <header>
          <h2 className="text-3xl font-bold">Dashboard</h2>
          <p className="text-muted-foreground">Sesión no detectada</p>
        </header>
        <Card className="border-yellow-500/40 bg-yellow-50/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-800">
              <AlertTriangle className="h-5 w-5" /> Tu sesión expiró o no es válida
            </CardTitle>
            <CardDescription className="text-yellow-700">
              No pudimos cargar tu usuario desde el servidor. Esto suele pasar después de 8 horas
              de inactividad o si el token JWT cambió en el backend. Cerrá sesión y volvé a entrar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SessionExpiredButton />
          </CardContent>
        </Card>
      </div>
    );
  }

  // -------- Sesión OK: mostrar accesos según permisos --------
  const modulos: ModuloAcceso[] = [
    {
      href: "/produccion", titulo: "Dashboard de producción",
      descripcion: "Vista ejecutiva de planta: KPIs, semáforo, matriz comparativa, alertas",
      icono: <LayoutDashboard className="h-5 w-5" />,
      disponible: hasPerm(user, "ot", "read"), destacado: true,
    },
    {
      href: "/expedientes", titulo: "Expedientes",
      descripcion: "Hoja de ruta del pedido del cliente con hitos y aprobaciones",
      icono: <FolderOpen className="h-5 w-5" />,
      disponible: hasPerm(user, "expedientes", "read"),
    },
    {
      href: "/ot", titulo: "Órdenes de trabajo",
      descripcion: "Planificación y ejecución en planta con pasos y gates de calidad",
      icono: <Factory className="h-5 w-5" />,
      disponible: hasPerm(user, "ot", "read"),
    },
    {
      href: "/cotizaciones", titulo: "Cotizaciones",
      descripcion: "Gestión del flujo comercial",
      icono: <FileText className="h-5 w-5" />,
      disponible: hasPerm(user, "cotizaciones", "read"),
    },
    {
      href: "/contratos", titulo: "Contratos",
      descripcion: "Contratos firmados y plan de pagos",
      icono: <FileSignature className="h-5 w-5" />,
      disponible: hasPerm(user, "contratos", "read"),
    },
    {
      href: "/clientes", titulo: "Clientes",
      descripcion: "Cartera de clientes y contactos",
      icono: <Users className="h-5 w-5" />,
      disponible: hasPerm(user, "clientes", "read"),
    },
    {
      href: "/inventario", titulo: "Bodega",
      descripcion: "Stock, lotes, kárdex, ubicaciones",
      icono: <Boxes className="h-5 w-5" />,
      disponible: hasPerm(user, "inventario", "read"),
    },
    {
      href: "/notificaciones", titulo: "Notificaciones",
      descripcion: "Alertas de estancamientos, aprobaciones y resoluciones",
      icono: <Bell className="h-5 w-5" />,
      disponible: true,
    },
    {
      href: "/admin/usuarios", titulo: "Usuarios",
      descripcion: "Gestión de usuarios internos y clientes",
      icono: <Shield className="h-5 w-5" />,
      disponible: hasPerm(user, "admin", "usuarios"),
    },
    {
      href: "/admin/roles", titulo: "Roles y permisos",
      descripcion: "Configuración de roles y matriz de permisos",
      icono: <Shield className="h-5 w-5" />,
      disponible: user.es_super_admin,
    },
  ];

  const disponibles = modulos.filter((m) => m.disponible);

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-3xl font-bold">Bienvenido, {user.nombres}</h2>
        <p className="text-muted-foreground">
          {user.rol_nombre ?? "sin rol"} · {user.email}
          {user.es_super_admin && <Badge variant="secondary" className="ml-2">super admin</Badge>}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Accesos rápidos</CardTitle>
          <CardDescription>Módulos disponibles según tus permisos</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {disponibles.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                className={`group flex items-start gap-3 rounded-md border p-4 transition hover:border-primary hover:bg-accent ${m.destacado ? "border-primary/40 bg-primary/5" : ""}`}
              >
                <div className={`rounded-md p-2 ${m.destacado ? "bg-primary/10 text-primary" : "bg-muted"}`}>
                  {m.icono}
                </div>
                <div className="flex-1">
                  <p className="font-semibold group-hover:text-primary">
                    {m.titulo}
                    {m.destacado && <Badge variant="default" className="ml-2 text-[10px]">recomendado</Badge>}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{m.descripcion}</p>
                </div>
                <ArrowRight className="h-4 w-4 self-center text-muted-foreground group-hover:text-primary" />
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Roadmap actual</CardTitle>
          <CardDescription>Estado del proyecto TECHTRAFO</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>✅ FASE 4.A–4.D — expedientes, OT, notificaciones email vía Synology</li>
            <li>✅ FASE 4.5 — Órdenes de trabajo con pipeline de pasos y gates</li>
            <li>✅ Dashboard producción (fase A) ejecutivo — disponible en /produccion</li>
            <li>🔜 Migration 012 — transformadores como entidad (capacidad/tipo/serie)</li>
            <li>🔜 Migration 013 — áreas, causas de demora, tiempos de trabajo</li>
            <li>🔜 Vista cliente externa (portal.techtrafo.com en FASE 5)</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
