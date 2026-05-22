import { Router } from "express";
import { pingDatabase } from "../db/client";

const router = Router();

// GET /api/health  ->  status del API + conexion a DB
router.get("/health", async (_req, res) => {
  const dbOk = await pingDatabase();

  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? "ok" : "degraded",
    service: "techtrafo-api",
    version: process.env.npm_package_version ?? "0.3.0",
    db: dbOk ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

export default router;
