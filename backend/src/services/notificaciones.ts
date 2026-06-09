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
  EventoRevisionCotizacion,
  templateEscalacionHito,
  templateFacturaProveedorSubida,
  templateGarantiaPorVencer,
  templateHitoEsperaAprobacion,
  templateHitoEstancado,
  templateHitoResolucion,
  templateRevisionInternaCotizacion,
  ExpedienteContextoEmail,
} from "./email";

export type TipoNotificacion =
  | "hito_estancado"
  | "hito_espera_aprobacion"
  | "hito_aprobado"
  | "hito_rechazado"
  | "hito_escalado"
  | "garantia_vence_30d"
  | "garantia_vence_7d"
  | "cotizacion_revision_solicitada"
  | "cotizacion_revision_escalada"
  | "cotizacion_revision_aprobada"
  | "cotizacion_revision_rechazada"
  | "nc_creada"
  | "factura_proveedor_subida";

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

/**
 * Hito rechazado fue escalado a otro rol. Notifica a todos los usuarios
 * aprobados con ese rol_destino_id.
 *
 * Si rol_destino_id es null, busca el rol "gerencia_comercial" por nombre
 * (fallback razonable para escalaciones de visita tecnica). Si tampoco
 * existe, no notifica a nadie y devuelve 0.
 */
export async function notificarEscalacionHito(
  hitoId: number,
  mensaje: string,
  rolDestinoId: number | null,
  escaladoPorUserId: string,
): Promise<number> {
  const hito = await prisma.expediente_hitos.findUnique({
    where: { id: hitoId },
    include: {
      expedientes: {
        select: {
          id: true,
          codigo: true,
          clientes: { select: { razon_social: true } },
        },
      },
    },
  });
  if (!hito || !hito.expedientes) return 0;

  // Resolver rol destino
  let rolDestino: { id: number; nombre: string } | null = null;
  if (rolDestinoId !== null) {
    rolDestino = await prisma.roles.findUnique({
      where: { id: rolDestinoId },
      select: { id: true, nombre: true },
    });
  }
  if (!rolDestino) {
    rolDestino = await prisma.roles.findFirst({
      where: { nombre: "gerencia_comercial", activo: true },
      select: { id: true, nombre: true },
    });
  }
  if (!rolDestino) return 0;

  const destinatarios = await prisma.usuarios.findMany({
    where: { rol_id: rolDestino.id, estado_aprobacion: "aprobado", activo: true },
    select: { id: true, email: true },
  });
  if (destinatarios.length === 0) return 0;

  const escaladoPor = await prisma.usuarios.findUnique({
    where: { id: escaladoPorUserId },
    select: { nombres: true, apellidos: true, email: true },
  });
  const escaladoPorLabel = escaladoPor
    ? `${escaladoPor.nombres} ${escaladoPor.apellidos}`
    : "un usuario del equipo";

  const ctx: ExpedienteContextoEmail = {
    expediente_id: hito.expedientes.id,
    expediente_codigo: hito.expedientes.codigo,
    cliente_nombre: hito.expedientes.clientes?.razon_social ?? "—",
    hito_nombre: hito.nombre,
  };

  let creadas = 0;
  for (const u of destinatarios) {
    if (!u.email) continue;
    const tpl = templateEscalacionHito({
      ...ctx,
      mensaje,
      escalado_por: escaladoPorLabel,
      rol_destino: rolDestino.nombre,
    });
    const created = await crear({
      tipo: "hito_escalado",
      destinatario_id: u.id,
      destinatario_email: u.email,
      asunto: tpl.subject,
      cuerpo_html: tpl.html,
      cuerpo_texto: tpl.text,
      contexto: {
        hito_id: hitoId,
        expediente_id: ctx.expediente_id,
        rol_destino_id: rolDestino.id,
        mensaje,
        escalado_por_user_id: escaladoPorUserId,
      },
    });
    if (created) creadas++;
  }
  return creadas;
}

/**
 * Garantia proxima a vencer. Notifica al cliente (email registrado en clientes).
 *
 * Idempotente por (garantia_id + umbral): el worker se asegura de no encolar
 * dos veces el mismo aviso (30d o 7d) para la misma garantia.
 */
export interface GarantiaPorVencerInput {
  garantia_id: number;
  garantia_codigo: string;
  cliente_email: string | null;
  cliente_nombre: string;
  transformador_codigo: string | null;
  transformador_marca: string | null;
  fecha_fin: Date;
  dias_restantes: number;
  umbral: 30 | 7;
}

export async function notificarGarantiaPorVencer(input: GarantiaPorVencerInput): Promise<boolean> {
  if (!input.cliente_email) return false;
  const tpl = templateGarantiaPorVencer({
    garantia_codigo: input.garantia_codigo,
    cliente_nombre: input.cliente_nombre,
    transformador_codigo: input.transformador_codigo,
    transformador_marca: input.transformador_marca,
    fecha_fin: input.fecha_fin,
    dias_restantes: input.dias_restantes,
    umbral: input.umbral,
  });
  const creada = await crear({
    tipo: input.umbral === 30 ? "garantia_vence_30d" : "garantia_vence_7d",
    destinatario_email: input.cliente_email,
    asunto: tpl.subject,
    cuerpo_html: tpl.html,
    cuerpo_texto: tpl.text,
    contexto: {
      garantia_id: input.garantia_id,
      garantia_codigo: input.garantia_codigo,
      dias_restantes: input.dias_restantes,
      umbral: input.umbral,
    },
  });
  return creada !== null;
}

// ===================================================================
// Revision interna de cotizacion
// ===================================================================
const NIVEL_LABEL: Record<number, string> = {
  1: "Gerencia Comercial",
  2: "Gerencia General",
  3: "Presidencia",
};
const NIVEL_ROL: Record<number, string> = {
  1: "gerencia_comercial",
  2: "gerencia_general",
  3: "presidencia",
};

/**
 * Notifica un evento de la revision interna de una cotizacion.
 *
 * Destinatarios segun evento:
 *   - "solicitada" / "escalada" → todos los usuarios con el rol del nivel destino
 *   - "aprobada" / "rechazada"  → el solicitante original (vendedor) que pidio la revision
 *
 * Devuelve el numero de notificaciones encoladas.
 */
export async function notificarRevisionCotizacion(input: {
  cotizacion_id: number;
  evento: EventoRevisionCotizacion;
  // Para solicitada/escalada: nivel destino (al que se notifica)
  // Para aprobada/rechazada: nivel en que se resolvio
  nivel: number;
  actor_user_id: string;        // quien hizo la accion (vendedor / aprobador / escalador)
  mensaje?: string | null;      // motivo del rechazo / mensaje de escalacion / notas
}): Promise<number> {
  const cot = await prisma.cotizaciones.findUnique({
    where: { id: input.cotizacion_id },
    include: { clientes: { select: { razon_social: true } } },
  });
  if (!cot) return 0;

  const actor = await prisma.usuarios.findUnique({
    where: { id: input.actor_user_id },
    select: { nombres: true, apellidos: true },
  });
  const actorNombre = actor ? `${actor.nombres} ${actor.apellidos}` : "Usuario del equipo";

  // Resolver destinatarios segun evento
  let destinatarios: Array<{ id: string; email: string | null }> = [];
  if (input.evento === "solicitada" || input.evento === "escalada") {
    const rolNombre = NIVEL_ROL[input.nivel];
    if (!rolNombre) return 0;
    const rol = await prisma.roles.findFirst({
      where: { nombre: rolNombre, activo: true },
      select: { id: true },
    });
    if (!rol) return 0;
    destinatarios = await prisma.usuarios.findMany({
      where: { rol_id: rol.id, estado_aprobacion: "aprobado", activo: true },
      select: { id: true, email: true },
    });
  } else {
    // aprobada / rechazada → notificar al solicitante original
    if (cot.revision_interna_solicitada_por) {
      const solicitante = await prisma.usuarios.findUnique({
        where: { id: cot.revision_interna_solicitada_por },
        select: { id: true, email: true },
      });
      if (solicitante) destinatarios = [solicitante];
    }
  }

  if (destinatarios.length === 0) return 0;

  const tipoMap: Record<EventoRevisionCotizacion, TipoNotificacion> = {
    solicitada: "cotizacion_revision_solicitada",
    escalada: "cotizacion_revision_escalada",
    aprobada: "cotizacion_revision_aprobada",
    rechazada: "cotizacion_revision_rechazada",
  };

  let creadas = 0;
  for (const u of destinatarios) {
    if (!u.email) continue;
    const tpl = templateRevisionInternaCotizacion({
      evento: input.evento,
      cotizacion_codigo: cot.codigo,
      cotizacion_id: input.cotizacion_id,
      cliente_nombre: cot.clientes?.razon_social ?? "—",
      total: `$${cot.total.toString()}`,
      nivel: input.nivel,
      nivel_label: NIVEL_LABEL[input.nivel] ?? `Nivel ${input.nivel}`,
      actor_nombre: actorNombre,
      mensaje: input.mensaje ?? null,
    });
    const created = await crear({
      tipo: tipoMap[input.evento],
      destinatario_id: u.id,
      destinatario_email: u.email,
      asunto: tpl.subject,
      cuerpo_html: tpl.html,
      cuerpo_texto: tpl.text,
      contexto: {
        cotizacion_id: input.cotizacion_id,
        cotizacion_codigo: cot.codigo,
        nivel: input.nivel,
        actor_user_id: input.actor_user_id,
      },
    });
    if (created) creadas++;
  }
  return creadas;
}

/**
 * Notifica al responsable de calidad cuando se crea automaticamente una NC
 * a partir de una recepcion con lineas rechazadas.
 */
export async function notificarNCCreada(input: {
  nc_id: bigint;
  nc_codigo: string;
  proveedor_nombre: string;
  responsable_calidad_id: string | null;
}): Promise<void> {
  if (!input.responsable_calidad_id) return;
  const responsable = await prisma.usuarios.findUnique({
    where: { id: input.responsable_calidad_id },
    select: { email: true, nombre_completo: true },
  });
  if (!responsable?.email) return;

  await crear({
    tipo: "nc_creada",
    destinatario_id: input.responsable_calidad_id,
    destinatario_email: responsable.email,
    asunto: `[TECHTRAFO] Nueva no conformidad: ${input.nc_codigo} — ${input.proveedor_nombre}`,
    cuerpo_html: `
      <p>Se ha registrado una nueva no conformidad en una recepcion de compras.</p>
      <p><strong>Codigo:</strong> ${input.nc_codigo}</p>
      <p><strong>Proveedor:</strong> ${input.proveedor_nombre}</p>
      <p>Ingresa al panel para revisar el detalle y asignar acciones correctivas.</p>
    `,
    cuerpo_texto: `Nueva no conformidad: ${input.nc_codigo} — ${input.proveedor_nombre}. Revisa el panel.`,
    contexto: { nc_id: Number(input.nc_id), nc_codigo: input.nc_codigo },
  });
}

/**
 * Un proveedor subio su factura al portal. Notifica a todos los usuarios
 * activos con rol jefe_compras o financiero.
 */
export async function notificarFacturaProveedorSubida(ocId: number): Promise<void> {
  const oc = await prisma.ordenes_compra.findUnique({
    where: { id: BigInt(ocId) },
    select: {
      codigo: true,
      factura_proveedor_numero: true,
      proveedores: { select: { razon_social: true } },
    },
  });
  if (!oc) {
    console.warn(`[notificaciones] notificarFacturaProveedorSubida: OC ${ocId} no encontrada`);
    return;
  }

  const roles = await prisma.roles.findMany({
    where: { nombre: { in: ["jefe_compras", "financiero"] }, activo: true },
    select: { id: true },
  });
  if (roles.length === 0) {
    console.warn("[notificaciones] notificarFacturaProveedorSubida: roles jefe_compras/financiero no encontrados");
    return;
  }

  const destinatarios = await prisma.usuarios.findMany({
    where: {
      rol_id: { in: roles.map((r) => r.id) },
      estado_aprobacion: "aprobado",
      activo: true,
    },
    select: { id: true, email: true },
  });
  if (destinatarios.length === 0) {
    console.warn("[notificaciones] notificarFacturaProveedorSubida: sin destinatarios con rol jefe_compras/financiero");
    return;
  }

  const tpl = templateFacturaProveedorSubida({
    oc_codigo: oc.codigo,
    oc_id: ocId,
    proveedor_nombre: oc.proveedores?.razon_social ?? "Proveedor",
    factura_numero: oc.factura_proveedor_numero ?? "—",
  });

  for (const u of destinatarios) {
    if (!u.email) continue;
    await crear({
      tipo: "factura_proveedor_subida",
      destinatario_id: u.id,
      destinatario_email: u.email,
      asunto: tpl.subject,
      cuerpo_html: tpl.html,
      cuerpo_texto: tpl.text,
      contexto: { orden_compra_id: ocId },
    });
  }
}
