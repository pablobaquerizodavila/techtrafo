import { Router } from "express";
import { prisma } from "../db/client";
import { requireAuth } from "../auth/middleware";

const router = Router();
router.use(requireAuth);

/**
 * Estados terminales de un expediente. Cuando un expediente esta en uno
 * de estos, las notificaciones derivadas de el (las que tienen
 * contexto.expediente_id) se ocultan del listado y del resumen.
 *
 * Las notificaciones no se borran fisicamente — siguen en DB para
 * auditoria y para que el worker las marque como enviadas si correspondia.
 * Solo dejan de aparecer en la UI.
 */
const ESTADOS_TERMINALES = ["cancelado", "ganado", "perdido"];

/**
 * GET /api/notificaciones
 * Lista notificaciones del usuario autenticado (las dirigidas a su uuid).
 * Excluye las que provienen de expedientes en estado terminal.
 *
 * Nota: el modelo actual no tiene "leida"; se considera "no leida" si fue
 * creada en las ultimas 48h. Si queremos persistirlo, hay que añadir columna.
 */
router.get("/", async (req, res) => {
  const userId = req.user!.id;
  const limit = Math.min(100, Number(req.query.limit ?? 25));

  // SQL raw porque Prisma no soporta bien NOT EXISTS con cast desde JSONB.
  const data = await prisma.$queryRaw<Array<{
    id: bigint;
    tipo: string;
    asunto: string;
    enviado: boolean;
    fecha_envio: Date | null;
    contexto: unknown;
    created_at: Date | null;
    leido: boolean;
    leido_at: Date | null;
    enlace: string | null;
  }>>`
    SELECT n.id, n.tipo, n.asunto, n.enviado, n.fecha_envio, n.contexto, n.created_at,
           n.leido, n.leido_at, n.enlace
      FROM core.notificaciones n
     WHERE n.destinatario_id = ${userId}::uuid
       AND NOT EXISTS (
         SELECT 1 FROM comercial.expedientes e
          WHERE e.id = NULLIF(n.contexto->>'expediente_id', '')::bigint
            AND e.estado = ANY(${ESTADOS_TERMINALES}::text[])
       )
     ORDER BY n.created_at DESC
     LIMIT ${limit}
  `;

  res.json({
    data: data.map((n) => ({ ...n, id: Number(n.id) })),
  });
});

/**
 * GET /api/notificaciones/resumen
 * Devuelve cuenta de notificaciones recientes del usuario.
 * Excluye las de expedientes en estado terminal.
 */
router.get("/resumen", async (req, res) => {
  const userId = req.user!.id;
  const desde = new Date();
  desde.setHours(desde.getHours() - 48);

  const [recientesRow, totalesRow] = await Promise.all([
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
        FROM core.notificaciones n
       WHERE n.destinatario_id = ${userId}::uuid
         AND n.created_at >= ${desde}
         AND NOT EXISTS (
           SELECT 1 FROM comercial.expedientes e
            WHERE e.id = NULLIF(n.contexto->>'expediente_id', '')::bigint
              AND e.estado = ANY(${ESTADOS_TERMINALES}::text[])
         )
    `,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
        FROM core.notificaciones n
       WHERE n.destinatario_id = ${userId}::uuid
         AND NOT EXISTS (
           SELECT 1 FROM comercial.expedientes e
            WHERE e.id = NULLIF(n.contexto->>'expediente_id', '')::bigint
              AND e.estado = ANY(${ESTADOS_TERMINALES}::text[])
         )
    `,
  ]);

  const recientes = Number(recientesRow[0]?.count ?? 0);
  const totales = Number(totalesRow[0]?.count ?? 0);

  res.json({
    data: { recientes_48h: recientes, total: totales },
  });
});

// ===================================================================
// Campana in-app (Fase 3): estado leido/no-leido por notificacion.
//
// IMPORTANTE: las rutas estaticas (/unread-count, /leer-todas) se declaran
// ANTES de la dinamica /:id/leer para evitar shadowing.
// ===================================================================

/**
 * GET /api/notificaciones/unread-count
 * Cuenta de notificaciones no leidas del usuario autenticado (badge de la campana).
 */
router.get("/unread-count", async (req, res) => {
  const count = await prisma.notificaciones.count({
    where: { destinatario_id: req.user!.id, leido: false },
  });
  res.json({ count });
});

/**
 * POST /api/notificaciones/leer-todas
 * Marca como leidas todas las notificaciones no leidas del usuario.
 */
router.post("/leer-todas", async (req, res) => {
  const result = await prisma.notificaciones.updateMany({
    where: { destinatario_id: req.user!.id, leido: false },
    data: { leido: true, leido_at: new Date() },
  });
  res.json({ ok: true, count: result.count });
});

/**
 * POST /api/notificaciones/:id/leer
 * Marca una notificacion del usuario como leida. updateMany con filtro por
 * destinatario asegura que no se pueda marcar la de otro usuario.
 */
router.post("/:id/leer", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  await prisma.notificaciones.updateMany({
    where: { id: BigInt(id), destinatario_id: req.user!.id },
    data: { leido: true, leido_at: new Date() },
  });
  res.json({ ok: true });
});

export default router;
