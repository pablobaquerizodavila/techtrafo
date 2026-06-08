"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getMisOcs, OcResumen } from "@/lib/proveedor-portal";
import { toast } from "sonner";

export default function MisOcsPage() {
  const [ocs, setOcs] = useState<OcResumen[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMisOcs()
      .then((d) => setOcs(d.data))
      .catch(() => toast.error("Error cargando ordenes de compra"))
      .finally(() => setLoading(false));
  }, []);

  function portalEstado(oc: OcResumen): { label: string; className: string } {
    if (oc.factura_proveedor_url) return { label: "Factura subida", className: "bg-green-100 text-green-700" };
    if (oc.acuse_recibo_at) return { label: "Acuse registrado", className: "bg-blue-100 text-blue-700" };
    return { label: "Pendiente de acuse", className: "bg-yellow-100 text-yellow-700" };
  }

  if (loading) return <div className="text-sm text-gray-400 py-12 text-center">Cargando ordenes de compra...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Mis ordenes de compra</h1>
      {ocs.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">No tienes ordenes de compra asignadas.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ocs.map((oc) => {
            const badge = portalEstado(oc);
            return (
              <Link
                key={oc.id}
                href={`/proveedor/oc/${oc.id}`}
                className="flex items-center gap-4 p-4 bg-white border rounded-xl shadow-sm hover:shadow transition-shadow"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-900">{oc.codigo}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.className}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400">
                    {oc._count.orden_compra_lineas} item(s)
                    {oc.fecha_entrega_acordada &&
                      ` - Entrega: ${new Date(oc.fecha_entrega_acordada).toLocaleDateString("es-EC")}`}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-semibold text-gray-900">
                    {oc.moneda}{" "}
                    {Number(oc.total).toLocaleString("es-EC", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
