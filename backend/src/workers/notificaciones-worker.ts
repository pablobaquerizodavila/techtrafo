/**
 * Worker de notificaciones (4.D).
 *
 * Corre dentro del proceso de la API mediante setInterval. Cada tick:
 *   1. Detecta estancamientos nuevos consultando comercial.v_expediente_pipeline
 *      y crea notificaciones (idempotente por hito_id + dia).
 *   2. Detecta garantias por vencer (30d / 7d) consultando
 *      posventa.v_garantias_por_vencer y crea notificaciones (idempotente
 *      por garantia_id + umbral, una sola vez en la vida de la garantia).
 *   3. Procesa la cola: toma notificaciones con enviado=false e intento_count<5,
 *      las envia via SMTP y actualiza el estado.
 *
 * Importante: en una topologia con varios procesos de API, este worker debe
 * correr en uno solo, o usar un advisory lock de Postgres. Por ahora 1 API.
 */
import { prisma } from "../db/client";
import { env } from "../config/env";
import { sendEmail, verifyEmailConfig } from "../services/email";
import { notificarEstancamiento, notificarGarantiaPorVencer } from "../services/notificaciones";

const MAX_INTENTOS = 5;
const BATCH_SIZE = 25;

interface EstancadoRow {
  expediente_id: bigint;
  hito_id: bigint;
  hito_codigo: string;
  horas_transcurridas: number;
  sla_horas: number;
}

async function detectarEstancamientos() {
  // Solo expedientes activos: si fue cancelado / ganado / perdido, los hitos
  // que quedaron en_curso ya no necesitan accion. La vista los sigue marcando
  // como estancados (por SLA al momento del cierre) — los excluimos aqui.
  const rows = await prisma.$queryRaw<EstancadoRow[]>`
    SELECT expediente_id, hito_id, hito_codigo, horas_transcurridas, sla_horas
      FROM comercial.v_expediente_pipeline
     WHERE estancado = true
       AND expediente_estado = 'activo'
  `;

  if (rows.length === 0) return { detectados: 0, encolados: 0 };

  let encolados = 0;
  const desdeHoy = new Date();
  desdeHoy.setHours(0, 0, 0, 0);

  for (const r of rows) {
    const hitoId = Number(r.hito_id);

    // Idempotencia: si ya enviamos (o intentamos) un mail de estancamiento
    // para este hito hoy, no creamos otro.
    const yaHoy = await prisma.notificaciones.findFirst({
      where: {
        tipo: "hito_estancado",
        created_at: { gte: desdeHoy },
        contexto: { path: ["hito_id"], equals: hitoId },
      },
      select: { id: true },
    });
    if (yaHoy) continue;

    await notificarEstancamiento(hitoId, Number(r.horas_transcurridas), Number(r.sla_horas));
    encolados++;
  }

  return { detectados: rows.length, encolados };
}

interface GarantiaPorVencerRow {
  id: bigint;
  codigo: string;
  cliente_id: bigint;
  transformador_id: bigint | null;
  fecha_fin: Date;
  dias_restantes: number;
  cliente_nombre: string;
  cliente_email: string | null;
  transformador_codigo: string | null;
  transformador_marca: string | null;
}

async function detectarGarantiasPorVencer() {
  const rows = await prisma.$queryRaw<GarantiaPorVencerRow[]>`
    SELECT id, codigo, cliente_id, transformador_id, fecha_fin, dias_restantes,
           cliente_nombre, cliente_email, transformador_codigo, transformador_marca
      FROM posventa.v_garantias_por_vencer
  `;

  if (rows.length === 0) return { detectadas: 0, encoladas: 0 };

  let encoladas = 0;

  for (const r of rows) {
    const dias = Number(r.dias_restantes);
    let umbral: 30 | 7 | null = null;
    if (dias <= 7 && dias >= 0) umbral = 7;
    else if (dias <= 30) umbral = 30;
    if (umbral === null) continue;

    const garantiaId = Number(r.id);
    const tipo = umbral === 30 ? "garantia_vence_30d" : "garantia_vence_7d";

    // Idempotencia: 1 sola notificacion por (garantia_id + umbral) en toda
    // la vida de la garantia. El umbral 7d se dispara aunque ya haya salido
    // el 30d porque son tipos distintos.
    const ya = await prisma.notificaciones.findFirst({
      where: {
        tipo,
        contexto: { path: ["garantia_id"], equals: garantiaId },
      },
      select: { id: true },
    });
    if (ya) continue;

    const creada = await notificarGarantiaPorVencer({
      garantia_id: garantiaId,
      garantia_codigo: r.codigo,
      cliente_email: r.cliente_email,
      cliente_nombre: r.cliente_nombre,
      transformador_codigo: r.transformador_codigo,
      transformador_marca: r.transformador_marca,
      fecha_fin: new Date(r.fecha_fin),
      dias_restantes: dias,
      umbral,
    });
    if (creada) encoladas++;
  }

  return { detectadas: rows.length, encoladas };
}

async function procesarPendientes() {
  // Antes de procesar, marcar como omitidas las notificaciones cuyo expediente
  // pasó a estado terminal entre la creación y este tick. Asi no enviamos un
  // email tarde de algo que ya no aplica. Se marca enviado=true con error
  // descriptivo para auditoria y no reintentos.
  await prisma.$executeRaw`
    UPDATE core.notificaciones n
       SET enviado = true,
           fecha_envio = NOW(),
           error = 'omitida: expediente en estado terminal'
     WHERE n.enviado = false
       AND EXISTS (
         SELECT 1 FROM comercial.expedientes e
          WHERE e.id = NULLIF(n.contexto->>'expediente_id', '')::bigint
            AND e.estado IN ('cancelado','ganado','perdido')
       )
  `;

  const pendientes = await prisma.notificaciones.findMany({
    where: { enviado: false, intento_count: { lt: MAX_INTENTOS } },
    orderBy: { created_at: "asc" },
    take: BATCH_SIZE,
  });

  if (pendientes.length === 0) return { procesadas: 0, ok: 0, fallos: 0 };

  let ok = 0;
  let fallos = 0;

  for (const n of pendientes) {
    try {
      const res = await sendEmail({
        to: n.destinatario_email,
        subject: n.asunto,
        html: n.cuerpo_html ?? undefined,
        text: n.cuerpo_texto ?? undefined,
      });
      await prisma.notificaciones.update({
        where: { id: n.id },
        data: {
          enviado: true,
          fecha_envio: new Date(),
          intento_count: { increment: 1 },
          error: res.dryRun ? "dry-run (SMTP no configurado)" : null,
        },
      });
      ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await prisma.notificaciones.update({
        where: { id: n.id },
        data: {
          intento_count: { increment: 1 },
          error: msg.slice(0, 1000),
        },
      });
      fallos++;
    }
  }

  return { procesadas: pendientes.length, ok, fallos };
}

async function tick() {
  try {
    const det = await detectarEstancamientos();
    const gar = await detectarGarantiasPorVencer();
    const env_ = await procesarPendientes();
    if (det.encolados > 0 || gar.encoladas > 0 || env_.ok > 0 || env_.fallos > 0) {
      console.log(
        `[notif-worker] estancamientos=${det.encolados}/${det.detectados} | garantias=${gar.encoladas}/${gar.detectadas} | envios ok=${env_.ok} fallos=${env_.fallos}`,
      );
    }
  } catch (err) {
    console.error("[notif-worker] error en tick:", err);
  }
}

let interval: NodeJS.Timeout | null = null;

export async function startNotificacionesWorker() {
  // Sanity check SMTP al arrancar (no bloqueante)
  void verifyEmailConfig().then((r) => {
    console.log(`[notif-worker] ${r.message}`);
  });

  const seconds = env.NOTIF_WORKER_INTERVAL_SECONDS;
  console.log(`[notif-worker] iniciando, intervalo=${seconds}s`);

  // Primer tick inmediato (no esperar 5 min para procesar la cola)
  void tick();
  interval = setInterval(() => void tick(), seconds * 1000);
}

export function stopNotificacionesWorker() {
  if (interval) clearInterval(interval);
  interval = null;
}
