import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import { requireAuth, requirePermission, requireSuperAdmin } from "../auth/middleware";
import { hashPassword } from "../auth/password";

const router = Router();

// Todas las rutas requieren auth
router.use(requireAuth);

// ===================================================================
// Schemas zod
// ===================================================================
const estadoAprobEnum = z.enum(["pendiente", "aprobado", "rechazado"]);

const listUsuariosSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(25),
  q: z.string().trim().optional(),
  estado: estadoAprobEnum.optional(),
  rol_id: z.coerce.number().int().positive().optional(),
});

const aprobarSchema = z.object({
  rol_id: z.number().int().positive(),
});

const rechazarSchema = z.object({
  motivo: z.string().min(1).max(500),
});

const updateUsuarioSchema = z.object({
  email: z.string().email().max(255).optional(),
  nombres: z.string().min(1).max(100).optional(),
  apellidos: z.string().min(1).max(100).optional(),
  telefono: z.string().max(20).optional().nullable(),
  rol_id: z.number().int().positive().optional().nullable(),
  cliente_id: z.number().int().positive().optional().nullable(),
  activo: z.boolean().optional(),
});

const resetPasswordSchema = z.object({
  new_password: z.string().min(8, "Minimo 8 caracteres").max(128),
});

const updateRolPermisosSchema = z.object({
  permisos: z.record(z.string(), z.boolean()),
});

const createRolSchema = z.object({
  nombre: z.string().min(1).max(50).regex(/^[a-z0-9_]+$/, "Solo minusculas, numeros y guion bajo"),
  descripcion: z.string().max(500).optional().nullable(),
  permisos: z.record(z.string(), z.boolean()).optional().default({}),
});

// ===================================================================
// USUARIOS  -  requiere permission admin.usuarios
// ===================================================================

router.get("/usuarios", requirePermission("admin", "usuarios"), async (req, res) => {
  const parsed = listUsuariosSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_query", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { page, limit, q, estado, rol_id } = parsed.data;

  const where: Prisma.usuariosWhereInput = {};
  if (estado) where.estado_aprobacion = estado;
  if (rol_id) where.rol_id = rol_id;
  if (q) {
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { nombres: { contains: q, mode: "insensitive" } },
      { apellidos: { contains: q, mode: "insensitive" } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.usuarios.findMany({
      where,
      orderBy: [{ estado_aprobacion: "asc" }, { created_at: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, email: true, nombres: true, apellidos: true,
        telefono: true, telefono_solicitud: true,
        rol_id: true, activo: true, ultimo_login: true,
        estado_aprobacion: true, aprobado_por: true, fecha_aprobacion: true,
        motivo_rechazo: true, created_at: true, updated_at: true,
        roles: { select: { id: true, nombre: true, es_super_admin: true } },
      },
    }),
    prisma.usuarios.count({ where }),
  ]);

  res.json({
    data,
    pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
  });
});

// Atajo para listar solo pendientes
router.get("/usuarios/pendientes", requirePermission("admin", "usuarios"), async (_req, res) => {
  const data = await prisma.usuarios.findMany({
    where: { estado_aprobacion: "pendiente", activo: true },
    orderBy: { created_at: "asc" },
    select: {
      id: true, email: true, nombres: true, apellidos: true,
      telefono_solicitud: true, created_at: true,
    },
  });
  res.json({ data });
});

router.post("/usuarios/:id/aprobar", requirePermission("admin", "usuarios"), async (req, res) => {
  const id = req.params.id;
  const parsed = aprobarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { rol_id } = parsed.data;
  const aprobadorId = req.user!.id;

  // Validar que el rol existe
  const rol = await prisma.roles.findUnique({ where: { id: rol_id } });
  if (!rol) {
    res.status(400).json({ error: "rol_no_existe" });
    return;
  }

  // Solo el super admin puede asignar otro rol super_admin
  if (rol.es_super_admin && !req.user!.es_super_admin) {
    res.status(403).json({ error: "super_admin_required" });
    return;
  }

  const existing = await prisma.usuarios.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (existing.estado_aprobacion === "aprobado") {
    res.status(409).json({ error: "ya_aprobado" });
    return;
  }

  // SQL directo para evitar tema de Prisma con campos UUID (mismo patron de otros routers)
  await prisma.$executeRaw`
    UPDATE core.usuarios
       SET estado_aprobacion = 'aprobado',
           rol_id = ${rol_id},
           aprobado_por = ${aprobadorId}::uuid,
           fecha_aprobacion = NOW(),
           motivo_rechazo = NULL,
           updated_at = NOW()
     WHERE id = ${id}::uuid
  `;

  const updated = await prisma.usuarios.findUnique({
    where: { id },
    select: {
      id: true, email: true, nombres: true, apellidos: true,
      estado_aprobacion: true, fecha_aprobacion: true, rol_id: true,
      roles: { select: { id: true, nombre: true } },
    },
  });
  res.json({ data: updated });
});

router.post("/usuarios/:id/rechazar", requirePermission("admin", "usuarios"), async (req, res) => {
  const id = req.params.id;
  const parsed = rechazarSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { motivo } = parsed.data;
  const aprobadorId = req.user!.id;

  const existing = await prisma.usuarios.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (existing.estado_aprobacion === "aprobado") {
    res.status(409).json({ error: "ya_aprobado_no_se_puede_rechazar" });
    return;
  }

  await prisma.$executeRaw`
    UPDATE core.usuarios
       SET estado_aprobacion = 'rechazado',
           motivo_rechazo = ${motivo},
           aprobado_por = ${aprobadorId}::uuid,
           fecha_aprobacion = NOW(),
           updated_at = NOW()
     WHERE id = ${id}::uuid
  `;
  res.json({ status: "rechazado" });
});

router.patch("/usuarios/:id", requirePermission("admin", "usuarios"), async (req, res) => {
  const id = req.params.id;
  const parsed = updateUsuarioSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const d = parsed.data;

  const target = await prisma.usuarios.findUnique({
    where: { id },
    include: { roles: { select: { es_super_admin: true, permisos: true } } },
  });
  if (!target) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  // Solo super_admin puede modificar otro super_admin (proteccion)
  if (target.roles?.es_super_admin && !req.user!.es_super_admin) {
    res.status(403).json({ error: "super_admin_required_to_edit_super_admin" });
    return;
  }

  // C2 — Self-escalation guard: nadie puede tocarse su propio rol_id o activo
  // ni siquiera super_admin (evita lock-out accidental dejandose sin permisos).
  // Para hacerlo, usar otra cuenta super_admin o el comando admin CLI futuro.
  if (id === req.user!.id) {
    if (d.rol_id !== undefined) {
      res.status(403).json({ error: "self_rol_change_prohibited" });
      return;
    }
    if (d.activo !== undefined) {
      res.status(403).json({ error: "self_activo_change_prohibited" });
      return;
    }
  }

  // Validar nuevo rol y prevenir escalada lateral hacia roles mas permisivos
  if (d.rol_id !== undefined && d.rol_id !== null) {
    const nuevoRol = await prisma.roles.findUnique({ where: { id: d.rol_id } });
    if (!nuevoRol) {
      res.status(400).json({ error: "rol_no_existe" });
      return;
    }
    // Solo super_admin puede asignar rol super_admin
    if (nuevoRol.es_super_admin && !req.user!.es_super_admin) {
      res.status(403).json({ error: "super_admin_required" });
      return;
    }
    // C2 — Escalada lateral: actor no super NO puede asignar un rol con permisos
    // que el actor mismo no tenga. Compara JSONB de permisos del rol del actor
    // con el del rol que esta tratando de asignar.
    if (!req.user!.es_super_admin) {
      const myPerms = (req.user!.permisos ?? {}) as Record<string, boolean>;
      const targetPerms = (nuevoRol.permisos ?? {}) as Record<string, boolean>;
      const allComodin = myPerms.all === true;
      if (!allComodin) {
        // Cada permiso del nuevo rol debe estar tambien en el del actor (granular o modulo)
        for (const [perm, v] of Object.entries(targetPerms)) {
          if (!v) continue;
          const modulo = perm.split(".")[0];
          if (myPerms[perm] === true) continue;
          if (myPerms[modulo] === true) continue;
          res.status(403).json({ error: "rol_con_permisos_que_actor_no_tiene", permiso_faltante: perm });
          return;
        }
      }
    }
  }

  // Email es unique: validar conflicto ANTES de tocar la fila
  if (d.email !== undefined && d.email !== target.email) {
    const conflict = await prisma.usuarios.findUnique({ where: { email: d.email }, select: { id: true } });
    if (conflict && conflict.id !== id) {
      res.status(409).json({ error: "email_en_uso" });
      return;
    }
  }

  // Aplicar cambios via SQL directo (campos UUID en aprobado_por evitan Prisma update typed)
  if (d.email !== undefined) {
    await prisma.$executeRaw`UPDATE core.usuarios SET email = ${d.email} WHERE id = ${id}::uuid`;
  }
  if (d.nombres !== undefined) {
    await prisma.$executeRaw`UPDATE core.usuarios SET nombres = ${d.nombres} WHERE id = ${id}::uuid`;
  }
  if (d.apellidos !== undefined) {
    await prisma.$executeRaw`UPDATE core.usuarios SET apellidos = ${d.apellidos} WHERE id = ${id}::uuid`;
  }
  if (d.telefono !== undefined) {
    await prisma.$executeRaw`UPDATE core.usuarios SET telefono = ${d.telefono} WHERE id = ${id}::uuid`;
  }
  if (d.rol_id !== undefined) {
    await prisma.$executeRaw`UPDATE core.usuarios SET rol_id = ${d.rol_id} WHERE id = ${id}::uuid`;
  }
  if (d.cliente_id !== undefined) {
    await prisma.$executeRaw`UPDATE core.usuarios SET cliente_id = ${d.cliente_id} WHERE id = ${id}::uuid`;
  }
  if (d.activo !== undefined) {
    await prisma.$executeRaw`UPDATE core.usuarios SET activo = ${d.activo} WHERE id = ${id}::uuid`;
  }
  await prisma.$executeRaw`UPDATE core.usuarios SET updated_at = NOW() WHERE id = ${id}::uuid`;

  const updated = await prisma.usuarios.findUnique({
    where: { id },
    select: {
      id: true, email: true, nombres: true, apellidos: true,
      telefono: true, rol_id: true, activo: true,
      estado_aprobacion: true,
      roles: { select: { id: true, nombre: true, es_super_admin: true } },
    },
  });
  res.json({ data: updated });
});

// Reset password administrativo. Misma proteccion que PATCH: solo super_admin
// puede resetear el password de otro super_admin. No notifica al usuario:
// el admin comunica el password nuevo fuera de banda.
router.post("/usuarios/:id/password", requirePermission("admin", "usuarios"), async (req, res) => {
  const id = req.params.id;
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }

  const target = await prisma.usuarios.findUnique({
    where: { id },
    include: { roles: { select: { es_super_admin: true, permisos: true } } },
  });
  if (!target) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (target.roles?.es_super_admin && !req.user!.es_super_admin) {
    res.status(403).json({ error: "super_admin_required_to_reset_super_admin" });
    return;
  }

  // C2/H3 — Si el target tiene permisos amplios (admin.* o all) y el actor
  // no es super_admin, exigir super_admin. Evita que un admin con admin.usuarios
  // tome cuenta de otro admin con mas privilegios.
  if (!req.user!.es_super_admin) {
    const targetPerms = (target.roles?.permisos as Record<string, boolean> | undefined) ?? {};
    const peligrosos = ["all", "admin", "admin.usuarios", "admin.roles"];
    const tienePermisoSensible = peligrosos.some((k) => targetPerms[k] === true);
    if (tienePermisoSensible) {
      res.status(403).json({ error: "super_admin_required_para_resetear_admin" });
      return;
    }
  }

  const password_hash = await hashPassword(parsed.data.new_password);
  await prisma.$executeRaw`
    UPDATE core.usuarios
       SET password_hash = ${password_hash}, updated_at = NOW()
     WHERE id = ${id}::uuid
  `;
  res.json({ status: "password_reset" });
});

// ===================================================================
// ROLES
// ===================================================================
// GET /api/admin/roles  -  cualquier user autenticado puede VER roles
// (frontend lo usa para selectores al aprobar usuarios)
router.get("/roles", async (_req, res) => {
  const data = await prisma.roles.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true, nombre: true, descripcion: true,
      permisos: true, es_super_admin: true, activo: true,
    },
  });
  res.json({ data });
});

// POST /api/admin/roles  -  solo super_admin crea roles nuevos
router.post("/roles", requireSuperAdmin, async (req, res) => {
  const parsed = createRolSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const rol = await prisma.roles.create({
      data: {
        nombre: parsed.data.nombre,
        descripcion: parsed.data.descripcion ?? null,
        permisos: parsed.data.permisos as Prisma.InputJsonValue,
        es_super_admin: false,
        activo: true,
      },
      select: {
        id: true, nombre: true, descripcion: true,
        permisos: true, es_super_admin: true, activo: true,
      },
    });
    res.status(201).json({ data: rol });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "P2002") {
      res.status(409).json({ error: "nombre_duplicado" });
      return;
    }
    throw err;
  }
});

// DELETE /api/admin/roles/:id  -  solo super_admin; rechaza si tiene usuarios
router.delete("/roles/:id", requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const rol = await prisma.roles.findUnique({ where: { id } });
  if (!rol) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (rol.es_super_admin) {
    res.status(409).json({ error: "no_se_puede_borrar_super_admin" });
    return;
  }
  const usuariosAsignados = await prisma.usuarios.count({ where: { rol_id: id } });
  if (usuariosAsignados > 0) {
    res.status(409).json({ error: "rol_con_usuarios", count: usuariosAsignados });
    return;
  }
  await prisma.roles.delete({ where: { id } });
  res.status(204).end();
});

// PATCH /api/admin/roles/:id  -  solo super_admin edita permisos
router.patch("/roles/:id", requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = updateRolPermisosSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const rol = await prisma.roles.update({
    where: { id },
    data: {
      permisos: parsed.data.permisos as Prisma.InputJsonValue,
      updated_at: new Date(),
    },
    select: {
      id: true, nombre: true, descripcion: true,
      permisos: true, es_super_admin: true,
    },
  });
  res.json({ data: rol });
});

// ===================================================================
// HITO PLANTILLAS - catalogo maestro de hitos (SLA, aprobacion, etc.)
// Solo super_admin edita. La lectura es publica para que cualquier user
// con permiso expedientes pueda ver los SLA base.
// ===================================================================

const updatePlantillaSchema = z.object({
  nombre: z.string().min(1).max(200).optional(),
  descripcion: z.string().optional().nullable(),
  sla_horas: z.number().int().positive().max(8760).optional().nullable(),
  requiere_aprobacion: z.boolean().optional(),
  rol_aprobador_id: z.number().int().positive().optional().nullable(),
  visible_cliente: z.boolean().optional(),
  activo: z.boolean().optional(),
});

router.get("/hito-plantillas", requireAuth, async (_req, res) => {
  const data = await prisma.hito_plantillas.findMany({
    orderBy: [{ tipo_servicio: "asc" }, { orden: "asc" }],
    select: {
      id: true, codigo: true, nombre: true, descripcion: true,
      orden: true, tipo_servicio: true, visible_cliente: true,
      requiere_aprobacion: true, rol_aprobador_id: true, sla_horas: true,
      es_automatico: true, fuente_tabla: true, activo: true,
      roles: { select: { id: true, nombre: true } },
    },
  });
  res.json({ data });
});

router.patch("/hito-plantillas/:id", requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = updatePlantillaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }

  const existing = await prisma.hito_plantillas.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  // Validar rol si requiere_aprobacion + rol_aprobador_id juntos cambian
  if (parsed.data.rol_aprobador_id) {
    const rol = await prisma.roles.findUnique({ where: { id: parsed.data.rol_aprobador_id } });
    if (!rol) {
      res.status(400).json({ error: "rol_no_existe" });
      return;
    }
  }

  const updated = await prisma.hito_plantillas.update({
    where: { id },
    data: {
      ...(parsed.data.nombre !== undefined && { nombre: parsed.data.nombre }),
      ...(parsed.data.descripcion !== undefined && { descripcion: parsed.data.descripcion }),
      ...(parsed.data.sla_horas !== undefined && { sla_horas: parsed.data.sla_horas }),
      ...(parsed.data.requiere_aprobacion !== undefined && { requiere_aprobacion: parsed.data.requiere_aprobacion }),
      ...(parsed.data.rol_aprobador_id !== undefined && { rol_aprobador_id: parsed.data.rol_aprobador_id }),
      ...(parsed.data.visible_cliente !== undefined && { visible_cliente: parsed.data.visible_cliente }),
      ...(parsed.data.activo !== undefined && { activo: parsed.data.activo }),
      actualizado_por: req.user!.id,
      updated_at: new Date(),
    },
    select: {
      id: true, codigo: true, nombre: true, descripcion: true,
      orden: true, tipo_servicio: true, visible_cliente: true,
      requiere_aprobacion: true, rol_aprobador_id: true, sla_horas: true,
      es_automatico: true, fuente_tabla: true, activo: true,
      roles: { select: { id: true, nombre: true } },
    },
  });
  res.json({ data: updated });
});

// Catalogo de permisos disponibles para usar en el editor de roles del frontend
router.get("/permisos/catalogo", (_req, res) => {
  res.json({
    data: [
      { modulo: "clientes", acciones: ["read", "write", "delete"] },
      { modulo: "cotizaciones", acciones: ["read", "write", "delete", "aprobar"] },
      { modulo: "contratos", acciones: ["read", "write", "delete", "cobrar"] },
      { modulo: "inventario", acciones: ["read", "write", "delete"] },
      { modulo: "movimientos", acciones: ["crear"] },
      { modulo: "expedientes", acciones: ["read", "write", "aprobar"] },
      { modulo: "ot", acciones: ["read", "write", "aprobar"] },
      { modulo: "admin", acciones: ["usuarios", "roles"] },
    ],
  });
});

export default router;
