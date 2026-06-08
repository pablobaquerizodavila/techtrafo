/**
 * Portal de proveedor — acceso limitado a sus propias OCs.
 *
 * Middleware requireProveedorId: solo usuarios con proveedor_id != null.
 * Todos los endpoints verifican que la OC pertenece al proveedor del usuario.
 *
 * GET  /mis-ocs               Lista OCs del proveedor
 * GET  /oc/:id                Detalle de OC propia
 * POST /oc/:id/acusar-recibo  Stampa acuse_recibo_at (idempotente)
 * POST /oc/:id/factura        Guarda numero + url de factura
 */
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../db/client";
import { withAppUser } from "../db/withAppUser";
import { requireAuth } from "../auth/middleware";

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

// GET /api/proveedor-portal/mis-ocs
router.get("/mis-ocs", requireProveedorId, async (req, res) => {
  const proveedorId = BigInt(req.user!.proveedor_id!);
  const ocs = await prisma.ordenes_compra.findMany({
    where: { proveedor_id: proveedorId },
    orderBy: { created_at: "desc" },
    select: {
      id: true, codigo: true, estado: true,
      fecha_emision: true, fecha_entrega_acordada: true,
      total: true, moneda: true,
      acuse_recibo_at: true, factura_proveedor_numero: true, factura_proveedor_url: true,
      _count: { select: { orden_compra_lineas: true } },
    },
  });
  res.json({ data: ser(ocs) });
});

// GET /api/proveedor-portal/oc/:id
router.get("/oc/:id", requireProveedorId, async (req, res) => {
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
});

// POST /api/proveedor-portal/oc/:id/acusar-recibo
router.post("/oc/:id/acusar-recibo", requireProveedorId, async (req, res) => {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const id = BigInt(idNum);
  const proveedorId = BigInt(req.user!.proveedor_id!);
  const userId = req.user!.id;
  const updated = await withAppUser(userId, async (tx) => {
    const oc = await tx.ordenes_compra.findFirst({ where: { id, proveedor_id: proveedorId } });
    if (!oc) throw new Error("oc_no_encontrada");
    if (oc.acuse_recibo_at) return oc; // idempotente
    return tx.ordenes_compra.update({ where: { id }, data: { acuse_recibo_at: new Date() } });
  });
  res.json({ data: ser(updated) });
});

// POST /api/proveedor-portal/oc/:id/factura
router.post("/oc/:id/factura", requireProveedorId, async (req, res) => {
  const idNum = Number(req.params.id);
  if (!Number.isInteger(idNum) || idNum <= 0) { res.status(400).json({ error: "invalid_id" }); return; }
  const id = BigInt(idNum);
  const proveedorId = BigInt(req.user!.proveedor_id!);
  const userId = req.user!.id;
  const parsed = z.object({ numero: z.string().max(80).nonempty(), url: z.string().max(2000).nonempty() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten().fieldErrors }); return; }
  const updated = await withAppUser(userId, async (tx) => {
    const oc = await tx.ordenes_compra.findFirst({ where: { id, proveedor_id: proveedorId } });
    if (!oc) throw new Error("oc_no_encontrada");
    return tx.ordenes_compra.update({
      where: { id },
      data: { factura_proveedor_numero: parsed.data.numero, factura_proveedor_url: parsed.data.url },
    });
  });
  res.json({ data: ser(updated) });
});

export default router;
