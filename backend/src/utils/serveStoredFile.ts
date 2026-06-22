import fs from "node:fs";
import path from "node:path";
import type { Response } from "express";
import { env } from "../config/env";

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/**
 * Sirve un archivo almacenado bajo UPLOAD_DIR como stream inline.
 * Protege contra path-traversal y responde 403/410 segun corresponda.
 * Asume que el caller ya valido autorizacion y existencia de la fila.
 *
 * @param res            Express Response.
 * @param relativePath   Ruta relativa a UPLOAD_DIR (tal como se guardo en DB).
 * @param originalName   Nombre original para Content-Disposition (opcional).
 * @param fallbackName   Nombre a usar si originalName es null/undefined.
 */
export function serveStoredFile(
  res: Response,
  relativePath: string,
  originalName?: string | null,
  fallbackName = "archivo",
): void {
  const uploadRoot = path.resolve(env.UPLOAD_DIR);
  const fullPath = path.resolve(env.UPLOAD_DIR, relativePath);
  if (fullPath !== uploadRoot && !fullPath.startsWith(uploadRoot + path.sep)) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  if (!fs.existsSync(fullPath)) {
    res.status(410).json({ error: "archivo_eliminado_en_disco" });
    return;
  }
  const ext = path.extname(fullPath).toLowerCase();
  const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";
  const safeFilename = (originalName ?? fallbackName).replace(/[\r\n"]/g, "").slice(0, 200);
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Disposition", `inline; filename="${safeFilename}"`);
  fs.createReadStream(fullPath).pipe(res);
}
