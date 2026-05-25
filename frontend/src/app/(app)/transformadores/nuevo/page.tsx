"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Toaster, toast } from "sonner";
import { PageHeader, HeaderActionGhost } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { Cliente, listClientes } from "@/lib/clientes";
import {
  CreateTransformador, EstadoTransformador, TipoTransformador,
  createTransformador,
} from "@/lib/transformadores";
import { ApiError } from "@/lib/api";

export default function NuevoTransformadorPage() {
  const router = useRouter();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [tipo, setTipo] = useState<TipoTransformador>("distribucion");
  const [capacidad, setCapacidad] = useState<number | "">(500);
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [serie, setSerie] = useState("");
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [tensionPri, setTensionPri] = useState<number | "">("");
  const [tensionSec, setTensionSec] = useState<number | "">("");
  const [conexion, setConexion] = useState("");
  const [grupoVect, setGrupoVect] = useState("");
  const [fases, setFases] = useState<"" | "1" | "3">("3");
  const [frecuencia, setFrecuencia] = useState<"" | "50" | "60">("60");
  const [refrigeracion, setRefrigeracion] = useState("");
  const [peso, setPeso] = useState<number | "">("");
  const [ancho, setAncho] = useState<number | "">("");
  const [alto, setAlto] = useState<number | "">("");
  const [profundidad, setProfundidad] = useState<number | "">("");
  const [anio, setAnio] = useState<number | "">("");
  const [fechaServicio, setFechaServicio] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [estado, setEstado] = useState<EstadoTransformador>("en_servicio");
  const [observaciones, setObservaciones] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listClientes({ limit: 200 }).then((r) => setClientes(r.data)).catch(() => setClientes([]));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!capacidad || Number(capacidad) <= 0) { setError("Capacidad kVA requerida"); return; }
    setSubmitting(true);
    try {
      const payload: CreateTransformador = {
        tipo, capacidad_kva: Number(capacidad),
        marca: marca.trim() || null, modelo: modelo.trim() || null, numero_serie: serie.trim() || null,
        cliente_id: clienteId,
        tension_primaria_kv: tensionPri === "" ? null : Number(tensionPri),
        tension_secundaria_v: tensionSec === "" ? null : Number(tensionSec),
        conexion: conexion.trim() || null, grupo_vectorial: grupoVect.trim() || null,
        numero_fases: fases === "" ? null : (Number(fases) as 1 | 3),
        frecuencia_hz: frecuencia === "" ? null : (Number(frecuencia) as 50 | 60),
        refrigeracion: refrigeracion.trim() || null,
        peso_kg: peso === "" ? null : Number(peso),
        ancho_mm: ancho === "" ? null : Number(ancho),
        alto_mm: alto === "" ? null : Number(alto),
        profundidad_mm: profundidad === "" ? null : Number(profundidad),
        anio_fabricacion: anio === "" ? null : Number(anio),
        fecha_puesta_servicio: fechaServicio || null,
        ubicacion_actual: ubicacion.trim() || null,
        estado, observaciones: observaciones.trim() || null,
      };
      const res = await createTransformador(payload);
      toast.success(`Transformador ${res.data.codigo_interno} creado`);
      router.push(`/transformadores/${res.data.id}`);
    } catch (err) {
      const msg = err instanceof ApiError
        ? typeof err.body === "object" && err.body !== null && "error" in err.body
          ? String((err.body as { error: string }).error)
          : `Error ${err.status}`
        : "Error inesperado";
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { href: "/transformadores", label: "Transformadores" }, { label: "Nuevo" }]}
        title="Nuevo"
        titleAccent="transformador"
        meta={<span>Solo capacidad y tipo son obligatorios — el resto se completa después</span>}
        actions={<HeaderActionGhost href="/transformadores" icon={<ChevronLeft className="h-3.5 w-3.5" />}>Volver</HeaderActionGhost>}
      />

      <form onSubmit={handleSubmit} className="space-y-6 pt-6">
        {/* Identificación */}
        <Panel title="Identificación" icon={<Zap className="h-3.5 w-3.5" />}>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <FormField label="Marca" htmlFor="marca">
              <Input id="marca" value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Ej: Siemens, ABB" className="h-10 border-glass bg-glass" />
            </FormField>
            <FormField label="Modelo" htmlFor="modelo">
              <Input id="modelo" value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Ej: TPV-500" className="h-10 border-glass bg-glass" />
            </FormField>
            <FormField label="N° de serie" htmlFor="serie">
              <Input id="serie" value={serie} onChange={(e) => setSerie(e.target.value)} placeholder="Del fabricante" className="h-10 border-glass bg-glass" />
            </FormField>
          </div>
          <div className="mt-5">
            <FormField label="Cliente propietario" htmlFor="cliente">
              <Select value={clienteId?.toString() ?? "_"} onValueChange={(v) => setClienteId(v === "_" ? null : Number(v))}>
                <SelectTrigger id="cliente" className="h-10 border-glass bg-glass"><SelectValue placeholder="Seleccionar (opcional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_">— Sin asignar —</SelectItem>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.razon_social} <span className="font-mono text-xs text-muted-foreground">({c.ruc_cedula})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>
        </Panel>

        {/* Características técnicas */}
        <Panel title="Características técnicas" subtitle="Tipo, capacidad, tensiones, configuración">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <FormField label="Tipo" required htmlFor="tipo">
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoTransformador)}>
                <SelectTrigger id="tipo" className="h-10 border-glass bg-glass"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="distribucion">Distribución</SelectItem>
                  <SelectItem value="potencia">Potencia</SelectItem>
                  <SelectItem value="seco">Seco</SelectItem>
                  <SelectItem value="aceite">Aceite</SelectItem>
                  <SelectItem value="pedestal">Pedestal</SelectItem>
                  <SelectItem value="subestacion">Subestación</SelectItem>
                  <SelectItem value="especial">Especial</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Capacidad kVA" required htmlFor="capacidad">
              <Input id="capacidad" type="number" min="1" value={capacidad}
                onChange={(e) => setCapacidad(e.target.value === "" ? "" : Number(e.target.value))} required
                className="h-10 border-glass bg-glass font-mono" />
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">Ej: 150, 300, 500, 1000 (= 1 MVA), 5000 (= 5 MVA)</p>
            </FormField>
            <FormField label="Refrigeración" htmlFor="refrig">
              <Input id="refrig" value={refrigeracion} onChange={(e) => setRefrigeracion(e.target.value)} placeholder="ONAN, ONAF, AN…" className="h-10 border-glass bg-glass" />
            </FormField>
            <FormField label="Tensión primaria (kV)" htmlFor="vpri">
              <Input id="vpri" type="number" step="0.001" min="0" value={tensionPri}
                onChange={(e) => setTensionPri(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="13.8, 22.86" className="h-10 border-glass bg-glass font-mono" />
            </FormField>
            <FormField label="Tensión secundaria (V)" htmlFor="vsec">
              <Input id="vsec" type="number" min="0" value={tensionSec}
                onChange={(e) => setTensionSec(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="220, 480" className="h-10 border-glass bg-glass font-mono" />
            </FormField>
            <FormField label="Conexión" htmlFor="conex">
              <Input id="conex" value={conexion} onChange={(e) => setConexion(e.target.value)} placeholder="Dyn5, Yyn0" className="h-10 border-glass bg-glass font-mono" />
            </FormField>
            <FormField label="Grupo vectorial" htmlFor="vect">
              <Input id="vect" value={grupoVect} onChange={(e) => setGrupoVect(e.target.value)} placeholder="Yyn0d5" className="h-10 border-glass bg-glass font-mono" />
            </FormField>
            <FormField label="Fases" htmlFor="fases">
              <Select value={fases} onValueChange={(v) => setFases(v as "" | "1" | "3")}>
                <SelectTrigger id="fases" className="h-10 border-glass bg-glass"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Monofásico</SelectItem>
                  <SelectItem value="3">Trifásico</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Frecuencia" htmlFor="freq">
              <Select value={frecuencia} onValueChange={(v) => setFrecuencia(v as "" | "50" | "60")}>
                <SelectTrigger id="freq" className="h-10 border-glass bg-glass"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">50 Hz</SelectItem>
                  <SelectItem value="60">60 Hz</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>
        </Panel>

        {/* Dimensiones */}
        <Panel title="Dimensiones físicas" subtitle="Opcional · útil para logística">
          <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
            <FormField label="Peso (kg)" htmlFor="peso">
              <Input id="peso" type="number" step="0.01" min="0" value={peso}
                onChange={(e) => setPeso(e.target.value === "" ? "" : Number(e.target.value))} className="h-10 border-glass bg-glass font-mono" />
            </FormField>
            <FormField label="Ancho (mm)" htmlFor="ancho">
              <Input id="ancho" type="number" min="0" value={ancho}
                onChange={(e) => setAncho(e.target.value === "" ? "" : Number(e.target.value))} className="h-10 border-glass bg-glass font-mono" />
            </FormField>
            <FormField label="Alto (mm)" htmlFor="alto">
              <Input id="alto" type="number" min="0" value={alto}
                onChange={(e) => setAlto(e.target.value === "" ? "" : Number(e.target.value))} className="h-10 border-glass bg-glass font-mono" />
            </FormField>
            <FormField label="Profundidad (mm)" htmlFor="prof">
              <Input id="prof" type="number" min="0" value={profundidad}
                onChange={(e) => setProfundidad(e.target.value === "" ? "" : Number(e.target.value))} className="h-10 border-glass bg-glass font-mono" />
            </FormField>
          </div>
        </Panel>

        {/* Ciclo de vida */}
        <Panel title="Ciclo de vida" subtitle="Origen, ubicación y estado">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <FormField label="Año de fabricación" htmlFor="anio">
              <Input id="anio" type="number" min="1900" max="2200" value={anio}
                onChange={(e) => setAnio(e.target.value === "" ? "" : Number(e.target.value))} placeholder="2024" className="h-10 border-glass bg-glass font-mono" />
            </FormField>
            <FormField label="Fecha puesta en servicio" htmlFor="fserv">
              <Input id="fserv" type="date" value={fechaServicio} onChange={(e) => setFechaServicio(e.target.value)} className="h-10 border-glass bg-glass" />
            </FormField>
            <FormField label="Estado actual" htmlFor="estado">
              <Select value={estado} onValueChange={(v) => setEstado(v as EstadoTransformador)}>
                <SelectTrigger id="estado" className="h-10 border-glass bg-glass"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en_servicio">En servicio</SelectItem>
                  <SelectItem value="en_taller">En taller</SelectItem>
                  <SelectItem value="en_almacen">En almacén</SelectItem>
                  <SelectItem value="fuera_de_servicio">Fuera de servicio</SelectItem>
                  <SelectItem value="dado_de_baja">Dado de baja</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          </div>
          <div className="mt-5 space-y-5">
            <FormField label="Ubicación actual" htmlFor="ubic">
              <Input id="ubic" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)}
                placeholder="Ej: Subestación Refinería Esmeraldas, sector A" className="h-10 border-glass bg-glass" />
            </FormField>
            <FormField label="Observaciones" htmlFor="obs">
              <Textarea id="obs" rows={3} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} className="border-glass bg-glass" />
            </FormField>
          </div>
        </Panel>

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-300 inset-highlight" role="alert">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-glass pt-5">
          <button type="button" onClick={() => router.push("/transformadores")} disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-4 py-2 text-sm font-medium text-foreground/90 transition hover:border-glass-strong hover:bg-glass-elev disabled:opacity-40">
            Cancelar
          </button>
          <button type="submit" disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-4 py-2 text-sm font-medium text-white shadow-sm glow-copper-sm inset-highlight-md transition hover:glow-copper disabled:opacity-60">
            {submitting ? "Creando…" : "Crear transformador"}
          </button>
        </div>
      </form>

      <Toaster richColors position="top-right" theme="dark" />
    </div>
  );
}

function FormField({
  label, required, htmlFor, children,
}: {
  label: string; required?: boolean; htmlFor?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}{required && <span className="ml-1 text-copper">*</span>}
      </Label>
      {children}
    </div>
  );
}
