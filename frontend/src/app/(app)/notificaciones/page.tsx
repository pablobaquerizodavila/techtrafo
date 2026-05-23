"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, AlertTriangle, CheckCircle2, XCircle, ClipboardCheck, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Toaster } from "sonner";
import { Notificacion, listNotificaciones } from "@/lib/expedientes";

function iconoTipo(tipo: string) {
  switch (tipo) {
    case "hito_estancado":
      return <AlertTriangle className="h-5 w-5 text-destructive" />;
    case "hito_espera_aprobacion":
      return <ClipboardCheck className="h-5 w-5 text-yellow-700" />;
    case "hito_aprobado":
      return <CheckCircle2 className="h-5 w-5 text-green-700" />;
    case "hito_rechazado":
      return <XCircle className="h-5 w-5 text-destructive" />;
    default:
      return <Bell className="h-5 w-5 text-muted-foreground" />;
  }
}

function labelTipo(tipo: string): string {
  return (
    {
      hito_estancado: "Estancamiento",
      hito_espera_aprobacion: "Esperando aprobación",
      hito_aprobado: "Aprobado",
      hito_rechazado: "Rechazado",
    } as Record<string, string>
  )[tipo] ?? tipo;
}

export default function NotificacionesPage() {
  const [data, setData] = useState<Notificacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listNotificaciones(50);
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando notificaciones");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Notificaciones</h2>
          <p className="text-muted-foreground">Alertas de hitos estancados, aprobaciones y resoluciones</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          Refrescar
        </Button>
      </header>

      {loading && data.length === 0 ? (
        <p className="text-muted-foreground">Cargando...</p>
      ) : error ? (
        <p className="text-destructive">{error}</p>
      ) : data.length === 0 ? (
        <div className="rounded-md border bg-muted/20 p-8 text-center text-muted-foreground">
          <Bell className="mx-auto mb-2 h-8 w-8" />
          <p>Sin notificaciones todavía</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {data.map((n) => {
            const expedienteId = (n.contexto?.["expediente_id"] as number | undefined) ?? null;
            return (
              <li
                key={n.id}
                className={`rounded-md border p-4 ${
                  n.tipo === "hito_estancado" || n.tipo === "hito_rechazado" ? "border-destructive/40 bg-destructive/5" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">{iconoTipo(n.tipo)}</div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium">{n.asunto}</p>
                      <Badge variant={n.enviado ? "success" : "warning"} className="text-xs shrink-0">
                        {n.enviado ? "enviado" : "pendiente"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {labelTipo(n.tipo)} · {new Date(n.created_at).toLocaleString("es-EC")}
                      {n.fecha_envio && ` · enviado ${new Date(n.fecha_envio).toLocaleString("es-EC")}`}
                    </p>
                    {expedienteId && (
                      <Link
                        href={`/expedientes/${expedienteId}`}
                        className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Ver expediente <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Toaster richColors position="top-right" />
    </div>
  );
}
