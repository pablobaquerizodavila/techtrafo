/**
 * Detector de "drift" del Manual de Procesos: compara el SISTEMA REAL
 * (catalogo de hitos + roles + permisos en la base) contra la NARRATIVA
 * versionada (contenido.ts). Reporta lo que falta documentar o quedo obsoleto.
 *
 * Lo usan:
 *   - scripts/manual-drift.ts  (CLI para el skill `manual-doc`)
 *   - GET /api/manual/drift     (badge in-panel para admins)
 */
import { prisma } from "../../db/client";
import { HITO_NARRATIVA, ROL_NARRATIVA, PERMISO_LABEL } from "./contenido";

export interface DriftReport {
  hayDrift: boolean;
  total: number;
  /** Hitos activos en la DB que no tienen narrativa (agregar a HITO_NARRATIVA). */
  hitosSinNarrativa: string[];
  /** Entradas de HITO_NARRATIVA cuyo hito ya no existe (quitar). */
  narrativaHitoHuerfana: string[];
  /** Roles activos en la DB sin narrativa (agregar a ROL_NARRATIVA). */
  rolesSinNarrativa: string[];
  /** Entradas de ROL_NARRATIVA cuyo rol ya no existe (quitar). */
  narrativaRolHuerfana: string[];
  /** Modulos de permisos en uso sin etiqueta (agregar a PERMISO_LABEL). */
  permisosSinLabel: string[];
}

export async function detectarDrift(): Promise<DriftReport> {
  const [hitos, roles] = await Promise.all([
    prisma.$queryRaw<{ codigo: string }[]>`
      SELECT DISTINCT codigo FROM comercial.hito_plantillas WHERE activo`,
    prisma.$queryRaw<{ nombre: string; permisos: Record<string, boolean> }[]>`
      SELECT nombre, permisos FROM core.roles WHERE activo`,
  ]);

  const hitoCodigos = new Set(hitos.map((h) => h.codigo));
  const rolNombres = new Set(roles.map((r) => r.nombre));

  const hitosSinNarrativa = [...hitoCodigos].filter((c) => !HITO_NARRATIVA[c]).sort();
  const narrativaHitoHuerfana = Object.keys(HITO_NARRATIVA).filter((c) => !hitoCodigos.has(c)).sort();
  const rolesSinNarrativa = [...rolNombres].filter((n) => !ROL_NARRATIVA[n]).sort();
  const narrativaRolHuerfana = Object.keys(ROL_NARRATIVA).filter((n) => !rolNombres.has(n)).sort();

  const modulos = new Set<string>();
  for (const r of roles) {
    const p = r.permisos || {};
    for (const k of Object.keys(p)) if (p[k]) modulos.add(k.split(".")[0]);
  }
  const permisosSinLabel = [...modulos].filter((m) => !(m in PERMISO_LABEL)).sort();

  const total =
    hitosSinNarrativa.length + narrativaHitoHuerfana.length +
    rolesSinNarrativa.length + narrativaRolHuerfana.length + permisosSinLabel.length;

  return {
    hayDrift: total > 0,
    total,
    hitosSinNarrativa,
    narrativaHitoHuerfana,
    rolesSinNarrativa,
    narrativaRolHuerfana,
    permisosSinLabel,
  };
}
