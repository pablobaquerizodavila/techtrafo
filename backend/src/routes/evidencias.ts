/**
 * Evidencias de OT (Dashboard E).
 *
 * Endpoints para subir, listar, descargar y eliminar fotos/PDFs/etc
 * asociados a una OT (opcionalmente a un paso especifico).
 *
 * Storage: filesystem local en env.UPLOAD_DIR (montado via docker-compose).
 * Estructura: /uploads/evidencias/{ot_id}/{paso_id|none}-{uuid}.{ext}
 *
 * Migrable a MinIO mas adelante reemplazando solo este archivo.
 */
import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "../db/client";
import { withAppUser } from "../db/withAppUser";
import { requireAuth, requirePermission } from "../auth/middleware";
import { env } from "../config/env";

const router = Router();
router.use(requireAuth);

const tipoEnum = z.enum(["foto", "pdf", "medicion", "video", "certificado", "otro"]);

// -------------------------------------------------------------------
// multer: storage en disk con nombre canonico
// -------------------------------------------------------------------
const baseDir = path.join(env.UPLOAD_DIR, "evidencias");
// Asegurar que el dir existe
try { fs.mkdirSync(baseDir, { recursive: true }); } catch { /* ignore */ }

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const otId = req.params.id;
    const dir = path.join(baseDir, otId);
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
    const safe = randomUUID() + (ext || "");
    cb(null, safe);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: env.UPLOAD_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const okMimes = [
      "image/jpeg", "image/png", "image/webp", "image/gif",
      "application/pdf",
      "video/mp4", "video/webm",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/plain", "text/csv",
    ];
    if (!okMimes.includes(file.mimetype)) {
      cb(new Error(`mime_no_permitido:${file.mimetype}`));
      return;
    }
    cb(null, true);
  },
});

function inferirTipo(mime: string): "foto" | "pdf" | "video" | "otro" {
  if (mime.startsWith("image/")) return "foto";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("video/")) return "video";
  return "otro";
}

// -------------------------------------------------------------------
// POST /api/ot/:id/evidencias  -  subir archivo
// -------------------------------------------------------------------
router.post(
  "/:id/evidencias",
  requirePermission("ot", "write"),
  (req: Request, res: Response, next: NextFunction) => {
    upload.single("file")(req, res, (err: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.startsWith("mime_no_permitido:")) {
          res.status(400).json({ error: "tipo_no_permitido", mime: msg.split(":")[1] });
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
    const otId = Number(req.params.id);
    if (!Number.isInteger(otId) || otId <= 0) {
      res.status(400).json({ error: "invalid_id" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "file_required" });
      return;
    }
    const userId = req.user!.id;
    const titulo = typeof req.body?.titulo === "string" ? req.body.titulo.slice(0, 200) : req.file.originalname.slice(0, 200);
    const descripcion = typeof req.body?.descripcion === "string" ? req.body.descripcion : null;
    const pasoIdRaw = req.body?.paso_id;
    const pasoId = pasoIdRaw ? Number(pasoIdRaw) : null;
    const tipoRaw = typeof req.body?.tipo === "string" ? req.body.tipo : null;
    const tipoParsed = tipoRaw && tipoEnum.safeParse(tipoRaw).success ? (tipoRaw as z.infer<typeof tipoEnum>) : null;
    const tipo = tipoParsed ?? inferirTipo(req.file.mimetype);

    // Validar OT existe
    const ot = await prisma.ot.findUnique({ where: { id: otId }, select: { id: true } });
    if (!ot) {
      try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
      res.status(404).json({ error: "ot_no_encontrada" });
      return;
    }
    // Validar paso pertenece a la OT (si vino)
    if (pasoId) {
      const paso = await prisma.ot_pasos.findUnique({ where: { id: pasoId }, select: { ot_id: true } });
      if (!paso || Number(paso.ot_id) !== otId) {
        try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
        res.status(400).json({ error: "paso_no_pertenece_a_ot" });
        return;
      }
    }

    // Guardamos solo la ruta RELATIVA al UPLOAD_DIR (portable a MinIO)
    const rutaRelativa = path.relative(env.UPLOAD_DIR, req.file.path).replace(/\\/g, "/");

    const ev = await withAppUser(userId, (tx) =>
      tx.ot_evidencias.create({
        data: {
          ot_id: otId,
          paso_id: pasoId,
          tipo,
          titulo,
          descripcion,
          ruta_archivo: rutaRelativa,
          mime_type: req.file!.mimetype,
          tamanio_bytes: req.file!.size,
          creado_por: userId,
        },
      }),
    );

    res.status(201).json({ data: ev });
  },
);

// -------------------------------------------------------------------
// GET /api/ot/:id/evidencias  -  listar
// -------------------------------------------------------------------
router.get("/:id/evidencias", requirePermission("ot", "read"), async (req, res) => {
  const otId = Number(req.params.id);
  if (!Number.isInteger(otId) || otId <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const data = await prisma.ot_evidencias.findMany({
    where: { ot_id: otId },
    orderBy: { created_at: "desc" },
    include: {
      usuarios: { select: { id: true, nombres: true, apellidos: true } },
      ot_pasos: { select: { id: true, numero: true, nombre: true } },
    },
  });
  res.json({ data });
});

// -------------------------------------------------------------------
// GET /api/ot/:id/evidencias/:evId/file  -  descargar (stream)
// -------------------------------------------------------------------
router.get("/:id/evidencias/:evId/file", requirePermission("ot", "read"), async (req, res) => {
  const otId = Number(req.params.id);
  const evId = Number(req.params.evId);
  if (!Number.isInteger(otId) || !Number.isInteger(evId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const ev = await prisma.ot_evidencias.findUnique({ where: { id: evId } });
  if (!ev || Number(ev.ot_id) !== otId || !ev.ruta_archivo) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const fullPath = path.join(env.UPLOAD_DIR, ev.ruta_archivo);
  // Sanity check para evitar path traversal
  if (!fullPath.startsWith(path.resolve(env.UPLOAD_DIR))) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  if (!fs.existsSync(fullPath)) {
    res.status(410).json({ error: "archivo_eliminado_en_disco" });
    return;
  }
  res.setHeader("Content-Type", ev.mime_type ?? "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${(ev.titulo ?? "archivo").replace(/"/g, "")}"`);
  fs.createReadStream(fullPath).pipe(res);
});

// -------------------------------------------------------------------
// DELETE /api/ot/:id/evidencias/:evId
// -------------------------------------------------------------------
router.delete("/:id/evidencias/:evId", requirePermission("ot", "write"), async (req, res) => {
  const otId = Number(req.params.id);
  const evId = Number(req.params.evId);
  if (!Number.isInteger(otId) || !Number.isInteger(evId)) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const ev = await prisma.ot_evidencias.findUnique({ where: { id: evId } });
  if (!ev || Number(ev.ot_id) !== otId) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  await withAppUser(req.user!.id, (tx) => tx.ot_evidencias.delete({ where: { id: evId } }));
  // Borrar archivo del disco (best-effort)
  if (ev.ruta_archivo) {
    const fullPath = path.join(env.UPLOAD_DIR, ev.ruta_archivo);
    try { fs.unlinkSync(fullPath); } catch { /* ignore */ }
  }
  res.status(204).end();
});

export default router;
