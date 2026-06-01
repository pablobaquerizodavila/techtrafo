import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client";
import { withAppUser } from "../db/withAppUser";
import { requireAuth, requirePermission } from "../auth/middleware";
import { hashPassword } from "../auth/password";

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
  sitio_web: z.string().max(255).optional().nullable(),
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
// DELETE /api/clientes/:id/permanente  -  hard delete
//
// Solo permitido si el cliente NO tiene historial asociado:
//   - cotizaciones, expedientes, contratos, ordenes_trabajo,
//     transformadores, garantias, ni usuarios con cliente_id apuntando.
// Si hay >=1 → 409 con detalle de cuantos en cada modulo, para que el
// frontend muestre el motivo y sugiera archivar en su lugar.
//
// cliente_contactos se borra por CASCADE.
// Requiere permiso clientes.delete (lo tienen super_admin y los roles
// con all:true: presidencia, gerencia_general, gerencia_comercial).
// -------------------------------------------------------------------
router.delete("/:id/permanente", requirePermission("clientes", "delete"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const userId = req.user!.id;

  try {
    const cliente = await prisma.clientes.findUnique({ where: { id } });
    if (!cliente) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    // Contar dependencias en paralelo
    const [
      cotizaciones, expedientes, contratos, transformadores,
      garantias, usuarios,
    ] = await Promise.all([
      prisma.cotizaciones.count({ where: { cliente_id: id } }),
      prisma.expedientes.count({ where: { cliente_id: id } }),
      prisma.contratos.count({ where: { cliente_id: id } }),
      prisma.transformadores.count({ where: { cliente_id: id } }),
      prisma.garantias.count({ where: { cliente_id: id } }),
      prisma.usuarios.count({ where: { cliente_id: id } }),
    ]);

    const total = cotizaciones + expedientes + contratos + transformadores + garantias + usuarios;
    if (total > 0) {
      res.status(409).json({
        error: "cliente_con_historial",
        message: "El cliente tiene registros asociados y no puede eliminarse permanentemente. Usá 'Archivar' en su lugar.",
        dependencias: {
          cotizaciones, expedientes, contratos, transformadores,
          garantias, usuarios_portal: usuarios,
        },
      });
      return;
    }

    // Sin dependencias: borrar (cliente_contactos cascade)
    await withAppUser(userId, (tx) =>
      tx.clientes.delete({ where: { id } }),
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

// ===================================================================
// ACCESOS AL PORTAL — usuarios (rol "cliente") vinculados a un cliente
// Un cliente puede tener N accesos. Cada uno es un usuario con rol
// cliente, estado_aprobacion='aprobado' (lo crea el admin) y cliente_id
// apuntando al cliente. Ven sus expedientes vía /api/portal/*.
// ===================================================================

const accesoCreateSchema = z.object({
  email: z.string().email().max(255),
  nombres: z.string().min(1).max(100),
  apellidos: z.string().min(1).max(100),
  password: z.string().min(8).max(100),
});

// Genera un nombre_usuario único a partir del email (parte local sanitizada).
async function generarNombreUsuario(email: string): Promise<string> {
  const base = email.split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 40) || "cliente";
  let candidato = base;
  let n = 1;
  // Reintenta con sufijo hasta encontrar uno libre
  while (await prisma.usuarios.findFirst({ where: { nombre_usuario: candidato }, select: { id: true } })) {
    candidato = `${base}${n}`.slice(0, 50);
    n += 1;
    if (n > 9999) { candidato = `${base}${Date.now()}`.slice(0, 50); break; }
  }
  return candidato;
}

async function getRolClienteId(): Promise<number | null> {
  const rol = await prisma.roles.findFirst({ where: { nombre: "cliente" }, select: { id: true } });
  return rol?.id ?? null;
}

// -------------------------------------------------------------------
// GET /api/clientes/:id/accesos  -  lista de accesos del cliente
// -------------------------------------------------------------------
router.get("/:id/accesos", requirePermission("clientes", "read"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const data = await prisma.usuarios.findMany({
    where: { cliente_id: id },
    orderBy: { created_at: "asc" },
    select: {
      id: true, email: true, nombre_usuario: true, nombres: true, apellidos: true,
      activo: true, estado_aprobacion: true, ultimo_login: true, created_at: true,
    },
  });
  res.json({ data });
});

// -------------------------------------------------------------------
// POST /api/clientes/:id/accesos  -  crear acceso al portal
// -------------------------------------------------------------------
router.post("/:id/accesos", requirePermission("clientes", "write"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const parsed = accesoCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { email, nombres, apellidos, password } = parsed.data;

  // Validar cliente
  const cliente = await prisma.clientes.findUnique({ where: { id }, select: { id: true } });
  if (!cliente) { res.status(404).json({ error: "cliente_not_found" }); return; }

  // Email único global
  const existeEmail = await prisma.usuarios.findUnique({ where: { email }, select: { id: true } });
  if (existeEmail) { res.status(409).json({ error: "email_duplicado" }); return; }

  const rolClienteId = await getRolClienteId();
  if (!rolClienteId) { res.status(500).json({ error: "rol_cliente_no_existe" }); return; }

  const nombre_usuario = await generarNombreUsuario(email);
  const password_hash = await hashPassword(password);

  try {
    const nuevo = await withAppUser(req.user!.id, (tx) =>
      tx.usuarios.create({
        data: {
          email,
          password_hash,
          nombre_usuario,
          nombres,
          apellidos,
          rol_id: rolClienteId,
          cliente_id: id,
          activo: true,
          estado_aprobacion: "aprobado",
          aprobado_por: req.user!.id,
          fecha_aprobacion: new Date(),
        },
        select: {
          id: true, email: true, nombre_usuario: true, nombres: true, apellidos: true,
          activo: true, estado_aprobacion: true, created_at: true,
        },
      }),
    );
    res.status(201).json({ data: nuevo });
  } catch (err) {
    if (isUniqueViolation(err)) { res.status(409).json({ error: "email_o_usuario_duplicado" }); return; }
    throw err;
  }
});

// -------------------------------------------------------------------
// PATCH /api/clientes/:id/accesos/:userId/password  -  reset password
// -------------------------------------------------------------------
router.patch("/:id/accesos/:userId/password", requirePermission("clientes", "write"), async (req, res) => {
  const id = Number(req.params.id);
  const userId = req.params.userId;
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const pw = z.object({ password: z.string().min(8).max(100) }).safeParse(req.body);
  if (!pw.success) { res.status(400).json({ error: "password_invalida" }); return; }

  // Asegurar que el usuario pertenece a este cliente
  const u = await prisma.usuarios.findFirst({ where: { id: userId, cliente_id: id }, select: { id: true } });
  if (!u) { res.status(404).json({ error: "acceso_not_found" }); return; }

  const password_hash = await hashPassword(pw.data.password);
  // token_version+1 fuerza logout en todos sus dispositivos
  await prisma.$executeRaw`
    UPDATE core.usuarios
       SET password_hash = ${password_hash}, token_version = token_version + 1, updated_at = NOW()
     WHERE id = ${userId}::uuid`;
  res.json({ status: "password_reset" });
});

// -------------------------------------------------------------------
// PATCH /api/clientes/:id/accesos/:userId  -  activar / desactivar
// -------------------------------------------------------------------
router.patch("/:id/accesos/:userId", requirePermission("clientes", "write"), async (req, res) => {
  const id = Number(req.params.id);
  const userId = req.params.userId;
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const body = z.object({ activo: z.boolean() }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "invalid_payload" }); return; }

  const u = await prisma.usuarios.findFirst({ where: { id: userId, cliente_id: id }, select: { id: true } });
  if (!u) { res.status(404).json({ error: "acceso_not_found" }); return; }

  await prisma.$executeRaw`
    UPDATE core.usuarios SET activo = ${body.data.activo}, token_version = token_version + 1, updated_at = NOW()
     WHERE id = ${userId}::uuid`;
  res.json({ status: body.data.activo ? "activado" : "desactivado" });
});

// -------------------------------------------------------------------
// DELETE /api/clientes/:id/accesos/:userId  -  revocar acceso (hard delete)
// El usuario solo tiene rol cliente (no crea registros de negocio), por
// eso es seguro borrarlo. Si tuviera historial, el FK lo impediría.
// -------------------------------------------------------------------
router.delete("/:id/accesos/:userId", requirePermission("clientes", "write"), async (req, res) => {
  const id = Number(req.params.id);
  const userId = req.params.userId;
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }

  const u = await prisma.usuarios.findFirst({ where: { id: userId, cliente_id: id }, select: { id: true } });
  if (!u) { res.status(404).json({ error: "acceso_not_found" }); return; }

  try {
    await prisma.usuarios.delete({ where: { id: userId } });
    res.status(204).end();
  } catch (err) {
    if (isUniqueViolation(err)) { res.status(409).json({ error: "acceso_con_historial" }); return; }
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
