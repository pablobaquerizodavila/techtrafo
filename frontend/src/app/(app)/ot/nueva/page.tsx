"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { listContratos, Contrato } from "@/lib/contratos";
import { createOT, PrioridadOT, TipoRuta } from "@/lib/ot";
import {
  Transformador, formatCapacidad, listTransformadoresByCliente, tipoLabel as trfTipoLabel,
} from "@/lib/transformadores";
import { ApiError } from "@/lib/api";

function NuevaOTForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectContrato = searchParams.get("contrato");

  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [contratoId, setContratoId] = useState<number | null>(preselectContrato ? Number(preselectContrato) : null);
  const [transformadores, setTransformadores] = useState<Transformador[]>([]);
  const [transformadorId, setTransformadorId] = useState<number | null>(null);
  const [tipoRuta, setTipoRuta] = useState<TipoRuta>("reparacion");
  const [prioridad, setPrioridad] = useState<PrioridadOT>("normal");
  const [descripcion, setDescripcion] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Cargar solo contratos vigentes (firmados y activos)
    listContratos({ limit: 200, estado: "vigente" })
      .then((r) => setContratos(r.data))
      .catch(() => setContratos([]));
  }, []);

  // Al cambiar el contrato, cargar los transformadores del cliente del contrato
  useEffect(() => {
    if (!contratoId) {
      setTransformadores([]);
      setTransformadorId(null);
      return;
    }
    const contrato = contratos.find((c) => c.id === contratoId);
    if (!contrato?.cliente_id) {
      setTransformadores([]);
      setTransformadorId(null);
      return;
    }
    listTransformadoresByCliente(contrato.cliente_id)
      .then((r) => setTransformadores(r.data))
      .catch(() => setTransformadores([]));
  }, [contratoId, contratos]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!contratoId) { setError("Selecciona un contrato"); return; }
    setSubmitting(true);
    try {
      const res = await createOT({
        contrato_id: contratoId,
        tipo_ruta: tipoRuta,
        prioridad,
        descripcion: descripcion.trim() || null,
        fecha_inicio_planeada: fechaInicio || null,
        fecha_fin_planeada: fechaFin || null,
        observaciones: observaciones.trim() || null,
        transformador_id: transformadorId,
      });
      toast.success(`OT ${res.data.codigo} creada`);
      router.push(`/ot/${res.data.id}`);
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
          <Link href="/ot">
            <ChevronLeft className="mr-1 h-4 w-4" /> Volver a OT
          </Link>
        </Button>
        <h2 className="text-3xl font-bold">Nueva orden de trabajo</h2>
        <p className="text-muted-foreground">
          Al guardar se instancian automáticamente los pasos según el tipo de ruta.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-3xl">
        <div className="space-y-2">
          <Label htmlFor="contrato">Contrato vigente *</Label>
          <Select value={contratoId?.toString() ?? ""} onValueChange={(v) => setContratoId(v ? Number(v) : null)}>
            <SelectTrigger id="contrato"><SelectValue placeholder="Selecciona un contrato" /></SelectTrigger>
            <SelectContent>
              {contratos.length === 0 && (
                <SelectItem value="_" disabled>No hay contratos firmados disponibles</SelectItem>
              )}
              {contratos.map((c) => (
                <SelectItem key={c.id} value={c.id.toString()}>
                  {c.codigo} — {c.clientes?.razon_social ?? ""} (${Number(c.monto_total).toFixed(2)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="transformador">Transformador a intervenir</Label>
          <Select
            value={transformadorId?.toString() ?? "_"}
            onValueChange={(v) => setTransformadorId(v === "_" ? null : Number(v))}
            disabled={!contratoId}
          >
            <SelectTrigger id="transformador">
              <SelectValue placeholder={!contratoId ? "Primero seleccioná un contrato" : "— Sin especificar —"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_">— Sin especificar —</SelectItem>
              {transformadores.map((t) => (
                <SelectItem key={t.id} value={t.id.toString()}>
                  {t.codigo_interno ?? `#${t.id}`} · {t.marca ?? ""} {t.modelo ?? ""} · {formatCapacidad(t.capacidad_kva)} · {trfTipoLabel(t.tipo as "distribucion")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {contratoId && transformadores.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Este cliente no tiene transformadores registrados.{" "}
              <Link href="/transformadores/nuevo" className="text-primary hover:underline">Registrar uno</Link>
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="tipo">Tipo de ruta *</Label>
            <Select value={tipoRuta} onValueChange={(v) => setTipoRuta(v as TipoRuta)}>
              <SelectTrigger id="tipo"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="reparacion">Reparación (9 pasos, 2 gates)</SelectItem>
                <SelectItem value="fabricacion">Fabricación (11 pasos, 3 gates)</SelectItem>
                <SelectItem value="mantenimiento">Mantenimiento (6 pasos, 1 gate)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="prioridad">Prioridad</Label>
            <Select value={prioridad} onValueChange={(v) => setPrioridad(v as PrioridadOT)}>
              <SelectTrigger id="prioridad"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="baja">Baja</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="urgente">Urgente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ini">Fecha inicio planeada</Label>
            <Input id="ini" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fin">Fecha fin planeada</Label>
            <Input id="fin" type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} min={fechaInicio} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="desc">Descripción del trabajo</Label>
          <Textarea id="desc" rows={3} value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Ej: Reparación de bobinado primario en transformador 500 KVA, serie TX-1234" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="obs">Observaciones (visibles al cliente)</Label>
          <Textarea id="obs" rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
        </div>

        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={() => router.push("/ot")} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creando..." : "Crear OT"}
          </Button>
        </div>
      </form>

      <Toaster richColors position="top-right" />
    </div>
  );
}

export default function NuevaOTPage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground">Cargando...</div>}>
      <NuevaOTForm />
    </Suspense>
  );
}
