"use client";

import { useState } from "react";
import { FileDown, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

type Recurso = "cotizacion" | "contrato" | "ot" | "informe-tecnico";

interface Props {
  recurso: Recurso;
  id: number;
  /** Nivel máximo que el rol del usuario actual puede pedir (1-4). Por defecto 2 para clientes, 3 para internos. */
  maxNivel?: 1 | 2 | 3 | 4;
  label?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm";
}

const NIVELES: Array<{ n: 1 | 2 | 3 | 4; label: string; descripcion: string; tono: string }> = [
  { n: 1, label: "Nivel 1 — Cliente, resumen",   descripcion: "Solo total y condiciones",            tono: "text-foreground" },
  { n: 2, label: "Nivel 2 — Cliente, detallado", descripcion: "Con líneas, IVA y descuentos",       tono: "text-foreground" },
  { n: 3, label: "Nivel 3 — Interno comercial",  descripcion: "Con costos, márgenes, notas",        tono: "text-yellow-700" },
  { n: 4, label: "Nivel 4 — Interno completo",   descripcion: "Auditoría completa + revisiones",    tono: "text-destructive" },
];

export function PdfButton({ recurso, id, maxNivel = 4, label = "PDF", variant = "outline", size = "sm" }: Props) {
  const [open, setOpen] = useState(false);
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";

  function descargar(nivel: number) {
    setOpen(false);
    // Abrir en nueva pestaña: la cookie HttpOnly se manda y el browser muestra/descarga el PDF
    window.open(`${apiBase}/api/pdf/${recurso}/${id}?nivel=${nivel}`, "_blank", "noopener,noreferrer");
  }

  const niveles = NIVELES.filter((x) => x.n <= maxNivel);

  return (
    <div className="relative inline-block">
      <Button variant={variant} size={size} onClick={() => setOpen(!open)}>
        <FileDown className="mr-1 h-4 w-4" /> {label} <ChevronDown className="ml-1 h-3 w-3" />
      </Button>
      {open && (
        <>
          {/* backdrop para cerrar al click fuera */}
          <button
            type="button"
            aria-hidden="true"
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-1 w-72 rounded-md border bg-white shadow-lg">
            <div className="border-b p-2 text-xs font-semibold text-muted-foreground">
              Elegí nivel de detalle
            </div>
            <ul>
              {niveles.map((x) => (
                <li key={x.n}>
                  <button
                    type="button"
                    onClick={() => descargar(x.n)}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <p className={`font-semibold ${x.tono}`}>{x.label}</p>
                    <p className="text-xs text-muted-foreground">{x.descripcion}</p>
                  </button>
                </li>
              ))}
            </ul>
            {maxNivel < 4 && (
              <div className="border-t p-2 text-[10px] text-muted-foreground">
                Niveles 3 y 4 solo disponibles para roles internos
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
