"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Toaster, toast } from "sonner";
import { Cliente, listClientes } from "@/lib/clientes";
import {
  CreateTransformador, EstadoTransformador, TipoTransformador,
  createTransformador,
} from "@/lib/transformadores";
import { ApiError } from "@/lib/api";

export default function NuevoTransformadorPage() {
  const router = useRouter();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  // Form state
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
        tipo,
        capacidad_kva: Number(capacidad),
        marca: marca.trim() || null,
        modelo: modelo.trim() || null,
        numero_serie: serie.trim() || null,
        cliente_id: clienteId,
        tension_primaria_kv: tensionPri === "" ? null : Number(tensionPri),
        tension_secundaria_v: tensionSec === "" ? null : Number(tensionSec),
        conexion: conexion.trim() || null,
        grupo_vectorial: grupoVect.trim() || null,
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
        estado,
        observaciones: observaciones.trim() || null,
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
    <div className="space-y-6">
      <header>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link href="/transformadores"><ChevronLeft className="mr-1 h-4 w-4" /> Volver</Link>
        </Button>
        <h2 className="text-3xl font-bold">Nuevo transformador</h2>
        <p className="text-muted-foreground">Solo capacidad y tipo son obligatorios. Las características técnicas las podés completar después.</p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
        {/* Bloque 1: identificación */}
        <fieldset className="space-y-4 rounded-md border p-4">
          <legend className="px-2 text-sm font-semibold">Identificación</legend>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Marca</Label>
              <Input value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Ej: Siemens, ABB" />
            </div>
            <div className="space-y-2">
              <Label>Modelo</Label>
              <Input value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Ej: TPV-500" />
            </div>
            <div className="space-y-2">
              <Label>N° de serie</Label>
              <Input value={serie} onChange={(e) => setSerie(e.target.value)} placeholder="Del fabricante" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Cliente propietario</Label>
            <Select value={clienteId?.toString() ?? "_"} onValueChange={(v) => setClienteId(v === "_" ? null : Number(v))}>
              <SelectTrigger><SelectValue placeholder="Seleccionar cliente (opcional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_">— Sin asignar —</SelectItem>
                {clientes.map((c) => (
                  <SelectItem key={c.id} value={c.id.toString()}>
                    {c.razon_social} ({c.ruc_cedula})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </fieldset>

        {/* Bloque 2: características técnicas */}
        <fieldset className="space-y-4 rounded-md border p-4">
          <legend className="px-2 text-sm font-semibold">Características técnicas</legend>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoTransformador)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
            </div>
            <div className="space-y-2">
              <Label>Capacidad kVA *</Label>
              <Input type="number" min="1" value={capacidad}
                onChange={(e) => setCapacidad(e.target.value === "" ? "" : Number(e.target.value))} required />
              <p className="text-[10px] text-muted-foreground">Ej: 150, 300, 500, 1000 (= 1 MVA), 5000 (= 5 MVA)</p>
            </div>
            <div className="space-y-2">
              <Label>Refrigeración</Label>
              <Input value={refrigeracion} onChange={(e) => setRefrigeracion(e.target.value)} placeholder="ONAN, ONAF, AN..." />
            </div>
            <div className="space-y-2">
              <Label>Tensión primaria (kV)</Label>
              <Input type="number" step="0.001" min="0" value={tensionPri}
                onChange={(e) => setTensionPri(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="13.8, 22.86" />
            </div>
            <div className="space-y-2">
              <Label>Tensión secundaria (V)</Label>
              <Input type="number" min="0" value={tensionSec}
                onChange={(e) => setTensionSec(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="220, 480" />
            </div>
            <div className="space-y-2">
              <Label>Conexión</Label>
              <Input value={conexion} onChange={(e) => setConexion(e.target.value)} placeholder="Dyn5, Yyn0" />
            </div>
            <div className="space-y-2">
              <Label>Grupo vectorial</Label>
              <Input value={grupoVect} onChange={(e) => setGrupoVect(e.target.value)} placeholder="Yyn0d5" />
            </div>
            <div className="space-y-2">
              <Label>Fases</Label>
              <Select value={fases} onValueChange={(v) => setFases(v as "" | "1" | "3")}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Monofásico</SelectItem>
                  <SelectItem value="3">Trifásico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Frecuencia</Label>
              <Select value={frecuencia} onValueChange={(v) => setFrecuencia(v as "" | "50" | "60")}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">50 Hz</SelectItem>
                  <SelectItem value="60">60 Hz</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </fieldset>

        {/* Bloque 3: dimensiones y peso */}
        <fieldset className="space-y-4 rounded-md border p-4">
          <legend className="px-2 text-sm font-semibold">Dimensiones físicas (opcional)</legend>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Peso (kg)</Label>
              <Input type="number" step="0.01" min="0" value={peso}
                onChange={(e) => setPeso(e.target.value === "" ? "" : Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Ancho (mm)</Label>
              <Input type="number" min="0" value={ancho}
                onChange={(e) => setAncho(e.target.value === "" ? "" : Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Alto (mm)</Label>
              <Input type="number" min="0" value={alto}
                onChange={(e) => setAlto(e.target.value === "" ? "" : Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Profundidad (mm)</Label>
              <Input type="number" min="0" value={profundidad}
                onChange={(e) => setProfundidad(e.target.value === "" ? "" : Number(e.target.value))} />
            </div>
          </div>
        </fieldset>

        {/* Bloque 4: ciclo de vida */}
        <fieldset className="space-y-4 rounded-md border p-4">
          <legend className="px-2 text-sm font-semibold">Ciclo de vida</legend>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Año de fabricación</Label>
              <Input type="number" min="1900" max="2200" value={anio}
                onChange={(e) => setAnio(e.target.value === "" ? "" : Number(e.target.value))} placeholder="2024" />
            </div>
            <div className="space-y-2">
              <Label>Fecha puesta en servicio</Label>
              <Input type="date" value={fechaServicio} onChange={(e) => setFechaServicio(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Estado actual</Label>
              <Select value={estado} onValueChange={(v) => setEstado(v as EstadoTransformador)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en_servicio">En servicio</SelectItem>
                  <SelectItem value="en_taller">En taller</SelectItem>
                  <SelectItem value="en_almacen">En almacén</SelectItem>
                  <SelectItem value="fuera_de_servicio">Fuera de servicio</SelectItem>
                  <SelectItem value="dado_de_baja">Dado de baja</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Ubicación actual</Label>
            <Input value={ubicacion} onChange={(e) => setUbicacion(e.target.value)}
              placeholder="Ej: Subestación Refinería Esmeraldas, sector A" />
          </div>
          <div className="space-y-2">
            <Label>Observaciones</Label>
            <Textarea rows={3} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
          </div>
        </fieldset>

        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={() => router.push("/transformadores")} disabled={submitting}>Cancelar</Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creando..." : "Crear transformador"}
          </Button>
        </div>
      </form>

      <Toaster richColors position="top-right" />
    </div>
  );
}
