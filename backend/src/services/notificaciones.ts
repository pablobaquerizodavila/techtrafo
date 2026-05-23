/**
 * Servicio de notificaciones (4.D).
 *
 * Encapsula la creacion de notificaciones en core.notificaciones a partir
 * de eventos del negocio. El worker (workers/notificaciones-worker.ts)
 * luego procesa las pendientes y las envia por SMTP.
 *
 * Diseño:
 * - Cada evento crea 1 fila por destinatario.
 * - El campo contexto JSONB lleva los datos para evitar joins al enviar.
 * - El campo tipo es la "categoria" (estancamiento, aprobacion, resolucion).
 * - Si no hay email destinatario valido, se omite silenciosamente.
 */
import { prisma } from "../db/client";
import {
  templateHitoEsperaAprobacion,
  templateHitoEstancado,
  templateHitoResolucion,
  ExpedienteContextoEmail,
} from "./email";

export type TipoNotificacion = "hito_estancado" | "hito_espera_aprobacion" | "hito_aprobado" | "hito_rechazado";

interface CreateInput {
  tipo: TipoNotificacion;
  destinatario_id?: string | null;
  destinatario_email: string;
  asunto: string;
  cuerpo_html: string;
  cuerpo_texto: string;
  contexto: Record<string, unknown>;
}

async function crear(input: CreateInput) {
  if (!input.destinatario_email) return null;
  return prisma.notificaciones.create({
    data: {
      tipo: input.tipo,
      destinatario_id: input.destinatario_id ?? null,
      destinatario_email: input.destinatario_email,
      asunto: input.asunto,
      cuerpo_html: input.cuerpo_html,
      cuerpo_texto: input.cuerpo_texto,
      contexto: input.contexto as object,
    },
  });
}

// ===================================================================
// Eventos del negocio
// ===================================================================

/**
 * Hito que requiere aprobacion entro en estado en_curso.
 * Notifica a todos los usuarios que tengan el rol_aprobador del hito.
 */
export async function notificarHitoEsperaAprobacion(hitoId: number) {
  const hito = await prisma.expediente_hitos.findUnique({
    where: { id: hitoId },
    include: {
      roles: { select: { id: true, nombre: true } },
      expedientes: {
        select: {
          id: true,
          codigo: true,
          clientes: { select: { razon_social: true } },
        },
      },
    },
  });
  if (!hito || !hito.requiere_aprobacion || !hito.rol_aprobador_id || !hito.expedientes) return;

  const aprobadores = await prisma.usuarios.findMany({
    where: { rol_id: hito.rol_aprobador_id, estado_aprobacion: "aprobado" },
    select: { id: true, email: true },
  });

  const ctx: ExpedienteContextoEmail = {
    expediente_id: hito.expedientes.id,
    expediente_codigo: hito.expedientes.codigo,
    cliente_nombre: hito.expedientes.clientes?.razon_social ?? "—",
    hito_nombre: hito.nombre,
  };

  for (const u of aprobadores) {
    if (!u.email) continue;
    const tpl = templateHitoEsperaAprobacion({ ...ctx, rol_aprobador: hito.roles?.nombre ?? "aprobador" });
    await crear({
      tipo: "hito_espera_aprobacion",
      destinatario_id: u.id,
      destinatario_email: u.email,
      asunto: tpl.subject,
      cuerpo_html: tpl.html,
      cuerpo_texto: tpl.text,
      contexto: { hito_id: hitoId, expediente_id: ctx.expediente_id, rol_id: hito.rol_aprobador_id },
    });
  }
}

/**
 * Hito fue aprobado o rechazado por su gate. Notifica al ejecutivo del expediente.
 */
export async function notificarResolucionHito(hitoId: number, aprobado: boolean, motivo?: string | null) {
  const hito = await prisma.expediente_hitos.findUnique({
    where: { id: hitoId },
    include: {
      expedientes: {
        select: {
          id: true,
          codigo: true,
          clientes: { select: { razon_social: true } },
          usuarios_expedientes_ejecutivo_idTousuarios: { select: { id: true, email: true, nombres: true, apellidos: true } },
        },
      },
      usuarios_expediente_hitos_aprobado_porTousuarios: { select: { nombres: true, apellidos: true } },
    },
  });
  if (!hito || !hito.expedientes) return;

  const ejecutivo = hito.expedientes.usuarios_expedientes_ejecutivo_idTousuarios;
  if (!ejecutivo || !ejecutivo.email) return;

  const aprobador = hito.usuarios_expediente_hitos_aprobado_porTousuarios
    ? `${hito.usuarios_expediente_hitos_aprobado_porTousuarios.nombres} ${hito.usuarios_expediente_hitos_aprobado_porTousuarios.apellidos}`
    : "el sistema";

  const ctx: ExpedienteContextoEmail = {
    expediente_id: hito.expedientes.id,
    expediente_codigo: hito.expedientes.codigo,
    cliente_nombre: hito.expedientes.clientes?.razon_social ?? "—",
    hito_nombre: hito.nombre,
  };

  const tpl = templateHitoResolucion({ ...ctx, aprobado, motivo, aprobador });
  await crear({
    tipo: aprobado ? "hito_aprobado" : "hito_rechazado",
    destinatario_id: ejecutivo.id,
    destinatario_email: ejecutivo.email,
    asunto: tpl.subject,
    cuerpo_html: tpl.html,
    cuerpo_texto: tpl.text,
    contexto: { hito_id: hitoId, expediente_id: ctx.expediente_id, aprobado, motivo: motivo ?? null },
  });
}

/**
 * Hito en estado en_curso supero su SLA. Notifica al responsable del hito
 * (si lo hay) y al ejecutivo del expediente.
 *
 * Importante: este metodo es idempotente por hito_id+fecha-del-dia. El worker
 * evita reenviar el mismo dia consultando notificaciones existentes.
 */
export async function notificarEstancamiento(hitoId: number, horas: number, sla: number) {
  const hito = await prisma.expediente_hitos.findUnique({
    where: { id: hitoId },
    include: {
      usuarios_expediente_hitos_responsable_idTousuarios: { select: { id: true, email: true } },
      expedientes: {
        select: {
          id: true,
          codigo: true,
          clientes: { select: { razon_social: true } },
          usuarios_expedientes_ejecutivo_idTousuarios: { select: { id: true, email: true } },
        },
      },
    },
  });
  if (!hito || !hito.expedientes) return;

  const ctx: ExpedienteContextoEmail = {
    expediente_id: hito.expedientes.id,
    expediente_codigo: hito.expedientes.codigo,
    cliente_nombre: hito.expedientes.clientes?.razon_social ?? "—",
    hito_nombre: hito.nombre,
  };
  const tpl = templateHitoEstancado({ ...ctx, horas, sla });

  // Combinamos responsable + ejecutivo, sin duplicados
  const destinatarios = new Map<string, { id: string | null; email: string }>();
  if (hito.usuarios_expediente_hitos_responsable_idTousuarios?.email) {
    const r = hito.usuarios_expediente_hitos_responsable_idTousuarios;
    destinatarios.set(r.email, { id: r.id, email: r.email });
  }
  if (hito.expedientes.usuarios_expedientes_ejecutivo_idTousuarios?.email) {
    const e = hito.expedientes.usuarios_expedientes_ejecutivo_idTousuarios;
    destinatarios.set(e.email, { id: e.id, email: e.email });
  }

  for (const d of destinatarios.values()) {
    await crear({
      tipo: "hito_estancado",
      destinatario_id: d.id,
      destinatario_email: d.email,
      asunto: tpl.subject,
      cuerpo_html: tpl.html,
      cuerpo_texto: tpl.text,
      contexto: { hito_id: hitoId, expediente_id: ctx.expediente_id, horas, sla },
    });
  }
}
