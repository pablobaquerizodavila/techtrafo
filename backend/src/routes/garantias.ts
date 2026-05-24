/**
 * Garantías + reclamos + intervenciones (4.7).
 *
 * Endpoints:
 *   GET    /api/garantias                     listado paginado con filtros
 *   GET    /api/garantias/dashboard/resumen   KPIs (vigentes, por vencer 30d, vencidas, con reclamos abiertos)
 *   GET    /api/garantias/:id                 detalle + reclamos + intervenciones
 *   POST   /api/garantias                     crear manualmente
 *   PATCH  /api/garantias/:id                 actualizar cabecera o suspender
 *
 *   POST   /api/garantias/:id/reclamos        crear reclamo
 *   PATCH  /api/garantias/:id/reclamos/:rId   actualizar/cerrar reclamo
 *
 *   POST   /api/garantias/:id/reclamos/:rId/intervenciones    crear intervención
 *   PATCH  /api/garantias/:id/reclamos/:rId/intervenciones/:iId  actualizar intervención
 */
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import { withAppUser } from "../db/withAppUser";
import { requireAuth, requirePermission } from "../auth/middleware";

const router = Router();
router.use(requireAuth);

// ===================================================================
// Schemas
// ===================================================================
const estadoGarEnum = z.enum(["vigente", "vencida", "suspendida", "cancelada"]);
const severidadEnum = z.enum(["baja", "media", "alta", "critica"]);
const estadoReclamoEnum = z.enum(["recibido", "en_diagnostico", "en_atencion", "cerrado", "rechazado"]);
const canalEnum = z.enum(["telefono", "email", "whatsapp", "visita_planta", "web", "otro"]);
const tipoIntervencionEnum = z.enum(["visita_diagnostico", "reparacion", "reemplazo", "calibracion", "asesoria", "otro"]);
const resultadoIntEnum = z.enum(["exitoso", "parcial", "fallido", "no_aplica"]);

const createGarantiaSchema = z.object({
  cliente_id: z.number().int().positive(),
  transformador_id: z.number().int().positive().optional().nullable(),
  serie_id: z.number().int().positive().optional().nullable(),
  contrato_id: z.number().int().positive().optional().nullable(),
  ot_id_origen: z.number().int().positive().optional().nullable(),
  fecha_inicio: z.string(),
  duracion_meses: z.number().int().min(1).max(60),
  alcance: z.string().optional().nullable(),
  condiciones: z.string().optional().nullable(),
}).refine((d) => d.transformador_id || d.serie_id, {
  message: "Debe especificarse transformador_id o serie_id",
});

const updateGarantiaSchema = z.object({
  alcance: z.string().optional().nullable(),
  condiciones: z.string().optional().nullable(),
  estado: estadoGarEnum.optional(),
  motivo_estado: z.string().optional().nullable(),
}).refine((d) => !(d.estado && ["cancelada", "suspendida"].includes(d.estado)) || !!d.motivo_estado, {
  message: "Cancelar o suspender requiere motivo_estado",
});

const createReclamoSchema = z.object({
  descripcion: z.string().min(3).max(2000),
  severidad: severidadEnum.default("media"),
  canal: canalEnum.optional().nullable(),
  reportado_por_nombre: z.string().max(200).optional().nullable(),
  reportado_por_contacto_id: z.number().int().positive().optional().nullable(),
});

const updateReclamoSchema = z.object({
  descripcion: z.string().optional(),
  severidad: severidadEnum.optional(),
  estado: estadoReclamoEnum.optional(),
  resolucion: z.string().optional().nullable(),
});

const createIntervencionSchema = z.object({
  tipo: tipoIntervencionEnum,
  fecha_programada: z.string().optional().nullable(),
  ot_id: z.number().int().positive().optional().nullable(),
  tecnico_id: z.string().uuid().optional().nullable(),
  hallazgos: z.string().optional().nullable(),
  acciones_tomadas: z.string().optional().nullable(),
  costo_interno: z.number().min(0).optional().nullable(),
  resultado: resultadoIntEnum.optional().nullable(),
  observaciones: z.string().optional().nullable(),
});

const updateIntervencionSchema = createIntervencionSchema.partial().extend({
  fecha_real: z.string().optional().nullable(),
});

// ===================================================================
// Helpers
// ===================================================================
async function generarCodigoGarantia(tx: Prisma.TransactionClient, year: number): Promise<string> {
  const prefix = `GAR-${year}-`;
  const r = await tx.$queryRaw<{ max_num: number | null }[]>`
    SELECT COALESCE(MAX(CAST(SPLIT_PART(codigo, '-', 3) AS INTEGER)), 0) AS max_num
    FROM posventa.garantias
    WHERE codigo LIKE ${prefix + "%"}
  `;
  return `${prefix}${String((r[0]?.max_num ?? 0) + 1).padStart(4, "0")}`;
}

async function generarCodigoReclamo(tx: Prisma.TransactionClient, year: number): Promise<string> {
  const prefix = `REC-${year}-`;
  const r = await tx.$queryRaw<{ max_num: number | null }[]>`
    SELECT COALESCE(MAX(CAST(SPLIT_PART(codigo, '-', 3) AS INTEGER)), 0) AS max_num
    FROM posventa.reclamos
    WHERE codigo LIKE ${prefix + "%"}
  `;
  return `${prefix}${String((r[0]?.max_num ?? 0) + 1).padStart(4, "0")}`;
}

function calcFechaFin(inicio: Date, meses: number): Date {
  const d = new Date(inicio);
  d.setMonth(d.getMonth() + meses);
  return d;
}

// ===================================================================
// GET /api/garantias
// ===================================================================
router.get("/", requirePermission("expedientes", "read"), async (req, res) => {
  const page = Number(req.query.page ?? 1);
  const limit = Math.min(100, Number(req.query.limit ?? 25));
  const estado = req.query.estado as string | undefined;
  const cliente_id = req.query.cliente_id ? Number(req.query.cliente_id) : undefined;
  const por_vencer_30d = req.query.por_vencer_30d === "true";
  const q = (req.query.q as string | undefined)?.trim();

  const where: Prisma.garantiasWhereInput = {};
  if (estado) where.estado = estado;
  if (cliente_id) where.cliente_id = cliente_id;
  if (por_vencer_30d) {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const en30 = new Date(hoy); en30.setDate(en30.getDate() + 30);
    where.estado = "vigente";
    where.fecha_fin = { gte: hoy, lte: en30 };
  }
  if (q) {
    where.OR = [
      { codigo: { contains: q, mode: "insensitive" } },
      { clientes: { razon_social: { contains: q, mode: "insensitive" } } },
      { transformadores: { codigo_interno: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.garantias.findMany({
      where,
      orderBy: { fecha_fin: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        clientes: { select: { id: true, razon_social: true, ruc_cedula: true } },
        transformadores: { select: { id: true, codigo_interno: true, marca: true, modelo: true, capacidad_kva: true } },
        ot: { select: { id: true, codigo: true } },
        _count: { select: { reclamos: true } },
      },
    }),
    prisma.garantias.count({ where }),
  ]);

  res.json({ data, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) } });
});

// ===================================================================
// GET /api/garantias/dashboard/resumen
// ===================================================================
router.get("/dashboard/resumen", requirePermission("expedientes", "read"), async (_req, res) => {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const en30 = new Date(hoy); en30.setDate(en30.getDate() + 30);

  const [vigentes, porVencer, vencidas, reclamosAbiertos, total] = await Promise.all([
    prisma.garantias.count({ where: { estado: "vigente" } }),
    prisma.garantias.count({ where: { estado: "vigente", fecha_fin: { gte: hoy, lte: en30 } } }),
    prisma.garantias.count({ where: { estado: "vigente", fecha_fin: { lt: hoy } } }),
    prisma.reclamos.count({ where: { estado: { notIn: ["cerrado", "rechazado"] } } }),
    prisma.garantias.count(),
  ]);

  res.json({
    data: {
      total,
      vigentes,
      por_vencer_30d: porVencer,
      vencidas_no_cerradas: vencidas,
      reclamos_abiertos: reclamosAbiertos,
    },
  });
});

// ===================================================================
// GET /api/garantias/:id
// ===================================================================
router.get("/:id", requirePermission("expedientes", "read"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const g = await prisma.garantias.findUnique({
    where: { id },
    include: {
      clientes: { select: { id: true, razon_social: true, ruc_cedula: true, email: true, telefono: true } },
      transformadores: true,
      contratos: { select: { id: true, codigo: true } },
      ot: { select: { id: true, codigo: true, tipo_ruta: true, fecha_fin_real: true } },
      reclamos: {
        orderBy: { fecha_reclamo: "desc" },
        include: {
          intervenciones: {
            orderBy: { numero: "asc" },
            include: {
              usuarios_intervenciones_tecnico_idTousuarios: { select: { id: true, nombres: true, apellidos: true } },
            },
          },
        },
      },
    },
  });
  if (!g) { res.status(404).json({ error: "not_found" }); return; }

  // Calcular dias restantes
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const diasRestantes = Math.round((g.fecha_fin.getTime() - hoy.getTime()) / 86400000);

  res.json({ data: { ...g, dias_restantes: diasRestantes } });
});

// ===================================================================
// POST /api/garantias (manual)
// ===================================================================
router.post("/", requirePermission("expedientes", "write"), async (req, res) => {
  const parsed = createGarantiaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
    return;
  }
  const userId = req.user!.id;
  const d = parsed.data;
  const inicio = new Date(d.fecha_inicio);
  const fin = calcFechaFin(inicio, d.duracion_meses);

  try {
    const created = await withAppUser(userId, async (tx) => {
      const year = new Date().getFullYear();
      const codigo = await generarCodigoGarantia(tx, year);
      return tx.garantias.create({
        data: {
          codigo,
          cliente_id: d.cliente_id,
          transformador_id: d.transformador_id ?? null,
          serie_id: d.serie_id ?? null,
          contrato_id: d.contrato_id ?? null,
          ot_id_origen: d.ot_id_origen ?? null,
          fecha_inicio: inicio,
          fecha_fin: fin,
          duracion_meses: d.duracion_meses,
          alcance: d.alcance ?? null,
          condiciones: d.condiciones ?? null,
          estado: "vigente",
          creado_por: userId,
          actualizado_por: userId,
        },
      });
    });
    res.status(201).json({ data: created });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      res.status(409).json({ error: "duplicado" });
      return;
    }
    throw err;
  }
});

// ===================================================================
// PATCH /api/garantias/:id
// ===================================================================
router.patch("/:id", requirePermission("expedientes", "write"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = updateGarantiaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
    return;
  }
  const userId = req.user!.id;
  const d = parsed.data;

  await withAppUser(userId, async (tx) => {
    const data: Prisma.garantiasUpdateInput = { actualizado_por: { connect: { id: userId } } };
    if (d.alcance !== undefined) data.alcance = d.alcance;
    if (d.condiciones !== undefined) data.condiciones = d.condiciones;
    if (d.estado !== undefined) data.estado = d.estado;
    if (d.motivo_estado !== undefined) data.motivo_estado = d.motivo_estado;
    await tx.garantias.update({ where: { id }, data });
  });
  const g = await prisma.garantias.findUnique({ where: { id } });
  res.json({ data: g });
});

// ===================================================================
// RECLAMOS
// ===================================================================
router.post("/:id/reclamos", requirePermission("expedientes", "write"), async (req, res) => {
  const garId = Number(req.params.id);
  if (!Number.isInteger(garId) || garId <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = createReclamoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
    return;
  }
  const userId = req.user!.id;
  const d = parsed.data;

  // Validar garantía existe y está vigente
  const g = await prisma.garantias.findUnique({ where: { id: garId }, select: { id: true, estado: true } });
  if (!g) { res.status(404).json({ error: "not_found" }); return; }
  if (g.estado !== "vigente") { res.status(409).json({ error: "garantia_no_vigente" }); return; }

  const created = await withAppUser(userId, async (tx) => {
    const codigo = await generarCodigoReclamo(tx, new Date().getFullYear());
    return tx.reclamos.create({
      data: {
        codigo,
        garantia_id: garId,
        descripcion: d.descripcion,
        severidad: d.severidad,
        canal: d.canal ?? null,
        reportado_por_nombre: d.reportado_por_nombre ?? null,
        reportado_por_contacto_id: d.reportado_por_contacto_id ?? null,
        estado: "recibido",
        creado_por: userId,
        actualizado_por: userId,
      },
    });
  });
  res.status(201).json({ data: created });
});

router.patch("/:id/reclamos/:rId", requirePermission("expedientes", "write"), async (req, res) => {
  const garId = Number(req.params.id);
  const rId = Number(req.params.rId);
  if (!Number.isInteger(garId) || !Number.isInteger(rId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = updateReclamoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
    return;
  }
  const userId = req.user!.id;
  const d = parsed.data;

  const reclamo = await prisma.reclamos.findUnique({ where: { id: rId }, select: { garantia_id: true } });
  if (!reclamo || Number(reclamo.garantia_id) !== garId) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  // CHECK del esquema: cerrar requiere resolucion + fecha_cierre + dictaminado_por
  const updates: Prisma.reclamosUpdateInput = { actualizado_por: { connect: { id: userId } } };
  if (d.descripcion !== undefined) updates.descripcion = d.descripcion;
  if (d.severidad !== undefined) updates.severidad = d.severidad;
  if (d.resolucion !== undefined) updates.resolucion = d.resolucion;
  if (d.estado !== undefined) {
    updates.estado = d.estado;
    if (d.estado === "cerrado") {
      if (!d.resolucion) { res.status(400).json({ error: "resolucion_requerida_para_cerrar" }); return; }
      updates.fecha_cierre = new Date();
      updates.usuarios_reclamos_dictaminado_porTousuarios = { connect: { id: userId } };
    }
  }

  await withAppUser(userId, (tx) => tx.reclamos.update({ where: { id: rId }, data: updates }));
  const r = await prisma.reclamos.findUnique({ where: { id: rId } });
  res.json({ data: r });
});

// ===================================================================
// INTERVENCIONES
// ===================================================================
router.post("/:id/reclamos/:rId/intervenciones", requirePermission("expedientes", "write"), async (req, res) => {
  const garId = Number(req.params.id);
  const rId = Number(req.params.rId);
  if (!Number.isInteger(garId) || !Number.isInteger(rId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = createIntervencionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
    return;
  }
  const userId = req.user!.id;
  const d = parsed.data;

  const reclamo = await prisma.reclamos.findUnique({ where: { id: rId }, select: { garantia_id: true } });
  if (!reclamo || Number(reclamo.garantia_id) !== garId) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const created = await withAppUser(userId, async (tx) => {
    // numero auto-incremental por reclamo
    const max = await tx.intervenciones.aggregate({ where: { reclamo_id: rId }, _max: { numero: true } });
    const numero = (max._max.numero ?? 0) + 1;
    return tx.intervenciones.create({
      data: {
        reclamo_id: rId,
        numero,
        tipo: d.tipo,
        fecha_programada: d.fecha_programada ? new Date(d.fecha_programada) : null,
        ot_id: d.ot_id ?? null,
        tecnico_id: d.tecnico_id ?? null,
        hallazgos: d.hallazgos ?? null,
        acciones_tomadas: d.acciones_tomadas ?? null,
        costo_interno: d.costo_interno ?? 0,
        resultado: d.resultado ?? null,
        observaciones: d.observaciones ?? null,
        creado_por: userId,
        actualizado_por: userId,
      },
    });
  });
  res.status(201).json({ data: created });
});

router.patch("/:id/reclamos/:rId/intervenciones/:iId", requirePermission("expedientes", "write"), async (req, res) => {
  const garId = Number(req.params.id);
  const rId = Number(req.params.rId);
  const iId = Number(req.params.iId);
  if (!Number.isInteger(garId) || !Number.isInteger(rId) || !Number.isInteger(iId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = updateIntervencionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
    return;
  }
  const userId = req.user!.id;
  const d = parsed.data;

  const inter = await prisma.intervenciones.findUnique({ where: { id: iId }, select: { reclamo_id: true } });
  if (!inter || Number(inter.reclamo_id) !== rId) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const data: Prisma.intervencionesUpdateInput = { actualizado_por: { connect: { id: userId } } };
  if (d.tipo !== undefined) data.tipo = d.tipo;
  if (d.fecha_programada !== undefined) data.fecha_programada = d.fecha_programada ? new Date(d.fecha_programada) : null;
  if (d.fecha_real !== undefined) data.fecha_real = d.fecha_real ? new Date(d.fecha_real) : null;
  if (d.hallazgos !== undefined) data.hallazgos = d.hallazgos;
  if (d.acciones_tomadas !== undefined) data.acciones_tomadas = d.acciones_tomadas;
  if (d.costo_interno !== undefined && d.costo_interno !== null) data.costo_interno = d.costo_interno;
  if (d.resultado !== undefined) data.resultado = d.resultado;
  if (d.observaciones !== undefined) data.observaciones = d.observaciones;

  await withAppUser(userId, (tx) => tx.intervenciones.update({ where: { id: iId }, data }));
  const i = await prisma.intervenciones.findUnique({ where: { id: iId } });
  res.json({ data: i });
});

export default router;
