import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity, AlertOctagon, AlertTriangle, ArrowUpRight, Bell, BellRing,
  Boxes, CheckCircle2, ChevronRight, ClipboardList, Clock, FileSignature, FileText,
  Factory, Flag, FolderOpen, Gauge, LayoutDashboard, Plus, Shield, Sparkles,
  Truck, Users, Zap,
} from "lucide-react";
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

async function authedFetch<T = unknown>(path: string): Promise<T | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { Cookie: cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
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

function saludo(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

interface ResumenOT  { data: { por_estado: Record<string, number>; urgentes_abiertas: number; atrasadas: number } }
interface ResumenExp { data: { total_activos: number; total_estancados: number; por_estado: Record<string, number> } }
interface ResumenGar { data: { total: number; vigentes: number; por_vencer_30d: number; vencidas_no_cerradas: number; reclamos_abiertos: number } }
interface ResumenNot { data: { recientes_48h: number; total: number } }

export default async function DashboardPage() {
  const me = await authedFetch<AuthMeResponse>("/api/auth/me");
  const user = me?.user ?? null;

  if (user?.rol_nombre === "cliente" && user.cliente_id !== null) {
    redirect("/portal");
  }

  if (!user) {
    return (
      <div className="-m-8 min-h-screen bg-slate-50/50 p-8">
        <div className="mx-auto max-w-2xl rounded-lg border border-amber-200 bg-amber-50/70 p-8">
          <div className="mb-3 flex items-center gap-2 text-amber-800">
            <AlertTriangle className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Tu sesión expiró o no es válida</h2>
          </div>
          <p className="mb-5 text-sm text-amber-700">
            No pudimos cargar tu usuario desde el servidor. Esto suele pasar después de 8 horas de
            inactividad o si el token JWT cambió en el backend. Cerrá sesión y volvé a entrar.
          </p>
          <SessionExpiredButton />
        </div>
      </div>
    );
  }

  // Paraleliza todos los resúmenes — fail-soft (un fetch caído no rompe el dashboard)
  const [ot, exp, gar, notif] = await Promise.all([
    hasPerm(user, "ot", "read")           ? authedFetch<ResumenOT>("/api/ot/dashboard/resumen")           : Promise.resolve(null),
    hasPerm(user, "expedientes", "read")  ? authedFetch<ResumenExp>("/api/expedientes/dashboard/resumen") : Promise.resolve(null),
    hasPerm(user, "ot", "read")           ? authedFetch<ResumenGar>("/api/garantias/dashboard/resumen")   : Promise.resolve(null),
    authedFetch<ResumenNot>("/api/notificaciones/resumen"),
  ]);

  const otActivas = (ot?.data.por_estado["en_curso"] ?? 0) + (ot?.data.por_estado["planeada"] ?? 0) + (ot?.data.por_estado["pausada"] ?? 0);
  const otEnCurso = ot?.data.por_estado["en_curso"] ?? 0;
  const otAtrasadas = ot?.data.atrasadas ?? 0;
  const otUrgentes = ot?.data.urgentes_abiertas ?? 0;
  const expActivos = exp?.data.total_activos ?? 0;
  const expEstancados = exp?.data.total_estancados ?? 0;
  const garPorVencer = gar?.data.por_vencer_30d ?? 0;
  const garVencidas = gar?.data.vencidas_no_cerradas ?? 0;
  const reclamosAbiertos = gar?.data.reclamos_abiertos ?? 0;
  const notif48h = notif?.data.recientes_48h ?? 0;

  const necesitaAtencion = otAtrasadas + otUrgentes + expEstancados + garVencidas + reclamosAbiertos;
  const horaActual = new Date().toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });
  const fechaActual = new Date().toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long" });

  // ─── Módulos disponibles ───
  const modulos: ModuloCard[] = [
    {
      href: "/produccion", titulo: "Dashboard de planta",
      descripcion: "KPIs, semáforo, matriz comparativa, alertas en vivo",
      icono: <Gauge className="h-5 w-5" />,
      disponible: hasPerm(user, "ot", "read"),
      destacado: true,
      chip: otActivas > 0 ? { label: `${otActivas} OT activas`, tone: "indigo" } : undefined,
      accent: "indigo",
    },
    {
      href: "/expedientes", titulo: "Expedientes",
      descripcion: "Hoja de ruta del pedido con hitos y aprobaciones",
      icono: <FolderOpen className="h-5 w-5" />,
      disponible: hasPerm(user, "expedientes", "read"),
      chip: expActivos > 0 ? { label: `${expActivos} activos`, tone: "amber" } : undefined,
      accent: "amber",
    },
    {
      href: "/ot", titulo: "Órdenes de trabajo",
      descripcion: "Planificación y ejecución en planta con gates",
      icono: <Factory className="h-5 w-5" />,
      disponible: hasPerm(user, "ot", "read"),
      chip: otEnCurso > 0 ? { label: `${otEnCurso} en curso`, tone: "emerald" } : undefined,
      accent: "emerald",
    },
    {
      href: "/cotizaciones", titulo: "Cotizaciones",
      descripcion: "Gestión del flujo comercial",
      icono: <FileText className="h-5 w-5" />,
      disponible: hasPerm(user, "cotizaciones", "read"),
      accent: "slate",
    },
    {
      href: "/contratos", titulo: "Contratos",
      descripcion: "Contratos firmados y plan de pagos",
      icono: <FileSignature className="h-5 w-5" />,
      disponible: hasPerm(user, "contratos", "read"),
      accent: "slate",
    },
    {
      href: "/clientes", titulo: "Clientes",
      descripcion: "Cartera de clientes y contactos",
      icono: <Users className="h-5 w-5" />,
      disponible: hasPerm(user, "clientes", "read"),
      accent: "slate",
    },
    {
      href: "/inventario", titulo: "Bodega",
      descripcion: "Stock, lotes, kárdex, ubicaciones",
      icono: <Boxes className="h-5 w-5" />,
      disponible: hasPerm(user, "inventario", "read"),
      accent: "slate",
    },
    {
      href: "/transformadores", titulo: "Transformadores",
      descripcion: "Capacidad, tipo, serie y trazabilidad",
      icono: <Zap className="h-5 w-5" />,
      disponible: hasPerm(user, "ot", "read"),
      accent: "slate",
    },
    {
      href: "/garantias", titulo: "Garantías",
      descripcion: "Vigencias, reclamos e intervenciones",
      icono: <Shield className="h-5 w-5" />,
      disponible: hasPerm(user, "ot", "read"),
      chip: garPorVencer > 0 ? { label: `${garPorVencer} vencen 30d`, tone: "amber" } : undefined,
      accent: "sky",
    },
    {
      href: "/notificaciones", titulo: "Notificaciones",
      descripcion: "Alertas de estancamientos y aprobaciones",
      icono: <Bell className="h-5 w-5" />,
      disponible: true,
      chip: notif48h > 0 ? { label: `${notif48h} en 48h`, tone: "sky" } : undefined,
      accent: "slate",
    },
    {
      href: "/admin/usuarios", titulo: "Usuarios",
      descripcion: "Gestión de usuarios internos y clientes",
      icono: <Shield className="h-5 w-5" />,
      disponible: hasPerm(user, "admin", "usuarios"),
      accent: "slate",
    },
    {
      href: "/admin/roles", titulo: "Roles y permisos",
      descripcion: "Configuración de roles y matriz de permisos",
      icono: <Shield className="h-5 w-5" />,
      disponible: user.es_super_admin,
      accent: "slate",
    },
  ];

  const modulosDisponibles = modulos.filter((m) => m.disponible);
  const moduloPrincipal = modulosDisponibles.find((m) => m.destacado);
  const modulosSecundarios = modulosDisponibles.filter((m) => !m.destacado);

  // ─── Quick actions ───
  const quickActions: QuickAction[] = [
    { href: "/ot/nueva",          label: "Nueva OT",          icon: <Plus className="h-3.5 w-3.5" />, when: hasPerm(user, "ot", "create") },
    { href: "/cotizaciones/nueva",label: "Nueva cotización",  icon: <Plus className="h-3.5 w-3.5" />, when: hasPerm(user, "cotizaciones", "create") },
    { href: "/expedientes",       label: "Ver expedientes",   icon: <ClipboardList className="h-3.5 w-3.5" />, when: hasPerm(user, "expedientes", "read") },
    { href: "/clientes",          label: "Cartera de clientes", icon: <Users className="h-3.5 w-3.5" />, when: hasPerm(user, "clientes", "read") },
  ].filter((a) => a.when);

  // ─── Atención requerida ───
  const atencion: AtencionItem[] = [
    otAtrasadas > 0      && { tone: "rose",  icon: <AlertOctagon className="h-3.5 w-3.5" />, label: `${otAtrasadas} OT atrasada${otAtrasadas === 1 ? "" : "s"}`,        sub: "Fin planeado vencido", href: "/ot" },
    otUrgentes > 0       && { tone: "rose",  icon: <Zap className="h-3.5 w-3.5" />,           label: `${otUrgentes} OT urgente${otUrgentes === 1 ? "" : "s"} abierta${otUrgentes === 1 ? "" : "s"}`, sub: "Prioridad urgente", href: "/ot" },
    expEstancados > 0    && { tone: "amber", icon: <AlertTriangle className="h-3.5 w-3.5" />, label: `${expEstancados} expediente${expEstancados === 1 ? "" : "s"} estancado${expEstancados === 1 ? "" : "s"}`, sub: "Hito sin avance sobre SLA", href: "/expedientes" },
    garVencidas > 0      && { tone: "amber", icon: <Shield className="h-3.5 w-3.5" />,        label: `${garVencidas} garantía${garVencidas === 1 ? "" : "s"} vencida${garVencidas === 1 ? "" : "s"}`, sub: "Sin cerrar formalmente",  href: "/garantias" },
    reclamosAbiertos > 0 && { tone: "rose",  icon: <BellRing className="h-3.5 w-3.5" />,      label: `${reclamosAbiertos} reclamo${reclamosAbiertos === 1 ? "" : "s"} abierto${reclamosAbiertos === 1 ? "" : "s"}`, sub: "Posventa pendiente", href: "/garantias" },
    garPorVencer > 0     && { tone: "sky",   icon: <Truck className="h-3.5 w-3.5" />,         label: `${garPorVencer} garantía${garPorVencer === 1 ? "" : "s"} vence${garPorVencer === 1 ? "" : "n"} en 30 días`, sub: "Programar renovación", href: "/garantias" },
    notif48h > 0         && { tone: "slate", icon: <Bell className="h-3.5 w-3.5" />,          label: `${notif48h} notificación${notif48h === 1 ? "" : "es"} reciente${notif48h === 1 ? "" : "s"}`, sub: "Últimas 48 horas", href: "/notificaciones" },
  ].filter((x): x is AtencionItem => Boolean(x));

  return (
    <div className="-m-8 min-h-screen bg-slate-50/50">
      {/* ───── Header ───── */}
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/80 px-8 py-5 backdrop-blur-md">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-500">
              <span>Panel</span>
              <ChevronRight className="h-3 w-3" />
              <span>Inicio</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
                {saludo()}, {user.nombres.split(" ")[0]}
              </h1>
              {user.es_super_admin && (
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200">
                  <Sparkles className="h-3 w-3" /> Super admin
                </span>
              )}
            </div>
            <p className="mt-1 text-sm capitalize text-slate-500">
              {fechaActual} · {horaActual} · <span className="text-slate-600">{user.rol_nombre ?? "sin rol"}</span>
            </p>
          </div>
          {quickActions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {quickActions.map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                >
                  {a.icon} {a.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="space-y-6 p-8">
        {/* ───── Snapshot bar (6 KPIs en línea) ───── */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Snapshot
            label="OT activas"
            value={otActivas}
            sub={`${otEnCurso} en curso`}
            icon={<Factory className="h-4 w-4" />}
            tone="indigo"
            href="/ot"
          />
          <Snapshot
            label="OT atrasadas"
            value={otAtrasadas}
            sub={otAtrasadas > 0 ? "Acción requerida" : "Sin atrasos"}
            icon={<AlertOctagon className="h-4 w-4" />}
            tone={otAtrasadas > 0 ? "rose" : "slate"}
            href="/ot"
          />
          <Snapshot
            label="Expedientes activos"
            value={expActivos}
            sub={expEstancados > 0 ? `${expEstancados} estancado${expEstancados === 1 ? "" : "s"}` : "Todo en flujo"}
            icon={<Flag className="h-4 w-4" />}
            tone={expEstancados > 0 ? "amber" : "slate"}
            href="/expedientes"
          />
          <Snapshot
            label="Garantías vigentes"
            value={gar?.data.vigentes ?? 0}
            sub={garPorVencer > 0 ? `${garPorVencer} por vencer 30d` : "Sin vencimientos"}
            icon={<Shield className="h-4 w-4" />}
            tone={garPorVencer > 0 ? "sky" : "slate"}
            href="/garantias"
          />
          <Snapshot
            label="Reclamos"
            value={reclamosAbiertos}
            sub={reclamosAbiertos > 0 ? "Posventa pendiente" : "Sin reclamos"}
            icon={<BellRing className="h-4 w-4" />}
            tone={reclamosAbiertos > 0 ? "rose" : "slate"}
            href="/garantias"
          />
          <Snapshot
            label="Notif. 48h"
            value={notif48h}
            sub={notif48h > 0 ? "Revisá tu bandeja" : "Bandeja al día"}
            icon={<Bell className="h-4 w-4" />}
            tone={notif48h > 0 ? "sky" : "slate"}
            href="/notificaciones"
          />
        </section>

        {/* ───── Módulo destacado + Atención requerida ───── */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Módulo destacado (col-span 2) */}
          {moduloPrincipal && (
            <Link
              href={moduloPrincipal.href}
              className="group relative col-span-1 overflow-hidden rounded-lg border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-white p-6 shadow-sm transition hover:border-indigo-300 hover:shadow-md lg:col-span-2"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 to-violet-500" />
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200">
                    {moduloPrincipal.icono}
                  </div>
                  <div>
                    <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-700">
                      <Sparkles className="h-2.5 w-2.5" /> Recomendado
                    </div>
                    <h3 className="text-xl font-semibold text-slate-900">{moduloPrincipal.titulo}</h3>
                    <p className="mt-1 max-w-md text-sm text-slate-600">{moduloPrincipal.descripcion}</p>
                  </div>
                </div>
                <ArrowUpRight className="h-5 w-5 text-indigo-300 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-indigo-600" />
              </div>
              <div className="mt-5 grid grid-cols-3 gap-4 border-t border-indigo-100 pt-4">
                <MiniStat label="OT activas" value={otActivas} />
                <MiniStat label="En curso" value={otEnCurso} tone="emerald" />
                <MiniStat label="Atrasadas" value={otAtrasadas} tone={otAtrasadas > 0 ? "rose" : "slate"} />
              </div>
            </Link>
          )}

          {/* Atención requerida */}
          <Panel
            title="Atención requerida"
            subtitle={necesitaAtencion === 0 && atencion.length === 0 ? "Todo bajo control" : `${atencion.length} ítems`}
            icon={<AlertTriangle className="h-4 w-4" />}
            action={necesitaAtencion > 0 && (
              <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-rose-700 ring-1 ring-rose-200">
                {necesitaAtencion}
              </span>
            )}
          >
            {atencion.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-emerald-200 bg-emerald-50/30 py-6">
                <CheckCircle2 className="mb-1.5 h-5 w-5 text-emerald-500" />
                <p className="text-xs text-emerald-700">Sin pendientes que requieran tu atención</p>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {atencion.map((a, i) => {
                  const cfg = {
                    rose:  { dot: "bg-rose-500",  text: "text-rose-700",  border: "border-l-rose-500",  bg: "bg-rose-50/50"  },
                    amber: { dot: "bg-amber-500", text: "text-amber-700", border: "border-l-amber-500", bg: "bg-amber-50/50" },
                    sky:   { dot: "bg-sky-500",   text: "text-sky-700",   border: "border-l-sky-500",   bg: "bg-sky-50/50"   },
                    slate: { dot: "bg-slate-400", text: "text-slate-700", border: "border-l-slate-400", bg: "bg-slate-50/50" },
                  }[a.tone];
                  return (
                    <li key={i}>
                      <Link
                        href={a.href}
                        className={`group flex items-start gap-2 rounded-md border-l-2 ${cfg.border} ${cfg.bg} px-3 py-2 transition hover:brightness-95`}
                      >
                        <span className={`mt-0.5 ${cfg.text}`}>{a.icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium leading-snug text-slate-800">{a.label}</p>
                          <p className="text-[10px] leading-tight text-slate-500">{a.sub}</p>
                        </div>
                        <ArrowUpRight className="h-3 w-3 shrink-0 self-center text-slate-300 group-hover:text-slate-600" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </section>

        {/* ───── Módulos secundarios ───── */}
        <Panel
          title="Tus módulos"
          subtitle={`${modulosSecundarios.length} accesos disponibles según tu rol`}
          icon={<LayoutDashboard className="h-4 w-4" />}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {modulosSecundarios.map((m) => <ModuloTile key={m.href} {...m} />)}
          </div>
        </Panel>

        {/* ───── Roadmap + Estado del sistema ───── */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel
            title="Roadmap del proyecto"
            subtitle="Progreso de las fases del producto"
            icon={<Activity className="h-4 w-4" />}
            className="lg:col-span-2"
          >
            <ul className="space-y-2.5">
              <RoadmapItem state="done"     label="FASE 4.A–4.D — expedientes, OT, notificaciones email vía Synology" />
              <RoadmapItem state="done"     label="FASE 4.5 — Órdenes de trabajo con pipeline de pasos y gates" />
              <RoadmapItem state="done"     label="Dashboard producción (fase A) ejecutivo — disponible en /produccion" />
              <RoadmapItem state="upcoming" label="Migration 012 — transformadores como entidad (capacidad/tipo/serie)" />
              <RoadmapItem state="upcoming" label="Migration 013 — áreas, causas de demora, tiempos de trabajo" />
              <RoadmapItem state="upcoming" label="Vista cliente externa (portal.techtrafo.com en FASE 5)" />
            </ul>
          </Panel>

          <Panel
            title="Estado del sistema"
            subtitle="Servicios operativos"
            icon={<Activity className="h-4 w-4" />}
          >
            <ul className="space-y-2">
              <SysStatus label="API panel.techtrafo" ok />
              <SysStatus label="Base de datos PostgreSQL" ok />
              <SysStatus label="Notificaciones email (Synology)" ok />
              <SysStatus label="Cron de hitos estancados" ok />
            </ul>
            <p className="mt-4 border-t border-slate-100 pt-3 text-[10px] text-slate-400">
              Sesión iniciada como <span className="font-mono text-slate-600">{user.email}</span>
            </p>
          </Panel>
        </section>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tipos auxiliares
// ═══════════════════════════════════════════════════════════════
type Tone = "indigo" | "emerald" | "rose" | "amber" | "sky" | "slate";

interface ModuloCard {
  href: string;
  titulo: string;
  descripcion: string;
  icono: React.ReactNode;
  disponible: boolean;
  destacado?: boolean;
  chip?: { label: string; tone: Tone };
  accent: Tone;
}
interface QuickAction { href: string; label: string; icon: React.ReactNode; when: boolean }
interface AtencionItem { tone: "rose" | "amber" | "sky" | "slate"; icon: React.ReactNode; label: string; sub: string; href: string }

// ═══════════════════════════════════════════════════════════════
// Componentes auxiliares
// ═══════════════════════════════════════════════════════════════

function Panel({
  title, subtitle, icon, action, children, className,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            {icon && <span className="text-slate-400">{icon}</span>}
            {title}
          </h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Snapshot({
  label, value, sub, icon, tone, href,
}: {
  label: string;
  value: number;
  sub: string;
  icon: React.ReactNode;
  tone: Tone;
  href?: string;
}) {
  const cfg = {
    indigo:  { iconBg: "bg-indigo-50 text-indigo-600 ring-indigo-100",   accent: "bg-indigo-500"  },
    emerald: { iconBg: "bg-emerald-50 text-emerald-600 ring-emerald-100", accent: "bg-emerald-500" },
    rose:    { iconBg: "bg-rose-50 text-rose-600 ring-rose-100",         accent: "bg-rose-500"    },
    amber:   { iconBg: "bg-amber-50 text-amber-600 ring-amber-100",      accent: "bg-amber-500"   },
    sky:     { iconBg: "bg-sky-50 text-sky-600 ring-sky-100",            accent: "bg-sky-500"     },
    slate:   { iconBg: "bg-slate-100 text-slate-500 ring-slate-200",     accent: "bg-slate-300"   },
  }[tone];

  const inner = (
    <div className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm transition-all hover:border-slate-300 hover:shadow-md">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${cfg.accent}`} />
      <div className="mb-2 flex items-start justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</span>
        <div className={`flex h-6 w-6 items-center justify-center rounded-md ring-1 ${cfg.iconBg}`}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-semibold tabular-nums tracking-tight text-slate-900">{value}</p>
      <p className="mt-0.5 text-[10px] leading-tight text-slate-500">{sub}</p>
    </div>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}

function MiniStat({ label, value, tone = "indigo" }: { label: string; value: number; tone?: "indigo" | "emerald" | "rose" | "slate" }) {
  const txt = { indigo: "text-indigo-900", emerald: "text-emerald-700", rose: "text-rose-700", slate: "text-slate-700" }[tone];
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold tabular-nums ${txt}`}>{value}</p>
    </div>
  );
}

function ModuloTile({ href, titulo, descripcion, icono, chip, accent }: ModuloCard) {
  const cfg = {
    indigo:  { iconBg: "bg-indigo-50 text-indigo-600 ring-indigo-100"   },
    emerald: { iconBg: "bg-emerald-50 text-emerald-600 ring-emerald-100" },
    rose:    { iconBg: "bg-rose-50 text-rose-600 ring-rose-100"         },
    amber:   { iconBg: "bg-amber-50 text-amber-600 ring-amber-100"      },
    sky:     { iconBg: "bg-sky-50 text-sky-600 ring-sky-100"            },
    slate:   { iconBg: "bg-slate-100 text-slate-500 ring-slate-200"     },
  }[accent];

  const chipCfg = chip && {
    indigo:  "bg-indigo-50 text-indigo-700 ring-indigo-200",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    rose:    "bg-rose-50 text-rose-700 ring-rose-200",
    amber:   "bg-amber-50 text-amber-700 ring-amber-200",
    sky:     "bg-sky-50 text-sky-700 ring-sky-200",
    slate:   "bg-slate-100 text-slate-700 ring-slate-200",
  }[chip.tone];

  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3.5 transition-all hover:border-slate-300 hover:bg-slate-50/40 hover:shadow-sm"
    >
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ring-1 ${cfg.iconBg}`}>
        {icono}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-slate-900 group-hover:text-indigo-700">{titulo}</p>
          {chip && (
            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ${chipCfg}`}>
              {chip.label}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-500 line-clamp-2">{descripcion}</p>
      </div>
      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 self-center text-slate-300 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-slate-700" />
    </Link>
  );
}

function RoadmapItem({ state, label }: { state: "done" | "upcoming"; label: string }) {
  const cfg = state === "done"
    ? { icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />, badge: "bg-emerald-50 text-emerald-700 ring-emerald-200", labelTxt: "Completado", text: "text-slate-700" }
    : { icon: <Clock className="h-3.5 w-3.5 text-slate-400" />,         badge: "bg-slate-100 text-slate-600 ring-slate-200",     labelTxt: "Próximo",    text: "text-slate-500" };
  return (
    <li className="flex items-center gap-3 rounded-md border border-slate-100 bg-slate-50/40 px-3 py-2">
      {cfg.icon}
      <span className={`flex-1 text-xs ${cfg.text}`}>{label}</span>
      <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider ring-1 ${cfg.badge}`}>
        {cfg.labelTxt}
      </span>
    </li>
  );
}

function SysStatus({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li className="flex items-center justify-between rounded-md bg-slate-50/50 px-3 py-2">
      <span className="text-xs text-slate-700">{label}</span>
      <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium ${ok ? "text-emerald-700" : "text-rose-700"}`}>
        <span className="relative flex h-1.5 w-1.5">
          {ok && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
          <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-rose-500"}`} />
        </span>
        {ok ? "Operativo" : "Caído"}
      </span>
    </li>
  );
}

