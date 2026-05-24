# ADR-004 - SCADA Opcion C con simulador (puente a hardware real)

> Estado: Aceptada
> Fecha: 2026-05-23
> Decisor: Pablo Baquerizo Davila
> Supersede parcialmente: ADR-001 (Opcion B pura)

---

## Contexto

ADR-001 adopto Opcion B (Grafana solo con datos Postgres) y dejo InfluxDB y Mosquitto MQTT mencionados en el compose pero apagados. El plan era esperar 6-12 meses hasta que llegara hardware.

En el camino apareció la necesidad de:

1. Demostrar a clientes como sera el dashboard de planta cuando se instrumente
2. Tener el camino tecnico validado antes que llegue el hardware real
3. Probar el formato de topic MQTT y el esquema Influx con datos sinteticos

---

## Decision

**Se adopta Opcion C (hibrido) con simulador como puente hasta que llegue hardware real.**

- InfluxDB 2.7 + Mosquitto MQTT 2 PROVISIONADOS y CORRIENDO en el stack
- Bridge MQTT->InfluxDB embebido en el API (worker in-process)
- Simulador en container aparte con perfil `simulador` que publica lecturas realistas cada 10s
- 1 dashboard Grafana adicional (`scada-transformador`) con time series de las 8 variables del equipo demo
- Mosquitto sin port mapping al host: solo accesible desde la red docker, sin auth (defensa por aislamiento de red)

---

## Razones

1. Cero costo extra: Influx y Mosquitto ya estaban planificados, solo se activaron
2. Validacion temprana: el formato del topic MQTT (`techtrafo/transformador/<equipo_id>/<variable>`) y el esquema Influx (measurement=telemetria, tags=equipo_id+variable, field=valor) quedan probados antes que llegue hardware
3. Demo vendible: clientes ven el dashboard funcionando con datos en movimiento
4. Reversible y aislado: el simulador esta detras de un perfil `simulador` en docker-compose; cuando llega hardware real, basta con `docker compose stop simulador` y conectar el gateway real al broker
5. Cero impacto en lo existente: el bridge se activa con `SCADA_BRIDGE_ENABLED=true` en .env. Si se setea false, el API arranca normal sin Influx ni MQTT

---

## Contrato MQTT (sin cambios cuando llegue hardware real)

- Broker: `techtrafo-mosquitto:1883` (red docker interna)
- Topic: `techtrafo/transformador/<EQUIPO_ID>/<VARIABLE>`
- Payload JSON:

```json
{
  "valor": 65.3,
  "unidad": "C",
  "ts": "2026-05-23T22:00:00Z"
}
```

- Variables actuales: `temperatura_aceite`, `voltaje_primario`, `voltaje_secundario`, `corriente_primario`, `corriente_secundario`, `vibracion`, `humedad`, `temperatura_ambiente`
- `equipo_id`: en futuro deberia matchear el codigo en `produccion.transformadores.codigo_interno`. Hoy el simulador usa `TRF-DEMO-001`

---

## Camino de migracion a hardware real

| Paso | Cuando | Que cambia |
|---|---|---|
| Hoy | v0.8.0 | Simulador publicando datos sinteticos |
| Banco de pruebas | Cuando llegue ESP32/PLC | `docker compose stop simulador` + gateway real publica al mismo topic |
| Auth MQTT | Si se conecta gateway externo | Agregar `passwd file` a mosquitto.conf + port mapping 1883:1883 con TLS |
| Retention extendida | Cuando haya 6+ meses de datos | Crear bucket `telemetria_long_term` con downsampling tasks de Influx |
| Alertas | Cuando se definan umbrales | Grafana alerting reglas sobre threshold por variable |

---

## Dashboards Grafana actuales

1. `comercial-pipeline` (FASE 6)
2. `planta-produccion` (FASE 6)
3. `financiero-facturacion` (FASE 6)
4. `garantias-posventa` (FASE 6 plus)
5. `scada-transformador` (FASE 7 — este ADR)
