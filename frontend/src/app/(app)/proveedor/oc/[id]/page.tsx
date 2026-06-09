"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getOcDetalle, acusarRecibo, subirFactura, OcDetalle } from "@/lib/proveedor-portal";
import { toast } from "sonner";

export default function OcDetallePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [oc, setOc] = useState<OcDetalle | null>(null);
  const [factNumero, setFactNumero] = useState("");
  const [factArchivo, setFactArchivo] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!params.id) return;
    getOcDetalle(Number(params.id))
      .then((d) => setOc(d.data))
      .catch(() => toast.error("OC no encontrada"));
  }, [params.id]);

  async function handleAcusar() {
    if (!oc) return;
    setSaving(true);
    try {
      const d = await acusarRecibo(oc.id);
      setOc(d.data);
      toast.success("Acuse de recibo registrado");
    } catch {
      toast.error("Error al registrar acuse de recibo");
    }
    setSaving(false);
  }

  async function handleFactura() {
    if (!oc) return;
    if (!factNumero.trim()) { toast.error("Ingresa el numero de factura"); return; }
    if (!factArchivo) { toast.error("Selecciona el archivo de la factura"); return; }
    setSaving(true);
    try {
      const d = await subirFactura(oc.id, factNumero.trim(), factArchivo);
      setOc(d.data);
      toast.success("Factura registrada");
      setFactNumero("");
      setFactArchivo(null);
    } catch {
      toast.error("Error al subir la factura. Solo se permiten PDF e imagenes (max 20 MB)");
    }
    setSaving(false);
  }

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";

  if (!oc) return <div className="py-12 text-center text-sm text-gray-400">Cargando...</div>;

  return (
    <div>
      <button
        onClick={() => router.push("/proveedor/mis-ocs")}
        className="text-sm text-blue-600 hover:underline mb-4 block"
      >
        &larr; Mis ordenes de compra
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{oc.codigo}</h1>
        <p className="text-sm text-gray-500 mt-1">Estado OC: {oc.estado}</p>
      </div>

      {/* Lineas */}
      <div className="mb-6 bg-white border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">Items de la orden</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="px-4 py-2">Item</th>
              <th className="px-4 py-2 text-right">Cant.</th>
              <th className="px-4 py-2 text-right">Precio unit.</th>
            </tr>
          </thead>
          <tbody>
            {oc.orden_compra_lineas?.map((l) => (
              <tr key={l.id} className="border-t">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{l.items?.descripcion ?? "—"}</div>
                  <div className="text-xs text-gray-400">{l.items?.codigo_interno}</div>
                </td>
                <td className="px-4 py-3 text-right text-gray-700">
                  {Number(l.cantidad)} {l.items?.unidad_medida}
                </td>
                <td className="px-4 py-3 text-right text-gray-700">
                  {Number(l.precio_unitario).toLocaleString("es-EC", { minimumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Acuse de recibo */}
      <div className="mb-4 p-4 bg-white border rounded-xl">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Acuse de recibo</h2>
        {oc.acuse_recibo_at ? (
          <p className="text-sm text-green-700 font-medium">
            Registrado el {new Date(oc.acuse_recibo_at).toLocaleDateString("es-EC")}
          </p>
        ) : (
          <button
            onClick={handleAcusar}
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Registrando..." : "Acusar recibo"}
          </button>
        )}
      </div>

      {/* Factura */}
      <div className="p-4 bg-white border rounded-xl">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Factura</h2>
        {oc.factura_proveedor_url ? (
          <div className="mb-3">
            <p className="text-sm text-green-700 font-medium mb-1">
              Factura registrada: {oc.factura_proveedor_numero}
            </p>
            {oc.factura_proveedor_nombre_original && (
              <p className="text-xs text-gray-500 mb-2">{oc.factura_proveedor_nombre_original}</p>
            )}
            <a
              href={`${apiBase}/api/proveedor-portal/oc/${oc.id}/factura/file`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline"
            >
              Ver factura &rarr;
            </a>
            <p className="text-xs text-gray-400 mt-2">Para actualizar la factura, sube un nuevo archivo abajo.</p>
          </div>
        ) : null}
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Numero de factura (ej. 001-001-000001234)"
            value={factNumero}
            onChange={(e) => setFactNumero(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-3 w-full border rounded-lg px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
            <span className="text-xs text-gray-500 border border-gray-300 rounded px-2 py-0.5">Elegir archivo</span>
            <span className="text-gray-700 truncate">{factArchivo ? factArchivo.name : "PDF o imagen (máx. 20 MB)"}</span>
            <input
              type="file"
              accept="application/pdf,image/*"
              className="sr-only"
              onChange={(e) => setFactArchivo(e.target.files?.[0] ?? null)}
            />
          </label>
          <button
            onClick={handleFactura}
            disabled={saving}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? "Subiendo..." : oc.factura_proveedor_url ? "Actualizar factura" : "Subir factura"}
          </button>
        </div>
      </div>
    </div>
  );
}
