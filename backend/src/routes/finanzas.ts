/**
 * Modulo Finanzas (solo lectura). Reportes para financiero/presidencia/
 * gerencia_general/gerencia_comercial:
 *  - GET /api/finanzas/resumen?desde=&hasta=  -> KPIs + desgloses para el dashboard
 *  - GET /api/finanzas/cartera-vencida        -> detalle de pagos vencidos (aging)
 *  - GET /api/finanzas/cobros?desde=&hasta=   -> detalle de cobros registrados
 *
 * El dinero vive en comercial.contratos (monto_total) + comercial.contrato_pagos
 * (monto_estipulado/monto_pagado/estado). El tipo de servicio se obtiene de la
 * cotizacion del contrato (contratos.cotizacion_id -> cotizaciones.tipo_servicio).
 */
import { Router } from "express";
import { prisma } from "../db/client";
import { requireAuth, requirePermission } from "../auth/middleware";

const router = Router();
router.use(requireAuth);
const requireFinanzas = requirePermission("finanzas", "read");

/** Resuelve el rango [desde,hasta] (YYYY-MM-DD). Default: año en curso. */
function rango(req: { query: Record<string, unknown> }): { desde: string; hasta: string } {
  const hoy = new Date();
  const hasta = (req.query.hasta as string) || hoy.toISOString().slice(0, 10);
  const desde = (req.query.desde as string) || `${hoy.getFullYear()}-01-01`;
  return { desde, hasta };
}

// ===================================================================
// GET /api/finanzas/resumen
// ===================================================================
router.get("/resumen", requireFinanzas, async (req, res) => {
  const { desde, hasta } = rango(req);

  const [
    totalesP, contratadoR, porTipoContratado, porTipoPagos,
    aging, tendencia, porEstado, cotizadoR,
  ] = await Promise.all([
    // Totales sobre pagos (cobrado en rango, por_cobrar y cartera vencida = estado actual)
    prisma.$queryRaw<{ cobrado: number; por_cobrar: number; cartera_vencida: number; anticipos_cobrados: number }[]>`
      SELECT
        COALESCE(SUM(CASE WHEN cp.fecha_pagado BETWEEN ${desde}::date AND ${hasta}::date THEN cp.monto_pagado ELSE 0 END),0)::FLOAT AS cobrado,
        COALESCE(SUM(CASE WHEN cp.estado <> 'cancelado' THEN (cp.monto_estipulado - cp.monto_pagado) ELSE 0 END),0)::FLOAT AS por_cobrar,
        COALESCE(SUM(CASE WHEN cp.estado IN ('pendiente','parcial') AND cp.fecha_esperada < CURRENT_DATE THEN (cp.monto_estipulado - cp.monto_pagado) ELSE 0 END),0)::FLOAT AS cartera_vencida,
        COALESCE(SUM(CASE WHEN cp.tipo = 'anticipo' AND cp.fecha_pagado BETWEEN ${desde}::date AND ${hasta}::date THEN cp.monto_pagado ELSE 0 END),0)::FLOAT AS anticipos_cobrados
      FROM comercial.contrato_pagos cp
      JOIN comercial.contratos c ON c.id = cp.contrato_id
      WHERE c.estado <> 'cancelado'
    `,
    // Contratado en rango (por fecha de firma)
    prisma.$queryRaw<{ contratado: number }[]>`
      SELECT COALESCE(SUM(monto_total),0)::FLOAT AS contratado
      FROM comercial.contratos
      WHERE estado <> 'cancelado' AND fecha_firma BETWEEN ${desde}::date AND ${hasta}::date
    `,
    // Contratado acumulado por tipo (estado actual de la cartera)
    prisma.$queryRaw<{ tipo_servicio: string; contratado: number }[]>`
      SELECT cot.tipo_servicio AS tipo_servicio, COALESCE(SUM(c.monto_total),0)::FLOAT AS contratado
      FROM comercial.contratos c
      JOIN comercial.cotizaciones cot ON cot.id = c.cotizacion_id
      WHERE c.estado <> 'cancelado'
      GROUP BY cot.tipo_servicio
    `,
    // Cobrado + por cobrar por tipo (acumulado)
    prisma.$queryRaw<{ tipo_servicio: string; cobrado: number; por_cobrar: number }[]>`
      SELECT cot.tipo_servicio AS tipo_servicio,
             COALESCE(SUM(cp.monto_pagado),0)::FLOAT AS cobrado,
             COALESCE(SUM(CASE WHEN cp.estado <> 'cancelado' THEN (cp.monto_estipulado - cp.monto_pagado) ELSE 0 END),0)::FLOAT AS por_cobrar
      FROM comercial.contrato_pagos cp
      JOIN comercial.contratos c ON c.id = cp.contrato_id
      JOIN comercial.cotizaciones cot ON cot.id = c.cotizacion_id
      WHERE c.estado <> 'cancelado'
      GROUP BY cot.tipo_servicio
    `,
    // Cartera vencida por aging
    prisma.$queryRaw<{ rango: string; cantidad: number; monto: number }[]>`
      SELECT
        CASE
          WHEN (CURRENT_DATE - cp.fecha_esperada) <= 30 THEN '0-30'
          WHEN (CURRENT_DATE - cp.fecha_esperada) <= 60 THEN '31-60'
          WHEN (CURRENT_DATE - cp.fecha_esperada) <= 90 THEN '61-90'
          ELSE '90+'
        END AS rango,
        COUNT(*)::INT AS cantidad,
        COALESCE(SUM(cp.monto_estipulado - cp.monto_pagado),0)::FLOAT AS monto
      FROM comercial.contrato_pagos cp
      JOIN comercial.contratos c ON c.id = cp.contrato_id
      WHERE c.estado <> 'cancelado' AND cp.estado IN ('pendiente','parcial') AND cp.fecha_esperada < CURRENT_DATE
      GROUP BY rango
    `,
    // Tendencia de cobros (12 meses)
    prisma.$queryRaw<{ mes: string; monto: number }[]>`
      SELECT to_char(date_trunc('month', cp.fecha_pagado), 'YYYY-MM') AS mes,
             COALESCE(SUM(cp.monto_pagado),0)::FLOAT AS monto
      FROM comercial.contrato_pagos cp
      WHERE cp.fecha_pagado >= (date_trunc('month', CURRENT_DATE) - INTERVAL '11 months')
      GROUP BY 1 ORDER BY 1
    `,
    // Pagos por estado
    prisma.$queryRaw<{ estado: string; cantidad: number; monto: number }[]>`
      SELECT cp.estado AS estado, COUNT(*)::INT AS cantidad, COALESCE(SUM(cp.monto_estipulado),0)::FLOAT AS monto
      FROM comercial.contrato_pagos cp
      JOIN comercial.contratos c ON c.id = cp.contrato_id
      WHERE c.estado <> 'cancelado'
      GROUP BY cp.estado
    `,
    // Cotizado aprobado en rango (para pagos vs cotizaciones)
    prisma.$queryRaw<{ cotizado_aprobado: number }[]>`
      SELECT COALESCE(SUM(total),0)::FLOAT AS cotizado_aprobado
      FROM comercial.cotizaciones
      WHERE estado IN ('aprobada','convertida') AND fecha_emision BETWEEN ${desde}::date AND ${hasta}::date
    `,
  ]);

  const t = totalesP[0] ?? { cobrado: 0, por_cobrar: 0, cartera_vencida: 0, anticipos_cobrados: 0 };
  const contratado = contratadoR[0]?.contratado ?? 0;
  const cotizado_aprobado = cotizadoR[0]?.cotizado_aprobado ?? 0;

  // Merge por_tipo (contratado + cobrado/por_cobrar) por tipo_servicio
  const tipos = new Map<string, { tipo_servicio: string; contratado: number; cobrado: number; por_cobrar: number }>();
  for (const r of porTipoContratado) tipos.set(r.tipo_servicio, { tipo_servicio: r.tipo_servicio, contratado: r.contratado, cobrado: 0, por_cobrar: 0 });
  for (const r of porTipoPagos) {
    const e = tipos.get(r.tipo_servicio) ?? { tipo_servicio: r.tipo_servicio, contratado: 0, cobrado: 0, por_cobrar: 0 };
    e.cobrado = r.cobrado; e.por_cobrar = r.por_cobrar;
    tipos.set(r.tipo_servicio, e);
  }

  res.json({
    data: {
      periodo: { desde, hasta },
      totales: {
        contratado,
        cobrado: t.cobrado,
        por_cobrar: t.por_cobrar,
        cartera_vencida: t.cartera_vencida,
        anticipos_cobrados: t.anticipos_cobrados,
      },
      por_tipo: Array.from(tipos.values()).sort((a, b) => b.contratado - a.contratado),
      cartera_aging: aging,
      tendencia_cobros: tendencia,
      por_estado_pago: porEstado,
      pagos_vs_cotizaciones: { cotizado_aprobado, contratado, cobrado: t.cobrado },
    },
  });
});

// ===================================================================
// GET /api/finanzas/cartera-vencida
// ===================================================================
router.get("/cartera-vencida", requireFinanzas, async (_req, res) => {
  const rows = await prisma.$queryRaw<Array<{
    contrato_id: string; contrato_codigo: string | null; cliente: string | null; tipo_servicio: string;
    pago_numero: number; descripcion: string | null; fecha_esperada: string | null; dias_vencido: number; monto_pendiente: number;
  }>>`
    SELECT
      c.id::TEXT                       AS contrato_id,
      c.codigo                         AS contrato_codigo,
      cl.razon_social                  AS cliente,
      cot.tipo_servicio                AS tipo_servicio,
      cp.numero::INT                   AS pago_numero,
      cp.descripcion                   AS descripcion,
      cp.fecha_esperada::TEXT          AS fecha_esperada,
      (CURRENT_DATE - cp.fecha_esperada)::INT AS dias_vencido,
      (cp.monto_estipulado - cp.monto_pagado)::FLOAT AS monto_pendiente
    FROM comercial.contrato_pagos cp
    JOIN comercial.contratos c    ON c.id = cp.contrato_id
    JOIN comercial.clientes cl    ON cl.id = c.cliente_id
    JOIN comercial.cotizaciones cot ON cot.id = c.cotizacion_id
    WHERE c.estado <> 'cancelado' AND cp.estado IN ('pendiente','parcial') AND cp.fecha_esperada < CURRENT_DATE
    ORDER BY dias_vencido DESC
    LIMIT 300
  `;
  res.json({ data: rows.map((r) => ({ ...r, contrato_id: Number(r.contrato_id) })) });
});

// ===================================================================
// GET /api/finanzas/cobros?desde=&hasta=
// ===================================================================
router.get("/cobros", requireFinanzas, async (req, res) => {
  const { desde, hasta } = rango(req);
  const rows = await prisma.$queryRaw<Array<{
    contrato_id: string; fecha_pagado: string | null; contrato_codigo: string | null; cliente: string | null;
    tipo_pago: string; monto_pagado: number; referencia: string | null; tipo_servicio: string;
  }>>`
    SELECT
      c.id::TEXT              AS contrato_id,
      cp.fecha_pagado::TEXT   AS fecha_pagado,
      c.codigo                AS contrato_codigo,
      cl.razon_social         AS cliente,
      cp.tipo                 AS tipo_pago,
      cp.monto_pagado::FLOAT  AS monto_pagado,
      cp.referencia_pago      AS referencia,
      cot.tipo_servicio       AS tipo_servicio
    FROM comercial.contrato_pagos cp
    JOIN comercial.contratos c    ON c.id = cp.contrato_id
    JOIN comercial.clientes cl    ON cl.id = c.cliente_id
    JOIN comercial.cotizaciones cot ON cot.id = c.cotizacion_id
    WHERE cp.monto_pagado > 0 AND cp.fecha_pagado IS NOT NULL
      AND cp.fecha_pagado BETWEEN ${desde}::date AND ${hasta}::date
    ORDER BY cp.fecha_pagado DESC
    LIMIT 500
  `;
  res.json({ data: rows.map((r) => ({ ...r, contrato_id: Number(r.contrato_id) })) });
});

export default router;
