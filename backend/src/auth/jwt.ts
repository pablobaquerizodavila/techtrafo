import jwt from "jsonwebtoken";
import { env } from "../config/env";

export interface JwtPayload {
  sub: string; // usuario.id (UUID)
  // Fix M7 auditoria: token_version del usuario al momento de firmar. El
  // middleware compara contra el valor actual en DB; si difiere, el token
  // esta revocado (logout o change-password incrementan token_version).
  tv: number;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    return decoded;
  } catch {
    return null;
  }
}

// Nombre de la cookie usado en login/logout/middleware
export const AUTH_COOKIE_NAME = "techtrafo_session";
