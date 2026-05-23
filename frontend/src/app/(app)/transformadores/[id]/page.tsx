"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft, Zap, User, MapPin, Calendar, Factory, ExternalLink,
  Wrench, CheckCircle2, Clock, History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "sonner";
import {
  Transformador, estadoLabel, estadoVariant, formatCapacidad, getTransformador, tipoLabel,
} from "@/lib/transformadores";
import { ApiError } from "@/lib/api";

interface PageProps { params: Promise<{ id: string }> }

export default function TransformadorDetallePage({ params }: PageProps) {
  const [id, setId] = useState<number | null>(null);
  const [trf, setTrf] = useState<Transformador | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { params.then(({ id }) => setId(Number(id))); }, [params]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getTransformador(id);
      setTrf(res.data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setError("Transformador no encontrado");
      else setError(err instanceof Error ? err.message : "Error cargando");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);

  if (loading && !trf) return <div className="text-muted-foreground">Cargando...</div>;
  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/transformadores"><ChevronLeft className="mr-1 h-4 w-4" /> Volver</Link>
        </Button>
        <p className="text-destructive">{error}</p>
      </div>
    );
  }
  if (!trf) return null;

  const ot = trf.ot ?? [];
  const stats = trf.historial_stats;

  return (
    <div className="space-y-6">
      <header>
        <Button variant="ghost" size="sm" asChild className="mb-2">
          <Link href="/transformadores"><ChevronLeft className="mr-1 h-4 w-4" /> Volver</Link>
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-3xl font-bold">
              <Zap className="h-7 w-7" /> {trf.codigo_interno ?? `Transformador #${trf.id}`}
            </h2>
            <p className="text-muted-foreground">
              {trf.marca && trf.modelo ? `${trf.marca} ${trf.modelo}` : trf.marca ?? trf.modelo ?? "Sin marca/modelo"}
              {trf.numero_serie && <> · serie <span className="font-mono">{trf.numero_serie}</span></>}
            </p>
          </div>
          <Badge variant={estadoVariant(trf.estado)} className="text-base">
            {estadoLabel(trf.estado).toUpperCase()}
          </Badge>
        </div>
      </header>

      {/* Stats banner */}
      {stats && stats.total_intervenciones > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard icon={<History className="h-4 w-4" />} label="Total intervenciones" value={stats.total_intervenciones} />
          <StatCard icon={<CheckCircle2 className="h-4 w-4 text-green-700" />} label="Completadas" value={stats.completadas} />
          <StatCard icon={<Clock className="h-4 w-4 text-primary" />} label="En curso" value={stats.en_curso} />
          <div className="rounded-md border p-3">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="h-4 w-4" /> Última intervención
            </div>
            <p className="text-sm font-semibold">
              {stats.ultima_intervencion ? new Date(stats.ultima_intervencion).toLocaleDateString("es-EC") : "—"}
            </p>
          </div>
        </div>
      )}

      {/* Características técnicas */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-md border p-4">
          <h3 className="mb-3 text-sm font-semibold">Características técnicas</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Tipo:</dt><dd>{tipoLabel(trf.tipo)}</dd>
            <dt className="text-muted-foreground">Capacidad:</dt><dd className="font-mono font-semibold">{formatCapacidad(trf.capacidad_kva)}</dd>
            <dt className="text-muted-foreground">Tensión primaria:</dt><dd className="font-mono">{trf.tension_primaria_kv != null ? `${trf.tension_primaria_kv} kV` : "—"}</dd>
            <dt className="text-muted-foreground">Tensión secundaria:</dt><dd className="font-mono">{trf.tension_secundaria_v != null ? `${trf.tension_secundaria_v} V` : "—"}</dd>
            <dt className="text-muted-foreground">Conexión:</dt><dd>{trf.conexion ?? "—"}</dd>
            <dt className="text-muted-foreground">Grupo vectorial:</dt><dd>{trf.grupo_vectorial ?? "—"}</dd>
            <dt className="text-muted-foreground">Fases:</dt><dd>{trf.numero_fases ? `${trf.numero_fases}φ` : "—"}</dd>
            <dt className="text-muted-foreground">Frecuencia:</dt><dd>{trf.frecuencia_hz ? `${trf.frecuencia_hz} Hz` : "—"}</dd>
            <dt className="text-muted-foreground">Refrigeración:</dt><dd>{trf.refrigeracion ?? "—"}</dd>
            <dt className="text-muted-foreground">Año fabricación:</dt><dd>{trf.anio_fabricacion ?? "—"}</dd>
          </dl>
        </div>

        <div className="space-y-4">
          {/* Cliente */}
          <div className="rounded-md border p-4">
            <h3 className="mb-2 text-sm font-semibold">Cliente propietario</h3>
            {trf.clientes ? (
              <div className="space-y-1 text-sm">
                <p className="flex items-center gap-2 font-medium"><User className="h-4 w-4 text-muted-foreground" />{trf.clientes.razon_social}</p>
                <p className="text-xs text-muted-foreground font-mono">{trf.clientes.ruc_cedula}</p>
                {trf.clientes.email && <p className="text-xs text-muted-foreground">{trf.clientes.email}</p>}
                {trf.clientes.telefono && <p className="text-xs text-muted-foreground">{trf.clientes.telefono}</p>}
              </div>
            ) : <p className="text-sm text-muted-foreground">— Sin asignar —</p>}
          </div>

          {/* Dimensiones */}
          {(trf.peso_kg || trf.ancho_mm || trf.alto_mm || trf.profundidad_mm) && (
            <div className="rounded-md border p-4">
              <h3 className="mb-2 text-sm font-semibold">Dimensiones</h3>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {trf.peso_kg && <><dt className="text-muted-foreground">Peso:</dt><dd>{trf.peso_kg} kg</dd></>}
                {trf.ancho_mm && <><dt className="text-muted-foreground">Ancho:</dt><dd>{trf.ancho_mm} mm</dd></>}
                {trf.alto_mm && <><dt className="text-muted-foreground">Alto:</dt><dd>{trf.alto_mm} mm</dd></>}
                {trf.profundidad_mm && <><dt className="text-muted-foreground">Profundidad:</dt><dd>{trf.profundidad_mm} mm</dd></>}
              </dl>
            </div>
          )}

          {trf.ubicacion_actual && (
            <div className="rounded-md border p-4 text-sm">
              <h3 className="mb-2 text-sm font-semibold">Ubicación actual</h3>
              <p className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" /> {trf.ubicacion_actual}
              </p>
            </div>
          )}
        </div>
      </section>

      {trf.observaciones && (
        <div className="rounded-md border bg-muted/20 p-4 text-sm">
          <h3 className="mb-1 font-semibold">Observaciones</h3>
          <p className="whitespace-pre-wrap text-muted-foreground">{trf.observaciones}</p>
        </div>
      )}

      {/* Historial de OT */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-xl font-bold">
            <Wrench className="h-5 w-5" /> Historial de intervenciones ({ot.length})
          </h3>
        </div>
        {ot.length === 0 ? (
          <p className="rounded-md border bg-muted/20 p-6 text-center text-muted-foreground">
            Este transformador todavía no tiene OT registradas
          </p>
        ) : (
          <ul className="space-y-2">
            {ot.map((o) => (
              <li key={o.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      <Link href={`/ot/${o.id}`} className="font-mono text-primary hover:underline">{o.codigo}</Link>
                      <Badge variant="outline" className="ml-2 text-xs">{o.tipo_ruta}</Badge>
                      <Badge variant="outline" className="ml-1 text-xs">{o.prioridad}</Badge>
                    </p>
                    {o.descripcion && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{o.descripcion}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Creada: {new Date(o.created_at).toLocaleDateString("es-EC")}
                      {o.fecha_inicio_real && ` · iniciada ${new Date(o.fecha_inicio_real).toLocaleDateString("es-EC")}`}
                      {o.fecha_fin_real && ` · finalizada ${new Date(o.fecha_fin_real).toLocaleDateString("es-EC")}`}
                      {o.contratos?.codigo && ` · contrato ${o.contratos.codigo}`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={o.estado === "completada" ? "success" : o.estado === "cancelada" ? "destructive" : "default"}>
                      {o.estado}
                    </Badge>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/ot/${o.id}`}>Abrir <ExternalLink className="ml-1 h-3 w-3" /></Link>
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Toaster richColors position="top-right" />
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
        {icon} {label}
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
