/**
 * Requerimientos de Desarrollo (ticketing interno) — Fase 1.
 *
 * Maquina de estados:
 *   registrado -> en_revision -> pendiente_informacion / aprobado / rechazado / cancelado
 *   aprobado -> en_planificacion -> en_desarrollo -> en_pruebas -> listo_produccion -> completado
 *   (cancelado alcanzable desde casi cualquier estado no terminal)
 *
 * Permisos:
 *   desarrollo.read     -> ver (con scope: no-gestor solo ve sus propios)
 *   desarrollo.crear    -> registrar un requerimiento
 *   desarrollo.gestionar-> triage, transiciones, prioridad, asignacion, estimacion
 *
 * El codigo (DEV-000001) lo genera el trigger desarrollo.fn_generar_codigo_dev
 * en BEFORE INSERT cuando llega vacio.
 */
import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import { withAppUser } from "../db/withAppUser";
import { requireAuth, requirePermission, AuthUser } from "../auth/middleware";
import { env } from "../config/env";
import { serveStoredFile } from "../utils/serveStoredFile";
import {
  notificarReqCreado,
  notificarReqAsignado,
  notificarReqCambioEstado,
  notificarReqComentario,
  notificarReqSolicitudInfo,
} from "../services/notificaciones";

const router = Router();
router.use(requireAuth);

// -------------------------------------------------------------------
// Permisos / scope
// -------------------------------------------------------------------
function puedeGestionar(user: AuthUser): boolean {
  if (user.es_super_admin) return true;
  const p = user.permisos ?? {};
  return p["desarrollo.gestionar"] === true || p["desarrollo"] === true || p.all === true;
}

// Alcance de lectura: los gestores ven todo; el resto solo lo que solicitaron.
function scopeWhere(user: AuthUser): Prisma.requerimientosWhereInput {
  return puedeGestionar(user) ? {} : { solicitante_id: user.id };
}

// -------------------------------------------------------------------
// Maquina de estados
// -------------------------------------------------------------------
const TRANSICIONES: Record<string, string[]> = {
  registrado: ["en_revision", "rechazado", "cancelado"],
  en_revision: ["pendiente_informacion", "aprobado", "rechazado", "cancelado"],
  pendiente_informacion: ["en_revision", "cancelado"],
  aprobado: ["en_planificacion", "cancelado"],
  en_planificacion: ["en_desarrollo", "cancelado"],
  en_desarrollo: ["en_pruebas", "pendiente_informacion", "cancelado"],
  en_pruebas: ["listo_produccion", "en_desarrollo", "cancelado"],
  listo_produccion: ["completado", "cancelado"],
  completado: [],
  rechazado: [],
  cancelado: [],
};

// Estados desde los que el solicitante-dueno aun puede editar/cancelar.
const ESTADOS_EDITABLES_DUENO = ["registrado", "en_revision", "pendiente_informacion"];

// -------------------------------------------------------------------
// Enums / schemas
// -------------------------------------------------------------------
const TIPOS = [
  "nuevo_desarrollo",
  "mejora",
  "correccion_error",
  "cambio_configuracion",
  "integracion",
  "reporte_consulta",
  "otro",
] as const;

const PRIORIDADES = ["baja", "media", "alta", "urgente"] as const;

const ESTADOS = [
  "registrado",
  "en_revision",
  "pendiente_informacion",
  "aprobado",
  "en_planificacion",
  "en_desarrollo",
  "en_pruebas",
  "listo_produccion",
  "completado",
  "rechazado",
  "cancelado",
] as const;

const createSchema = z.object({
  titulo: z.string().min(1).max(200),
  tipo: z.enum(TIPOS),
  modulo_relacionado: z.string().max(120).optional(),
  descripcion: z.string().min(1),
  problema: z.string().optional(),
  resultado_esperado: z.string().optional(),
  prioridad_sugerida: z.enum(PRIORIDADES).default("media"),
  fecha_requerida: z.string().optional(),
});

const updateSchema = z.object({
  titulo: z.string().min(1).max(200).optional(),
  descripcion: z.string().min(1).optional(),
  problema: z.string().optional(),
  resultado_esperado: z.string().optional(),
  tipo: z.enum(TIPOS).optional(),
  modulo_relacionado: z.string().max(120).optional(),
  prioridad_sugerida: z.enum(PRIORIDADES).optional(),
  fecha_requerida: z.string().optional(),
});

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------
const selectUsuarioMin = { select: { id: true, nombres: true, apellidos: true } };

// Mapea errores de negocio lanzados dentro de la transaccion a HTTP.
// Devuelve true si respondio; el caller debe re-lanzar si devuelve false.
function mapBusinessError(err: unknown, res: Response): boolean {
  if (err instanceof Error) {
    const map: Record<string, number> = {
      not_found: 404,
      transicion_invalida: 409,
      requiere_responsable: 409,
      usuario_invalido: 400,
      sin_permiso: 403,
    };
    const code = map[err.message];
    if (code) {
      res.status(code).json({ error: err.message });
      return true;
    }
  }
  return false;
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

// Carga un requerimiento aplicando el scope de lectura: los gestores ven
// cualquiera; el resto solo los que solicitaron. Devuelve null cuando no existe
// o no es visible para el usuario (el handler debe responder 404 en ambos casos
// para no filtrar la existencia de requerimientos ajenos).
async function cargarVisible(id: number, user: AuthUser) {
  const r = await prisma.requerimientos.findUnique({ where: { id: BigInt(id) } });
  if (!r) return null;
  if (!puedeGestionar(user) && r.solicitante_id !== user.id) return null;
  return r;
}

// -------------------------------------------------------------------
// multer: adjuntos de requerimientos en disk (mismo patron que evidencias)
// Estructura: /uploads/requerimientos/{req_id}/{uuid}.{ext}
// -------------------------------------------------------------------
const adjBaseDir = path.join(env.UPLOAD_DIR, "requerimientos");
try { fs.mkdirSync(adjBaseDir, { recursive: true }); } catch { /* ignore */ }

const adjStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    // Validar el id ANTES de crear el directorio, para que un ":id" tipo
    // "../malicioso" no cree carpetas fuera de adjBaseDir.
    const reqId = Number(req.params.id);
    if (!Number.isInteger(reqId) || reqId <= 0) {
      cb(new Error("invalid_req_id"), "");
      return;
    }
    const dir = path.join(adjBaseDir, String(reqId));
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
    const safe = randomUUID() + (ext || "");
    cb(null, safe);
  },
});

const adjUpload = multer({
  storage: adjStorage,
  limits: { fileSize: env.UPLOAD_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const okMimes = [
      "application/pdf",
      "image/png", "image/jpeg", "image/webp", "image/gif",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/plain", "text/csv",
      "application/zip",
    ];
    if (!okMimes.includes(file.mimetype)) {
      cb(new Error(`mime_no_permitido:${file.mimetype}`));
      return;
    }
    cb(null, true);
  },
});

// -------------------------------------------------------------------
// GET /api/requerimientos  — listado con filtros, bandejas y scope
// -------------------------------------------------------------------
router.get("/", requirePermission("desarrollo", "read"), async (req, res) => {
  const user = req.user!;
  const q = (req.query.q as string | undefined)?.trim();
  const estado = req.query.estado as string | undefined;
  const prioridad = req.query.prioridad as string | undefined;
  const tipo = req.query.tipo as string | undefined;
  const modulo = req.query.modulo as string | undefined;
  const solicitante = req.query.solicitante as string | undefined;
  const responsable = req.query.responsable as string | undefined;
  const desde = req.query.desde as string | undefined;
  const hasta = req.query.hasta as string | undefined;
  const bandeja = req.query.bandeja as string | undefined;

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));

  const and: Prisma.requerimientosWhereInput[] = [scopeWhere(user)];

  if (q) {
    and.push({
      OR: [
        { codigo: { contains: q, mode: "insensitive" } },
        { titulo: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (estado) and.push({ estado });
  if (prioridad) and.push({ prioridad });
  if (tipo) and.push({ tipo });
  if (modulo) and.push({ modulo_relacionado: { contains: modulo, mode: "insensitive" } });
  if (solicitante) and.push({ solicitante_id: solicitante });
  if (responsable) and.push({ asignado_a: responsable });

  if (desde || hasta) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (desde) createdAt.gte = new Date(desde);
    if (hasta) createdAt.lte = new Date(hasta);
    and.push({ created_at: createdAt });
  }

  switch (bandeja) {
    case "mis":
      and.push({ solicitante_id: user.id });
      break;
    case "asignados":
      and.push({ asignado_a: user.id });
      break;
    case "pend_revision":
      and.push({ estado: { in: ["registrado", "en_revision"] } });
      break;
    case "en_desarrollo":
      and.push({ estado: "en_desarrollo" });
      break;
    case "pend_info":
      and.push({ estado: "pendiente_informacion" });
      break;
    case "completados":
      and.push({ estado: "completado" });
      break;
    case "cancelados":
      and.push({ estado: "cancelado" });
      break;
    default:
      // "todos" o vacio -> solo scopeWhere
      break;
  }

  const where: Prisma.requerimientosWhereInput = { AND: and };

  const [data, total] = await Promise.all([
    prisma.requerimientos.findMany({
      where,
      include: {
        usuarios_requerimientos_solicitante_idTousuarios: selectUsuarioMin,
        usuarios_requerimientos_asignado_aTousuarios: selectUsuarioMin,
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.requerimientos.count({ where }),
  ]);

  res.json({
    data,
    pagination: { total, page, limit, total_pages: Math.ceil(total / limit) },
  });
});

// -------------------------------------------------------------------
// GET /api/requerimientos/resumen  — KPIs respetando scope
// IMPORTANTE: debe ir ANTES de GET /:id o Express lo captura como ":id".
// -------------------------------------------------------------------
router.get("/resumen", requirePermission("desarrollo", "read"), async (req, res) => {
  const user = req.user!;
  const where = scopeWhere(user);

  const [total, grpEstado, grpPrioridad, grpResponsable, vencidos, promedioRaw] = await Promise.all([
    prisma.requerimientos.count({ where }),
    prisma.requerimientos.groupBy({ by: ["estado"], where, _count: { _all: true } }),
    prisma.requerimientos.groupBy({ by: ["prioridad"], where, _count: { _all: true } }),
    prisma.requerimientos.groupBy({
      by: ["asignado_a"],
      where: { ...where, asignado_a: { not: null } },
      _count: { _all: true },
    }),
    prisma.requerimientos.count({
      where: {
        ...where,
        fecha_requerida: { lt: new Date() },
        estado: { notIn: ["completado", "cancelado"] },
      },
    }),
    // Promedio de horas created_at -> updated_at de los completados, respetando scope.
    puedeGestionar(user)
      ? prisma.$queryRaw<{ h: number }[]>`
          SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600), 0)::float AS h
          FROM desarrollo.requerimientos
          WHERE estado = 'completado'
        `
      : prisma.$queryRaw<{ h: number }[]>`
          SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600), 0)::float AS h
          FROM desarrollo.requerimientos
          WHERE estado = 'completado' AND solicitante_id = ${user.id}::uuid
        `,
  ]);

  const por_estado: Record<string, number> = {};
  for (const g of grpEstado) por_estado[g.estado] = g._count._all;

  const por_prioridad: Record<string, number> = {};
  for (const g of grpPrioridad) por_prioridad[g.prioridad ?? "sin_prioridad"] = g._count._all;

  const ids = grpResponsable
    .map((g) => g.asignado_a)
    .filter((x): x is string => x !== null);
  const usuarios = ids.length
    ? await prisma.usuarios.findMany({
        where: { id: { in: ids } },
        select: { id: true, nombres: true, apellidos: true },
      })
    : [];
  const nombreById = new Map(
    usuarios.map((u) => [u.id, `${u.nombres} ${u.apellidos}`.trim()]),
  );
  const por_responsable = grpResponsable.map((g) => ({
    responsable_id: g.asignado_a,
    nombre: nombreById.get(g.asignado_a as string) ?? null,
    total: g._count._all,
  }));

  const tiempo_promedio_horas = Math.round((promedioRaw[0]?.h ?? 0) * 10) / 10;

  res.json({
    data: {
      total,
      por_estado,
      por_prioridad,
      por_responsable,
      tiempo_promedio_horas,
      vencidos,
    },
  });
});

// -------------------------------------------------------------------
// GET /api/requerimientos/export  — CSV con los mismos filtros que GET /
// IMPORTANTE: debe ir ANTES de GET /:id o Express lo captura como ":id".
// -------------------------------------------------------------------
router.get("/export", requirePermission("desarrollo", "read"), async (req, res) => {
  const user = req.user!;
  const q = (req.query.q as string | undefined)?.trim();
  const estado = req.query.estado as string | undefined;
  const prioridad = req.query.prioridad as string | undefined;
  const tipo = req.query.tipo as string | undefined;
  const modulo = req.query.modulo as string | undefined;
  const solicitante = req.query.solicitante as string | undefined;
  const responsable = req.query.responsable as string | undefined;
  const desde = req.query.desde as string | undefined;
  const hasta = req.query.hasta as string | undefined;
  const bandeja = req.query.bandeja as string | undefined;

  // Misma construccion de where/bandeja que GET / (sin paginacion).
  const and: Prisma.requerimientosWhereInput[] = [scopeWhere(user)];

  if (q) {
    and.push({
      OR: [
        { codigo: { contains: q, mode: "insensitive" } },
        { titulo: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (estado) and.push({ estado });
  if (prioridad) and.push({ prioridad });
  if (tipo) and.push({ tipo });
  if (modulo) and.push({ modulo_relacionado: { contains: modulo, mode: "insensitive" } });
  if (solicitante) and.push({ solicitante_id: solicitante });
  if (responsable) and.push({ asignado_a: responsable });

  if (desde || hasta) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (desde) createdAt.gte = new Date(desde);
    if (hasta) createdAt.lte = new Date(hasta);
    and.push({ created_at: createdAt });
  }

  switch (bandeja) {
    case "mis":
      and.push({ solicitante_id: user.id });
      break;
    case "asignados":
      and.push({ asignado_a: user.id });
      break;
    case "pend_revision":
      and.push({ estado: { in: ["registrado", "en_revision"] } });
      break;
    case "en_desarrollo":
      and.push({ estado: "en_desarrollo" });
      break;
    case "pend_info":
      and.push({ estado: "pendiente_informacion" });
      break;
    case "completados":
      and.push({ estado: "completado" });
      break;
    case "cancelados":
      and.push({ estado: "cancelado" });
      break;
    default:
      break;
  }

  const where: Prisma.requerimientosWhereInput = { AND: and };

  const rows = await prisma.requerimientos.findMany({
    where,
    include: {
      usuarios_requerimientos_solicitante_idTousuarios: selectUsuarioMin,
      usuarios_requerimientos_asignado_aTousuarios: selectUsuarioMin,
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: 5000,
  });

  const nombreDe = (u: { nombres: string; apellidos: string } | null): string =>
    u ? `${u.nombres} ${u.apellidos}`.trim() : "";
  const iso = (d: Date | null): string => (d ? d.toISOString() : "");
  const esc = (v: unknown): string => `"${String(v ?? "").replace(/"/g, '""')}"`;

  const headers = [
    "codigo",
    "titulo",
    "tipo",
    "estado",
    "prioridad",
    "solicitante",
    "responsable",
    "modulo",
    "fecha_creacion",
    "fecha_requerida",
    "ultima_actualizacion",
  ];

  const lineas = rows.map((r) =>
    [
      r.codigo,
      r.titulo,
      r.tipo,
      r.estado,
      r.prioridad ?? r.prioridad_sugerida,
      nombreDe(r.usuarios_requerimientos_solicitante_idTousuarios),
      nombreDe(r.usuarios_requerimientos_asignado_aTousuarios),
      r.modulo_relacionado ?? "",
      iso(r.created_at),
      iso(r.fecha_requerida),
      iso(r.updated_at),
    ]
      .map(esc)
      .join(","),
  );

  // BOM UTF-8 para que Excel detecte la codificacion.
  const csv = "﻿" + [headers.map(esc).join(","), ...lineas].join("\r\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="requerimientos.csv"');
  res.send(csv);
});

// -------------------------------------------------------------------
// GET /api/requerimientos/:id
// -------------------------------------------------------------------
router.get("/:id", requirePermission("desarrollo", "read"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const user = req.user!;
  const data = await prisma.requerimientos.findUnique({
    where: { id: BigInt(id) },
    include: {
      usuarios_requerimientos_solicitante_idTousuarios: selectUsuarioMin,
      usuarios_requerimientos_asignado_aTousuarios: selectUsuarioMin,
    },
  });
  if (!data) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  if (!puedeGestionar(user) && data.solicitante_id !== user.id) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ data });
});

// -------------------------------------------------------------------
// GET /api/requerimientos/:id/historial  — bitacora de acciones (scope)
// -------------------------------------------------------------------
router.get("/:id/historial", requirePermission("desarrollo", "read"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const user = req.user!;
  const r = await cargarVisible(id, user);
  if (!r) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const data = await prisma.requerimiento_historial.findMany({
    where: { requerimiento_id: BigInt(id) },
    include: { usuarios: selectUsuarioMin },
    orderBy: { created_at: "desc" },
  });
  res.json({ data });
});

// -------------------------------------------------------------------
// POST /api/requerimientos  — registrar
// -------------------------------------------------------------------
router.post("/", requirePermission("desarrollo", "crear"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const d = parsed.data;
  const user = req.user!;

  const data = await withAppUser(user.id, async (tx) => {
    const r = await tx.requerimientos.create({
      data: {
        codigo: "",
        titulo: d.titulo,
        tipo: d.tipo,
        modulo_relacionado: d.modulo_relacionado ?? null,
        descripcion: d.descripcion,
        problema: d.problema ?? null,
        resultado_esperado: d.resultado_esperado ?? null,
        prioridad_sugerida: d.prioridad_sugerida,
        solicitante_id: user.id,
        creado_por: user.id,
        fecha_requerida: d.fecha_requerida ? new Date(d.fecha_requerida) : null,
      },
      include: {
        usuarios_requerimientos_solicitante_idTousuarios: selectUsuarioMin,
        usuarios_requerimientos_asignado_aTousuarios: selectUsuarioMin,
      },
    });
    await tx.requerimiento_historial.create({
      data: {
        requerimiento_id: r.id,
        accion: "creado",
        detalle: {},
        por_usuario_id: user.id,
        rol_actuante: user.rol_nombre,
      },
    });
    return r;
  });

  void notificarReqCreado(data.id, req.user!.id).catch((e) => console.error("[notif]", e));

  res.status(201).json({ data });
});

// -------------------------------------------------------------------
// PATCH /api/requerimientos/:id  — editar (gestor, o dueno en estado editable)
// -------------------------------------------------------------------
router.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const d = parsed.data;
  const user = req.user!;

  try {
    const updated = await withAppUser(user.id, async (tx) => {
      const exist = await tx.requerimientos.findUnique({ where: { id: BigInt(id) } });
      if (!exist) throw new Error("not_found");

      const esDuenoEditable =
        exist.solicitante_id === user.id && ESTADOS_EDITABLES_DUENO.includes(exist.estado);
      if (!puedeGestionar(user) && !esDuenoEditable) throw new Error("sin_permiso");

      const updateData: Prisma.requerimientosUncheckedUpdateInput = {
        actualizado_por: user.id,
      };
      const cambios: Record<string, unknown> = {};
      if (d.titulo !== undefined) { updateData.titulo = d.titulo; cambios.titulo = d.titulo; }
      if (d.descripcion !== undefined) { updateData.descripcion = d.descripcion; cambios.descripcion = true; }
      if (d.problema !== undefined) { updateData.problema = d.problema; cambios.problema = true; }
      if (d.resultado_esperado !== undefined) { updateData.resultado_esperado = d.resultado_esperado; cambios.resultado_esperado = true; }
      if (d.tipo !== undefined) { updateData.tipo = d.tipo; cambios.tipo = d.tipo; }
      if (d.modulo_relacionado !== undefined) { updateData.modulo_relacionado = d.modulo_relacionado; cambios.modulo_relacionado = d.modulo_relacionado; }
      if (d.prioridad_sugerida !== undefined) { updateData.prioridad_sugerida = d.prioridad_sugerida; cambios.prioridad_sugerida = d.prioridad_sugerida; }
      if (d.fecha_requerida !== undefined) {
        updateData.fecha_requerida = d.fecha_requerida ? new Date(d.fecha_requerida) : null;
        cambios.fecha_requerida = d.fecha_requerida ?? null;
      }

      const r = await tx.requerimientos.update({
        where: { id: BigInt(id) },
        data: updateData,
        include: {
          usuarios_requerimientos_solicitante_idTousuarios: selectUsuarioMin,
          usuarios_requerimientos_asignado_aTousuarios: selectUsuarioMin,
        },
      });
      await tx.requerimiento_historial.create({
        data: {
          requerimiento_id: r.id,
          accion: "modificacion",
          detalle: cambios as Prisma.InputJsonValue,
          por_usuario_id: user.id,
          rol_actuante: user.rol_nombre,
        },
      });
      return r;
    });
    res.json({ data: updated });
  } catch (err) {
    if (mapBusinessError(err, res)) return;
    throw err;
  }
});

// -------------------------------------------------------------------
// POST /api/requerimientos/:id/estado  — transicion de estado (gestor)
// -------------------------------------------------------------------
router.post("/:id/estado", requirePermission("desarrollo", "gestionar"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = z.object({ estado: z.enum(ESTADOS), nota: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { estado, nota } = parsed.data;
  const user = req.user!;

  try {
    const updated = await withAppUser(user.id, async (tx) => {
      const exist = await tx.requerimientos.findUnique({ where: { id: BigInt(id) } });
      if (!exist) throw new Error("not_found");
      if (!TRANSICIONES[exist.estado]?.includes(estado)) throw new Error("transicion_invalida");
      if (estado === "completado" && !exist.asignado_a) throw new Error("requiere_responsable");

      const r = await tx.requerimientos.update({
        where: { id: BigInt(id) },
        data: { estado, actualizado_por: user.id },
        include: {
          usuarios_requerimientos_solicitante_idTousuarios: selectUsuarioMin,
          usuarios_requerimientos_asignado_aTousuarios: selectUsuarioMin,
        },
      });
      await tx.requerimiento_historial.create({
        data: {
          requerimiento_id: r.id,
          accion: "cambio_estado",
          detalle: { de: exist.estado, a: estado },
          por_usuario_id: user.id,
          rol_actuante: user.rol_nombre,
        },
      });
      if (nota) {
        await tx.requerimiento_comentarios.create({
          data: { requerimiento_id: r.id, cuerpo: nota, es_tecnico: true, autor_id: user.id },
        });
      }
      return r;
    });
    void notificarReqCambioEstado(BigInt(id), user.id).catch((e) => console.error("[notif]", e));
    res.json({ data: updated });
  } catch (err) {
    if (mapBusinessError(err, res)) return;
    throw err;
  }
});

// -------------------------------------------------------------------
// POST /api/requerimientos/:id/prioridad  — fijar prioridad definitiva (gestor)
// -------------------------------------------------------------------
router.post("/:id/prioridad", requirePermission("desarrollo", "gestionar"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = z.object({ prioridad: z.enum(PRIORIDADES) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { prioridad } = parsed.data;
  const user = req.user!;

  try {
    const updated = await withAppUser(user.id, async (tx) => {
      const exist = await tx.requerimientos.findUnique({ where: { id: BigInt(id) } });
      if (!exist) throw new Error("not_found");

      const r = await tx.requerimientos.update({
        where: { id: BigInt(id) },
        data: { prioridad, actualizado_por: user.id },
        include: {
          usuarios_requerimientos_solicitante_idTousuarios: selectUsuarioMin,
          usuarios_requerimientos_asignado_aTousuarios: selectUsuarioMin,
        },
      });
      await tx.requerimiento_historial.create({
        data: {
          requerimiento_id: r.id,
          accion: "cambio_prioridad",
          detalle: { de: exist.prioridad, a: prioridad },
          por_usuario_id: user.id,
          rol_actuante: user.rol_nombre,
        },
      });
      return r;
    });
    res.json({ data: updated });
  } catch (err) {
    if (mapBusinessError(err, res)) return;
    throw err;
  }
});

// -------------------------------------------------------------------
// POST /api/requerimientos/:id/asignar  — asignar responsable (gestor)
// -------------------------------------------------------------------
router.post("/:id/asignar", requirePermission("desarrollo", "gestionar"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = z.object({ asignado_a: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { asignado_a } = parsed.data;
  const user = req.user!;

  try {
    const updated = await withAppUser(user.id, async (tx) => {
      const exist = await tx.requerimientos.findUnique({ where: { id: BigInt(id) } });
      if (!exist) throw new Error("not_found");

      const responsable = await tx.usuarios.findFirst({ where: { id: asignado_a, activo: true } });
      if (!responsable) throw new Error("usuario_invalido");

      const r = await tx.requerimientos.update({
        where: { id: BigInt(id) },
        data: { asignado_a, actualizado_por: user.id },
        include: {
          usuarios_requerimientos_solicitante_idTousuarios: selectUsuarioMin,
          usuarios_requerimientos_asignado_aTousuarios: selectUsuarioMin,
        },
      });
      await tx.requerimiento_historial.create({
        data: {
          requerimiento_id: r.id,
          accion: "cambio_responsable",
          detalle: { de: exist.asignado_a, a: asignado_a },
          por_usuario_id: user.id,
          rol_actuante: user.rol_nombre,
        },
      });
      return r;
    });
    void notificarReqAsignado(BigInt(id), user.id).catch((e) => console.error("[notif]", e));
    res.json({ data: updated });
  } catch (err) {
    if (mapBusinessError(err, res)) return;
    throw err;
  }
});

// -------------------------------------------------------------------
// POST /api/requerimientos/:id/estimar  — fecha estimada de entrega (gestor)
// -------------------------------------------------------------------
router.post("/:id/estimar", requirePermission("desarrollo", "gestionar"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = z.object({ fecha_estimada_entrega: z.string() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { fecha_estimada_entrega } = parsed.data;
  const user = req.user!;

  try {
    const updated = await withAppUser(user.id, async (tx) => {
      const exist = await tx.requerimientos.findUnique({ where: { id: BigInt(id) } });
      if (!exist) throw new Error("not_found");

      const r = await tx.requerimientos.update({
        where: { id: BigInt(id) },
        data: { fecha_estimada_entrega: new Date(fecha_estimada_entrega), actualizado_por: user.id },
        include: {
          usuarios_requerimientos_solicitante_idTousuarios: selectUsuarioMin,
          usuarios_requerimientos_asignado_aTousuarios: selectUsuarioMin,
        },
      });
      await tx.requerimiento_historial.create({
        data: {
          requerimiento_id: r.id,
          accion: "estimacion",
          detalle: { fecha_estimada_entrega },
          por_usuario_id: user.id,
          rol_actuante: user.rol_nombre,
        },
      });
      return r;
    });
    res.json({ data: updated });
  } catch (err) {
    if (mapBusinessError(err, res)) return;
    throw err;
  }
});

// -------------------------------------------------------------------
// POST /api/requerimientos/:id/solicitar-info  — pedir info al solicitante (gestor)
// -------------------------------------------------------------------
router.post("/:id/solicitar-info", requirePermission("desarrollo", "gestionar"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = z.object({ mensaje: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { mensaje } = parsed.data;
  const user = req.user!;

  try {
    const updated = await withAppUser(user.id, async (tx) => {
      const exist = await tx.requerimientos.findUnique({ where: { id: BigInt(id) } });
      if (!exist) throw new Error("not_found");
      if (!TRANSICIONES[exist.estado]?.includes("pendiente_informacion")) throw new Error("transicion_invalida");

      const r = await tx.requerimientos.update({
        where: { id: BigInt(id) },
        data: { estado: "pendiente_informacion", actualizado_por: user.id },
        include: {
          usuarios_requerimientos_solicitante_idTousuarios: selectUsuarioMin,
          usuarios_requerimientos_asignado_aTousuarios: selectUsuarioMin,
        },
      });
      await tx.requerimiento_comentarios.create({
        data: { requerimiento_id: r.id, cuerpo: mensaje, es_tecnico: true, autor_id: user.id },
      });
      await tx.requerimiento_historial.create({
        data: {
          requerimiento_id: r.id,
          accion: "solicitud_info",
          detalle: { de: exist.estado, a: "pendiente_informacion" },
          por_usuario_id: user.id,
          rol_actuante: user.rol_nombre,
        },
      });
      return r;
    });
    void notificarReqSolicitudInfo(BigInt(id), user.id).catch((e) => console.error("[notif]", e));
    res.json({ data: updated });
  } catch (err) {
    if (mapBusinessError(err, res)) return;
    throw err;
  }
});

// -------------------------------------------------------------------
// POST /api/requerimientos/:id/cancelar  — gestor, o dueno en estado editable
// -------------------------------------------------------------------
router.post("/:id/cancelar", async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const user = req.user!;

  try {
    const updated = await withAppUser(user.id, async (tx) => {
      const exist = await tx.requerimientos.findUnique({ where: { id: BigInt(id) } });
      if (!exist) throw new Error("not_found");

      const esDuenoEditable =
        exist.solicitante_id === user.id && ESTADOS_EDITABLES_DUENO.includes(exist.estado);
      if (!puedeGestionar(user) && !esDuenoEditable) throw new Error("sin_permiso");

      const r = await tx.requerimientos.update({
        where: { id: BigInt(id) },
        data: { estado: "cancelado", actualizado_por: user.id },
        include: {
          usuarios_requerimientos_solicitante_idTousuarios: selectUsuarioMin,
          usuarios_requerimientos_asignado_aTousuarios: selectUsuarioMin,
        },
      });
      await tx.requerimiento_historial.create({
        data: {
          requerimiento_id: r.id,
          accion: "cambio_estado",
          detalle: { de: exist.estado, a: "cancelado" },
          por_usuario_id: user.id,
          rol_actuante: user.rol_nombre,
        },
      });
      return r;
    });
    void notificarReqCambioEstado(BigInt(id), user.id).catch((e) => console.error("[notif]", e));
    res.json({ data: updated });
  } catch (err) {
    if (mapBusinessError(err, res)) return;
    throw err;
  }
});

// -------------------------------------------------------------------
// GET /api/requerimientos/:id/comentarios  — hilo de comentarios (scope)
// -------------------------------------------------------------------
router.get("/:id/comentarios", requirePermission("desarrollo", "read"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const user = req.user!;
  const visible = await cargarVisible(id, user);
  if (!visible) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const data = await prisma.requerimiento_comentarios.findMany({
    where: { requerimiento_id: BigInt(id) },
    include: { usuarios: selectUsuarioMin },
    orderBy: { created_at: "asc" },
  });
  res.json({ data });
});

// -------------------------------------------------------------------
// POST /api/requerimientos/:id/comentarios  — comentar (dueno o gestor)
// Los gestores producen comentarios "tecnicos"; el dueno, no.
// -------------------------------------------------------------------
router.post("/:id/comentarios", requirePermission("desarrollo", "read"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = z.object({ cuerpo: z.string().min(1).max(4000) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { cuerpo } = parsed.data;
  const user = req.user!;

  const visible = await cargarVisible(id, user);
  if (!visible) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const data = await withAppUser(user.id, async (tx) => {
    const c = await tx.requerimiento_comentarios.create({
      data: {
        requerimiento_id: BigInt(id),
        autor_id: user.id,
        cuerpo,
        es_tecnico: puedeGestionar(user),
      },
      include: { usuarios: selectUsuarioMin },
    });
    await tx.requerimiento_historial.create({
      data: {
        requerimiento_id: BigInt(id),
        accion: "comentario",
        detalle: {},
        por_usuario_id: user.id,
        rol_actuante: user.rol_nombre,
      },
    });
    return c;
  });

  void notificarReqComentario(BigInt(id), user.id).catch((e) => console.error("[notif]", e));

  res.status(201).json({ data });
});

// -------------------------------------------------------------------
// POST /api/requerimientos/:id/adjuntos  — subir adjunto (dueno o gestor)
// -------------------------------------------------------------------
router.post(
  "/:id/adjuntos",
  requirePermission("desarrollo", "read"),
  (req: Request, res: Response, next: NextFunction) => {
    adjUpload.single("file")(req, res, (err: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.startsWith("mime_no_permitido:")) {
          res.status(400).json({ error: "mime_no_permitido", mime: msg.split(":")[1] });
          return;
        }
        if (msg.includes("File too large")) {
          res.status(413).json({ error: "archivo_muy_grande", max_bytes: env.UPLOAD_MAX_BYTES });
          return;
        }
        return next(err);
      }
      next();
    });
  },
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) {
      if (req.file) { try { fs.unlinkSync(req.file.path); } catch { /* ignore */ } }
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "file_required" });
      return;
    }
    const user = req.user!;

    const visible = await cargarVisible(id, user);
    if (!visible) {
      try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
      res.status(404).json({ error: "not_found" });
      return;
    }

    // Guardamos solo la ruta RELATIVA al UPLOAD_DIR (portable a MinIO).
    const rutaRelativa = path.relative(env.UPLOAD_DIR, req.file.path).replace(/\\/g, "/");

    const data = await withAppUser(user.id, async (tx) => {
      const a = await tx.requerimiento_adjuntos.create({
        data: {
          requerimiento_id: BigInt(id),
          ruta_relativa: rutaRelativa,
          nombre_original: req.file!.originalname,
          mime: req.file!.mimetype,
          tamano_bytes: req.file!.size,
          subido_por: user.id,
        },
        include: { usuarios: selectUsuarioMin },
      });
      await tx.requerimiento_historial.create({
        data: {
          requerimiento_id: BigInt(id),
          accion: "adjunto",
          detalle: { nombre: req.file!.originalname },
          por_usuario_id: user.id,
          rol_actuante: user.rol_nombre,
        },
      });
      return a;
    });

    res.status(201).json({ data });
  },
);

// -------------------------------------------------------------------
// GET /api/requerimientos/:id/adjuntos  — listar adjuntos (scope)
// -------------------------------------------------------------------
router.get("/:id/adjuntos", requirePermission("desarrollo", "read"), async (req, res) => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const user = req.user!;
  const visible = await cargarVisible(id, user);
  if (!visible) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const data = await prisma.requerimiento_adjuntos.findMany({
    where: { requerimiento_id: BigInt(id) },
    include: { usuarios: selectUsuarioMin },
    orderBy: { created_at: "desc" },
  });
  res.json({ data });
});

// -------------------------------------------------------------------
// GET /api/requerimientos/:id/adjuntos/:adjId/file  — descargar (scope)
// -------------------------------------------------------------------
router.get("/:id/adjuntos/:adjId/file", requirePermission("desarrollo", "read"), async (req, res) => {
  const id = parseId(req.params.id);
  const adjId = parseId(req.params.adjId);
  if (id === null || adjId === null) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const user = req.user!;
  const visible = await cargarVisible(id, user);
  if (!visible) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const adj = await prisma.requerimiento_adjuntos.findUnique({ where: { id: BigInt(adjId) } });
  if (!adj || adj.requerimiento_id !== BigInt(id)) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  serveStoredFile(res, adj.ruta_relativa, adj.nombre_original ?? undefined, "adjunto");
});

export default router;
