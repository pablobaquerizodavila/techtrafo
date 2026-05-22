# ADR-001 - Grafana en modo Opcion B

> Estado: Aceptada
> Fecha: 2026-05-22
> Decisor: Pablo Baquerizo Davila

---

## Contexto

TECHTRAFO incorporo Grafana al stack con el objetivo de tener dashboards en tiempo real. Se evaluaron 3 escenarios:

- **Opcion A** - SCADA completo desde el inicio (sensores IoT + PLCs)
- **Opcion B** - Grafana solo con datos de negocio desde PostgreSQL
- **Opcion C** - Hibrido (un area piloto con sensores + el resto modo B)

---

## Decision

**Se adopta la Opcion B como punto de partida.**

Grafana se despliega desde el inicio del proyecto pero alimentado exclusivamente con datos del modulo de negocio (PostgreSQL).

InfluxDB y Mosquitto MQTT se dejan provisionados pero apagados, listos para activarse cuando la operacion digital este estabilizada.

---

## Razones

1. Menor inversion inicial (sin sensores, PLCs ni instalacion industrial)
2. Curva de adopcion gradual
3. Beneficio inmediato (KPIs de negocio dan valor desde el dia 1)
4. Reversible (migrar a Opcion A/C solo requiere encender InfluxDB y MQTT)
5. Foco en lo critico (digitalizar procesos antes de instrumentar planta)

---

## Dashboards Grafana - Opcion B

1. **Gerencia** - rentabilidad por OT, caja, embudo, retrasos
2. **Comercial** - cotizaciones, conversion, tiempos de respuesta
3. **Planta** - avance OTs, checklists pendientes, gates fallidos
4. **Alertas de negocio** - hitos vencidos, stock critico, cartera

---

## Camino de evolucion hacia SCADA completo

| Fase | Cuando | Que se agrega |
|---|---|---|
| Actual | Hoy | Solo Opcion B |
| Piloto SCADA | 6-12 meses | Sensores en banco de pruebas |
| Expansion | 12-24 meses | Bobinado, horno, planta de aceite |
| Madurez | 24+ meses | SCADA completo + mantenimiento predictivo |
