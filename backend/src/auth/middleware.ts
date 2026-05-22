import { Request, Response, NextFunction } from "express";
import { prisma } from "../db/client";
import { AUTH_COOKIE_NAME, verifyToken } from "./jwt";

// Forma del usuario que se adjunta a req tras requireAuth
export interface AuthUser {
  id: string;
  email: string;
  nombres: string;
  apellidos: string;
  rol_id: number | null;
  rol_nombre: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Lee el JWT de la cookie HttpOnly, lo valida y carga el usuario desde la DB.
 * Si no hay token o es invalido, responde 401 sin pasar al siguiente handler.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[AUTH_COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "invalid_token" });
    return;
  }

  // Carga usuario + rol. Si el usuario fue desactivado o eliminado, rechaza.
  const usuario = await prisma.usuarios.findUnique({
    where: { id: payload.sub },
    include: { roles: { select: { id: true, nombre: true } } },
  });

  if (!usuario || usuario.activo === false) {
    res.status(401).json({ error: "user_inactive" });
    return;
  }

  req.user = {
    id: usuario.id,
    email: usuario.email,
    nombres: usuario.nombres,
    apellidos: usuario.apellidos,
    rol_id: usuario.rol_id ?? null,
    rol_nombre: usuario.roles?.nombre ?? null,
  };

  next();
}

/**
 * Verifica que el usuario autenticado tenga uno de los roles permitidos.
 * Debe usarse DESPUES de requireAuth.
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    if (!req.user.rol_nombre || !allowedRoles.includes(req.user.rol_nombre)) {
      res.status(403).json({ error: "forbidden", required_roles: allowedRoles });
      return;
    }
    next();
  };
}
