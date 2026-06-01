/**
 * CRUD de plantillas de contrato.
 *
 * Cabecera (contrato_plantillas) con texto de clausulas (variables {{...}})
 * + preset de pagos (contrato_plantilla_pagos, en %). Solo roles override
 * modifican; cualquier usuario con contratos.read las lista para usarlas.
 */
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import { withAppUser } from "../db/withAppUser";
import { requireAuth, requirePermission } from "../auth/middleware";

const router = Router();
router.use(requireAuth);

const tipoServicioEnum = z.enum(["reparacion", "fabricacion", "mantenimiento", "otro"]);
const tipoPagoEnum = z.enum(["anticipo", "hito", "saldo"]);
const condicionEnum = z.enum(["fecha_fija", "manual", "al_completar_ot", "al_pasar_gate", "al_entregar"]);
const planPagoEnum = z.enum(["anticipo_y_saldo", "hitos", "mensual", "contado", "otro"]);

const ROLES_OVERRIDE = ["presidencia", "gerencia_general", "gerencia_comercial"];
function esOverride(rolNombre: string | null, esSuperAdmin: boolean): boolean {
  if (esSuperAdmin) return true;
  return !!rolNombre && ROLES_OVERRIDE.includes(rolNombre);
}

const pagoSchema = z.object({
  numero: z.number().int().positive(),
  tipo: tipoPagoEnum,
  descripcion: z.string().max(500).nullable().optional(),
  condicion_disparo: condicionEnum.nullable().optional(),
  monto_porcentaje: z.number().min(0).max(100).nullable().optional(),
});

const createSchema = z.object({
  codigo: z.string().min(2).max(30),
  nombre: z.string().min(2).max(200),
  descripcion: z.string().nullable().optional(),
  tipo_servicio: tipoServicioEnum.default("otro"),
  clausulas: z.string().nullable().optional(),
  plan_pago_tipo: planPagoEnum.default("anticipo_y_saldo"),
  activo: z.boolean().default(true),
  pagos: z.array(pagoSchema).default([]),
});
const updateSchema = createSchema.partial();

// -------------------------------------------------------------------
// GET /api/contrato-plantillas
// -------------------------------------------------------------------
router.get("/", requirePermission("contratos", "read"), async (req, res) => {
  const activo = req.query.activo === "false" ? false : true;
  const tipo = req.query.tipo_servicio as string | undefined;
  const where: Prisma.contrato_plantillasWhereInput = { activo };
  if (tipo && ["reparacion", "fabricacion", "mantenimiento", "otro"].includes(tipo)) {
    where.tipo_servicio = tipo;
  }
  const data = await prisma.contrato_plantillas.findMany({
    where,
    orderBy: { nombre: "asc" },
    select: {
      id: true, codigo: true, nombre: true, descripcion: true, tipo_servicio: true,
      plan_pago_tipo: true, activo: true, created_at: true,
      _count: { select: { pagos: true } },
    },
  });
  res.json({ data });
});

// -------------------------------------------------------------------
// GET /api/contrato-plantillas/:id
// -------------------------------------------------------------------
router.get("/:id", requirePermission("contratos", "read"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const data = await prisma.contrato_plantillas.findUnique({
    where: { id },
    include: { pagos: { orderBy: { numero: "asc" } } },
  });
  if (!data) { res.status(404).json({ error: "not_found" }); return; }
  res.json({ data });
});

// -------------------------------------------------------------------
// POST /api/contrato-plantillas  (solo override)
// -------------------------------------------------------------------
router.post("/", requirePermission("contratos", "write"), async (req, res) => {
  if (!esOverride(req.user!.rol_nombre ?? null, req.user!.es_super_admin)) {
    res.status(403).json({ error: "rol_no_designado" }); return;
  }
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors }); return;
  }
  const userId = req.user!.id;
  const d = parsed.data;
  try {
    const plantilla = await withAppUser(userId, (tx) =>
      tx.contrato_plantillas.create({
        data: {
          codigo: d.codigo,
          nombre: d.nombre,
          descripcion: d.descripcion ?? null,
          tipo_servicio: d.tipo_servicio,
          clausulas: d.clausulas ?? null,
          plan_pago_tipo: d.plan_pago_tipo,
          activo: d.activo,
          creado_por: userId,
          actualizado_por: userId,
          pagos: {
            create: d.pagos.map((p, i) => ({
              numero: p.numero ?? i + 1,
              tipo: p.tipo,
              descripcion: p.descripcion ?? null,
              condicion_disparo: p.condicion_disparo ?? null,
              monto_porcentaje: p.monto_porcentaje ?? null,
            })),
          },
        },
        include: { pagos: { orderBy: { numero: "asc" } } },
      }),
    );
    res.status(201).json({ data: plantilla });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      res.status(409).json({ error: "codigo_duplicado" }); return;
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// PATCH /api/contrato-plantillas/:id  (solo override)
// -------------------------------------------------------------------
router.patch("/:id", requirePermission("contratos", "write"), async (req, res) => {
  if (!esOverride(req.user!.rol_nombre ?? null, req.user!.es_super_admin)) {
    res.status(403).json({ error: "rol_no_designado" }); return;
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors }); return;
  }
  const userId = req.user!.id;
  const d = parsed.data;
  try {
    const updated = await withAppUser(userId, async (tx) => {
      const exist = await tx.contrato_plantillas.findUnique({ where: { id } });
      if (!exist) throw new Error("not_found");

      const updateData: Prisma.contrato_plantillasUpdateInput = { actualizado_por: userId };
      if (d.codigo !== undefined) updateData.codigo = d.codigo;
      if (d.nombre !== undefined) updateData.nombre = d.nombre;
      if (d.descripcion !== undefined) updateData.descripcion = d.descripcion;
      if (d.tipo_servicio !== undefined) updateData.tipo_servicio = d.tipo_servicio;
      if (d.clausulas !== undefined) updateData.clausulas = d.clausulas;
      if (d.plan_pago_tipo !== undefined) updateData.plan_pago_tipo = d.plan_pago_tipo;
      if (d.activo !== undefined) updateData.activo = d.activo;

      if (d.pagos !== undefined) {
        await tx.contrato_plantilla_pagos.deleteMany({ where: { plantilla_id: id } });
        await tx.contrato_plantilla_pagos.createMany({
          data: d.pagos.map((p, i) => ({
            plantilla_id: id,
            numero: p.numero ?? i + 1,
            tipo: p.tipo,
            descripcion: p.descripcion ?? null,
            condicion_disparo: p.condicion_disparo ?? null,
            monto_porcentaje: p.monto_porcentaje ?? null,
          })),
        });
      }

      return tx.contrato_plantillas.update({
        where: { id },
        data: updateData,
        include: { pagos: { orderBy: { numero: "asc" } } },
      });
    });
    res.json({ data: updated });
  } catch (err) {
    if (err instanceof Error && err.message === "not_found") {
      res.status(404).json({ error: "not_found" }); return;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      res.status(409).json({ error: "codigo_duplicado" }); return;
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// DELETE /api/contrato-plantillas/:id  (soft = activo=false)
// -------------------------------------------------------------------
router.delete("/:id", requirePermission("contratos", "write"), async (req, res) => {
  if (!esOverride(req.user!.rol_nombre ?? null, req.user!.es_super_admin)) {
    res.status(403).json({ error: "rol_no_designado" }); return;
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  await withAppUser(req.user!.id, (tx) =>
    tx.contrato_plantillas.update({ where: { id }, data: { activo: false, actualizado_por: req.user!.id } }),
  );
  res.status(204).end();
});

export default router;
