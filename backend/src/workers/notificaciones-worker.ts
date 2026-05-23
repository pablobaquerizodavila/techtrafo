/**
 * Worker de notificaciones (4.D).
 *
 * Corre dentro del proceso de la API mediante setInterval. Cada tick:
 *   1. Detecta estancamientos nuevos consultando comercial.v_expediente_pipeline
 *      y crea notificaciones (idempotente por hito_id + dia).
 *   2. Procesa la cola: toma notificaciones con enviado=false e intento_count<5,
 *      las envia via SMTP y actualiza el estado.
 *
 * Importante: en una topologia con varios procesos de API, este worker debe
 * correr en uno solo, o usar un advisory lock de Postgres. Por ahora 1 API.
 */
import { prisma } from "../db/client";
import { env } from "../config/env";
import { sendEmail, verifyEmailConfig } from "../services/email";
import { notificarEstancamiento } from "../services/notificaciones";

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
  const rows = await prisma.$queryRaw<EstancadoRow[]>`
    SELECT expediente_id, hito_id, hito_codigo, horas_transcurridas, sla_horas
      FROM comercial.v_expediente_pipeline
     WHERE estancado = true
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

async function procesarPendientes() {
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
    const env_ = await procesarPendientes();
    if (det.encolados > 0 || env_.ok > 0 || env_.fallos > 0) {
      console.log(
        `[notif-worker] estancamientos detectados=${det.detectados} encolados=${det.encolados} | envios ok=${env_.ok} fallos=${env_.fallos}`,
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
