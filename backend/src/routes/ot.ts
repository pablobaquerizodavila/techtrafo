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
const tipoRutaEnum = z.enum(["reparacion", "fabricacion", "mantenimiento"]);
const prioridadEnum = z.enum(["baja", "normal", "alta", "urgente"]);
const estadoOtEnum = z.enum(["planeada", "en_curso", "pausada", "completada", "cancelada"]);
const estadoPasoEnum = z.enum(["pendiente", "en_curso", "completado", "saltado", "rechazado"]);
const resultadoGateEnum = z.enum(["aprobado", "rechazado", "con_observaciones"]);

const createSchema = z.object({
  contrato_id: z.number().int().positive(),
  tipo_ruta: tipoRutaEnum,
  prioridad: prioridadEnum.default("normal"),
  descripcion: z.string().optional().nullable(),
  fecha_inicio_planeada: z.string().optional().nullable(),
  fecha_fin_planeada: z.string().optional().nullable(),
  responsable_id: z.string().uuid().optional().nullable(),
  observaciones: z.string().optional().nullable(),
  transformador_id: z.number().int().positive().optional().nullable(),
});

const updateSchema = z.object({
  prioridad: prioridadEnum.optional(),
  descripcion: z.string().optional().nullable(),
  fecha_inicio_planeada: z.string().optional().nullable(),
  fecha_fin_planeada: z.string().optional().nullable(),
  responsable_id: z.string().uuid().optional().nullable(),
  observaciones: z.string().optional().nullable(),
  notas_internas: z.string().optional().nullable(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
  q: z.string().trim().optional(),
  estado: estadoOtEnum.optional(),
  tipo_ruta: tipoRutaEnum.optional(),
  prioridad: prioridadEnum.optional(),
  responsable_id: z.string().uuid().optional(),
  contrato_id: z.coerce.number().int().positive().optional(),
});

const cancelarSchema = z.object({ motivo: z.string().min(3).max(500) });

const completarPasoSchema = z.object({
  observaciones: z.string().optional().nullable(),
  mediciones: z.record(z.unknown()).optional().nullable(),
  resultado_gate: resultadoGateEnum.optional(),
});

const rechazarPasoSchema = z.object({
  observaciones: z.string().min(3).max(500),
});

const updatePasoSchema = z.object({
  observaciones: z.string().optional().nullable(),
  notas_internas: z.string().optional().nullable(),
  mediciones: z.record(z.unknown()).optional().nullable(),
});

// ===================================================================
// Helpers
// ===================================================================
async function generarCodigoOT(tx: Prisma.TransactionClient, year: number): Promise<string> {
  const prefix = `OT-${year}-`;
  const r = await tx.$queryRaw<{ max_num: number | null }[]>`
    SELECT COALESCE(MAX(CAST(SPLIT_PART(codigo, '-', 3) AS INTEGER)), 0) AS max_num
    FROM produccion.ot
    WHERE codigo LIKE ${prefix + "%"}
  `;
  const next = (r[0]?.max_num ?? 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

// ===================================================================
// GET /api/ot  -  listado
// ===================================================================
router.get("/", requirePermission("ot", "read"), async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_query", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { page, limit, q, estado, tipo_ruta, prioridad, responsable_id, contrato_id } = parsed.data;

  const where: Prisma.otWhereInput = {};
  if (estado) where.estado = estado;
  if (tipo_ruta) where.tipo_ruta = tipo_ruta;
  if (prioridad) where.prioridad = prioridad;
  if (responsable_id) where.responsable_id = responsable_id;
  if (contrato_id) where.contrato_id = contrato_id;
  if (q) {
    where.OR = [
      { codigo: { contains: q, mode: "insensitive" } },
      { descripcion: { contains: q, mode: "insensitive" } },
      { contratos: { codigo: { contains: q, mode: "insensitive" } } },
      { contratos: { clientes: { razon_social: { contains: q, mode: "insensitive" } } } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.ot.findMany({
      where,
      orderBy: [{ prioridad: "asc" }, { created_at: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        contratos: {
          select: {
            id: true, codigo: true,
            clientes: { select: { id: true, razon_social: true, ruc_cedula: true } },
          },
        },
        usuarios_ot_responsable_idTousuarios: { select: { id: true, nombres: true, apellidos: true } },
        _count: { select: { ot_pasos: true } },
      },
    }),
    prisma.ot.count({ where }),
  ]);

  res.json({
    data,
    pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
  });
});

// ===================================================================
// GET /api/ot/:id  -  detalle con pasos + evidencias
// ===================================================================
router.get("/:id", requirePermission("ot", "read"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const ot = await prisma.ot.findUnique({
    where: { id },
    include: {
      contratos: {
        select: {
          id: true, codigo: true, estado: true,
          clientes: { select: { id: true, razon_social: true, ruc_cedula: true } },
        },
      },
      usuarios_ot_responsable_idTousuarios: { select: { id: true, nombres: true, apellidos: true, email: true } },
      transformadores: {
        select: { id: true, codigo_interno: true, marca: true, modelo: true, capacidad_kva: true, tipo: true, numero_serie: true },
      },
      ot_pasos: {
        orderBy: { numero: "asc" },
        include: {
          usuarios_ot_pasos_ejecutado_porTousuarios: { select: { id: true, nombres: true, apellidos: true } },
          usuarios_ot_pasos_aprobado_porTousuarios: { select: { id: true, nombres: true, apellidos: true } },
        },
      },
      ot_evidencias: { orderBy: { created_at: "desc" } },
      expedientes: { select: { id: true, codigo: true } },
    },
  });
  if (!ot) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ data: ot });
});

// ===================================================================
// POST /api/ot  -  crear OT con pasos clonados desde plantilla
// ===================================================================
router.post("/", requirePermission("ot", "write"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;
  const d = parsed.data;

  try {
    const created = await withAppUser(userId, async (tx) => {
      // Validar contrato existe y esta activo/firmado
      const contrato = await tx.contratos.findUnique({ where: { id: d.contrato_id } });
      if (!contrato) throw new Error("contrato_no_encontrado");
      if (contrato.estado === "cancelado" || contrato.estado === "completado") {
        throw new Error("contrato_no_disponible");
      }

      const year = new Date().getFullYear();
      const codigo = await generarCodigoOT(tx, year);

      const ot = await tx.ot.create({
        data: {
          codigo,
          contrato_id: d.contrato_id,
          tipo_ruta: d.tipo_ruta,
          prioridad: d.prioridad,
          descripcion: d.descripcion ?? null,
          fecha_inicio_planeada: d.fecha_inicio_planeada ? new Date(d.fecha_inicio_planeada) : null,
          fecha_fin_planeada: d.fecha_fin_planeada ? new Date(d.fecha_fin_planeada) : null,
          responsable_id: d.responsable_id ?? null,
          observaciones: d.observaciones ?? null,
          transformador_id: d.transformador_id ?? null,
          estado: "planeada",
          creado_por: userId,
          actualizado_por: userId,
        },
      });

      // Clonar pasos desde plantilla del tipo_ruta
      const plantillas = await tx.paso_plantillas.findMany({
        where: { tipo_ruta: d.tipo_ruta, activo: true },
        orderBy: { numero: "asc" },
      });
      if (plantillas.length > 0) {
        await tx.ot_pasos.createMany({
          data: plantillas.map((p) => ({
            ot_id: ot.id,
            numero: p.numero,
            nombre: p.nombre,
            descripcion: p.descripcion,
            es_gate: p.es_gate,
            numero_gate: p.numero_gate,
            estado: "pendiente",
          })),
        });
      }

      // Si el expediente del contrato existe, vincular ot_id en expediente
      // (asi el trigger fn_sync_hito_ot puede actuar)
      await tx.$executeRaw`
        UPDATE comercial.expedientes
           SET ot_id = ${ot.id}, actualizado_por = ${userId}::uuid
         WHERE contrato_id = ${d.contrato_id} AND ot_id IS NULL
      `;

      return ot;
    });

    const completo = await prisma.ot.findUnique({
      where: { id: created.id },
      include: {
        contratos: { select: { id: true, codigo: true, clientes: { select: { razon_social: true } } } },
        ot_pasos: { orderBy: { numero: "asc" } },
      },
    });
    res.status(201).json({ data: completo });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "contrato_no_encontrado") {
        res.status(400).json({ error: "contrato_no_encontrado" });
        return;
      }
      if (err.message === "contrato_no_disponible") {
        res.status(409).json({ error: "contrato_no_disponible" });
        return;
      }
    }
    throw err;
  }
});

// ===================================================================
// PATCH /api/ot/:id
// ===================================================================
router.patch("/:id", requirePermission("ot", "write"), async (req, res) => {
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
      const existing = await tx.ot.findUnique({ where: { id } });
      if (!existing) throw new Error("not_found");
      if (existing.estado === "completada" || existing.estado === "cancelada") {
        throw new Error("estado_inmutable");
      }

      if (d.prioridad !== undefined) {
        await tx.$executeRaw`UPDATE produccion.ot SET prioridad = ${d.prioridad} WHERE id = ${id}`;
      }
      if (d.descripcion !== undefined) {
        await tx.$executeRaw`UPDATE produccion.ot SET descripcion = ${d.descripcion} WHERE id = ${id}`;
      }
      if (d.fecha_inicio_planeada !== undefined) {
        const v = d.fecha_inicio_planeada ? new Date(d.fecha_inicio_planeada) : null;
        await tx.$executeRaw`UPDATE produccion.ot SET fecha_inicio_planeada = ${v} WHERE id = ${id}`;
      }
      if (d.fecha_fin_planeada !== undefined) {
        const v = d.fecha_fin_planeada ? new Date(d.fecha_fin_planeada) : null;
        await tx.$executeRaw`UPDATE produccion.ot SET fecha_fin_planeada = ${v} WHERE id = ${id}`;
      }
      if (d.responsable_id !== undefined) {
        await tx.$executeRaw`UPDATE produccion.ot SET responsable_id = ${d.responsable_id ? Prisma.sql`${d.responsable_id}::uuid` : null} WHERE id = ${id}`;
      }
      if (d.observaciones !== undefined) {
        await tx.$executeRaw`UPDATE produccion.ot SET observaciones = ${d.observaciones} WHERE id = ${id}`;
      }
      if (d.notas_internas !== undefined) {
        await tx.$executeRaw`UPDATE produccion.ot SET notas_internas = ${d.notas_internas} WHERE id = ${id}`;
      }
      await tx.$executeRaw`UPDATE produccion.ot SET actualizado_por = ${userId}::uuid WHERE id = ${id}`;
    });
    const updated = await prisma.ot.findUnique({ where: { id } });
    res.json({ data: updated });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "not_found") {
        res.status(404).json({ error: "not_found" });
        return;
      }
      if (err.message === "estado_inmutable") {
        res.status(409).json({ error: "estado_inmutable" });
        return;
      }
    }
    throw err;
  }
});

// ===================================================================
// Transiciones de estado de OT
// ===================================================================
async function transicionEstado(
  id: number,
  userId: string,
  nuevo: "en_curso" | "pausada" | "completada" | "cancelada",
  motivo?: string,
): Promise<{ ok: boolean; error?: string }> {
  return withAppUser(userId, async (tx) => {
    const ot = await tx.ot.findUnique({ where: { id } });
    if (!ot) return { ok: false, error: "not_found" };
    if (ot.estado === nuevo) return { ok: false, error: "estado_actual_igual" };

    // Validaciones por transicion
    if (nuevo === "en_curso") {
      if (!["planeada", "pausada"].includes(ot.estado)) return { ok: false, error: "transicion_invalida" };
      await tx.$executeRaw`
        UPDATE produccion.ot
           SET estado = 'en_curso',
               fecha_inicio_real = COALESCE(fecha_inicio_real, NOW()),
               actualizado_por = ${userId}::uuid
         WHERE id = ${id}
      `;
    } else if (nuevo === "pausada") {
      if (ot.estado !== "en_curso") return { ok: false, error: "transicion_invalida" };
      await tx.$executeRaw`
        UPDATE produccion.ot SET estado = 'pausada', actualizado_por = ${userId}::uuid WHERE id = ${id}
      `;
    } else if (nuevo === "completada") {
      if (ot.estado !== "en_curso") return { ok: false, error: "transicion_invalida" };
      // Verificar que todos los pasos esten completados o saltados
      const pendientes = await tx.ot_pasos.count({
        where: { ot_id: id, estado: { in: ["pendiente", "en_curso", "rechazado"] } },
      });
      if (pendientes > 0) return { ok: false, error: "pasos_pendientes" };
      await tx.$executeRaw`
        UPDATE produccion.ot
           SET estado = 'completada', fecha_fin_real = NOW(), actualizado_por = ${userId}::uuid
         WHERE id = ${id}
      `;
    } else if (nuevo === "cancelada") {
      if (!motivo) return { ok: false, error: "motivo_requerido" };
      if (ot.estado === "completada") return { ok: false, error: "transicion_invalida" };
      await tx.$executeRaw`
        UPDATE produccion.ot
           SET estado = 'cancelada', motivo_cancelacion = ${motivo},
               actualizado_por = ${userId}::uuid
         WHERE id = ${id}
      `;
    }
    return { ok: true };
  });
}

router.post("/:id/iniciar", requirePermission("ot", "write"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const r = await transicionEstado(id, req.user!.id, "en_curso");
  if (!r.ok) {
    res.status(r.error === "not_found" ? 404 : 409).json({ error: r.error });
    return;
  }
  res.json({ data: await prisma.ot.findUnique({ where: { id } }) });
});

router.post("/:id/pausar", requirePermission("ot", "write"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const r = await transicionEstado(id, req.user!.id, "pausada");
  if (!r.ok) {
    res.status(r.error === "not_found" ? 404 : 409).json({ error: r.error });
    return;
  }
  res.json({ data: await prisma.ot.findUnique({ where: { id } }) });
});

router.post("/:id/completar", requirePermission("ot", "write"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const r = await transicionEstado(id, req.user!.id, "completada");
  if (!r.ok) {
    res.status(r.error === "not_found" ? 404 : 409).json({ error: r.error });
    return;
  }

  // Auto-crear garantía si la OT tiene transformador y cliente vinculado (4.7)
  // Duración default: 12 meses para reparación/mantenimiento, 24 para fabricación.
  // No falla la transición si la creación de garantía falla.
  try {
    const ot = await prisma.ot.findUnique({
      where: { id },
      include: { contratos: { select: { cliente_id: true, id: true } } },
    });
    if (ot?.transformador_id && ot.contratos?.cliente_id) {
      const meses = ot.tipo_ruta === "fabricacion" ? 24 : 12;
      const inicio = new Date();
      const fin = new Date(inicio); fin.setMonth(fin.getMonth() + meses);
      const year = new Date().getFullYear();
      await withAppUser(req.user!.id, async (tx) => {
        // Generar codigo
        const prefix = `GAR-${year}-`;
        const rs = await tx.$queryRaw<{ max_num: number | null }[]>`
          SELECT COALESCE(MAX(CAST(SPLIT_PART(codigo, '-', 3) AS INTEGER)), 0) AS max_num
          FROM posventa.garantias WHERE codigo LIKE ${prefix + "%"}
        `;
        const codigo = `${prefix}${String((rs[0]?.max_num ?? 0) + 1).padStart(4, "0")}`;
        await tx.garantias.create({
          data: {
            codigo,
            cliente_id: ot.contratos!.cliente_id,
            transformador_id: Number(ot.transformador_id),
            contrato_id: ot.contratos!.id,
            ot_id_origen: id,
            fecha_inicio: inicio,
            fecha_fin: fin,
            duracion_meses: meses,
            alcance: `Garantía estándar de ${meses} meses sobre los trabajos ejecutados en la OT ${ot.codigo}.`,
            estado: "vigente",
            creado_por: req.user!.id,
            actualizado_por: req.user!.id,
          },
        });
      });
    }
  } catch (err) {
    console.error("[ot/completar] auto-garantia fallo:", err);
  }

  res.json({ data: await prisma.ot.findUnique({ where: { id } }) });
});

router.post("/:id/cancelar", requirePermission("ot", "write"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = cancelarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload" });
    return;
  }
  const r = await transicionEstado(id, req.user!.id, "cancelada", parsed.data.motivo);
  if (!r.ok) {
    res.status(r.error === "not_found" ? 404 : 409).json({ error: r.error });
    return;
  }
  res.json({ data: await prisma.ot.findUnique({ where: { id } }) });
});

// ===================================================================
// PASOS de la OT
// ===================================================================

// PATCH paso (mediciones, observaciones, notas)
router.patch("/:id/pasos/:pasoId", requirePermission("ot", "write"), async (req, res) => {
  const otId = Number(req.params.id);
  const pasoId = Number(req.params.pasoId);
  if (!Number.isInteger(otId) || !Number.isInteger(pasoId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = updatePasoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const d = parsed.data;

  const paso = await prisma.ot_pasos.findUnique({ where: { id: pasoId } });
  if (!paso || Number(paso.ot_id) !== otId) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  await withAppUser(req.user!.id, async (tx) => {
    if (d.observaciones !== undefined) {
      await tx.$executeRaw`UPDATE produccion.ot_pasos SET observaciones = ${d.observaciones} WHERE id = ${pasoId}`;
    }
    if (d.notas_internas !== undefined) {
      await tx.$executeRaw`UPDATE produccion.ot_pasos SET notas_internas = ${d.notas_internas} WHERE id = ${pasoId}`;
    }
    if (d.mediciones !== undefined) {
      await tx.$executeRaw`UPDATE produccion.ot_pasos SET mediciones = ${d.mediciones === null ? null : JSON.stringify(d.mediciones)}::jsonb WHERE id = ${pasoId}`;
    }
  });
  res.json({ data: await prisma.ot_pasos.findUnique({ where: { id: pasoId } }) });
});

// POST iniciar paso
router.post("/:id/pasos/:pasoId/iniciar", requirePermission("ot", "write"), async (req, res) => {
  const otId = Number(req.params.id);
  const pasoId = Number(req.params.pasoId);
  if (!Number.isInteger(otId) || !Number.isInteger(pasoId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const userId = req.user!.id;
  try {
    await withAppUser(userId, async (tx) => {
      const paso = await tx.ot_pasos.findUnique({ where: { id: pasoId } });
      if (!paso || Number(paso.ot_id) !== otId) throw new Error("not_found");
      if (paso.estado !== "pendiente") throw new Error("estado_invalido");
      // OT debe estar en_curso (o forzar transicion?)
      const ot = await tx.ot.findUnique({ where: { id: otId } });
      if (!ot || ot.estado !== "en_curso") throw new Error("ot_no_en_curso");

      await tx.$executeRaw`
        UPDATE produccion.ot_pasos
           SET estado = 'en_curso',
               fecha_inicio = COALESCE(fecha_inicio, NOW()),
               ejecutado_por = ${userId}::uuid
         WHERE id = ${pasoId}
      `;
      await tx.$executeRaw`
        UPDATE produccion.ot SET paso_actual = ${paso.numero}, actualizado_por = ${userId}::uuid WHERE id = ${otId}
      `;
    });
    res.json({ data: await prisma.ot_pasos.findUnique({ where: { id: pasoId } }) });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "not_found") return res.status(404).json({ error: "not_found" });
      if (err.message === "estado_invalido") return res.status(409).json({ error: "estado_invalido" });
      if (err.message === "ot_no_en_curso") return res.status(409).json({ error: "ot_no_en_curso" });
    }
    throw err;
  }
});

// POST completar paso (los gates llevan resultado_gate)
router.post("/:id/pasos/:pasoId/completar", requirePermission("ot", "write"), async (req, res) => {
  const otId = Number(req.params.id);
  const pasoId = Number(req.params.pasoId);
  if (!Number.isInteger(otId) || !Number.isInteger(pasoId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = completarPasoSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload" });
    return;
  }
  const userId = req.user!.id;
  const d = parsed.data;

  try {
    await withAppUser(userId, async (tx) => {
      const paso = await tx.ot_pasos.findUnique({ where: { id: pasoId } });
      if (!paso || Number(paso.ot_id) !== otId) throw new Error("not_found");
      if (paso.estado !== "en_curso" && paso.estado !== "pendiente") throw new Error("estado_invalido");
      if (paso.es_gate && !d.resultado_gate) throw new Error("resultado_gate_requerido");

      const mediciones = d.mediciones === undefined ? null : JSON.stringify(d.mediciones);

      await tx.$executeRaw`
        UPDATE produccion.ot_pasos
           SET estado = 'completado',
               fecha_fin = NOW(),
               fecha_inicio = COALESCE(fecha_inicio, NOW()),
               aprobado_por = ${paso.es_gate ? Prisma.sql`${userId}::uuid` : Prisma.sql`aprobado_por`},
               resultado_gate = ${paso.es_gate ? (d.resultado_gate ?? null) : null},
               observaciones = COALESCE(${d.observaciones ?? null}, observaciones),
               mediciones = COALESCE(${mediciones}::jsonb, mediciones)
         WHERE id = ${pasoId}
      `;
    });
    res.json({ data: await prisma.ot_pasos.findUnique({ where: { id: pasoId } }) });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "not_found") return res.status(404).json({ error: "not_found" });
      if (err.message === "estado_invalido") return res.status(409).json({ error: "estado_invalido" });
      if (err.message === "resultado_gate_requerido") return res.status(400).json({ error: "resultado_gate_requerido" });
    }
    throw err;
  }
});

// POST rechazar paso (solo gates)
router.post("/:id/pasos/:pasoId/rechazar", requirePermission("ot", "aprobar"), async (req, res) => {
  const otId = Number(req.params.id);
  const pasoId = Number(req.params.pasoId);
  if (!Number.isInteger(otId) || !Number.isInteger(pasoId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = rechazarPasoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;

  try {
    await withAppUser(userId, async (tx) => {
      const paso = await tx.ot_pasos.findUnique({ where: { id: pasoId } });
      if (!paso || Number(paso.ot_id) !== otId) throw new Error("not_found");
      if (!paso.es_gate) throw new Error("solo_gates");

      await tx.$executeRaw`
        UPDATE produccion.ot_pasos
           SET estado = 'rechazado',
               resultado_gate = 'rechazado',
               fecha_fin = NOW(),
               aprobado_por = ${userId}::uuid,
               observaciones = ${parsed.data.observaciones}
         WHERE id = ${pasoId}
      `;
    });
    res.json({ data: await prisma.ot_pasos.findUnique({ where: { id: pasoId } }) });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "not_found") return res.status(404).json({ error: "not_found" });
      if (err.message === "solo_gates") return res.status(400).json({ error: "solo_gates" });
    }
    throw err;
  }
});

// POST saltar paso (skip)
router.post("/:id/pasos/:pasoId/saltar", requirePermission("ot", "write"), async (req, res) => {
  const otId = Number(req.params.id);
  const pasoId = Number(req.params.pasoId);
  if (!Number.isInteger(otId) || !Number.isInteger(pasoId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const userId = req.user!.id;

  const paso = await prisma.ot_pasos.findUnique({ where: { id: pasoId } });
  if (!paso || Number(paso.ot_id) !== otId) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (paso.es_gate) {
    res.status(409).json({ error: "no_se_puede_saltar_gate" });
    return;
  }
  if (!["pendiente", "en_curso"].includes(paso.estado)) {
    res.status(409).json({ error: "estado_invalido" });
    return;
  }

  await withAppUser(userId, async (tx) => {
    await tx.$executeRaw`
      UPDATE produccion.ot_pasos
         SET estado = 'saltado', fecha_fin = NOW(), ejecutado_por = ${userId}::uuid
       WHERE id = ${pasoId}
    `;
  });
  res.json({ data: await prisma.ot_pasos.findUnique({ where: { id: pasoId } }) });
});

// ===================================================================
// GET /api/ot/:id/gantt  -  datos para Gantt visual (Dashboard E)
// ===================================================================
router.get("/:id/gantt", requirePermission("ot", "read"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const ot = await prisma.ot.findUnique({
    where: { id },
    select: {
      id: true, codigo: true, tipo_ruta: true,
      fecha_inicio_planeada: true, fecha_fin_planeada: true,
      fecha_inicio_real: true, fecha_fin_real: true,
      ot_pasos: {
        orderBy: { numero: "asc" },
        select: {
          id: true, numero: true, nombre: true, estado: true, es_gate: true,
          fecha_inicio: true, fecha_fin: true,
          areas: { select: { codigo: true, nombre: true, color_hex: true } },
        },
      },
    },
  });
  if (!ot) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  // Distribuir los pasos sobre el rango planeado de la OT
  const inicio = ot.fecha_inicio_planeada ?? ot.fecha_inicio_real ?? new Date();
  const fin = ot.fecha_fin_planeada ?? ot.fecha_fin_real ?? new Date(Date.now() + 30 * 86400_000);
  const rangoMs = Math.max(1, new Date(fin).getTime() - new Date(inicio).getTime());
  const total = ot.ot_pasos.length;
  const duracionPaso = total > 0 ? rangoMs / total : rangoMs;

  res.json({
    data: {
      ot: {
        id: Number(ot.id), codigo: ot.codigo, tipo_ruta: ot.tipo_ruta,
        inicio_planeado: ot.fecha_inicio_planeada,
        fin_planeado: ot.fecha_fin_planeada,
        inicio_real: ot.fecha_inicio_real,
        fin_real: ot.fecha_fin_real,
      },
      rango: {
        desde: new Date(inicio).toISOString(),
        hasta: new Date(fin).toISOString(),
      },
      pasos: ot.ot_pasos.map((p, i) => {
        const planStart = new Date(new Date(inicio).getTime() + duracionPaso * i);
        const planEnd = new Date(new Date(inicio).getTime() + duracionPaso * (i + 1));
        return {
          id: Number(p.id),
          numero: p.numero, nombre: p.nombre, estado: p.estado, es_gate: p.es_gate,
          area: p.areas ? { codigo: p.areas.codigo, nombre: p.areas.nombre, color: p.areas.color_hex } : null,
          plan_inicio: planStart.toISOString(),
          plan_fin: planEnd.toISOString(),
          real_inicio: p.fecha_inicio,
          real_fin: p.fecha_fin,
        };
      }),
    },
  });
});

// ===================================================================
// Dashboard mini de OT
// ===================================================================
router.get("/dashboard/resumen", requirePermission("ot", "read"), async (_req, res) => {
  const [porEstado, urgentes, atrasadas] = await Promise.all([
    prisma.ot.groupBy({ by: ["estado"], _count: true }),
    prisma.ot.count({ where: { prioridad: "urgente", estado: { in: ["planeada", "en_curso", "pausada"] } } }),
    prisma.ot.count({
      where: {
        estado: { in: ["planeada", "en_curso", "pausada"] },
        fecha_fin_planeada: { lt: new Date() },
      },
    }),
  ]);
  res.json({
    data: {
      por_estado: porEstado.reduce<Record<string, number>>((acc, r) => {
        acc[r.estado] = r._count;
        return acc;
      }, {}),
      urgentes_abiertas: urgentes,
      atrasadas: atrasadas,
    },
  });
});

export default router;
