"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  DecisionTecnica, EstadoInforme, InformeTecnico, updateInforme,
} from "@/lib/informes-tecnicos";
import type { DatosInspeccion } from "@/lib/visitas-tecnicas";
import { ApiError } from "@/lib/api";

/**
 * Form estandarizado del informe tecnico.
 *
 * El informe vive sobre `datos_inspeccion JSONB`, donde coexisten:
 *   - Keys heredadas de la visita (estado_general, voltaje_*, hallazgos[], etc.)
 *   - Keys propias del informe (causa_raiz, severidad, trabajos_requeridos[], etc.)
 *
 * Pablo: "campos basicos, luego le daremos forma con data real".
 */

const COMPONENTES_OPCIONES: Array<{ key: string; label: string }> = [
  { key: "bobinado_primario",   label: "Bobinado primario" },
  { key: "bobinado_secundario", label: "Bobinado secundario" },
  { key: "nucleo",              label: "Núcleo" },
  { key: "aceite",              label: "Aceite dieléctrico" },
  { key: "bushings",            label: "Bushings / aisladores" },
  { key: "tanque",              label: "Tanque" },
  { key: "radiadores",          label: "Radiadores" },
  { key: "conmutador",          label: "Conmutador de tomas" },
  { key: "terminales",          label: "Terminales" },
  { key: "gabinete_control",    label: "Gabinete de control" },
];

const TRABAJOS_OPCIONES: Array<{ key: string; label: string }> = [
  { key: "rebobinado_total",          label: "Rebobinado total" },
  { key: "rebobinado_parcial",        label: "Rebobinado parcial" },
  { key: "cambio_aceite",             label: "Cambio de aceite" },
  { key: "filtrado_aceite",           label: "Filtrado de aceite" },
  { key: "reposicion_silica_gel",     label: "Reposición de sílica gel" },
  { key: "reparacion_tanque",         label: "Reparación de tanque" },
  { key: "pintura_externa",           label: "Pintura externa" },
  { key: "cambio_bushings",           label: "Cambio de bushings" },
  { key: "prueba_relacion_trafo",     label: "Prueba relación de transformación" },
  { key: "prueba_aislamiento",        label: "Prueba de aislamiento" },
  { key: "limpieza_general",          label: "Limpieza general" },
  { key: "ajuste_conexiones",         label: "Ajuste de conexiones" },
];

interface Props {
  informe: InformeTecnico;
  onSaved: (informe: InformeTecnico) => void;
  onCancel: () => void;
}

export function InformeTecnicoForm({ informe, onSaved, onCancel }: Props) {
  const di = (informe.datos_inspeccion ?? {}) as Record<string, unknown>;

  // Decision / texto libre (campos top-level del informe)
  const [decisionTecnica, setDecisionTecnica] = useState<DecisionTecnica | "">(
    informe.decision_tecnica ?? "",
  );
  const [justificacion, setJustificacion] = useState<string>(informe.justificacion ?? "");
  const [diagnostico, setDiagnostico] = useState<string>(informe.diagnostico_completo ?? "");
  const [estado, setEstado] = useState<EstadoInforme>(informe.estado);

  // Campos especificos del informe sobre datos_inspeccion
  const [causaRaiz, setCausaRaiz] = useState<string>((di.causa_raiz as string) ?? "");
  const [severidad, setSeveridad] = useState<string>((di.severidad as string) ?? "");
  const [componentes, setComponentes] = useState<string[]>((di.componentes_afectados as string[]) ?? []);
  const [vidaUtil, setVidaUtil] = useState<string>((di.vida_util_restante as string) ?? "");
  const [riesgo, setRiesgo] = useState<string>((di.riesgo_si_no_actuar as string) ?? "");
  const [trabajos, setTrabajos] = useState<string[]>((di.trabajos_requeridos as string[]) ?? []);
  const [repuestosLocales, setRepuestosLocales] = useState<string>(
    di.repuestos_locales === true ? "si" : di.repuestos_locales === false ? "no" : "",
  );
  const [tiempoAprovisionamiento, setTiempoAprovisionamiento] = useState<string>(
    di.tiempo_aprovisionamiento_dias?.toString() ?? "",
  );
  const [tiempoEstimadoDias, setTiempoEstimadoDias] = useState<string>(
    di.tiempo_estimado_dias?.toString() ?? "",
  );
  const [costoRango, setCostoRango] = useState<string>((di.costo_estimado_rango as string) ?? "");

  const [saving, setSaving] = useState(false);

  function toggleComponente(key: string) {
    setComponentes((p) => p.includes(key) ? p.filter((x) => x !== key) : [...p, key]);
  }
  function toggleTrabajo(key: string) {
    setTrabajos((p) => p.includes(key) ? p.filter((x) => x !== key) : [...p, key]);
  }
  function num(s: string): number | undefined {
    if (s.trim() === "") return undefined;
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  }

  async function handleGuardar(nuevoEstado?: EstadoInforme) {
    if (!decisionTecnica) {
      toast.error("Falta la decisión técnica");
      return;
    }
    // Mezclamos los campos existentes (heredados de la visita) con los del informe
    const datos: DatosInspeccion = {
      ...(informe.datos_inspeccion ?? {}),
      causa_raiz: causaRaiz || undefined,
      severidad: severidad || undefined,
      componentes_afectados: componentes.length > 0 ? componentes : undefined,
      vida_util_restante: vidaUtil || undefined,
      riesgo_si_no_actuar: riesgo || undefined,
      trabajos_requeridos: trabajos.length > 0 ? trabajos : undefined,
      repuestos_locales: repuestosLocales === "" ? undefined : repuestosLocales === "si",
      tiempo_aprovisionamiento_dias: num(tiempoAprovisionamiento),
      tiempo_estimado_dias: num(tiempoEstimadoDias),
      costo_estimado_rango: costoRango || undefined,
    } as DatosInspeccion;

    setSaving(true);
    try {
      const res = await updateInforme(informe.id, {
        diagnostico_completo: diagnostico.trim() || null,
        decision_tecnica: decisionTecnica,
        justificacion: justificacion.trim() || null,
        datos_inspeccion: datos,
        estado: nuevoEstado ?? estado,
      });
      toast.success(
        nuevoEstado === "en_revision" ? "Informe enviado a revisión"
        : nuevoEstado === "aprobado"  ? "Informe aprobado"
        : "Cambios guardados",
      );
      onSaved(res.data);
    } catch (err) {
      const code = err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error";
      toast.error(code);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Diagnostico */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Diagnóstico</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Causa raíz</Label>
            <Select value={causaRaiz} onValueChange={setCausaRaiz}>
              <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="falla_aislamiento">Falla de aislamiento</SelectItem>
                <SelectItem value="sobrecarga_termica">Sobrecarga térmica</SelectItem>
                <SelectItem value="falla_mecanica">Falla mecánica</SelectItem>
                <SelectItem value="contaminacion_aceite">Contaminación del aceite</SelectItem>
                <SelectItem value="oxidacion">Oxidación / corrosión</SelectItem>
                <SelectItem value="envejecimiento_normal">Envejecimiento normal</SelectItem>
                <SelectItem value="falla_externa">Falla externa (red / rayo)</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Severidad</Label>
            <Select value={severidad} onValueChange={setSeveridad}>
              <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="leve">Leve</SelectItem>
                <SelectItem value="moderada">Moderada</SelectItem>
                <SelectItem value="grave">Grave</SelectItem>
                <SelectItem value="critica">Crítica</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label>Componentes afectados</Label>
          <div className="grid grid-cols-2 gap-2">
            {COMPONENTES_OPCIONES.map((c) => (
              <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded border px-2 py-1.5 text-sm hover:bg-accent">
                <input type="checkbox" checked={componentes.includes(c.key)} onChange={() => toggleComponente(c.key)} />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
        </div>
      </section>

      {/* Pronostico */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Pronóstico</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Vida útil restante estimada</Label>
            <Select value={vidaUtil} onValueChange={setVidaUtil}>
              <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="menos_1_anio">&lt; 1 año</SelectItem>
                <SelectItem value="1_3_anios">1 – 3 años</SelectItem>
                <SelectItem value="3_5_anios">3 – 5 años</SelectItem>
                <SelectItem value="mas_5_anios">&gt; 5 años</SelectItem>
                <SelectItem value="indeterminado">Indeterminado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Riesgo si no se actúa</Label>
            <Select value={riesgo} onValueChange={setRiesgo}>
              <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bajo">Bajo</SelectItem>
                <SelectItem value="medio">Medio</SelectItem>
                <SelectItem value="alto">Alto</SelectItem>
                <SelectItem value="critico">Crítico</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* Trabajos requeridos */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Trabajos requeridos</h3>
        <div className="grid grid-cols-2 gap-2">
          {TRABAJOS_OPCIONES.map((t) => (
            <label key={t.key} className="flex cursor-pointer items-center gap-2 rounded border px-2 py-1.5 text-sm hover:bg-accent">
              <input type="checkbox" checked={trabajos.includes(t.key)} onChange={() => toggleTrabajo(t.key)} />
              <span>{t.label}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Estimaciones */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Estimaciones</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Repuestos locales</Label>
            <Select value={repuestosLocales} onValueChange={setRepuestosLocales}>
              <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="si">Sí (stock o mercado local)</SelectItem>
                <SelectItem value="no">No (importación)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tap">Tiempo aprovisionamiento (días)</Label>
            <Input id="tap" type="number" min="0" value={tiempoAprovisionamiento}
              onChange={(e) => setTiempoAprovisionamiento(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ted">Tiempo estimado trabajo (días)</Label>
            <Input id="ted" type="number" min="0" value={tiempoEstimadoDias}
              onChange={(e) => setTiempoEstimadoDias(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Rango de costo estimado (USD)</Label>
            <Select value={costoRango} onValueChange={setCostoRango}>
              <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="menor_5000">&lt; 5.000</SelectItem>
                <SelectItem value="5000_15000">5.000 – 15.000</SelectItem>
                <SelectItem value="15000_50000">15.000 – 50.000</SelectItem>
                <SelectItem value="mayor_50000">&gt; 50.000</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* Decision final */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Decisión técnica</h3>
        <div className="space-y-1">
          <Label>Recomendación final *</Label>
          <Select value={decisionTecnica} onValueChange={(v) => setDecisionTecnica(v as DecisionTecnica)}>
            <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="reparar">Reparar</SelectItem>
              <SelectItem value="reconstruir">Reconstruir</SelectItem>
              <SelectItem value="mantenimiento">Mantenimiento</SelectItem>
              <SelectItem value="no_viable">No viable</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Justificación</Label>
          <Textarea rows={3} value={justificacion} onChange={(e) => setJustificacion(e.target.value)}
            placeholder="Razón técnica de la decisión, evidencia, normativa..." />
        </div>
        <div className="space-y-1">
          <Label>Diagnóstico completo (narrativa)</Label>
          <Textarea rows={5} value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)}
            placeholder="Descripción técnica detallada, antecedentes, observaciones..." />
        </div>
      </section>

      {/* Footer de acciones */}
      <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
        <Button variant="outline" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button variant="outline" onClick={() => handleGuardar()} disabled={saving || !decisionTecnica}>
          {saving ? "Guardando..." : "Guardar borrador"}
        </Button>
        {estado === "borrador" && (
          <Button onClick={() => handleGuardar("en_revision")} disabled={saving || !decisionTecnica}>
            {saving ? "Guardando..." : "Enviar a revisión"}
          </Button>
        )}
      </div>
    </div>
  );
}
