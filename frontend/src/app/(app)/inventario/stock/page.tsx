"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, AlertTriangle, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Toaster } from "sonner";
import {
  StockRow,
  Ubicacion,
  getAlertas,
  listStock,
  listUbicaciones,
} from "@/lib/inventario";

interface AlertasState {
  stock_bajo_reorden: Array<{ item_id: number; codigo_interno: string; nombre: string; unidad_medida: string; punto_reorden: number; stock_actual: number }>;
  lotes_por_vencer: Array<{ id: number; numero_lote: string; fecha_vencimiento: string | null; items?: { id: number; codigo_interno: string; nombre: string; unidad_medida: string } }>;
}

export default function StockPage() {
  const [stock, setStock] = useState<StockRow[]>([]);
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [ubicacionId, setUbicacionId] = useState<number | "">("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [alertas, setAlertas] = useState<AlertasState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listUbicaciones().then((r) => setUbicaciones(r.data)).catch(() => {});
    getAlertas().then((r) => setAlertas(r.data)).catch(() => setAlertas({ stock_bajo_reorden: [], lotes_por_vencer: [] }));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listStock({
        ubicacion_id: ubicacionId || undefined,
        q: q || undefined,
      });
      setStock(res.data);
    } finally {
      setLoading(false);
    }
  }, [ubicacionId, q]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(t);
  }, [qInput]);

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-3xl font-bold">Stock actual</h2>
        <p className="text-muted-foreground">Inventario por item y ubicacion</p>
      </header>

      {/* Tarjetas de alertas */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center text-base">
              <AlertTriangle className="mr-2 h-4 w-4 text-orange-500" />
              Stock bajo punto de reorden
              <Badge variant="warning" className="ml-2">{alertas?.stock_bajo_reorden.length ?? 0}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!alertas || alertas.stock_bajo_reorden.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin alertas</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {alertas.stock_bajo_reorden.slice(0, 5).map((a) => (
                  <li key={a.item_id}>
                    <span className="font-medium">{a.nombre}</span>
                    <span className="text-muted-foreground"> · {a.stock_actual} / reorden {a.punto_reorden} {a.unidad_medida}</span>
                  </li>
                ))}
                {alertas.stock_bajo_reorden.length > 5 && (
                  <li className="text-xs text-muted-foreground">y {alertas.stock_bajo_reorden.length - 5} mas...</li>
                )}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center text-base">
              <Calendar className="mr-2 h-4 w-4 text-red-500" />
              Lotes a vencer (90 dias)
              <Badge variant="destructive" className="ml-2">{alertas?.lotes_por_vencer.length ?? 0}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!alertas || alertas.lotes_por_vencer.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin lotes proximos a vencer</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {alertas.lotes_por_vencer.slice(0, 5).map((l) => (
                  <li key={l.id}>
                    <span className="font-medium">{l.items?.nombre ?? "—"}</span>
                    <span className="text-muted-foreground"> · lote {l.numero_lote} · vence {l.fecha_vencimiento?.split("T")[0]}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Buscar item por codigo o nombre" className="pl-9" />
        </div>
        <Select
          value={ubicacionId === "" ? "_" : ubicacionId.toString()}
          onValueChange={(v) => setUbicacionId(v === "_" ? "" : Number(v))}
        >
          <SelectTrigger className="w-56"><SelectValue placeholder="Ubicacion" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_">Todas las ubicaciones</SelectItem>
            {ubicaciones.map((u) => (
              <SelectItem key={u.id} value={u.id.toString()}>{u.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Codigo</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Ubicacion</TableHead>
              <TableHead>Lote</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead>Unidad</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : stock.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Sin stock con esos filtros</TableCell></TableRow>
            ) : (
              stock.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.items.codigo_interno}</TableCell>
                  <TableCell className="font-medium">{s.items.nombre}</TableCell>
                  <TableCell>{s.ubicaciones.nombre}</TableCell>
                  <TableCell className="font-mono text-xs">{s.lotes?.numero_lote ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{Number(s.cantidad).toFixed(3).replace(/\.?0+$/, "")}</TableCell>
                  <TableCell>{s.items.unidad_medida}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        El stock se actualiza automaticamente al registrar movimientos. Maximo 500 filas por consulta.
      </p>

      <Toaster richColors position="top-right" />
    </div>
  );
}
