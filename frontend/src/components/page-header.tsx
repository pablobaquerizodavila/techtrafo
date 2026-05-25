import Link from "next/link";
import { ChevronRight } from "lucide-react";

/**
 * Header sticky en lenguaje Voltage OS.
 * Replica el patrón de dashboard/produccion para usar en todas las páginas.
 */
export function PageHeader({
  breadcrumb,
  title,
  titleAccent,
  meta,
  actions,
  liveIndicator,
}: {
  breadcrumb: { href?: string; label: string }[];
  title: string;
  titleAccent?: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  liveIndicator?: { label: string; tone?: "green" | "copper" };
}) {
  return (
    <header className="sticky top-0 z-20 -mx-8 -mt-8 border-b border-glass bg-background/70 px-8 py-5 backdrop-blur-xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {/* Breadcrumb pill */}
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-glass bg-glass px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {liveIndicator && (
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  liveIndicator.tone === "copper" ? "bg-copper glow-copper-sm" : "bg-green-500 glow-green"
                }`}
              />
            )}
            {breadcrumb.map((b, i) => (
              <span key={i} className="flex items-center gap-2">
                {b.href ? (
                  <Link href={b.href} className="text-muted-foreground hover:text-foreground">
                    {b.label}
                  </Link>
                ) : (
                  <span className={i === breadcrumb.length - 1 ? "text-foreground" : "text-muted-foreground"}>
                    {b.label}
                  </span>
                )}
                {i < breadcrumb.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground/50" />}
              </span>
            ))}
          </div>

          {/* Gradient title */}
          <h1 className="font-display text-4xl font-semibold tracking-tight">
            <span className="bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-transparent">
              {title}
              {titleAccent && " "}
            </span>
            {titleAccent && (
              <span className="bg-gradient-to-br from-copper to-copper-soft bg-clip-text italic text-transparent">
                {titleAccent}
              </span>
            )}
          </h1>

          {/* Meta */}
          {meta && (
            <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[11px] text-muted-foreground">
              {meta}
            </div>
          )}
        </div>

        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** Botón primario en estilo Voltage OS (copper con glow). Para acciones principales. */
export function HeaderActionPrimary({
  href,
  onClick,
  children,
  icon,
}: {
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  const cls =
    "inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-3.5 py-2 text-xs font-medium text-white shadow-sm glow-copper-sm inset-highlight-md transition-shadow hover:glow-copper";
  if (href) {
    return (
      <Link href={href} className={cls}>
        {icon}
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {icon}
      {children}
    </button>
  );
}

/** Botón secundario glass para acciones del header. */
export function HeaderActionGhost({
  href,
  onClick,
  children,
  icon,
  disabled,
}: {
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}) {
  const cls =
    "inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-3 py-2 text-xs font-medium text-foreground/90 backdrop-blur transition hover:border-glass-strong hover:bg-glass-elev disabled:opacity-40 disabled:pointer-events-none";
  if (href) {
    return (
      <Link href={href} className={cls}>
        {icon}
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {icon}
      {children}
    </button>
  );
}

/** Live indicator estilo de A — pulsa verde junto a un texto. */
export function LiveBadge({ children, tone = "green" }: { children: React.ReactNode; tone?: "green" | "copper" }) {
  if (tone === "copper") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-copper/30 bg-copper/10 px-2.5 py-1 text-copper">
        <span className="led-copper" />
        {children}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/25 bg-green-500/[0.08] px-2.5 py-1 text-green-400">
      <span className="led-green" />
      {children}
    </span>
  );
}
