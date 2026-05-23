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
      // Intenta logout en el backend (limpia la cookie con domain correcto)
      await fetch(`${apiUrl}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      }).catch(() => null);
    } finally {
      // Tambien borrar localmente cualquier cookie residual del dominio actual
      document.cookie = "techtrafo_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
      // Hard navigation para que el middleware vea cookies limpias
      window.location.href = "/login";
    }
  }

  return (
    <Button onClick={go} disabled={busy} variant={variant} className={className} size="sm">
      <LogIn className="mr-2 h-4 w-4" />
      {busy ? "Saliendo..." : "Ir al login"}
    </Button>
  );
}
