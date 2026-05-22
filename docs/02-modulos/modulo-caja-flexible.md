# Modulo de caja - plan de pagos flexible

> Estado: Validado
> Version: 1.0
> Ultima actualizacion: mayo 2026

---

## Principio fundamental

El modulo de caja de TECHTRAFO NO usa porcentajes fijos. Cada contrato tiene su propio plan de pagos disenado por el comercial al momento de la cotizacion.

---

## Estructura del plan de pagos

Por cada hito se define:
- Porcentaje (cualquier valor de 0% a 100%)
- Monto fijo (calculado automaticamente del total)
- Fecha estimada (opcional)
- Evento gatillo (que dispara la factura)
- Estado (pendiente / facturado / cobrado / vencido / pagado anticipado)

### La unica regla dura

> La suma de todos los hitos debe ser exactamente 100% del total del contrato.

---

## Eventos gatillo posibles

1. **Firma de contrato** - genera factura inmediatamente
2. **Hito tecnico** - vinculado a un paso del proceso productivo
3. **Fecha calendario** - para pagos a 30/60/90 dias
4. **Entrega final** - ultimo gatillo siempre disponible

---

## Escenarios tipicos

| Escenario | Distribucion | Aplica para |
|---|---|---|
| Tradicional | 40 / 40 / 20 | Clientes nuevos, monto alto, sin historial |
| Sin anticipo | 0 / 30 / 30 / 40 | Corporativos con respaldo financiero |
| Pago anticipado | 100 / 0 | Recurrentes, monto bajo, urgentes |
| Multiples hitos | 10 / 20 / 20 / 20 / 30 | Proyectos largos de construccion |

---

## Reglas de autorizacion

### Aprobacion del plan (al firmar contrato)

Tres roles con autoridad equivalente al 100%:
- Presidencia
- Gerencia General
- Gerencia Comercial

Cualquiera puede aprobar cualquier porcentaje de anticipo. El sistema registra quien aprobo.

### Modificacion post-firma

Los mismos tres roles pueden modificar el plan despues de firmado. El sistema guarda historico completo.

---

## Comportamiento ante mora

El sistema clasifica cada contrato como privado o publico desde su creacion.

| Tipo | Si vence un hito sin cobro |
|---|---|
| Privado | Alerta a comercial + cobranza, SIN detener produccion |
| Publico | Pausa automatica de la OT hasta regularizar |

Esta logica protege el cumplimiento de normativa publica (LOSNCP en Ecuador) sin entorpecer operaciones privadas.

---

## Facturacion adelantada

El cliente puede pagar el hito siguiente completo antes de su gatillo natural.

Funcionamiento:
1. Cliente solicita pagar adelantado
2. Sistema emite la factura del proximo hito completo
3. Hito se marca como pagado anticipado
4. Cuando llega el gatillo original, se registra como ya cobrado

---

## Bloqueo de entrega fisica

> El equipo NO se libera fisicamente al cliente hasta que el % cobrado sea mayor o igual a 100% del contrato.

Validacion automatica contra el modulo de caja. No hay forma de saltarse este control desde planta.

---

## KPIs del modulo

- Dias promedio de cobro (DSO)
- Cartera vencida total
- Cartera vencida por cliente
- Cartera vencida por antiguedad (30/60/90+ dias)
- % de cobro adelantado
- Cantidad de modificaciones post-firma
