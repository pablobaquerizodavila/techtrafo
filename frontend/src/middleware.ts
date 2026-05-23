import { NextRequest, NextResponse } from "next/server";

const AUTH_COOKIE = "techtrafo_session";

// Rutas publicas que no requieren cookie
const PUBLIC_PATHS = ["/login", "/register"];

/**
 * Heuristica barata para detectar un JWT plausible sin validar la firma:
 * tres segmentos separados por punto y mas de un caracter cada uno.
 * No valida criptograficamente — solo evita el loop cuando la cookie
 * existe pero esta vacia o claramente corrupta.
 */
function looksLikeJwt(value: string | undefined): boolean {
  if (!value) return false;
  const parts = value.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const cookieValue = req.cookies.get(AUTH_COOKIE)?.value;
  const hasValidShape = looksLikeJwt(cookieValue);
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // No autenticado intentando entrar a ruta privada -> /login
  if (!hasValidShape && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Autenticado entrando a /login -> /dashboard
  // (solo si la cookie tiene forma valida; si esta corrupta no hacemos
  // el redirect, para no atrapar al usuario en un loop cuando el JWT
  // expiro o el server cambio el secret)
  if (hasValidShape && pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Aplica a todas las rutas excepto archivos estaticos y assets de Next
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
