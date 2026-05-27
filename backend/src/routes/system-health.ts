/**
 * GET /api/system/health
 *
 * Estado de la infraestructura del stack. Corre en paralelo:
 *  - postgres (SELECT 1)
 *  - redis    (TCP connect)
 *  - mosquitto (TCP connect)
 *  - influxdb (HTTP /health)
 *  - grafana  (HTTP /api/health)
 *  - web      (TCP connect al frontend container)
 *  - smtp NAS (transport.verify via services/email.verifyEmailConfig)
 *  - nginx VM 192.168.0.7 (HEAD https://panel.techtrafo.com)
 *
 * Devuelve {summary, checks, timestamp}. Cada check trae latency_ms.
 * requireAuth: cualquier usuario autenticado puede consultar (el frontend
 * decide si mostrar la tarjeta segun el rol).
 */
import { Router } from "express";
import net from "node:net";
import { prisma } from "../db/client";
import { requireAuth } from "../auth/middleware";
import { verifyEmailConfig } from "../services/email";

const router = Router();
router.use(requireAuth);

type Status = "up" | "down" | "degraded";

interface HealthCheck {
  name: string;
  category: "database" | "cache" | "telemetry" | "monitoring" | "frontend" | "mail" | "network";
  status: Status;
  latency_ms: number;
  message?: string;
}

// ---------- helpers ----------
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let to: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, rej) => { to = setTimeout(() => rej(new Error(`timeout ${label}`)), ms); });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (to) clearTimeout(to);
  }
}

function tcpCheck(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port });
    const t = setTimeout(() => { sock.destroy(); resolve(false); }, timeoutMs);
    sock.once("connect", () => { clearTimeout(t); sock.end(); resolve(true); });
    sock.once("error",   () => { clearTimeout(t); resolve(false); });
  });
}

async function httpCheck(url: string, timeoutMs = 2000, method: "GET" | "HEAD" = "GET"): Promise<{ ok: boolean; status: number }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method, signal: ctl.signal });
    return { ok: r.ok, status: r.status };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(t);
  }
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const t0 = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - t0 };
}

// ---------- checks ----------
async function checkPostgres(): Promise<HealthCheck> {
  try {
    const { ms } = await timed(() => withTimeout(prisma.$queryRaw`SELECT 1`, 2000, "postgres") as Promise<unknown>);
    return { name: "PostgreSQL", category: "database", status: "up", latency_ms: ms };
  } catch (e) {
    return { name: "PostgreSQL", category: "database", status: "down", latency_ms: 0, message: (e as Error).message };
  }
}

async function checkRedis(): Promise<HealthCheck> {
  const { value, ms } = await timed(() => tcpCheck("techtrafo-redis", 6379));
  return value
    ? { name: "Redis", category: "cache", status: "up", latency_ms: ms }
    : { name: "Redis", category: "cache", status: "down", latency_ms: 0, message: "TCP unreachable" };
}

async function checkMosquitto(): Promise<HealthCheck> {
  const { value, ms } = await timed(() => tcpCheck("techtrafo-mosquitto", 1883));
  return value
    ? { name: "Mosquitto MQTT", category: "telemetry", status: "up", latency_ms: ms }
    : { name: "Mosquitto MQTT", category: "telemetry", status: "down", latency_ms: 0, message: "TCP unreachable" };
}

async function checkInfluxDB(): Promise<HealthCheck> {
  const { value, ms } = await timed(() => httpCheck("http://techtrafo-influxdb:8086/health"));
  return value.ok
    ? { name: "InfluxDB", category: "telemetry", status: "up", latency_ms: ms }
    : { name: "InfluxDB", category: "telemetry", status: "down", latency_ms: 0, message: value.status ? `HTTP ${value.status}` : "unreachable" };
}

async function checkGrafana(): Promise<HealthCheck> {
  const { value, ms } = await timed(() => httpCheck("http://techtrafo-grafana:3000/api/health"));
  return value.ok
    ? { name: "Grafana", category: "monitoring", status: "up", latency_ms: ms }
    : { name: "Grafana", category: "monitoring", status: "down", latency_ms: 0, message: value.status ? `HTTP ${value.status}` : "unreachable" };
}

async function checkWeb(): Promise<HealthCheck> {
  const { value, ms } = await timed(() => tcpCheck("techtrafo-web", 3002));
  return value
    ? { name: "Frontend Next.js", category: "frontend", status: "up", latency_ms: ms }
    : { name: "Frontend Next.js", category: "frontend", status: "down", latency_ms: 0, message: "TCP unreachable" };
}

async function checkSMTP(): Promise<HealthCheck> {
  try {
    const { value, ms } = await timed(() => withTimeout(verifyEmailConfig(), 4000, "smtp"));
    return value.ok
      ? { name: "SMTP MailPlus (NAS)", category: "mail", status: "up", latency_ms: ms, message: value.message }
      : { name: "SMTP MailPlus (NAS)", category: "mail", status: "degraded", latency_ms: ms, message: value.message };
  } catch (e) {
    return { name: "SMTP MailPlus (NAS)", category: "mail", status: "down", latency_ms: 0, message: (e as Error).message };
  }
}

async function checkNginxVM(): Promise<HealthCheck> {
  // El panel responde a HEAD con 200/3xx si nginx + Next estan vivos
  const { value, ms } = await timed(() => httpCheck("https://panel.techtrafo.com", 3000, "HEAD"));
  // Cualquier respuesta HTTP (incluso 401) indica que nginx esta arriba
  return value.status > 0
    ? { name: "Nginx VM 192.168.0.7", category: "network", status: "up", latency_ms: ms, message: `HTTP ${value.status}` }
    : { name: "Nginx VM 192.168.0.7", category: "network", status: "down", latency_ms: 0, message: "unreachable" };
}

// ---------- endpoint ----------
router.get("/health", async (_req, res) => {
  const checks = await Promise.all([
    checkPostgres(),
    checkWeb(),
    checkRedis(),
    checkInfluxDB(),
    checkGrafana(),
    checkMosquitto(),
    checkSMTP(),
    checkNginxVM(),
  ]);

  const up = checks.filter((c) => c.status === "up").length;
  const down = checks.filter((c) => c.status === "down").length;
  const degraded = checks.filter((c) => c.status === "degraded").length;
  const status: Status = down > 0 ? "down" : degraded > 0 ? "degraded" : "up";

  res.json({
    timestamp: new Date().toISOString(),
    summary: { total: checks.length, up, down, degraded, status },
    checks,
  });
});

export default router;
