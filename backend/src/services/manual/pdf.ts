/**
 * Genera el PDF del Manual de Procesos a partir de un objeto Manual
 * (mismo motor pdfkit que el resto de documentos TECHTRAFO). La misma
 * fuente alimenta la vista in-panel y este PDF -> nunca se contradicen.
 *
 * Incluye un DIAGRAMA DE FLUJO dibujado (cajas + flechas + rombos de gate +
 * la bifurcacion de produccion).
 */
import { crearDocumento, titulo, subtitulo, parrafo, bloqueDatos, COLORS } from "../pdf/base";
import type { Manual, ManualEtapa } from "./armar";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Dibuja el diagrama de flujo vertical del pipeline operativo. */
function diagramaFlujo(doc: any, etapas: ManualEtapa[]): void {
  doc.addPage();
  titulo(doc, "Diagrama de flujo del proceso operativo");
  doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted)
    .text("Los nodos con rombo son puntos de aprobacion (gate). La produccion se bifurca segun el tipo de servicio.", { width: doc.page.width - 100 });
  doc.moveDown(0.7);

  const marginX = 50;
  const usableW = doc.page.width - marginX * 2;
  const boxW = 300;
  const boxX = marginX + (usableW - boxW) / 2;
  const cx = boxX + boxW / 2;
  const gap = 20;
  const pageBottom = () => doc.page.height - 55;
  let y = doc.y;

  const arrow = (fromY: number, toY: number, x: number) => {
    doc.save().strokeColor(COLORS.rule).lineWidth(1);
    doc.moveTo(x, fromY).lineTo(x, toY).stroke();
    doc.moveTo(x - 3, toY - 5).lineTo(x, toY).lineTo(x + 3, toY - 5).stroke();
    doc.restore();
  };

  const drawStage = (e: ManualEtapa) => {
    const isGate = !!e.aprueba;
    const h = 40;
    doc.save().lineWidth(isGate ? 1.3 : 1).strokeColor(isGate ? COLORS.warning : COLORS.brandSoft)
      .roundedRect(boxX, y, boxW, h, 6).stroke().restore();
    let tx = boxX + 12;
    if (isGate) {
      const dcx = boxX + 14, dcy = y + h / 2, r = 4;
      doc.save().fillColor(COLORS.warning)
        .moveTo(dcx, dcy - r).lineTo(dcx + r, dcy).lineTo(dcx, dcy + r).lineTo(dcx - r, dcy).fill().restore();
      tx = boxX + 26;
    }
    doc.fillColor(COLORS.brand).font("Helvetica-Bold").fontSize(9)
      .text(`${e.orden}. ${e.nombre}`, tx, y + 8, { width: boxX + boxW - 12 - tx });
    const meta = [
      isGate ? `aprueba ${e.aprueba}` : null,
      e.sla && e.sla !== "—" ? `SLA ${e.sla}` : null,
      e.visible_cliente ? "cliente ve" : "interno",
    ].filter(Boolean).join("   ·   ");
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7.5).text(meta, tx, y + 23, { width: boxX + boxW - 12 - tx });
    y += h;
  };

  const forkBranchH = (e: ManualEtapa) =>
    16 + Math.max(...((e.ramas || []).map((r) => r.pasos.length)), 1) * 10 + 8;

  const drawFork = (e: ManualEtapa) => {
    const ramas = e.ramas || [];
    const hh = 28;
    doc.save().lineWidth(1).roundedRect(boxX, y, boxW, hh, 6).fillAndStroke("#eef2ff", COLORS.primary).restore();
    doc.fillColor(COLORS.brand).font("Helvetica-Bold").fontSize(9).text(e.nombre, boxX + 12, y + 8, { width: boxW - 24 });
    y += hh;
    doc.save().strokeColor(COLORS.rule).lineWidth(1).moveTo(cx, y).lineTo(cx, y + 10).stroke().restore();
    y += 10;

    const n = ramas.length || 1;
    const bGap = 8;
    const bW = (usableW - (n - 1) * bGap) / n;
    const bH = forkBranchH(e);
    const busTop = y;
    const firstCx = marginX + bW / 2;
    const lastCx = marginX + (n - 1) * (bGap + bW) + bW / 2;

    doc.save().strokeColor(COLORS.rule).lineWidth(1);
    doc.moveTo(firstCx, busTop).lineTo(lastCx, busTop).stroke();
    doc.restore();

    ramas.forEach((r, idx) => {
      const bx = marginX + idx * (bGap + bW);
      const bcx = bx + bW / 2;
      doc.save().strokeColor(COLORS.rule).lineWidth(1).moveTo(bcx, busTop).lineTo(bcx, busTop + 8).stroke().restore();
      const by = busTop + 8;
      doc.save().lineWidth(1).strokeColor(COLORS.brandSoft).roundedRect(bx, by, bW, bH, 5).stroke().restore();
      doc.fillColor(COLORS.primary).font("Helvetica-Bold").fontSize(7.5).text(r.tipo.toUpperCase(), bx + 8, by + 6, { width: bW - 16 });
      let py = by + 17;
      r.pasos.forEach((p) => {
        doc.fillColor(COLORS.muted).font("Helvetica").fontSize(7).text(`• ${p}`, bx + 8, py, { width: bW - 16 });
        py += 10;
      });
    });

    // rejoin bus
    const branchBottom = busTop + 8 + bH;
    const bottomBus = branchBottom + 8;
    doc.save().strokeColor(COLORS.rule).lineWidth(1);
    ramas.forEach((r, idx) => {
      const bcx = marginX + idx * (bGap + bW) + bW / 2;
      doc.moveTo(bcx, branchBottom).lineTo(bcx, bottomBus).stroke();
    });
    doc.moveTo(firstCx, bottomBus).lineTo(lastCx, bottomBus).stroke();
    doc.restore();
    y = bottomBus;
  };

  for (let i = 0; i < etapas.length; i++) {
    const e = etapas[i];
    const nodeH = e.ramas ? (28 + 10 + 8 + forkBranchH(e) + 8) : 40;
    let broke = false;
    if (y + (i > 0 ? gap : 0) + nodeH > pageBottom()) { doc.addPage(); y = doc.y; broke = true; }
    if (i > 0 && !broke) { arrow(y, y + gap, cx); y += gap; }
    if (e.ramas) drawFork(e); else drawStage(e);
  }
  doc.y = y + 10;
}

export function generarManualPdf(manual: Manual) {
  const doc: any = crearDocumento({
    documento: "MANUAL DE PROCESOS",
    codigo: "TECHTRAFO",
    fecha: new Date(),
    nivel: 1,
    subtitulo: "Como opera el panel — generado del sistema",
  });

  // 1. Resumen ejecutivo
  titulo(doc, "1. Resumen ejecutivo");
  manual.resumen.forEach((p) => parrafo(doc, p));

  // Diagrama de flujo (pagina propia)
  diagramaFlujo(doc, manual.pipeline);

  // 2..N. Detalle por proceso
  let n = 2;
  manual.procesos.forEach((proc) => {
    doc.addPage();
    titulo(doc, `${n}. ${proc.titulo}`);
    parrafo(doc, proc.resumen);
    proc.etapas.forEach((e) => {
      if (doc.y > doc.page.height - 150) doc.addPage();
      subtitulo(doc, e.nombre);
      bloqueDatos(doc, [
        { label: "Quien lo hace", valor: e.responsable },
        { label: "Aprobacion", valor: e.aprueba ? e.aprueba : "Sin aprobacion" },
        { label: "Tiempo (SLA)", valor: e.sla },
        { label: "En el panel", valor: e.pantalla },
        { label: "Dispara", valor: e.dispara },
      ], 1);
      if (e.descripcion) parrafo(doc, e.descripcion);
    });
    n++;
  });

  // Matriz de roles (lista wrap-safe)
  doc.addPage();
  titulo(doc, `${n}. Matriz de roles (quien hace que)`);
  parrafo(doc, "Los accesos se derivan en vivo de los permisos de cada rol.");
  doc.fontSize(9);
  manual.roles.forEach((r) => {
    if (doc.y > doc.page.height - 90) doc.addPage();
    doc.font("Helvetica-Bold").fillColor("black").text(`${r.etiqueta}: `, { continued: true });
    doc.font("Helvetica").fillColor("black").text(`${r.funcion}  [Acceso: ${r.accesos.join(", ")}]`);
    doc.moveDown(0.35);
  });

  parrafo(doc, `Generado automaticamente desde el sistema el ${manual.generado.slice(0, 10)}. El pipeline, los SLA y los permisos reflejan el estado real del panel.`);

  return doc;
}
