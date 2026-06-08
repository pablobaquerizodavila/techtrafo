/**
 * CRUD de proveedores + relacion item <-> proveedor (compras.item_proveedores).
 *
 * Permisos:
 *  - GET (listar/leer): proveedores.read | compras (legacy) | all
 *  - POST/PATCH:        proveedores.write | proveedores (legacy) | all
 *  - DELETE (soft):     solo override (presidencia/gerencia_general/jefe_compras)
 */
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import { withAppUser } from "../db/withAppUser";
import { requireAuth, requirePermission } from "../auth/middleware";

const router = Router();
router.use(requireAuth);

const ROLES_OVERRIDE_COMPRAS = [
  "presidencia",
  "gerencia_general",
  "gerencia_comercial",
  "jefe_compras",
];

function esOverrideCompras(rolNombre: string | null, esSuperAdmin: boolean): boolean {
  if (esSuperAdmin) return true;
  return !!rolNombre && ROLES_OVERRIDE_COMPRAS.includes(rolNombre);
}

// -------------------------------------------------------------------
// Schemas
// -------------------------------------------------------------------
const createProveedorSchema = z.object({
  razon_social: z.string().min(2).max(200),
  nombre_comercial: z.string().max(200).nullable().optional(),
  ruc: z.string().max(20).nullable().optional(),
  pais: z.string().max(80).default("Ecuador"),
  ciudad: z.string().max(120).nullable().optional(),
  direccion: z.string().nullable().optional(),
  contacto_nombre: z.string().max(150).nullable().optional(),
  contacto_cargo: z.string().max(120).nullable().optional(),
  contacto_email: z.string().email().max(255).nullable().optional().or(z.literal("")),
  contacto_telefono: z.string().max(40).nullable().optional(),
  sitio_web: z.string().max(255).nullable().optional(),
  condiciones_pago_default: z.string().max(120).nullable().optional(),
  moneda_default: z.string().length(3).default("USD"),
  tiempo_entrega_default_dias: z.number().int().nonnegative().nullable().optional(),
  incoterm_default: z.string().max(10).nullable().optional(),
  certificaciones: z.string().nullable().optional(),
  productos_que_suministra: z.string().nullable().optional(),
  observaciones: z.string().nullable().optional(),
  estado: z.enum(["activo", "inactivo", "bloqueado"]).default("activo"),
});

const updateProveedorSchema = createProveedorSchema.partial();

const itemProveedorSchema = z.object({
  item_id: z.number().int().positive(),
  precio_unitario: z.number().nonnegative(),
  moneda: z.string().length(3).default("USD"),
  unidad_medida: z.string().max(20).default("unid"),
  cantidad_minima_orden: z.number().nonnegative().default(1),
  tiempo_entrega_dias: z.number().int().nonnegative().nullable().optional(),
  condiciones_pago: z.string().max(120).nullable().optional(),
  incoterm: z.string().max(10).nullable().optional(),
  codigo_proveedor_item: z.string().max(100).nullable().optional(),
  es_principal: z.boolean().default(false),
  vigencia_desde: z.string().optional(),
  vigencia_hasta: z.string().nullable().optional(),
  notas: z.string().nullable().optional(),
});

const updateItemProveedorSchema = itemProveedorSchema.partial().omit({ item_id: true });

// -------------------------------------------------------------------
// GET /api/proveedores
// -------------------------------------------------------------------
router.get("/", requirePermission("proveedores", "read"), async (req, res) => {
  const estado = (req.query.estado as string | undefined) ?? undefined;
  const search = (req.query.q as string | undefined)?.trim() ?? "";

  const where: Prisma.proveedoresWhereInput = {};
  if (estado && ["activo", "inactivo", "bloqueado"].includes(estado)) where.estado = estado;
  if (search.length > 0) {
    where.OR = [
      { razon_social: { contains: search, mode: "insensitive" } },
      { nombre_comercial: { contains: search, mode: "insensitive" } },
      { codigo: { contains: search, mode: "insensitive" } },
      { ruc: { contains: search, mode: "insensitive" } },
    ];
  }
  const data = await prisma.proveedores.findMany({
    where,
    orderBy: { razon_social: "asc" },
    select: {
      id: true, codigo: true, razon_social: true, nombre_comercial: true, ruc: true,
      pais: true, ciudad: true, contacto_nombre: true, contacto_email: true, contacto_telefono: true,
      moneda_default: true, tiempo_entrega_default_dias: true, condiciones_pago_default: true,
      calificacion: true, total_ordenes: true, total_entregas_atiempo: true,
      total_no_conformidades: true, estado: true, created_at: true,
    },
  });
  res.json({ data });
});

// -------------------------------------------------------------------
// GET /api/proveedores/:id
// -------------------------------------------------------------------
router.get("/:id", requirePermission("proveedores", "read"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const data = await prisma.proveedores.findUnique({
    where: { id: BigInt(id) },
    include: {
      item_proveedores: {
        orderBy: { created_at: "desc" },
        include: {
          items: { select: { id: true, codigo_interno: true, nombre: true, unidad_medida: true } },
        },
      },
      _count: { select: { ordenes_compra: true } },
    },
  });
  if (!data) { res.status(404).json({ error: "not_found" }); return; }
  res.json({ data });
});

// -------------------------------------------------------------------
// POST /api/proveedores
// -------------------------------------------------------------------
router.post("/", requirePermission("proveedores", "write"), async (req, res) => {
  const parsed = createProveedorSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const d = parsed.data;
  const userId = req.user!.id;
  try {
    const proveedor = await withAppUser(userId, async (tx) => {
      return tx.proveedores.create({
        data: {
          codigo: "", // el trigger lo genera
          razon_social: d.razon_social,
          nombre_comercial: d.nombre_comercial ?? null,
          ruc: d.ruc ?? null,
          pais: d.pais,
          ciudad: d.ciudad ?? null,
          direccion: d.direccion ?? null,
          contacto_nombre: d.contacto_nombre ?? null,
          contacto_cargo: d.contacto_cargo ?? null,
          contacto_email: d.contacto_email && d.contacto_email !== "" ? d.contacto_email : null,
          contacto_telefono: d.contacto_telefono ?? null,
          sitio_web: d.sitio_web ?? null,
          condiciones_pago_default: d.condiciones_pago_default ?? null,
          moneda_default: d.moneda_default,
          tiempo_entrega_default_dias: d.tiempo_entrega_default_dias ?? null,
          incoterm_default: d.incoterm_default ?? null,
          certificaciones: d.certificaciones ?? null,
          productos_que_suministra: d.productos_que_suministra ?? null,
          observaciones: d.observaciones ?? null,
          estado: d.estado,
          creado_por: userId,
          actualizado_por: userId,
        },
      });
    });
    res.status(201).json({ data: proveedor });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      res.status(409).json({ error: "duplicado" });
      return;
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// PATCH /api/proveedores/:id
// -------------------------------------------------------------------
router.patch("/:id", requirePermission("proveedores", "write"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const parsed = updateProveedorSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;
  const d = parsed.data;

  const updateData: Prisma.proveedoresUpdateInput = {
    usuarios_proveedores_actualizado_porTousuarios: { connect: { id: userId } },
  };
  if (d.razon_social !== undefined) updateData.razon_social = d.razon_social;
  if (d.nombre_comercial !== undefined) updateData.nombre_comercial = d.nombre_comercial;
  if (d.ruc !== undefined) updateData.ruc = d.ruc;
  if (d.pais !== undefined) updateData.pais = d.pais;
  if (d.ciudad !== undefined) updateData.ciudad = d.ciudad;
  if (d.direccion !== undefined) updateData.direccion = d.direccion;
  if (d.contacto_nombre !== undefined) updateData.contacto_nombre = d.contacto_nombre;
  if (d.contacto_cargo !== undefined) updateData.contacto_cargo = d.contacto_cargo;
  if (d.contacto_email !== undefined)
    updateData.contacto_email = d.contacto_email && d.contacto_email !== "" ? d.contacto_email : null;
  if (d.contacto_telefono !== undefined) updateData.contacto_telefono = d.contacto_telefono;
  if (d.sitio_web !== undefined) updateData.sitio_web = d.sitio_web;
  if (d.condiciones_pago_default !== undefined) updateData.condiciones_pago_default = d.condiciones_pago_default;
  if (d.moneda_default !== undefined) updateData.moneda_default = d.moneda_default;
  if (d.tiempo_entrega_default_dias !== undefined) updateData.tiempo_entrega_default_dias = d.tiempo_entrega_default_dias;
  if (d.incoterm_default !== undefined) updateData.incoterm_default = d.incoterm_default;
  if (d.certificaciones !== undefined) updateData.certificaciones = d.certificaciones;
  if (d.productos_que_suministra !== undefined) updateData.productos_que_suministra = d.productos_que_suministra;
  if (d.observaciones !== undefined) updateData.observaciones = d.observaciones;
  if (d.estado !== undefined) updateData.estado = d.estado;

  try {
    const updated = await withAppUser(userId, async (tx) => {
      const exist = await tx.proveedores.findUnique({ where: { id: BigInt(id) } });
      if (!exist) throw new Error("not_found");
      return tx.proveedores.update({ where: { id: BigInt(id) }, data: updateData });
    });
    res.json({ data: updated });
  } catch (err) {
    if (err instanceof Error && err.message === "not_found") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// DELETE /api/proveedores/:id  (soft: estado=inactivo). Solo override.
// -------------------------------------------------------------------
router.delete("/:id", requirePermission("proveedores", "write"), async (req, res) => {
  if (!esOverrideCompras(req.user!.rol_nombre ?? null, req.user!.es_super_admin)) {
    res.status(403).json({ error: "rol_no_designado" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  try {
    await withAppUser(req.user!.id, async (tx) => {
      await tx.proveedores.update({
        where: { id: BigInt(id) },
        data: {
          estado: "inactivo",
          usuarios_proveedores_actualizado_porTousuarios: { connect: { id: req.user!.id } },
        },
      });
    });
    res.status(204).end();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// Relacion item <-> proveedor
// -------------------------------------------------------------------

// GET /api/proveedores/:id/items
router.get("/:id/items", requirePermission("proveedores", "read"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const data = await prisma.item_proveedores.findMany({
    where: { proveedor_id: BigInt(id) },
    orderBy: [{ es_principal: "desc" }, { created_at: "desc" }],
    include: { items: { select: { id: true, codigo_interno: true, nombre: true, unidad_medida: true } } },
  });
  res.json({ data });
});

// POST /api/proveedores/:id/items
router.post("/:id/items", requirePermission("proveedores", "write"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const parsed = itemProveedorSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const d = parsed.data;
  const userId = req.user!.id;
  try {
    const rel = await withAppUser(userId, async (tx) => {
      return tx.item_proveedores.create({
        data: {
          proveedor_id: BigInt(id),
          item_id: BigInt(d.item_id),
          precio_unitario: d.precio_unitario,
          moneda: d.moneda,
          unidad_medida: d.unidad_medida,
          cantidad_minima_orden: d.cantidad_minima_orden,
          tiempo_entrega_dias: d.tiempo_entrega_dias ?? null,
          condiciones_pago: d.condiciones_pago ?? null,
          incoterm: d.incoterm ?? null,
          codigo_proveedor_item: d.codigo_proveedor_item ?? null,
          es_principal: d.es_principal,
          vigencia_desde: d.vigencia_desde ? new Date(d.vigencia_desde) : new Date(),
          vigencia_hasta: d.vigencia_hasta ? new Date(d.vigencia_hasta) : null,
          notas: d.notas ?? null,
          creado_por: userId,
          actualizado_por: userId,
        },
      });
    });
    res.status(201).json({ data: rel });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      res.status(409).json({ error: "duplicado_item_proveedor" });
      return;
    }
    throw err;
  }
});

// PATCH /api/proveedores/:id/items/:relId
router.patch("/:id/items/:relId", requirePermission("proveedores", "write"), async (req, res) => {
  const id = Number(req.params.id);
  const relId = Number(req.params.relId);
  if (![id, relId].every((n) => Number.isInteger(n) && n > 0)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = updateItemProveedorSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const d = parsed.data;
  const userId = req.user!.id;

  const updateData: Prisma.item_proveedoresUpdateInput = {
    usuarios_item_proveedores_actualizado_porTousuarios: { connect: { id: userId } },
  };
  if (d.precio_unitario !== undefined) updateData.precio_unitario = d.precio_unitario;
  if (d.moneda !== undefined) updateData.moneda = d.moneda;
  if (d.unidad_medida !== undefined) updateData.unidad_medida = d.unidad_medida;
  if (d.cantidad_minima_orden !== undefined) updateData.cantidad_minima_orden = d.cantidad_minima_orden;
  if (d.tiempo_entrega_dias !== undefined) updateData.tiempo_entrega_dias = d.tiempo_entrega_dias;
  if (d.condiciones_pago !== undefined) updateData.condiciones_pago = d.condiciones_pago;
  if (d.incoterm !== undefined) updateData.incoterm = d.incoterm;
  if (d.codigo_proveedor_item !== undefined) updateData.codigo_proveedor_item = d.codigo_proveedor_item;
  if (d.es_principal !== undefined) updateData.es_principal = d.es_principal;
  if (d.vigencia_desde !== undefined) updateData.vigencia_desde = d.vigencia_desde ? new Date(d.vigencia_desde) : new Date();
  if (d.vigencia_hasta !== undefined) updateData.vigencia_hasta = d.vigencia_hasta ? new Date(d.vigencia_hasta) : null;
  if (d.notas !== undefined) updateData.notas = d.notas;

  try {
    const updated = await withAppUser(userId, async (tx) => {
      return tx.item_proveedores.update({
        where: { id: BigInt(relId) },
        data: updateData,
      });
    });
    res.json({ data: updated });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    throw err;
  }
});

// DELETE /api/proveedores/:id/items/:relId  (hard delete)
router.delete("/:id/items/:relId", requirePermission("proveedores", "write"), async (req, res) => {
  if (!esOverrideCompras(req.user!.rol_nombre ?? null, req.user!.es_super_admin)) {
    res.status(403).json({ error: "rol_no_designado" });
    return;
  }
  const relId = Number(req.params.relId);
  if (!Number.isInteger(relId) || relId <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  try {
    await withAppUser(req.user!.id, async (tx) => {
      await tx.item_proveedores.delete({ where: { id: BigInt(relId) } });
    });
    res.status(204).end();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    throw err;
  }
});

// -------------------------------------------------------------------
// Items que provee un proveedor especifico — endpoint inverso para items
// GET /api/proveedores/buscar-por-item/:itemId
// Retorna todos los proveedores que ofrecen un item, ordenados por precio
// (util para comparativo en cotizacion/OC)
// -------------------------------------------------------------------
router.get("/buscar-por-item/:itemId", requirePermission("proveedores", "read"), async (req, res) => {
  const itemId = Number(req.params.itemId);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const data = await prisma.item_proveedores.findMany({
    where: { item_id: BigInt(itemId) },
    orderBy: [{ es_principal: "desc" }, { precio_unitario: "asc" }],
    include: {
      proveedores: {
        select: {
          id: true, codigo: true, razon_social: true, calificacion: true,
          tiempo_entrega_default_dias: true, estado: true,
        },
      },
    },
  });
  res.json({ data });
});


// ===================================================================
// ACCESOS AL PORTAL - usuarios (rol "proveedor") vinculados a un proveedor
// ===================================================================
import { hashPassword } from "../auth/password";

const accesoProveedorCreateSchema = z.object({
  email: z.string().email().max(255),
  nombres: z.string().min(1).max(100),
  apellidos: z.string().min(1).max(100),
  password: z.string().min(8).max(100),
});

function isUniqueViolationProv(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

async function generarNombreUsuarioProv(email: string): Promise<string> {
  const base = email.split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 40) || "proveedor";
  let candidato = base;
  let n = 1;
  while (await prisma.usuarios.findFirst({ where: { nombre_usuario: candidato }, select: { id: true } })) {
    candidato = `${base}${n}`.slice(0, 50);
    n += 1;
    if (n > 9999) { candidato = `${base}${Date.now()}`.slice(0, 50); break; }
  }
  return candidato;
}

async function getRolProveedorId(): Promise<number | null> {
  const rol = await prisma.roles.findFirst({ where: { nombre: "proveedor" }, select: { id: true } });
  return rol?.id ?? null;
}

// GET /api/proveedores/:id/accesos
router.get("/:id/accesos", requirePermission("proveedores", "read"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const data = await prisma.usuarios.findMany({
    where: { proveedor_id: BigInt(id) },
    orderBy: { created_at: "asc" },
    select: {
      id: true, email: true, nombre_usuario: true, nombres: true, apellidos: true,
      activo: true, estado_aprobacion: true, ultimo_login: true, created_at: true,
    },
  });
  res.json({ data });
});

// POST /api/proveedores/:id/accesos
router.post("/:id/accesos", requirePermission("proveedores", "write"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const parsed = accesoProveedorCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { email, nombres, apellidos, password } = parsed.data;

  const proveedor = await prisma.proveedores.findUnique({ where: { id: BigInt(id) }, select: { id: true } });
  if (!proveedor) { res.status(404).json({ error: "proveedor_not_found" }); return; }

  const existeEmail = await prisma.usuarios.findUnique({ where: { email }, select: { id: true } });
  if (existeEmail) { res.status(409).json({ error: "email_duplicado" }); return; }

  const rolProveedorId = await getRolProveedorId();
  if (!rolProveedorId) { res.status(500).json({ error: "rol_proveedor_no_existe" }); return; }

  const nombre_usuario = await generarNombreUsuarioProv(email);
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
          rol_id: rolProveedorId,
          proveedor_id: BigInt(id),
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
    if (isUniqueViolationProv(err)) { res.status(409).json({ error: "email_o_usuario_duplicado" }); return; }
    throw err;
  }
});

// PATCH /api/proveedores/:id/accesos/:userId  (toggle activo)
router.patch("/:id/accesos/:userId", requirePermission("proveedores", "write"), async (req, res) => {
  const id = Number(req.params.id);
  const userId = req.params.userId;
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const pw = z.object({ activo: z.boolean() }).safeParse(req.body);
  if (!pw.success) { res.status(400).json({ error: "invalid_payload" }); return; }
  const u = await prisma.usuarios.findFirst({ where: { id: userId, proveedor_id: BigInt(id) }, select: { id: true } });
  if (!u) { res.status(404).json({ error: "not_found" }); return; }
  await prisma.$executeRaw`UPDATE core.usuarios SET activo = ${pw.data.activo}, updated_at = NOW() WHERE id = ${userId}::uuid`;
  res.json({ status: "ok" });
});

// DELETE /api/proveedores/:id/accesos/:userId
router.delete("/:id/accesos/:userId", requirePermission("proveedores", "write"), async (req, res) => {
  const id = Number(req.params.id);
  const userId = req.params.userId;
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const u = await prisma.usuarios.findFirst({ where: { id: userId, proveedor_id: BigInt(id) }, select: { id: true } });
  if (!u) { res.status(404).json({ error: "not_found" }); return; }
  await prisma.usuarios.delete({ where: { id: userId } });
  res.status(204).end();
});

export default router;
