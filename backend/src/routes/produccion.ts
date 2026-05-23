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
      capacidad_kva: null, // DUMMY: pendiente migration 012
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
      capacidad_dummy: true,
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
  // Datos DUMMY (pendientes de migrations futuras)
  // -------------------------------------------------------------------
  const dummy_capacidad_planta = {
    dummy: true,
    nota: "Pendiente: tablas produccion.areas + produccion.tiempos_trabajo (migration 013)",
    por_area: [
      { area: "Bobinado", carga_pct: 87, ot_activas: 4 },
      { area: "Núcleo", carga_pct: 62, ot_activas: 2 },
      { area: "Tanque", carga_pct: 45, ot_activas: 2 },
      { area: "Pintura", carga_pct: 30, ot_activas: 1 },
      { area: "Pruebas", carga_pct: 75, ot_activas: 3 },
      { area: "Despacho", carga_pct: 20, ot_activas: 1 },
    ],
  };

  const dummy_causas_demora = {
    dummy: true,
    nota: "Pendiente: tabla produccion.causas_demora (migration 013)",
    causas: [
      { causa: "Falta de materiales", incidencias: 8, dias_perdidos: 24 },
      { causa: "Falta de personal", incidencias: 5, dias_perdidos: 12 },
      { causa: "Reproceso por QA", incidencias: 3, dias_perdidos: 9 },
      { causa: "Fallas técnicas equipo", incidencias: 2, dias_perdidos: 5 },
      { causa: "Espera aprobación cliente", incidencias: 4, dias_perdidos: 14 },
    ],
  };

  const dummy_productividad = {
    dummy: true,
    nota: "Pendiente: produccion.tiempos_trabajo (migration 013)",
    por_responsable: [
      { nombre: "Sin asignación tipificada", ot_completadas_mes: 0, eficiencia_pct: 0 },
    ],
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
      // DUMMY explícito
      dummy_capacidad_planta,
      dummy_causas_demora,
      dummy_productividad,
      // Meta
      generado_en: new Date().toISOString(),
    },
  });
});

export default router;
