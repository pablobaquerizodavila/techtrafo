import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import { env } from "./config/env";
import healthRouter from "./routes/health";
import { prisma } from "./db/client";

const app = express();

// Middlewares base
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

// Rutas
app.use("/api", healthRouter);

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
});

// Apagado limpio
async function shutdown(signal: string) {
  console.log(`[techtrafo-api] recibido ${signal}, cerrando...`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
