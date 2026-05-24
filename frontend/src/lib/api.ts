/**
 * Cliente HTTP minimo para hablar con el backend TECHTRAFO.
 *
 * - credentials: 'include'  -> envia y recibe la cookie techtrafo_session
 * - Tira ApiError con el status y el body cuando la respuesta es >= 400
 * - Acepta path absoluto (con http://) o relativo a NEXT_PUBLIC_API_URL
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

// Fix H3 auditoria: cookie CSRF (no HttpOnly) seteada por backend en login.
// La leemos aca y la mandamos como header X-CSRF-Token en cada mutation.
const CSRF_HEADER_NAME = "X-CSRF-Token";
const CSRF_COOKIE_REGEX = /(?:^|;\s*)techtrafo_csrf=([^;]+)/;

function getCsrfTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null; // SSR
  const match = document.cookie.match(CSRF_COOKIE_REGEX);
  return match ? decodeURIComponent(match[1]) : null;
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `API ${status}`);
    this.status = status;
    this.body = body;
  }
}

export interface ApiOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

export async function apiFetch<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;

  const headers = new Headers(options.headers ?? {});
  if (options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // CSRF: en mutations leemos la cookie y la mandamos como header. El backend
  // valida en csrfProtection. Skipea GET/HEAD/OPTIONS y rutas exentas como
  // /auth/login (no hay sesion previa).
  const method = (options.method ?? "GET").toUpperCase();
  const isMutation = method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
  if (isMutation) {
    const csrf = getCsrfTokenFromCookie();
    if (csrf && !headers.has(CSRF_HEADER_NAME)) {
      headers.set(CSRF_HEADER_NAME, csrf);
    }
  }

  const init: RequestInit = {
    ...options,
    headers,
    credentials: "include",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  };

  const res = await fetch(url, init);
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    throw new ApiError(res.status, body);
  }
  return body as T;
}

export const api = {
  get: <T = unknown>(path: string, options?: ApiOptions) =>
    apiFetch<T>(path, { ...options, method: "GET" }),
  post: <T = unknown>(path: string, body?: unknown, options?: ApiOptions) =>
    apiFetch<T>(path, { ...options, method: "POST", body }),
  patch: <T = unknown>(path: string, body?: unknown, options?: ApiOptions) =>
    apiFetch<T>(path, { ...options, method: "PATCH", body }),
  delete: <T = unknown>(path: string, options?: ApiOptions) =>
    apiFetch<T>(path, { ...options, method: "DELETE" }),
};
