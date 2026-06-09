/**
 * Portal de proveedor — acceso limitado a sus propias OCs.
 *
 * Middleware requireProveedorId: solo usuarios con proveedor_id != null.
 * Todos los endpoints verifican que la OC pertenece al proveedor del usuario.
 *
 * GET  /mis-ocs               Lista OCs del proveedor
 * GET  /oc/:id                Detalle de OC propia
 * POST /oc/:id/acusar-recibo  Stampa acuse_recibo_at (idempotente)
 * POST /oc/:id/factura        Sube archivo de factura (multipart/form-data)
 * GET  /oc/:id/factura/file   Descarga el archivo de factura
 */
import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "../db/client";
import { withAppUser } from "../db/withAppUser";
import { requireAuth } from "../auth/middleware";
import { env } from "../config/env";
import { notificarFacturaProveedorSubida } from "../services/notificaciones";

const router = Router();
router.use(requireAuth);

// Serialize BigInt helper
function ser(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? Number(val) : val)));
}

/** Middleware: solo usuarios con proveedor_id asociado */
function requireProveedorId(req: Request, res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user || user.proveedor_id == null) {
    res.status(403).json({ error: "no_proveedor_asociado", message: "Tu usuario no esta asociado a un proveedor." });
    return;
  }
  next();
}

// -------------------------------------------------------------------
// multer: facturas del proveedor
// -------------------------------------------------------------------
const facturasDir = path.join(env.UPLOAD_DIR, "facturas-proveedor");
try { fs.mkdirSync(facturasDir, { recursive: true }); } catch { /* ignore */ }

const facturaStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, facturasDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
    cb(null, randomUUID() + (ext || ""));
  },
});

const uploadFactura = multer({
  storage: facturaStorage,
  limits: { fileSize: env.UPLOAD_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error(`tipo_archivo_invalido:${file.mimetype}`));
    }
  },
});

// GET /api/proveedor-portal/mis-ocs
router.get("/mis-ocs", requireProveedorId, async (req, res, next) => {
  try {
    const proveedorId = BigInt(req.user!.proveedor_id!);
    const ocs = await prisma.ordenes_compra.findMany({
      where: { proveedor_id: proveedorId },
      orderBy: { created_at: "desc" },
      select: {
        id: true, codigo: true, estado: true,
        fecha_emision: true, fecha_entrega_acordada: true,
        total: true, moneda: true,
        acuse_recibo_at: true,
        factura_proveedor_numero: true,
        factura_proveedor_url: true,
        factura_proveedor_nombre_original: true,
        _count: { select: { orden_compra_lineas: true } },
      },
    });
    res.json({ data: ser(ocs) });
  } catch (err) {
    next(err);
  }
});

// GET /api/proveedor-portal/oc/:id
router.get("/oc/:id", requireProveedorId, async (req, res, next) => {
  try {
    const idNum = Number(req.params.id);
    if (!Number.isInteger(idNum) || idNum <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
    const id = BigInt(idNum);
    const proveedorId = BigInt(req.user!.proveedor_id!);
    const oc = await prisma.ordenes_compra.findFirst({
      where: { id, proveedor_id: proveedorId },
      include: {
        orden_compra_lineas: {
          include: { items: { select: { codigo_interno: true, descripcion: true, unidad_medida: true } } },
        },
      },
    });
    if (!oc) { res.status(404).json({ error: "oc_no_encontrada" }); return; }
    res.json({ data: ser(oc) });
  } catch (err) {
    next(err);
  }
});

// POST /api/proveedor-portal/oc/:id/acusar-recibo
router.post("/oc/:id/acusar-recibo", requireProveedorId, async (req, res, next) => {
  try {
    const idNum = Number(req.params.id);
    if (!Number.isInteger(idNum) || idNum <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
    const id = BigInt(idNum);
    const proveedorId = BigInt(req.user!.proveedor_id!);
    const userId = req.user!.id;
    const updated = await withAppUser(userId, async (tx) => {
      const oc = await tx.ordenes_compra.findFirst({ where: { id, proveedor_id: proveedorId } });
      if (!oc) throw new Error("oc_no_encontrada");
      if (oc.acuse_recibo_at) return oc;
      return tx.ordenes_compra.update({ where: { id }, data: { acuse_recibo_at: new Date() } });
    });
    res.json({ data: ser(updated) });
  } catch (err: any) {
    if (err?.message === "oc_no_encontrada") {
      res.status(404).json({ error: "oc_no_encontrada" }); return;
    }
    next(err);
  }
});

// POST /api/proveedor-portal/oc/:id/factura
router.post(
  "/oc/:id/factura",
  requireProveedorId,
  (req: Request, res: Response, next: NextFunction) => {
    uploadFactura.single("archivo")(req, res, (err: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.startsWith("tipo_archivo_invalido:")) {
          res.status(400).json({ error: "tipo_archivo_invalido" });
          return;
        }
        if (msg.includes("File too large")) {
          res.status(400).json({ error: "archivo_demasiado_grande", max_bytes: env.UPLOAD_MAX_BYTES });
          return;
        }
        return next(err);
      }
      next();
    });
  },
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const idNum = Number(req.params.id);
      if (!Number.isInteger(idNum) || idNum <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
      if (!req.file) { res.status(400).json({ error: "archivo_requerido" }); return; }
      const numeroRaw = req.body?.numero;
      if (typeof numeroRaw !== "string" || !numeroRaw.trim() || numeroRaw.trim().length > 80) {
        res.status(400).json({ error: "invalid_payload", field: "numero" });
        return;
      }
      const id = BigInt(idNum);
      const proveedorId = BigInt(req.user!.proveedor_id!);
      const userId = req.user!.id;
      const rutaRelativa = path.relative(env.UPLOAD_DIR, req.file.path).replace(/\\/g, "/");
      const updated = await withAppUser(userId, async (tx) => {
        const oc = await tx.ordenes_compra.findFirst({ where: { id, proveedor_id: proveedorId } });
        if (!oc) throw new Error("oc_no_encontrada");
        return tx.ordenes_compra.update({
          where: { id },
          data: {
            factura_proveedor_numero: numeroRaw.trim(),
            factura_proveedor_url: rutaRelativa,
            factura_proveedor_nombre_original: req.file!.originalname.slice(0, 255),
          },
        });
      });
      notificarFacturaProveedorSubida(idNum).catch((e) =>
        console.error("[proveedor-portal] notificarFacturaProveedorSubida error:", e),
      );
      res.json({ data: ser(updated) });
    } catch (err: any) {
      if (err?.message === "oc_no_encontrada") {
        res.status(404).json({ error: "oc_no_encontrada" }); return;
      }
      next(err);
    }
  },
);

// GET /api/proveedor-portal/oc/:id/factura/file
router.get("/oc/:id/factura/file", requireProveedorId, async (req: Request, res: Response) => {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const id = BigInt(idNum);
  const proveedorId = BigInt(req.user!.proveedor_id!);
  const oc = await prisma.ordenes_compra.findFirst({
    where: { id, proveedor_id: proveedorId },
    select: { factura_proveedor_url: true, factura_proveedor_nombre_original: true },
  });
  if (!oc || !oc.factura_proveedor_url) {
    res.status(404).json({ error: "factura_no_disponible" });
    return;
  }
  const uploadRoot = path.resolve(env.UPLOAD_DIR);
  const fullPath = path.resolve(env.UPLOAD_DIR, oc.factura_proveedor_url);
  if (fullPath !== uploadRoot && !fullPath.startsWith(uploadRoot + path.sep)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  if (!fs.existsSync(fullPath)) {
    res.status(410).json({ error: "archivo_eliminado_en_disco" });
    return;
  }
  const ext = path.extname(fullPath).toLowerCase();
  const mime = ext === ".pdf" ? "application/pdf"
    : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
    : ext === ".png" ? "image/png"
    : ext === ".webp" ? "image/webp"
    : "application/octet-stream";
  const safeFilename = (oc.factura_proveedor_nombre_original ?? "factura")
    .replace(/[\r\n"]/g, "").slice(0, 200);
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Disposition", `inline; filename="${safeFilename}"`);
  fs.createReadStream(fullPath).pipe(res);
});

export default router;
