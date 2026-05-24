"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  DatosInspeccion, EstadoVisita, Recomendacion, UbicacionTipo,
  createVisita, updateVisita,
} from "@/lib/visitas-tecnicas";
import { ApiError } from "@/lib/api";

/**
 * Form estandarizado de visita tecnica. Si se pasa visitaId edita; sino crea.
 * Al guardar con estado=realizada auto-crea informe tecnico vinculado.
 *
 * Los campos son una propuesta inicial (Pablo dijo "luego lo iremos modificando").
 */

const HALLAZGOS_OPCIONES: Array<{ key: string; label: string }> = [
  { key: "fuga_aceite",           label: "Fuga de aceite" },
  { key: "oxido_visible",         label: "Óxido visible en carcasa" },
  { key: "conexiones_sueltas",    label: "Conexiones sueltas / corroídas" },
  { key: "ruido_anomalo",         label: "Ruido anómalo en operación" },
  { key: "vibracion_excesiva",    label: "Vibración excesiva" },
  { key: "sobrecalentamiento",    label: "Sobrecalentamiento aparente" },
  { key: "aislamiento_danado",    label: "Aislamiento dañado o agrietado" },
  { key: "silica_gel_saturada",   label: "Sílica gel saturada" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (info: { visitaId: number; informeCreadoId: number | null }) => void;
  expedienteId: number;
  hitoId?: number | null;
  // Si se pasa, edita esa visita; sino crea una nueva
  visita?: {
    id: number;
    fecha_realizada: string | null;
    ubicacion_tipo: UbicacionTipo;
    direccion: string | null;
    datos_inspeccion: DatosInspeccion | null;
    estado: EstadoVisita;
  };
}

export function VisitaTecnicaForm({ open, onClose, onSaved, expedienteId, hitoId, visita }: Props) {
  const editando = !!visita;
  const datosIniciales = visita?.datos_inspeccion ?? {};

  const [fechaRealizada, setFechaRealizada] = useState<string>(() => {
    if (visita?.fecha_realizada) return new Date(visita.fecha_realizada).toISOString().slice(0, 16);
    return new Date().toISOString().slice(0, 16);
  });
  const [ubicacion, setUbicacion] = useState<UbicacionTipo>(visita?.ubicacion_tipo ?? "sitio_cliente");
  const [direccion, setDireccion] = useState(visita?.direccion ?? "");

  // Datos de inspeccion estructurados
  const [estadoGeneral, setEstadoGeneral] = useState<string>((datosIniciales.estado_general as string) ?? "");
  const [estadoAceite, setEstadoAceite] = useState<string>((datosIniciales.estado_aceite as string) ?? "");
  const [colorAceite, setColorAceite] = useState<string>((datosIniciales.color_aceite as string) ?? "");
  const [ruidosAnomalos, setRuidosAnomalos] = useState<boolean>((datosIniciales.ruidos_anomalos as boolean) ?? false);
  const [tempExterna, setTempExterna] = useState<string>(datosIniciales.temperatura_externa_c?.toString() ?? "");
  const [resistAisl, setResistAisl] = useState<string>(datosIniciales.resistencia_aislamiento_mohm?.toString() ?? "");
  const [voltajePrim, setVoltajePrim] = useState<string>(datosIniciales.voltaje_primario_v?.toString() ?? "");
  const [voltajeSec, setVoltajeSec] = useState<string>(datosIniciales.voltaje_secundario_v?.toString() ?? "");
  const [hallazgos, setHallazgos] = useState<string[]>((datosIniciales.hallazgos as string[]) ?? []);
  const [recomendacion, setRecomendacion] = useState<Recomendacion | "">((datosIniciales.recomendacion as Recomendacion) ?? "");
  const [justificacion, setJustificacion] = useState<string>((datosIniciales.justificacion as string) ?? "");

  const [saving, setSaving] = useState(false);

  function toggleHallazgo(key: string) {
    setHallazgos((prev) => prev.includes(key) ? prev.filter((h) => h !== key) : [...prev, key]);
  }

  function num(s: string): number | undefined {
    if (s.trim() === "") return undefined;
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  }

  async function handleSubmit(marcarRealizada: boolean) {
    if (!recomendacion) {
      toast.error("Falta la recomendación");
      return;
    }
    const datos: DatosInspeccion = {
      estado_general: estadoGeneral || undefined,
      estado_aceite: estadoAceite || undefined,
      color_aceite: colorAceite || undefined,
      ruidos_anomalos: ruidosAnomalos,
      temperatura_externa_c: num(tempExterna),
      resistencia_aislamiento_mohm: num(resistAisl),
      voltaje_primario_v: num(voltajePrim),
      voltaje_secundario_v: num(voltajeSec),
      hallazgos: hallazgos.length > 0 ? hallazgos : undefined,
      recomendacion,
      justificacion: justificacion.trim() || undefined,
    };

    setSaving(true);
    try {
      if (editando && visita) {
        const res = await updateVisita(visita.id, {
          fecha_realizada: marcarRealizada ? new Date(fechaRealizada).toISOString() : visita.fecha_realizada,
          ubicacion_tipo: ubicacion,
          direccion: direccion.trim() || null,
          datos_inspeccion: datos,
          recomendacion,
          estado: marcarRealizada ? "realizada" : visita.estado,
        });
        toast.success(marcarRealizada
          ? `Visita marcada como realizada${res.informe_creado_id ? " · informe técnico generado" : ""}`
          : "Cambios guardados");
        onSaved({ visitaId: visita.id, informeCreadoId: res.informe_creado_id });
      } else {
        const created = await createVisita({
          expediente_id: expedienteId,
          hito_id: hitoId ?? null,
          fecha_programada: new Date(fechaRealizada).toISOString(),
          ubicacion_tipo: ubicacion,
          direccion: direccion.trim() || null,
          datos_inspeccion: datos,
        });
        if (marcarRealizada) {
          const upd = await updateVisita(created.data.id, {
            fecha_realizada: new Date(fechaRealizada).toISOString(),
            recomendacion,
            estado: "realizada",
          });
          toast.success(`Visita creada y realizada${upd.informe_creado_id ? " · informe técnico generado" : ""}`);
          onSaved({ visitaId: created.data.id, informeCreadoId: upd.informe_creado_id });
        } else {
          toast.success("Visita programada");
          onSaved({ visitaId: created.data.id, informeCreadoId: null });
        }
      }
      onClose();
    } catch (err) {
      const code = err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error";
      toast.error(code);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar visita técnica" : "Nueva visita técnica"}</DialogTitle>
          <DialogDescription>
            Formulario estandarizado de inspección. Al marcarse como realizada, se genera automáticamente el informe técnico.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Datos generales */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">Datos generales</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="fecha">Fecha y hora</Label>
                <Input id="fecha" type="datetime-local" value={fechaRealizada} onChange={(e) => setFechaRealizada(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ubic">Ubicación</Label>
                <Select value={ubicacion} onValueChange={(v) => setUbicacion(v as UbicacionTipo)}>
                  <SelectTrigger id="ubic"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sitio_cliente">Sitio cliente</SelectItem>
                    <SelectItem value="planta">Planta TECHTRAFO</SelectItem>
                    <SelectItem value="virtual">Virtual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="dir">Dirección</Label>
              <Input id="dir" value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Calle / referencia" />
            </div>
          </section>

          {/* Estado general */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">Estado del transformador</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Estado general</Label>
                <Select value={estadoGeneral} onValueChange={setEstadoGeneral}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operativo">Operativo</SelectItem>
                    <SelectItem value="operativo_con_alertas">Operativo con alertas</SelectItem>
                    <SelectItem value="fuera_de_servicio">Fuera de servicio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Estado del aceite</Label>
                <Select value={estadoAceite} onValueChange={setEstadoAceite}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bueno">Bueno</SelectItem>
                    <SelectItem value="regular">Regular</SelectItem>
                    <SelectItem value="malo">Malo</SelectItem>
                    <SelectItem value="no_aplica">No aplica (transformador seco)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Color del aceite</Label>
                <Select value={colorAceite} onValueChange={setColorAceite}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="claro_ambar">Claro / ámbar</SelectItem>
                    <SelectItem value="ambar">Ámbar normal</SelectItem>
                    <SelectItem value="oscuro">Oscuro</SelectItem>
                    <SelectItem value="negro">Negro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <input id="ruidos" type="checkbox" checked={ruidosAnomalos} onChange={(e) => setRuidosAnomalos(e.target.checked)} />
                <Label htmlFor="ruidos" className="cursor-pointer">Ruidos anómalos en operación</Label>
              </div>
            </div>
          </section>

          {/* Mediciones */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">Mediciones</h3>
            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label htmlFor="temp">Temp. externa (°C)</Label>
                <Input id="temp" type="number" step="0.1" value={tempExterna} onChange={(e) => setTempExterna(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rais">R. aislamiento (MΩ)</Label>
                <Input id="rais" type="number" step="1" value={resistAisl} onChange={(e) => setResistAisl(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="vprim">V primario</Label>
                <Input id="vprim" type="number" step="1" value={voltajePrim} onChange={(e) => setVoltajePrim(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="vsec">V secundario</Label>
                <Input id="vsec" type="number" step="0.1" value={voltajeSec} onChange={(e) => setVoltajeSec(e.target.value)} />
              </div>
            </div>
          </section>

          {/* Hallazgos */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">Hallazgos detectados</h3>
            <div className="grid grid-cols-2 gap-2">
              {HALLAZGOS_OPCIONES.map((h) => (
                <label key={h.key} className="flex cursor-pointer items-center gap-2 rounded border px-2 py-1.5 text-sm hover:bg-accent">
                  <input
                    type="checkbox"
                    checked={hallazgos.includes(h.key)}
                    onChange={() => toggleHallazgo(h.key)}
                  />
                  <span>{h.label}</span>
                </label>
              ))}
            </div>
          </section>

          {/* Recomendación */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">Decisión técnica</h3>
            <div className="space-y-1">
              <Label>Recomendación *</Label>
              <Select value={recomendacion} onValueChange={(v) => setRecomendacion(v as Recomendacion)}>
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
              <Textarea rows={3} value={justificacion} onChange={(e) => setJustificacion(e.target.value)} placeholder="Razón de la recomendación, evidencia técnica, etc." />
            </div>
          </section>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="outline" onClick={() => handleSubmit(false)} disabled={saving}>
            {saving ? "Guardando..." : "Guardar borrador"}
          </Button>
          <Button onClick={() => handleSubmit(true)} disabled={saving || !recomendacion}>
            {saving ? "Guardando..." : "Guardar y generar informe"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
