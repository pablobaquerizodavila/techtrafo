"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/lib/auth";
import { ApiError } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError("Email o contraseña incorrectos");
        } else if (err.status === 403) {
          const body = err.body as { error?: string; mensaje?: string };
          if (body?.error === "pendiente_aprobacion") {
            setError("Tu cuenta está pendiente de aprobación por el administrador. Esperá el aviso de activación.");
          } else if (body?.error === "registro_rechazado") {
            setError(`Tu solicitud fue rechazada. ${body.mensaje ?? ""}`);
          } else {
            setError(body?.mensaje ?? "Acceso denegado");
          }
        } else {
          setError("No se pudo iniciar sesión. Intentá de nuevo.");
        }
      } else {
        setError("No se pudo iniciar sesión. Intentá de nuevo.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      {/* Ambient glow corners (refuerzan el mesh ya en body) */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-copper/10 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-ttteal/10 blur-3xl" aria-hidden />

      <div className="relative w-full max-w-sm">
        {/* Brand */}
        <div className="mb-7 flex flex-col items-center">
          <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-copper to-copper-deep text-white shadow-lg glow-copper inset-highlight-md">
            <Zap className="h-7 w-7" strokeWidth={2.4} />
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            <span className="bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-transparent">Tech</span>
            <span className="bg-gradient-to-br from-copper to-copper-soft bg-clip-text italic text-transparent">trafo</span>
          </h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Voltage OS · Panel de gestión
          </p>
        </div>

        {/* Card */}
        <div className="overflow-hidden rounded-2xl border border-glass-mid bg-glass p-7 inset-highlight backdrop-blur-xl">
          <div className="mb-6">
            <h2 className="font-display text-xl font-semibold tracking-tight">Iniciar sesión</h2>
            <p className="mt-1 text-xs text-muted-foreground">Ingresá con tus credenciales del sistema</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
                Email <span className="text-copper">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="usuario@techtrafo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
                className="h-10 border-glass bg-glass focus:border-glass-strong"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
                Contraseña <span className="text-copper">*</span>
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="h-10 border-glass bg-glass focus:border-glass-strong"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/[0.06] px-3 py-2 text-xs text-rose-300 inset-highlight" role="alert">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-4 py-2.5 text-sm font-medium text-white shadow-sm glow-copper-sm inset-highlight-md transition hover:glow-copper disabled:opacity-60"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Verificando…
                </>
              ) : "Iniciar sesión"}
            </button>
          </form>

          <p className="mt-5 text-center font-mono text-[10.5px] text-muted-foreground">
            ¿No tenés cuenta?{" "}
            <Link href="/register" className="text-copper hover:underline">
              Solicitar registro
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center font-mono text-[9.5px] uppercase tracking-[0.15em] text-muted-foreground/60">
          TECHTRAFO · Samborondón, Ecuador
        </p>
      </div>
    </div>
  );
}
