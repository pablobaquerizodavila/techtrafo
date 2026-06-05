/**
 * CLI del detector de drift del Manual de Procesos.
 * Uso (dentro del container techtrafo-api):
 *   docker exec techtrafo-api npx ts-node --transpile-only /app/scripts/manual-drift.ts
 * Exit: 0 = sincronizado, 2 = hay drift, 1 = error.
 *
 * Lo invoca el skill `manual-doc` para listar que falta documentar.
 */
import { detectarDrift } from "../src/services/manual/drift";

(async () => {
  const d = await detectarDrift();

  if (!d.hayDrift) {
    console.log("OK — Manual sincronizado con el sistema (sin drift).");
    process.exit(0);
  }

  console.log(`DRIFT — ${d.total} elemento(s) a documentar:\n`);
  const secciones: [string, string[]][] = [
    ["Hitos SIN narrativa  -> agregar a HITO_NARRATIVA en contenido.ts", d.hitosSinNarrativa],
    ["Narrativa de hitos que YA NO EXISTEN  -> quitar de HITO_NARRATIVA", d.narrativaHitoHuerfana],
    ["Roles SIN narrativa  -> agregar a ROL_NARRATIVA", d.rolesSinNarrativa],
    ["Narrativa de roles que YA NO EXISTEN  -> quitar de ROL_NARRATIVA", d.narrativaRolHuerfana],
    ["Permisos SIN etiqueta  -> agregar a PERMISO_LABEL", d.permisosSinLabel],
  ];
  for (const [titulo, items] of secciones) {
    if (items.length) console.log(`• ${titulo}:\n    ${items.join(", ")}\n`);
  }
  process.exit(2);
})().catch((e) => {
  console.error("FALLO:", e);
  process.exit(1);
});
