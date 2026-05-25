/**
 * Helpers base para generar PDFs corporativos de TECHTRAFO (4.6).
 *
 * Usamos pdfkit por ser lightweight (sin Chromium) y muy controlable.
 * Todos los PDFs comparten cabecera, pie y paleta cromática.
 *
 * Niveles de detalle (validados server-side, no confiar en query):
 *   N=1  cliente simple        -> totales solo, sin desglose
 *   N=2  cliente completo      -> con tabla de lineas, IVA, descuentos
 *   N=3  interno comercial     -> con costos/margenes y notas internas
 *   N=4  interno completo      -> +auditoria (creado_por, aprobado_por, fechas, metadata)
 */
import PDFDocument from "pdfkit";
import type { Response } from "express";

export type Nivel = 1 | 2 | 3 | 4;

export interface NivelPermitido { max: Nivel; razon: string }

/**
 * Resuelve el nivel efectivo a usar segun el rol del usuario.
 * Aunque el cliente pida N=4, si su rol es "cliente" se fuerza a N=2.
 */
export function resolverNivel(pedido: number | undefined, rolNombre: string | null, esSuperAdmin: boolean): { nivel: Nivel; max: Nivel } {
  const max: Nivel = esSuperAdmin ? 4 : rolNombre === "cliente" ? 2 : 3;
  const p = Number.isInteger(pedido) ? (pedido as number) : 2;
  const clamped = (p < 1 ? 1 : p > max ? max : p) as Nivel;
  return { nivel: clamped, max };
}

// ===================================================================
// Paleta de marca
// ===================================================================
export const COLORS = {
  brand: "#0f172a",
  brandSoft: "#334155",
  primary: "#2563eb",
  muted: "#64748b",
  ruleSoft: "#e2e8f0",
  rule: "#cbd5e1",
  bgSoft: "#f8fafc",
  ok: "#16a34a",
  warning: "#ca8a04",
  danger: "#dc2626",
};

export interface PdfMeta {
  documento: string;          // "COTIZACION" | "CONTRATO" | "ORDEN DE TRABAJO" | "INFORME TECNICO"
  codigo: string;             // "COT-2026-0001"
  fecha: Date;
  nivel: Nivel;
  subtitulo?: string;
}

/**
 * Crea un PDFDocument con cabecera/pie ya pintados, listo para escribir
 * el cuerpo. Devuelve el doc para que el caller agregue contenido y
 * llame a doc.end().
 */
export function crearDocumento(meta: PdfMeta): InstanceType<typeof PDFDocument> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 110, bottom: 80, left: 50, right: 50 },
    info: {
      Title: `${meta.documento} ${meta.codigo}`,
      Author: "TECHTRAFO",
      Subject: meta.subtitulo ?? meta.documento,
      Producer: "techtrafo-api",
    },
  });

  // Pintar cabecera y pie en CADA pagina (event listener)
  doc.on("pageAdded", () => pintarCabecera(doc, meta));
  // Y en la primera
  pintarCabecera(doc, meta);

  return doc;
}

/**
 * Envuelve el doc en la response HTTP con headers de descarga.
 */
export function enviarPDF(doc: InstanceType<typeof PDFDocument>, res: Response, filename: string): void {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}.pdf"`);
  doc.pipe(res);
  doc.end();
}

// ===================================================================
// Cabecera y pie
// ===================================================================
function pintarCabecera(doc: InstanceType<typeof PDFDocument>, meta: PdfMeta): void {
  const w = doc.page.width;
  // Franja superior
  doc.save();
  doc.rect(0, 0, w, 80).fill(COLORS.brand);
  doc.fillColor("white").font("Helvetica-Bold").fontSize(20).text("TECHTRAFO", 50, 24);
  doc.fontSize(8).font("Helvetica").fillColor("#cbd5e1")
     .text("Reparación, mantenimiento y fabricación de transformadores eléctricos", 50, 50)
     .text("Samborondón — Ecuador  ·  panel.techtrafo.com", 50, 62);

  // Bloque derecho con tipo de documento + código
  doc.font("Helvetica-Bold").fontSize(14).fillColor("white")
     .text(meta.documento, w - 250, 22, { width: 200, align: "right" });
  doc.font("Helvetica").fontSize(10).fillColor("#cbd5e1")
     .text(meta.codigo, w - 250, 42, { width: 200, align: "right" })
     .text(meta.fecha.toLocaleDateString("es-EC"), w - 250, 56, { width: 200, align: "right" });

  doc.restore();

  // Pintar pie ANTES de resetear el cursor. El footer usa coordenadas absolutas
  // (h-28) pero PDFKit mueve doc.y al terminar text(), dejandolo cerca del bottom.
  // Si reseteamos doc.y a 110 ANTES del pie, el pie lo vuelve a llevar al bottom,
  // y la siguiente vez que el wrapper de texto agrega una pagina, queda en loop
  // infinito (Maximum call stack size exceeded). Hay que pintarlo primero y
  // resetear despues.
  pintarPie(doc, meta);

  // Reset cursor debajo de la cabecera (para el cuerpo)
  doc.y = 110;
}

function pintarPie(doc: InstanceType<typeof PDFDocument>, meta: PdfMeta): void {
  const w = doc.page.width;
  const h = doc.page.height;

  // BUG SUTIL: text() en y = h - 28 cae DEBAJO del bottom margin (h - 80).
  // PDFKit interpreta esto como overflow y dispara addPage internamente. Si esta
  // funcion se llama desde el listener pageAdded (lo que hacemos en cada pagina),
  // el ciclo addPage -> listener -> footer text -> overflow -> addPage es infinito
  // y produce "Maximum call stack size exceeded".
  // Workaround: bajar temporalmente el bottom margin a casi 0 mientras pintamos
  // el footer, y restaurarlo despues. Asi y = h - 28 queda DENTRO del area de
  // contenido y no dispara pagination.
  const origBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 5;

  doc.save();
  doc.rect(0, h - 40, w, 40).fill(COLORS.bgSoft);
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7)
     .text(
       `TECHTRAFO  ·  Documento generado automáticamente — nivel ${meta.nivel}  ·  ${meta.fecha.toLocaleString("es-EC")}`,
       50, h - 28, { width: w - 100, align: "center", lineBreak: false },
     );
  if (meta.nivel >= 3) {
    doc.fillColor(COLORS.warning).fontSize(7)
       .text("CONFIDENCIAL — Solo uso interno", 50, h - 18, { width: w - 100, align: "center", lineBreak: false });
  }
  doc.restore();

  doc.page.margins.bottom = origBottom;
}

// ===================================================================
// Helpers de layout
// ===================================================================
export function titulo(doc: InstanceType<typeof PDFDocument>, texto: string): void {
  doc.moveDown(0.5);
  doc.font("Helvetica-Bold").fontSize(13).fillColor(COLORS.brand).text(texto);
  doc.moveTo(50, doc.y + 2).lineTo(doc.page.width - 50, doc.y + 2).strokeColor(COLORS.rule).lineWidth(0.8).stroke();
  doc.moveDown(0.5);
}

export function subtitulo(doc: InstanceType<typeof PDFDocument>, texto: string): void {
  doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.brandSoft).text(texto);
  doc.moveDown(0.2);
}

export function parrafo(doc: InstanceType<typeof PDFDocument>, texto: string): void {
  doc.font("Helvetica").fontSize(10).fillColor("black").text(texto, { lineGap: 2 });
}

export interface FilaDato { label: string; valor: string | null | undefined }
export function bloqueDatos(doc: InstanceType<typeof PDFDocument>, filas: FilaDato[], cols = 2): void {
  const startY = doc.y;
  const colW = (doc.page.width - 100) / cols;
  const rowH = 14;
  let col = 0;
  let row = 0;
  filas.forEach((f) => {
    const x = 50 + col * colW;
    const y = startY + row * rowH;
    doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted).text(`${f.label}:`, x, y, { width: 90, continued: false });
    doc.font("Helvetica-Bold").fontSize(9).fillColor("black").text(f.valor ?? "—", x + 95, y, { width: colW - 100 });
    col++;
    if (col >= cols) { col = 0; row++; }
  });
  doc.y = startY + (row + (col > 0 ? 1 : 0)) * rowH + 6;
}

export interface ColumnaTabla<T> {
  label: string;
  width: number;          // pixels (suma total = page.width - 100)
  align?: "left" | "right" | "center";
  bold?: boolean;
  render: (item: T) => string;
}
export function tablaSimple<T>(doc: InstanceType<typeof PDFDocument>, cols: ColumnaTabla<T>[], items: T[]): void {
  const startX = 50;
  const headerH = 18;
  // Header
  doc.save();
  doc.rect(startX, doc.y, doc.page.width - 100, headerH).fill(COLORS.brand);
  let x = startX;
  cols.forEach((c) => {
    doc.fillColor("white").font("Helvetica-Bold").fontSize(8)
       .text(c.label, x + 4, doc.y + 5, { width: c.width - 8, align: c.align ?? "left" });
    x += c.width;
  });
  doc.restore();
  doc.y += headerH;

  // Filas
  items.forEach((item, idx) => {
    if (doc.y > doc.page.height - 100) doc.addPage();
    const yStart = doc.y;
    // Fondo zebra
    if (idx % 2 === 1) {
      doc.save();
      doc.rect(startX, yStart, doc.page.width - 100, 16).fill(COLORS.bgSoft);
      doc.restore();
    }
    let cx = startX;
    cols.forEach((c) => {
      doc.fillColor("black").font(c.bold ? "Helvetica-Bold" : "Helvetica").fontSize(9)
         .text(c.render(item), cx + 4, yStart + 3, { width: c.width - 8, align: c.align ?? "left" });
      cx += c.width;
    });
    doc.y = yStart + 16;
  });

  // Linea de cierre
  doc.moveTo(startX, doc.y).lineTo(startX + (doc.page.width - 100), doc.y).strokeColor(COLORS.rule).lineWidth(0.5).stroke();
  doc.moveDown(0.5);
}

export function totalDestacado(doc: InstanceType<typeof PDFDocument>, label: string, valor: string): void {
  const w = doc.page.width;
  doc.moveDown(0.5);
  doc.save();
  doc.rect(w - 280, doc.y, 230, 28).fill(COLORS.primary);
  doc.fillColor("white").font("Helvetica-Bold").fontSize(11).text(label, w - 270, doc.y - 22, { continued: true, width: 110 });
  doc.fontSize(13).text(valor, { align: "right", width: 110 });
  doc.restore();
  doc.moveDown(2);
}

export function nivelBadge(nivel: Nivel): string {
  return `Nivel ${nivel}: ${nivel === 1 ? "cliente — resumen" : nivel === 2 ? "cliente — detalle completo" : nivel === 3 ? "interno — comercial" : "interno — auditoría completa"}`;
}
