import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { AUTH_COOKIE_NAME } from "./jwt";

// Fix H3 auditoria: CSRF double-submit cookie.
//
// Patron:
//   1. Login setea cookie tehctrafo_csrf (NO HttpOnly) con token random.
//   2. Frontend JS lee la cookie y la envia en header X-CSRF-Token en cada mutation.
//   3. Este middleware valida en backend que cookie == header. Sin coincidencia -> 403.
//
// Por que funciona: un attacker en otra origin NO puede leer la cookie
// techtrafo_csrf (Domain=.techtrafo.com), ni setear el header X-CSRF-Token
// con el valor correcto desde un cross-site request. SameSite=Lax es la
// primera linea, double-submit es defensa en profundidad para POST forms
// y casos edge donde Lax no protege (subdominio comprometido, etc).

export const CSRF_COOKIE_NAME = "techtrafo_csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";

// 8h: coincide con el default de JWT_EXPIRES_IN. Si el JWT se renueva con
// nueva sesion, tambien se renueva esta cookie (setCsrfCookie en login).
const CSRF_MAX_AGE_MS = 8 * 60 * 60 * 1000;

const csrfCookieOptions = {
  httpOnly: false, // El JS del frontend tiene que leerla para mandar el header.
  sameSite: "lax" as const,
  secure: env.NODE_ENV === "production",
  path: "/",
  maxAge: CSRF_MAX_AGE_MS,
  ...(env.NODE_ENV === "production" && { domain: ".techtrafo.com" }),
};

// clearCookie ignora maxAge; el resto debe coincidir con set para que el
// browser efectivamente la borre.
const csrfClearOptions = {
  httpOnly: false,
  sameSite: "lax" as const,
  secure: env.NODE_ENV === "production",
  path: "/",
  ...(env.NODE_ENV === "production" && { domain: ".techtrafo.com" }),
};

export function setCsrfCookie(res: Response): void {
  const token = crypto.randomBytes(32).toString("hex");
  res.cookie(CSRF_COOKIE_NAME, token, csrfCookieOptions);
}

export function clearCsrfCookie(res: Response): void {
  res.clearCookie(CSRF_COOKIE_NAME, csrfClearOptions);
}

// Rutas exentas: el login/register no tienen sesion previa (no hay cookie csrf
// que validar). Logout es idempotente: si alguien hace logout cross-site
// el peor escenario es deslogueo, sin elevation. La proteccion real para
// login/register es el rate-limit (H2) + SameSite=Lax.
const EXEMPT_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
]);

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Metodos safe: la spec HTTP dice que no deben mutar estado.
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next();
    return;
  }
  if (EXEMPT_PATHS.has(req.path)) {
    next();
    return;
  }
  // Sin cookie de sesion no hay nada que proteger: requireAuth respondera 401
  // mas adelante en la cadena. Esto evita que requests anonimos reciban 403
  // confuso cuando la respuesta real deberia ser 401.
  if (!req.cookies?.[AUTH_COOKIE_NAME]) {
    next();
    return;
  }
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.header(CSRF_HEADER_NAME);
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    res.status(403).json({ error: "csrf_token_invalid" });
    return;
  }
  next();
}
