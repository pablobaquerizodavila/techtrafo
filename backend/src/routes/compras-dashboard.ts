/**
 * Endpoints transversales del modulo de Compras:
 *  - GET  /api/compras-dashboard/kpis          -> totales y conteos
 *  - GET  /api/compras-dashboard/alertas-stock -> items bajo punto_reorden
 *  - POST /api/compras-dashboard/alertas-stock/generar-sc
 *      Body: { item_ids: number[] }  -> crea SC borrador con esos items
 *  - GET  /api/compras-dashboard/precios-historial/:itemId -> historial de precios del item
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client";
import { withAppUser } from "../db/withAppUser";
import { requireAuth, requirePermission } from "../auth/middleware";

const router = Router();
router.use(requireAuth);

interface AlertaStockRow {
  item_id: bigint;
  codigo_interno: string;
  nombre: string;
  unidad_medida: string;
  stock_minimo: string;
  stock_maximo: string;
  punto_reorden: string;
  costo_referencia: string;
  stock_total: string;
  nivel_alerta: string;
  cantidad_sugerida_reposicion: string;
  proveedor_principal_id: bigint | null;
}

// -------------------------------------------------------------------
// GET /api/compras-dashboard/kpis
// -------------------------------------------------------------------
router.get("/kpis", requirePermission("compras", "read"), async (_req, res) => {
  const [
    scTotal, scPendientes, ocAbiertas, ocRetrasadas,
    recPendientes, proveedoresActivos, alertasStockCount,
    totalMes,
  ] = await Promise.all([
    prisma.solicitudes.count(),
    prisma.solicitudes.count({ where: { estado: { in: ["enviada", "aprobada"] } } }),
    prisma.ordenes_compra.count({
      where: { estado: { in: ["aprobada", "enviada", "confirmada", "recibida_parcial"] } },
    }),
    prisma.ordenes_compra.count({
      where: {
        estado: { in: ["enviada", "confirmada", "recibida_parcial"] },
        fecha_entrega_acordada: { lt: new Date() },
      },
    }),
    prisma.recepciones.count({ where: { estado: "borrador" } }),
    prisma.proveedores.count({ where: { estado: "activo" } }),
    prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::BIGINT FROM compras.v_items_bajo_reorden`,
    prisma.$queryRaw<{ total: number | null }[]>`
      SELECT COALESCE(SUM(total),0)::FLOAT AS total
        FROM compras.ordenes_compra
       WHERE estado NOT IN ('cancelada','rechazada','borrador')
         AND fecha_emision >= DATE_TRUNC('month', CURRENT_DATE)`,
  ]);

  res.json({
    data: {
      solicitudes_total: scTotal,
      solicitudes_pendientes_aprobacion: scPendientes,
      ocs_abiertas: ocAbiertas,
      ocs_retrasadas: ocRetrasadas,
      recepciones_pendientes: recPendientes,
      proveedores_activos: proveedoresActivos,
      alertas_stock: Number(alertasStockCount[0]?.count ?? 0),
      total_comprado_mes: Number(totalMes[0]?.total ?? 0),
    },
  });
});

// -------------------------------------------------------------------
// GET /api/compras-dashboard/alertas-stock
// -------------------------------------------------------------------
router.get("/alertas-stock", requirePermission("compras", "read"), async (_req, res) => {
  const rows = await prisma.$queryRaw<AlertaStockRow[]>`
    SELECT
      v.item_id, v.codigo_interno, v.nombre, v.unidad_medida,
      v.stock_minimo::TEXT, v.stock_maximo::TEXT, v.punto_reorden::TEXT,
      v.costo_referencia::TEXT, v.stock_total::TEXT, v.nivel_alerta,
      v.cantidad_sugerida_reposicion::TEXT, v.proveedor_principal_id
    FROM compras.v_items_bajo_reorden v
    ORDER BY CASE v.nivel_alerta
      WHEN 'sin_stock' THEN 1
      WHEN 'bajo_minimo' THEN 2
      ELSE 3 END,
      v.nombre ASC`;
  const data = rows.map((r) => ({
    ...r,
    stock_minimo: Number(r.stock_minimo),
    stock_maximo: Number(r.stock_maximo),
    punto_reorden: Number(r.punto_reorden),
    costo_referencia: Number(r.costo_referencia),
    stock_total: Number(r.stock_total),
    cantidad_sugerida_reposicion: Number(r.cantidad_sugerida_reposicion),
  }));
  res.json({ data });
});

// -------------------------------------------------------------------
// POST /api/compras-dashboard/alertas-stock/generar-sc
// Body: { item_ids: number[], departamento_solicitante?: string }
// -------------------------------------------------------------------
router.post("/alertas-stock/generar-sc", requirePermission("compras", "write"), async (req, res) => {
  const body = z.object({
    item_ids: z.array(z.number().int().positive()).min(1),
    departamento_solicitante: z.string().optional(),
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid_payload", details: body.error.flatten().fieldErrors });
    return;
  }
  const { item_ids: itemIds } = body.data;
  const dept = body.data.departamento_solicitante ?? "bodega";
  const userId = req.user!.id;

  const sc = await withAppUser(userId, async (tx) => {
    // Traer datos de cada item
    const items = await tx.items.findMany({
      where: { id: { in: itemIds.map((n) => BigInt(n)) }, estado: "activo" },
      select: {
        id: true, codigo_interno: true, nombre: true, unidad_medida: true,
        costo_referencia: true, stock_maximo: true,
      },
    });
    if (items.length === 0) throw new Error("items_no_encontrados");

    // Calcular stock_total por item
    const stocks = await tx.$queryRaw<{ item_id: bigint; stock_total: string }[]>`
      SELECT item_id, COALESCE(SUM(cantidad),0)::TEXT AS stock_total
        FROM inventario.stock
       WHERE item_id = ANY(${items.map((i) => i.id)})
       GROUP BY item_id`;
    const stockByItem = new Map(stocks.map((s) => [s.item_id.toString(), Number(s.stock_total)]));

    const lineas = items.map((it, i) => {
      const stockActual = stockByItem.get(it.id.toString()) ?? 0;
      const sugerida = Math.max(Number(it.stock_maximo) - stockActual, 1);
      return {
        orden: i + 1,
        item_id: it.id,
        descripcion: `${it.codigo_interno} — ${it.nombre}`,
        unidad_medida: it.unidad_medida,
        cantidad_solicitada: sugerida,
        precio_referencial: Number(it.costo_referencia),
        moneda: "USD",
      };
    });

    const total = lineas.reduce((acc, l) => acc + Number(l.cantidad_solicitada) * Number(l.precio_referencial), 0);

    return tx.solicitudes.create({
      data: {
        codigo: "",
        departamento_solicitante: dept,
        solicitante_id: userId,
        prioridad: "alta",
        justificacion: "Reposicion automatica sugerida — stock por debajo de punto de reorden",
        estado: "borrador",
        origen: "stock_minimo",
        total_estimado: total,
        moneda: "USD",
        creado_por: userId,
        actualizado_por: userId,
        solicitud_lineas: { create: lineas },
      },
      include: { solicitud_lineas: { orderBy: { orden: "asc" } } },
    });
  });

  res.status(201).json({ data: sc });
});

// -------------------------------------------------------------------
// GET /api/compras-dashboard/precios-historial/:itemId
// -------------------------------------------------------------------
router.get("/precios-historial/:itemId", requirePermission("compras", "read"), async (req, res) => {
  const itemId = Number(req.params.itemId);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    res.status(400).json({ error: "invalid_id" });
    return;
  }
  const data = await prisma.item_proveedor_precios_historial.findMany({
    where: { item_id: BigInt(itemId) },
    orderBy: { fecha: "desc" },
    include: {
      proveedores: { select: { id: true, codigo: true, razon_social: true } },
      ordenes_compra: { select: { id: true, codigo: true } },
      recepciones: { select: { id: true, codigo: true } },
    },
    take: 100,
  });
  res.json({ data });
});

export default router;
