import { api } from "./api";
import type { DatosInspeccion, Recomendacion } from "./visitas-tecnicas";

export type DecisionTecnica = "reparar" | "reconstruir" | "mantenimiento" | "no_viable";
export type EstadoInforme = "borrador" | "en_revision" | "aprobado" | "rechazado";

export interface InformeTecnico {
  id: number;
  expediente_id: number;
  hito_id: number | null;
  visita_id: number | null;
  numero: string;
  diagnostico_completo: string | null;
  decision_tecnica: DecisionTecnica | null;
  justificacion: string | null;
  archivo_pdf_url: string | null;
  estado: EstadoInforme;
  datos_inspeccion: DatosInspeccion | null;
  fecha_aprobacion: string | null;
  created_at: string;
  expedientes?: { id: number; codigo: string; clientes?: { razon_social: string } | null };
  visitas_tecnicas?: {
    id: number;
    fecha_realizada: string | null;
    ubicacion_tipo: string;
    hallazgos: string | null;
  } | null;
}

export async function getInforme(id: number): Promise<{ data: InformeTecnico }> {
  return api.get(`/api/informes-tecnicos/${id}`);
}

export async function updateInforme(id: number, payload: {
  diagnostico_completo?: string | null;
  decision_tecnica?: DecisionTecnica | Recomendacion | null;
  justificacion?: string | null;
  estado?: EstadoInforme;
  datos_inspeccion?: DatosInspeccion | null;
}): Promise<{ data: InformeTecnico }> {
  return api.patch(`/api/informes-tecnicos/${id}`, payload);
}

export async function enviarInformePorEmail(id: number, payload: {
  to: string;
  cc?: string;
  asunto?: string;
  mensaje?: string;
  nivel?: 1 | 2 | 3 | 4;
}): Promise<{ status: string; message_id: string | null; destinatario: string; adjunto_kb: number }> {
  return api.post(`/api/informes-tecnicos/${id}/enviar-email`, payload);
}
