"use client";

import { useState } from "react";
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
      setError("La contrasena debe tener al menos 8 caracteres");
      return;
    }
    setLoading(true);
    try {
      await register({ email, password, nombres, apellidos, telefono: telefono || undefined });
      setSubmitted(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setError("Revisa los datos ingresados");
      } else {
        setError("No se pudo enviar la solicitud. Intenta de nuevo.");
      }
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Solicitud enviada</CardTitle>
            <CardDescription>Hemos recibido tu solicitud de registro.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              Un administrador revisara tus datos y aprobara tu cuenta. Recibiras acceso una vez sea
              aprobada. Si tienes consultas, contacta directamente al administrador.
            </p>
          </CardContent>
          <CardFooter>
            <Button variant="outline" className="w-full" asChild>
              <Link href="/login">Volver al inicio de sesion</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Crear cuenta</CardTitle>
          <CardDescription>
            Tu solicitud sera revisada y aprobada por un administrador antes de poder iniciar sesion.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="nombres">Nombres *</Label>
              <Input id="nombres" value={nombres} onChange={(e) => setNombres(e.target.value)} required maxLength={100} autoFocus />
            </div>
            <div className="space-y-1">
              <Label htmlFor="apellidos">Apellidos *</Label>
              <Input id="apellidos" value={apellidos} onChange={(e) => setApellidos(e.target.value)} required maxLength={100} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Contrasena *</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
              <p className="text-xs text-muted-foreground">Minimo 8 caracteres</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="telefono">Telefono (opcional)</Label>
              <Input id="telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} maxLength={20} placeholder="0991234567" />
            </div>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Enviando..." : "Solicitar registro"}
            </Button>
            <Button variant="outline" className="w-full" asChild>
              <Link href="/login">Ya tengo cuenta</Link>
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
