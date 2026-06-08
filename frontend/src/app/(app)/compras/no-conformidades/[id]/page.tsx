"use client";

import { useEffect, useState, useCallback, use as usePromise } from "react";
import Link from "next/link";
import { ChevronLeft, AlertTriangle } from "lucide-react";
import { Toaster, toast } from "sonner";
import { PageHeader, HeaderActionGhost } from "@/components/page-header";
import { Panel } from "@/components/panel";
import {
  NoConformidad,
  estadoBadge,
  getNoConformidad,
  patchNoConformidad,
  cerrarNoConformidad,
} from "@/lib/no-conformidades";
import { ApiError } from "@/lib/api";

function actionClass(tone: "primary" | "ghost" | "danger") {
  if (tone === "primary")
    return "inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-3.5 py-2 text-xs font-medium text-white glow-copper-sm inset-highlight-md transition hover:glow-copper disabled:opacity-60";
  if (tone === "danger")
    return "inline-flex items-center gap-1.5 rounded-lg border border-red-800/50 bg-red-950/40 px-3.5 py-2 text-xs font-medium text-red-400 transition hover:bg-red-950/60 disabled:opacity-60";
  return "inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-3.5 py-2 text-xs font-medium text-foreground/90 transition hover:border-glass-strong hover:bg-glass-elev disabled:opacity-60";
}

const TIPO_LABEL: Record<string, string> = {
  cantidad:      "Cantidad",
  calidad:       "Calidad",
  documentacion: "Documentación",
  otro:          "Otro",
};

export default function NoConformidadDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const ncId = Number(id);

  const [nc, setNc] = useState<NoConformidad | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [accion, setAccion] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getNoConformidad(ncId);
      setNc(res.data);
      setAccion(res.data.accion_tomada ?? "");
    } catch (err) {
      toast.error(err instanceof ApiError ? `Error ${err.status}` : "Error cargando no conformidad");
    } finally {
      setLoading(false);
    }
  }, [ncId]);

  useEffect(() => { load(); }, [load]);

  async function handleGuardarAccion() {
    if (!accion.trim()) { toast.warning("Escribí una acción antes de guardar"); return; }
    setBusy(true);
    try {
      await patchNoConformidad(ncId, { accion_tomada: accion.trim(), estado: "en_proceso" });
      toast.success("Acción guardada · estado → En proceso");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function handleCerrar() {
    setBusy(true);
    try {
      await cerrarNoConformidad(ncId);
      toast.success("No conformidad cerrada");
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? String((err.body as { error?: string })?.error ?? err.status) : "Error");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !nc) {
    return (
      <div className="flex h-[40vh] items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-copper border-t-transparent" />
          <span className="text-sm">Cargando no conformidad…</span>
        </div>
      </div>
    );
  }

  const badge = estadoBadge(nc.estado);

  return (
    <div>
      <PageHeader
        breadcrumb={[
          { href: "/dashboard", label: "Panel" },
          { href: "/compras", label: "Compras" },
          { href: "/compras/no-conformidades", label: "No conformidades" },
          { label: nc.codigo },
        ]}
        title={nc.codigo}
        titleAccent="no conformidad"
        meta={
          <>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
              {nc.estado !== "cerrada" && <AlertTriangle className="h-3 w-3" />}
              {badge.label}
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span className="capitalize text-foreground/80">{TIPO_LABEL[nc.tipo] ?? nc.tipo}</span>
            {nc.proveedores && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-foreground/80">{nc.proveedores.razon_social}</span>
              </>
            )}
          </>
        }
        actions={
          <HeaderActionGhost href="/compras/no-conformidades" icon={<ChevronLeft className="h-3.5 w-3.5" />}>
            Volver
          </HeaderActionGhost>
        }
      />

      <div className="space-y-6 pt-6">
        {/* Info general */}
        <Panel title="Información general">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm md:grid-cols-2">
            <KVPair label="Código" value={nc.codigo} mono />
            <KVPair label="Tipo" value={TIPO_LABEL[nc.tipo] ?? nc.tipo} />
            <KVPair label="Estado" value={badge.label} />
            <KVPair
              label="Recepción"
              value={
                <Link href={`/compras/recepciones/${nc.recepcion_id}`} className="text-copper hover:underline font-mono">
                  #{nc.recepcion_id}
                </Link>
              }
            />
            {nc.proveedores && <KVPair label="Proveedor" value={nc.proveedores.razon_social} />}
            <KVPair
              label="Fecha creación"
              value={new Date(nc.created_at).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}
              mono
            />
            {nc.fecha_cierre && (
              <KVPair
                label="Fecha cierre"
                value={new Date(nc.fecha_cierre).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })}
                mono
              />
            )}
            {nc.costo_impacto != null && (
              <KVPair
                label="Costo de impacto"
                value={`$${Number(nc.costo_impacto).toFixed(2)}`}
                mono
              />
            )}
          </dl>
        </Panel>

        {/* Descripción */}
        <Panel title="Descripción del problema">
          <p className="text-sm text-foreground/90 whitespace-pre-wrap">{nc.descripcion}</p>
        </Panel>

        {/* Accion tomada (visible cuando cerrada, fallback si no hay texto) */}
        {nc.estado === "cerrada" && (
          <Panel title="Accion tomada">
            <p className="text-sm text-foreground/90 whitespace-pre-wrap">
              {nc.accion_tomada ?? <span className="text-muted-foreground/60 italic">Sin accion registrada</span>}
            </p>
          </Panel>
        )}

        {/* Formulario de acción (si no está cerrada) */}
        {nc.estado !== "cerrada" && (
          <Panel title="Gestión de la no conformidad" subtitle="Registrá la acción correctiva y cerrá cuando esté resuelta">
            <div className="space-y-4">
              {nc.accion_tomada && (
                <div className="rounded-lg border border-glass-mid bg-glass p-3 text-sm text-foreground/80">
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Última acción registrada
                  </p>
                  <p className="whitespace-pre-wrap">{nc.accion_tomada}</p>
                </div>
              )}
              <div>
                <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Acción correctiva
                </label>
                <textarea
                  rows={4}
                  value={accion}
                  onChange={(e) => setAccion(e.target.value)}
                  placeholder="Describe qué se hizo para resolver o mitigar el problema…"
                  className="w-full resize-none rounded-lg border border-glass-mid bg-glass px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-copper focus:outline-none focus:ring-1 focus:ring-copper/30"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={handleGuardarAccion} disabled={busy} className={actionClass("primary")}>
                  Guardar acción
                </button>
                <button type="button" onClick={handleCerrar} disabled={busy} className={actionClass("danger")}>
                  <AlertTriangle className="h-3 w-3" />
                  Cerrar NC
                </button>
                <span className="self-center text-xs text-muted-foreground/60">
                  Cerrar marca el problema como resuelto y registra la fecha de cierre.
                </span>
              </div>
            </div>
          </Panel>
        )}
      </div>

      <Toaster richColors theme="dark" />
    </div>
  );
}

function KVPair({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className="mb-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`text-sm text-foreground/90 ${mono ? "font-mono" : ""}`}>{value ?? "—"}</dd>
    </div>
  );
}
