/**
 * Panel reutilizable con estilo Voltage OS — glass surface + título.
 * Mantener visual coherente entre todas las páginas del panel.
 */
export function Panel({
  title,
  subtitle,
  icon,
  action,
  children,
  className,
  padded = true,
}: {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Si false, no aplica padding interno (útil para tablas que llegan al borde). */
  padded?: boolean;
}) {
  return (
    <section className={`overflow-hidden rounded-xl border border-glass bg-glass inset-highlight ${className ?? ""}`}>
      {(title || subtitle || action) && (
        <div className="flex items-start justify-between gap-3 border-b border-glass px-5 py-3.5">
          {(title || subtitle) && (
            <div className="min-w-0">
              {title && (
                <h3 className="flex items-center gap-2 font-display text-sm font-semibold tracking-tight">
                  {icon && <span className="text-copper">{icon}</span>}
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {subtitle}
                </p>
              )}
            </div>
          )}
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}

/** Empty state estándar dentro de un Panel. */
export function EmptyState({
  message,
  tone = "neutral",
  icon,
}: {
  message: string;
  tone?: "neutral" | "positive";
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-md border border-dashed py-6 ${
        tone === "positive" ? "border-green-500/25 bg-green-500/[0.04]" : "border-glass bg-glass"
      }`}
    >
      {icon && <span className={tone === "positive" ? "text-green-400" : "text-muted-foreground"}>{icon}</span>}
      <p className={`text-xs ${tone === "positive" ? "text-green-300" : "text-muted-foreground"}`}>
        {tone === "positive" && !icon && "✓ "}
        {message}
      </p>
    </div>
  );
}

/** Card de KPI mini para usar en headers de listas (ej. resumen de OT / expedientes). */
export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "default",
  onClick,
  active,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon?: React.ReactNode;
  tone?: "default" | "copper" | "teal" | "rose" | "amber" | "green";
  onClick?: () => void;
  active?: boolean;
}) {
  const cfg = {
    default: { wash: "", icon: "text-muted-foreground", val: "text-foreground" },
    copper:  { wash: "bg-gradient-to-b from-copper/[0.08] to-transparent border-copper/25",  icon: "text-copper",       val: "text-copper text-glow-copper" },
    teal:    { wash: "bg-gradient-to-b from-ttteal/[0.06] to-transparent border-ttteal/22", icon: "text-ttteal",       val: "text-ttteal text-glow-teal"   },
    rose:    { wash: "bg-gradient-to-b from-rose-500/[0.08] to-transparent border-rose-500/25", icon: "text-rose-400", val: "text-rose-400 text-glow-rose" },
    amber:   { wash: "bg-gradient-to-b from-amber-500/[0.06] to-transparent border-amber-500/22", icon: "text-amber-400", val: "text-foreground" },
    green:   { wash: "bg-gradient-to-b from-green-500/[0.06] to-transparent border-green-500/22", icon: "text-green-400", val: "text-foreground" },
  }[tone];

  const base = `group relative overflow-hidden rounded-xl border bg-glass p-4 inset-highlight transition-all ${cfg.wash} ${
    onClick ? "cursor-pointer hover:-translate-y-px hover:border-glass-mid hover:bg-glass-elev" : ""
  } ${active ? "ring-2 ring-copper/60" : ""}`;

  const inner = (
    <>
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{label}</span>
        {icon && (
          <div className={`grid h-7 w-7 place-items-center rounded-md border border-glass bg-glass-elev ${cfg.icon}`}>
            {icon}
          </div>
        )}
      </div>
      <p className={`font-display text-3xl font-semibold tabular-nums tracking-tight ${cfg.val}`}>{value}</p>
      {sub && <p className="mt-1 font-mono text-[10.5px] leading-tight text-muted-foreground">{sub}</p>}
    </>
  );

  return onClick ? (
    <button type="button" onClick={onClick} className={`${base} text-left`}>{inner}</button>
  ) : (
    <div className={base}>{inner}</div>
  );
}
