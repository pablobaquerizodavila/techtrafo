/**
 * CRUD de plantillas de cotizacion.
 *
 * Las plantillas tienen un encabezado (cotizacion_plantillas) y N componentes
 * (plantilla_componentes). Solo roles override pueden modificarlas; cualquier
 * usuario con permiso cotizaciones.read puede listarlas para usarlas.
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
const categoriaEnum = z.enum([
  "materia_prima", "consumible", "mano_obra", "servicio_externo",
  "ensayo", "transporte", "documentacion", "garantia",
  "indirecto", "imprevisto", "otro",
]);

const ROLES_OVERRIDE = ["presidencia", "gerencia_general", "gerencia_comercial"];

function esOverride(rolNombre: string | null, esSuperAdmin: boolean): boolean {
  if (esSuperAdmin) return true;
  return !!rolNombre && ROLES_OVERRIDE.includes(rolNombre);
}

const componenteSchema = z.object({
  id: z.number().int().positive().optional(),
  orden: z.number().int().nonnegative().default(1),
  categoria: categoriaEnum,
  item_id: z.number().int().positive().nullable().optional(),
  descripcion: z.string().min(1).max(500),
  cantidad_default: z.number().nonnegative(),
  unidad_medida: z.string().max(20).default("unid"),
  precio_unitario_default: z.number().nonnegative(),
  costo_unitario_default: z.number().nonnegative().nullable().optional(),
  tiempo_aprovisionamiento_default: z.number().int().nonnegative().default(0),
  notas: z.string().nullable().optional(),
});

const createSchema = z.object({
  codigo: z.string().min(2).max(30),
  nombre: z.string().min(2).max(200),
  descripcion: z.string().nullable().optional(),
  tipo_servicio: tipoServicioEnum,
  capacidad_kva_min: z.number().int().positive().nullable().optional(),
  capacidad_kva_max: z.number().int().positive().nullable().optional(),
  margen_porcentaje_default: z.number().min(0).max(200).default(25),
  contingencia_porcentaje: z.number().min(0).max(100).default(5),
  iva_porcentaje_default: z.number().min(0).max(50).default(15),
  tiempo_entrega_base_dias: z.number().int().nonnegative().default(30),
  condiciones_pago_default: z.string().nullable().optional(),
  observaciones_default: z.string().nullable().optional(),
  activo: z.boolean().default(true),
  componentes: z.array(componenteSchema).default([]),
});

const updateSchema = createSchema.partial();

// -------------------------------------------------------------------
// GET /api/cotizacion-plantillas
// -------------------------------------------------------------------
router.get("/", requirePermission("cotizaciones", "read"), async (req, res) => {
  const activo = req.query.activo === "false" ? false : true;
  const tipo = req.query.tipo_servicio as string | undefined;
  const where: Prisma.cotizacion_plantillasWhereInput = { activo };
  if (tipo && ["reparacion","fabricacion","mantenimiento","otro"].includes(tipo)) {
    where.tipo_servicio = tipo;
  }
  const data = await prisma.cotizacion_plantillas.findMany({
    where,
    orderBy: { nombre: "asc" },
    select: {
      id: true, codigo: true, nombre: true, descripcion: true, tipo_servicio: true,
      capacidad_kva_min: true, capacidad_kva_max: true,
      margen_porcentaje_default: true, contingencia_porcentaje: true,
      iva_porcentaje_default: true, tiempo_entrega_base_dias: true,
      activo: true, created_at: true,
      _count: { select: { plantilla_componentes: true } },
    },
  });
  res.json({ data });
});

// -------------------------------------------------------------------
// GET /api/cotizacion-plantillas/:id
// -------------------------------------------------------------------
router.get("/:id", requirePermission("cotizaciones", "read"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const data = await prisma.cotizacion_plantillas.findUnique({
    where: { id },
    include: {
      plantilla_componentes: {
        orderBy: { orden: "asc" },
        include: { items: { select: { id: true, codigo: true, nombre: true } } },
      },
    },
  });
  if (!data) { res.status(404).json({ error: "not_found" }); return; }
  res.json({ data });
});

// -------------------------------------------------------------------
// POST /api/cotizacion-plantillas  (solo override)
// -------------------------------------------------------------------
router.post("/", requirePermission("cotizaciones", "write"), async (req, res) => {
  if (!esOverride(req.user!.rol_nombre ?? null, req.user!.es_super_admin)) {
    res.status(403).json({ error: "rol_no_designado" });
    return;
  }
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;
  const d = parsed.data;
  try {
    const plantilla = await withAppUser(userId, async (tx) => {
      return tx.cotizacion_plantillas.create({
        data: {
          codigo: d.codigo,
          nombre: d.nombre,
          descripcion: d.descripcion ?? null,
          tipo_servicio: d.tipo_servicio,
          capacidad_kva_min: d.capacidad_kva_min ?? null,
          capacidad_kva_max: d.capacidad_kva_max ?? null,
          margen_porcentaje_default: d.margen_porcentaje_default,
          contingencia_porcentaje: d.contingencia_porcentaje,
          iva_porcentaje_default: d.iva_porcentaje_default,
          tiempo_entrega_base_dias: d.tiempo_entrega_base_dias,
          condiciones_pago_default: d.condiciones_pago_default ?? null,
          observaciones_default: d.observaciones_default ?? null,
          activo: d.activo,
          usuarios_cotizacion_plantillas_creado_porTousuarios: { connect: { id: userId } },
          usuarios_cotizacion_plantillas_actualizado_porTousuarios: { connect: { id: userId } },
          plantilla_componentes: {
            create: d.componentes.map((c, i) => ({
              orden: c.orden ?? i + 1,
              categoria: c.categoria,
              item_id: c.item_id ?? null,
              descripcion: c.descripcion,
              cantidad_default: c.cantidad_default,
              unidad_medida: c.unidad_medida,
              precio_unitario_default: c.precio_unitario_default,
              costo_unitario_default: c.costo_unitario_default ?? null,
              tiempo_aprovisionamiento_default: c.tiempo_aprovisionamiento_default,
              notas: c.notas ?? null,
            })),
          },
        },
        include: { plantilla_componentes: { orderBy: { orden: "asc" } } },
      });
    });
    res.status(201).json({ data: plantilla });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      res.status(409).json({ error: "codigo_duplicado" });
      return;
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// PATCH /api/cotizacion-plantillas/:id  (solo override)
// -------------------------------------------------------------------
router.patch("/:id", requirePermission("cotizaciones", "write"), async (req, res) => {
  if (!esOverride(req.user!.rol_nombre ?? null, req.user!.es_super_admin)) {
    res.status(403).json({ error: "rol_no_designado" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;
  const d = parsed.data;
  try {
    const updated = await withAppUser(userId, async (tx) => {
      const exist = await tx.cotizacion_plantillas.findUnique({ where: { id } });
      if (!exist) throw new Error("not_found");

      const updateData: Prisma.cotizacion_plantillasUpdateInput = {
        usuarios_cotizacion_plantillas_actualizado_porTousuarios: { connect: { id: userId } },
      };
      if (d.codigo !== undefined) updateData.codigo = d.codigo;
      if (d.nombre !== undefined) updateData.nombre = d.nombre;
      if (d.descripcion !== undefined) updateData.descripcion = d.descripcion;
      if (d.tipo_servicio !== undefined) updateData.tipo_servicio = d.tipo_servicio;
      if (d.capacidad_kva_min !== undefined) updateData.capacidad_kva_min = d.capacidad_kva_min;
      if (d.capacidad_kva_max !== undefined) updateData.capacidad_kva_max = d.capacidad_kva_max;
      if (d.margen_porcentaje_default !== undefined) updateData.margen_porcentaje_default = d.margen_porcentaje_default;
      if (d.contingencia_porcentaje !== undefined) updateData.contingencia_porcentaje = d.contingencia_porcentaje;
      if (d.iva_porcentaje_default !== undefined) updateData.iva_porcentaje_default = d.iva_porcentaje_default;
      if (d.tiempo_entrega_base_dias !== undefined) updateData.tiempo_entrega_base_dias = d.tiempo_entrega_base_dias;
      if (d.condiciones_pago_default !== undefined) updateData.condiciones_pago_default = d.condiciones_pago_default;
      if (d.observaciones_default !== undefined) updateData.observaciones_default = d.observaciones_default;
      if (d.activo !== undefined) updateData.activo = d.activo;

      // Si vienen componentes, reemplazar todos
      if (d.componentes !== undefined) {
        await tx.plantilla_componentes.deleteMany({ where: { plantilla_id: id } });
        await tx.plantilla_componentes.createMany({
          data: d.componentes.map((c, i) => ({
            plantilla_id: id,
            orden: c.orden ?? i + 1,
            categoria: c.categoria,
            item_id: c.item_id ?? null,
            descripcion: c.descripcion,
            cantidad_default: c.cantidad_default,
            unidad_medida: c.unidad_medida,
            precio_unitario_default: c.precio_unitario_default,
            costo_unitario_default: c.costo_unitario_default ?? null,
            tiempo_aprovisionamiento_default: c.tiempo_aprovisionamiento_default,
            notas: c.notas ?? null,
          })),
        });
      }

      return tx.cotizacion_plantillas.update({
        where: { id },
        data: updateData,
        include: { plantilla_componentes: { orderBy: { orden: "asc" } } },
      });
    });
    res.json({ data: updated });
  } catch (err) {
    if (err instanceof Error && err.message === "not_found") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      res.status(409).json({ error: "codigo_duplicado" });
      return;
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// DELETE /api/cotizacion-plantillas/:id  (soft = activo=false)
// -------------------------------------------------------------------
router.delete("/:id", requirePermission("cotizaciones", "write"), async (req, res) => {
  if (!esOverride(req.user!.rol_nombre ?? null, req.user!.es_super_admin)) {
    res.status(403).json({ error: "rol_no_designado" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  await withAppUser(req.user!.id, async (tx) => {
    await tx.cotizacion_plantillas.update({
      where: { id },
      data: {
        activo: false,
        usuarios_cotizacion_plantillas_actualizado_porTousuarios: { connect: { id: req.user!.id } },
      },
    });
  });
  res.status(204).end();
});

export default router;
