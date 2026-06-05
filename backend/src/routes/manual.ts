/**
 * Manual de Procesos (autoactualizable). Accesible a todo usuario interno
 * autenticado (no requiere un permiso especifico).
 *   - GET /api/manual      -> el manual como JSON (para la vista in-panel)
 *   - GET /api/manual/pdf  -> el mismo manual como PDF descargable
 *
 * Ambas salidas se arman desde la MISMA fuente (services/manual), que
 * combina la narrativa versionada con datos vivos de la base.
 */
import { Router } from "express";
import { requireAuth } from "../auth/middleware";
import { armarManual } from "../services/manual/armar";
import { generarManualPdf } from "../services/manual/pdf";
import { enviarPDF } from "../services/pdf/base";

const router = Router();
router.use(requireAuth);

router.get("/", async (_req, res) => {
  const manual = await armarManual();
  res.json({ data: manual });
});

router.get("/pdf", async (_req, res) => {
  const manual = await armarManual();
  const doc = generarManualPdf(manual);
  enviarPDF(doc, res, "TECHTRAFO-manual-procesos");
});

export default router;
