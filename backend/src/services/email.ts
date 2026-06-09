/**
 * Servicio de email (4.D).
 *
 * Usa nodemailer con SMTP de mailcow (VM 192.168.0.3, o cualquier otro que
 * se configure por .env). Si SMTP_HOST esta vacio, queda en modo dry-run:
 * loguea el mail por consola y reporta éxito sin enviar nada.
 *
 * El transporter se crea una sola vez (lazy) y se reusa.
 */
import nodemailer, { Transporter } from "nodemailer";
import { env } from "../config/env";

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface SendEmailInput {
  to: string;
  cc?: string;
  subject: string;
  html?: string;
  text?: string;
  attachments?: EmailAttachment[];
}

let cached: Transporter | null = null;
let dryRunWarned = false;

function getTransporter(): Transporter | null {
  if (!env.SMTP_HOST) {
    if (!dryRunWarned) {
      console.warn(
        "[email] SMTP_HOST no configurado. Worker en dry-run: las notificaciones se registran en BD pero NO se envian.",
      );
      dryRunWarned = true;
    }
    return null;
  }
  if (cached) return cached;
  // TLS: solo aceptar cert no-validado contra hosts LAN (mailcow .3, cuyo
  // cert LE es para mail.eneural.org y no matchea la IP privada).
  // Contra cualquier host externo (gmail/sendgrid/ses), exigir cert valido
  // para evitar MITM por config heredada.
  const isLanHost = /^192\.168\.\d+\.\d+$/.test(env.SMTP_HOST) ||
                    /^10\.\d+\.\d+\.\d+$/.test(env.SMTP_HOST) ||
                    /^172\.(1[6-9]|2[0-9]|3[01])\.\d+\.\d+$/.test(env.SMTP_HOST);

  cached = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    tls: { rejectUnauthorized: !isLanHost },
  });

  if (isLanHost) {
    console.warn(`[email] SMTP host ${env.SMTP_HOST} es LAN — cert verification deshabilitada (autofirmado de Synology).`);
  }
  return cached;
}

/**
 * Envia un email. Devuelve la respuesta SMTP o lanza si falla.
 * En dry-run retorna { dryRun: true } sin tocar la red.
 */
export async function sendEmail(input: SendEmailInput): Promise<{ dryRun: boolean; messageId?: string }> {
  const tx = getTransporter();
  if (!tx) {
    console.log(`[email DRY-RUN] -> ${input.to} | ${input.subject}`);
    return { dryRun: true };
  }
  const info = await tx.sendMail({
    from: env.SMTP_FROM,
    to: input.to,
    cc: input.cc,
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachments: input.attachments,
  });
  return { dryRun: false, messageId: info.messageId };
}

/** Verifica conectividad SMTP. Util para sanity check al iniciar el server. */
export async function verifyEmailConfig(): Promise<{ ok: boolean; message: string }> {
  const tx = getTransporter();
  if (!tx) return { ok: false, message: "SMTP en dry-run (sin host)" };
  try {
    await tx.verify();
    return { ok: true, message: `SMTP OK -> ${env.SMTP_HOST}:${env.SMTP_PORT}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "error desconocido" };
  }
}

// ===================================================================
// Templates HTML basicos
// ===================================================================

/**
 * Escapa una cadena para interpolarla de forma segura en HTML (fix auditoria
 * M-1: las plantillas inyectaban motivo/mensaje/nombres sin escapar, lo que
 * permitia HTML/XSS en el cliente de correo del destinatario). Aplicar a TODO
 * valor dinamico que se interpola en el cuerpo HTML. El parametro `body` que
 * recibe `layout` es HTML ya construido por las plantillas (de confianza): sus
 * variables se escapan en cada plantilla, no aca.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
/** Escapa y convierte saltos de linea en <br> (para texto multilinea). */
export function escapeHtmlMultiline(value: unknown): string {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function layout(titulo: string, body: string, ctaUrl?: string, ctaLabel?: string): string {
  const t = escapeHtml(titulo);
  const url = ctaUrl ? escapeHtml(ctaUrl) : undefined;
  const label = escapeHtml(ctaLabel ?? "Ver en el panel");
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${t}</title></head>
<body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:24px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;border:1px solid #e5e7eb;">
    <h2 style="color:#0f172a;margin:0 0 16px 0;">${t}</h2>
    ${body}
    ${url ? `<p style="margin-top:24px;"><a href="${url}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">${label}</a></p>` : ""}
    <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;">
    <p style="font-size:12px;color:#64748b;margin:0;">TECHTRAFO · este es un mensaje automatico. No respondas a este correo.</p>
  </div>
</body></html>`;
}

export interface ExpedienteContextoEmail {
  expediente_id: number;
  expediente_codigo: string;
  cliente_nombre: string;
  hito_nombre: string;
}

export function templateHitoEstancado(c: ExpedienteContextoEmail & { horas: number; sla: number }) {
  const url = `${env.PANEL_URL}/expedientes/${c.expediente_id}`;
  const subject = `[TECHTRAFO] Hito estancado: ${c.hito_nombre} (${c.expediente_codigo})`;
  const html = layout(
    "Hito estancado",
    `<p>El siguiente hito superó su SLA y requiere atención inmediata:</p>
     <ul>
       <li><strong>Expediente:</strong> ${escapeHtml(c.expediente_codigo)} (${escapeHtml(c.cliente_nombre)})</li>
       <li><strong>Hito:</strong> ${escapeHtml(c.hito_nombre)}</li>
       <li><strong>Tiempo transcurrido:</strong> ${c.horas.toFixed(1)} h (SLA ${c.sla} h)</li>
     </ul>`,
    url,
    "Abrir expediente",
  );
  const text = `Hito estancado: ${c.hito_nombre} en expediente ${c.expediente_codigo} (${c.cliente_nombre}). ${c.horas.toFixed(1)}h / SLA ${c.sla}h. Ver: ${url}`;
  return { subject, html, text };
}

export function templateHitoEsperaAprobacion(c: ExpedienteContextoEmail & { rol_aprobador: string }) {
  const url = `${env.PANEL_URL}/expedientes/${c.expediente_id}`;
  const subject = `[TECHTRAFO] Hito requiere tu aprobación: ${c.hito_nombre}`;
  const html = layout(
    "Aprobación requerida",
    `<p>Hay un hito esperando tu visto bueno como <strong>${escapeHtml(c.rol_aprobador)}</strong>:</p>
     <ul>
       <li><strong>Expediente:</strong> ${escapeHtml(c.expediente_codigo)} (${escapeHtml(c.cliente_nombre)})</li>
       <li><strong>Hito:</strong> ${escapeHtml(c.hito_nombre)}</li>
     </ul>
     <p>Ingresa al panel para revisar y aprobar/rechazar.</p>`,
    url,
    "Aprobar / rechazar",
  );
  const text = `Hito "${c.hito_nombre}" en expediente ${c.expediente_codigo} (${c.cliente_nombre}) espera aprobacion del rol ${c.rol_aprobador}. ${url}`;
  return { subject, html, text };
}

export function templateHitoResolucion(
  c: ExpedienteContextoEmail & { aprobado: boolean; motivo?: string | null; aprobador: string },
) {
  const url = `${env.PANEL_URL}/expedientes/${c.expediente_id}`;
  const verbo = c.aprobado ? "aprobado" : "rechazado";
  const subject = `[TECHTRAFO] Hito ${verbo}: ${c.hito_nombre} (${c.expediente_codigo})`;
  const html = layout(
    `Hito ${verbo}`,
    `<p>El hito <strong>${escapeHtml(c.hito_nombre)}</strong> fue ${verbo} por ${escapeHtml(c.aprobador)}.</p>
     <ul>
       <li><strong>Expediente:</strong> ${escapeHtml(c.expediente_codigo)} (${escapeHtml(c.cliente_nombre)})</li>
     </ul>
     ${c.motivo ? `<p><strong>Motivo:</strong> ${escapeHtmlMultiline(c.motivo)}</p>` : ""}`,
    url,
    "Ver expediente",
  );
  const text = `Hito "${c.hito_nombre}" ${verbo} por ${c.aprobador} en expediente ${c.expediente_codigo}. ${c.motivo ? `Motivo: ${c.motivo}. ` : ""}${url}`;
  return { subject, html, text };
}

export function templateEscalacionHito(c: ExpedienteContextoEmail & {
  mensaje: string;
  escalado_por: string;
  rol_destino: string;
}) {
  const url = `${env.PANEL_URL}/expedientes/${c.expediente_id}`;
  const subject = `[TECHTRAFO] Escalación: ${c.hito_nombre} (${c.expediente_codigo})`;
  const html = layout(
    "Hito escalado a tu rol",
    `<p>Un hito fue escalado a tu rol <strong>${escapeHtml(c.rol_destino)}</strong> para que decidas el próximo paso:</p>
     <ul>
       <li><strong>Expediente:</strong> ${escapeHtml(c.expediente_codigo)} (${escapeHtml(c.cliente_nombre)})</li>
       <li><strong>Hito:</strong> ${escapeHtml(c.hito_nombre)}</li>
       <li><strong>Escalado por:</strong> ${escapeHtml(c.escalado_por)}</li>
     </ul>
     <p><strong>Mensaje:</strong></p>
     <blockquote style="border-left:3px solid #cbd5e1;padding-left:12px;color:#475569;white-space:pre-wrap;">${escapeHtml(c.mensaje)}</blockquote>
     <p>Abrí el expediente para revisar el contexto y decidir.</p>`,
    url,
    "Abrir expediente",
  );
  const text = `Hito "${c.hito_nombre}" del expediente ${c.expediente_codigo} (${c.cliente_nombre}) fue escalado a ${c.rol_destino} por ${c.escalado_por}. Mensaje: ${c.mensaje}. Ver: ${url}`;
  return { subject, html, text };
}

// ===================================================================
// Revision interna de cotizacion
// ===================================================================
export type EventoRevisionCotizacion = "solicitada" | "escalada" | "aprobada" | "rechazada";

export function templateRevisionInternaCotizacion(c: {
  evento: EventoRevisionCotizacion;
  cotizacion_codigo: string;
  cotizacion_id: number;
  cliente_nombre: string;
  total: string;
  nivel: number;
  nivel_label: string;     // "Gerencia Comercial" | "Gerencia General" | "Presidencia"
  actor_nombre: string;    // quien solicito/escalo/aprobo/rechazo
  mensaje?: string | null; // motivo de rechazo / mensaje de escalacion / notas
}) {
  const link = `${env.PANEL_URL.replace(/\/$/, "")}/cotizaciones/${c.cotizacion_id}`;
  const verboMap: Record<EventoRevisionCotizacion, string> = {
    solicitada: "Solicitud de revisión",
    escalada:   "Escalación recibida",
    aprobada:   "Cotización aprobada",
    rechazada:  "Cotización rechazada",
  };
  const verbo = verboMap[c.evento];
  const actorE = escapeHtml(c.actor_nombre);
  const nivelE = escapeHtml(c.nivel_label);
  const accionMsg: Record<EventoRevisionCotizacion, string> = {
    solicitada: `<strong>${actorE}</strong> solicita tu revisión y aprobación como <strong>${nivelE}</strong>.`,
    escalada:   `<strong>${actorE}</strong> ha escalado la cotización a <strong>${nivelE}</strong> para que decida sobre la aprobación.`,
    aprobada:   `<strong>${actorE}</strong> aprobó la cotización en nivel <strong>${nivelE}</strong>. Ya puede enviarse al cliente.`,
    rechazada:  `<strong>${actorE}</strong> rechazó la cotización en nivel <strong>${nivelE}</strong>. Revisa el motivo y corrige antes de re-solicitar.`,
  };
  const subject = `[TECHTRAFO] ${verbo} · Cotización ${c.cotizacion_codigo}`;
  const mensajeBlock = c.mensaje
    ? `<p><strong>${c.evento === "rechazada" ? "Motivo del rechazo" : c.evento === "escalada" ? "Mensaje" : "Notas"}:</strong></p>
       <blockquote style="border-left:3px solid #cbd5e1;padding-left:10px;margin:8px 0;color:#475569;">${escapeHtmlMultiline(c.mensaje)}</blockquote>`
    : "";
  const html = layout(
    `${verbo} — ${c.cotizacion_codigo}`,
    `<p>${accionMsg[c.evento]}</p>
     <ul>
       <li><strong>Cotización:</strong> ${escapeHtml(c.cotizacion_codigo)}</li>
       <li><strong>Cliente:</strong> ${escapeHtml(c.cliente_nombre)}</li>
       <li><strong>Total:</strong> ${escapeHtml(c.total)}</li>
     </ul>
     ${mensajeBlock}
     <p><a href="${escapeHtml(link)}" style="display:inline-block;background:#2563eb;color:white;padding:8px 14px;border-radius:6px;text-decoration:none;">Abrir cotización en el panel</a></p>`,
  );
  const text = `${verbo}: cotizacion ${c.cotizacion_codigo} - ${c.cliente_nombre} - total ${c.total}. ${c.actor_nombre} en nivel ${c.nivel_label}.${c.mensaje ? ` Mensaje: ${c.mensaje}` : ""} Link: ${link}`;
  return { subject, html, text };
}

export function templateGarantiaPorVencer(c: {
  garantia_codigo: string;
  cliente_nombre: string;
  transformador_codigo: string | null;
  transformador_marca: string | null;
  fecha_fin: Date;
  dias_restantes: number;
  umbral: 30 | 7;
}) {
  const fechaStr = c.fecha_fin.toISOString().slice(0, 10);
  const equipo = c.transformador_codigo
    ? `${c.transformador_codigo}${c.transformador_marca ? ` (${c.transformador_marca})` : ""}`
    : "su transformador";
  const tono = c.umbral === 7 ? "Última semana antes del vencimiento" : "Faltan 30 días para el vencimiento";
  const subject = `[TECHTRAFO] Garantía ${c.garantia_codigo} vence en ${c.dias_restantes} día${c.dias_restantes === 1 ? "" : "s"}`;
  const html = layout(
    `Garantía por vencer · ${tono}`,
    `<p>Estimado/a <strong>${escapeHtml(c.cliente_nombre)}</strong>,</p>
     <p>Le recordamos que la garantía de ${escapeHtml(equipo)} está próxima a vencer:</p>
     <ul>
       <li><strong>Garantía:</strong> ${escapeHtml(c.garantia_codigo)}</li>
       <li><strong>Fecha de vencimiento:</strong> ${fechaStr}</li>
       <li><strong>Días restantes:</strong> ${c.dias_restantes}</li>
     </ul>
     <p>Si desea renovar la cobertura o coordinar una inspección preventiva, responda a este aviso o contacte a su asesor TECHTRAFO.</p>`,
  );
  const text = `Garantia ${c.garantia_codigo} de ${c.cliente_nombre} vence el ${fechaStr} (${c.dias_restantes} dias). Equipo: ${equipo}.`;
  return { subject, html, text };
}

export function templateFacturaProveedorSubida(c: {
  oc_codigo: string;
  oc_id: number;
  proveedor_nombre: string;
  factura_numero: string;
}) {
  const link = `${env.PANEL_URL.replace(/\/$/, "")}/compras/ordenes-compra/${c.oc_id}`;
  const subject = `[TECHTRAFO] Nueva factura recibida — ${escapeHtml(c.oc_codigo)} · ${escapeHtml(c.proveedor_nombre)}`;
  const html = layout(
    "Nueva factura del proveedor",
    `<p>El proveedor <strong>${escapeHtml(c.proveedor_nombre)}</strong> ha subido su factura a la orden de compra:</p>
     <ul>
       <li><strong>Orden de compra:</strong> ${escapeHtml(c.oc_codigo)}</li>
       <li><strong>Número de factura:</strong> ${escapeHtml(c.factura_numero)}</li>
     </ul>
     <p>Ingresa al panel para revisar y descargar el archivo adjunto.</p>`,
    link,
    "Ver orden de compra",
  );
  const text = `Nueva factura recibida. OC ${c.oc_codigo} · Proveedor: ${c.proveedor_nombre} · Factura nro. ${c.factura_numero}. Ver: ${link}`;
  return { subject, html, text };
}
