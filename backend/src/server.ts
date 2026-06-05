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
import cotizacionPlantillasRouter from "./routes/cotizacion-plantillas";
import inventarioRouter from "./routes/inventario";
import contratosRouter from "./routes/contratos";
import contratoPlantillasRouter from "./routes/contrato-plantillas";
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
import proveedoresRouter from "./routes/proveedores";
import solicitudesCompraRouter from "./routes/solicitudes-compra";
import ordenesCompraRouter from "./routes/ordenes-compra";
import recepcionesRouter from "./routes/recepciones";
import comprasDashboardRouter from "./routes/compras-dashboard";
import systemHealthRouter from "./routes/system-health";
import dashboardRouter from "./routes/dashboard";
import finanzasRouter from "./routes/finanzas";
import { prisma } from "./db/client";
import { csrfProtection } from "./auth/csrf";
import { startNotificacionesWorker, stopNotificacionesWorker } from "./workers/notificaciones-worker";
import { startScadaBridge, stopScadaBridge } from "./workers/scada-bridge";

const app = express();

// trust proxy: el API esta detras de nginx en VM .7 que setea X-Forwarded-For.
// Sin esto, express-rate-limit ratearia por la IP del proxy y un atacante
// veria un solo "bucket" compartido por todos. Valor 1 = confiar en 1 hop.
// Seguro porque :3000 solo se alcanza vía nginx en la topologia actual.
// Fix H2 auditoria.
app.set("trust proxy", 1);

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

// Fix M3 auditoria: morgan combined no loggea Cookie/Authorization headers
// per se, pero la URL si puede llevar secrets si alguien los pasa en query
// string (?token=..., ?password=...). Sanitizamos esos valores en el log.
// Tambien usamos un formato explicito que NO loggea headers sensibles
// para que cualquier cambio futuro al formato sea deliberado.
morgan.token("sanitized-url", (req) => {
  const url = (req as { originalUrl?: string; url?: string }).originalUrl ?? (req as { url?: string }).url ?? "";
  return url.replace(/([?&])(token|password|csrf|authorization|secret|api[_-]?key|jwt)=[^&]*/gi, "$1$2=[REDACTED]");
});
const morganFormat = ':remote-addr - :remote-user [:date[clf]] ":method :sanitized-url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"';
app.use(morgan(env.NODE_ENV === "production" ? morganFormat : "dev"));

// Fix H3 auditoria: CSRF double-submit cookie. Debe ir DESPUES de cookieParser
// (lee cookies) y ANTES de las rutas. Skipea GET/HEAD/OPTIONS, login/register/logout
// y requests sin sesion (donde requireAuth respondera 401).
app.use(csrfProtection);

// Rutas
app.use("/api", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/clientes", clientesRouter);
app.use("/api/cotizaciones", cotizacionesRouter);
app.use("/api/cotizacion-plantillas", cotizacionPlantillasRouter);
app.use("/api/inventario", inventarioRouter);
app.use("/api/contratos", contratosRouter);
app.use("/api/contrato-plantillas", contratoPlantillasRouter);
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
app.use("/api/proveedores", proveedoresRouter);
app.use("/api/solicitudes-compra", solicitudesCompraRouter);
app.use("/api/ordenes-compra", ordenesCompraRouter);
app.use("/api/recepciones", recepcionesRouter);
app.use("/api/compras-dashboard", comprasDashboardRouter);
app.use("/api/system", systemHealthRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/finanzas", finanzasRouter);

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

// -------------------------------------------------------------------
// Red de seguridad a nivel proceso (hardening #51)
// -------------------------------------------------------------------
// Una ruta async que lanza (p.ej. una query Prisma con un campo
// inexistente, sin try/catch) produce una promesa rechazada sin manejar.
// El error-handler de Express de arriba NO la atrapa, y el comportamiento
// por defecto de Node es MATAR el proceso. En este deploy ts-node-dev no
// revive al hijo, asi que un solo bug tumbaria TODO el API.
//   Caso real 2026-06-01: "Unknown field codigo on model items" dejo el
//   panel caido y bloqueo el login de presidencia.
// Preferimos disponibilidad: logueamos el error (queda en `docker logs`
// para diagnosticar) y mantenemos el proceso vivo; solo se rompe la
// request culpable, no el panel entero.
process.on("unhandledRejection", (reason) => {
  const errorId = Math.random().toString(36).slice(2, 10);
  console.error(`[unhandledRejection ${errorId}]`, reason);
});

process.on("uncaughtException", (err) => {
  const errorId = Math.random().toString(36).slice(2, 10);
  console.error(`[uncaughtException ${errorId}]`, err);
  // No matamos el proceso aposta (ver nota arriba). Si el estado quedara
  // corrupto, GET /api/system/health deberia reflejarlo para que el
  // monitor recree el container.
});
