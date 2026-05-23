import { NextRequest, NextResponse } from "next/server";

const AUTH_COOKIE = "techtrafo_session";

// Rutas publicas que no requieren cookie
const PUBLIC_PATHS = ["/login", "/register"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasCookie = req.cookies.has(AUTH_COOKIE);
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // No autenticado intentando entrar a ruta privada -> /login
  if (!hasCookie && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Autenticado entrando a /login -> /dashboard
  if (hasCookie && pathname === "/login") {
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
