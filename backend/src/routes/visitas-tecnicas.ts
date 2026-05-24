import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import { withAppUser } from "../db/withAppUser";
import { requireAuth, requirePermission } from "../auth/middleware";

const router = Router();
router.use(requireAuth);

const ubicacionEnum = z.enum(["sitio_cliente", "planta", "virtual"]);
const recomendacionEnum = z.enum(["reparar", "reconstruir", "mantenimiento", "no_viable"]);
const estadoVisitaEnum = z.enum(["programada", "realizada", "cancelada"]);

// JSONB del formulario estandarizado de inspeccion. Se mantiene flexible:
// el shape puede evolucionar sin migrations. Validacion de campos
// concretos queda al frontend por ahora.
const datosInspeccionSchema = z.record(z.unknown()).nullable().optional();

const createSchema = z.object({
  expediente_id: z.number().int().positive(),
  hito_id: z.number().int().positive().optional().nullable(),
  fecha_programada: z.string().optional().nullable(),
  ubicacion_tipo: ubicacionEnum.default("sitio_cliente"),
  direccion: z.string().optional().nullable(),
  ingeniero_id: z.string().uuid().optional().nullable(),
  observaciones: z.string().optional().nullable(),
  datos_inspeccion: datosInspeccionSchema,
});

const updateSchema = z.object({
  fecha_programada: z.string().optional().nullable(),
  fecha_realizada: z.string().optional().nullable(),
  ubicacion_tipo: ubicacionEnum.optional(),
  direccion: z.string().optional().nullable(),
  ingeniero_id: z.string().uuid().optional().nullable(),
  hallazgos: z.string().optional().nullable(),
  fotos_urls: z.array(z.string()).optional().nullable(),
  recomendacion: recomendacionEnum.optional().nullable(),
  observaciones: z.string().optional().nullable(),
  estado: estadoVisitaEnum.optional(),
  datos_inspeccion: datosInspeccionSchema,
});

/**
 * Crea un informes_tecnicos asociado a la visita si no existe ya.
 * Idempotente: si ya hay informe con ese visita_id, no hace nada.
 * El codigo INF-YYYY-NNNN se calcula por SQL en SPLIT_PART (patron del repo).
 */
async function autoCrearInformeDesdeVisita(
  tx: Prisma.TransactionClient,
  visitaId: number,
  userId: string,
) {
  const visita = await tx.visitas_tecnicas.findUnique({ where: { id: visitaId } });
  if (!visita) return null;

  const existente = await tx.informes_tecnicos.findFirst({
    where: { visita_id: visitaId },
    select: { id: true },
  });
  if (existente) return existente;

  const codigo = await tx.$queryRaw<Array<{ codigo: string }>>`
    SELECT 'INF-' || EXTRACT(YEAR FROM NOW())::int || '-' ||
           LPAD((COALESCE(
             MAX(SPLIT_PART(numero, '-', 3)::INTEGER), 0
           ) + 1)::text, 4, '0') AS codigo
    FROM comercial.informes_tecnicos
    WHERE numero LIKE 'INF-' || EXTRACT(YEAR FROM NOW())::int || '-%'
  `;
  const numero = codigo[0]?.codigo ?? `INF-${new Date().getFullYear()}-0001`;

  // Si la visita tiene datos_inspeccion, calculamos un decision_tecnica
  // tentativo a partir de la recomendacion del JSONB.
  const datos = (visita.datos_inspeccion as Record<string, unknown> | null) ?? null;
  const decision =
    datos && typeof datos.recomendacion === "string"
      ? (datos.recomendacion as string)
      : visita.recomendacion ?? null;

  const informe = await tx.informes_tecnicos.create({
    data: {
      expediente_id: visita.expediente_id,
      hito_id: visita.hito_id,
      visita_id: visita.id,
      numero,
      diagnostico_completo: visita.hallazgos ?? null,
      decision_tecnica: decision,
      justificacion: typeof datos?.justificacion === "string" ? (datos.justificacion as string) : null,
      datos_inspeccion: datos as Prisma.InputJsonValue | undefined,
      estado: "borrador",
      creado_por: userId,
      actualizado_por: userId,
    },
    select: { id: true },
  });
  return informe;
}

router.get("/", requirePermission("expedientes", "read"), async (req, res) => {
  const expediente_id = req.query.expediente_id ? Number(req.query.expediente_id) : undefined;
  const data = await prisma.visitas_tecnicas.findMany({
    where: expediente_id ? { expediente_id } : {},
    orderBy: { fecha_programada: "desc" },
    take: 200,
    include: {
      expedientes: { select: { id: true, codigo: true } },
      usuarios_visitas_tecnicas_ingeniero_idTousuarios: { select: { id: true, nombres: true, apellidos: true } },
    },
  });
  res.json({ data });
});

router.get("/:id", requirePermission("expedientes", "read"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const visita = await prisma.visitas_tecnicas.findUnique({
    where: { id },
    include: {
      expedientes: { select: { id: true, codigo: true, clientes: { select: { razon_social: true } } } },
      usuarios_visitas_tecnicas_ingeniero_idTousuarios: { select: { id: true, nombres: true, apellidos: true } },
    },
  });
  if (!visita) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ data: visita });
});

router.post("/", requirePermission("expedientes", "write"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;
  const d = parsed.data;

  const visita = await withAppUser(userId, (tx) =>
    tx.visitas_tecnicas.create({
      data: {
        expediente_id: d.expediente_id,
        hito_id: d.hito_id ?? null,
        fecha_programada: d.fecha_programada ? new Date(d.fecha_programada) : null,
        ubicacion_tipo: d.ubicacion_tipo,
        direccion: d.direccion ?? null,
        ingeniero_id: d.ingeniero_id ?? null,
        observaciones: d.observaciones ?? null,
        datos_inspeccion: (d.datos_inspeccion as Prisma.InputJsonValue | undefined) ?? undefined,
        estado: "programada",
        creado_por: userId,
        actualizado_por: userId,
      },
    }),
  );
  res.status(201).json({ data: visita });
});

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

  let informeCreadoId: bigint | null = null;

  try {
    await withAppUser(userId, async (tx) => {
      const existing = await tx.visitas_tecnicas.findUnique({ where: { id } });
      if (!existing) throw new Error("not_found");

      if (d.fecha_programada !== undefined) {
        await tx.$executeRaw`UPDATE comercial.visitas_tecnicas SET fecha_programada = ${d.fecha_programada ? new Date(d.fecha_programada) : null} WHERE id = ${id}`;
      }
      if (d.fecha_realizada !== undefined) {
        await tx.$executeRaw`UPDATE comercial.visitas_tecnicas SET fecha_realizada = ${d.fecha_realizada ? new Date(d.fecha_realizada) : null} WHERE id = ${id}`;
      }
      if (d.ubicacion_tipo !== undefined) {
        await tx.$executeRaw`UPDATE comercial.visitas_tecnicas SET ubicacion_tipo = ${d.ubicacion_tipo} WHERE id = ${id}`;
      }
      if (d.direccion !== undefined) {
        await tx.$executeRaw`UPDATE comercial.visitas_tecnicas SET direccion = ${d.direccion} WHERE id = ${id}`;
      }
      if (d.ingeniero_id !== undefined) {
        await tx.$executeRaw`UPDATE comercial.visitas_tecnicas SET ingeniero_id = ${d.ingeniero_id ? Prisma.sql`${d.ingeniero_id}::uuid` : null} WHERE id = ${id}`;
      }
      if (d.hallazgos !== undefined) {
        await tx.$executeRaw`UPDATE comercial.visitas_tecnicas SET hallazgos = ${d.hallazgos} WHERE id = ${id}`;
      }
      if (d.fotos_urls !== undefined) {
        await tx.$executeRaw`UPDATE comercial.visitas_tecnicas SET fotos_urls = ${d.fotos_urls} WHERE id = ${id}`;
      }
      if (d.recomendacion !== undefined) {
        await tx.$executeRaw`UPDATE comercial.visitas_tecnicas SET recomendacion = ${d.recomendacion} WHERE id = ${id}`;
      }
      if (d.observaciones !== undefined) {
        await tx.$executeRaw`UPDATE comercial.visitas_tecnicas SET observaciones = ${d.observaciones} WHERE id = ${id}`;
      }
      if (d.datos_inspeccion !== undefined) {
        const jsonStr = d.datos_inspeccion ? JSON.stringify(d.datos_inspeccion) : null;
        await tx.$executeRaw`UPDATE comercial.visitas_tecnicas SET datos_inspeccion = ${jsonStr}::jsonb WHERE id = ${id}`;
      }
      if (d.estado !== undefined) {
        await tx.$executeRaw`UPDATE comercial.visitas_tecnicas SET estado = ${d.estado} WHERE id = ${id}`;
      }
      await tx.$executeRaw`UPDATE comercial.visitas_tecnicas SET actualizado_por = ${userId}::uuid WHERE id = ${id}`;

      // Auto-crear informe tecnico cuando la visita pasa a "realizada".
      // Idempotente: si ya hay informe, no hace nada.
      if (d.estado === "realizada") {
        const informe = await autoCrearInformeDesdeVisita(tx, id, userId);
        if (informe) informeCreadoId = informe.id;
      }
    });
    const updated = await prisma.visitas_tecnicas.findUnique({ where: { id } });
    res.json({ data: updated, informe_creado_id: informeCreadoId ? Number(informeCreadoId) : null });
  } catch (err) {
    if (err instanceof Error && err.message === "not_found") {
      res.status(404).json({ error: "not_found" });
      return;
    }
    throw err;
  }
});

export default router;
