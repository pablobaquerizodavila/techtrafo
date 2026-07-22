"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { listar, unreadCount, leer, leerTodas, type Notif } from "@/lib/notificaciones";

/**
 * Campana de notificaciones in-app (Voltage OS).
 * - Al montar y cada 60s: unreadCount() -> badge.
 * - Al abrir el dropdown: listar() -> items.
 * - Click en item: leer() + navega a enlace si existe.
 * - Errores silenciosos: nunca rompe el layout.
 */
export function NotificacionesBell() {
  const router = useRouter();
  const [items, setItems] = useState<Notif[]>([]);
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(async () => {
    try {
      const r = await unreadCount();
      setCount(r.count);
    } catch {
      /* silencioso */
    }
  }, []);

  const loadItems = useCallback(async () => {
    try {
      const r = await listar();
      setItems(r.data);
    } catch {
      /* silencioso */
    }
  }, []);

  // Poll del contador al montar y cada 60s.
  useEffect(() => {
    refreshCount();
    const t = setInterval(refreshCount, 60_000);
    return () => clearInterval(t);
  }, [refreshCount]);

  // Cerrar al hacer click afuera.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) loadItems();
  }

  async function onItemClick(item: Notif) {
    try {
      if (!item.leido) {
        await leer(item.id);
        await refreshCount();
        await loadItems();
      }
    } catch {
      /* silencioso */
    } finally {
      if (item.enlace) {
        setOpen(false);
        router.push(item.enlace);
      }
    }
  }

  async function onMarkAll() {
    try {
      await leerTodas();
      await refreshCount();
      await loadItems();
    } catch {
      /* silencioso */
    }
  }

  function fmtFecha(iso: string): string {
    try {
      return new Date(iso).toLocaleString("es", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label="Notificaciones"
        aria-expanded={open}
        className="relative grid h-9 w-9 place-items-center rounded-lg border border-glass bg-glass text-muted-foreground transition-colors hover:bg-glass-hover hover:text-foreground"
      >
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-copper px-1 font-mono text-[9px] font-bold leading-none text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-glass bg-glass-elev shadow-xl backdrop-blur-xl inset-highlight">
          <div className="flex items-center justify-between border-b border-glass px-3 py-2.5">
            <p className="font-display text-xs font-semibold">Notificaciones</p>
            <button
              type="button"
              onClick={onMarkAll}
              className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-copper"
            >
              Marcar todas
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto scroll-discreet">
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                Sin notificaciones
              </p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onItemClick(item)}
                  className="flex w-full items-start gap-2.5 border-b border-glass/60 px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-glass-hover"
                >
                  <span
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                      item.leido ? "bg-transparent" : "bg-copper"
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-xs ${
                        item.leido ? "text-muted-foreground" : "font-medium text-foreground"
                      }`}
                    >
                      {item.asunto}
                    </span>
                    <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">
                      {fmtFecha(item.created_at)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
