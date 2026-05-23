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
  es_super_admin: boolean;
  permisos: Record<string, boolean>;
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
 * Si no hay token, es invalido, o el usuario no esta aprobado, responde 401.
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

  const usuario = await prisma.usuarios.findUnique({
    where: { id: payload.sub },
    include: {
      roles: {
        select: { id: true, nombre: true, es_super_admin: true, permisos: true },
      },
    },
  });

  if (!usuario || usuario.activo === false) {
    res.status(401).json({ error: "user_inactive" });
    return;
  }

  if (usuario.estado_aprobacion !== "aprobado") {
    res.status(403).json({
      error: "user_no_aprobado",
      estado: usuario.estado_aprobacion,
    });
    return;
  }

  req.user = {
    id: usuario.id,
    email: usuario.email,
    nombres: usuario.nombres,
    apellidos: usuario.apellidos,
    rol_id: usuario.rol_id ?? null,
    rol_nombre: usuario.roles?.nombre ?? null,
    es_super_admin: usuario.roles?.es_super_admin ?? false,
    permisos: (usuario.roles?.permisos as Record<string, boolean>) ?? {},
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
    if (req.user.es_super_admin) {
      next();
      return;
    }
    if (!req.user.rol_nombre || !allowedRoles.includes(req.user.rol_nombre)) {
      res.status(403).json({ error: "forbidden", required_roles: allowedRoles });
      return;
    }
    next();
  };
}

/**
 * Verifica que el usuario sea super_admin (presidencia con flag activo).
 * Necesario para gestionar configuracion de roles y permisos del sistema.
 */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "unauthenticated" });
    return;
  }
  if (!req.user.es_super_admin) {
    res.status(403).json({ error: "super_admin_required" });
    return;
  }
  next();
}

/**
 * Verifica que el usuario tenga el permiso especifico.
 *
 * Soporta 3 formatos en core.roles.permisos:
 *  1) Nuevo granular: {"clientes.read": true, "clientes.write": true}
 *  2) Legacy por area: {"clientes": true} -> aplica a todas las acciones del area
 *  3) Comodin: {"all": true} -> aplica a todo
 *
 * Super_admin siempre pasa.
 */
export function requirePermission(modulo: string, accion: string) {
  const claveGranular = `${modulo}.${accion}`;
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    if (req.user.es_super_admin) {
      next();
      return;
    }
    const p = req.user.permisos ?? {};
    const tiene =
      p[claveGranular] === true ||
      p[modulo] === true ||
      p.all === true;
    if (!tiene) {
      res.status(403).json({ error: "permission_denied", required: claveGranular });
      return;
    }
    next();
  };
}
