# Modulo cotizador - matriz de precios y costos

> Estado: Validado
> Version: 1.0
> Ultima actualizacion: mayo 2026

---

## Formula final

P = (M + MO + AC + PI + TR + PR + OH + GA + AD) x (1 + margen%) x (1 - descuento%)

Donde:
- M = Materiales (BOM sugerido por bodega)
- MO = Mano de obra mix (especialidad + overhead)
- AC = Aceite dielectrico
- PI = Pintura
- TR = Transporte
- PR = Pruebas
- OH = Overhead por area utilizada
- GA = Provision de garantia
- AD = Administrativos

---

## Costos directos

### Mano de obra (modelo mix)

Por hora x especialidad:
- Bobinador
- Electricista
- Mecanico
- Pintor
- Operador planta aceite

MO = suma de (horas_estimadas x tarifa_hora por especialidad)

### Materiales
BOM sugerido por bodega segun tipo de servicio y potencia.

### Aceite dielectrico
Volumen estimado x precio actual de bodega

### Pintura epoxica
Galones estimados x precio actual

### Transporte
Costo especifico (grua, camion, escolta, permisos)

---

## Costos indirectos

### Overhead por area utilizada

Tarifa fija por uso de:
- Area de bobinado
- Area de metalmecanica
- Area de pintura
- Area de aceite
- Area de ensamblaje

Incluye: depreciacion equipos, energia, supervision, consumibles menores.

### Provision de garantia
% sobre costo directo, configurable por tipo de servicio.

### Costos administrativos
Diagnostico inicial, gestion documental, certificados.

---

## Margen de utilidad - libre por cotizacion

### Reglas

- Definido por el comercial en cada cotizacion (sin % fijo)
- Sistema sugiere % basado en historico similar
- Margen minimo de alerta (configurable) notifica a gerencia
- Margen negativo bloqueado (requiere autorizacion ejecutiva)
- Historico de margenes por cliente y tipo de servicio

### Razonamiento

Cada trabajo es distinto. Forzar margen fijo elimina flexibilidad estrategica del comercial.

---

## Descuentos - discrecionales

- Solo en casos especificos (no es la regla)
- Discrecional del comercial con justificacion obligatoria
- Descuento > X% (configurable) requiere autorizacion
- Registro completo: monto, motivo, cliente, OT, comercial
- Sin urgencia automatica, sin recargos por hora

---

## Tres niveles de detalle al cliente

El comercial elige al armar la cotizacion.

### Nivel 1 - Solo total
Para clientes corporativos que valoran simplicidad.
Muestra: servicio + plazo + garantia + TOTAL

### Nivel 2 - Total + grandes rubros
Para clientes intermedios.
Muestra 5-7 rubros principales + TOTAL

### Nivel 3 - Desglose completo
Para clientes publicos o licitaciones.
Muestra cada componente individual con cantidades y precios unitarios.

---

## Validaciones automaticas

El sistema bloquea o alerta cuando:
- Margen menor que minimo configurado (alerta gerencia)
- Margen negativo (bloqueo total)
- Descuento > X% (requiere autorizacion)
- Material en BOM sin stock y sin proveedor
- Cliente con cartera vencida

---

## KPIs del cotizador

- Tasa de conversion cotizacion -> contrato
- Tiempo promedio de elaboracion
- Margen promedio por tipo de servicio
- Margen promedio por cliente
- Cantidad de descuentos otorgados y monto total
- Cotizaciones perdidas con motivo
