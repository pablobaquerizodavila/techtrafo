import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client";
import { verifyPassword } from "../auth/password";
import { signToken, AUTH_COOKIE_NAME } from "../auth/jwt";
import { requireAuth } from "../auth/middleware";
import { env } from "../config/env";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Opciones de cookie consistentes en set y clear
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.NODE_ENV === "production",
  path: "/",
};

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }

  const { email, password } = parsed.data;

  const usuario = await prisma.usuarios.findUnique({
    where: { email },
    include: { roles: { select: { id: true, nombre: true } } },
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
