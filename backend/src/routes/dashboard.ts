/**
 * Endpoints transversales del dashboard de inicio.
 *
 * GET /api/dashboard/actividad-reciente
 *   Devuelve un feed unificado de las últimas N actividades del sistema:
 *   cotizaciones emitidas, recepciones confirmadas, OTs creadas,
 *   solicitudes de compra enviadas, clientes nuevos.
 *   Útil como "pulso" de lo que está pasando en la empresa.
 */
import { Router } from "express";
import { prisma } from "../db/client";
import { requireAuth } from "../auth/middleware";

const router = Router();
router.use(requireAuth);

type TipoActividad = "cotizacion" | "recepcion" | "ot" | "solicitud_compra" | "cliente_nuevo";

interface ActividadRow {
  tipo: TipoActividad;
  ref_id: string; // BigInt serialized
  codigo: string | null;
  label: string;        // título principal a mostrar (ej. "COT-2026-0001")
  contexto: string | null; // contexto (ej. "PETROECUADOR EP")
  monto: string | null;    // numérico opcional (Decimal serialized)
  moneda: string | null;
  fecha: Date;
}

router.get("/actividad-reciente", async (_req, res) => {
  const rows = await prisma.$queryRaw<ActividadRow[]>`
    (
      SELECT
        'cotizacion'::TEXT AS tipo,
        c.id::TEXT AS ref_id,
        c.codigo,
        c.codigo AS label,
        cl.razon_social AS contexto,
        c.total::TEXT AS monto,
        c.moneda,
        c.created_at AS fecha
      FROM comercial.cotizaciones c
      LEFT JOIN comercial.clientes cl ON cl.id = c.cliente_id
      WHERE c.estado <> 'borrador'
      ORDER BY c.created_at DESC
      LIMIT 5
    )
    UNION ALL
    (
      SELECT
        'recepcion'::TEXT,
        r.id::TEXT,
        r.codigo,
        r.codigo,
        p.razon_social,
        oc.total::TEXT,
        oc.moneda,
        r.fecha_recepcion
      FROM compras.recepciones r
      JOIN compras.ordenes_compra oc ON oc.id = r.orden_compra_id
      JOIN compras.proveedores p ON p.id = oc.proveedor_id
      WHERE r.estado = 'confirmada'
      ORDER BY r.fecha_recepcion DESC
      LIMIT 5
    )
    UNION ALL
    (
      SELECT
        'ot'::TEXT,
        o.id::TEXT,
        o.codigo,
        o.codigo,
        cl.razon_social,
        NULL,
        NULL,
        o.created_at
      FROM produccion.ot o
      JOIN comercial.contratos co ON co.id = o.contrato_id
      JOIN comercial.clientes cl ON cl.id = co.cliente_id
      ORDER BY o.created_at DESC
      LIMIT 5
    )
    UNION ALL
    (
      SELECT
        'solicitud_compra'::TEXT,
        s.id::TEXT,
        s.codigo,
        s.codigo,
        s.departamento_solicitante,
        s.total_estimado::TEXT,
        s.moneda,
        s.created_at
      FROM compras.solicitudes s
      WHERE s.estado IN ('enviada','aprobada','convertida_en_oc')
      ORDER BY s.created_at DESC
      LIMIT 5
    )
    UNION ALL
    (
      SELECT
        'cliente_nuevo'::TEXT,
        cl.id::TEXT,
        NULL,
        cl.razon_social,
        cl.ciudad,
        NULL,
        NULL,
        cl.created_at
      FROM comercial.clientes cl
      WHERE cl.estado = 'activo'
      ORDER BY cl.created_at DESC
      LIMIT 5
    )
    ORDER BY fecha DESC
    LIMIT 12
  `;

  res.json({
    data: rows.map((r) => ({
      tipo: r.tipo,
      ref_id: r.ref_id,
      codigo: r.codigo,
      label: r.label,
      contexto: r.contexto,
      monto: r.monto !== null && r.monto !== undefined ? Number(r.monto) : null,
      moneda: r.moneda ?? "USD",
      fecha: r.fecha,
    })),
  });
});

export default router;
