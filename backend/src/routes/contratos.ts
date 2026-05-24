import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import { withAppUser } from "../db/withAppUser";
import { requireAuth, requirePermission } from "../auth/middleware";

const router = Router();
router.use(requireAuth);

// ===================================================================
// Schemas zod
// ===================================================================
const planPagoTipoEnum = z.enum(["anticipo_y_saldo", "hitos", "mensual", "contado", "otro"]);
const estadoContratoEnum = z.enum(["vigente", "suspendido", "completado", "cancelado"]);
const tipoPagoEnum = z.enum(["anticipo", "hito", "saldo"]);
const condicionDisparoEnum = z.enum(["fecha_fija", "manual", "al_completar_ot", "al_pasar_gate", "al_entregar"]);
const estadoPagoEnum = z.enum(["pendiente", "parcial", "pagado", "vencido", "cancelado"]);

const pagoSchema = z.object({
  numero: z.number().int().positive(),
  tipo: tipoPagoEnum,
  descripcion: z.string().optional().nullable(),
  condicion_disparo: condicionDisparoEnum.optional().nullable(),
  fecha_esperada: z.string().optional().nullable(),
  monto_porcentaje: z.number().positive().max(100).optional().nullable(),
  monto_estipulado: z.number().nonnegative(),
});

const createSchema = z.object({
  cotizacion_id: z.number().int().positive(),
  fecha_firma: z.string().optional(),
  fecha_inicio: z.string().optional().nullable(),
  fecha_fin_estimada: z.string().optional().nullable(),
  moneda: z.string().length(3).default("USD"),
  monto_total: z.number().nonnegative(),
  plan_pago_tipo: planPagoTipoEnum.default("anticipo_y_saldo"),
  observaciones: z.string().optional().nullable(),
  notas_internas: z.string().optional().nullable(),
  pagos: z.array(pagoSchema).optional().default([]),
});

const updateSchema = z.object({
  fecha_inicio: z.string().optional().nullable(),
  fecha_fin_estimada: z.string().optional().nullable(),
  fecha_fin_real: z.string().optional().nullable(),
  monto_total: z.number().nonnegative().optional(),
  plan_pago_tipo: planPagoTipoEnum.optional(),
  observaciones: z.string().optional().nullable(),
  notas_internas: z.string().optional().nullable(),
});

const transicionSchema = z.object({
  accion: z.enum(["suspender", "reanudar", "completar", "cancelar"]),
  motivo: z.string().optional(),
});

const pagoCreateSchema = pagoSchema.extend({});
const pagoUpdateSchema = z.object({
  descripcion: z.string().optional().nullable(),
  condicion_disparo: condicionDisparoEnum.optional().nullable(),
  fecha_esperada: z.string().optional().nullable(),
  monto_porcentaje: z.number().positive().max(100).optional().nullable(),
  monto_estipulado: z.number().nonnegative().optional(),
  monto_pagado: z.number().nonnegative().optional(),
  fecha_pagado: z.string().optional().nullable(),
  referencia_pago: z.string().max(200).optional().nullable(),
  estado: estadoPagoEnum.optional(),
  observaciones: z.string().optional().nullable(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(25),
  q: z.string().trim().optional(),
  estado: estadoContratoEnum.optional(),
  cliente_id: z.coerce.number().int().positive().optional(),
});

// ===================================================================
// Helpers
// ===================================================================
async function generarCodigoContrato(tx: Prisma.TransactionClient, year: number): Promise<string> {
  const prefix = `CTR-${year}-`;
  const result = await tx.$queryRaw<{ max_num: number | null }[]>`
    SELECT COALESCE(MAX(CAST(SPLIT_PART(codigo, '-', 3) AS INTEGER)), 0) AS max_num
    FROM comercial.contratos
    WHERE codigo LIKE ${prefix + "%"}
  `;
  const nextNum = (result[0]?.max_num ?? 0) + 1;
  return `${prefix}${String(nextNum).padStart(4, "0")}`;
}

// ===================================================================
// GET /api/contratos
// ===================================================================
router.get("/", requirePermission("contratos", "read"), async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_query", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { page, limit, q, estado, cliente_id } = parsed.data;

  const where: Prisma.contratosWhereInput = {};
  if (estado) where.estado = estado;
  if (cliente_id) where.cliente_id = cliente_id;
  if (q) {
    where.OR = [
      { codigo: { contains: q, mode: "insensitive" } },
      { clientes: { razon_social: { contains: q, mode: "insensitive" } } },
      { clientes: { ruc_cedula: { contains: q } } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.contratos.findMany({
      where,
      orderBy: { fecha_firma: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        clientes: { select: { id: true, razon_social: true, ruc_cedula: true } },
        cotizaciones: { select: { id: true, codigo: true } },
      },
    }),
    prisma.contratos.count({ where }),
  ]);

  res.json({
    data,
    pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
  });
});

// ===================================================================
// GET /api/contratos/:id  -  detalle con plan de pagos
// ===================================================================
router.get("/:id", requirePermission("contratos", "read"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const contrato = await prisma.contratos.findUnique({
    where: { id },
    include: {
      clientes: { select: { id: true, razon_social: true, ruc_cedula: true } },
      cotizaciones: { select: { id: true, codigo: true, tipo_servicio: true, total: true } },
      contrato_pagos: { orderBy: { numero: "asc" } },
    },
  });
  if (!contrato) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  // Calcular totales del plan de pagos
  const total_estipulado = contrato.contrato_pagos.reduce((acc, p) => acc + Number(p.monto_estipulado), 0);
  const total_pagado = contrato.contrato_pagos.reduce((acc, p) => acc + Number(p.monto_pagado), 0);
  res.json({
    data: {
      ...contrato,
      resumen_pagos: {
        total_estipulado: Math.round(total_estipulado * 100) / 100,
        total_pagado: Math.round(total_pagado * 100) / 100,
        saldo_pendiente: Math.round((total_estipulado - total_pagado) * 100) / 100,
      },
    },
  });
});

// ===================================================================
// POST /api/contratos  -  crear desde cotizacion aprobada
// ===================================================================
router.post("/", requirePermission("contratos", "write"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;
  const d = parsed.data;

  try {
    const contrato = await withAppUser(userId, async (tx) => {
      // Validar cotizacion existe y esta en estado 'aprobada'
      const cotizacion = await tx.cotizaciones.findUnique({
        where: { id: d.cotizacion_id },
        include: { contratos: { select: { id: true, codigo: true } } },
      });
      if (!cotizacion) throw new Error("cotizacion_no_existe");
      if (cotizacion.estado !== "aprobada") throw new Error("cotizacion_no_aprobada");
      if (cotizacion.contratos) throw new Error("cotizacion_ya_convertida");

      // Validar fechas
      const fechaFirma = d.fecha_firma ? new Date(d.fecha_firma) : new Date();
      const fechaInicio = d.fecha_inicio ? new Date(d.fecha_inicio) : null;
      const fechaFin = d.fecha_fin_estimada ? new Date(d.fecha_fin_estimada) : null;
      if (fechaInicio && fechaInicio < fechaFirma) throw new Error("fecha_inicio_invalida");
      if (fechaFin && fechaInicio && fechaFin < fechaInicio) throw new Error("fecha_fin_invalida");

      // Generar codigo
      const year = fechaFirma.getFullYear();
      const codigo = await generarCodigoContrato(tx, year);

      // Crear contrato + pagos en una operacion
      const nuevoContrato = await tx.contratos.create({
        data: {
          codigo,
          cotizacion_id: d.cotizacion_id,
          cliente_id: Number(cotizacion.cliente_id),
          fecha_firma: fechaFirma,
          fecha_inicio: fechaInicio,
          fecha_fin_estimada: fechaFin,
          moneda: d.moneda,
          monto_total: d.monto_total,
          plan_pago_tipo: d.plan_pago_tipo,
          observaciones: d.observaciones ?? null,
          notas_internas: d.notas_internas ?? null,
          firmado_por: userId,
          creado_por: userId,
          actualizado_por: userId,
          contrato_pagos: {
            create: d.pagos.map((p) => ({
              numero: p.numero,
              tipo: p.tipo,
              descripcion: p.descripcion ?? null,
              condicion_disparo: p.condicion_disparo ?? null,
              fecha_esperada: p.fecha_esperada ? new Date(p.fecha_esperada) : null,
              monto_porcentaje: p.monto_porcentaje ?? null,
              monto_estipulado: p.monto_estipulado,
              creado_por: userId,
              actualizado_por: userId,
            })),
          },
        },
        include: {
          clientes: { select: { id: true, razon_social: true, ruc_cedula: true } },
          cotizaciones: { select: { id: true, codigo: true } },
          contrato_pagos: { orderBy: { numero: "asc" } },
        },
      });

      // Marcar la cotizacion como convertida (usa SQL directo por el tema de
      // los campos UUID que vimos en cotizaciones.ts)
      await tx.$executeRaw`
        UPDATE comercial.cotizaciones
           SET estado = 'convertida',
               actualizado_por = ${userId}::uuid
         WHERE id = ${d.cotizacion_id}
      `;

      return nuevoContrato;
    });

    res.status(201).json({ data: contrato });
  } catch (err) {
    if (err instanceof Error) {
      const known = [
        "cotizacion_no_existe",
        "cotizacion_no_aprobada",
        "cotizacion_ya_convertida",
        "fecha_inicio_invalida",
        "fecha_fin_invalida",
      ];
      if (known.includes(err.message)) {
        res.status(400).json({ error: err.message });
        return;
      }
    }
    throw err;
  }
});

// ===================================================================
// PATCH /api/contratos/:id  -  editar cabecera (no pagos)
// ===================================================================
router.patch("/:id", requirePermission("contratos", "write"), async (req, res) => {
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
    const updated = await withAppUser(userId, async (tx) => {
      const existing = await tx.contratos.findUnique({ where: { id } });
      if (!existing) throw new Error("not_found");
      if (existing.estado === "completado" || existing.estado === "cancelado") {
        throw new Error("estado_inmodificable");
      }

      // SQL directo para evitar tema de campos UUID
      const updates: string[] = [`actualizado_por = '${userId}'::uuid`];
      const params: unknown[] = [];

      // Construyo el UPDATE manualmente con sets condicionales
      // (Prisma sigue rechazando actualizado_por en update typed)
      if (d.fecha_inicio !== undefined) {
        await tx.$executeRaw`UPDATE comercial.contratos SET fecha_inicio = ${d.fecha_inicio ? new Date(d.fecha_inicio) : null} WHERE id = ${id}`;
      }
      if (d.fecha_fin_estimada !== undefined) {
        await tx.$executeRaw`UPDATE comercial.contratos SET fecha_fin_estimada = ${d.fecha_fin_estimada ? new Date(d.fecha_fin_estimada) : null} WHERE id = ${id}`;
      }
      if (d.fecha_fin_real !== undefined) {
        await tx.$executeRaw`UPDATE comercial.contratos SET fecha_fin_real = ${d.fecha_fin_real ? new Date(d.fecha_fin_real) : null} WHERE id = ${id}`;
      }
      if (d.monto_total !== undefined) {
        await tx.$executeRaw`UPDATE comercial.contratos SET monto_total = ${d.monto_total} WHERE id = ${id}`;
      }
      if (d.plan_pago_tipo !== undefined) {
        await tx.$executeRaw`UPDATE comercial.contratos SET plan_pago_tipo = ${d.plan_pago_tipo} WHERE id = ${id}`;
      }
      if (d.observaciones !== undefined) {
        await tx.$executeRaw`UPDATE comercial.contratos SET observaciones = ${d.observaciones} WHERE id = ${id}`;
      }
      if (d.notas_internas !== undefined) {
        await tx.$executeRaw`UPDATE comercial.contratos SET notas_internas = ${d.notas_internas} WHERE id = ${id}`;
      }
      // Siempre marcar quien actualizo
      await tx.$executeRaw`UPDATE comercial.contratos SET actualizado_por = ${userId}::uuid WHERE id = ${id}`;

      return tx.contratos.findUnique({
        where: { id },
        include: {
          clientes: { select: { id: true, razon_social: true, ruc_cedula: true } },
          cotizaciones: { select: { id: true, codigo: true } },
          contrato_pagos: { orderBy: { numero: "asc" } },
        },
      });
    });
    res.json({ data: updated });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "not_found") {
        res.status(404).json({ error: "not_found" });
        return;
      }
      if (err.message === "estado_inmodificable") {
        res.status(409).json({ error: "estado_inmodificable" });
        return;
      }
    }
    throw err;
  }
});

// ===================================================================
// POST /api/contratos/:id/transicion
// ===================================================================
router.post("/:id/transicion", requirePermission("contratos", "write"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = transicionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;
  const { accion, motivo } = parsed.data;

  const transiciones: Record<string, Record<string, string>> = {
    vigente: { suspender: "suspendido", completar: "completado", cancelar: "cancelado" },
    suspendido: { reanudar: "vigente", cancelar: "cancelado" },
    completado: {},
    cancelado: {},
  };

  try {
    const updated = await withAppUser(userId, async (tx) => {
      const existing = await tx.contratos.findUnique({ where: { id } });
      if (!existing) throw new Error("not_found");
      const nuevoEstado = transiciones[existing.estado]?.[accion];
      if (!nuevoEstado) throw new Error(`transicion_invalida:${existing.estado}->${accion}`);

      // Notas para suspension/cancelacion/completacion con motivo
      let notasNuevas = existing.notas_internas;
      if (motivo) {
        const fecha = new Date().toISOString().split("T")[0];
        notasNuevas = `[${nuevoEstado.toUpperCase()} ${fecha}] ${motivo}\n${existing.notas_internas ?? ""}`.trim();
      }

      await tx.$executeRaw`
        UPDATE comercial.contratos
           SET estado = ${nuevoEstado},
               actualizado_por = ${userId}::uuid,
               fecha_fin_real = CASE WHEN ${nuevoEstado} = 'completado' THEN COALESCE(fecha_fin_real, CURRENT_DATE) ELSE fecha_fin_real END,
               notas_internas = ${notasNuevas}
         WHERE id = ${id}
      `;

      return tx.contratos.findUnique({
        where: { id },
        include: {
          clientes: { select: { id: true, razon_social: true, ruc_cedula: true } },
          cotizaciones: { select: { id: true, codigo: true } },
          contrato_pagos: { orderBy: { numero: "asc" } },
        },
      });
    });
    res.json({ data: updated });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "not_found") {
        res.status(404).json({ error: "not_found" });
        return;
      }
      if (err.message.startsWith("transicion_invalida")) {
        res.status(409).json({ error: "transicion_invalida", details: err.message });
        return;
      }
    }
    throw err;
  }
});

// ===================================================================
// DELETE /api/contratos/:id  -  cancelar (si no tiene pagos cobrados)
// ===================================================================
router.delete("/:id", requirePermission("contratos", "delete"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const userId = req.user!.id;
  try {
    await withAppUser(userId, async (tx) => {
      const existing = await tx.contratos.findUnique({
        where: { id },
        include: { contrato_pagos: { select: { monto_pagado: true } } },
      });
      if (!existing) throw new Error("not_found");
      const totalCobrado = existing.contrato_pagos.reduce((acc, p) => acc + Number(p.monto_pagado), 0);
      if (totalCobrado > 0) throw new Error("contrato_con_pagos");
      if (existing.estado === "completado") throw new Error("estado_inmodificable");

      await tx.$executeRaw`
        UPDATE comercial.contratos
           SET estado = 'cancelado',
               actualizado_por = ${userId}::uuid
         WHERE id = ${id}
      `;
    });
    res.status(204).end();
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "not_found") {
        res.status(404).json({ error: "not_found" });
        return;
      }
      if (err.message === "contrato_con_pagos") {
        res.status(409).json({ error: "contrato_con_pagos" });
        return;
      }
      if (err.message === "estado_inmodificable") {
        res.status(409).json({ error: "estado_inmodificable" });
        return;
      }
    }
    throw err;
  }
});

// ===================================================================
// POST /api/contratos/:id/pagos  -  agregar pago al plan
// ===================================================================
router.post("/:id/pagos", requirePermission("contratos", "cobrar"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = pagoCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;
  const d = parsed.data;
  try {
    const pago = await withAppUser(userId, async (tx) => {
      const contrato = await tx.contratos.findUnique({ where: { id } });
      if (!contrato) throw new Error("not_found");
      if (contrato.estado === "completado" || contrato.estado === "cancelado") {
        throw new Error("estado_inmodificable");
      }
      return tx.contrato_pagos.create({
        data: {
          contrato_id: id,
          numero: d.numero,
          tipo: d.tipo,
          descripcion: d.descripcion ?? null,
          condicion_disparo: d.condicion_disparo ?? null,
          fecha_esperada: d.fecha_esperada ? new Date(d.fecha_esperada) : null,
          monto_porcentaje: d.monto_porcentaje ?? null,
          monto_estipulado: d.monto_estipulado,
          creado_por: userId,
          actualizado_por: userId,
        },
      });
    });
    res.status(201).json({ data: pago });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "not_found") {
        res.status(404).json({ error: "not_found" });
        return;
      }
      if (err.message === "estado_inmodificable") {
        res.status(409).json({ error: "estado_inmodificable" });
        return;
      }
    }
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      res.status(409).json({ error: "numero_duplicado" });
      return;
    }
    throw err;
  }
});

// ===================================================================
// PATCH /api/contratos/:id/pagos/:pagoId  -  registrar cobro o editar
// ===================================================================
router.patch("/:id/pagos/:pagoId", requirePermission("contratos", "cobrar"), async (req, res) => {
  const id = Number(req.params.id);
  const pagoId = Number(req.params.pagoId);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(pagoId) || pagoId <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = pagoUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;
  const d = parsed.data;
  try {
    const pago = await withAppUser(userId, async (tx) => {
      const existing = await tx.contrato_pagos.findUnique({ where: { id: pagoId } });
      if (!existing || Number(existing.contrato_id) !== id) throw new Error("not_found");

      // Aplicar updates uno por uno usando SQL directo para evitar tema UUID
      if (d.descripcion !== undefined) {
        await tx.$executeRaw`UPDATE comercial.contrato_pagos SET descripcion = ${d.descripcion} WHERE id = ${pagoId}`;
      }
      if (d.condicion_disparo !== undefined) {
        await tx.$executeRaw`UPDATE comercial.contrato_pagos SET condicion_disparo = ${d.condicion_disparo} WHERE id = ${pagoId}`;
      }
      if (d.fecha_esperada !== undefined) {
        await tx.$executeRaw`UPDATE comercial.contrato_pagos SET fecha_esperada = ${d.fecha_esperada ? new Date(d.fecha_esperada) : null} WHERE id = ${pagoId}`;
      }
      if (d.monto_porcentaje !== undefined) {
        await tx.$executeRaw`UPDATE comercial.contrato_pagos SET monto_porcentaje = ${d.monto_porcentaje} WHERE id = ${pagoId}`;
      }
      if (d.monto_estipulado !== undefined) {
        await tx.$executeRaw`UPDATE comercial.contrato_pagos SET monto_estipulado = ${d.monto_estipulado} WHERE id = ${pagoId}`;
      }
      if (d.monto_pagado !== undefined) {
        await tx.$executeRaw`UPDATE comercial.contrato_pagos SET monto_pagado = ${d.monto_pagado} WHERE id = ${pagoId}`;
      }
      if (d.fecha_pagado !== undefined) {
        await tx.$executeRaw`UPDATE comercial.contrato_pagos SET fecha_pagado = ${d.fecha_pagado ? new Date(d.fecha_pagado) : null} WHERE id = ${pagoId}`;
      }
      if (d.referencia_pago !== undefined) {
        await tx.$executeRaw`UPDATE comercial.contrato_pagos SET referencia_pago = ${d.referencia_pago} WHERE id = ${pagoId}`;
      }
      if (d.estado !== undefined) {
        await tx.$executeRaw`UPDATE comercial.contrato_pagos SET estado = ${d.estado} WHERE id = ${pagoId}`;
      }
      if (d.observaciones !== undefined) {
        await tx.$executeRaw`UPDATE comercial.contrato_pagos SET observaciones = ${d.observaciones} WHERE id = ${pagoId}`;
      }
      await tx.$executeRaw`UPDATE comercial.contrato_pagos SET actualizado_por = ${userId}::uuid WHERE id = ${pagoId}`;

      return tx.contrato_pagos.findUnique({ where: { id: pagoId } });
    });
    res.json({ data: pago });
  } catch (err) {
    if (err instanceof Error && err.message === "not_found") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    // CHECK constraints del DB pueden saltar (monto_pagado > monto_estipulado, etc)
    if (err && typeof err === "object" && "code" in err) {
      const code = (err as { code: string }).code;
      if (code === "P2010" || code === "23514") {
        res.status(409).json({ error: "estado_pago_inconsistente" });
        return;
      }
    }
    if (err instanceof Error && err.message.includes("check constraint")) {
      res.status(409).json({ error: "estado_pago_inconsistente" });
      return;
    }
    throw err;
  }
});

// ===================================================================
// DELETE /api/contratos/:id/pagos/:pagoId  -  eliminar pago (si pendiente)
// ===================================================================
router.delete("/:id/pagos/:pagoId", requirePermission("contratos", "cobrar"), async (req, res) => {
  const id = Number(req.params.id);
  const pagoId = Number(req.params.pagoId);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(pagoId) || pagoId <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const userId = req.user!.id;
  try {
    await withAppUser(userId, async (tx) => {
      const pago = await tx.contrato_pagos.findUnique({ where: { id: pagoId } });
      if (!pago || Number(pago.contrato_id) !== id) throw new Error("not_found");
      if (Number(pago.monto_pagado) > 0) throw new Error("pago_con_cobros");
      await tx.contrato_pagos.delete({ where: { id: pagoId } });
    });
    res.status(204).end();
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "not_found") {
        res.status(404).json({ error: "not_found" });
        return;
      }
      if (err.message === "pago_con_cobros") {
        res.status(409).json({ error: "pago_con_cobros" });
        return;
      }
    }
    throw err;
  }
});

export default router;
