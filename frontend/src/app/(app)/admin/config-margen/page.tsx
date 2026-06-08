"use client";

import { useEffect, useState } from "react";
import { Toaster, toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Panel } from "@/components/panel";
import { getConfigMargen, ConfigMargenRow } from "@/lib/cotizaciones";
import { api } from "@/lib/api";

const TIPO_LABEL: Record<string, string> = {
  fabricacion:   "Fabricación",
  mantenimiento: "Mantenimiento",
  reparacion:    "Reparación",
  otro:          "Otro / Sin clasificar",
};

export default function ConfigMargenPage() {
  const [rows, setRows] = useState<ConfigMargenRow[]>([]);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getConfigMargen()
      .then(setRows)
      .catch(() => toast.error("Error cargando umbrales"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(tipo: string) {
    const val = Number(editing[tipo]);
    if (isNaN(val) || val < 0 || val > 100) {
      toast.error("El margen debe estar entre 0 y 100");
      return;
    }
    setSaving(tipo);
    try {
      await api.patch(`/api/cotizaciones/config-margen/${tipo}`, { margen_minimo: val });
      setRows((prev) =>
        prev.map((r) => (r.tipo_servicio === tipo ? { ...r, margen_minimo: String(val) } : r))
      );
      const next = { ...editing };
      delete next[tipo];
      setEditing(next);
      toast.success(`Umbral de ${TIPO_LABEL[tipo] ?? tipo} actualizado`);
    } catch {
      toast.error("Error al guardar. Verificá que tenés permiso.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      <PageHeader
        breadcrumb={[
          { href: "/dashboard", label: "Panel" },
          { href: "/admin/usuarios", label: "Administración" },
          { label: "Márgenes mínimos" },
        ]}
        title="Márgenes"
        titleAccent="mínimos"
      />

      <div className="pt-6">
        <Panel
          title="Umbrales por tipo de servicio"
          subtitle="Solo presidencia y gerencia general pueden modificarlos"
        >
          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => (
                <div
                  key={row.tipo_servicio}
                  className="flex items-center gap-4 rounded-xl border border-glass bg-glass px-5 py-4 inset-highlight"
                >
                  <div className="flex-1">
                    <div className="font-display text-sm font-semibold text-foreground">
                      {TIPO_LABEL[row.tipo_servicio] ?? row.tipo_servicio}
                    </div>
                    {row.updated_at && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Actualizado:{" "}
                        {new Date(row.updated_at).toLocaleDateString("es-EC", {
                          timeZone: "America/Guayaquil",
                        })}
                      </div>
                    )}
                  </div>

                  {editing[row.tipo_servicio] !== undefined ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={editing[row.tipo_servicio]}
                        onChange={(e) =>
                          setEditing((prev) => ({ ...prev, [row.tipo_servicio]: e.target.value }))
                        }
                        className="w-20 rounded-lg border border-glass-mid bg-background/60 px-2 py-1 text-center text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-copper"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                      <button
                        type="button"
                        onClick={() => handleSave(row.tipo_servicio)}
                        disabled={saving === row.tipo_servicio}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-copper to-copper-deep px-3 py-1.5 text-xs font-medium text-white shadow-sm glow-copper-sm inset-highlight-md transition hover:glow-copper disabled:opacity-50"
                      >
                        {saving === row.tipo_servicio ? "…" : "Guardar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next = { ...editing };
                          delete next[row.tipo_servicio];
                          setEditing(next);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-3 py-1.5 text-xs font-medium text-foreground/90 transition hover:border-glass-strong hover:bg-glass-elev"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-lg font-semibold text-foreground">
                        {Number(row.margen_minimo).toFixed(1)}%
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setEditing((prev) => ({ ...prev, [row.tipo_servicio]: row.margen_minimo }))
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-glass-mid bg-glass px-3 py-1.5 text-xs font-medium text-foreground/90 transition hover:border-glass-strong hover:bg-glass-elev"
                      >
                        Editar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Toaster richColors position="top-right" theme="dark" />
    </div>
  );
}
