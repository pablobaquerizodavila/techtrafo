import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),

  // Auth (3.3)
  JWT_SECRET: z.string().min(32, "JWT_SECRET debe tener al menos 32 caracteres"),
  JWT_EXPIRES_IN: z.string().default("8h"),

  // CORS: lista separada por comas. Default permite el frontend en dev y la IP del host
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3001,http://192.168.0.23:3001,http://localhost:3000"),

  // SMTP (4.D notificaciones). Si SMTP_HOST queda vacio, el worker corre en
  // dry-run: registra notificaciones en core.notificaciones pero no envia email.
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false), // true = TLS implicito (465), false = STARTTLS
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  SMTP_FROM: z.string().default("TECHTRAFO <noreply@techtrafo.com>"),
  // URL publica del panel, usada para construir deeplinks en los correos
  PANEL_URL: z.string().url().default("https://panel.techtrafo.com"),
  // Cadencia del worker de notificaciones, en segundos
  NOTIF_WORKER_INTERVAL_SECONDS: z.coerce.number().int().positive().default(300),

  // Storage local para evidencias (Dashboard E). El docker-compose monta
  // ../../uploads en /uploads. Migrable a MinIO en el futuro.
  UPLOAD_DIR: z.string().default("/uploads"),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(20 * 1024 * 1024), // 20 MB default

  // SCADA bridge MQTT -> InfluxDB (FASE 7). Si SCADA_BRIDGE_ENABLED=false el
  // worker queda dormido y el API arranca igual.
  SCADA_BRIDGE_ENABLED: z.coerce.boolean().default(false),
  MQTT_URL: z.string().default("mqtt://techtrafo-mosquitto:1883"),
  MQTT_TOPIC: z.string().default("techtrafo/transformador/+/+"),
  INFLUX_URL: z.string().url().default("http://techtrafo-influxdb:8086"),
  INFLUX_TOKEN: z.string().default(""),
  INFLUX_ORG: z.string().default("techtrafo"),
  INFLUX_BUCKET: z.string().default("telemetria"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Variables de entorno invalidas:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const corsOrigins = env.CORS_ORIGINS.split(",")
  .map((s) => s.trim())
  .filter(Boolean);
