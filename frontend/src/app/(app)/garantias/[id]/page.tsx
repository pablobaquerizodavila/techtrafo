"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft, ShieldCheck, Zap, MessageSquareWarning, Plus,
  CheckCircle2, Wrench, Calendar, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader, HeaderActionGhost } from "@/components/page-header";
import { Panel, StatCard } from "@/components/panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Toaster, toast } from "sonner";
import {
  Garantia, Reclamo, Severidad, CanalReclamo, TipoIntervencion, ResultadoIntervencion,
  actualizarReclamo, crearIntervencion, crearReclamo, estadoGarVariant, estadoReclamoVariant,
  getGarantia, severidadVariant,
} from "@/lib/garantias";
import { ApiError } from "@/lib/api";

interface PageProps { params: Promise<{ id: string }> }

export default function GarantiaDetallePage({ params }: PageProps) {
  const [id, setId] = useState<number | null>(null);
  const [g, setG] = useState<Garantia | null>(null);
  const [loading, setLoading] = useState(true);
  const [openNuevoReclamo, setOpenNuevoReclamo] = useState(false);

  useEffect(() => { params.then(({ id }) => setId(Number(id))); }, [params]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const r = await getGarantia(id);
      setG(r.data);
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { if (id) load(); }, [id, load]);

  if (loading && !g) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-copper border-t-transparent" />
          <span className="text-sm">Cargando garantía…</span>
        </div>
      </div>
    );
  }
  if (!g) {
    return (
      <div>
        <PageHeader breadcrumb={[{ href: "/dashboard", label: "Panel" }, { href: "/garantias", label: "Garantías" }, { label: "Error" }]} title="Garantía" titleAccent="no encontrada" />
        <div className="pt-6">
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-200 inset-highlight"><p className="text-sm">No encontrada</p></div>
        </div>
      </div>
    );
  }

  const dias = g.dias_restantes ?? 0;
  const reclamosAbiertos = g.reclamos?.filter((r) => r.estado !== "cerrado" && r.estado !== "rechazado").length ?? 0;
  const diasTone = dias < 0 ? "rose" : dias <= 30 ? "amber" : "green";

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { href: "/garantias", label: "Garantías" }, { label: g.codigo }]}
        title={g.codigo}
        titleAccent={g.clientes?.razon_social ?? ""}
        meta={
          <>
            <Badge variant={estadoGarVariant(g.estado)}>{g.estado}</Badge>
            <span className="text-muted-foreground/40">·</span>
            <span>{g.clientes?.ruc_cedula}</span>
            {reclamosAbiertos > 0 && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <Badge variant="destructive">{reclamosAbiertos} reclamo{reclamosAbiertos === 1 ? "" : "s"} abierto{reclamosAbiertos === 1 ? "" : "s"}</Badge>
              </>
            )}
          </>
        }
        actions={
          <HeaderActionGhost href="/garantias" icon={<ChevronLeft className="h-3.5 w-3.5" />}>Volver</HeaderActionGhost>
        }
      />

      <div className="space-y-6 pt-6">
        {/* Stats banner */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Duración" value={`${g.duracion_meses}`} sub="meses cubiertos" icon={<ShieldCheck className="h-3.5 w-3.5" />} />
          <StatCard label="Desde" value={g.fecha_inicio.split("T")[0]} sub="Inicio de cobertura" />
          <StatCard label="Hasta" value={g.fecha_fin.split("T")[0]} sub={dias < 0 ? "Vencida" : dias <= 30 ? "Próxima a vencer" : "Vigente"} tone={diasTone} />
          <StatCard label="Días restantes" value={String(dias)} sub={dias < 0 ? "Días en mora" : dias <= 30 ? "Programar renovación" : "Margen amplio"} tone={diasTone} icon={<Calendar className="h-3.5 w-3.5" />} />
        </section>

        {/* Equipo + origen */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {g.transformadores && (
            <Link
              href={`/transformadores/${g.transformadores.id}`}
              className="group block overflow-hidden rounded-xl border border-glass bg-glass p-4 inset-highlight transition hover:border-glass-mid hover:bg-glass-elev"
              style={{ backgroundImage: "radial-gradient(ellipse 50% 80% at 0% 50%, rgba(255,107,53,0.06), transparent 60%)" }}
            >
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-copper to-copper-deep text-white shadow-md glow-copper-sm inset-highlight-md">
                  <Zap className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Equipo cubierto</p>
                  <p className="font-display text-sm font-semibold tracking-tight">{g.transformadores.codigo_interno}</p>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                    {g.transformadores.marca} {g.transformadores.modelo}
                    <span className="mx-1.5 text-muted-foreground/40">·</span>
                    <span className="text-ttteal">{g.transformadores.capacidad_kva >= 1000 ? `${(g.transformadores.capacidad_kva / 1000).toFixed(0)} MVA` : `${g.transformadores.capacidad_kva} kVA`}</span>
                    {g.transformadores.numero_serie && (<><span className="mx-1.5 text-muted-foreground/40">·</span>serie {g.transformadores.numero_serie}</>)}
                  </p>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground/50 transition group-hover:text-copper" />
              </div>
            </Link>
          )}
          {g.ot && (
            <Link
              href={`/ot/${g.ot.id}`}
              className="group block overflow-hidden rounded-xl border border-glass bg-glass p-4 inset-highlight transition hover:border-glass-mid hover:bg-glass-elev"
            >
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl border border-ttteal/30 bg-ttteal/10 text-ttteal">
                  <Wrench className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Origen</p>
                  <p className="font-mono text-sm font-semibold text-foreground/90">{g.ot.codigo}</p>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                    <span className="capitalize">{g.ot.tipo_ruta}</span>
                    {g.ot.fecha_fin_real && (<><span className="mx-1.5 text-muted-foreground/40">·</span>completada {new Date(g.ot.fecha_fin_real).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" })}</>)}
                  </p>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground/50 transition group-hover:text-copper" />
              </div>
            </Link>
          )}
        </div>

        {g.alcance && (
          <Panel title="Alcance"><p className="whitespace-pre-wrap text-sm text-foreground/85">{g.alcance}</p></Panel>
        )}
        {g.condiciones && (
          <Panel title="Condiciones"><p className="whitespace-pre-wrap text-sm text-foreground/85">{g.condiciones}</p></Panel>
        )}

        {/* Reclamos */}
        <Panel
          title="Reclamos"
          subtitle={reclamosAbiertos > 0 ? `${reclamosAbiertos} abiertos` : "Sin reclamos abiertos"}
          icon={<MessageSquareWarning className="h-3.5 w-3.5" />}
          action={
            g.estado === "vigente" ? (
              <Dialog open={openNuevoReclamo} onOpenChange={setOpenNuevoReclamo}>
                <DialogTrigger asChild>
                  <button type="button" className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-3 py-1.5 text-xs font-medium text-white shadow-sm glow-copper-sm inset-highlight-md transition hover:glow-copper">
                    <Plus className="h-3.5 w-3.5" /> Reportar reclamo
                  </button>
                </DialogTrigger>
                <NuevoReclamoForm garId={g.id} onSaved={() => { setOpenNuevoReclamo(false); load(); }} />
              </Dialog>
            ) : undefined
          }
        >
          {!g.reclamos?.length ? (
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-green-500/25 bg-green-500/[0.04] py-6">
              <CheckCircle2 className="h-5 w-5 text-green-400" />
              <p className="text-xs text-green-300">Sin reclamos registrados{g.estado === "vigente" ? " — todo bien" : ""}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {g.reclamos.map((r) => <ReclamoCard key={r.id} reclamo={r} garId={g.id} onChange={load} />)}
            </div>
          )}
        </Panel>
      </div>

      <Toaster richColors position="top-right" theme="dark" />
    </div>
  );
}

function NuevoReclamoForm({ garId, onSaved }: { garId: number; onSaved: () => void }) {
  const [descripcion, setDescripcion] = useState("");
  const [severidad, setSeveridad] = useState<Severidad>("media");
  const [canal, setCanal] = useState<CanalReclamo | "_">("_");
  const [reportadoPor, setReportadoPor] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (descripcion.trim().length < 3) { toast.error("Descripción requerida"); return; }
    setBusy(true);
    try {
      await crearReclamo(garId, {
        descripcion: descripcion.trim(),
        severidad,
        canal: canal === "_" ? null : canal,
        reportado_por_nombre: reportadoPor.trim() || null,
      });
      toast.success("Reclamo registrado");
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? `Error ${err.status}` : "Error");
    } finally { setBusy(false); }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Nuevo reclamo</DialogTitle>
        <DialogDescription>El reclamo queda en estado &quot;recibido&quot; y se puede asignar intervenciones después.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1">
          <Label>Descripción del problema *</Label>
          <Textarea rows={4} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Severidad</Label>
            <Select value={severidad} onValueChange={(v) => setSeveridad(v as Severidad)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="baja">Baja</SelectItem>
                <SelectItem value="media">Media</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="critica">Crítica</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Canal de ingreso</Label>
            <Select value={canal} onValueChange={(v) => setCanal(v as CanalReclamo | "_")}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">— No especificado —</SelectItem>
                <SelectItem value="telefono">Teléfono</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="visita_planta">Visita a planta</SelectItem>
                <SelectItem value="web">Web</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1">
          <Label>Reportado por (opcional)</Label>
          <Input value={reportadoPor} onChange={(e) => setReportadoPor(e.target.value)} placeholder="Ej: Ing. Juan Pérez del cliente" />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={busy}>{busy ? "Guardando..." : "Crear reclamo"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function ReclamoCard({ reclamo, garId, onChange }: { reclamo: Reclamo; garId: number; onChange: () => void }) {
  const [openInter, setOpenInter] = useState(false);
  const [openCerrar, setOpenCerrar] = useState(false);

  return (
    <div className={`overflow-hidden rounded-xl border p-4 inset-highlight ${reclamo.estado === "cerrado" ? "border-glass bg-glass" : "border-l-4 border-l-amber-500 border-glass bg-amber-500/[0.04]"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-foreground/90">{reclamo.codigo}</span>
            <Badge variant={severidadVariant(reclamo.severidad)}>{reclamo.severidad}</Badge>
            <Badge variant={estadoReclamoVariant(reclamo.estado)}>{reclamo.estado.replace("_", " ")}</Badge>
            {reclamo.canal && <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">vía {reclamo.canal}</span>}
          </div>
          <p className="mt-1.5 inline-flex items-center gap-1 font-mono text-[10.5px] text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {new Date(reclamo.fecha_reclamo).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}
            {reclamo.reportado_por_nombre && ` · ${reclamo.reportado_por_nombre}`}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/85">{reclamo.descripcion}</p>
          {reclamo.resolucion && (
            <div className="mt-2 rounded-lg border border-green-500/25 bg-green-500/[0.05] p-2.5 text-xs">
              <p className="mb-0.5 font-mono text-[9.5px] uppercase tracking-wider text-green-300">Resolución</p>
              <p className="text-foreground/85">{reclamo.resolucion}</p>
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          {reclamo.estado !== "cerrado" && reclamo.estado !== "rechazado" && (
            <>
              <Dialog open={openInter} onOpenChange={setOpenInter}>
                <DialogTrigger asChild>
                  <button type="button" className="inline-flex items-center gap-1 rounded-md border border-glass-mid bg-glass px-2.5 py-1 text-[11px] font-medium text-foreground/90 hover:bg-glass-elev">
                    <Plus className="h-3 w-3" /> Intervención
                  </button>
                </DialogTrigger>
                <NuevaIntervencionForm garId={garId} rId={reclamo.id} onSaved={() => { setOpenInter(false); onChange(); }} />
              </Dialog>
              <Dialog open={openCerrar} onOpenChange={setOpenCerrar}>
                <DialogTrigger asChild>
                  <button type="button" className="inline-flex items-center gap-1 rounded-md bg-gradient-to-b from-copper to-copper-deep px-2.5 py-1 text-[11px] font-medium text-white glow-copper-sm">
                    <CheckCircle2 className="h-3 w-3" /> Cerrar
                  </button>
                </DialogTrigger>
                <CerrarReclamoForm garId={garId} rId={reclamo.id} onSaved={() => { setOpenCerrar(false); onChange(); }} />
              </Dialog>
            </>
          )}
        </div>
      </div>

      {reclamo.intervenciones && reclamo.intervenciones.length > 0 && (
        <div className="mt-3 border-t border-glass pt-3">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Intervenciones ({reclamo.intervenciones.length})
          </p>
          <ul className="space-y-2">
            {reclamo.intervenciones.map((i) => (
              <li key={i.id} className="rounded-lg border border-glass bg-glass p-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-copper">#{i.numero}</span>
                  <span className="capitalize text-foreground/85">{i.tipo.replace(/_/g, " ")}</span>
                  {i.resultado && (
                    <Badge variant={i.resultado === "exitoso" ? "success" : i.resultado === "parcial" ? "warning" : "destructive"}>
                      {i.resultado}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  {i.fecha_real && <>Realizada {new Date(i.fecha_real).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" })}</>}
                  {!i.fecha_real && i.fecha_programada && <>Programada {new Date(i.fecha_programada).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" })}</>}
                  {i.usuarios_intervenciones_tecnico_idTousuarios && ` · ${i.usuarios_intervenciones_tecnico_idTousuarios.nombres} ${i.usuarios_intervenciones_tecnico_idTousuarios.apellidos}`}
                </p>
                {i.acciones_tomadas && <p className="mt-1 text-foreground/85">{i.acciones_tomadas}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function NuevaIntervencionForm({ garId, rId, onSaved }: { garId: number; rId: number; onSaved: () => void }) {
  const [tipo, setTipo] = useState<TipoIntervencion>("visita_diagnostico");
  const [fechaProg, setFechaProg] = useState("");
  const [hallazgos, setHallazgos] = useState("");
  const [acciones, setAcciones] = useState("");
  const [resultado, setResultado] = useState<ResultadoIntervencion | "_">("_");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await crearIntervencion(garId, rId, {
        tipo,
        fecha_programada: fechaProg || null,
        hallazgos: hallazgos.trim() || null,
        acciones_tomadas: acciones.trim() || null,
        resultado: resultado === "_" ? null : resultado,
      });
      toast.success("Intervención registrada");
      onSaved();
    } catch {
      toast.error("Error");
    } finally { setBusy(false); }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Nueva intervención</DialogTitle>
        <DialogDescription>Visita, reparación, reemplazo o asesoría sobre este reclamo.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Tipo *</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoIntervencion)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="visita_diagnostico">Visita diagnóstico</SelectItem>
                <SelectItem value="reparacion">Reparación</SelectItem>
                <SelectItem value="reemplazo">Reemplazo</SelectItem>
                <SelectItem value="calibracion">Calibración</SelectItem>
                <SelectItem value="asesoria">Asesoría</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Fecha programada</Label>
            <Input type="date" value={fechaProg} onChange={(e) => setFechaProg(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Hallazgos</Label>
          <Textarea rows={3} value={hallazgos} onChange={(e) => setHallazgos(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Acciones tomadas</Label>
          <Textarea rows={3} value={acciones} onChange={(e) => setAcciones(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Resultado</Label>
          <Select value={resultado} onValueChange={(v) => setResultado(v as ResultadoIntervencion | "_")}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_">— Sin definir aún —</SelectItem>
              <SelectItem value="exitoso">Exitoso</SelectItem>
              <SelectItem value="parcial">Parcial</SelectItem>
              <SelectItem value="fallido">Fallido</SelectItem>
              <SelectItem value="no_aplica">No aplica</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={busy}>{busy ? "Guardando..." : "Registrar"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function CerrarReclamoForm({ garId, rId, onSaved }: { garId: number; rId: number; onSaved: () => void }) {
  const [resolucion, setResolucion] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (resolucion.trim().length < 3) { toast.error("Resolución requerida"); return; }
    setBusy(true);
    try {
      await actualizarReclamo(garId, rId, { estado: "cerrado", resolucion: resolucion.trim() });
      toast.success("Reclamo cerrado");
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? `Error ${err.status}` : "Error");
    } finally { setBusy(false); }
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Cerrar reclamo</DialogTitle>
        <DialogDescription>La resolución es obligatoria y queda como dictamen final.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1">
          <Label>Resolución / dictamen *</Label>
          <Textarea rows={5} value={resolucion} onChange={(e) => setResolucion(e.target.value)} required
            placeholder="Resumen de lo encontrado, lo realizado y conclusión final" />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={busy}>{busy ? "Cerrando..." : "Cerrar reclamo"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
