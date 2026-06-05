/**
 * Contenido NARRATIVO del Manual de Procesos (fuente unica).
 *
 * Aca vive SOLO lo que NO esta en el codigo: el "como lo hace cada rol",
 * la pantalla del panel y que dispara cada paso. Las partes ESTRUCTURALES
 * (orden de hitos, SLA, quien aprueba, matriz de permisos) NO se escriben
 * aca: se leen EN VIVO de la base en armar.ts, asi el manual se mantiene
 * solo cuando cambia el catalogo de hitos o los permisos de un rol.
 *
 * >>> Al cambiar un proceso, actualiza este archivo en el MISMO commit. <<<
 */

export const RESUMEN: string[] = [
  "El panel TECHTRAFO ordena cada pedido en un EXPEDIENTE que avanza por etapas (hitos) en un orden fijo. Cada etapa tiene un responsable; algunas requieren la APROBACION de un rol especifico (gate) antes de continuar. El cliente sigue el avance en su PORTAL y aprueba su cotizacion ahi. El dashboard avisa cuando una etapa supera su tiempo objetivo (SLA).",
  "Flujo maestro (servicio comun): Captacion -> Validacion de credito -> Visita tecnica -> Informe tecnico -> Cotizacion -> Aprobacion del cliente -> Contrato -> Anticipo -> [Produccion segun tipo] -> Pruebas QA -> Entrega -> Garantia -> NPS.",
  "La produccion se ramifica segun el tipo de servicio: FABRICACION; REPARACION (recepcion fisica -> desmontaje -> reparacion); o MANTENIMIENTO (mantenimiento programado).",
];

export interface HitoNarrativa { responsable: string; pantalla: string; dispara: string; descripcion?: string }

/** Narrativa por codigo de hito. Si un hito nuevo no esta aca, el manual
 *  igual lo muestra con sus datos vivos (orden, SLA, aprobador). */
export const HITO_NARRATIVA: Record<string, HitoNarrativa> = {
  captacion: { responsable: "Ejecutivo comercial", pantalla: "Clientes -> Nuevo + Expedientes -> Nuevo", dispara: "Validacion de credito", descripcion: "Se registra el lead y el equipo/transformador del cliente." },
  validacion_credito: { responsable: "Ejecutivo comercial carga datos", pantalla: "Expediente -> hito 'Validacion de credito' -> Aprobar", dispara: "Visita tecnica", descripcion: "Gerencia comercial revisa el credito antes de invertir horas tecnicas." },
  visita_tecnica: { responsable: "Ingeniero de diagnostico", pantalla: "Visitas tecnicas / Expediente -> hito", dispara: "Informe tecnico", descripcion: "Se agenda y registra la visita al sitio del cliente." },
  informe_tecnico: { responsable: "Ingeniero de diagnostico redacta", pantalla: "Informes tecnicos -> Nuevo; Expediente -> hito Aprobar", dispara: "Cotizacion", descripcion: "Jefe de planta valida el alcance tecnico propuesto." },
  cotizacion: { responsable: "Ejecutivo comercial", pantalla: "Cotizaciones -> Nueva / Desde plantilla -> Enviar", dispara: "Aprobacion del cliente", descripcion: "Se emite la cotizacion (idealmente desde plantilla). Gerencia revisa si el margen es bajo." },
  aprobacion_cliente: { responsable: "El cliente", pantalla: "Portal -> Expediente -> Ver PDF / Aprobar / Rechazar", dispara: "Contrato (al aprobar avanza solo)", descripcion: "El cliente aprueba o rechaza desde su portal. Si rechaza, queda en espera de ajuste." },
  contrato: { responsable: "Comercial", pantalla: "Contratos -> Nuevo (desde la cotizacion aprobada)", dispara: "Anticipo", descripcion: "Se genera el contrato con la plantilla de clausulas y el plan de pagos." },
  anticipo: { responsable: "Cobranza", pantalla: "Contrato -> Plan de pagos -> Cobrar", dispara: "Produccion (segun tipo)", descripcion: "Se registra el anticipo. Recien con el anticipo cobrado arranca produccion." },
  recepcion_fisica: { responsable: "Jefe de planta", pantalla: "Expediente -> hito 'Recepcion fisica'", dispara: "Desmontaje", descripcion: "Solo REPARACION: se recibe fisicamente el equipo en planta." },
  fabricacion: { responsable: "Jefe de planta + tecnicos", pantalla: "Ordenes de trabajo (OT) / Dashboard planta", dispara: "Pruebas finales QA", descripcion: "Solo FABRICACION: se construye el transformador segun la OT." },
  desmontaje: { responsable: "Tecnico de planta", pantalla: "Ordenes de trabajo (OT) / Checklists", dispara: "Reparacion", descripcion: "Solo REPARACION: desarme y diagnostico de fallas." },
  reparacion: { responsable: "Tecnico de planta", pantalla: "Ordenes de trabajo (OT) / Checklists", dispara: "Pruebas finales QA", descripcion: "Solo REPARACION: reconstruccion del equipo." },
  pruebas_finales: { responsable: "QA", pantalla: "Expediente -> hito 'Pruebas finales' -> Aprobar", dispara: "Entrega", descripcion: "QA valida que el equipo cumple antes de entregar." },
  entrega: { responsable: "Coordinador tecnico", pantalla: "Expediente -> hito 'Entrega'", dispara: "Garantia activa", descripcion: "Se entrega el equipo y se firma el acta de entrega." },
  garantia_activa: { responsable: "QA / Garantias", pantalla: "Garantias", dispara: "Encuesta NPS", descripcion: "Periodo de garantia; se gestionan reclamos si los hay." },
  nps: { responsable: "Comercial", pantalla: "Expediente -> hito 'NPS'", dispara: "Cierre del expediente", descripcion: "Encuesta de satisfaccion al cliente." },
  mant_preventivo: { responsable: "Coordinador tecnico", pantalla: "Ordenes de trabajo (OT)", dispara: "Pruebas finales QA", descripcion: "Solo MANTENIMIENTO: mantenimiento programado del equipo." },
};

export interface ProcesoEtapaNarr { nombre: string; responsable: string; aprueba?: string; sla?: string; pantalla: string; dispara?: string; descripcion?: string }
export interface ProcesoNarr { clave: string; titulo: string; resumen: string; etapas: ProcesoEtapaNarr[] }

/** Procesos transversales (no derivan del catalogo de hitos). */
export const PROCESOS_NARRATIVA: ProcesoNarr[] = [
  {
    clave: "compras",
    titulo: "Compras (abastecimiento)",
    resumen: "Cuando falta material para una OT o el stock cae bajo el punto de reorden, se abastece via Solicitud -> Orden de compra -> Recepcion.",
    etapas: [
      { nombre: "1. Solicitud de compra (SC)", responsable: "Jefe de bodega / Comprador", pantalla: "Compras -> Solicitudes -> Nueva", dispara: "Orden de compra", descripcion: "Se pide el material requerido (manual o gatillado por stock bajo)." },
      { nombre: "2. Orden de compra (OC)", responsable: "Comprador", aprueba: "Jefe de compras / Gerencia (segun monto)", pantalla: "Compras -> Ordenes de compra -> Nueva", dispara: "Recepcion", descripcion: "Se elige proveedor y se emite la OC. La aprobacion es escalonada por monto." },
      { nombre: "3. Recepcion", responsable: "Jefe de bodega", pantalla: "Compras -> Recepciones", dispara: "Ingreso a inventario", descripcion: "Se recibe el material, se controla y entra al stock." },
    ],
  },
  {
    clave: "cobros",
    titulo: "Cobros (plan de pagos del contrato)",
    resumen: "Cada contrato tiene un plan de pagos (anticipo + hitos + saldo). Cobranza registra cada cobro; se puede editar o reversar con motivo.",
    etapas: [
      { nombre: "Registrar cobro", responsable: "Cobranza", pantalla: "Contrato -> Plan de pagos -> Cobrar", descripcion: "Se registra monto pagado, fecha y referencia. Actualiza el estado de la cuota." },
      { nombre: "Editar cobro", responsable: "Cobranza", pantalla: "Contrato -> Plan de pagos -> Editar", descripcion: "Ajusta el total pagado, la fecha o la referencia de una cuota ya cobrada." },
      { nombre: "Reversar cobro", responsable: "Cobranza", pantalla: "Contrato -> Plan de pagos -> Reversar", descripcion: "Devuelve la cuota a pendiente con motivo obligatorio. Se refleja en Finanzas." },
    ],
  },
  {
    clave: "finanzas",
    titulo: "Finanzas (consulta, solo lectura)",
    resumen: "Reportes en tiempo real para direccion y financiero: ingresos por tipo, cartera vencida, cobros y anticipos.",
    etapas: [
      { nombre: "Resumen financiero", responsable: "Financiero / Direccion", pantalla: "Finanzas -> Resumen", descripcion: "KPIs de contratado/cobrado/por cobrar + graficos por tipo, aging y tendencia." },
      { nombre: "Cartera vencida", responsable: "Financiero / Cobranza", pantalla: "Finanzas -> Cartera vencida", descripcion: "Detalle de cuotas vencidas por antiguedad, para gestion de cobro." },
      { nombre: "Cobros", responsable: "Financiero", pantalla: "Finanzas -> Cobros", descripcion: "Detalle de los cobros registrados en el periodo." },
    ],
  },
  {
    clave: "portal",
    titulo: "Portal del cliente",
    resumen: "El cliente accede a su portal para seguir el avance del expediente y aprobar su cotizacion.",
    etapas: [
      { nombre: "Seguir el expediente", responsable: "Cliente", pantalla: "Portal -> Mi cuenta -> Expediente", descripcion: "Ve el avance del pipeline (solo las etapas visibles al cliente)." },
      { nombre: "Aprobar / rechazar cotizacion", responsable: "Cliente", pantalla: "Portal -> Expediente -> Aprobar / Rechazar / Ver PDF", descripcion: "Aprueba o rechaza la cotizacion enviada; al aprobar, el proceso avanza solo." },
    ],
  },
];

export interface RolNarrativa { etiqueta: string; funcion: string }

/** Etiqueta legible + funcion por rol. Si un rol nuevo no esta aca, se
 *  muestra con su nombre tecnico y los accesos derivados de sus permisos. */
export const ROL_NARRATIVA: Record<string, RolNarrativa> = {
  presidencia: { etiqueta: "Presidencia", funcion: "Direccion general; acceso total y vista financiera." },
  gerencia_general: { etiqueta: "Gerencia general", funcion: "Direccion; acceso total y vista financiera." },
  gerencia_comercial: { etiqueta: "Gerencia comercial", funcion: "Dirige comercial; aprueba el credito; acceso total y finanzas." },
  ejecutivo_comercial: { etiqueta: "Ejecutivo comercial", funcion: "Capta leads y emite cotizaciones." },
  asistente_de_gerencia_comercial: { etiqueta: "Asistente de gerencia comercial", funcion: "Alta y edicion de clientes." },
  ingeniero_diagnostico: { etiqueta: "Ingeniero de diagnostico", funcion: "Visita, diagnostica e informa; aprueba su visita tecnica." },
  jefe_planta: { etiqueta: "Jefe de planta", funcion: "Dirige produccion/OT; aprueba informe tecnico y recepcion." },
  coordinador_tecnico: { etiqueta: "Coordinador tecnico", funcion: "Coordina las OT y la entrega." },
  tecnico_planta: { etiqueta: "Tecnico de planta", funcion: "Ejecuta las OT y sus checklists." },
  qa: { etiqueta: "QA", funcion: "Pruebas finales y garantias; aprueba el hito de QA." },
  cobranza: { etiqueta: "Cobranza", funcion: "Registra cobros y gestiona la cartera." },
  financiero: { etiqueta: "Financiero", funcion: "Consulta reportes financieros (solo lectura)." },
  jefe_compras: { etiqueta: "Jefe de compras", funcion: "Aprueba compras y gestiona proveedores." },
  comprador: { etiqueta: "Comprador", funcion: "Emite ordenes de compra y recibe material." },
  jefe_bodega: { etiqueta: "Jefe de bodega", funcion: "Gestiona bodega/inventario y recepciones." },
  auditor: { etiqueta: "Auditor", funcion: "Consulta transversal (solo lectura)." },
  cliente: { etiqueta: "Cliente", funcion: "Sigue su expediente y aprueba su cotizacion en el portal." },
  desarrollador_1: { etiqueta: "Desarrollador", funcion: "Soporte tecnico del sistema (rol interno de desarrollo)." },
};

/** Permiso (o su modulo base) -> etiqueta legible para la matriz de roles. */
export const PERMISO_LABEL: Record<string, string> = {
  all: "Acceso total",
  crm: "CRM", cotizaciones: "Cotizaciones", clientes: "Clientes", contratos: "Contratos",
  ot: "Ordenes de trabajo", planta: "Planta", checklists: "Checklists", checklists_propios: "Checklists",
  informes: "Informes", diagnostico: "Diagnostico", expedientes: "Expedientes",
  qa: "QA", garantias: "Garantias", caja: "Caja", cartera: "Cartera",
  bodega: "Bodega", inventario: "Inventario", movimientos: "Inventario",
  compras: "Compras", compras_basicas: "Compras", proveedores: "Proveedores",
  admin: "Administracion", reportes: "Reportes", finanzas: "Finanzas",
  portal: "Portal", portal_seguimiento: "Portal",
};
