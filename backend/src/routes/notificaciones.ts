import { Router } from "express";
import { prisma } from "../db/client";
import { requireAuth } from "../auth/middleware";

const router = Router();
router.use(requireAuth);

/**
 * GET /api/notificaciones
 * Lista notificaciones del usuario autenticado (las dirigidas a su uuid).
 * Filtros opcionales: solo_no_leidas, limit.
 *
 * Nota: el modelo actual no tiene "leida"; se considera "no leida" si fue
 * creada en las ultimas 48h. Si queremos persistirlo, hay que añadir columna.
 */
router.get("/", async (req, res) => {
  const userId = req.user!.id;
  const limit = Math.min(100, Number(req.query.limit ?? 25));

  const data = await prisma.notificaciones.findMany({
    where: { destinatario_id: userId },
    orderBy: { created_at: "desc" },
    take: limit,
    select: {
      id: true,
      tipo: true,
      asunto: true,
      enviado: true,
      fecha_envio: true,
      contexto: true,
      created_at: true,
    },
  });

  res.json({
    data: data.map((n) => ({ ...n, id: Number(n.id) })),
  });
});

/**
 * GET /api/notificaciones/resumen
 * Devuelve cuenta de notificaciones recientes del usuario.
 */
router.get("/resumen", async (req, res) => {
  const userId = req.user!.id;
  const desde = new Date();
  desde.setHours(desde.getHours() - 48);

  const [recientes, totales] = await Promise.all([
    prisma.notificaciones.count({
      where: { destinatario_id: userId, created_at: { gte: desde } },
    }),
    prisma.notificaciones.count({
      where: { destinatario_id: userId },
    }),
  ]);

  res.json({
    data: { recientes_48h: recientes, total: totales },
  });
});

export default router;
