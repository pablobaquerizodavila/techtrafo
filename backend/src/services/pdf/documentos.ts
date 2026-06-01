/**
 * Generadores de PDF por tipo de documento (4.6).
 * Cada función recibe la entidad ya cargada con sus joins y un nivel ya
 * resuelto, y escribe el contenido en el doc pasado.
 */
import PDFDocument from "pdfkit";
import {
  COLORS, FilaDato, Nivel, ColumnaTabla,
  bloqueDatos, parrafo, subtitulo, tablaSimple, titulo, totalDestacado,
} from "./base";

type Doc = InstanceType<typeof PDFDocument>;

function fmtMoney(v: number | string | null | undefined): string {
  const n = v == null ? 0 : Number(v);
  return `USD ${n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("es-EC");
}

// ===================================================================
// COTIZACION
// ===================================================================
export interface DataCotizacion {
  codigo: string; fecha_emision: Date | string; fecha_validez: Date | string | null;
  tipo_servicio: string; estado: string; revision_actual: number;
  subtotal: string; iva_porcentaje: string | number; iva_valor: string; descuento_global: string; total: string;
  margen_porcentaje: string | number | null;
  condiciones_pago: string | null; tiempo_entrega: string | null;
  observaciones: string | null; notas_internas: string | null;
  clientes: { razon_social: string; ruc_cedula: string; direccion_fiscal: string | null; email: string | null; telefono: string | null };
  cotizacion_lineas: Array<{
    orden: number; descripcion: string; cantidad: string; unidad_medida: string;
    precio_unitario: string; descuento_linea_porcentaje: string; subtotal_linea: string;
    costo_unitario: string | null;
    pendiente_aprovisionamiento?: boolean;
    tiempo_aprovisionamiento_dias?: number | null;
    categoria?: string | null;
  }>;
  cotizacion_revisiones?: Array<{ revision: number; created_at: Date | string; motivo: string | null }>;
}

export function renderCotizacion(doc: Doc, cot: DataCotizacion, nivel: Nivel): void {
  // Bloque cliente
  titulo(doc, "Cliente");
  bloqueDatos(doc, [
    { label: "Razón social", valor: cot.clientes.razon_social },
    { label: "RUC / cédula", valor: cot.clientes.ruc_cedula },
    { label: "Dirección", valor: cot.clientes.direccion_fiscal },
    { label: "Email", valor: cot.clientes.email },
    { label: "Teléfono", valor: cot.clientes.telefono },
    { label: "Tipo de servicio", valor: cot.tipo_servicio.replace(/^./, (c) => c.toUpperCase()) },
  ]);

  // Bloque fechas + estado
  titulo(doc, "Datos de la cotización");
  bloqueDatos(doc, [
    { label: "Emitida", valor: fmtDate(cot.fecha_emision) },
    { label: "Válida hasta", valor: fmtDate(cot.fecha_validez) },
    { label: "Estado", valor: cot.estado.toUpperCase() },
    { label: "Revisión", valor: String(cot.revision_actual) },
  ]);

  // Tabla de lineas (N>=2)
  if (nivel >= 2) {
    titulo(doc, "Detalle del servicio");
    const cols: ColumnaTabla<DataCotizacion["cotizacion_lineas"][0]>[] = [
      { label: "#", width: 25, align: "center", render: (l) => String(l.orden) },
      { label: "Descripción", width: 220, render: (l) => {
        // Marcar lineas pendientes de aprovisionamiento con un asterisco
        const prefix = l.pendiente_aprovisionamiento ? "* " : "";
        return `${prefix}${l.descripcion}`;
      }},
      { label: "Cant.", width: 50, align: "right", render: (l) => Number(l.cantidad).toFixed(2) },
      { label: "Unidad", width: 45, align: "center", render: (l) => l.unidad_medida },
      { label: "P. Unit.", width: 65, align: "right", render: (l) => fmtMoney(l.precio_unitario) },
      { label: "Desc%", width: 40, align: "right", render: (l) => `${Number(l.descuento_linea_porcentaje).toFixed(0)}%` },
      { label: "Subtotal", width: 60, align: "right", bold: true, render: (l) => fmtMoney(l.subtotal_linea) },
    ];
    tablaSimple(doc, cols, cot.cotizacion_lineas);

    // Aviso de aprovisionamiento si hay lineas marcadas
    const pendientes = cot.cotizacion_lineas.filter((l) => l.pendiente_aprovisionamiento);
    if (pendientes.length > 0) {
      const maxDias = Math.max(...pendientes.map((l) => l.tiempo_aprovisionamiento_dias ?? 0));
      doc.moveDown(0.3);
      doc.font("Helvetica-Oblique").fontSize(8).fillColor(COLORS.warning)
         .text(
           `* ${pendientes.length} línea${pendientes.length === 1 ? "" : "s"} sujeta${pendientes.length === 1 ? "" : "s"} a aprovisionamiento. ` +
           `El tiempo de entrega total contempla un período adicional de hasta ${maxDias} día${maxDias === 1 ? "" : "s"} para conseguir el material en bodega.`,
           { width: doc.page.width - 100 },
         );
      doc.fillColor("black");
      doc.moveDown(0.3);
    }

    // N=3+: agregar columna de costo + margen
    if (nivel >= 3) {
      subtitulo(doc, "Análisis interno de margen");
      const ivaPct = Number(cot.iva_porcentaje);
      const margenCols: ColumnaTabla<DataCotizacion["cotizacion_lineas"][0]>[] = [
        { label: "#", width: 25, align: "center", render: (l) => String(l.orden) },
        { label: "Descripción", width: 220, render: (l) => l.descripcion },
        { label: "Costo U.", width: 70, align: "right", render: (l) => l.costo_unitario ? fmtMoney(l.costo_unitario) : "—" },
        { label: "Precio U.", width: 70, align: "right", render: (l) => fmtMoney(l.precio_unitario) },
        { label: "Margen U.", width: 70, align: "right", bold: true, render: (l) => {
          if (!l.costo_unitario) return "—";
          const m = Number(l.precio_unitario) - Number(l.costo_unitario);
          return fmtMoney(m);
        }},
        { label: "Margen %", width: 50, align: "right", render: (l) => {
          if (!l.costo_unitario || Number(l.precio_unitario) === 0) return "—";
          const m = (Number(l.precio_unitario) - Number(l.costo_unitario)) / Number(l.precio_unitario) * 100;
          return `${m.toFixed(1)}%`;
        }},
      ];
      tablaSimple(doc, margenCols, cot.cotizacion_lineas);
      doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted)
         .text(`IVA aplicado: ${ivaPct.toFixed(2)}%`, { align: "right" });
      doc.moveDown(0.5);
    }
  }

  // Resumen
  titulo(doc, "Resumen");
  if (nivel >= 2) {
    bloqueDatos(doc, [
      { label: "Subtotal", valor: fmtMoney(cot.subtotal) },
      { label: "Descuento global", valor: fmtMoney(cot.descuento_global) },
      { label: `IVA (${Number(cot.iva_porcentaje).toFixed(0)}%)`, valor: fmtMoney(cot.iva_valor) },
    ]);
  }
  totalDestacado(doc, "TOTAL", fmtMoney(cot.total));

  // Notas comerciales
  if (cot.condiciones_pago || cot.tiempo_entrega || cot.observaciones) {
    titulo(doc, "Condiciones comerciales");
    if (cot.condiciones_pago) { subtitulo(doc, "Forma de pago"); parrafo(doc, cot.condiciones_pago); doc.moveDown(0.3); }
    if (cot.tiempo_entrega)   { subtitulo(doc, "Tiempo de entrega"); parrafo(doc, cot.tiempo_entrega); doc.moveDown(0.3); }
    if (cot.observaciones)    { subtitulo(doc, "Observaciones"); parrafo(doc, cot.observaciones); doc.moveDown(0.3); }
  }

  // Notas internas (N>=3)
  if (nivel >= 3 && cot.notas_internas) {
    titulo(doc, "Notas internas (no visibles al cliente)");
    parrafo(doc, cot.notas_internas);
  }

  // Auditoria (N=4)
  if (nivel >= 4 && cot.cotizacion_revisiones && cot.cotizacion_revisiones.length > 0) {
    titulo(doc, "Historial de revisiones");
    tablaSimple(
      doc,
      [
        { label: "Rev.", width: 60, align: "center", render: (r) => String(r.revision) },
        { label: "Fecha", width: 120, render: (r) => new Date(r.created_at).toLocaleString("es-EC") },
        { label: "Motivo", width: 315, render: (r) => r.motivo ?? "—" },
      ],
      cot.cotizacion_revisiones,
    );
  }
}

// ===================================================================
// CONTRATO
// ===================================================================
export interface DataContrato {
  codigo: string; fecha_firma: Date | string | null; estado: string;
  monto_total: string; observaciones: string | null; notas_internas: string | null;
  clausulas?: string | null;
  clientes: {
    razon_social: string; ruc_cedula: string; direccion_fiscal: string | null;
    rep_legal_nombres?: string | null; rep_legal_apellidos?: string | null;
    rep_legal_cedula?: string | null; rep_legal_cargo?: string | null;
  };
  cotizaciones?: { codigo: string; total: string } | null;
  contrato_pagos?: Array<{
    numero: number; concepto: string; monto: string; fecha_vencimiento: Date | string;
    estado: string; fecha_pago: Date | string | null;
  }>;
}

export function renderContrato(doc: Doc, c: DataContrato, nivel: Nivel): void {
  titulo(doc, "Partes del contrato");
  const partes: FilaDato[] = [
    { label: "Cliente", valor: c.clientes.razon_social },
    { label: "RUC / cédula", valor: c.clientes.ruc_cedula },
    { label: "Dirección", valor: c.clientes.direccion_fiscal },
  ];
  const repNombre = [c.clientes.rep_legal_nombres, c.clientes.rep_legal_apellidos]
    .filter(Boolean).join(" ").trim();
  if (repNombre) {
    partes.push({ label: "Representante legal", valor: repNombre });
    if (c.clientes.rep_legal_cedula) partes.push({ label: "Cédula rep.", valor: c.clientes.rep_legal_cedula });
    if (c.clientes.rep_legal_cargo) partes.push({ label: "Cargo", valor: c.clientes.rep_legal_cargo });
  }
  partes.push(
    { label: "Cotización base", valor: c.cotizaciones?.codigo ?? "—" },
    { label: "Fecha de firma", valor: fmtDate(c.fecha_firma) },
    { label: "Estado", valor: c.estado.toUpperCase() },
  );
  bloqueDatos(doc, partes);

  totalDestacado(doc, "MONTO TOTAL", fmtMoney(c.monto_total));

  // Plan de pagos (N>=2)
  if (nivel >= 2 && c.contrato_pagos && c.contrato_pagos.length > 0) {
    titulo(doc, "Plan de pagos");
    const cols: ColumnaTabla<NonNullable<DataContrato["contrato_pagos"]>[0]>[] = [
      { label: "#", width: 25, align: "center", render: (p) => String(p.numero) },
      { label: "Concepto", width: 220, render: (p) => p.concepto },
      { label: "Vencimiento", width: 80, render: (p) => fmtDate(p.fecha_vencimiento) },
      { label: "Estado", width: 70, render: (p) => p.estado.toUpperCase() },
      { label: "Pagado", width: 70, render: (p) => fmtDate(p.fecha_pago) },
      { label: "Monto", width: 75, align: "right", bold: true, render: (p) => fmtMoney(p.monto) },
    ];
    tablaSimple(doc, cols, c.contrato_pagos);
  }

  if (c.clausulas && c.clausulas.trim()) {
    titulo(doc, "Cláusulas y condiciones");
    parrafo(doc, c.clausulas.trim());
  }
  if (c.observaciones) {
    titulo(doc, "Observaciones");
    parrafo(doc, c.observaciones);
  }
  if (nivel >= 3 && c.notas_internas) {
    titulo(doc, "Notas internas");
    parrafo(doc, c.notas_internas);
  }
}

// ===================================================================
// ORDEN DE TRABAJO
// ===================================================================
export interface DataOT {
  codigo: string | null; tipo_ruta: string; prioridad: string; estado: string;
  fecha_inicio_planeada: Date | string | null; fecha_fin_planeada: Date | string | null;
  fecha_inicio_real: Date | string | null; fecha_fin_real: Date | string | null;
  descripcion: string | null; observaciones: string | null; notas_internas: string | null;
  contratos: {
    codigo: string;
    clientes: { razon_social: string; ruc_cedula: string };
  };
  transformadores: {
    codigo_interno: string | null; marca: string | null; modelo: string | null;
    numero_serie: string | null; tipo: string; capacidad_kva: number;
    tension_primaria_kv: string | number | null; tension_secundaria_v: number | null;
  } | null;
  usuarios_ot_responsable_idTousuarios: { nombres: string; apellidos: string } | null;
  ot_pasos: Array<{
    numero: number; nombre: string; es_gate: boolean; estado: string;
    fecha_inicio: Date | string | null; fecha_fin: Date | string | null;
    observaciones: string | null; resultado_gate: string | null;
    areas: { nombre: string } | null;
    usuarios_ot_pasos_ejecutado_porTousuarios: { nombres: string; apellidos: string } | null;
  }>;
}

export function renderOT(doc: Doc, ot: DataOT, nivel: Nivel): void {
  titulo(doc, "Orden de trabajo");
  bloqueDatos(doc, [
    { label: "Cliente", valor: ot.contratos.clientes.razon_social },
    { label: "RUC / cédula", valor: ot.contratos.clientes.ruc_cedula },
    { label: "Contrato", valor: ot.contratos.codigo },
    { label: "Tipo de ruta", valor: ot.tipo_ruta.replace(/^./, (c) => c.toUpperCase()) },
    { label: "Prioridad", valor: ot.prioridad.toUpperCase() },
    { label: "Estado", valor: ot.estado.toUpperCase() },
    { label: "Responsable", valor: ot.usuarios_ot_responsable_idTousuarios
        ? `${ot.usuarios_ot_responsable_idTousuarios.nombres} ${ot.usuarios_ot_responsable_idTousuarios.apellidos}`
        : "—" },
  ]);

  if (ot.transformadores) {
    titulo(doc, "Equipo");
    bloqueDatos(doc, [
      { label: "Código interno", valor: ot.transformadores.codigo_interno },
      { label: "Marca / Modelo", valor: `${ot.transformadores.marca ?? "—"} ${ot.transformadores.modelo ?? ""}`.trim() },
      { label: "Serie", valor: ot.transformadores.numero_serie },
      { label: "Tipo", valor: ot.transformadores.tipo.replace(/^./, (c) => c.toUpperCase()) },
      { label: "Capacidad", valor: ot.transformadores.capacidad_kva >= 1000
          ? `${(ot.transformadores.capacidad_kva / 1000).toFixed(0)} MVA`
          : `${ot.transformadores.capacidad_kva} kVA` },
      { label: "Tensión primaria", valor: ot.transformadores.tension_primaria_kv != null ? `${ot.transformadores.tension_primaria_kv} kV` : null },
      { label: "Tensión secundaria", valor: ot.transformadores.tension_secundaria_v != null ? `${ot.transformadores.tension_secundaria_v} V` : null },
    ]);
  }

  titulo(doc, "Cronograma");
  bloqueDatos(doc, [
    { label: "Inicio planeado", valor: fmtDate(ot.fecha_inicio_planeada) },
    { label: "Fin planeado", valor: fmtDate(ot.fecha_fin_planeada) },
    { label: "Inicio real", valor: fmtDate(ot.fecha_inicio_real) },
    { label: "Fin real", valor: fmtDate(ot.fecha_fin_real) },
  ]);

  if (ot.descripcion) {
    subtitulo(doc, "Descripción del trabajo");
    parrafo(doc, ot.descripcion);
    doc.moveDown(0.3);
  }

  // Pasos (N>=2)
  if (nivel >= 2) {
    titulo(doc, "Pasos de producción");
    const cols: ColumnaTabla<DataOT["ot_pasos"][0]>[] = [
      { label: "#", width: 25, align: "center", render: (p) => String(p.numero) + (p.es_gate ? "⚐" : "") },
      { label: "Paso", width: 200, render: (p) => p.nombre },
      { label: "Área", width: 90, render: (p) => p.areas?.nombre ?? "—" },
      { label: "Estado", width: 80, render: (p) => p.estado.toUpperCase() },
      { label: "Inicio", width: 60, render: (p) => fmtDate(p.fecha_inicio) },
      { label: "Fin", width: 60, render: (p) => fmtDate(p.fecha_fin) },
    ];
    tablaSimple(doc, cols, ot.ot_pasos);

    // N>=3: incluir resultados de gates y observaciones
    if (nivel >= 3) {
      const gates = ot.ot_pasos.filter((p) => p.es_gate && p.estado === "completado");
      if (gates.length > 0) {
        subtitulo(doc, "Resultados de gates de QA");
        gates.forEach((g) => {
          doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.brand)
             .text(`Paso ${g.numero} — ${g.nombre}`);
          doc.font("Helvetica").fontSize(9).fillColor("black")
             .text(`Resultado: ${(g.resultado_gate ?? "—").toUpperCase()}`)
             .text(`Aprobado por: ${g.usuarios_ot_pasos_ejecutado_porTousuarios
                ? `${g.usuarios_ot_pasos_ejecutado_porTousuarios.nombres} ${g.usuarios_ot_pasos_ejecutado_porTousuarios.apellidos}`
                : "—"}`);
          if (g.observaciones) doc.font("Helvetica-Oblique").fontSize(8).fillColor(COLORS.muted).text(g.observaciones);
          doc.moveDown(0.3);
        });
      }
    }
  }

  if (ot.observaciones) {
    titulo(doc, "Observaciones");
    parrafo(doc, ot.observaciones);
  }
  if (nivel >= 3 && ot.notas_internas) {
    titulo(doc, "Notas internas");
    parrafo(doc, ot.notas_internas);
  }
}

// ===================================================================
// INFORME TECNICO
// ===================================================================
export interface DataInformeTecnico {
  numero: string; estado: string;
  decision_tecnica: string | null;
  diagnostico_completo: string | null;
  justificacion: string | null;
  fecha_aprobacion: Date | string | null;
  datos_inspeccion?: Record<string, unknown> | null;
  expedientes: { codigo: string; clientes?: { razon_social: string } | null };
  visitas_tecnicas?: { fecha_realizada: Date | string | null; ubicacion_tipo: string; hallazgos: string | null } | null;
}

// Map de labels para los campos estandarizados del form de inspeccion.
// Cualquier clave no listada se ignora (forward compat con campos viejos).
const INSPECCION_FIELDS: Array<{ key: string; label: string; unit?: string }> = [
  { key: "estado_general",            label: "Estado general" },
  { key: "estado_aceite",             label: "Estado del aceite" },
  { key: "color_aceite",              label: "Color del aceite" },
  { key: "ruidos_anomalos",           label: "Ruidos anómalos" },
  { key: "temperatura_externa_c",     label: "Temperatura externa", unit: "°C" },
  { key: "resistencia_aislamiento_mohm", label: "Resistencia aislamiento", unit: "MΩ" },
  { key: "voltaje_primario_v",        label: "Voltaje primario", unit: "V" },
  { key: "voltaje_secundario_v",      label: "Voltaje secundario", unit: "V" },
];

// Campos especificos del informe (separados para renderizar en su propio bloque).
const DIAGNOSTICO_FIELDS: Array<{ key: string; label: string; unit?: string }> = [
  { key: "causa_raiz",          label: "Causa raíz" },
  { key: "severidad",           label: "Severidad" },
  { key: "vida_util_restante",  label: "Vida útil restante" },
  { key: "riesgo_si_no_actuar", label: "Riesgo si no se actúa" },
];

const ESTIMACION_FIELDS: Array<{ key: string; label: string; unit?: string }> = [
  { key: "repuestos_locales",              label: "Repuestos locales" },
  { key: "tiempo_aprovisionamiento_dias",  label: "Aprovisionamiento", unit: "días" },
  { key: "tiempo_estimado_dias",           label: "Tiempo de trabajo", unit: "días" },
  { key: "costo_estimado_rango",           label: "Rango de costo (USD)" },
];

function fmtCampo(v: unknown, unit?: string): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  const s = typeof v === "string" ? v.replace(/_/g, " ") : String(v);
  return unit ? `${s} ${unit}` : s;
}

export function renderInformeTecnico(doc: Doc, inf: DataInformeTecnico, nivel: Nivel): void {
  titulo(doc, "Informe técnico");
  bloqueDatos(doc, [
    { label: "Número", valor: inf.numero },
    { label: "Expediente", valor: inf.expedientes.codigo },
    { label: "Cliente", valor: inf.expedientes.clientes?.razon_social ?? "—" },
    { label: "Estado", valor: inf.estado.toUpperCase() },
    { label: "Decisión técnica", valor: inf.decision_tecnica?.replace(/^./, (c) => c.toUpperCase()) ?? "—" },
    { label: "Aprobado", valor: fmtDate(inf.fecha_aprobacion) },
  ]);

  if (inf.visitas_tecnicas) {
    titulo(doc, "Visita técnica");
    bloqueDatos(doc, [
      { label: "Fecha realizada", valor: fmtDate(inf.visitas_tecnicas.fecha_realizada) },
      { label: "Ubicación", valor: inf.visitas_tecnicas.ubicacion_tipo.replace("_", " ") },
    ]);
    if (inf.visitas_tecnicas.hallazgos) {
      subtitulo(doc, "Hallazgos en sitio");
      parrafo(doc, inf.visitas_tecnicas.hallazgos);
      doc.moveDown(0.3);
    }
  }

  // Datos estandarizados del formulario de inspeccion (JSONB).
  if (inf.datos_inspeccion && Object.keys(inf.datos_inspeccion).length > 0) {
    const di = inf.datos_inspeccion;

    // 1) Inspeccion (campos heredados de la visita)
    const filasInsp = INSPECCION_FIELDS
      .map((f) => ({ label: f.label, valor: fmtCampo(di[f.key], f.unit) }))
      .filter((f) => f.valor !== "—");
    if (filasInsp.length > 0) {
      titulo(doc, "Datos de inspección");
      bloqueDatos(doc, filasInsp, 2);
    }
    const hallazgosArr = di.hallazgos;
    if (Array.isArray(hallazgosArr) && hallazgosArr.length > 0) {
      subtitulo(doc, "Hallazgos detectados");
      parrafo(doc, hallazgosArr.map((h) => `• ${String(h).replace(/_/g, " ")}`).join("\n"));
      doc.moveDown(0.3);
    }

    // 2) Diagnostico estructurado (propio del informe)
    const filasDx = DIAGNOSTICO_FIELDS
      .map((f) => ({ label: f.label, valor: fmtCampo(di[f.key], f.unit) }))
      .filter((f) => f.valor !== "—");
    if (filasDx.length > 0) {
      titulo(doc, "Diagnóstico técnico");
      bloqueDatos(doc, filasDx, 2);
    }
    const componentes = di.componentes_afectados;
    if (Array.isArray(componentes) && componentes.length > 0) {
      subtitulo(doc, "Componentes afectados");
      parrafo(doc, componentes.map((c) => `• ${String(c).replace(/_/g, " ")}`).join("\n"));
      doc.moveDown(0.3);
    }

    // 3) Trabajos requeridos
    const trabajos = di.trabajos_requeridos;
    if (Array.isArray(trabajos) && trabajos.length > 0) {
      titulo(doc, "Trabajos requeridos");
      parrafo(doc, trabajos.map((t) => `• ${String(t).replace(/_/g, " ")}`).join("\n"));
      doc.moveDown(0.3);
    }

    // 4) Estimaciones (solo nivel 2+, no se muestra en resumen N1)
    if (nivel >= 2) {
      const filasEst = ESTIMACION_FIELDS
        .map((f) => ({ label: f.label, valor: fmtCampo(di[f.key], f.unit) }))
        .filter((f) => f.valor !== "—");
      if (filasEst.length > 0) {
        titulo(doc, "Estimaciones");
        bloqueDatos(doc, filasEst, 2);
      }
    }
  }

  if (inf.diagnostico_completo) {
    titulo(doc, "Diagnóstico");
    parrafo(doc, inf.diagnostico_completo);
  }
  if (inf.justificacion) {
    titulo(doc, "Justificación de la decisión");
    parrafo(doc, inf.justificacion);
  }

  // N>=3: bloque ejecutivo de recomendación
  if (nivel >= 3 && inf.decision_tecnica) {
    doc.moveDown(0.5);
    doc.save();
    doc.rect(50, doc.y, doc.page.width - 100, 30).fill(COLORS.primary);
    doc.fillColor("white").font("Helvetica-Bold").fontSize(11)
       .text(`RECOMENDACIÓN: ${inf.decision_tecnica.toUpperCase()}`, 60, doc.y - 22, { width: doc.page.width - 120 });
    doc.restore();
    doc.moveDown(2);
  }
}
