"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
          setError("Email o contrasena incorrectos");
        } else if (err.status === 403) {
          const body = err.body as { error?: string; mensaje?: string };
          if (body?.error === "pendiente_aprobacion") {
            setError("Tu cuenta esta pendiente de aprobacion por el administrador. Espera el aviso de activacion.");
          } else if (body?.error === "registro_rechazado") {
            setError(`Tu solicitud fue rechazada. ${body.mensaje ?? ""}`);
          } else {
            setError(body?.mensaje ?? "Acceso denegado");
          }
        } else {
          setError("No se pudo iniciar sesion. Intenta de nuevo.");
        }
      } else {
        setError("No se pudo iniciar sesion. Intenta de nuevo.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>TECHTRAFO</CardTitle>
          <CardDescription>Iniciar sesion en el panel de gestion</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="usuario@techtrafo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contrasena</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Verificando..." : "Iniciar sesion"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              No tienes cuenta?{" "}
              <Link href="/register" className="text-primary hover:underline">
                Solicitar registro
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
