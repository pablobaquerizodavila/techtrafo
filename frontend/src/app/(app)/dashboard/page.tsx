import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity, AlertOctagon, AlertTriangle, ArrowUpRight, Bell, BellRing,
  Boxes, CheckCircle2, Clock, FileSignature, FileText,
  Factory, Flag, FolderOpen, Gauge, LayoutDashboard, Plus, Shield, Sparkles,
  Truck, Users, Zap,
} from "lucide-react";
import { SessionExpiredButton } from "../session-expired-button";
import { LiveTime, LiveDate } from "@/components/live-datetime";
import { SystemHealthCard } from "@/components/system-health-card";

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
  // Server Component: el contenedor corre en UTC. Forzamos la hora de Ecuador
  // (America/Guayaquil, UTC-5 sin DST) para que el saludo siempre coincida
  // con la hora local del usuario.
  const h = Number(new Intl.DateTimeFormat("es-EC", {
    hour: "numeric",
    hour12: false,
    timeZone: "America/Guayaquil",
  }).format(new Date()));
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
      <div className="-m-8 min-h-screen p-8">
        <div className="mx-auto max-w-2xl rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-8 inset-highlight">
          <div className="mb-3 flex items-center gap-2 text-amber-300">
            <AlertTriangle className="h-5 w-5" />
            <h2 className="font-display text-lg font-semibold">Tu sesión expiró o no es válida</h2>
          </div>
          <p className="mb-5 text-sm text-amber-100/80">
            No pudimos cargar tu usuario desde el servidor. Esto suele pasar después de 8 horas de
            inactividad o si el token JWT cambió en el backend. Cerrá sesión y volvé a entrar.
          </p>
          <SessionExpiredButton />
        </div>
      </div>
    );
  }

  // Paraleliza resúmenes — fail-soft
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
  // Hora y fecha se renderizan client-side (zona horaria del usuario) — ver <LiveTime/> y <LiveDate/>.

  const modulos: ModuloCard[] = [
    { href: "/produccion", titulo: "Dashboard de planta",
      descripcion: "KPIs, semáforo, matriz comparativa, alertas en vivo",
      icono: <Gauge className="h-5 w-5" />, disponible: hasPerm(user, "ot", "read"),
      destacado: true,
      chip: otActivas > 0 ? { label: `${otActivas} OT activas`, tone: "copper" } : undefined },
    { href: "/expedientes", titulo: "Expedientes",
      descripcion: "Hoja de ruta del pedido con hitos y aprobaciones",
      icono: <FolderOpen className="h-5 w-5" />, disponible: hasPerm(user, "expedientes", "read"),
      chip: expActivos > 0 ? { label: `${expActivos} activos`, tone: "amber" } : undefined },
    { href: "/ot", titulo: "Órdenes de trabajo",
      descripcion: "Planificación y ejecución en planta con gates",
      icono: <Factory className="h-5 w-5" />, disponible: hasPerm(user, "ot", "read"),
      chip: otEnCurso > 0 ? { label: `${otEnCurso} en curso`, tone: "teal" } : undefined },
    { href: "/cotizaciones", titulo: "Cotizaciones",
      descripcion: "Gestión del flujo comercial",
      icono: <FileText className="h-5 w-5" />, disponible: hasPerm(user, "cotizaciones", "read") },
    { href: "/contratos", titulo: "Contratos",
      descripcion: "Contratos firmados y plan de pagos",
      icono: <FileSignature className="h-5 w-5" />, disponible: hasPerm(user, "contratos", "read") },
    { href: "/clientes", titulo: "Clientes",
      descripcion: "Cartera de clientes y contactos",
      icono: <Users className="h-5 w-5" />, disponible: hasPerm(user, "clientes", "read") },
    { href: "/inventario", titulo: "Bodega",
      descripcion: "Stock, lotes, kárdex, ubicaciones",
      icono: <Boxes className="h-5 w-5" />, disponible: hasPerm(user, "inventario", "read") },
    { href: "/transformadores", titulo: "Transformadores",
      descripcion: "Capacidad, tipo, serie y trazabilidad",
      icono: <Zap className="h-5 w-5" />, disponible: hasPerm(user, "ot", "read") },
    { href: "/garantias", titulo: "Garantías",
      descripcion: "Vigencias, reclamos e intervenciones",
      icono: <Shield className="h-5 w-5" />, disponible: hasPerm(user, "ot", "read"),
      chip: garPorVencer > 0 ? { label: `${garPorVencer} vencen 30d`, tone: "amber" } : undefined },
    { href: "/notificaciones", titulo: "Notificaciones",
      descripcion: "Alertas de estancamientos y aprobaciones",
      icono: <Bell className="h-5 w-5" />, disponible: true,
      chip: notif48h > 0 ? { label: `${notif48h} en 48h`, tone: "teal" } : undefined },
    { href: "/admin/usuarios", titulo: "Usuarios",
      descripcion: "Gestión de usuarios internos y clientes",
      icono: <Shield className="h-5 w-5" />, disponible: hasPerm(user, "admin", "usuarios") },
    { href: "/admin/roles", titulo: "Roles y permisos",
      descripcion: "Configuración de roles y matriz de permisos",
      icono: <Shield className="h-5 w-5" />, disponible: user.es_super_admin },
  ];

  const modulosDisponibles = modulos.filter((m) => m.disponible);
  const moduloPrincipal = modulosDisponibles.find((m) => m.destacado);
  const modulosSecundarios = modulosDisponibles.filter((m) => !m.destacado);

  const quickActions: QuickAction[] = [
    { href: "/ot/nueva",          label: "Nueva OT",          icon: <Plus className="h-3.5 w-3.5" />, when: hasPerm(user, "ot", "create") },
    { href: "/cotizaciones/nueva",label: "Nueva cotización",  icon: <Plus className="h-3.5 w-3.5" />, when: hasPerm(user, "cotizaciones", "create") },
    { href: "/expedientes",       label: "Ver expedientes",   icon: <FolderOpen className="h-3.5 w-3.5" />, when: hasPerm(user, "expedientes", "read") },
  ].filter((a) => a.when);

  const atencion: AtencionItem[] = [
    otAtrasadas > 0      && { tone: "rose",  icon: <AlertOctagon className="h-3.5 w-3.5" />, label: `${otAtrasadas} OT atrasada${otAtrasadas === 1 ? "" : "s"}`,        sub: "Fin planeado vencido", href: "/ot" },
    otUrgentes > 0       && { tone: "rose",  icon: <Zap className="h-3.5 w-3.5" />,           label: `${otUrgentes} OT urgente${otUrgentes === 1 ? "" : "s"} abierta${otUrgentes === 1 ? "" : "s"}`, sub: "Prioridad urgente", href: "/ot" },
    expEstancados > 0    && { tone: "amber", icon: <AlertTriangle className="h-3.5 w-3.5" />, label: `${expEstancados} expediente${expEstancados === 1 ? "" : "s"} estancado${expEstancados === 1 ? "" : "s"}`, sub: "Hito sin avance sobre SLA", href: "/expedientes" },
    garVencidas > 0      && { tone: "amber", icon: <Shield className="h-3.5 w-3.5" />,        label: `${garVencidas} garantía${garVencidas === 1 ? "" : "s"} vencida${garVencidas === 1 ? "" : "s"}`, sub: "Sin cerrar formalmente",  href: "/garantias" },
    reclamosAbiertos > 0 && { tone: "rose",  icon: <BellRing className="h-3.5 w-3.5" />,      label: `${reclamosAbiertos} reclamo${reclamosAbiertos === 1 ? "" : "s"} abierto${reclamosAbiertos === 1 ? "" : "s"}`, sub: "Posventa pendiente", href: "/garantias" },
    garPorVencer > 0     && { tone: "teal",  icon: <Truck className="h-3.5 w-3.5" />,         label: `${garPorVencer} garantía${garPorVencer === 1 ? "" : "s"} vence${garPorVencer === 1 ? "" : "n"} en 30 días`, sub: "Programar renovación", href: "/garantias" },
    notif48h > 0         && { tone: "muted", icon: <Bell className="h-3.5 w-3.5" />,          label: `${notif48h} notificación${notif48h === 1 ? "" : "es"} reciente${notif48h === 1 ? "" : "s"}`, sub: "Últimas 48 horas", href: "/notificaciones" },
  ].filter((x): x is AtencionItem => Boolean(x));

  return (
    <div className="-m-8">
      {/* ───── Header ───── */}
      <header className="sticky top-0 z-20 border-b border-glass bg-background/70 px-8 py-5 backdrop-blur-xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-glass bg-glass px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <span className="led-copper inline-block" />
              Panel · Inicio
            </div>
            <h1 className="font-display text-4xl font-semibold tracking-tight">
              <span className="bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-transparent">
                {saludo()},{" "}
              </span>
              <span className="bg-gradient-to-br from-copper to-copper-soft bg-clip-text italic text-transparent">
                {user.nombres.split(" ")[0]}
              </span>
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/25 bg-green-500/[0.08] px-2.5 py-1 text-green-400">
                <span className="led-green" />
                Live · <LiveTime />
              </span>
              <span className="text-muted-foreground/40">·</span>
              <LiveDate />
              <span className="text-muted-foreground/40">·</span>
              <span>
                {user.rol_nombre ?? "sin rol"}
                {user.es_super_admin && (
                  <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-copper/15 px-2 py-0.5 text-[10px] font-medium uppercase text-copper">
                    <Sparkles className="h-2.5 w-2.5" /> Admin
                  </span>
                )}
              </span>
            </div>
          </div>
          {quickActions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {quickActions.map((a, i) => (
                <Link
                  key={a.href}
                  href={a.href}
                  className={i === 0
                    ? "inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-3.5 py-2 text-xs font-medium text-white shadow-sm glow-copper-sm inset-highlight-md transition-shadow hover:glow-copper"
                    : "inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-3 py-2 text-xs font-medium text-foreground/90 backdrop-blur transition hover:border-glass-strong hover:bg-glass-elev"}
                >
                  {a.icon} {a.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="space-y-6 p-8">
        {/* ───── Snapshot KPIs (6 cols) ───── */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Snapshot label="OT activas" value={otActivas}
            sub={`${otEnCurso} en curso`}
            icon={<Factory className="h-3.5 w-3.5" />} tone="copper" href="/ot" />
          <Snapshot label="OT atrasadas" value={otAtrasadas}
            sub={otAtrasadas > 0 ? "Acción requerida" : "Sin atrasos"}
            icon={<AlertOctagon className="h-3.5 w-3.5" />}
            tone={otAtrasadas > 0 ? "rose" : "muted"} href="/ot" />
          <Snapshot label="Expedientes" value={expActivos}
            sub={expEstancados > 0 ? `${expEstancados} estancado${expEstancados === 1 ? "" : "s"}` : "Todo en flujo"}
            icon={<Flag className="h-3.5 w-3.5" />}
            tone={expEstancados > 0 ? "amber" : "muted"} href="/expedientes" />
          <Snapshot label="Garantías" value={gar?.data.vigentes ?? 0}
            sub={garPorVencer > 0 ? `${garPorVencer} por vencer 30d` : "Sin vencimientos"}
            icon={<Shield className="h-3.5 w-3.5" />}
            tone={garPorVencer > 0 ? "teal" : "muted"} href="/garantias" />
          <Snapshot label="Reclamos" value={reclamosAbiertos}
            sub={reclamosAbiertos > 0 ? "Posventa pendiente" : "Sin reclamos"}
            icon={<BellRing className="h-3.5 w-3.5" />}
            tone={reclamosAbiertos > 0 ? "rose" : "muted"} href="/garantias" />
          <Snapshot label="Notif. 48h" value={notif48h}
            sub={notif48h > 0 ? "Revisá tu bandeja" : "Bandeja al día"}
            icon={<Bell className="h-3.5 w-3.5" />}
            tone={notif48h > 0 ? "teal" : "muted"} href="/notificaciones" />
        </section>

        {/* ───── Hero card + Atención requerida ───── */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {moduloPrincipal && (
            <Link
              href={moduloPrincipal.href}
              className="group relative col-span-1 overflow-hidden rounded-xl border border-glass-mid bg-glass p-6 inset-highlight transition hover:border-glass-strong hover:bg-glass-elev lg:col-span-2"
              style={{ backgroundImage: "radial-gradient(ellipse 70% 100% at 0% 100%, rgba(255,107,53,0.10), transparent 50%), radial-gradient(ellipse 70% 100% at 100% 0%, rgba(79,209,197,0.06), transparent 50%)" }}
            >
              <div className="absolute inset-x-[30%] top-0 h-px bg-gradient-to-r from-transparent via-copper to-transparent" />
              <div className="grid grid-cols-1 gap-6 md:grid-cols-[1.6fr,1fr]">
                <div>
                  <div className="flex items-center gap-4">
                    <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-copper to-copper-deep text-white shadow-lg glow-copper inset-highlight-md">
                      {moduloPrincipal.icono}
                    </div>
                    <div>
                      <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-copper/30 bg-copper/10 px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-copper">
                        <Sparkles className="h-2.5 w-2.5" /> Recomendado
                      </div>
                      <h3 className="font-display text-2xl font-semibold tracking-tight">{moduloPrincipal.titulo}</h3>
                    </div>
                  </div>
                  <p className="mt-3 max-w-md text-sm text-muted-foreground">{moduloPrincipal.descripcion}</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-copper transition-transform group-hover:translate-x-0.5">
                    Abrir dashboard <ArrowUpRight className="h-3 w-3" />
                  </span>
                </div>
                <div className="flex flex-col gap-3">
                  <HeroStat label="OT activas" value={otActivas} />
                  <HeroStat label="En curso" value={otEnCurso} tone="green" />
                  <HeroStat label="Atrasadas" value={otAtrasadas} tone={otAtrasadas > 0 ? "rose" : "muted"} />
                </div>
              </div>
            </Link>
          )}

          {/* Atención requerida */}
          <Panel
            title="Atención requerida"
            subtitle={atencion.length === 0 ? "Todo bajo control" : `${atencion.length} ítems`}
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
            action={necesitaAtencion > 0 && (
              <span className="inline-flex items-center rounded-full border border-rose-500/30 bg-rose-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-rose-300 num">
                {necesitaAtencion}
              </span>
            )}
          >
            {atencion.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-green-500/30 bg-green-500/[0.04] py-6">
                <CheckCircle2 className="mb-1.5 h-5 w-5 text-green-400" />
                <p className="text-xs text-green-300">Sin pendientes que requieran tu atención</p>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {atencion.map((a, i) => {
                  const cfg = {
                    rose:  { dot: "bg-rose-400 glow-rose",   border: "border-l-rose-500",   text: "text-rose-300",   icon: "text-rose-400"  },
                    amber: { dot: "bg-amber-400",            border: "border-l-amber-500",  text: "text-amber-300",  icon: "text-amber-400" },
                    teal:  { dot: "bg-ttteal glow-teal-sm",  border: "border-l-ttteal",     text: "text-ttteal-soft",icon: "text-ttteal"    },
                    muted: { dot: "bg-muted-foreground",     border: "border-l-muted-foreground/50", text: "text-muted-foreground", icon: "text-muted-foreground" },
                  }[a.tone];
                  return (
                    <li key={i}>
                      <Link
                        href={a.href}
                        className={`group flex items-start gap-2 rounded-lg border border-glass bg-glass px-3 py-2 transition hover:border-glass-mid hover:bg-glass-elev`}
                      >
                        <span className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${cfg.dot}`} />
                        <span className={`mt-0.5 ${cfg.icon}`}>{a.icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium leading-snug text-foreground/95">{a.label}</p>
                          <p className="font-mono text-[10px] leading-tight text-muted-foreground">{a.sub}</p>
                        </div>
                        <ArrowUpRight className="h-3 w-3 shrink-0 self-center text-muted-foreground/40 transition group-hover:text-copper" />
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
          subtitle={`${modulosSecundarios.length} accesos según tu rol`}
          icon={<LayoutDashboard className="h-3.5 w-3.5" />}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {modulosSecundarios.map((m) => <ModuloTile key={m.href} {...m} />)}
          </div>
        </Panel>

        {/* ───── Roadmap + Estado sistema ───── */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel
            title="Roadmap del proyecto"
            subtitle="Progreso de las fases del producto"
            icon={<Activity className="h-3.5 w-3.5" />}
            className="lg:col-span-2"
          >
            <ul className="space-y-2">
              <RoadmapItem state="done"     label="FASE 4.A–4.D — expedientes, OT, notificaciones email vía Synology" />
              <RoadmapItem state="done"     label="FASE 4.5 — Órdenes de trabajo con pipeline de pasos y gates" />
              <RoadmapItem state="done"     label="Dashboard producción ejecutivo — disponible en /produccion" />
              <RoadmapItem state="done"     label="Voltage OS — identidad visual del panel" />
              <RoadmapItem state="upcoming" label="Migration 012 — transformadores como entidad (capacidad/tipo/serie)" />
              <RoadmapItem state="upcoming" label="Migration 013 — áreas, causas de demora, tiempos de trabajo" />
              <RoadmapItem state="upcoming" label="Vista cliente externa (portal.techtrafo.com en FASE 5)" />
            </ul>
          </Panel>

          <SystemHealthCard />
        </section>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Tipos auxiliares
// ═══════════════════════════════════════════════════════════════
type Tone = "copper" | "teal" | "rose" | "amber" | "muted";

interface ModuloCard {
  href: string;
  titulo: string;
  descripcion: string;
  icono: React.ReactNode;
  disponible: boolean;
  destacado?: boolean;
  chip?: { label: string; tone: Tone };
}
interface QuickAction { href: string; label: string; icon: React.ReactNode; when: boolean }
interface AtencionItem { tone: "rose" | "amber" | "teal" | "muted"; icon: React.ReactNode; label: string; sub: string; href: string }

// ═══════════════════════════════════════════════════════════════
// Componentes
// ═══════════════════════════════════════════════════════════════

function Panel({
  title, subtitle, icon, action, children, className,
}: {
  title: string; subtitle?: string; icon?: React.ReactNode;
  action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-xl border border-glass bg-glass inset-highlight ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-3 border-b border-glass px-5 py-3.5">
        <div>
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold tracking-tight">
            {icon && <span className="text-copper">{icon}</span>}
            {title}
          </h3>
          {subtitle && <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{subtitle}</p>}
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
  label: string; value: number; sub: string;
  icon: React.ReactNode; tone: Tone; href?: string;
}) {
  const cfg = {
    copper: { wash: "from-copper/[0.08] to-transparent border-copper/25",   icon: "text-copper",       val: "text-copper text-glow-copper" },
    teal:   { wash: "from-ttteal/[0.06] to-transparent border-ttteal/20",   icon: "text-ttteal",       val: "text-ttteal text-glow-teal" },
    rose:   { wash: "from-rose-500/[0.08] to-transparent border-rose-500/25", icon: "text-rose-400",   val: "text-rose-400 text-glow-rose" },
    amber:  { wash: "from-amber-500/[0.06] to-transparent border-amber-500/22", icon: "text-amber-400",val: "text-amber-300" },
    muted:  { wash: "from-transparent to-transparent border-glass",         icon: "text-muted-foreground", val: "text-foreground" },
  }[tone];

  const inner = (
    <div className={`group relative overflow-hidden rounded-xl border bg-gradient-to-b bg-glass p-3.5 inset-highlight transition-all hover:bg-glass-elev hover:-translate-y-px ${cfg.wash}`}>
      <div className="mb-2 flex items-start justify-between">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.15em] text-muted-foreground">{label}</span>
        <div className={`grid h-6 w-6 place-items-center rounded-md border border-glass bg-glass-elev ${cfg.icon}`}>
          {icon}
        </div>
      </div>
      <p className={`font-display text-3xl font-semibold tracking-tight num ${cfg.val}`}>{value}</p>
      <p className="mt-1 font-mono text-[10px] leading-tight text-muted-foreground">{sub}</p>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function HeroStat({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "green" | "rose" | "muted" }) {
  const txt = { default: "text-foreground", green: "text-green-400", rose: "text-rose-400", muted: "text-muted-foreground" }[tone];
  return (
    <div className="flex items-center justify-between rounded-lg border border-glass bg-glass px-4 py-3 inset-highlight">
      <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{label}</span>
      <span className={`font-display text-2xl font-semibold tracking-tight num ${txt}`}>{value}</span>
    </div>
  );
}

function ModuloTile({ href, titulo, descripcion, icono, chip }: ModuloCard) {
  const chipCfg = chip && {
    copper: "border-copper/30 bg-copper/10 text-copper",
    teal:   "border-ttteal/30 bg-ttteal/10 text-ttteal",
    rose:   "border-rose-500/30 bg-rose-500/10 text-rose-300",
    amber:  "border-amber-500/30 bg-amber-500/10 text-amber-300",
    muted:  "border-glass bg-glass text-muted-foreground",
  }[chip.tone];

  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-xl border border-glass bg-glass p-3.5 inset-highlight transition-all hover:-translate-y-px hover:border-glass-mid hover:bg-glass-elev"
    >
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-glass bg-glass-elev text-muted-foreground transition-colors group-hover:text-copper">
        {icono}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{titulo}</p>
          {chip && (
            <span className={`shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[9.5px] font-medium ${chipCfg}`}>
              {chip.label}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground line-clamp-2">{descripcion}</p>
      </div>
      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 self-center text-muted-foreground/40 transition group-hover:text-copper" />
    </Link>
  );
}

function RoadmapItem({ state, label }: { state: "done" | "upcoming"; label: string }) {
  const cfg = state === "done"
    ? { icon: <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />, badge: "border-green-500/30 bg-green-500/10 text-green-300", labelTxt: "Hecho",  text: "text-foreground/90" }
    : { icon: <Clock className="h-3.5 w-3.5 text-muted-foreground" />, badge: "border-glass bg-glass text-muted-foreground",        labelTxt: "Próximo", text: "text-muted-foreground" };
  return (
    <li className="flex items-center gap-3 rounded-lg border border-glass bg-glass px-3 py-2">
      {cfg.icon}
      <span className={`flex-1 text-xs ${cfg.text}`}>{label}</span>
      <span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${cfg.badge}`}>
        {cfg.labelTxt}
      </span>
    </li>
  );
}

function SysStatus({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li className="flex items-center justify-between rounded-lg border border-glass bg-glass px-3 py-2">
      <span className="text-xs text-foreground/85">{label}</span>
      <span className={`inline-flex items-center gap-1.5 font-mono text-[10px] font-medium ${ok ? "text-green-400" : "text-rose-400"}`}>
        {ok && <span className="led-green" />}
        {ok ? "Operativo" : "Caído"}
      </span>
    </li>
  );
}
