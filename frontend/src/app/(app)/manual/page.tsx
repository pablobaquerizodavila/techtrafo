"use client";

import { useEffect, useState } from "react";
import {
  BookOpen, Download, Workflow, Users, ListOrdered, ShieldCheck, Eye, EyeOff,
} from "lucide-react";
import { PageHeader, HeaderActionPrimary } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Manual, ManualEtapa, getManual, descargarManualPdf } from "@/lib/manual";
import { ApiError } from "@/lib/api";

export default function ManualPage() {
  const [manual, setManual] = useState<Manual | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bajando, setBajando] = useState(false);

  useEffect(() => {
    getManual()
      .then((r) => setManual(r.data))
      .catch((e) => setError(e instanceof ApiError ? `Error ${e.status}` : "No se pudo cargar el manual"))
      .finally(() => setLoading(false));
  }, []);

  async function bajarPdf() {
    setBajando(true);
    setError(null);
    try {
      await descargarManualPdf();
    } catch {
      setError("No se pudo generar el PDF");
    } finally {
      setBajando(false);
    }
  }

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { label: "Manual" }]}
        title="Manual de"
        titleAccent="procesos"
        liveIndicator={{ label: "vivo", tone: "green" }}
        meta={
          manual ? (
            <span>Generado del sistema · {manual.generado.slice(0, 10)} · se actualiza con cada cambio del panel</span>
          ) : undefined
        }
        actions={
          <HeaderActionPrimary onClick={bajarPdf} icon={<Download className="h-4 w-4" />}>
            {bajando ? "Generando…" : "Descargar PDF"}
          </HeaderActionPrimary>
        }
      />

      {loading && <p className="mt-8 text-sm text-muted-foreground">Cargando manual…</p>}
      {error && <p className="mt-8 text-sm text-rose-400">{error}</p>}

      {manual && (
        <div className="mt-6 space-y-6">
          {/* Resumen ejecutivo */}
          <Panel title="Resumen ejecutivo" icon={<BookOpen className="h-4 w-4" />}>
            <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
              {manual.resumen.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </Panel>

          {/* Pipeline */}
          <Panel title="Pipeline completo" subtitle="orden de ejecución" icon={<ListOrdered className="h-4 w-4" />} padded={false}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead>Etapa</TableHead>
                  <TableHead>Responsable / aprueba</TableHead>
                  <TableHead className="text-right">SLA</TableHead>
                  <TableHead className="text-center">Cliente</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {manual.pipeline.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-center font-mono text-xs text-muted-foreground">{e.orden}</TableCell>
                    <TableCell className="font-medium">{e.nombre}</TableCell>
                    <TableCell>
                      {e.aprueba ? (
                        <Badge variant="warning">aprueba {e.aprueba}</Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">{e.responsable}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">{e.sla}</TableCell>
                    <TableCell className="text-center">
                      {e.visible_cliente ? (
                        <Eye className="mx-auto h-4 w-4 text-green-400" />
                      ) : (
                        <EyeOff className="mx-auto h-4 w-4 text-muted-foreground/50" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>

          {/* Procesos en detalle */}
          {manual.procesos.map((proc) => (
            <Panel key={proc.clave} title={proc.titulo} icon={<Workflow className="h-4 w-4" />}>
              <p className="mb-4 text-sm text-muted-foreground">{proc.resumen}</p>
              <div className="space-y-2.5">
                {proc.etapas.map((e, i) => (
                  <EtapaCard key={i} etapa={e} />
                ))}
              </div>
            </Panel>
          ))}

          {/* Matriz de roles */}
          <Panel title="Matriz de roles" subtitle="quién hace qué" icon={<Users className="h-4 w-4" />} padded={false}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rol</TableHead>
                  <TableHead>Función principal</TableHead>
                  <TableHead>Acceso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {manual.roles.map((r) => (
                  <TableRow key={r.nombre}>
                    <TableCell className="font-medium">{r.etiqueta}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.funcion}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {r.accesos.map((a) => (
                          <Badge key={a} variant={a === "Acceso total" ? "success" : "muted"}>{a}</Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>

          <p className="flex items-center gap-1.5 pb-4 font-mono text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            El pipeline, los SLA y los permisos reflejan el estado real del panel en tiempo real.
          </p>
        </div>
      )}
    </div>
  );
}

function EtapaCard({ etapa: e }: { etapa: ManualEtapa }) {
  return (
    <div className="rounded-lg border border-glass bg-glass p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{e.nombre}</span>
        {e.aprueba && <Badge variant="warning">aprueba {e.aprueba}</Badge>}
        {e.sla && e.sla !== "—" && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">SLA {e.sla}</span>
        )}
      </div>
      {e.descripcion && <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{e.descripcion}</p>}
      <div className="mt-2.5 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        <Campo label="Quién lo hace" value={e.responsable} />
        <Campo label="En el panel" value={e.pantalla} />
        <Campo label="Dispara" value={e.dispara} />
      </div>
    </div>
  );
}

function Campo({ label, value }: { label: string; value: string }) {
  if (!value || value === "—") return null;
  return (
    <div className="flex gap-2 text-[11px]">
      <span className="shrink-0 font-mono uppercase tracking-wider text-muted-foreground/70">{label}:</span>
      <span className="text-foreground/85">{value}</span>
    </div>
  );
}
