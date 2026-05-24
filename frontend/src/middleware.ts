import { NextRequest, NextResponse } from "next/server";

const AUTH_COOKIE = "techtrafo_session";

// Rutas publicas que no requieren cookie
const PUBLIC_PATHS = ["/login", "/register"];

// Roots de modulos internos (panel.techtrafo.com). Si llegan al host
// portal.techtrafo.com, redirigimos a la raiz del portal para evitar
// que un cliente vea ningun fragmento del panel admin.
const INTERNAL_ROOTS = [
  "/dashboard",
  "/cotizaciones",
  "/contratos",
  "/ot",
  "/expedientes",
  "/inventario",
  "/transformadores",
  "/produccion",
  "/garantias",
  "/clientes",
  "/admin",
  "/visitas-tecnicas",
  "/informes-tecnicos",
];

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

/**
 * El host portal.techtrafo.com sirve el mismo container que panel pero el
 * middleware reescribe a /portal/* para que el cliente vea URLs limpias
 * (portal.techtrafo.com/expediente/5 -> /portal/expediente/5 internamente).
 */
function isPortalHost(req: NextRequest): boolean {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  return host.startsWith("portal.");
}

function isInternalRoot(pathname: string): boolean {
  return INTERNAL_ROOTS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const cookieValue = req.cookies.get(AUTH_COOKIE)?.value;
  const hasValidShape = looksLikeJwt(cookieValue);
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const onPortal = isPortalHost(req);

  // No autenticado intentando entrar a ruta privada -> /login
  if (!hasValidShape && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Autenticado entrando a /login -> destino segun host
  // (solo si la cookie tiene forma valida; si esta corrupta no hacemos
  // el redirect, para no atrapar al usuario en un loop cuando el JWT
  // expiro o el server cambio el secret)
  if (hasValidShape && pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = onPortal ? "/portal" : "/dashboard";
    return NextResponse.redirect(url);
  }

  // Rewrite por host: si el cliente entra a portal.techtrafo.com,
  // mapeamos el path a /portal/* internamente (URL del navegador queda
  // limpia, sin "/portal" visible).
  if (onPortal && !isPublic) {
    // Bloquear cualquier path de modulo interno: redirect (no rewrite)
    // a la raiz del portal, para que la URL del cliente quede limpia.
    if (isInternalRoot(pathname)) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    // Si ya viene a /portal/* (acceso directo) lo dejamos pasar.
    if (pathname.startsWith("/portal")) {
      return NextResponse.next();
    }
    // Resto (incluida la raiz) -> rewrite a /portal + path
    const url = req.nextUrl.clone();
    url.pathname = pathname === "/" ? "/portal" : `/portal${pathname}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

// Aplica a todas las rutas excepto archivos estaticos y assets de Next
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
