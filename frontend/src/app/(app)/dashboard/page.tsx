import { cookies } from "next/headers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AuthMeResponse {
  user: {
    id: string;
    email: string;
    nombres: string;
    apellidos: string;
    rol_nombre: string | null;
  };
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

// Pide /api/auth/me desde el server-side (Server Component) usando la cookie del request
async function fetchCurrentUser(): Promise<AuthMeResponse["user"] | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  try {
    const res = await fetch(`${API_URL}/api/auth/me`, {
      headers: { Cookie: cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as AuthMeResponse;
    return data.user;
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const user = await fetchCurrentUser();

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-3xl font-bold">Dashboard</h2>
        <p className="text-muted-foreground">Resumen general del sistema</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Sesion activa</CardTitle>
          <CardDescription>Usuario autenticado en este navegador</CardDescription>
        </CardHeader>
        <CardContent>
          {user ? (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="font-medium">Nombre</dt>
              <dd>
                {user.nombres} {user.apellidos}
              </dd>
              <dt className="font-medium">Email</dt>
              <dd>{user.email}</dd>
              <dt className="font-medium">Rol</dt>
              <dd>{user.rol_nombre ?? "(sin rol)"}</dd>
              <dt className="font-medium">User ID</dt>
              <dd className="font-mono text-xs">{user.id}</dd>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">No se pudo obtener el usuario.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Proximos modulos</CardTitle>
          <CardDescription>FASE 3 en curso</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            <li>3.6 - Vista de clientes (siguiente)</li>
            <li>3.7 - Reverse proxy + SSL para panel.techtrafo.com</li>
            <li>4.x - Modulos comercial, produccion, bodega, posventa</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
