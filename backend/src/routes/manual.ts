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
import { detectarDrift } from "../services/manual/drift";
import { enviarPDF } from "../services/pdf/base";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const manual = await armarManual();
  const u = req.user;
  const accesoTotal = !!u?.es_super_admin || u?.permisos?.all === true;
  res.json({
    data: manual,
    miRol: {
      rol_nombre: u?.rol_nombre ?? null,
      accesoTotal,
    },
  });
});

router.get("/pdf", async (_req, res) => {
  const manual = await armarManual();
  const doc = generarManualPdf(manual);
  enviarPDF(doc, res, "TECHTRAFO-manual-procesos");
});

// Drift: que falta documentar (sistema real vs narrativa). Solo para roles con
// acceso total — es info de mantenimiento interno.
router.get("/drift", async (req, res) => {
  const u = req.user;
  const accesoTotal = !!u?.es_super_admin || u?.permisos?.all === true;
  if (!accesoTotal) {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const drift = await detectarDrift();
  res.json({ data: drift });
});

export default router;
