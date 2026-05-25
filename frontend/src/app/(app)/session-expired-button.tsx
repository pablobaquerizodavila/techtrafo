"use client";

import { useState } from "react";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Boton "Ir al login" para el caso de sesion expirada.
 * Llama al endpoint de logout (limpia la cookie con la opcion exacta
 * que se uso al ponerla, incluyendo domain=.techtrafo.com) y luego
 * navega a /login via window.location para evitar el cache de Next.
 *
 * Sin esto, el middleware ve la cookie corrupta y atrapa al usuario en
 * un loop /dashboard -> /login -> /dashboard.
 */
export function SessionExpiredButton({
  variant = "default",
  className,
}: {
  variant?: "default" | "outline";
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
      // Best effort: avisar al backend para que incremente token_version y
      // sete cookies expired. Si falla, el escape hatch del middleware igual
      // resuelve el cleanup.
      await fetch(`${apiUrl}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      }).catch(() => null);
    } finally {
      // Hard navigation al escape hatch del middleware: /login?logout=1.
      // El middleware (frontend/src/middleware.ts) limpia las cookies de forma
      // autoritativa (con y sin Domain=.techtrafo.com) y deja pasar a /login
      // sin re-redirigir a /dashboard, rompiendo el loop session-expired.
      window.location.href = "/login?logout=1";
    }
  }

  return (
    <Button onClick={go} disabled={busy} variant={variant} className={className} size="sm">
      <LogIn className="mr-2 h-4 w-4" />
      {busy ? "Saliendo..." : "Ir al login"}
    </Button>
  );
}
