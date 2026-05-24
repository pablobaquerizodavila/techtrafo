"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft, ShieldCheck, Zap, MessageSquareWarning, Plus,
  CheckCircle2, Wrench, Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

  if (loading && !g) return <div className="text-muted-foreground">Cargando garantía...</div>;
  if (!g) return <p className="text-destructive">No encontrada</p>;

  const dias = g.dias_restantes ?? 0;
  const reclamosAbiertos = g.reclamos?.filter((r) => r.estado !== "cerrado" && r.estado !== "rechazado").length ?? 0;

  return (
    <div className="space-y-6">
      <header>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link href="/garantias"><ChevronLeft className="mr-1 h-4 w-4" /> Volver</Link>
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-3xl font-bold">
              <ShieldCheck className="h-7 w-7" /> {g.codigo}
            </h2>
            <p className="text-muted-foreground">
              {g.clientes?.razon_social} ({g.clientes?.ruc_cedula})
            </p>
          </div>
          <Badge variant={estadoGarVariant(g.estado)} className="text-base">{g.estado.toUpperCase()}</Badge>
        </div>
      </header>

      {/* Stats banner */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Duración" value={`${g.duracion_meses} meses`} />
        <Stat label="Desde" value={g.fecha_inicio.split("T")[0]} />
        <Stat label="Hasta" value={g.fecha_fin.split("T")[0]} highlight={dias < 0 ? "danger" : dias <= 30 ? "warning" : undefined} />
        <Stat label="Días restantes" value={String(dias)} highlight={dias < 0 ? "danger" : dias <= 30 ? "warning" : "ok"} />
      </div>

      {/* Equipo + origen */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {g.transformadores && (
          <Link href={`/transformadores/${g.transformadores.id}`} className="rounded-md border p-4 transition hover:border-primary hover:bg-accent">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Zap className="h-4 w-4 text-yellow-600" /> Equipo cubierto
            </h3>
            <p className="text-lg font-bold">{g.transformadores.codigo_interno}</p>
            <p className="text-sm text-muted-foreground">
              {g.transformadores.marca} {g.transformadores.modelo} ·{" "}
              {g.transformadores.capacidad_kva >= 1000
                ? `${(g.transformadores.capacidad_kva / 1000).toFixed(0)} MVA`
                : `${g.transformadores.capacidad_kva} kVA`}
            </p>
            {g.transformadores.numero_serie && (
              <p className="mt-1 font-mono text-xs text-muted-foreground">Serie {g.transformadores.numero_serie}</p>
            )}
          </Link>
        )}
        {g.ot && (
          <Link href={`/ot/${g.ot.id}`} className="rounded-md border p-4 transition hover:border-primary hover:bg-accent">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Wrench className="h-4 w-4" /> Origen
            </h3>
            <p className="text-lg font-bold font-mono">{g.ot.codigo}</p>
            <p className="text-sm text-muted-foreground capitalize">{g.ot.tipo_ruta}</p>
            {g.ot.fecha_fin_real && (
              <p className="mt-1 text-xs text-muted-foreground">
                Completada {new Date(g.ot.fecha_fin_real).toLocaleDateString("es-EC")}
              </p>
            )}
          </Link>
        )}
      </div>

      {g.alcance && (
        <section className="rounded-md border bg-muted/20 p-4 text-sm">
          <h3 className="mb-1 font-semibold">Alcance</h3>
          <p className="whitespace-pre-wrap text-muted-foreground">{g.alcance}</p>
        </section>
      )}
      {g.condiciones && (
        <section className="rounded-md border bg-muted/20 p-4 text-sm">
          <h3 className="mb-1 font-semibold">Condiciones</h3>
          <p className="whitespace-pre-wrap text-muted-foreground">{g.condiciones}</p>
        </section>
      )}

      {/* Reclamos */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-xl font-bold">
            <MessageSquareWarning className="h-5 w-5" /> Reclamos
            {reclamosAbiertos > 0 && (
              <Badge variant="destructive" className="text-xs">{reclamosAbiertos} abiertos</Badge>
            )}
          </h3>
          {g.estado === "vigente" && (
            <Dialog open={openNuevoReclamo} onOpenChange={setOpenNuevoReclamo}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Reportar reclamo</Button>
              </DialogTrigger>
              <NuevoReclamoForm garId={g.id} onSaved={() => { setOpenNuevoReclamo(false); load(); }} />
            </Dialog>
          )}
        </div>

        {!g.reclamos?.length ? (
          <p className="rounded-md border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            Sin reclamos registrados {g.estado === "vigente" ? "(¡bien!)" : ""}
          </p>
        ) : (
          <div className="space-y-3">
            {g.reclamos.map((r) => <ReclamoCard key={r.id} reclamo={r} garId={g.id} onChange={load} />)}
          </div>
        )}
      </section>

      <Toaster richColors position="top-right" />
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: "ok" | "warning" | "danger" }) {
  const cls = highlight === "danger" ? "text-destructive"
    : highlight === "warning" ? "text-yellow-700"
    : highlight === "ok" ? "text-green-700"
    : "";
  return (
    <div className="rounded-md border p-3 text-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold ${cls}`}>{value}</p>
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
    <DialogContent className="bg-white">
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
    <div className={`rounded-md border p-4 ${reclamo.estado === "cerrado" ? "" : "border-l-4 border-l-yellow-500"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm">{reclamo.codigo}</span>
            <Badge variant={severidadVariant(reclamo.severidad)} className="text-xs uppercase">{reclamo.severidad}</Badge>
            <Badge variant={estadoReclamoVariant(reclamo.estado)} className="text-xs">{reclamo.estado.replace("_", " ")}</Badge>
            {reclamo.canal && <span className="text-xs text-muted-foreground">vía {reclamo.canal}</span>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            <Calendar className="mr-1 inline h-3 w-3" />
            {new Date(reclamo.fecha_reclamo).toLocaleString("es-EC")}
            {reclamo.reportado_por_nombre && ` · ${reclamo.reportado_por_nombre}`}
          </p>
          <p className="mt-2 text-sm whitespace-pre-wrap">{reclamo.descripcion}</p>
          {reclamo.resolucion && (
            <p className="mt-2 rounded bg-green-50 p-2 text-xs">
              <strong>Resolución:</strong> {reclamo.resolucion}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          {reclamo.estado !== "cerrado" && reclamo.estado !== "rechazado" && (
            <>
              <Dialog open={openInter} onOpenChange={setOpenInter}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">+ Intervención</Button>
                </DialogTrigger>
                <NuevaIntervencionForm garId={garId} rId={reclamo.id} onSaved={() => { setOpenInter(false); onChange(); }} />
              </Dialog>
              <Dialog open={openCerrar} onOpenChange={setOpenCerrar}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="default"><CheckCircle2 className="mr-1 h-3 w-3" /> Cerrar</Button>
                </DialogTrigger>
                <CerrarReclamoForm garId={garId} rId={reclamo.id} onSaved={() => { setOpenCerrar(false); onChange(); }} />
              </Dialog>
            </>
          )}
        </div>
      </div>

      {reclamo.intervenciones && reclamo.intervenciones.length > 0 && (
        <div className="mt-3 border-t pt-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">
            Intervenciones ({reclamo.intervenciones.length})
          </p>
          <ul className="space-y-2">
            {reclamo.intervenciones.map((i) => (
              <li key={i.id} className="rounded border p-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">#{i.numero}</span>
                  <span className="capitalize">{i.tipo.replace(/_/g, " ")}</span>
                  {i.resultado && (
                    <Badge variant={i.resultado === "exitoso" ? "success" : i.resultado === "parcial" ? "warning" : "destructive"} className="text-[10px]">
                      {i.resultado}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-muted-foreground">
                  {i.fecha_real && <>Realizada {new Date(i.fecha_real).toLocaleDateString("es-EC")}</>}
                  {!i.fecha_real && i.fecha_programada && <>Programada {new Date(i.fecha_programada).toLocaleDateString("es-EC")}</>}
                  {i.usuarios_intervenciones_tecnico_idTousuarios && ` · ${i.usuarios_intervenciones_tecnico_idTousuarios.nombres} ${i.usuarios_intervenciones_tecnico_idTousuarios.apellidos}`}
                </p>
                {i.acciones_tomadas && <p className="mt-1">{i.acciones_tomadas}</p>}
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
    <DialogContent className="bg-white">
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
    <DialogContent className="bg-white">
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
