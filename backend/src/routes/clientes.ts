import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client";
import { withAppUser } from "../db/withAppUser";
import { requireAuth, requirePermission } from "../auth/middleware";

const router = Router();

// Todas las rutas requieren auth
router.use(requireAuth);

// -------------------------------------------------------------------
// Schemas de validacion
// -------------------------------------------------------------------
const tipoPersonaEnum = z.enum(["natural", "juridica"]);
const segmentoEnum = z.enum(["industrial", "distribuidora", "constructora", "otro"]);
const sectorEnum = z.enum(["privado", "publico"]);
const estadoEnum = z.enum(["activo", "inactivo", "bloqueado", "archivado"]);

const clienteCreateSchema = z.object({
  tipo_persona: tipoPersonaEnum,
  razon_social: z.string().min(1).max(200),
  nombre_comercial: z.string().max(200).optional().nullable(),
  ruc_cedula: z.string().min(10).max(13),
  direccion_fiscal: z.string().optional().nullable(),
  ciudad: z.string().max(80).optional().nullable(),
  provincia: z.string().max(80).optional().nullable(),
  pais: z.string().max(80).optional().default("Ecuador"),
  telefono: z.string().max(20).optional().nullable(),
  email: z.string().email().max(255).optional().nullable(),
  sitio_web: z.string().url().max(255).optional().nullable(),
  segmento: segmentoEnum.optional().nullable(),
  sector: sectorEnum.optional().nullable(),
  credito_habilitado: z.boolean().optional().default(false),
  limite_credito: z.number().nonnegative().optional().default(0),
  plazo_credito_dias: z.number().int().min(0).optional().default(0),
  notas: z.string().optional().nullable(),
});

const clienteUpdateSchema = clienteCreateSchema.partial().extend({
  estado: estadoEnum.optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(25),
  q: z.string().trim().optional(),
  estado: estadoEnum.optional(),
  segmento: segmentoEnum.optional(),
  sector: sectorEnum.optional(),
});

// Campos seguros para ordenar (whitelist)
const ORDER_FIELDS = new Set(["created_at", "razon_social", "id"]);

// -------------------------------------------------------------------
// GET /api/clientes  -  lista paginada
// -------------------------------------------------------------------
router.get("/", requirePermission("clientes", "read"), async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_query", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { page, limit, q, estado, segmento, sector } = parsed.data;

  // Filtros
  const where: Record<string, unknown> = {};
  // Por defecto, ocultar archivados (salvo que se pidan explicitamente)
  if (estado) {
    where.estado = estado;
  } else {
    where.estado = { not: "archivado" };
  }
  if (segmento) where.segmento = segmento;
  if (sector) where.sector = sector;
  if (q) {
    where.OR = [
      { razon_social: { contains: q, mode: "insensitive" } },
      { ruc_cedula: { contains: q } },
      { nombre_comercial: { contains: q, mode: "insensitive" } },
    ];
  }

  const orderBy = ORDER_FIELDS.has((req.query.order as string) ?? "")
    ? { [req.query.order as string]: req.query.dir === "asc" ? "asc" : "desc" }
    : { created_at: "desc" as const };

  const [data, total] = await Promise.all([
    prisma.clientes.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.clientes.count({ where }),
  ]);

  res.json({
    data,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    },
  });
});

// -------------------------------------------------------------------
// GET /api/clientes/:id  -  detalle con contactos
// -------------------------------------------------------------------
router.get("/:id", requirePermission("clientes", "read"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }

  const cliente = await prisma.clientes.findUnique({
    where: { id },
    include: {
      cliente_contactos: {
        where: { estado: { not: "inactivo" } },
        orderBy: [{ es_principal: "desc" }, { nombres: "asc" }],
      },
    },
  });

  if (!cliente) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  res.json({ data: cliente });
});

// -------------------------------------------------------------------
// POST /api/clientes  -  crear
// -------------------------------------------------------------------
router.post("/", requirePermission("clientes", "write"), async (req, res) => {
  const parsed = clienteCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;

  try {
    const cliente = await withAppUser(userId, (tx) =>
      tx.clientes.create({
        data: {
          ...parsed.data,
          creado_por: userId,
          actualizado_por: userId,
        },
      }),
    );
    res.status(201).json({ data: cliente });
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "duplicate_ruc_cedula" });
      return;
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// PATCH /api/clientes/:id  -  actualizar parcial
// -------------------------------------------------------------------
router.patch("/:id", requirePermission("clientes", "write"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }

  const parsed = clienteUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;

  try {
    const cliente = await withAppUser(userId, (tx) =>
      tx.clientes.update({
        where: { id },
        data: {
          ...parsed.data,
          actualizado_por: userId,
        },
      }),
    );
    res.json({ data: cliente });
  } catch (err) {
    if (isNotFound(err)) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "duplicate_ruc_cedula" });
      return;
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// DELETE /api/clientes/:id  -  soft delete (estado='archivado')
// -------------------------------------------------------------------
router.delete("/:id", requirePermission("clientes", "delete"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const userId = req.user!.id;

  try {
    await withAppUser(userId, (tx) =>
      tx.clientes.update({
        where: { id },
        data: { estado: "archivado", actualizado_por: userId },
      }),
    );
    res.status(204).end();
  } catch (err) {
    if (isNotFound(err)) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// Helpers de error
// -------------------------------------------------------------------
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  );
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "P2025"
  );
}

export default router;
