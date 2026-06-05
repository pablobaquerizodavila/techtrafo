"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookOpen, Download, Workflow, Users, Network, ShieldCheck, Eye, EyeOff,
  GitBranch, ArrowRight, UserCheck, Filter,
} from "lucide-react";
import { PageHeader, HeaderActionPrimary, HeaderActionGhost } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Manual, MiRol, ManualEtapa, getManual, descargarManualPdf, etapaEsDelRol } from "@/lib/manual";
import { ApiError } from "@/lib/api";

export default function ManualPage() {
  const [manual, setManual] = useState<Manual | null>(null);
  const [miRol, setMiRol] = useState<MiRol | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bajando, setBajando] = useState(false);
  const [soloMiRol, setSoloMiRol] = useState(false);

  useEffect(() => {
    getManual()
      .then((r) => { setManual(r.data); setMiRol(r.miRol); })
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

  const rolNombre = miRol?.rol_nombre ?? null;
  const accesoTotal = miRol?.accesoTotal ?? false;

  const { miEtiqueta, misCount } = useMemo(() => {
    if (!manual) return { miEtiqueta: rolNombre ?? "—", misCount: 0 };
    const etiqueta = manual.roles.find((r) => r.nombre === rolNombre)?.etiqueta ?? (rolNombre ?? "—");
    const todas = [...manual.pipeline, ...manual.procesos.flatMap((p) => p.etapas)];
    const count = todas.filter((e) => etapaEsDelRol(e, rolNombre)).length;
    return { miEtiqueta: etiqueta, misCount: count };
  }, [manual, rolNombre]);

  // El toggle solo tiene sentido si el rol ejecuta etapas y no tiene acceso total.
  const puedeFiltrar = !accesoTotal && misCount > 0;
  const filtrar = puedeFiltrar && soloMiRol;

  return (
    <div>
      <PageHeader
        breadcrumb={[{ href: "/dashboard", label: "Panel" }, { label: "Manual" }]}
        title="Manual de"
        titleAccent="procesos"
        liveIndicator={{ label: "vivo", tone: "green" }}
        meta={manual ? <span>Generado del sistema · {manual.generado.slice(0, 10)} · se actualiza con cada cambio del panel</span> : undefined}
        actions={
          <>
            {puedeFiltrar && (
              <HeaderActionGhost onClick={() => setSoloMiRol((v) => !v)} icon={<Filter className="h-4 w-4" />}>
                {filtrar ? "Ver todo" : "Solo mi rol"}
              </HeaderActionGhost>
            )}
            <HeaderActionPrimary onClick={bajarPdf} icon={<Download className="h-4 w-4" />}>
              {bajando ? "Generando…" : "Descargar PDF"}
            </HeaderActionPrimary>
          </>
        }
      />

      {loading && <p className="mt-8 text-sm text-muted-foreground">Cargando manual…</p>}
      {error && <p className="mt-8 text-sm text-rose-400">{error}</p>}

      {manual && (
        <div className="mt-6 space-y-6">
          {/* Banner "mi rol" */}
          {rolNombre && (
            <div className="flex items-start gap-3 rounded-xl border border-copper/25 bg-copper/[0.06] px-4 py-3">
              <UserCheck className="mt-0.5 h-5 w-5 shrink-0 text-copper" />
              <div className="text-sm">
                <span className="font-medium">Tu rol: {miEtiqueta}.</span>{" "}
                {accesoTotal ? (
                  <span className="text-muted-foreground">Tenés acceso total — participás en la supervisión de todo el flujo.</span>
                ) : misCount > 0 ? (
                  <span className="text-muted-foreground">
                    Intervenís en <span className="text-copper">{misCount}</span> {misCount === 1 ? "etapa" : "etapas"} (resaltadas en cobre).
                    {" "}Usá <span className="text-foreground">“Solo mi rol”</span> para enfocarte en ellas.
                  </span>
                ) : (
                  <span className="text-muted-foreground">Tu trabajo es transversal / de consulta; no ejecutás etapas del pipeline operativo.</span>
                )}
              </div>
            </div>
          )}

          {/* Resumen ejecutivo */}
          <Panel title="Resumen ejecutivo" icon={<BookOpen className="h-4 w-4" />}>
            <div className="space-y-3 text-sm leading-relaxed text-foreground/90">
              {manual.resumen.map((p, i) => <p key={i}>{p}</p>)}
            </div>
          </Panel>

          {/* Diagrama de flujo del proceso operativo */}
          <Panel title="Flujo del proceso operativo" subtitle="del lead al cierre" icon={<Network className="h-4 w-4" />}>
            <PipelineDiagram etapas={manual.pipeline} rolNombre={rolNombre} filtrar={filtrar} />
          </Panel>

          {/* Detalle por proceso */}
          {manual.procesos.map((proc) => {
            const etapasMostradas = filtrar ? proc.etapas.filter((e) => etapaEsDelRol(e, rolNombre)) : proc.etapas;
            if (filtrar && etapasMostradas.length === 0) return null;
            return (
              <Panel key={proc.clave} title={proc.titulo} icon={<Workflow className="h-4 w-4" />}>
                <p className="mb-3 text-sm text-muted-foreground">{proc.resumen}</p>
                {proc.clave !== "operativo" && <MiniFlow etapas={proc.etapas} rolNombre={rolNombre} />}
                <div className="mt-4 space-y-2.5">
                  {etapasMostradas.map((e, i) => (
                    <EtapaCard key={i} etapa={e} mine={etapaEsDelRol(e, rolNombre)} />
                  ))}
                </div>
              </Panel>
            );
          })}

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
                {manual.roles.map((r) => {
                  const yo = r.nombre === rolNombre;
                  return (
                    <TableRow key={r.nombre} className={yo ? "bg-copper/[0.06]" : undefined}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          {r.etiqueta}
                          {yo && <Badge variant="warning">Tú</Badge>}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.funcion}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {r.accesos.map((a) => (
                            <Badge key={a} variant={a === "Acceso total" ? "success" : "muted"}>{a}</Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
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

/* ----------------------------- Diagrama de flujo ----------------------------- */
function PipelineDiagram({ etapas, rolNombre, filtrar }: { etapas: ManualEtapa[]; rolNombre: string | null; filtrar: boolean }) {
  return (
    <div>
      {etapas.map((e, i) => {
        const mine = etapaEsDelRol(e, rolNombre);
        const dim = filtrar && !mine;
        const last = i === etapas.length - 1;
        return (
          <div key={i} className={`flex gap-4 transition-opacity ${dim ? "opacity-30" : ""}`}>
            {/* Columna del conector */}
            <div className="flex flex-col items-center">
              <div
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border font-mono text-xs ${
                  mine ? "border-copper bg-copper/15 text-copper" : "border-glass-mid bg-glass text-muted-foreground"
                }`}
              >
                {e.ramas ? <GitBranch className="h-4 w-4" /> : e.orden}
              </div>
              {!last && <div className="my-1 w-px flex-1 bg-glass-mid" />}
            </div>
            {/* Contenido */}
            <div className="flex-1 pb-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-sm ${mine ? "font-semibold text-copper" : "font-medium"}`}>{e.nombre}</span>
                {mine && <Badge variant="warning">Tu rol</Badge>}
                {e.aprueba && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] text-amber-300">
                    ⟂ aprueba {e.aprueba}
                  </span>
                )}
                {e.sla && e.sla !== "—" && (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{e.sla}</span>
                )}
                {e.visible_cliente ? (
                  <Eye className="h-3.5 w-3.5 text-green-400" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5 text-muted-foreground/40" />
                )}
              </div>
              {/* Bifurcación de producción */}
              {e.ramas && (
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {e.ramas.map((r) => (
                    <div key={r.tipo} className="rounded-lg border border-glass bg-glass p-2.5">
                      <div className="font-mono text-[10px] uppercase tracking-wider text-copper">{r.tipo}</div>
                      <div className="mt-1.5 flex flex-col gap-1">
                        {r.pasos.map((p, j) => (
                          <span key={j} className="text-xs text-foreground/80">{j > 0 && "↳ "}{p}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {e.descripcion && !e.ramas && (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{e.descripcion}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------ Mini-flujo (procesos cortos) ----------------------- */
function MiniFlow({ etapas, rolNombre }: { etapas: ManualEtapa[]; rolNombre: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {etapas.map((e, i) => {
        const mine = etapaEsDelRol(e, rolNombre);
        return (
          <span key={i} className="flex items-center gap-1.5">
            <span
              className={`rounded-md border px-2 py-1 text-[11px] ${
                mine ? "border-copper/40 bg-copper/10 text-copper" : "border-glass bg-glass text-foreground/80"
              }`}
            >
              {e.nombre}
            </span>
            {i < etapas.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground/50" />}
          </span>
        );
      })}
    </div>
  );
}

/* ------------------------------- Etapa (detalle) ----------------------------- */
function EtapaCard({ etapa: e, mine }: { etapa: ManualEtapa; mine: boolean }) {
  return (
    <div className={`rounded-lg border bg-glass p-3.5 ${mine ? "border-copper/40" : "border-glass"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-sm font-medium ${mine ? "text-copper" : ""}`}>{e.nombre}</span>
        {mine && <Badge variant="warning">Tu rol</Badge>}
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
