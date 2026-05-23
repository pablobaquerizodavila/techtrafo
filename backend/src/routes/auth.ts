import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client";
import { hashPassword, verifyPassword } from "../auth/password";
import { signToken, AUTH_COOKIE_NAME } from "../auth/jwt";
import { requireAuth } from "../auth/middleware";
import { env } from "../config/env";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8, "Minimo 8 caracteres"),
  nombres: z.string().min(1).max(100),
  apellidos: z.string().min(1).max(100),
  telefono: z.string().max(20).optional().nullable(),
});

// Opciones de cookie consistentes en set y clear.
// En produccion: domain=.techtrafo.com para compartir cookie entre subdominios
// (panel.techtrafo.com lee la cookie que setea api.techtrafo.com).
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.NODE_ENV === "production",
  path: "/",
  ...(env.NODE_ENV === "production" && { domain: ".techtrafo.com" }),
};

// -------------------------------------------------------------------
// POST /api/auth/register  -  publico, crea usuario en estado pendiente
// -------------------------------------------------------------------
router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { email, password, nombres, apellidos, telefono } = parsed.data;

  try {
    const existing = await prisma.usuarios.findUnique({ where: { email } });
    if (existing) {
      // Mismo mensaje generico para no permitir enumeration
      res.status(202).json({ status: "submitted" });
      return;
    }
    const password_hash = await hashPassword(password);
    await prisma.usuarios.create({
      data: {
        email,
        password_hash,
        nombres,
        apellidos,
        telefono_solicitud: telefono ?? null,
        activo: true,
        estado_aprobacion: "pendiente",
        rol_id: null, // El super admin asigna rol al aprobar
      },
    });
    // Respuesta neutra: el frontend muestra "Tu solicitud fue enviada, espera aprobacion"
    res.status(202).json({ status: "submitted" });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      // Unique violation -> mismo mensaje neutro
      res.status(202).json({ status: "submitted" });
      return;
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// POST /api/auth/login  -  rechaza si no esta aprobado
// -------------------------------------------------------------------
router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }

  const { email, password } = parsed.data;

  const usuario = await prisma.usuarios.findUnique({
    where: { email },
    include: { roles: { select: { id: true, nombre: true, es_super_admin: true, permisos: true } } },
  });

  // Mismo mensaje para usuario inexistente y password incorrecta (evita user enumeration)
  if (!usuario || usuario.activo === false) {
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }

  const ok = await verifyPassword(password, usuario.password_hash);
  if (!ok) {
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }

  // Validar estado de aprobacion
  if (usuario.estado_aprobacion === "pendiente") {
    res.status(403).json({
      error: "pendiente_aprobacion",
      mensaje: "Tu cuenta esta pendiente de aprobacion por el administrador.",
    });
    return;
  }
  if (usuario.estado_aprobacion === "rechazado") {
    res.status(403).json({
      error: "registro_rechazado",
      mensaje: usuario.motivo_rechazo ?? "Tu solicitud de registro fue rechazada.",
    });
    return;
  }

  await prisma.usuarios.update({
    where: { id: usuario.id },
    data: { ultimo_login: new Date() },
  });

  const token = signToken({ sub: usuario.id });
  res.cookie(AUTH_COOKIE_NAME, token, cookieOptions);

  res.json({
    user: {
      id: usuario.id,
      email: usuario.email,
      nombres: usuario.nombres,
      apellidos: usuario.apellidos,
      rol_id: usuario.rol_id,
      rol_nombre: usuario.roles?.nombre ?? null,
      es_super_admin: usuario.roles?.es_super_admin ?? false,
      permisos: (usuario.roles?.permisos as Record<string, boolean>) ?? {},
    },
  });
});

router.post("/logout", (_req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, cookieOptions);
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
