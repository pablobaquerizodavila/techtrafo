/**
 * CRUD de catálogos de producción (migration 013):
 *   - produccion.areas
 *   - produccion.causas_demora
 *
 * Lectura: cualquiera con permiso ot.read
 * Escritura: solo admin.roles (super_admin o admin con permiso de admin)
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client";
import { withAppUser } from "../db/withAppUser";
import { requireAuth, requirePermission } from "../auth/middleware";

const router = Router();
router.use(requireAuth);

// ===================================================================
// Áreas
// ===================================================================
const areaSchema = z.object({
  codigo: z.string().trim().min(2).max(30).regex(/^[a-z0-9_]+$/, "solo minúsculas, números y _"),
  nombre: z.string().trim().min(2).max(80),
  descripcion: z.string().optional().nullable(),
  color_hex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  orden: z.number().int().min(0).default(0),
  activo: z.boolean().default(true),
});

router.get("/areas", requirePermission("ot", "read"), async (_req, res) => {
  const data = await prisma.areas.findMany({ orderBy: [{ orden: "asc" }, { nombre: "asc" }] });
  res.json({ data });
});

router.post("/areas", requirePermission("ot", "write"), async (req, res) => {
  const parsed = areaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const a = await withAppUser(req.user!.id, (tx) =>
      tx.areas.create({
        data: {
          codigo: parsed.data.codigo,
          nombre: parsed.data.nombre,
          descripcion: parsed.data.descripcion ?? null,
          color_hex: parsed.data.color_hex ?? "#64748b",
          orden: parsed.data.orden,
          activo: parsed.data.activo,
        },
      }),
    );
    res.status(201).json({ data: a });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "P2002") {
      res.status(409).json({ error: "duplicado", message: "Ya existe un área con ese código" });
      return;
    }
    throw err;
  }
});

router.patch("/areas/:id", requirePermission("ot", "write"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = areaSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const a = await withAppUser(req.user!.id, (tx) =>
    tx.areas.update({ where: { id }, data: parsed.data }),
  );
  res.json({ data: a });
});

// ===================================================================
// Causas de demora
// ===================================================================
const causaSchema = z.object({
  codigo: z.string().trim().min(2).max(40).regex(/^[a-z0-9_]+$/, "solo minúsculas, números y _"),
  nombre: z.string().trim().min(2).max(120),
  categoria: z.enum(["materiales", "personal", "calidad", "tecnica", "cliente", "operativa", "otra"]).default("operativa"),
  activo: z.boolean().default(true),
});

router.get("/causas-demora", requirePermission("ot", "read"), async (_req, res) => {
  const data = await prisma.causas_demora.findMany({ orderBy: [{ categoria: "asc" }, { nombre: "asc" }] });
  res.json({ data });
});

router.post("/causas-demora", requirePermission("ot", "write"), async (req, res) => {
  const parsed = causaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const c = await withAppUser(req.user!.id, (tx) => tx.causas_demora.create({ data: parsed.data }));
    res.status(201).json({ data: c });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "P2002") {
      res.status(409).json({ error: "duplicado", message: "Ya existe una causa con ese código" });
      return;
    }
    throw err;
  }
});

router.patch("/causas-demora/:id", requirePermission("ot", "write"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = causaSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const c = await withAppUser(req.user!.id, (tx) =>
    tx.causas_demora.update({ where: { id }, data: parsed.data }),
  );
  res.json({ data: c });
});

// ===================================================================
// Registrar tiempos de trabajo
// ===================================================================
const tiempoSchema = z.object({
  ot_id: z.number().int().positive(),
  paso_id: z.number().int().positive().optional().nullable(),
  area_id: z.number().int().positive().optional().nullable(),
  fecha: z.string().optional().nullable(),
  horas: z.number().positive().max(24),
  descripcion: z.string().optional().nullable(),
});

router.post("/tiempos", requirePermission("ot", "write"), async (req, res) => {
  const parsed = tiempoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;
  const d = parsed.data;

  // Inferir area desde el paso si no vino explícita
  let areaId: number | null = d.area_id ?? null;
  if (!areaId && d.paso_id) {
    const paso = await prisma.ot_pasos.findUnique({ where: { id: d.paso_id }, select: { area_id: true } });
    if (paso?.area_id) areaId = Number(paso.area_id);
  }

  const t = await withAppUser(userId, (tx) =>
    tx.tiempos_trabajo.create({
      data: {
        ot_id: d.ot_id,
        paso_id: d.paso_id ?? null,
        area_id: areaId,
        usuario_id: userId,
        fecha: d.fecha ? new Date(d.fecha) : new Date(),
        horas: d.horas,
        descripcion: d.descripcion ?? null,
      },
    }),
  );
  res.status(201).json({ data: t });
});

router.get("/tiempos", requirePermission("ot", "read"), async (req, res) => {
  const ot_id = req.query.ot_id ? Number(req.query.ot_id) : undefined;
  const data = await prisma.tiempos_trabajo.findMany({
    where: ot_id ? { ot_id } : {},
    orderBy: [{ fecha: "desc" }, { created_at: "desc" }],
    take: 200,
    include: {
      areas: { select: { codigo: true, nombre: true, color_hex: true } },
      usuarios: { select: { id: true, nombres: true, apellidos: true } },
      ot_pasos: { select: { id: true, numero: true, nombre: true } },
    },
  });
  res.json({ data });
});

// ===================================================================
// Reprocesos
// ===================================================================
const reprocesoSchema = z.object({
  ot_id: z.number().int().positive(),
  paso_id: z.number().int().positive().optional().nullable(),
  causa_demora_id: z.number().int().positive(),
  descripcion: z.string().min(3).max(2000),
  dias_perdidos: z.number().min(0).max(365).default(0),
  costo_estimado: z.number().min(0).optional().nullable(),
});

router.post("/reprocesos", requirePermission("ot", "write"), async (req, res) => {
  const parsed = reprocesoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;
  const r = await withAppUser(userId, (tx) =>
    tx.reprocesos.create({
      data: {
        ot_id: parsed.data.ot_id,
        paso_id: parsed.data.paso_id ?? null,
        causa_demora_id: parsed.data.causa_demora_id,
        descripcion: parsed.data.descripcion,
        dias_perdidos: parsed.data.dias_perdidos,
        costo_estimado: parsed.data.costo_estimado ?? null,
        reportado_por: userId,
      },
    }),
  );
  res.status(201).json({ data: r });
});

router.get("/reprocesos", requirePermission("ot", "read"), async (req, res) => {
  const ot_id = req.query.ot_id ? Number(req.query.ot_id) : undefined;
  const data = await prisma.reprocesos.findMany({
    where: ot_id ? { ot_id } : {},
    orderBy: { created_at: "desc" },
    take: 200,
    include: {
      causas_demora: { select: { codigo: true, nombre: true, categoria: true } },
      ot_pasos: { select: { id: true, numero: true, nombre: true } },
      ot: { select: { id: true, codigo: true } },
    },
  });
  res.json({ data });
});

router.post("/reprocesos/:id/resolver", requirePermission("ot", "write"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const notas = typeof req.body?.notas === "string" ? req.body.notas : null;
  const r = await withAppUser(req.user!.id, (tx) =>
    tx.reprocesos.update({
      where: { id },
      data: { resuelto: true, fecha_resolucion: new Date(), notas_resolucion: notas },
    }),
  );
  res.json({ data: r });
});

export default router;
