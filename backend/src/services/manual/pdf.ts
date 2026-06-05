/**
 * Genera el PDF del Manual de Procesos a partir de un objeto Manual
 * (mismo motor pdfkit que el resto de documentos TECHTRAFO). La misma
 * fuente alimenta la vista in-panel y este PDF -> nunca se contradicen.
 */
import { crearDocumento, titulo, subtitulo, parrafo, bloqueDatos, tablaSimple } from "../pdf/base";
import type { Manual, ManualEtapa } from "./armar";

export function generarManualPdf(manual: Manual) {
  const doc = crearDocumento({
    documento: "MANUAL DE PROCESOS",
    codigo: "TECHTRAFO",
    fecha: new Date(),
    nivel: 1,
    subtitulo: "Como opera el panel — generado del sistema",
  });

  // 1. Resumen ejecutivo
  titulo(doc, "1. Resumen ejecutivo");
  manual.resumen.forEach((p) => parrafo(doc, p));

  // Pipeline completo (tabla de overview)
  titulo(doc, "Pipeline completo (orden de ejecucion)");
  tablaSimple<ManualEtapa>(doc, [
    { label: "#", width: 34, align: "center", render: (r) => r.orden },
    { label: "Etapa", width: 150, render: (r) => r.nombre },
    { label: "Responsable / aprueba", width: 170, render: (r) => (r.aprueba ? `aprueba ${r.aprueba}` : r.responsable) },
    { label: "SLA", width: 56, align: "right", render: (r) => r.sla },
    { label: "Cliente", width: 50, align: "center", render: (r) => (r.visible_cliente ? "Si" : "No") },
  ], manual.pipeline);

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

  // Matriz de roles (lista wrap-safe, no tabla de altura fija)
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
