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
import { prisma } from "./db/client";
import { startNotificacionesWorker, stopNotificacionesWorker } from "./workers/notificaciones-worker";

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

// 404 fallback
app.use((_req, res) => {
  res.status(404).json({ error: "not_found" });
});

// Error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "internal_error", message: err.message });
});

const server = app.listen(env.PORT, () => {
  console.log(`[techtrafo-api] escuchando en :${env.PORT} (NODE_ENV=${env.NODE_ENV})`);
  // Worker de notificaciones (4.D)
  void startNotificacionesWorker();
});

// Apagado limpio
async function shutdown(signal: string) {
  console.log(`[techtrafo-api] recibido ${signal}, cerrando...`);
  stopNotificacionesWorker();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
