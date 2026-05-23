"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { getResumenNotificaciones } from "@/lib/expedientes";

/**
 * Link a /notificaciones con badge de cuenta de no-leidas (48h).
 * Polling cada 60s. Si el endpoint falla queda silencioso.
 */
export function NotifLink() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await getResumenNotificaciones();
        if (!cancelled) setCount(r.data.recientes_48h);
      } catch {
        if (!cancelled) setCount(null);
      }
    }
    load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return (
    <Link
      href="/notificaciones"
      className="flex items-center justify-between rounded px-3 py-2 hover:bg-accent hover:text-accent-foreground"
    >
      <span className="flex items-center gap-2">
        <Bell className="h-4 w-4" /> Notificaciones
      </span>
      {count !== null && count > 0 && (
        <span className="ml-2 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-destructive-foreground">
          {count}
        </span>
      )}
    </Link>
  );
}
