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
const tipoTrfEnum = z.enum(["distribucion", "potencia", "seco", "aceite", "pedestal", "subestacion", "especial"]);
const estadoTrfEnum = z.enum(["en_servicio", "en_taller", "en_almacen", "fuera_de_servicio", "dado_de_baja"]);

const createSchema = z.object({
  numero_serie: z.string().trim().max(100).optional().nullable(),
  marca: z.string().trim().max(80).optional().nullable(),
  modelo: z.string().trim().max(100).optional().nullable(),
  cliente_id: z.number().int().positive().optional().nullable(),
  tipo: tipoTrfEnum.default("distribucion"),
  capacidad_kva: z.number().int().positive(),
  tension_primaria_kv: z.number().positive().optional().nullable(),
  tension_secundaria_v: z.number().int().positive().optional().nullable(),
  conexion: z.string().trim().max(20).optional().nullable(),
  grupo_vectorial: z.string().trim().max(20).optional().nullable(),
  numero_fases: z.union([z.literal(1), z.literal(3)]).optional().nullable(),
  frecuencia_hz: z.union([z.literal(50), z.literal(60)]).optional().nullable(),
  refrigeracion: z.string().trim().max(20).optional().nullable(),
  peso_kg: z.number().positive().optional().nullable(),
  ancho_mm: z.number().int().positive().optional().nullable(),
  alto_mm: z.number().int().positive().optional().nullable(),
  profundidad_mm: z.number().int().positive().optional().nullable(),
  anio_fabricacion: z.number().int().min(1900).max(2200).optional().nullable(),
  fecha_puesta_servicio: z.string().optional().nullable(),
  ubicacion_actual: z.string().trim().max(200).optional().nullable(),
  estado: estadoTrfEnum.default("en_servicio"),
  observaciones: z.string().optional().nullable(),
  notas_internas: z.string().optional().nullable(),
});

const updateSchema = createSchema.partial();

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(25),
  q: z.string().trim().optional(),
  cliente_id: z.coerce.number().int().positive().optional(),
  tipo: tipoTrfEnum.optional(),
  estado: estadoTrfEnum.optional(),
  capacidad_min: z.coerce.number().int().positive().optional(),
  capacidad_max: z.coerce.number().int().positive().optional(),
});

// ===================================================================
// Helpers
// ===================================================================
async function generarCodigoInterno(tx: Prisma.TransactionClient, year: number): Promise<string> {
  const prefix = `TRF-${year}-`;
  const r = await tx.$queryRaw<{ max_num: number | null }[]>`
    SELECT COALESCE(MAX(CAST(SPLIT_PART(codigo_interno, '-', 3) AS INTEGER)), 0) AS max_num
    FROM produccion.transformadores
    WHERE codigo_interno LIKE ${prefix + "%"}
  `;
  const next = (r[0]?.max_num ?? 0) + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

// ===================================================================
// GET /api/transformadores
// ===================================================================
router.get("/", requirePermission("ot", "read"), async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_query", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { page, limit, q, cliente_id, tipo, estado, capacidad_min, capacidad_max } = parsed.data;

  const where: Prisma.transformadoresWhereInput = {};
  if (cliente_id) where.cliente_id = cliente_id;
  if (tipo) where.tipo = tipo;
  if (estado) where.estado = estado;
  if (capacidad_min || capacidad_max) {
    where.capacidad_kva = {};
    if (capacidad_min) where.capacidad_kva.gte = capacidad_min;
    if (capacidad_max) where.capacidad_kva.lte = capacidad_max;
  }
  if (q) {
    where.OR = [
      { codigo_interno: { contains: q, mode: "insensitive" } },
      { numero_serie: { contains: q, mode: "insensitive" } },
      { marca: { contains: q, mode: "insensitive" } },
      { modelo: { contains: q, mode: "insensitive" } },
      { clientes: { razon_social: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.transformadores.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        clientes: { select: { id: true, razon_social: true, ruc_cedula: true } },
        _count: { select: { ot: true } },
      },
    }),
    prisma.transformadores.count({ where }),
  ]);

  res.json({ data, pagination: { page, limit, total, total_pages: Math.ceil(total / limit) } });
});

// ===================================================================
// GET /api/transformadores/:id  -  detalle + historial
// ===================================================================
router.get("/:id", requirePermission("ot", "read"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }

  const trf = await prisma.transformadores.findUnique({
    where: { id },
    include: {
      clientes: { select: { id: true, razon_social: true, ruc_cedula: true, email: true, telefono: true } },
      ot: {
        orderBy: { created_at: "desc" },
        select: {
          id: true, codigo: true, tipo_ruta: true, estado: true, prioridad: true,
          descripcion: true, fecha_inicio_real: true, fecha_fin_real: true,
          fecha_fin_planeada: true, created_at: true,
          contratos: { select: { codigo: true } },
        },
      },
    },
  });

  if (!trf) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  // Stats agregados
  const totalOT = trf.ot.length;
  const completadas = trf.ot.filter((o) => o.estado === "completada").length;
  const enCurso = trf.ot.filter((o) => o.estado === "en_curso").length;
  const ultimaIntervencion = trf.ot[0]?.created_at ?? null;

  res.json({
    data: {
      ...trf,
      historial_stats: {
        total_intervenciones: totalOT,
        completadas,
        en_curso,
        ultima_intervencion: ultimaIntervencion,
      },
    },
  });
});

// ===================================================================
// POST /api/transformadores
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
    const trf = await withAppUser(userId, async (tx) => {
      if (d.cliente_id) {
        const c = await tx.clientes.findUnique({ where: { id: d.cliente_id } });
        if (!c) throw new Error("cliente_no_encontrado");
      }
      const year = new Date().getFullYear();
      const codigo = await generarCodigoInterno(tx, year);

      return tx.transformadores.create({
        data: {
          codigo_interno: codigo,
          numero_serie: d.numero_serie ?? null,
          marca: d.marca ?? null,
          modelo: d.modelo ?? null,
          cliente_id: d.cliente_id ?? null,
          tipo: d.tipo,
          capacidad_kva: d.capacidad_kva,
          tension_primaria_kv: d.tension_primaria_kv ?? null,
          tension_secundaria_v: d.tension_secundaria_v ?? null,
          conexion: d.conexion ?? null,
          grupo_vectorial: d.grupo_vectorial ?? null,
          numero_fases: d.numero_fases ?? null,
          frecuencia_hz: d.frecuencia_hz ?? null,
          refrigeracion: d.refrigeracion ?? null,
          peso_kg: d.peso_kg ?? null,
          ancho_mm: d.ancho_mm ?? null,
          alto_mm: d.alto_mm ?? null,
          profundidad_mm: d.profundidad_mm ?? null,
          anio_fabricacion: d.anio_fabricacion ?? null,
          fecha_puesta_servicio: d.fecha_puesta_servicio ? new Date(d.fecha_puesta_servicio) : null,
          ubicacion_actual: d.ubicacion_actual ?? null,
          estado: d.estado,
          observaciones: d.observaciones ?? null,
          notas_internas: d.notas_internas ?? null,
          creado_por: userId,
          actualizado_por: userId,
        },
      });
    });
    res.status(201).json({ data: trf });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "cliente_no_encontrado") {
        res.status(400).json({ error: "cliente_no_encontrado" });
        return;
      }
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      res.status(409).json({ error: "duplicado", message: "Ya existe un transformador con esa marca + número de serie" });
      return;
    }
    throw err;
  }
});

// ===================================================================
// PATCH /api/transformadores/:id
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
    const existing = await prisma.transformadores.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const updated = await withAppUser(userId, (tx) =>
      tx.transformadores.update({
        where: { id },
        data: {
          ...(d.numero_serie !== undefined && { numero_serie: d.numero_serie }),
          ...(d.marca !== undefined && { marca: d.marca }),
          ...(d.modelo !== undefined && { modelo: d.modelo }),
          ...(d.cliente_id !== undefined && { cliente_id: d.cliente_id }),
          ...(d.tipo !== undefined && { tipo: d.tipo }),
          ...(d.capacidad_kva !== undefined && { capacidad_kva: d.capacidad_kva }),
          ...(d.tension_primaria_kv !== undefined && { tension_primaria_kv: d.tension_primaria_kv }),
          ...(d.tension_secundaria_v !== undefined && { tension_secundaria_v: d.tension_secundaria_v }),
          ...(d.conexion !== undefined && { conexion: d.conexion }),
          ...(d.grupo_vectorial !== undefined && { grupo_vectorial: d.grupo_vectorial }),
          ...(d.numero_fases !== undefined && { numero_fases: d.numero_fases }),
          ...(d.frecuencia_hz !== undefined && { frecuencia_hz: d.frecuencia_hz }),
          ...(d.refrigeracion !== undefined && { refrigeracion: d.refrigeracion }),
          ...(d.peso_kg !== undefined && { peso_kg: d.peso_kg }),
          ...(d.ancho_mm !== undefined && { ancho_mm: d.ancho_mm }),
          ...(d.alto_mm !== undefined && { alto_mm: d.alto_mm }),
          ...(d.profundidad_mm !== undefined && { profundidad_mm: d.profundidad_mm }),
          ...(d.anio_fabricacion !== undefined && { anio_fabricacion: d.anio_fabricacion }),
          ...(d.fecha_puesta_servicio !== undefined && {
            fecha_puesta_servicio: d.fecha_puesta_servicio ? new Date(d.fecha_puesta_servicio) : null,
          }),
          ...(d.ubicacion_actual !== undefined && { ubicacion_actual: d.ubicacion_actual }),
          ...(d.estado !== undefined && { estado: d.estado }),
          ...(d.observaciones !== undefined && { observaciones: d.observaciones }),
          ...(d.notas_internas !== undefined && { notas_internas: d.notas_internas }),
          actualizado_por: userId,
        },
      }),
    );
    res.json({ data: updated });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      res.status(409).json({ error: "duplicado", message: "Ya existe un transformador con esa marca + número de serie" });
      return;
    }
    throw err;
  }
});

// ===================================================================
// GET /api/transformadores/cliente/:clienteId  -  lista por cliente
// Util para selects al crear OT desde contrato
// ===================================================================
router.get("/cliente/:clienteId", requirePermission("ot", "read"), async (req, res) => {
  const clienteId = Number(req.params.clienteId);
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const data = await prisma.transformadores.findMany({
    where: { cliente_id: clienteId, estado: { not: "dado_de_baja" } },
    orderBy: { codigo_interno: "asc" },
    select: {
      id: true, codigo_interno: true, numero_serie: true,
      marca: true, modelo: true, capacidad_kva: true, tipo: true, estado: true,
    },
  });
  res.json({ data });
});

export default router;
