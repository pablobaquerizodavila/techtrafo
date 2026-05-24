import rateLimit, { Options } from "express-rate-limit";
import type { Request, Response } from "express";

// Fix H2 auditoria: rate limit en endpoints sensibles para mitigar fuerza
// bruta de credenciales y abuso de envio masivo. Las cuotas son por IP
// (req.ip resuelto por trust proxy=1, ver server.ts).
//
// Si en el futuro se necesita rate limit distribuido entre multiples
// instancias del API, swap a rate-limit-redis con el cliente redis existente.

const respuesta429 = (windowMs: number) => ({
  error: "rate_limited",
  message: "Demasiadas solicitudes. Intenta de nuevo en unos minutos.",
  retry_after_seconds: Math.ceil(windowMs / 1000),
});

function buildLimiter(opts: {
  windowMs: number;
  max: number;
  /** Si true, no cuenta las requests que respondan con status < 400 (exitosas). */
  skipSuccessful?: boolean;
}) {
  const config: Partial<Options> = {
    windowMs: opts.windowMs,
    max: opts.max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
      res.status(429).json(respuesta429(opts.windowMs));
    },
  };
  if (opts.skipSuccessful) config.skipSuccessfulRequests = true;
  return rateLimit(config);
}

// Login: 10 intentos por IP en 15 min. skipSuccessful evita que un usuario
// con sesion activa que se loguea varias veces consuma su cuota.
export const loginLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessful: true,
});

// Registro: 3 por IP en 1h. No skipSuccessful: cuenta TODO para evitar
// scripts de creacion masiva de cuentas pendientes.
export const registerLimiter = buildLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
});

// Cambio de password: 10 por IP en 15 min. skipSuccessful para que un
// usuario legitimo que se equivoca no se bloquee a si mismo en cascada.
export const changePasswordLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessful: true,
});

// Envio de email con PDF adjunto: 30 por IP en 1h. Requiere auth+permiso,
// limite mas alto. Evita abuso para spammear clientes via cuenta SMTP propia.
export const enviarEmailLimiter = buildLimiter({
  windowMs: 60 * 60 * 1000,
  max: 30,
});
