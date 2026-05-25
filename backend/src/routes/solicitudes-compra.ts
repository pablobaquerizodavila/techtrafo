/**
 * Solicitudes Internas de Compra (SC).
 *
 * Flujo:
 *   borrador -> enviada -> aprobada -> convertida_en_oc
 *                       -> rechazada (puede volver a borrador)
 *                       -> cancelada
 *
 * - Cualquier usuario con permiso compras.read puede listar las que creó
 * - compras.write para crear/editar borradores
 * - compras.aprobar (o override) para aprobar/rechazar
 * - Al convertir a OC, se crea la OC borrador con las mismas líneas y
 *   se enlaza solicitudes.orden_compra_id <-> ordenes_compra.solicitud_id.
 */
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import { withAppUser } from "../db/withAppUser";
import { requireAuth, requirePermission } from "../auth/middleware";

const router = Router();
router.use(requireAuth);

const ROLES_APROBAR = [
  "presidencia",
  "gerencia_general",
  "gerencia_comercial",
  "jefe_compras",
];

function puedeAprobar(user: { rol_nombre: string | null; es_super_admin: boolean; permisos?: any }): boolean {
  if (user.es_super_admin) return true;
  if (user.rol_nombre && ROLES_APROBAR.includes(user.rol_nombre)) return true;
  const p = user.permisos ?? {};
  return p["compras.aprobar"] === true || p.all === true;
}

// -------------------------------------------------------------------
// Schemas
// -------------------------------------------------------------------
const lineaSchema = z.object({
  orden: z.number().int().nonnegative().default(1),
  item_id: z.number().int().positive().nullable().optional(),
  descripcion: z.string().min(1).max(500),
  unidad_medida: z.string().max(20).default("unid"),
  cantidad_solicitada: z.number().positive(),
  precio_referencial: z.number().nonnegative().default(0),
  moneda: z.string().length(3).default("USD"),
  cotizacion_linea_id: z.number().int().positive().nullable().optional(),
  proveedor_sugerido_id: z.number().int().positive().nullable().optional(),
  notas: z.string().nullable().optional(),
});

const createSchema = z.object({
  departamento_solicitante: z.enum([
    "produccion", "ingenieria", "mantenimiento", "bodega",
    "calidad", "comercial", "gerencia", "compras",
  ]),
  cotizacion_id: z.number().int().positive().nullable().optional(),
  expediente_id: z.number().int().positive().nullable().optional(),
  fecha_requerida: z.string().nullable().optional(),
  prioridad: z.enum(["baja", "media", "alta", "urgente", "critica"]).default("media"),
  justificacion: z.string().nullable().optional(),
  observaciones: z.string().nullable().optional(),
  origen: z.enum(["manual", "cotizacion", "stock_minimo", "expediente"]).default("manual"),
  moneda: z.string().length(3).default("USD"),
  lineas: z.array(lineaSchema).min(1),
});

const updateSchema = z.object({
  departamento_solicitante: createSchema.shape.departamento_solicitante.optional(),
  fecha_requerida: z.string().nullable().optional(),
  prioridad: createSchema.shape.prioridad.optional(),
  justificacion: z.string().nullable().optional(),
  observaciones: z.string().nullable().optional(),
  lineas: z.array(lineaSchema).optional(),
});

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------
function calcTotalEstimado(lineas: z.infer<typeof lineaSchema>[]): number {
  return lineas.reduce((acc, l) => acc + Number(l.cantidad_solicitada) * Number(l.precio_referencial || 0), 0);
}

// -------------------------------------------------------------------
// GET /api/solicitudes-compra
// -------------------------------------------------------------------
router.get("/", requirePermission("compras", "read"), async (req, res) => {
  const estado = req.query.estado as string | undefined;
  const departamento = req.query.departamento as string | undefined;
  const cotizacionId = req.query.cotizacion_id ? Number(req.query.cotizacion_id) : undefined;
  const where: Prisma.solicitudesWhereInput = {};
  if (estado) where.estado = estado;
  if (departamento) where.departamento_solicitante = departamento;
  if (cotizacionId) where.cotizacion_id = BigInt(cotizacionId);

  const data = await prisma.solicitudes.findMany({
    where,
    orderBy: [{ fecha_solicitud: "desc" }, { id: "desc" }],
    select: {
      id: true, codigo: true, departamento_solicitante: true, solicitante_id: true,
      cotizacion_id: true, expediente_id: true, fecha_solicitud: true, fecha_requerida: true,
      prioridad: true, estado: true, origen: true, total_estimado: true, moneda: true,
      orden_compra_id: true, created_at: true,
      _count: { select: { solicitud_lineas: true } },
      usuarios_solicitudes_solicitante_idTousuarios: {
        select: { id: true, nombre_completo: true, email: true },
      },
    },
    take: 200,
  });
  res.json({ data });
});

// -------------------------------------------------------------------
// GET /api/solicitudes-compra/:id
// -------------------------------------------------------------------
router.get("/:id", requirePermission("compras", "read"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const data = await prisma.solicitudes.findUnique({
    where: { id: BigInt(id) },
    include: {
      solicitud_lineas: {
        orderBy: { orden: "asc" },
        include: {
          items: { select: { id: true, codigo_interno: true, nombre: true } },
          proveedores: { select: { id: true, codigo: true, razon_social: true } },
        },
      },
      usuarios_solicitudes_solicitante_idTousuarios: {
        select: { id: true, nombre_completo: true, email: true },
      },
      usuarios_solicitudes_aprobador_idTousuarios: {
        select: { id: true, nombre_completo: true, email: true },
      },
      cotizaciones: { select: { id: true, codigo: true, total: true } },
      expedientes: { select: { id: true, codigo: true } },
    },
  });
  if (!data) { res.status(404).json({ error: "not_found" }); return; }
  res.json({ data });
});

// -------------------------------------------------------------------
// POST /api/solicitudes-compra
// -------------------------------------------------------------------
router.post("/", requirePermission("compras", "write"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const d = parsed.data;
  const userId = req.user!.id;
  const total = calcTotalEstimado(d.lineas);

  const sc = await withAppUser(userId, async (tx) => {
    return tx.solicitudes.create({
      data: {
        codigo: "", // trigger genera SC-YYYY-NNNN
        departamento_solicitante: d.departamento_solicitante,
        solicitante_id: userId,
        cotizacion_id: d.cotizacion_id ? BigInt(d.cotizacion_id) : null,
        expediente_id: d.expediente_id ? BigInt(d.expediente_id) : null,
        fecha_requerida: d.fecha_requerida ? new Date(d.fecha_requerida) : null,
        prioridad: d.prioridad,
        justificacion: d.justificacion ?? null,
        observaciones: d.observaciones ?? null,
        estado: "borrador",
        origen: d.origen,
        total_estimado: total,
        moneda: d.moneda,
        creado_por: userId,
        actualizado_por: userId,
        solicitud_lineas: {
          create: d.lineas.map((l, i) => ({
            orden: l.orden ?? i + 1,
            item_id: l.item_id ? BigInt(l.item_id) : null,
            descripcion: l.descripcion,
            unidad_medida: l.unidad_medida,
            cantidad_solicitada: l.cantidad_solicitada,
            precio_referencial: l.precio_referencial,
            moneda: l.moneda,
            cotizacion_linea_id: l.cotizacion_linea_id ? BigInt(l.cotizacion_linea_id) : null,
            proveedor_sugerido_id: l.proveedor_sugerido_id ? BigInt(l.proveedor_sugerido_id) : null,
            notas: l.notas ?? null,
          })),
        },
      },
      include: { solicitud_lineas: { orderBy: { orden: "asc" } } },
    });
  });
  res.status(201).json({ data: sc });
});

// -------------------------------------------------------------------
// PATCH /api/solicitudes-compra/:id  — solo en estado borrador
// -------------------------------------------------------------------
router.patch("/:id", requirePermission("compras", "write"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const d = parsed.data;
  const userId = req.user!.id;

  try {
    const updated = await withAppUser(userId, async (tx) => {
      const exist = await tx.solicitudes.findUnique({ where: { id: BigInt(id) } });
      if (!exist) throw new Error("not_found");
      if (exist.estado !== "borrador") throw new Error("estado_invalido");

      if (d.lineas !== undefined) {
        await tx.solicitud_lineas.deleteMany({ where: { solicitud_id: BigInt(id) } });
        await tx.solicitud_lineas.createMany({
          data: d.lineas.map((l, i) => ({
            solicitud_id: BigInt(id),
            orden: l.orden ?? i + 1,
            item_id: l.item_id ? BigInt(l.item_id) : null,
            descripcion: l.descripcion,
            unidad_medida: l.unidad_medida,
            cantidad_solicitada: l.cantidad_solicitada,
            precio_referencial: l.precio_referencial,
            moneda: l.moneda,
            cotizacion_linea_id: l.cotizacion_linea_id ? BigInt(l.cotizacion_linea_id) : null,
            proveedor_sugerido_id: l.proveedor_sugerido_id ? BigInt(l.proveedor_sugerido_id) : null,
            notas: l.notas ?? null,
          })),
        });
      }

      const updateData: Prisma.solicitudesUpdateInput = {
        usuarios_solicitudes_actualizado_porTousuarios: { connect: { id: userId } },
      };
      if (d.departamento_solicitante !== undefined) updateData.departamento_solicitante = d.departamento_solicitante;
      if (d.fecha_requerida !== undefined) updateData.fecha_requerida = d.fecha_requerida ? new Date(d.fecha_requerida) : null;
      if (d.prioridad !== undefined) updateData.prioridad = d.prioridad;
      if (d.justificacion !== undefined) updateData.justificacion = d.justificacion;
      if (d.observaciones !== undefined) updateData.observaciones = d.observaciones;
      if (d.lineas !== undefined) updateData.total_estimado = calcTotalEstimado(d.lineas);

      return tx.solicitudes.update({
        where: { id: BigInt(id) },
        data: updateData,
        include: { solicitud_lineas: { orderBy: { orden: "asc" } } },
      });
    });
    res.json({ data: updated });
  } catch (err) {
    if (err instanceof Error && err.message === "not_found") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (err instanceof Error && err.message === "estado_invalido") {
      res.status(409).json({ error: "solo_borrador_editable" });
      return;
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// POST /api/solicitudes-compra/:id/enviar
// -------------------------------------------------------------------
router.post("/:id/enviar", requirePermission("compras", "write"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  try {
    const sc = await withAppUser(req.user!.id, async (tx) => {
      const exist = await tx.solicitudes.findUnique({
        where: { id: BigInt(id) },
        include: { solicitud_lineas: true },
      });
      if (!exist) throw new Error("not_found");
      if (exist.estado !== "borrador") throw new Error("estado_invalido");
      if (exist.solicitud_lineas.length === 0) throw new Error("sin_lineas");
      return tx.solicitudes.update({
        where: { id: BigInt(id) },
        data: {
          estado: "enviada",
          usuarios_solicitudes_actualizado_porTousuarios: { connect: { id: req.user!.id } },
        },
      });
    });
    res.json({ data: sc });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "not_found") { res.status(404).json({ error: "not_found" }); return; }
      if (err.message === "estado_invalido") { res.status(409).json({ error: "estado_invalido" }); return; }
      if (err.message === "sin_lineas") { res.status(409).json({ error: "sin_lineas" }); return; }
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// POST /api/solicitudes-compra/:id/aprobar
// -------------------------------------------------------------------
router.post("/:id/aprobar", requirePermission("compras", "read"), async (req, res) => {
  if (!puedeAprobar(req.user! as any)) {
    res.status(403).json({ error: "rol_no_designado", required: "compras.aprobar" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  try {
    const sc = await withAppUser(req.user!.id, async (tx) => {
      const exist = await tx.solicitudes.findUnique({ where: { id: BigInt(id) } });
      if (!exist) throw new Error("not_found");
      if (exist.estado !== "enviada") throw new Error("estado_invalido");
      return tx.solicitudes.update({
        where: { id: BigInt(id) },
        data: {
          estado: "aprobada",
          usuarios_solicitudes_aprobador_idTousuarios: { connect: { id: req.user!.id } },
          fecha_aprobacion: new Date(),
          motivo_rechazo: null,
          usuarios_solicitudes_actualizado_porTousuarios: { connect: { id: req.user!.id } },
        },
      });
    });
    res.json({ data: sc });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "not_found") { res.status(404).json({ error: "not_found" }); return; }
      if (err.message === "estado_invalido") { res.status(409).json({ error: "estado_invalido" }); return; }
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// POST /api/solicitudes-compra/:id/rechazar
// -------------------------------------------------------------------
router.post("/:id/rechazar", requirePermission("compras", "read"), async (req, res) => {
  if (!puedeAprobar(req.user! as any)) {
    res.status(403).json({ error: "rol_no_designado", required: "compras.aprobar" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const motivo = z.string().min(2).max(2000).safeParse(req.body?.motivo);
  if (!motivo.success) { res.status(400).json({ error: "motivo_requerido" }); return; }
  try {
    const sc = await withAppUser(req.user!.id, async (tx) => {
      const exist = await tx.solicitudes.findUnique({ where: { id: BigInt(id) } });
      if (!exist) throw new Error("not_found");
      if (!["enviada", "aprobada"].includes(exist.estado)) throw new Error("estado_invalido");
      return tx.solicitudes.update({
        where: { id: BigInt(id) },
        data: {
          estado: "rechazada",
          usuarios_solicitudes_aprobador_idTousuarios: { connect: { id: req.user!.id } },
          fecha_aprobacion: new Date(),
          motivo_rechazo: motivo.data,
          usuarios_solicitudes_actualizado_porTousuarios: { connect: { id: req.user!.id } },
        },
      });
    });
    res.json({ data: sc });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "not_found") { res.status(404).json({ error: "not_found" }); return; }
      if (err.message === "estado_invalido") { res.status(409).json({ error: "estado_invalido" }); return; }
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// POST /api/solicitudes-compra/:id/cancelar
// -------------------------------------------------------------------
router.post("/:id/cancelar", requirePermission("compras", "write"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  try {
    const sc = await withAppUser(req.user!.id, async (tx) => {
      const exist = await tx.solicitudes.findUnique({ where: { id: BigInt(id) } });
      if (!exist) throw new Error("not_found");
      if (["convertida_en_oc", "cancelada"].includes(exist.estado)) throw new Error("estado_invalido");
      return tx.solicitudes.update({
        where: { id: BigInt(id) },
        data: {
          estado: "cancelada",
          usuarios_solicitudes_actualizado_porTousuarios: { connect: { id: req.user!.id } },
        },
      });
    });
    res.json({ data: sc });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "not_found") { res.status(404).json({ error: "not_found" }); return; }
      if (err.message === "estado_invalido") { res.status(409).json({ error: "estado_invalido" }); return; }
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// POST /api/solicitudes-compra/:id/convertir-en-oc
// Genera una OC borrador a partir de una SC aprobada.
// Body: { proveedor_id }
// -------------------------------------------------------------------
router.post("/:id/convertir-en-oc", requirePermission("compras", "write"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const proveedorId = Number(req.body?.proveedor_id);
  if (!Number.isInteger(proveedorId) || proveedorId <= 0) {
    res.status(400).json({ error: "proveedor_id_requerido" });
    return;
  }
  const userId = req.user!.id;

  try {
    const { oc } = await withAppUser(userId, async (tx) => {
      const sc = await tx.solicitudes.findUnique({
        where: { id: BigInt(id) },
        include: { solicitud_lineas: true },
      });
      if (!sc) throw new Error("not_found");
      if (sc.estado !== "aprobada") throw new Error("solo_aprobadas_convertibles");
      if (sc.orden_compra_id) throw new Error("ya_convertida");
      if (sc.solicitud_lineas.length === 0) throw new Error("sin_lineas");

      const proveedor = await tx.proveedores.findUnique({ where: { id: BigInt(proveedorId) } });
      if (!proveedor) throw new Error("proveedor_inexistente");
      if (proveedor.estado !== "activo") throw new Error("proveedor_no_activo");

      // Para cada linea, intentar resolver precio con item_proveedores; fallback precio_referencial
      const lineasOC: Prisma.orden_compra_lineasCreateManyOrdenes_compraInput[] = [];
      let subtotal = 0;
      for (const [i, l] of sc.solicitud_lineas.entries()) {
        let precio = Number(l.precio_referencial);
        let codigoProveedor: string | null = null;
        if (l.item_id) {
          const rel = await tx.item_proveedores.findUnique({
            where: { item_id_proveedor_id: { item_id: l.item_id, proveedor_id: BigInt(proveedorId) } },
          });
          if (rel) {
            precio = Number(rel.precio_unitario);
            codigoProveedor = rel.codigo_proveedor_item ?? null;
          }
        }
        const cantidad = Number(l.cantidad_solicitada);
        const sub = precio * cantidad;
        subtotal += sub;
        lineasOC.push({
          orden: l.orden ?? i + 1,
          item_id: l.item_id,
          descripcion: l.descripcion,
          codigo_proveedor_item: codigoProveedor,
          unidad_medida: l.unidad_medida,
          cantidad_solicitada: l.cantidad_solicitada,
          precio_unitario: precio,
          descuento_porcentaje: 0,
          subtotal: sub,
          estado_linea: "pendiente",
        });
      }

      const iva = subtotal * 0.15;
      const total = subtotal + iva;

      // Resolver rol_aprobador_requerido_id por monto
      const aprob = await tx.config_aprobacion.findFirst({
        where: { activo: true, monto_minimo: { lte: total }, OR: [{ monto_maximo: null }, { monto_maximo: { gt: total } }] },
        orderBy: { monto_minimo: "desc" },
      });

      const ocCreada = await tx.ordenes_compra.create({
        data: {
          codigo: "", // trigger
          proveedor_id: BigInt(proveedorId),
          solicitud_id: sc.id,
          expediente_id: sc.expediente_id ?? null,
          fecha_emision: new Date(),
          moneda: sc.moneda,
          subtotal,
          iva_porcentaje: 15,
          iva_valor: iva,
          total,
          estado: "borrador",
          rol_aprobador_requerido_id: aprob?.rol_aprobador_id ?? null,
          condiciones_pago: proveedor.condiciones_pago_default ?? null,
          creado_por: userId,
          actualizado_por: userId,
          orden_compra_lineas: { createMany: { data: lineasOC } },
        },
        include: { orden_compra_lineas: { orderBy: { orden: "asc" } } },
      });

      await tx.solicitudes.update({
        where: { id: sc.id },
        data: {
          estado: "convertida_en_oc",
          orden_compra_id: ocCreada.id,
          usuarios_solicitudes_actualizado_porTousuarios: { connect: { id: userId } },
        },
      });
      return { oc: ocCreada };
    });
    res.status(201).json({ data: oc });
  } catch (err) {
    if (err instanceof Error) {
      const map: Record<string, number> = {
        not_found: 404,
        proveedor_inexistente: 404,
        solo_aprobadas_convertibles: 409,
        ya_convertida: 409,
        sin_lineas: 409,
        proveedor_no_activo: 409,
      };
      const code = map[err.message];
      if (code) {
        res.status(code).json({ error: err.message });
        return;
      }
    }
    throw err;
  }
});

export default router;
