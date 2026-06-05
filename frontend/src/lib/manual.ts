import { api } from "./api";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

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

export const getManual = () => api.get<{ data: Manual }>("/api/manual");

/** Descarga el PDF del manual (fetch con cookie de sesion -> blob -> download). */
export async function descargarManualPdf(): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/manual/pdf`, { credentials: "include" });
  if (!res.ok) throw new Error(`No se pudo generar el PDF (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "TECHTRAFO-manual-procesos.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
