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
 * Decodifica el payload de un JWT (segunda parte, base64url) SIN validar la
 * firma. Solo lectura: el middleware corre en Edge Runtime sin acceso al
 * JWT_SECRET. La validacion real ocurre en el backend.
 */
function decodeJwtPayload(value: string | undefined): Record<string, unknown> | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) return null;
  try {
    // base64url -> base64 estandar para atob (disponible en Edge Runtime)
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Una cookie es "plausible" para el middleware si:
 *   - tiene forma de JWT (3 partes)
 *   - el payload se puede decodificar
 *   - incluye tv (token_version, obligatorio desde fix M7 en v0.12.0)
 *   - no esta expirada (claim exp en segundos UNIX)
 *
 * Si falta tv, asumimos que es un JWT viejo (pre-M7) que el backend ya va
 * a rechazar con 401 token_revoked. Tratarlo como invalido aca evita el
 * loop /dashboard -> aviso de sesion expirada -> click "Ir al login" ->
 * middleware ve cookie con shape JWT -> redirige a /dashboard otra vez.
 */
function isSessionPlausible(value: string | undefined): boolean {
  const payload = decodeJwtPayload(value);
  if (!payload) return false;
  if (typeof payload.tv !== "number") return false;
  if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) return false;
  return true;
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
  const sessionPlausible = isSessionPlausible(cookieValue);
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const onPortal = isPortalHost(req);

  // No autenticado intentando entrar a ruta privada -> /login
  if (!sessionPlausible && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Autenticado entrando a /login -> destino segun host
  // (solo si la cookie es plausible: payload decodificable + tv presente +
  // no expirada. Si falta tv -> JWT viejo pre-M7 -> tratamos como invalido
  // para no atrapar al usuario en un loop cuando el backend la rechaza.)
  if (sessionPlausible && pathname === "/login") {
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
