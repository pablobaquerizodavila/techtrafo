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

// ===================================================================
// GET /api/dashboard/procesos-en-riesgo
//   Etapas (hitos) en curso cuyo tiempo transcurrido alcanzó >= 80% de
//   su SLA y siguen sin resolver. Una fila por etapa, orden desc por %.
//   El frontend colorea: 80-89 amarillo, 90-99 naranja, 100+ rojo.
// ===================================================================
interface ProcesoRiesgoRow {
  expediente_id: string;
  expediente_codigo: string;
  cliente_nombre: string | null;
  hito_id: string;
  hito_codigo: string;
  hito_nombre: string;
  sla_horas: number;
  horas_transcurridas: number;
  porcentaje: number;
}

router.get("/procesos-en-riesgo", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const rows = await prisma.$queryRaw<ProcesoRiesgoRow[]>`
    SELECT
      eh.expediente_id::TEXT       AS expediente_id,
      e.codigo                     AS expediente_codigo,
      c.razon_social               AS cliente_nombre,
      eh.id::TEXT                  AS hito_id,
      eh.codigo                    AS hito_codigo,
      eh.nombre                    AS hito_nombre,
      eh.sla_horas::INT            AS sla_horas,
      (EXTRACT(EPOCH FROM (NOW() - eh.fecha_inicio)) / 3600.0)::FLOAT                 AS horas_transcurridas,
      (EXTRACT(EPOCH FROM (NOW() - eh.fecha_inicio)) / 3600.0 / eh.sla_horas * 100)::FLOAT AS porcentaje
    FROM comercial.expediente_hitos eh
    JOIN comercial.expedientes e ON e.id = eh.expediente_id
    JOIN comercial.clientes c    ON c.id = e.cliente_id
    WHERE eh.estado = 'en_curso'
      AND eh.sla_horas IS NOT NULL AND eh.sla_horas > 0
      AND eh.fecha_inicio IS NOT NULL
      AND e.estado = 'activo'
      AND (EXTRACT(EPOCH FROM (NOW() - eh.fecha_inicio)) / 3600.0 / eh.sla_horas) >= 0.80
    ORDER BY porcentaje DESC
    LIMIT ${limit}
  `;

  res.json({
    data: rows.map((r) => ({
      expediente_id: Number(r.expediente_id),
      expediente_codigo: r.expediente_codigo,
      cliente_nombre: r.cliente_nombre,
      hito_id: Number(r.hito_id),
      hito_codigo: r.hito_codigo,
      hito_nombre: r.hito_nombre,
      sla_horas: r.sla_horas,
      horas_transcurridas: Math.round(r.horas_transcurridas * 10) / 10,
      porcentaje: Math.round(r.porcentaje),
    })),
  });
});

export default router;
