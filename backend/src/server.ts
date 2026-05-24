import "./utils/bigint"; // activa BigInt.prototype.toJSON antes que nada
import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { env, corsOrigins } from "./config/env";
import healthRouter from "./routes/health";
import authRouter from "./routes/auth";
import clientesRouter from "./routes/clientes";
import cotizacionesRouter from "./routes/cotizaciones";
import inventarioRouter from "./routes/inventario";
import contratosRouter from "./routes/contratos";
import adminRouter from "./routes/admin";
import expedientesRouter from "./routes/expedientes";
import visitasTecnicasRouter from "./routes/visitas-tecnicas";
import informesTecnicosRouter from "./routes/informes-tecnicos";
import notificacionesRouter from "./routes/notificaciones";
import otRouter from "./routes/ot";
import produccionRouter from "./routes/produccion";
import transformadoresRouter from "./routes/transformadores";
import areasRouter from "./routes/areas";
import portalRouter from "./routes/portal";
import evidenciasRouter from "./routes/evidencias";
import auditoriaRouter from "./routes/auditoria";
import pdfRouter from "./routes/pdf";
import garantiasRouter from "./routes/garantias";
import { prisma } from "./db/client";
import { startNotificacionesWorker, stopNotificacionesWorker } from "./workers/notificaciones-worker";
import { startScadaBridge, stopScadaBridge } from "./workers/scada-bridge";

const app = express();

// Middlewares base
app.use(helmet());
app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

// Rutas
app.use("/api", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/clientes", clientesRouter);
app.use("/api/cotizaciones", cotizacionesRouter);
app.use("/api/inventario", inventarioRouter);
app.use("/api/contratos", contratosRouter);
app.use("/api/admin", adminRouter);
app.use("/api/expedientes", expedientesRouter);
app.use("/api/visitas-tecnicas", visitasTecnicasRouter);
app.use("/api/informes-tecnicos", informesTecnicosRouter);
app.use("/api/notificaciones", notificacionesRouter);
app.use("/api/ot", otRouter);
app.use("/api/produccion", produccionRouter);
app.use("/api/transformadores", transformadoresRouter);
app.use("/api/produccion", areasRouter); // /areas, /causas-demora, /tiempos, /reprocesos
app.use("/api/portal", portalRouter);
app.use("/api/ot", evidenciasRouter);     // /:id/evidencias[...]
app.use("/api/auditoria", auditoriaRouter); // /ot/:id, /expediente/:id
app.use("/api/pdf", pdfRouter); // /cotizacion/:id, /contrato/:id, /ot/:id, /informe-tecnico/:id
app.use("/api/garantias", garantiasRouter); // + /:id/reclamos[...]

// 404 fallback
app.use((_req, res) => {
  res.status(404).json({ error: "not_found" });
});

// Error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // ID corto para correlacionar con logs server-side sin filtrar detalles al cliente.
  const errorId = Math.random().toString(36).slice(2, 10);
  console.error(`[${errorId}] ${req.method} ${req.path}:`, err);
  // En produccion NO devolver err.message (puede contener detalles de schema,
  // queries Prisma, valores de columnas, etc.). Solo el ID para soporte.
  if (env.NODE_ENV === "production") {
    res.status(500).json({ error: "internal_error", error_id: errorId });
  } else {
    res.status(500).json({ error: "internal_error", error_id: errorId, message: err.message });
  }
});

const server = app.listen(env.PORT, () => {
  console.log(`[techtrafo-api] escuchando en :${env.PORT} (NODE_ENV=${env.NODE_ENV})`);
  // Worker de notificaciones (4.D)
  void startNotificacionesWorker();
  // Bridge SCADA MQTT -> InfluxDB (FASE 7)
  void startScadaBridge();
});

// Apagado limpio
async function shutdown(signal: string) {
  console.log(`[techtrafo-api] recibido ${signal}, cerrando...`);
  stopNotificacionesWorker();
  await stopScadaBridge();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
