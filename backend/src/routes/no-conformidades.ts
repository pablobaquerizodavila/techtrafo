/**
 * No conformidades — defectos detectados en recepciones de compras.
 *
 * GET  /           Lista paginada (filtros: estado, proveedor_id, recepcion_id, desde, hasta)
 * GET  /:id        Detalle con nc_lineas + recepcion + OC
 * PATCH /:id       Actualizar: estado (solo abierta/en_proceso), accion_tomada, responsable_id, costo_impacto
 * POST /:id/cerrar Transicion a cerrada + fecha_cierre = now()
 */
import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db/client";
import { withAppUser } from "../db/withAppUser";
import { requireAuth, requirePermission } from "../auth/middleware";

const router = Router();
router.use(requireAuth);

function ser(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? Number(val) : val)));
}

router.get("/", requirePermission("compras", "read"), async (req, res) => {
  const parsed = z.object({
    estado: z.enum(["abierta", "en_proceso", "cerrada"]).optional(),
    proveedor_id: z.coerce.number().int().positive().optional(),
    recepcion_id: z.coerce.number().int().positive().optional(),
    desde: z.string().optional(),
    hasta: z.string().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  }).safeParse(req.query);

  if (!parsed.success) {
    res.status(400).json({ error: "invalid_query", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { estado, proveedor_id, recepcion_id, desde, hasta, page, limit } = parsed.data;

  const where: Prisma.no_conformidadesWhereInput = {};
  if (estado) where.estado = estado;
  if (proveedor_id) where.proveedor_id = BigInt(proveedor_id);
  if (recepcion_id) where.recepcion_id = BigInt(recepcion_id);
  if (desde || hasta) {
    const dtFilter: Prisma.DateTimeFilter<"no_conformidades"> = {};
    if (desde) dtFilter.gte = new Date(desde);
    if (hasta) dtFilter.lte = new Date(hasta + "T23:59:59Z");
    where.created_at = dtFilter;
  }

  const [total, rows] = await Promise.all([
    prisma.no_conformidades.count({ where }),
    prisma.no_conformidades.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { created_at: "desc" },
      include: {
        proveedores: { select: { id: true, razon_social: true } },
        recepciones: { select: { id: true, fecha_recepcion: true } },
        _count: { select: { nc_lineas: true } },
      },
    }),
  ]);

  res.json({ data: ser(rows), total, page, limit });
});

router.get("/:id", requirePermission("compras", "read"), async (req, res) => {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const id = BigInt(idNum);
  const nc = await prisma.no_conformidades.findUnique({
    where: { id },
    include: {
      nc_lineas: {
        include: {
          recepcion_lineas: true,
        },
      },
      recepciones: {
        include: {
          ordenes_compra: { select: { id: true, codigo: true } },
        },
      },
      proveedores: { select: { id: true, razon_social: true } },
    },
  });
  if (!nc) { res.status(404).json({ error: "not_found" }); return; }
  res.json({ data: ser(nc) });
});

const patchSchema = z.object({
  accion_tomada: z.string().optional(),
  responsable_id: z.string().uuid().nullable().optional(),
  costo_impacto: z.number().nonnegative().nullable().optional(),
  estado: z.enum(["abierta", "en_proceso"]).optional(),
});

router.patch("/:id", requirePermission("compras", "write"), async (req, res) => {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const id = BigInt(idNum);
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;

  try {
    const updated = await withAppUser(userId, async (tx) => {
      const nc = await tx.no_conformidades.findUnique({ where: { id } });
      if (!nc) throw new Error("not_found");
      if (nc.estado === "cerrada") throw new Error("nc_cerrada");

      const data: Prisma.no_conformidadesUpdateInput = {
        actualizado_por: userId,
        updated_at: new Date(),
      };
      if (parsed.data.accion_tomada !== undefined) data.accion_tomada = parsed.data.accion_tomada;
      if (parsed.data.responsable_id !== undefined) data.responsable_id = parsed.data.responsable_id;
      if (parsed.data.costo_impacto !== undefined) {
        data.costo_impacto = parsed.data.costo_impacto !== null
          ? new Prisma.Decimal(parsed.data.costo_impacto)
          : null;
      }
      if (parsed.data.estado !== undefined) data.estado = parsed.data.estado;

      return tx.no_conformidades.update({ where: { id }, data });
    });
    res.json({ data: ser(updated) });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "not_found") { res.status(404).json({ error: "not_found" }); return; }
      if (err.message === "nc_cerrada") { res.status(409).json({ error: "nc_cerrada" }); return; }
    }
    throw err;
  }
});

router.post("/:id/cerrar", requirePermission("compras", "write"), async (req, res) => {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const id = BigInt(idNum);
  const userId = req.user!.id;

  try {
    const updated = await withAppUser(userId, async (tx) => {
      const nc = await tx.no_conformidades.findUnique({ where: { id } });
      if (!nc) throw new Error("not_found");
      if (nc.estado === "cerrada") throw new Error("nc_ya_cerrada");
      return tx.no_conformidades.update({
        where: { id },
        data: {
          estado: "cerrada",
          fecha_cierre: new Date(),
          actualizado_por: userId,
          updated_at: new Date(),
        },
      });
    });
    res.json({ data: ser(updated) });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "not_found") { res.status(404).json({ error: "not_found" }); return; }
      if (err.message === "nc_ya_cerrada") { res.status(409).json({ error: "nc_ya_cerrada" }); return; }
    }
    throw err;
  }
});

export default router;
