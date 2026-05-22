/**
 * Cliente HTTP minimo para hablar con el backend TECHTRAFO.
 *
 * - credentials: 'include'  -> envia y recibe la cookie techtrafo_session
 * - Tira ApiError con el status y el body cuando la respuesta es >= 400
 * - Acepta path absoluto (con http://) o relativo a NEXT_PUBLIC_API_URL
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

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
