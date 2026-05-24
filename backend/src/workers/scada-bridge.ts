/**
 * Bridge SCADA: MQTT -> InfluxDB (FASE 7).
 *
 * Suscribe al topic `techtrafo/transformador/+/+` y escribe cada lectura
 * como un point en InfluxDB:
 *   measurement: telemetria
 *   tag:         equipo_id (segundo wildcard del topic)
 *   tag:         variable  (tercer wildcard del topic)
 *   field:       valor     (number, del payload JSON)
 *   field:       unidad    (string, opcional)
 *   timestamp:   ts del payload si viene, sino now()
 *
 * Cuando llegue hardware real, el gateway IoT publica al mismo topic con
 * el mismo formato JSON: este bridge no necesita cambios.
 *
 * Toggle: SCADA_BRIDGE_ENABLED en .env. Si false, el worker queda dormido.
 */
import mqtt, { MqttClient } from "mqtt";
import { InfluxDB, Point, WriteApi } from "@influxdata/influxdb-client";
import { env } from "../config/env";

interface PayloadLectura {
  valor: number;
  unidad?: string;
  ts?: string;
}

let mqttClient: MqttClient | null = null;
let writeApi: WriteApi | null = null;
let mensajesProcesados = 0;
let mensajesIgnorados = 0;
let lastLogAt = 0;

function parseTopic(topic: string): { equipoId: string; variable: string } | null {
  // techtrafo/transformador/<equipo_id>/<variable>
  const parts = topic.split("/");
  if (parts.length !== 4 || parts[0] !== "techtrafo" || parts[1] !== "transformador") {
    return null;
  }
  return { equipoId: parts[2], variable: parts[3] };
}

function parsePayload(buf: Buffer): PayloadLectura | null {
  try {
    const parsed = JSON.parse(buf.toString());
    if (typeof parsed?.valor !== "number" || !Number.isFinite(parsed.valor)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function handleMessage(topic: string, payload: Buffer) {
  if (!writeApi) return;

  const t = parseTopic(topic);
  const p = t ? parsePayload(payload) : null;
  if (!t || !p) {
    mensajesIgnorados++;
    return;
  }

  const point = new Point("telemetria")
    .tag("equipo_id", t.equipoId)
    .tag("variable", t.variable)
    .floatField("valor", p.valor);

  if (p.unidad) point.tag("unidad", p.unidad);
  if (p.ts) {
    const ts = new Date(p.ts);
    if (!Number.isNaN(ts.getTime())) point.timestamp(ts);
  }

  writeApi.writePoint(point);
  mensajesProcesados++;

  const now = Date.now();
  if (now - lastLogAt > 60000) {
    console.log(
      `[scada-bridge] procesados=${mensajesProcesados} ignorados=${mensajesIgnorados} (ultimos 60s)`,
    );
    lastLogAt = now;
    mensajesProcesados = 0;
    mensajesIgnorados = 0;
  }
}

export async function startScadaBridge() {
  if (!env.SCADA_BRIDGE_ENABLED) {
    console.log("[scada-bridge] desactivado (SCADA_BRIDGE_ENABLED=false)");
    return;
  }
  if (!env.INFLUX_TOKEN) {
    console.warn("[scada-bridge] INFLUX_TOKEN vacio, bridge no arranca");
    return;
  }

  const influx = new InfluxDB({ url: env.INFLUX_URL, token: env.INFLUX_TOKEN });
  writeApi = influx.getWriteApi(env.INFLUX_ORG, env.INFLUX_BUCKET, "ns", {
    batchSize: 100,
    flushInterval: 5000,
  });

  console.log(
    `[scada-bridge] conectando MQTT ${env.MQTT_URL}, topic=${env.MQTT_TOPIC}, influx=${env.INFLUX_URL} bucket=${env.INFLUX_BUCKET}`,
  );

  mqttClient = mqtt.connect(env.MQTT_URL, {
    clientId: `scada-bridge-${process.pid}`,
    reconnectPeriod: 5000,
  });

  mqttClient.on("connect", () => {
    console.log(`[scada-bridge] MQTT conectado, suscribiendo a ${env.MQTT_TOPIC}`);
    mqttClient!.subscribe(env.MQTT_TOPIC, { qos: 0 }, (err) => {
      if (err) console.error("[scada-bridge] error al suscribir:", err.message);
    });
  });

  mqttClient.on("error", (err) => {
    console.error("[scada-bridge] error MQTT:", err.message);
  });

  mqttClient.on("message", handleMessage);
}

export async function stopScadaBridge() {
  if (mqttClient) {
    mqttClient.end(true);
    mqttClient = null;
  }
  if (writeApi) {
    try {
      await writeApi.close();
    } catch (err) {
      console.error("[scada-bridge] error al cerrar writeApi:", err);
    }
    writeApi = null;
  }
}
