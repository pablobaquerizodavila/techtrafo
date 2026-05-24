/**
 * Simulador de telemetria SCADA de un transformador demo.
 *
 * Publica cada INTERVALO_MS al broker MQTT lecturas con tendencia y ruido
 * realistas para 8 variables:
 *   - temperatura_aceite (C)
 *   - voltaje_primario (V), voltaje_secundario (V)
 *   - corriente_primario (A), corriente_secundario (A)
 *   - vibracion (mm/s)
 *   - humedad (% HR), temperatura_ambiente (C)
 *
 * Topic: techtrafo/transformador/<EQUIPO_ID>/<variable>
 * Payload: { "valor": <num>, "unidad": "<unit>", "ts": "<iso8601>" }
 *
 * Reemplazable por un gateway IoT real apenas haya hardware: el formato
 * del topic y payload son el contrato.
 */
const mqtt = require("mqtt");

const MQTT_URL = process.env.MQTT_URL || "mqtt://localhost:1883";
const EQUIPO_ID = process.env.EQUIPO_ID || "TRF-DEMO-001";
const INTERVALO_MS = parseInt(process.env.INTERVALO_MS || "10000", 10);

// Definicion de cada variable: rango operacional, unidad y modelo de ruido.
const VARIABLES = {
  temperatura_aceite:    { base: 65,   amp: 8,   ruido: 1.5,  unidad: "C",    periodo_seg: 1800 },
  voltaje_primario:      { base: 13800, amp: 60,  ruido: 30,   unidad: "V",    periodo_seg: 600 },
  voltaje_secundario:    { base: 220,   amp: 1.5, ruido: 0.8,  unidad: "V",    periodo_seg: 600 },
  corriente_primario:    { base: 12,    amp: 4,   ruido: 0.6,  unidad: "A",    periodo_seg: 900 },
  corriente_secundario:  { base: 750,   amp: 250, ruido: 35,   unidad: "A",    periodo_seg: 900 },
  vibracion:             { base: 2.5,   amp: 0.8, ruido: 0.4,  unidad: "mm/s", periodo_seg: 1200 },
  humedad:               { base: 55,    amp: 10,  ruido: 2,    unidad: "%HR",  periodo_seg: 3600 },
  temperatura_ambiente:  { base: 28,    amp: 4,   ruido: 0.8,  unidad: "C",    periodo_seg: 3600 },
};

function lectura(spec, t) {
  const omega = (2 * Math.PI) / spec.periodo_seg;
  const senoidal = Math.sin(omega * t);
  const ruido = (Math.random() * 2 - 1) * spec.ruido;
  return +(spec.base + spec.amp * senoidal + ruido).toFixed(3);
}

const client = mqtt.connect(MQTT_URL, {
  clientId: `simulador-${EQUIPO_ID}-${Date.now()}`,
  reconnectPeriod: 5000,
});

client.on("connect", () => {
  console.log(`[simulador] conectado a ${MQTT_URL} como equipo=${EQUIPO_ID}, intervalo=${INTERVALO_MS}ms`);
});

client.on("error", (err) => {
  console.error(`[simulador] error MQTT:`, err.message);
});

let tick = 0;

function publicar() {
  const t = tick * (INTERVALO_MS / 1000);
  const ts = new Date().toISOString();

  for (const [variable, spec] of Object.entries(VARIABLES)) {
    const valor = lectura(spec, t);
    const topic = `techtrafo/transformador/${EQUIPO_ID}/${variable}`;
    const payload = JSON.stringify({ valor, unidad: spec.unidad, ts });
    client.publish(topic, payload, { qos: 0 });
  }

  tick++;
  if (tick % 6 === 0) {
    console.log(`[simulador] tick ${tick} publicado (8 variables)`);
  }
}

setInterval(publicar, INTERVALO_MS);
// Primera publicacion inmediata
publicar();
