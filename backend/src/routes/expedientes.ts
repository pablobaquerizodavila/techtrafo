import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import { withAppUser } from "../db/withAppUser";
import { requireAuth, requirePermission } from "../auth/middleware";
import { notificarHitoEsperaAprobacion, notificarResolucionHito } from "../services/notificaciones";

const router = Router();
router.use(requireAuth);

// ===================================================================
// Schemas zod
// ===================================================================
const canalOrigenEnum = z.enum(["web", "whatsapp", "telefono", "email", "referido", "visita_directa", "otro"]);
const tipoServicioEnum = z.enum(["reparacion", "fabricacion", "mantenimiento", "otro"]);
const estadoExpEnum = z.enum(["activo", "ganado", "perdido", "cancelado"]);
const estadoHitoEnum = z.enum(["no_iniciado", "en_curso", "bloqueado", "completado", "rechazado", "omitido"]);

const createSchema = z.object({
  cliente_id: z.number().int().positive(),
  contacto_id: z.number().int().positive().optional().nullable(),
  ejecutivo_id: z.string().uuid().optional().nullable(),
  canal_origen: canalOrigenEnum.optional().nullable(),
  tipo_servicio_estimado: tipoServicioEnum,
  descripcion_problema: z.string().optional().nullable(),
});

const updateSchema = z.object({
  contacto_id: z.number().int().positive().optional().nullable(),
  ejecutivo_id: z.string().uuid().optional().nullable(),
  canal_origen: canalOrigenEnum.optional().nullable(),
  tipo_servicio_estimado: tipoServicioEnum.optional(),
  tipo_servicio_confirmado: tipoServicioEnum.optional().nullable(),
  descripcion_problema: z.string().optional().nullable(),
  estado: estadoExpEnum.optional(),
  motivo_cierre: z.string().optional().nullable(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(25),
  q: z.string().trim().optional(),
  estado: estadoExpEnum.optional(),
  ejecutivo_id: z.string().uuid().optional(),
  cliente_id: z.coerce.number().int().positive().optional(),
  estancados: z.enum(["true", "false"]).optional(),
});

const aprobarHitoSchema = z.object({
  notas: z.string().optional().nullable(),
});

const rechazarHitoSchema = z.object({
  motivo: z.string().min(1).max(500),
});

const iniciarHitoSchema = z.object({
  responsable_id: z.string().uuid().optional().nullable(),
});

// ===================================================================
// Helpers
// ===================================================================
async function generarCodigoExpediente(tx: Prisma.TransactionClient, year: number): Promise<string> {
  const prefix = `EXP-${year}-`;
  const result = await tx.$queryRaw<{ max_num: number | null }[]>`
    SELECT COALESCE(MAX(CAST(SPLIT_PART(codigo, '-', 3) AS INTEGER)), 0) AS max_num
    FROM comercial.expedientes
    WHERE codigo LIKE ${prefix + "%"}
  `;
  const nextNum = (result[0]?.max_num ?? 0) + 1;
  return `${prefix}${String(nextNum).padStart(4, "0")}`;
}

// ===================================================================
// GET /api/expedientes  -  lista paginada con filtros
// ===================================================================
router.get("/", requirePermission("expedientes", "read"), async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_query", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { page, limit, q, estado, ejecutivo_id, cliente_id, estancados } = parsed.data;

  // Si filtran por "estancados", uso query SQL custom contra la vista
  if (estancados === "true") {
    const data = await prisma.$queryRaw<Array<{
      expediente_id: bigint; expediente_codigo: string;
      cliente_nombre: string; expediente_estado: string;
      hito_codigo: string; hito_nombre: string; horas_transcurridas: number; sla_horas: number;
    }>>`
      SELECT DISTINCT
        expediente_id, expediente_codigo, cliente_nombre, expediente_estado,
        hito_codigo, hito_nombre, horas_transcurridas, sla_horas
      FROM comercial.v_expediente_pipeline
      WHERE estancado = true
      ORDER BY horas_transcurridas DESC
      LIMIT ${limit}
    `;
    res.json({
      data: data.map((r) => ({
        ...r,
        expediente_id: Number(r.expediente_id),
      })),
      pagination: { page: 1, limit, total: data.length, total_pages: 1 },
    });
    return;
  }

  const where: Prisma.expedientesWhereInput = {};
  if (estado) where.estado = estado;
  if (ejecutivo_id) where.ejecutivo_id = ejecutivo_id;
  if (cliente_id) where.cliente_id = cliente_id;
  if (q) {
    where.OR = [
      { codigo: { contains: q, mode: "insensitive" } },
      { clientes: { razon_social: { contains: q, mode: "insensitive" } } },
      { clientes: { ruc_cedula: { contains: q } } },
      { descripcion_problema: { contains: q, mode: "insensitive" } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.expedientes.findMany({
      where,
      orderBy: { fecha_apertura: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        clientes: { select: { id: true, razon_social: true, ruc_cedula: true } },
        usuarios_expedientes_ejecutivo_idTousuarios: { select: { id: true, nombres: true, apellidos: true } },
      },
    }),
    prisma.expedientes.count({ where }),
  ]);

  res.json({
    data,
    pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
  });
});

// ===================================================================
// GET /api/expedientes/:id  -  detalle con timeline (hitos)
// ===================================================================
router.get("/:id", requirePermission("expedientes", "read"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }

  const expediente = await prisma.expedientes.findUnique({
    where: { id },
    include: {
      clientes: { select: { id: true, razon_social: true, ruc_cedula: true, email: true, telefono: true } },
      cliente_contactos: { select: { id: true, nombres: true, apellidos: true, email: true } },
      usuarios_expedientes_ejecutivo_idTousuarios: { select: { id: true, nombres: true, apellidos: true, email: true } },
      cotizaciones: { select: { id: true, codigo: true, estado: true, total: true } },
      contratos: { select: { id: true, codigo: true, estado: true, monto_total: true } },
      ot: { select: { id: true, codigo: true, estado: true, tipo_ruta: true } },
      garantias: { select: { id: true, codigo: true, estado: true, fecha_fin: true } },
      expediente_hitos: {
        orderBy: { orden: "asc" },
        include: {
          usuarios_expediente_hitos_responsable_idTousuarios: { select: { id: true, nombres: true, apellidos: true } },
          usuarios_expediente_hitos_aprobado_porTousuarios: { select: { id: true, nombres: true, apellidos: true } },
          roles: { select: { id: true, nombre: true } },
        },
      },
      visitas_tecnicas: { orderBy: { fecha_programada: "desc" } },
      informes_tecnicos: { orderBy: { created_at: "desc" } },
    },
  });

  if (!expediente) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  // Calcular estancamiento de cada hito en runtime
  const now = Date.now();
  const hitosConEstancamiento = expediente.expediente_hitos.map((h) => {
    const inicio = h.fecha_inicio ? new Date(h.fecha_inicio).getTime() : null;
    const horasTranscurridas = inicio && h.estado === "en_curso"
      ? Math.round(((now - inicio) / 1000 / 3600) * 10) / 10
      : null;
    const estancado = h.estado === "en_curso" && h.sla_horas !== null && horasTranscurridas !== null
      ? horasTranscurridas > h.sla_horas
      : false;
    return { ...h, horas_transcurridas: horasTranscurridas, estancado };
  });

  res.json({
    data: {
      ...expediente,
      expediente_hitos: hitosConEstancamiento,
    },
  });
});

// ===================================================================
// POST /api/expedientes  -  crear + instanciar hitos
// ===================================================================
router.post("/", requirePermission("expedientes", "write"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;
  const data = parsed.data;

  try {
    const expediente = await withAppUser(userId, async (tx) => {
      // Validar cliente
      const cliente = await tx.clientes.findUnique({ where: { id: data.cliente_id } });
      if (!cliente || cliente.estado === "archivado") {
        throw new Error("cliente_no_disponible");
      }

      // Generar codigo
      const year = new Date().getFullYear();
      const codigo = await generarCodigoExpediente(tx, year);

      // Crear expediente
      const exp = await tx.expedientes.create({
        data: {
          codigo,
          cliente_id: data.cliente_id,
          contacto_id: data.contacto_id ?? null,
          ejecutivo_id: data.ejecutivo_id ?? userId,
          canal_origen: data.canal_origen ?? null,
          tipo_servicio_estimado: data.tipo_servicio_estimado,
          descripcion_problema: data.descripcion_problema ?? null,
          estado: "activo",
          creado_por: userId,
          actualizado_por: userId,
        },
      });

      // Instanciar hitos segun tipo_servicio (comun + tipo especifico)
      const plantillas = await tx.hito_plantillas.findMany({
        where: {
          activo: true,
          OR: [
            { tipo_servicio: "comun" },
            { tipo_servicio: data.tipo_servicio_estimado },
          ],
        },
        orderBy: { orden: "asc" },
      });

      // Primer hito (captacion) se marca completado inmediatamente
      const hitosData = plantillas.map((p) => ({
        expediente_id: exp.id,
        plantilla_id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        orden: p.orden,
        visible_cliente: p.visible_cliente,
        requiere_aprobacion: p.requiere_aprobacion,
        rol_aprobador_id: p.rol_aprobador_id,
        sla_horas: p.sla_horas,
        estado: p.codigo === "captacion" ? "completado" : "no_iniciado",
        fecha_inicio: p.codigo === "captacion" ? new Date() : null,
        fecha_fin: p.codigo === "captacion" ? new Date() : null,
        creado_por: userId,
        actualizado_por: userId,
      }));

      await tx.expediente_hitos.createMany({ data: hitosData });

      // El siguiente hito tras captacion se marca en_curso para arrancar la cadena
      const siguiente = plantillas.find((p) => p.codigo !== "captacion");
      if (siguiente) {
        await tx.expediente_hitos.updateMany({
          where: { expediente_id: exp.id, codigo: siguiente.codigo },
          data: { estado: "en_curso", fecha_inicio: new Date() },
        });
      }

      return exp;
    });

    // Retornar con detalles
    const completo = await prisma.expedientes.findUnique({
      where: { id: expediente.id },
      include: {
        clientes: { select: { id: true, razon_social: true, ruc_cedula: true } },
        expediente_hitos: { orderBy: { orden: "asc" } },
      },
    });

    // Si el primer hito en_curso requiere aprobacion, notificar (4.D)
    const primero = completo?.expediente_hitos.find((h) => h.estado === "en_curso");
    if (primero?.requiere_aprobacion && primero.rol_aprobador_id) {
      void notificarHitoEsperaAprobacion(Number(primero.id)).catch((e) =>
        console.error("[notif] crear->esperaAprobacion fallo:", e),
      );
    }

    res.status(201).json({ data: completo });
  } catch (err) {
    if (err instanceof Error && err.message === "cliente_no_disponible") {
      res.status(400).json({ error: "cliente_no_disponible" });
      return;
    }
    throw err;
  }
});

// ===================================================================
// PATCH /api/expedientes/:id  -  actualizar cabecera
// ===================================================================
router.patch("/:id", requirePermission("expedientes", "write"), async (req, res) => {
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
      const existing = await tx.expedientes.findUnique({ where: { id } });
      if (!existing) throw new Error("not_found");

      // SQL directo (campos UUID con Prisma issue conocido)
      if (d.contacto_id !== undefined) {
        await tx.$executeRaw`UPDATE comercial.expedientes SET contacto_id = ${d.contacto_id} WHERE id = ${id}`;
      }
      if (d.ejecutivo_id !== undefined) {
        await tx.$executeRaw`UPDATE comercial.expedientes SET ejecutivo_id = ${d.ejecutivo_id ? Prisma.sql`${d.ejecutivo_id}::uuid` : null} WHERE id = ${id}`;
      }
      if (d.canal_origen !== undefined) {
        await tx.$executeRaw`UPDATE comercial.expedientes SET canal_origen = ${d.canal_origen} WHERE id = ${id}`;
      }
      if (d.tipo_servicio_estimado !== undefined) {
        await tx.$executeRaw`UPDATE comercial.expedientes SET tipo_servicio_estimado = ${d.tipo_servicio_estimado} WHERE id = ${id}`;
      }
      if (d.tipo_servicio_confirmado !== undefined) {
        await tx.$executeRaw`UPDATE comercial.expedientes SET tipo_servicio_confirmado = ${d.tipo_servicio_confirmado} WHERE id = ${id}`;
      }
      if (d.descripcion_problema !== undefined) {
        await tx.$executeRaw`UPDATE comercial.expedientes SET descripcion_problema = ${d.descripcion_problema} WHERE id = ${id}`;
      }
      if (d.estado !== undefined) {
        await tx.$executeRaw`UPDATE comercial.expedientes SET estado = ${d.estado}, fecha_cierre = CASE WHEN ${d.estado} IN ('ganado','perdido','cancelado') THEN COALESCE(fecha_cierre, NOW()) ELSE fecha_cierre END WHERE id = ${id}`;
      }
      if (d.motivo_cierre !== undefined) {
        await tx.$executeRaw`UPDATE comercial.expedientes SET motivo_cierre = ${d.motivo_cierre} WHERE id = ${id}`;
      }
      await tx.$executeRaw`UPDATE comercial.expedientes SET actualizado_por = ${userId}::uuid WHERE id = ${id}`;
    });

    const updated = await prisma.expedientes.findUnique({
      where: { id },
      include: {
        clientes: { select: { id: true, razon_social: true, ruc_cedula: true } },
      },
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

// ===================================================================
// POST /api/expedientes/:id/hitos/:hitoId/iniciar
// Cambia el hito a estado en_curso, asigna responsable opcional
// ===================================================================
router.post("/:id/hitos/:hitoId/iniciar", requirePermission("expedientes", "write"), async (req, res) => {
  const id = Number(req.params.id);
  const hitoId = Number(req.params.hitoId);
  if (!Number.isInteger(id) || !Number.isInteger(hitoId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = iniciarHitoSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload" });
    return;
  }
  const userId = req.user!.id;

  try {
    await withAppUser(userId, async (tx) => {
      const hito = await tx.expediente_hitos.findUnique({ where: { id: hitoId } });
      if (!hito || Number(hito.expediente_id) !== id) throw new Error("not_found");
      if (hito.estado !== "no_iniciado" && hito.estado !== "bloqueado") {
        throw new Error("estado_invalido");
      }

      const respId = parsed.data.responsable_id ?? userId;
      await tx.$executeRaw`
        UPDATE comercial.expediente_hitos
           SET estado = 'en_curso',
               fecha_inicio = COALESCE(fecha_inicio, NOW()),
               responsable_id = ${respId}::uuid,
               actualizado_por = ${userId}::uuid
         WHERE id = ${hitoId}
      `;
    });
    const updated = await prisma.expediente_hitos.findUnique({ where: { id: hitoId } });
    // Notificar al rol aprobador si el hito requiere gate (4.D)
    if (updated?.requiere_aprobacion && updated.rol_aprobador_id) {
      void notificarHitoEsperaAprobacion(hitoId).catch((e) =>
        console.error("[notif] iniciar->esperaAprobacion fallo:", e),
      );
    }
    res.json({ data: updated });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "not_found") {
        res.status(404).json({ error: "not_found" });
        return;
      }
      if (err.message === "estado_invalido") {
        res.status(409).json({ error: "estado_invalido" });
        return;
      }
    }
    throw err;
  }
});

// ===================================================================
// POST /api/expedientes/:id/hitos/:hitoId/aprobar
// Aprueba el gate (chequea rol del aprobador)
// ===================================================================
router.post("/:id/hitos/:hitoId/aprobar", requirePermission("expedientes", "aprobar"), async (req, res) => {
  const id = Number(req.params.id);
  const hitoId = Number(req.params.hitoId);
  if (!Number.isInteger(id) || !Number.isInteger(hitoId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = aprobarHitoSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload" });
    return;
  }
  const userId = req.user!.id;

  try {
    await withAppUser(userId, async (tx) => {
      const hito = await tx.expediente_hitos.findUnique({
        where: { id: hitoId },
        include: { roles: { select: { id: true, nombre: true } } },
      });
      if (!hito || Number(hito.expediente_id) !== id) throw new Error("not_found");

      // Chequear rol aprobador si el hito lo exige
      if (hito.requiere_aprobacion && hito.rol_aprobador_id) {
        // El user actual debe tener ese rol o ser super_admin
        if (!req.user!.es_super_admin && req.user!.rol_id !== hito.rol_aprobador_id) {
          throw new Error("rol_aprobador_incorrecto");
        }
      }

      if (hito.estado === "completado") throw new Error("ya_completado");

      const notasFinal = parsed.data.notas
        ? `[APROBADO ${new Date().toISOString().split("T")[0]}] ${parsed.data.notas}\n${hito.notas ?? ""}`.trim()
        : hito.notas;

      await tx.$executeRaw`
        UPDATE comercial.expediente_hitos
           SET estado = 'completado',
               fecha_fin = NOW(),
               aprobado_por = ${userId}::uuid,
               fecha_aprobacion = NOW(),
               notas = ${notasFinal},
               actualizado_por = ${userId}::uuid
         WHERE id = ${hitoId}
      `;

      // Activar el siguiente hito en orden (si esta en estado no_iniciado)
      await tx.$executeRaw`
        UPDATE comercial.expediente_hitos
           SET estado = 'en_curso', fecha_inicio = NOW(), actualizado_por = ${userId}::uuid
         WHERE expediente_id = ${id}
           AND estado = 'no_iniciado'
           AND orden = (
             SELECT MIN(orden) FROM comercial.expediente_hitos
              WHERE expediente_id = ${id} AND estado = 'no_iniciado'
           )
      `;
    });

    const updated = await prisma.expediente_hitos.findUnique({ where: { id: hitoId } });
    // Notificar al ejecutivo del expediente (4.D)
    void notificarResolucionHito(hitoId, true, null).catch((e) =>
      console.error("[notif] aprobar->resolucion fallo:", e),
    );
    // Si el siguiente hito activado requiere aprobacion, notificar a su rol aprobador
    const siguiente = await prisma.expediente_hitos.findFirst({
      where: { expediente_id: id, estado: "en_curso", id: { not: hitoId } },
      orderBy: { orden: "asc" },
      select: { id: true, requiere_aprobacion: true, rol_aprobador_id: true },
    });
    if (siguiente?.requiere_aprobacion && siguiente.rol_aprobador_id) {
      void notificarHitoEsperaAprobacion(Number(siguiente.id)).catch((e) =>
        console.error("[notif] siguiente->esperaAprobacion fallo:", e),
      );
    }
    res.json({ data: updated });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "not_found") {
        res.status(404).json({ error: "not_found" });
        return;
      }
      if (err.message === "rol_aprobador_incorrecto") {
        res.status(403).json({ error: "rol_aprobador_incorrecto" });
        return;
      }
      if (err.message === "ya_completado") {
        res.status(409).json({ error: "ya_completado" });
        return;
      }
    }
    throw err;
  }
});

// ===================================================================
// POST /api/expedientes/:id/hitos/:hitoId/rechazar
// Rechaza el gate con motivo, bloquea el flujo
// ===================================================================
router.post("/:id/hitos/:hitoId/rechazar", requirePermission("expedientes", "aprobar"), async (req, res) => {
  const id = Number(req.params.id);
  const hitoId = Number(req.params.hitoId);
  if (!Number.isInteger(id) || !Number.isInteger(hitoId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = rechazarHitoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;
  const { motivo } = parsed.data;

  try {
    await withAppUser(userId, async (tx) => {
      const hito = await tx.expediente_hitos.findUnique({ where: { id: hitoId } });
      if (!hito || Number(hito.expediente_id) !== id) throw new Error("not_found");

      if (hito.requiere_aprobacion && hito.rol_aprobador_id) {
        if (!req.user!.es_super_admin && req.user!.rol_id !== hito.rol_aprobador_id) {
          throw new Error("rol_aprobador_incorrecto");
        }
      }

      await tx.$executeRaw`
        UPDATE comercial.expediente_hitos
           SET estado = 'rechazado',
               fecha_fin = NOW(),
               aprobado_por = ${userId}::uuid,
               fecha_aprobacion = NOW(),
               motivo_rechazo = ${motivo},
               actualizado_por = ${userId}::uuid
         WHERE id = ${hitoId}
      `;
    });
    const updated = await prisma.expediente_hitos.findUnique({ where: { id: hitoId } });
    // Notificar al ejecutivo del expediente (4.D)
    void notificarResolucionHito(hitoId, false, motivo).catch((e) =>
      console.error("[notif] rechazar->resolucion fallo:", e),
    );
    res.json({ data: updated });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "not_found") {
        res.status(404).json({ error: "not_found" });
        return;
      }
      if (err.message === "rol_aprobador_incorrecto") {
        res.status(403).json({ error: "rol_aprobador_incorrecto" });
        return;
      }
    }
    throw err;
  }
});

// ===================================================================
// GET /api/expedientes/dashboard/resumen
// KPIs para el tablero principal
// ===================================================================
router.get("/dashboard/resumen", requirePermission("expedientes", "read"), async (_req, res) => {
  const [totalActivos, totalEstancados, porEstado] = await Promise.all([
    prisma.expedientes.count({ where: { estado: "activo" } }),
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT expediente_id) AS count
      FROM comercial.v_expediente_pipeline
      WHERE estancado = true
    `,
    prisma.expedientes.groupBy({
      by: ["estado"],
      _count: true,
    }),
  ]);

  res.json({
    data: {
      total_activos: totalActivos,
      total_estancados: Number(totalEstancados[0]?.count ?? 0),
      por_estado: porEstado.reduce<Record<string, number>>((acc, r) => {
        acc[r.estado] = r._count;
        return acc;
      }, {}),
    },
  });
});

export default router;
