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
  }>>`
    SELECT n.id, n.tipo, n.asunto, n.enviado, n.fecha_envio, n.contexto, n.created_at
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

export default router;
