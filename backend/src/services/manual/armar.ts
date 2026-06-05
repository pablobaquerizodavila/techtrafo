/**
 * Arma el Manual de Procesos combinando:
 *   - NARRATIVA (contenido.ts, versionada en el repo), y
 *   - DATOS VIVOS leidos de la base (catalogo de hitos + roles/permisos).
 *
 * Asi lo estructural (orden, SLA, quien aprueba, accesos por rol) se
 * autoactualiza: si agregas una etapa o cambias un permiso, el manual lo
 * refleja al instante sin tocar este archivo.
 */
import { prisma } from "../../db/client";
import { RESUMEN, HITO_NARRATIVA, PROCESOS_NARRATIVA, ROL_NARRATIVA, PERMISO_LABEL } from "./contenido";

export interface ManualEtapa {
  orden: string;
  codigo: string | null;
  nombre: string;
  tipo_servicio?: string;
  responsable: string;
  aprueba: string | null;
  sla: string;
  visible_cliente?: boolean;
  pantalla: string;
  dispara: string;
  descripcion?: string;
  /** Nombres tecnicos de los roles que ejecutan/aprueban (para vista "mi rol"). */
  roles: string[];
  /** Solo en el nodo sintetico de produccion: las ramas por tipo de servicio. */
  ramas?: { tipo: string; pasos: string[] }[];
}
export interface ManualProceso { clave: string; titulo: string; resumen: string; etapas: ManualEtapa[] }
export interface ManualRol { nombre: string; etiqueta: string; funcion: string; accesos: string[] }
export interface Manual {
  generado: string;
  resumen: string[];
  pipeline: ManualEtapa[];
  procesos: ManualProceso[];
  roles: ManualRol[];
}

interface HitoRow {
  orden: number; codigo: string; nombre: string; tipo_servicio: string;
  requiere_aprobacion: boolean; rol_aprobador: string | null;
  visible_cliente: boolean; sla_horas: number | null;
}
interface RolRow { nombre: string; es_super_admin: boolean; permisos: Record<string, boolean> }

function fmtSla(h: number | null): string {
  if (h === null || h === undefined) return "—";
  if (h % 24 === 0 && h >= 168) return `${h / 24} dias`;
  return `${h} h`;
}

function etiquetaRol(nombre: string | null): string {
  if (!nombre) return "—";
  return ROL_NARRATIVA[nombre]?.etiqueta ?? nombre;
}

function accesosDesdePermisos(permisos: Record<string, boolean>): string[] {
  const keys = Object.keys(permisos || {}).filter((k) => permisos[k]);
  if (keys.includes("all")) return ["Acceso total"];
  const labels = new Set<string>();
  for (const k of keys) {
    const base = k.split(".")[0];
    labels.add(PERMISO_LABEL[k] ?? PERMISO_LABEL[base] ?? base);
  }
  return Array.from(labels).sort();
}

export async function armarManual(): Promise<Manual> {
  const [hitos, roles] = await Promise.all([
    prisma.$queryRaw<HitoRow[]>`
      SELECT hp.orden, hp.codigo, hp.nombre, hp.tipo_servicio, hp.requiere_aprobacion,
             r.nombre AS rol_aprobador, hp.visible_cliente, hp.sla_horas
        FROM comercial.hito_plantillas hp
        LEFT JOIN core.roles r ON r.id = hp.rol_aprobador_id
       WHERE hp.activo
       ORDER BY hp.orden, hp.tipo_servicio`,
    prisma.$queryRaw<RolRow[]>`
      SELECT nombre, es_super_admin, permisos
        FROM core.roles
       WHERE activo
       ORDER BY id`,
  ]);

  const comun = hitos.filter((h) => h.tipo_servicio === "comun");
  const ramas = hitos.filter((h) => h.tipo_servicio !== "comun");

  const etapaDe = (h: HitoRow): ManualEtapa => {
    const n = HITO_NARRATIVA[h.codigo];
    const roles = new Set<string>(n?.roles ?? []);
    if (h.requiere_aprobacion && h.rol_aprobador) roles.add(h.rol_aprobador);
    return {
      orden: String(h.orden),
      codigo: h.codigo,
      nombre: h.nombre,
      tipo_servicio: h.tipo_servicio,
      responsable: n?.responsable ?? "—",
      aprueba: h.requiere_aprobacion ? etiquetaRol(h.rol_aprobador) : null,
      sla: fmtSla(h.sla_horas),
      visible_cliente: h.visible_cliente,
      pantalla: n?.pantalla ?? "—",
      dispara: n?.dispara ?? "—",
      descripcion: n?.descripcion,
      roles: Array.from(roles),
    };
  };

  // Backbone comun ordenado, con un nodo sintetico de Produccion tras "anticipo".
  const pipeline: ManualEtapa[] = [];
  for (const h of comun) {
    pipeline.push(etapaDe(h));
    if (h.codigo === "anticipo" && ramas.length) {
      const porTipo: Record<string, string[]> = {};
      for (const r of ramas) {
        if (!porTipo[r.tipo_servicio]) porTipo[r.tipo_servicio] = [];
        porTipo[r.tipo_servicio].push(r.nombre);
      }
      const detalle = Object.entries(porTipo)
        .map(([t, ns]) => `${t}: ${ns.join(" -> ")}`)
        .join("   |   ");
      pipeline.push({
        orden: "·",
        codigo: null,
        nombre: "Produccion (segun tipo de servicio)",
        responsable: "Jefe de planta + tecnicos",
        aprueba: null,
        sla: "variable",
        visible_cliente: true,
        pantalla: "Ordenes de trabajo (OT) / Dashboard planta",
        dispara: "Pruebas finales QA",
        descripcion: `La ruta depende del tipo de servicio. ${detalle}.`,
        roles: ["jefe_planta", "tecnico_planta", "coordinador_tecnico"],
        ramas: Object.entries(porTipo).map(([tipo, pasos]) => ({ tipo, pasos })),
      });
    }
  }

  const procesoOperativo: ManualProceso = {
    clave: "operativo",
    titulo: "Proceso operativo (ciclo del expediente)",
    resumen: "El recorrido completo de un pedido, de la captacion al cierre. El orden, los SLA y quien aprueba se leen del catalogo de hitos en vivo.",
    etapas: pipeline,
  };

  const procesosNarr: ManualProceso[] = PROCESOS_NARRATIVA.map((p) => ({
    clave: p.clave,
    titulo: p.titulo,
    resumen: p.resumen,
    etapas: p.etapas.map((e, i) => ({
      orden: String(i + 1),
      codigo: null,
      nombre: e.nombre,
      responsable: e.responsable,
      aprueba: e.aprueba ?? null,
      sla: e.sla ?? "—",
      pantalla: e.pantalla,
      dispara: e.dispara ?? "—",
      descripcion: e.descripcion,
      roles: e.roles ?? [],
    })),
  }));

  const rolesManual: ManualRol[] = roles.map((r) => ({
    nombre: r.nombre,
    etiqueta: ROL_NARRATIVA[r.nombre]?.etiqueta ?? r.nombre,
    funcion: ROL_NARRATIVA[r.nombre]?.funcion ?? "—",
    accesos: r.es_super_admin ? ["Acceso total"] : accesosDesdePermisos(r.permisos),
  }));

  return {
    generado: new Date().toISOString(),
    resumen: RESUMEN,
    pipeline,
    procesos: [procesoOperativo, ...procesosNarr],
    roles: rolesManual,
  };
}
