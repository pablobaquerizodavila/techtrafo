"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, AlertOctagon, Plus, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Area, CausaDemora, Reproceso, TiempoTrabajo,
  listAreas, listCausasDemora, listReprocesos, listTiempos,
  registrarReproceso, registrarTiempo, resolverReproceso,
} from "@/lib/produccion";
import { OTPaso } from "@/lib/ot";
import { ApiError } from "@/lib/api";

interface Props {
  otId: number;
  pasos: OTPaso[];
}

export function TiemposReprocesosPanel({ otId, pasos }: Props) {
  const [tiempos, setTiempos] = useState<TiempoTrabajo[]>([]);
  const [reprocesos, setReprocesos] = useState<Reproceso[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [causas, setCausas] = useState<CausaDemora[]>([]);
  const [openTiempo, setOpenTiempo] = useState(false);
  const [openReproceso, setOpenReproceso] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, r, a, c] = await Promise.all([
        listTiempos(otId), listReprocesos(otId), listAreas(), listCausasDemora(),
      ]);
      setTiempos(t.data);
      setReprocesos(r.data);
      setAreas(a.data.filter((x) => x.activo));
      setCausas(c.data.filter((x) => x.activo));
    } catch {
      // silencioso
    }
  }, [otId]);

  useEffect(() => { load(); }, [load]);

  const horasTotal = tiempos.reduce((s, t) => s + Number(t.horas), 0);
  const diasReprocesoTotal = reprocesos.reduce((s, r) => s + Number(r.dias_perdidos), 0);
  const reprocesosAbiertos = reprocesos.filter((r) => !r.resuelto).length;

  async function handleResolver(r: Reproceso) {
    const notas = window.prompt("Notas de resolución (opcional):") ?? "";
    try {
      await resolverReproceso(r.id, notas || undefined);
      toast.success("Reproceso resuelto");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? `Error ${err.status}` : "Error");
    }
  }

  return (
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Tiempos de trabajo */}
      <div className="rounded-md border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <Clock className="h-5 w-5" /> Tiempos de trabajo
          </h3>
          <Badge variant="outline" className="text-xs">{horasTotal.toFixed(1)}h totales</Badge>
        </div>

        <Dialog open={openTiempo} onOpenChange={setOpenTiempo}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="mb-3 w-full">
              <Plus className="mr-1 h-3.5 w-3.5" /> Registrar tiempo
            </Button>
          </DialogTrigger>
          <RegistrarTiempoForm
            otId={otId}
            pasos={pasos}
            areas={areas}
            onSaved={() => { setOpenTiempo(false); load(); }}
          />
        </Dialog>

        {tiempos.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin registros todavía</p>
        ) : (
          <ul className="space-y-2 max-h-72 overflow-y-auto text-sm">
            {tiempos.map((t) => (
              <li key={t.id} className="flex items-start gap-2 rounded border p-2 text-xs">
                <div className="flex-1">
                  <p className="font-medium">
                    {Number(t.horas).toFixed(1)}h
                    {t.areas && (
                      <span className="ml-2 inline-flex items-center gap-1">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ background: t.areas.color_hex }} />
                        <span className="text-muted-foreground">{t.areas.nombre}</span>
                      </span>
                    )}
                  </p>
                  <p className="text-muted-foreground">
                    {t.usuarios && `${t.usuarios.nombres} · `}
                    {t.fecha.split("T")[0]}
                    {t.ot_pasos && ` · paso ${t.ot_pasos.numero}`}
                  </p>
                  {t.descripcion && <p className="mt-0.5 text-muted-foreground italic">{t.descripcion}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Reprocesos */}
      <div className="rounded-md border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <AlertOctagon className="h-5 w-5 text-destructive" /> Reprocesos
          </h3>
          <div className="flex gap-1">
            <Badge variant="outline" className="text-xs">{diasReprocesoTotal.toFixed(1)}d perdidos</Badge>
            {reprocesosAbiertos > 0 && (
              <Badge variant="destructive" className="text-xs">{reprocesosAbiertos} abiertos</Badge>
            )}
          </div>
        </div>

        <Dialog open={openReproceso} onOpenChange={setOpenReproceso}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="mb-3 w-full">
              <Plus className="mr-1 h-3.5 w-3.5" /> Reportar reproceso
            </Button>
          </DialogTrigger>
          <ReportarReprocesoForm
            otId={otId}
            pasos={pasos}
            causas={causas}
            onSaved={() => { setOpenReproceso(false); load(); }}
          />
        </Dialog>

        {reprocesos.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin reprocesos reportados</p>
        ) : (
          <ul className="space-y-2 max-h-72 overflow-y-auto text-sm">
            {reprocesos.map((r) => (
              <li key={r.id} className={`rounded border p-2 text-xs ${r.resuelto ? "" : "border-destructive/40 bg-destructive/5"}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium">
                      {r.causas_demora?.nombre ?? "—"}
                      {r.ot_pasos && <span className="ml-1 text-muted-foreground">· paso {r.ot_pasos.numero}</span>}
                    </p>
                    <p className="mt-0.5 text-muted-foreground">{r.descripcion}</p>
                    <p className="mt-0.5 text-muted-foreground">
                      {Number(r.dias_perdidos).toFixed(1)}d perdidos · {new Date(r.created_at).toLocaleDateString("es-EC")}
                    </p>
                    {r.notas_resolucion && (
                      <p className="mt-1 rounded bg-muted p-1 italic">Resuelto: {r.notas_resolucion}</p>
                    )}
                  </div>
                  {!r.resuelto && (
                    <Button size="sm" variant="ghost" onClick={() => handleResolver(r)}>
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-700" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ===================================================================
// Form: registrar tiempo
// ===================================================================
function RegistrarTiempoForm({
  otId, pasos, areas, onSaved,
}: { otId: number; pasos: OTPaso[]; areas: Area[]; onSaved: () => void }) {
  const [pasoId, setPasoId] = useState<string>("_");
  const [areaId, setAreaId] = useState<string>("_");
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0]);
  const [horas, setHoras] = useState<number | "">(8);
  const [descripcion, setDescripcion] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!horas || Number(horas) <= 0) { toast.error("Horas requeridas"); return; }
    setBusy(true);
    try {
      await registrarTiempo({
        ot_id: otId,
        paso_id: pasoId === "_" ? null : Number(pasoId),
        area_id: areaId === "_" ? null : Number(areaId),
        fecha,
        horas: Number(horas),
        descripcion: descripcion.trim() || null,
      });
      toast.success("Tiempo registrado");
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? `Error ${err.status}` : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent className="bg-white">
      <DialogHeader>
        <DialogTitle>Registrar tiempo de trabajo</DialogTitle>
        <DialogDescription>Horas-hombre dedicadas a esta OT. Por defecto el área se infiere del paso seleccionado.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Fecha *</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label>Horas *</Label>
            <Input type="number" step="0.25" min="0.25" max="24" value={horas}
              onChange={(e) => setHoras(e.target.value === "" ? "" : Number(e.target.value))} required />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Paso (opcional)</Label>
          <Select value={pasoId} onValueChange={setPasoId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_">— Sin paso específico —</SelectItem>
              {pasos.map((p) => (
                <SelectItem key={p.id} value={p.id.toString()}>{p.numero}. {p.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Área (si no seleccionas paso)</Label>
          <Select value={areaId} onValueChange={setAreaId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_">— Inferir del paso —</SelectItem>
              {areas.map((a) => (
                <SelectItem key={a.id} value={a.id.toString()}>{a.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Descripción</Label>
          <Textarea rows={2} value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Qué se hizo en estas horas..." />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={busy}>{busy ? "Guardando..." : "Registrar"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

// ===================================================================
// Form: reportar reproceso
// ===================================================================
function ReportarReprocesoForm({
  otId, pasos, causas, onSaved,
}: { otId: number; pasos: OTPaso[]; causas: CausaDemora[]; onSaved: () => void }) {
  const [pasoId, setPasoId] = useState<string>("_");
  const [causaId, setCausaId] = useState<string>("");
  const [dias, setDias] = useState<number | "">(0);
  const [descripcion, setDescripcion] = useState("");
  const [costo, setCosto] = useState<number | "">("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!causaId) { toast.error("Selecciona la causa"); return; }
    if (!descripcion.trim()) { toast.error("Descripción requerida"); return; }
    setBusy(true);
    try {
      await registrarReproceso({
        ot_id: otId,
        paso_id: pasoId === "_" ? null : Number(pasoId),
        causa_demora_id: Number(causaId),
        descripcion: descripcion.trim(),
        dias_perdidos: dias === "" ? 0 : Number(dias),
        costo_estimado: costo === "" ? null : Number(costo),
      });
      toast.success("Reproceso reportado");
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? `Error ${err.status}` : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent className="bg-white">
      <DialogHeader>
        <DialogTitle>Reportar reproceso / demora</DialogTitle>
        <DialogDescription>Tipifica la causa y los días perdidos. Sirve para alimentar el ranking del dashboard.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1">
          <Label>Causa *</Label>
          <Select value={causaId} onValueChange={setCausaId}>
            <SelectTrigger><SelectValue placeholder="Selecciona una causa" /></SelectTrigger>
            <SelectContent>
              {causas.map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>
                  {c.nombre} <span className="ml-1 text-xs text-muted-foreground">({c.categoria})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Paso afectado (opcional)</Label>
          <Select value={pasoId} onValueChange={setPasoId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_">— OT en general —</SelectItem>
              {pasos.map((p) => (
                <SelectItem key={p.id} value={p.id.toString()}>{p.numero}. {p.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Días perdidos</Label>
            <Input type="number" step="0.5" min="0" max="365" value={dias}
              onChange={(e) => setDias(e.target.value === "" ? "" : Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label>Costo estimado (opcional)</Label>
            <Input type="number" step="0.01" min="0" value={costo}
              onChange={(e) => setCosto(e.target.value === "" ? "" : Number(e.target.value))} placeholder="USD" />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Descripción *</Label>
          <Textarea rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Qué pasó, por qué, qué acción se tomó..." required />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={busy} variant="destructive">{busy ? "Guardando..." : "Reportar"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
