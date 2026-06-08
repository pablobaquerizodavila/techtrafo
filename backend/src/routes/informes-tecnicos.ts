import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import { withAppUser } from "../db/withAppUser";
import { requireAuth, requirePermission } from "../auth/middleware";
import { enviarEmailLimiter } from "../auth/rate-limit";
import { crearDocumento, resolverNivel } from "../services/pdf/base";
import { DataInformeTecnico, renderInformeTecnico } from "../services/pdf/documentos";
import { sendEmail, escapeHtmlMultiline } from "../services/email";

const router = Router();
router.use(requireAuth);

const decisionTecnicaEnum = z.enum(["reparar", "reconstruir", "mantenimiento", "no_viable"]);
const estadoInformeEnum = z.enum(["borrador", "en_revision", "aprobado", "rechazado"]);

const datosInspeccionSchema = z.record(z.unknown()).nullable().optional();

const createSchema = z.object({
  expediente_id: z.number().int().positive(),
  hito_id: z.number().int().positive().optional().nullable(),
  visita_id: z.number().int().positive().optional().nullable(),
  diagnostico_completo: z.string().optional().nullable(),
  decision_tecnica: decisionTecnicaEnum.optional().nullable(),
  justificacion: z.string().optional().nullable(),
  datos_inspeccion: datosInspeccionSchema,
});

const updateSchema = z.object({
  diagnostico_completo: z.string().optional().nullable(),
  decision_tecnica: decisionTecnicaEnum.optional().nullable(),
  justificacion: z.string().optional().nullable(),
  archivo_pdf_url: z.string().optional().nullable(),
  estado: estadoInformeEnum.optional(),
  datos_inspeccion: datosInspeccionSchema,
});

const enviarEmailSchema = z.object({
  to: z.string().email().max(255),
  cc: z.string().email().max(255).optional().nullable(),
  asunto: z.string().max(200).optional(),
  mensaje: z.string().max(5000).optional(),
  nivel: z.number().int().min(1).max(4).optional(),
});

async function generarNumeroInforme(tx: Prisma.TransactionClient, year: number): Promise<string> {
  const prefix = `INF-${year}-`;
  const result = await tx.$queryRaw<{ max_num: number | null }[]>`
    SELECT COALESCE(MAX(CAST(SPLIT_PART(numero, '-', 3) AS INTEGER)), 0) AS max_num
    FROM comercial.informes_tecnicos
    WHERE numero LIKE ${prefix + "%"}
  `;
  const nextNum = (result[0]?.max_num ?? 0) + 1;
  return `${prefix}${String(nextNum).padStart(4, "0")}`;
}

router.get("/", requirePermission("expedientes", "read"), async (req, res) => {
  const expediente_id = req.query.expediente_id ? Number(req.query.expediente_id) : undefined;
  const data = await prisma.informes_tecnicos.findMany({
    where: expediente_id ? { expediente_id } : {},
    orderBy: { created_at: "desc" },
    take: 200,
    include: {
      expedientes: { select: { id: true, codigo: true } },
      visitas_tecnicas: { select: { id: true, fecha_realizada: true } },
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
  const inf = await prisma.informes_tecnicos.findUnique({
    where: { id },
    include: {
      expedientes: { select: { id: true, codigo: true, clientes: { select: { razon_social: true } } } },
      visitas_tecnicas: true,
    },
  });
  if (!inf) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ data: inf });
});

router.post("/", requirePermission("expedientes", "write"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const userId = req.user!.id;
  const d = parsed.data;

  const inf = await withAppUser(userId, async (tx) => {
    const year = new Date().getFullYear();
    const numero = await generarNumeroInforme(tx, year);
    return tx.informes_tecnicos.create({
      data: {
        expediente_id: d.expediente_id,
        hito_id: d.hito_id ?? null,
        visita_id: d.visita_id ?? null,
        numero,
        diagnostico_completo: d.diagnostico_completo ?? null,
        decision_tecnica: d.decision_tecnica ?? null,
        justificacion: d.justificacion ?? null,
        datos_inspeccion: (d.datos_inspeccion as Prisma.InputJsonValue | undefined) ?? undefined,
        estado: "borrador",
        creado_por: userId,
        actualizado_por: userId,
      },
    });
  });
  res.status(201).json({ data: inf });
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

  try {
    await withAppUser(userId, async (tx) => {
      const existing = await tx.informes_tecnicos.findUnique({ where: { id } });
      if (!existing) throw new Error("not_found");

      if (d.diagnostico_completo !== undefined) {
        await tx.$executeRaw`UPDATE comercial.informes_tecnicos SET diagnostico_completo = ${d.diagnostico_completo} WHERE id = ${id}`;
      }
      if (d.decision_tecnica !== undefined) {
        await tx.$executeRaw`UPDATE comercial.informes_tecnicos SET decision_tecnica = ${d.decision_tecnica} WHERE id = ${id}`;
      }
      if (d.justificacion !== undefined) {
        await tx.$executeRaw`UPDATE comercial.informes_tecnicos SET justificacion = ${d.justificacion} WHERE id = ${id}`;
      }
      if (d.archivo_pdf_url !== undefined) {
        await tx.$executeRaw`UPDATE comercial.informes_tecnicos SET archivo_pdf_url = ${d.archivo_pdf_url} WHERE id = ${id}`;
      }
      if (d.datos_inspeccion !== undefined) {
        const jsonStr = d.datos_inspeccion ? JSON.stringify(d.datos_inspeccion) : null;
        await tx.$executeRaw`UPDATE comercial.informes_tecnicos SET datos_inspeccion = ${jsonStr}::jsonb WHERE id = ${id}`;
      }
      if (d.estado !== undefined) {
        await tx.$executeRaw`UPDATE comercial.informes_tecnicos SET estado = ${d.estado} WHERE id = ${id}`;
        if (d.estado === "aprobado") {
          await tx.$executeRaw`
            UPDATE comercial.informes_tecnicos
               SET aprobado_por = ${userId}::uuid, fecha_aprobacion = NOW()
             WHERE id = ${id}
          `;
        }
      }
      await tx.$executeRaw`UPDATE comercial.informes_tecnicos SET actualizado_por = ${userId}::uuid WHERE id = ${id}`;
    });
    const updated = await prisma.informes_tecnicos.findUnique({ where: { id } });
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
// POST /api/informes-tecnicos/:id/enviar-email
// Genera el PDF en memoria y lo envia adjunto al destinatario indicado.
// -------------------------------------------------------------------
async function generarPdfBuffer(
  inf: DataInformeTecnico & { created_at?: Date | null },
  nivel: 1 | 2 | 3 | 4,
): Promise<Buffer> {
  const doc = crearDocumento({
    documento: "INFORME TÉCNICO",
    codigo: inf.numero,
    fecha: inf.created_at ?? new Date(),
    nivel,
  });

  const chunks: Buffer[] = [];
  const finished: Promise<Buffer> = new Promise((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  renderInformeTecnico(doc, inf, nivel);
  doc.end();
  return finished;
}

router.post("/:id/enviar-email", enviarEmailLimiter, requirePermission("expedientes", "write"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const parsed = enviarEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { to, cc, asunto, mensaje, nivel: nivelPedido } = parsed.data;

  const inf = await prisma.informes_tecnicos.findUnique({
    where: { id },
    include: {
      expedientes: { include: { clientes: { select: { razon_social: true } } } },
      visitas_tecnicas: true,
    },
  });
  if (!inf) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const { nivel } = resolverNivel(nivelPedido, req.user!.rol_nombre, req.user!.es_super_admin);
  const buffer = await generarPdfBuffer(
    inf as unknown as DataInformeTecnico & { created_at?: Date | null },
    nivel,
  );

  const cliente = inf.expedientes.clientes?.razon_social ?? "—";
  const subject = asunto?.trim() || `[TECHTRAFO] Informe técnico ${inf.numero}`;
  const cuerpoTexto = (mensaje?.trim() || `Adjuntamos el informe técnico ${inf.numero} para el expediente ${inf.expedientes.codigo} (${cliente}).\n\nSaludos cordiales,\nEquipo técnico TECHTRAFO`);
  const cuerpoHtml = `<p>${escapeHtmlMultiline(cuerpoTexto)}</p>`;

  try {
    const result = await sendEmail({
      to,
      cc: cc ?? undefined,
      subject,
      text: cuerpoTexto,
      html: cuerpoHtml,
      attachments: [{
        filename: `${inf.numero}.pdf`,
        content: buffer,
        contentType: "application/pdf",
      }],
    });
    res.json({
      status: result.dryRun ? "dry_run" : "enviado",
      message_id: result.messageId ?? null,
      destinatario: to,
      adjunto_kb: Math.round(buffer.length / 1024),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: "smtp_error", message: msg.slice(0, 500) });
  }
});

export default router;
