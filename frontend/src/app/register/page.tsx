"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { register } from "@/lib/auth";
import { ApiError } from "@/lib/api";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [telefono, setTelefono] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }
    setLoading(true);
    try {
      await register({ email, password, nombres, apellidos, telefono: telefono || undefined });
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) setError("Revisá los datos ingresados");
      else setError("No se pudo enviar la solicitud. Intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <Shell title="Solicitud" titleAccent="enviada" subtitle="Hemos recibido tu solicitud de registro">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full border border-green-500/40 bg-green-500/10 text-green-300 glow-green">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <p className="text-sm text-foreground/85">
            Un administrador revisará tus datos y aprobará tu cuenta. Recibirás acceso una vez sea aprobada.
            Si tenés consultas, contactá directamente al administrador.
          </p>
          <Link href="/login"
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-glass-mid bg-glass px-4 py-2.5 text-sm font-medium text-foreground/90 transition hover:border-glass-strong hover:bg-glass-elev">
            Volver al inicio de sesión
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Crear" titleAccent="cuenta" subtitle="Tu solicitud será revisada y aprobada por un administrador antes de poder iniciar sesión">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombres" required htmlFor="nombres">
            <Input id="nombres" value={nombres} onChange={(e) => setNombres(e.target.value)} required maxLength={100} autoFocus className="h-10 border-glass bg-glass" />
          </Field>
          <Field label="Apellidos" required htmlFor="apellidos">
            <Input id="apellidos" value={apellidos} onChange={(e) => setApellidos(e.target.value)} required maxLength={100} className="h-10 border-glass bg-glass" />
          </Field>
        </div>
        <Field label="Email" required htmlFor="email">
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className="h-10 border-glass bg-glass" />
        </Field>
        <Field label="Contraseña" required htmlFor="password">
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" className="h-10 border-glass bg-glass" />
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">Mínimo 8 caracteres</p>
        </Field>
        <Field label="Teléfono · opcional" htmlFor="telefono">
          <Input id="telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} maxLength={20} placeholder="0991234567" className="h-10 border-glass bg-glass" />
        </Field>

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/[0.06] px-3 py-2 text-xs text-rose-300 inset-highlight" role="alert">
            {error}
          </div>
        )}

        <button type="submit" disabled={loading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-4 py-2.5 text-sm font-medium text-white shadow-sm glow-copper-sm inset-highlight-md transition hover:glow-copper disabled:opacity-60">
          {loading ? (<><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> Enviando…</>) : "Solicitar registro"}
        </button>
        <Link href="/login"
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-glass-mid bg-glass px-4 py-2 text-sm font-medium text-foreground/90 transition hover:border-glass-strong hover:bg-glass-elev">
          Ya tengo cuenta
        </Link>
      </form>
    </Shell>
  );
}

function Shell({ title, titleAccent, subtitle, children }: { title: string; titleAccent: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-copper/10 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-ttteal/10 blur-3xl" aria-hidden />
      <div className="relative w-full max-w-md">
        <div className="mb-7 flex flex-col items-center">
          <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-copper to-copper-deep text-white shadow-lg glow-copper inset-highlight-md">
            <Zap className="h-7 w-7" strokeWidth={2.4} />
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            <span className="bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-transparent">{title} </span>
            <span className="bg-gradient-to-br from-copper to-copper-soft bg-clip-text italic text-transparent">{titleAccent}</span>
          </h1>
          <p className="mt-1 max-w-sm text-center text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-glass-mid bg-glass p-7 inset-highlight backdrop-blur-xl">
          {children}
        </div>
        <p className="mt-6 text-center font-mono text-[9.5px] uppercase tracking-[0.15em] text-muted-foreground/60">
          TECHTRAFO · Samborondón, Ecuador
        </p>
      </div>
    </div>
  );
}

function Field({ label, required, htmlFor, children }: { label: string; required?: boolean; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}{required && <span className="ml-1 text-copper">*</span>}
      </Label>
      {children}
    </div>
  );
}
