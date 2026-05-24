import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client";
import { hashPassword, verifyPassword } from "../auth/password";
import { signToken, AUTH_COOKIE_NAME } from "../auth/jwt";
import { requireAuth } from "../auth/middleware";
import { loginLimiter, registerLimiter, changePasswordLimiter } from "../auth/rate-limit";
import { setCsrfCookie, clearCsrfCookie } from "../auth/csrf";
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
router.post("/register", registerLimiter, async (req, res) => {
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
router.post("/login", loginLimiter, async (req, res) => {
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

  // Fix M7 auditoria: firmar el JWT con el token_version actual del usuario.
  // requireAuth lo compara contra DB en cada request; cambios invalidan el token.
  const token = signToken({ sub: usuario.id, tv: usuario.token_version });
  res.cookie(AUTH_COOKIE_NAME, token, cookieOptions);
  // Fix H3 auditoria: setear cookie CSRF (no HttpOnly) en cada login. El
  // frontend la lee y la envia como header X-CSRF-Token en cada mutation.
  setCsrfCookie(res);

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
      cliente_id: usuario.cliente_id ? Number(usuario.cliente_id) : null,
    },
  });
});

router.post("/logout", requireAuth, async (req, res) => {
  // Fix M7 auditoria: incrementar token_version para revocar GLOBALMENTE las
  // sesiones de este usuario (defensa contra cookie robada). Costo aceptable:
  // si el user tiene multiples dispositivos, todos quedan deslogueados.
  await prisma.$executeRaw`
    UPDATE core.usuarios SET token_version = token_version + 1
     WHERE id = ${req.user!.id}::uuid
  `;
  res.clearCookie(AUTH_COOKIE_NAME, cookieOptions);
  clearCsrfCookie(res);
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// -------------------------------------------------------------------
// PATCH /api/auth/me  -  usuario edita SU propio perfil (sin email, rol, activo)
// -------------------------------------------------------------------
const updateProfileSchema = z.object({
  nombres: z.string().min(1).max(100).optional(),
  apellidos: z.string().min(1).max(100).optional(),
  telefono: z.string().max(20).optional().nullable(),
});

router.patch("/me", requireAuth, async (req, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const d = parsed.data;
  const userId = req.user!.id;

  if (d.nombres !== undefined) {
    await prisma.$executeRaw`UPDATE core.usuarios SET nombres = ${d.nombres} WHERE id = ${userId}::uuid`;
  }
  if (d.apellidos !== undefined) {
    await prisma.$executeRaw`UPDATE core.usuarios SET apellidos = ${d.apellidos} WHERE id = ${userId}::uuid`;
  }
  if (d.telefono !== undefined) {
    await prisma.$executeRaw`UPDATE core.usuarios SET telefono = ${d.telefono} WHERE id = ${userId}::uuid`;
  }
  await prisma.$executeRaw`UPDATE core.usuarios SET updated_at = NOW() WHERE id = ${userId}::uuid`;

  const updated = await prisma.usuarios.findUnique({
    where: { id: userId },
    select: { id: true, email: true, nombres: true, apellidos: true, telefono: true },
  });
  res.json({ data: updated });
});

// -------------------------------------------------------------------
// POST /api/auth/change-password  -  usuario cambia SU propio password
// -------------------------------------------------------------------
const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8, "Minimo 8 caracteres").max(128),
});

router.post("/change-password", changePasswordLimiter, requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;
  const me = await prisma.usuarios.findUnique({
    where: { id: userId },
    select: { password_hash: true },
  });
  if (!me) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const ok = await verifyPassword(parsed.data.current_password, me.password_hash);
  if (!ok) {
    res.status(401).json({ error: "current_password_invalida" });
    return;
  }
  if (parsed.data.current_password === parsed.data.new_password) {
    res.status(400).json({ error: "password_igual_a_la_actual" });
    return;
  }
  const password_hash = await hashPassword(parsed.data.new_password);
  // Fix M7 auditoria: cambio de password incrementa token_version, invalidando
  // todas las sesiones existentes (incluida la cookie actual). El user tiene
  // que re-loguearse despues de cambiar password. Defensa contra cookie robada.
  await prisma.$executeRaw`
    UPDATE core.usuarios
       SET password_hash = ${password_hash},
           token_version = token_version + 1,
           updated_at = NOW()
     WHERE id = ${userId}::uuid
  `;
  res.json({ status: "password_actualizada" });
});

export default router;
