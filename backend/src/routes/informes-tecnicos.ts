import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import { withAppUser } from "../db/withAppUser";
import { requireAuth, requirePermission } from "../auth/middleware";

const router = Router();
router.use(requireAuth);

const decisionTecnicaEnum = z.enum(["reparar", "reconstruir", "mantenimiento", "no_viable"]);
const estadoInformeEnum = z.enum(["borrador", "en_revision", "aprobado", "rechazado"]);

const createSchema = z.object({
  expediente_id: z.number().int().positive(),
  hito_id: z.number().int().positive().optional().nullable(),
  visita_id: z.number().int().positive().optional().nullable(),
  diagnostico_completo: z.string().optional().nullable(),
  decision_tecnica: decisionTecnicaEnum.optional().nullable(),
  justificacion: z.string().optional().nullable(),
});

const updateSchema = z.object({
  diagnostico_completo: z.string().optional().nullable(),
  decision_tecnica: decisionTecnicaEnum.optional().nullable(),
  justificacion: z.string().optional().nullable(),
  archivo_pdf_url: z.string().optional().nullable(),
  estado: estadoInformeEnum.optional(),
});

async function generarNumeroInforme(tx: Prisma.TransactionClient, year: number): Promise<string> {
  const prefix = `INF-${year}-`;
  const result = await tx.$queryRaw<{ max_num: number | null }[]>`
    SELECT COALESCE(MAX(CAST(SPLIT_PART(numero, '-', 3) AS INTEGER)), 0) AS max_num
    FROM comercial.informes_tecnicos
    WHERE numero LIKE ${prefix + "%"}
  `;
  const nextNum = (result[0]?.max_num ?? 0) + 1;
  return `${prefix}${String(nextNum).padStart(4, "0")}`;
}

router.get("/", requirePermission("expedientes", "read"), async (req, res) => {
  const expediente_id = req.query.expediente_id ? Number(req.query.expediente_id) : undefined;
  const data = await prisma.informes_tecnicos.findMany({
    where: expediente_id ? { expediente_id } : {},
    orderBy: { created_at: "desc" },
    take: 200,
    include: {
      expedientes: { select: { id: true, codigo: true } },
      visitas_tecnicas: { select: { id: true, fecha_realizada: true } },
    },
  });
  res.json({ data });
});

router.get("/:id", requirePermission("expedientes", "read"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const inf = await prisma.informes_tecnicos.findUnique({
    where: { id },
    include: {
      expedientes: { select: { id: true, codigo: true, clientes: { select: { razon_social: true } } } },
      visitas_tecnicas: true,
    },
  });
  if (!inf) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ data: inf });
});

router.post("/", requirePermission("expedientes", "write"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;
  const d = parsed.data;

  const inf = await withAppUser(userId, async (tx) => {
    const year = new Date().getFullYear();
    const numero = await generarNumeroInforme(tx, year);
    return tx.informes_tecnicos.create({
      data: {
        expediente_id: d.expediente_id,
        hito_id: d.hito_id ?? null,
        visita_id: d.visita_id ?? null,
        numero,
        diagnostico_completo: d.diagnostico_completo ?? null,
        decision_tecnica: d.decision_tecnica ?? null,
        justificacion: d.justificacion ?? null,
        estado: "borrador",
        creado_por: userId,
        actualizado_por: userId,
      },
    });
  });
  res.status(201).json({ data: inf });
});

router.patch("/:id", requirePermission("expedientes", "write"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;
  const d = parsed.data;

  try {
    await withAppUser(userId, async (tx) => {
      const existing = await tx.informes_tecnicos.findUnique({ where: { id } });
      if (!existing) throw new Error("not_found");

      if (d.diagnostico_completo !== undefined) {
        await tx.$executeRaw`UPDATE comercial.informes_tecnicos SET diagnostico_completo = ${d.diagnostico_completo} WHERE id = ${id}`;
      }
      if (d.decision_tecnica !== undefined) {
        await tx.$executeRaw`UPDATE comercial.informes_tecnicos SET decision_tecnica = ${d.decision_tecnica} WHERE id = ${id}`;
      }
      if (d.justificacion !== undefined) {
        await tx.$executeRaw`UPDATE comercial.informes_tecnicos SET justificacion = ${d.justificacion} WHERE id = ${id}`;
      }
      if (d.archivo_pdf_url !== undefined) {
        await tx.$executeRaw`UPDATE comercial.informes_tecnicos SET archivo_pdf_url = ${d.archivo_pdf_url} WHERE id = ${id}`;
      }
      if (d.estado !== undefined) {
        await tx.$executeRaw`UPDATE comercial.informes_tecnicos SET estado = ${d.estado} WHERE id = ${id}`;
        if (d.estado === "aprobado") {
          await tx.$executeRaw`
            UPDATE comercial.informes_tecnicos
               SET aprobado_por = ${userId}::uuid, fecha_aprobacion = NOW()
             WHERE id = ${id}
          `;
        }
      }
      await tx.$executeRaw`UPDATE comercial.informes_tecnicos SET actualizado_por = ${userId}::uuid WHERE id = ${id}`;
    });
    const updated = await prisma.informes_tecnicos.findUnique({ where: { id } });
    res.json({ data: updated });
  } catch (err) {
    if (err instanceof Error && err.message === "not_found") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    throw err;
  }
});

export default router;
