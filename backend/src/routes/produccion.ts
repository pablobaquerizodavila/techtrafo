/**
 * Dashboard de producción (fase A).
 *
 * Endpoint unificado que agrega datos de OT, expedientes, hitos y
 * notificaciones para alimentar el dashboard ejecutivo del jefe de planta.
 *
 * IMPORTANTE: algunas métricas requieren tablas que aún no existen
 * (transformadores, áreas, causas_demora, reprocesos, tiempos_trabajo).
 * Para esas devolvemos `dummy: true` y data de ejemplo. El frontend las
 * etiqueta visualmente para que se sepa qué es real y qué viene en
 * migrations posteriores (012/013).
 */
import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import { requireAuth, requirePermission } from "../auth/middleware";

const router = Router();
router.use(requireAuth);

interface MatrizFila {
  origen: "ot" | "expediente";
  id: number;
  codigo: string | null;
  cliente: string | null;
  tipo: string;
  capacidad_kva: number | null; // dummy hasta migration 012
  prioridad: string | null;
  estado: string;
  fase_actual: string | null;
  avance_pct: number;
  fecha_compromiso: string | null;
  responsable: string | null;
  dias_diff: number | null;
  semaforo: "verde" | "amarillo" | "rojo" | "azul" | "gris";
  capacidad_dummy: boolean;
}

router.get("/dashboard", requirePermission("ot", "read"), async (_req, res) => {
  // -------------------------------------------------------------------
  // Resumen ejecutivo
  // -------------------------------------------------------------------
  const [otPorEstado, expPorEstado, totalOTUrgentes, totalEstancados, totalNotifPendientes] = await Promise.all([
    prisma.ot.groupBy({ by: ["estado"], _count: true }),
    prisma.expedientes.groupBy({ by: ["estado"], _count: true }),
    prisma.ot.count({ where: { prioridad: "urgente", estado: { in: ["planeada", "en_curso", "pausada"] } } }),
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT expediente_id) AS count
      FROM comercial.v_expediente_pipeline
      WHERE estancado = true
    `,
    prisma.notificaciones.count({ where: { enviado: false } }),
  ]);

  const otAtrasadas = await prisma.ot.count({
    where: {
      estado: { in: ["planeada", "en_curso", "pausada"] },
      fecha_fin_planeada: { lt: new Date() },
    },
  });

  // -------------------------------------------------------------------
  // Semáforo de producción: contar fases por color
  //   verde: en_curso dentro del SLA
  //   amarillo: en_curso cerca del SLA (>75% del tiempo, no superado)
  //   rojo: en_curso superando SLA (estancado)
  //   azul: completado
  //   gris: no_iniciado / pendiente
  // -------------------------------------------------------------------
  const semaforoHitos = await prisma.$queryRaw<Array<{ color: string; count: bigint }>>`
    SELECT
      CASE
        WHEN estado = 'completado' THEN 'azul'
        WHEN estado IN ('no_iniciado','bloqueado','omitido') THEN 'gris'
        WHEN estado = 'rechazado' THEN 'rojo'
        WHEN estado = 'en_curso' AND sla_horas IS NOT NULL AND fecha_inicio IS NOT NULL
             AND EXTRACT(EPOCH FROM (NOW() - fecha_inicio))/3600 > sla_horas THEN 'rojo'
        WHEN estado = 'en_curso' AND sla_horas IS NOT NULL AND fecha_inicio IS NOT NULL
             AND EXTRACT(EPOCH FROM (NOW() - fecha_inicio))/3600 > sla_horas * 0.75 THEN 'amarillo'
        WHEN estado = 'en_curso' THEN 'verde'
        ELSE 'gris'
      END AS color,
      COUNT(*) AS count
    FROM comercial.expediente_hitos
    GROUP BY 1
  `;
  const semaforo = { verde: 0, amarillo: 0, rojo: 0, azul: 0, gris: 0 };
  for (const r of semaforoHitos) {
    if (r.color in semaforo) semaforo[r.color as keyof typeof semaforo] = Number(r.count);
  }

  // -------------------------------------------------------------------
  // Matriz comparativa: todas las OT activas + expedientes activos
  // -------------------------------------------------------------------
  const otActivas = await prisma.ot.findMany({
    where: { estado: { in: ["planeada", "en_curso", "pausada"] } },
    orderBy: [{ prioridad: "asc" }, { fecha_fin_planeada: "asc" }],
    take: 100,
    include: {
      contratos: { select: { clientes: { select: { razon_social: true } } } },
      usuarios_ot_responsable_idTousuarios: { select: { nombres: true, apellidos: true } },
      ot_pasos: { select: { estado: true, numero: true, nombre: true } },
      transformadores: { select: { id: true, capacidad_kva: true, tipo: true, marca: true, modelo: true } },
    },
  });

  const expActivos = await prisma.expedientes.findMany({
    where: { estado: "activo" },
    orderBy: { fecha_apertura: "desc" },
    take: 100,
    include: {
      clientes: { select: { razon_social: true } },
      usuarios_expedientes_ejecutivo_idTousuarios: { select: { nombres: true, apellidos: true } },
      expediente_hitos: { select: { estado: true, orden: true, nombre: true } },
    },
  });

  const matriz: MatrizFila[] = [];
  const now = Date.now();

  for (const ot of otActivas) {
    const pasos = ot.ot_pasos ?? [];
    const completos = pasos.filter((p) => p.estado === "completado" || p.estado === "saltado").length;
    const pct = pasos.length ? Math.round((completos / pasos.length) * 100) : 0;
    const fechaCompromiso = ot.fecha_fin_planeada ? new Date(ot.fecha_fin_planeada) : null;
    const diasDiff = fechaCompromiso ? Math.round((fechaCompromiso.getTime() - now) / 86400000) : null;
    let semaforoOT: MatrizFila["semaforo"] = "gris";
    if (ot.estado === "completada") semaforoOT = "azul";
    else if (fechaCompromiso && diasDiff !== null) {
      if (diasDiff < 0) semaforoOT = "rojo";
      else if (diasDiff <= 7) semaforoOT = "amarillo";
      else semaforoOT = "verde";
    } else if (ot.estado === "planeada") semaforoOT = "gris";
    else semaforoOT = "verde";

    const faseActual = pasos.find((p) => p.estado === "en_curso");
    matriz.push({
      origen: "ot",
      id: Number(ot.id),
      codigo: ot.codigo,
      cliente: ot.contratos?.clientes?.razon_social ?? null,
      tipo: ot.tipo_ruta,
      capacidad_kva: ot.transformadores?.capacidad_kva ?? null,
      prioridad: ot.prioridad,
      estado: ot.estado,
      fase_actual: faseActual ? `${faseActual.numero}. ${faseActual.nombre}` : null,
      avance_pct: pct,
      fecha_compromiso: fechaCompromiso ? fechaCompromiso.toISOString() : null,
      responsable: ot.usuarios_ot_responsable_idTousuarios
        ? `${ot.usuarios_ot_responsable_idTousuarios.nombres} ${ot.usuarios_ot_responsable_idTousuarios.apellidos}`
        : null,
      dias_diff: diasDiff,
      semaforo: semaforoOT,
      capacidad_dummy: ot.transformadores == null,
    });
  }

  for (const e of expActivos) {
    const hitos = e.expediente_hitos ?? [];
    const completos = hitos.filter((h) => h.estado === "completado" || h.estado === "omitido").length;
    const pct = hitos.length ? Math.round((completos / hitos.length) * 100) : 0;
    const faseActual = hitos.find((h) => h.estado === "en_curso");
    matriz.push({
      origen: "expediente",
      id: Number(e.id),
      codigo: e.codigo,
      cliente: e.clientes?.razon_social ?? null,
      tipo: e.tipo_servicio_confirmado ?? e.tipo_servicio_estimado ?? "—",
      capacidad_kva: null,
      prioridad: null,
      estado: e.estado,
      fase_actual: faseActual ? `${faseActual.orden}. ${faseActual.nombre}` : null,
      avance_pct: pct,
      fecha_compromiso: null,
      responsable: e.usuarios_expedientes_ejecutivo_idTousuarios
        ? `${e.usuarios_expedientes_ejecutivo_idTousuarios.nombres} ${e.usuarios_expedientes_ejecutivo_idTousuarios.apellidos}`
        : null,
      dias_diff: null,
      semaforo: pct === 100 ? "azul" : pct > 0 ? "verde" : "gris",
      capacidad_dummy: true,
    });
  }

  // -------------------------------------------------------------------
  // Ranking: fases con más demora (basado en horas_transcurridas vs SLA)
  // -------------------------------------------------------------------
  const ranking_fases_demora = await prisma.$queryRaw<Array<{
    codigo: string; nombre: string; cant_estancados: bigint; promedio_exceso_horas: number;
  }>>`
    SELECT
      hito_codigo AS codigo,
      hito_nombre AS nombre,
      COUNT(*) AS cant_estancados,
      AVG(horas_transcurridas - sla_horas)::float AS promedio_exceso_horas
    FROM comercial.v_expediente_pipeline
    WHERE estancado = true
    GROUP BY hito_codigo, hito_nombre
    ORDER BY cant_estancados DESC, promedio_exceso_horas DESC
    LIMIT 5
  `;

  // -------------------------------------------------------------------
  // Cumplimiento por cliente (OT completadas a tiempo vs total)
  // -------------------------------------------------------------------
  const cumplimientoCliente = await prisma.$queryRaw<Array<{
    cliente: string; total: bigint; a_tiempo: bigint;
  }>>`
    SELECT
      cl.razon_social AS cliente,
      COUNT(*) AS total,
      COUNT(*) FILTER (
        WHERE ot.estado = 'completada'
          AND (ot.fecha_fin_planeada IS NULL OR ot.fecha_fin_real::date <= ot.fecha_fin_planeada)
      ) AS a_tiempo
    FROM produccion.ot ot
    JOIN comercial.contratos co ON co.id = ot.contrato_id
    JOIN comercial.clientes cl ON cl.id = co.cliente_id
    GROUP BY cl.razon_social
    HAVING COUNT(*) > 0
    ORDER BY COUNT(*) DESC
    LIMIT 10
  `;

  // -------------------------------------------------------------------
  // Alertas activas (mezcla real + dummy)
  // -------------------------------------------------------------------
  const alertasReales: Array<{ id: string; tipo: string; mensaje: string; severidad: "alta" | "media" | "baja"; ref?: { tipo: string; id: number } | null; dummy?: boolean }> = [];

  // estancamientos
  const estancRows = await prisma.$queryRaw<Array<{ expediente_id: bigint; expediente_codigo: string; hito_nombre: string }>>`
    SELECT DISTINCT expediente_id, expediente_codigo, hito_nombre
    FROM comercial.v_expediente_pipeline
    WHERE estancado = true
    LIMIT 10
  `;
  for (const r of estancRows) {
    alertasReales.push({
      id: `est-${r.expediente_id}-${r.hito_nombre}`,
      tipo: "estancamiento",
      mensaje: `Hito estancado en ${r.expediente_codigo}: ${r.hito_nombre}`,
      severidad: "alta",
      ref: { tipo: "expediente", id: Number(r.expediente_id) },
    });
  }
  // OT atrasadas
  const otAtrasadasRows = await prisma.ot.findMany({
    where: {
      estado: { in: ["planeada", "en_curso", "pausada"] },
      fecha_fin_planeada: { lt: new Date() },
    },
    select: { id: true, codigo: true, fecha_fin_planeada: true },
    take: 10,
  });
  for (const r of otAtrasadasRows) {
    alertasReales.push({
      id: `atr-${r.id}`,
      tipo: "atraso",
      mensaje: `OT ${r.codigo} pasó su fecha comprometida (${r.fecha_fin_planeada?.toISOString().split("T")[0]})`,
      severidad: "alta",
      ref: { tipo: "ot", id: Number(r.id) },
    });
  }
  // OT urgentes sin iniciar
  const urgentesSinIniciar = await prisma.ot.findMany({
    where: { prioridad: "urgente", estado: "planeada" },
    select: { id: true, codigo: true },
    take: 5,
  });
  for (const r of urgentesSinIniciar) {
    alertasReales.push({
      id: `urg-${r.id}`,
      tipo: "urgente_pendiente",
      mensaje: `OT urgente ${r.codigo} todavía no fue iniciada`,
      severidad: "media",
      ref: { tipo: "ot", id: Number(r.id) },
    });
  }

  // Próximas entregas (7 días)
  const proximasEntregas = await prisma.ot.findMany({
    where: {
      estado: { in: ["en_curso", "planeada", "pausada"] },
      fecha_fin_planeada: {
        gte: new Date(),
        lte: new Date(Date.now() + 7 * 86400000),
      },
    },
    orderBy: { fecha_fin_planeada: "asc" },
    take: 10,
    include: { contratos: { select: { clientes: { select: { razon_social: true } } } } },
  });

  // -------------------------------------------------------------------
  // Capacidad / causas / productividad — data REAL desde vistas (013)
  // -------------------------------------------------------------------
  const [cargaAreaRows, causasRows, productividadRows] = await Promise.all([
    prisma.$queryRaw<Array<{
      area_codigo: string; area_nombre: string; color_hex: string;
      ot_activas: bigint; pasos_en_curso: bigint; pasos_pendientes: bigint; completados_mes: bigint;
    }>>`SELECT area_codigo, area_nombre, color_hex, ot_activas, pasos_en_curso, pasos_pendientes, completados_mes
        FROM produccion.v_carga_por_area`,
    prisma.$queryRaw<Array<{
      codigo: string; nombre: string; categoria: string;
      incidencias_total: bigint; incidencias_abiertas: bigint;
      dias_perdidos_total: number; costo_estimado_total: number;
    }>>`SELECT codigo, nombre, categoria, incidencias_total, incidencias_abiertas,
               dias_perdidos_total, costo_estimado_total
        FROM produccion.v_causas_demora_agregado
        WHERE incidencias_total > 0
        ORDER BY incidencias_total DESC, dias_perdidos_total DESC
        LIMIT 10`,
    prisma.$queryRaw<Array<{
      usuario_id: string; nombre: string; email: string;
      ot_intervenidas_mes: bigint; horas_mes: number; pasos_completados_mes: bigint;
    }>>`SELECT usuario_id::text, nombre, email, ot_intervenidas_mes, horas_mes, pasos_completados_mes
        FROM produccion.v_productividad_responsable
        LIMIT 10`,
  ]);

  // Estimar % de carga por area: regla simple — pasos_en_curso + pasos_pendientes / 5 capacidad nominal
  const CAPACIDAD_NOMINAL_PASOS_POR_AREA = 5;
  const capacidad_planta = {
    dummy: false,
    por_area: cargaAreaRows.map((r) => {
      const carga = Number(r.pasos_en_curso) + Number(r.pasos_pendientes);
      const carga_pct = Math.min(100, Math.round((carga / CAPACIDAD_NOMINAL_PASOS_POR_AREA) * 100));
      return {
        area: r.area_nombre,
        codigo: r.area_codigo,
        color_hex: r.color_hex,
        carga_pct,
        ot_activas: Number(r.ot_activas),
        completados_mes: Number(r.completados_mes),
      };
    }),
  };

  const causas_demora = {
    dummy: false,
    causas: causasRows.map((c) => ({
      codigo: c.codigo,
      causa: c.nombre,
      categoria: c.categoria,
      incidencias: Number(c.incidencias_total),
      abiertas: Number(c.incidencias_abiertas),
      dias_perdidos: Number(c.dias_perdidos_total),
    })),
  };

  const productividad = {
    dummy: false,
    por_responsable: productividadRows.map((r) => ({
      usuario_id: r.usuario_id,
      nombre: r.nombre,
      email: r.email,
      ot_intervenidas_mes: Number(r.ot_intervenidas_mes),
      horas_mes: Number(r.horas_mes),
      pasos_completados_mes: Number(r.pasos_completados_mes),
    })),
  };

  // -------------------------------------------------------------------
  // Response
  // -------------------------------------------------------------------
  res.json({
    data: {
      // KPIs ejecutivos (data REAL)
      kpis: {
        ot_total: otPorEstado.reduce((s, r) => s + r._count, 0),
        ot_por_estado: otPorEstado.reduce<Record<string, number>>((a, r) => { a[r.estado] = r._count; return a; }, {}),
        expedientes_activos: expPorEstado.find((r) => r.estado === "activo")?._count ?? 0,
        expedientes_por_estado: expPorEstado.reduce<Record<string, number>>((a, r) => { a[r.estado] = r._count; return a; }, {}),
        ot_urgentes_abiertas: totalOTUrgentes,
        ot_atrasadas: otAtrasadas,
        expedientes_estancados: Number(totalEstancados[0]?.count ?? 0),
        notificaciones_pendientes: totalNotifPendientes,
      },
      // Semáforo de producción (data REAL)
      semaforo,
      // Matriz comparativa (data REAL pero capacidad_kva = dummy)
      matriz,
      // Rankings (data REAL)
      ranking_fases_demora: ranking_fases_demora.map((r) => ({
        ...r,
        cant_estancados: Number(r.cant_estancados),
        promedio_exceso_horas: Math.round(Number(r.promedio_exceso_horas) * 10) / 10,
      })),
      cumplimiento_cliente: cumplimientoCliente.map((r) => ({
        cliente: r.cliente,
        total: Number(r.total),
        a_tiempo: Number(r.a_tiempo),
        cumplimiento_pct: Number(r.total) > 0 ? Math.round((Number(r.a_tiempo) / Number(r.total)) * 100) : 0,
      })),
      // Alertas (REALES)
      alertas: alertasReales,
      // Próximas entregas (REAL)
      proximas_entregas: proximasEntregas.map((o) => ({
        id: Number(o.id),
        codigo: o.codigo,
        cliente: o.contratos?.clientes?.razon_social ?? null,
        fecha: o.fecha_fin_planeada,
        dias_para: o.fecha_fin_planeada
          ? Math.ceil((o.fecha_fin_planeada.getTime() - Date.now()) / 86400000)
          : null,
      })),
      // Capacidad / causas / productividad (REAL desde migration 013)
      capacidad_planta,
      causas_demora,
      productividad,
      // Meta
      generado_en: new Date().toISOString(),
    },
  });
});

export default router;
