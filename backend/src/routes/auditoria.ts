/**
 * Trazabilidad — vista de cambios sobre una OT y sus pasos (Dashboard E).
 *
 * Lee de core.auditoria que es alimentada por el trigger fn_auditar
 * que ya esta aplicado a todas las tablas de negocio.
 */
import { Router } from "express";
import { prisma } from "../db/client";
import { requireAuth, requirePermission } from "../auth/middleware";

const router = Router();
router.use(requireAuth);

interface AuditFila {
  id: bigint;
  usuario_id: string | null;
  modulo: string;
  accion: string;
  entidad: string | null;
  entidad_id: string | null;
  valor_anterior: unknown;
  valor_nuevo: unknown;
  created_at: Date;
}

// -------------------------------------------------------------------
// GET /api/auditoria/ot/:id  -  todos los cambios sobre una OT
// -------------------------------------------------------------------
router.get("/ot/:id", requirePermission("ot", "read"), async (req, res) => {
  const otId = Number(req.params.id);
  if (!Number.isInteger(otId) || otId <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  // Obtener ids de pasos y evidencias de la OT para filtrar
  const [pasos, evidencias] = await Promise.all([
    prisma.ot_pasos.findMany({ where: { ot_id: otId }, select: { id: true } }),
    prisma.ot_evidencias.findMany({ where: { ot_id: otId }, select: { id: true } }),
  ]);
  const pasoIds = pasos.map((p) => String(p.id));
  const evIds = evidencias.map((e) => String(e.id));

  // Query directa para filtrar por entidad+entidad_id en una sola pasada
  const filas = await prisma.$queryRaw<AuditFila[]>`
    SELECT id, usuario_id::text, modulo, accion, entidad, entidad_id,
           valor_anterior, valor_nuevo, created_at
      FROM core.auditoria
     WHERE (entidad = 'produccion.ot'         AND entidad_id = ${String(otId)})
        OR (entidad = 'produccion.ot_pasos'   AND entidad_id = ANY(${pasoIds}::text[]))
        OR (entidad = 'produccion.ot_evidencias' AND entidad_id = ANY(${evIds}::text[]))
        OR (entidad = 'produccion.tiempos_trabajo' AND valor_nuevo->>'ot_id' = ${String(otId)})
        OR (entidad = 'produccion.reprocesos'      AND valor_nuevo->>'ot_id' = ${String(otId)})
     ORDER BY created_at DESC
     LIMIT 500
  `;

  // Cargar nombres de usuarios mencionados
  const userIds = Array.from(new Set(filas.map((f) => f.usuario_id).filter((u): u is string => !!u)));
  const usuarios = userIds.length
    ? await prisma.usuarios.findMany({
        where: { id: { in: userIds } },
        select: { id: true, nombres: true, apellidos: true, email: true },
      })
    : [];
  const userMap = new Map(usuarios.map((u) => [u.id, u]));

  res.json({
    data: filas.map((f) => ({
      ...f,
      id: Number(f.id),
      usuario: f.usuario_id ? userMap.get(f.usuario_id) ?? null : null,
    })),
  });
});

// -------------------------------------------------------------------
// GET /api/auditoria/expediente/:id  -  cambios sobre un expediente
// -------------------------------------------------------------------
router.get("/expediente/:id", requirePermission("expedientes", "read"), async (req, res) => {
  const expId = Number(req.params.id);
  if (!Number.isInteger(expId) || expId <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const hitos = await prisma.expediente_hitos.findMany({
    where: { expediente_id: expId },
    select: { id: true },
  });
  const hitoIds = hitos.map((h) => String(h.id));

  const filas = await prisma.$queryRaw<AuditFila[]>`
    SELECT id, usuario_id::text, modulo, accion, entidad, entidad_id,
           valor_anterior, valor_nuevo, created_at
      FROM core.auditoria
     WHERE (entidad = 'comercial.expedientes'       AND entidad_id = ${String(expId)})
        OR (entidad = 'comercial.expediente_hitos' AND entidad_id = ANY(${hitoIds}::text[]))
     ORDER BY created_at DESC
     LIMIT 500
  `;
  const userIds = Array.from(new Set(filas.map((f) => f.usuario_id).filter((u): u is string => !!u)));
  const usuarios = userIds.length
    ? await prisma.usuarios.findMany({
        where: { id: { in: userIds } },
        select: { id: true, nombres: true, apellidos: true, email: true },
      })
    : [];
  const userMap = new Map(usuarios.map((u) => [u.id, u]));

  res.json({
    data: filas.map((f) => ({
      ...f,
      id: Number(f.id),
      usuario: f.usuario_id ? userMap.get(f.usuario_id) ?? null : null,
    })),
  });
});

export default router;
