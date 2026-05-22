# Modulo de bodega - automatizacion de stock

> Estado: Validado
> Version: 1.0
> Ultima actualizacion: mayo 2026

---

## Configuracion base

| Aspecto | Decision |
|---|---|
| Bodegas fisicas | 1 central |
| Tipos de material | Mix importado + local |
| Lista de proveedores | Establecida y fija |
| Metodo de escaneo | Codigo de barras / QR (lector USB en PC) |
| App movil | No (solo web responsive) |

---

## Catalogo de materiales

### Criticos

| Categoria | Tipo | Lead time |
|---|---|---|
| Nucleos magneticos | Importado | 60-90 dias |
| Conductores Cu/Al | Importado | 45-60 dias |
| Aceite dielectrico | Local | 7-15 dias |
| Bushings y conmutador | Importado | 45-75 dias |

### Estandar

| Categoria | Tipo | Lead time |
|---|---|---|
| Acero metalmecanica | Local | 5-10 dias |
| Aislantes (papel/cinta) | Mix | 20-40 dias |
| Radiadores/accesorios | Importado | 30-60 dias |
| Pintura epoxica | Local | 7-14 dias |

### Bajo impacto

| Categoria | Tipo | Lead time |
|---|---|---|
| Barniz aislante | Local | 7-14 dias |
| Tornilleria / ferreteria | Local | 1-5 dias |

---

## Ficha de cada material

Campos obligatorios:
- Codigo interno + codigo de barras/QR
- Nombre, categoria, unidad de medida
- Tipo (importado/local) y criticidad
- Lead time, stock minimo, maximo, punto de reorden
- Consumo promedio mensual
- Costo unitario y costo promedio ponderado
- Proveedor principal y alterno
- Ubicacion fisica (estante/zona)

---

## Tipos de movimiento

### Ingreso (recepcion de compra)
1. Escanear codigo de OC del proveedor
2. Validar contra OC original
3. Imprimir etiquetas QR
4. Confirmar ingreso a stock
5. Actualizar costo promedio ponderado

### Salida (consumo por OT)
1. Tecnico escanea QR del material
2. Selecciona OT destino
3. Ingresa cantidad
4. Costo se imputa a la OT
5. Stock se descuenta en tiempo real

### Devolucion / ajuste
1. Escanear material
2. Indicar OT origen + motivo
3. Reintegro a stock o merma
4. Aprobacion de jefe de bodega
5. Si supera umbral, escala a gerencia

---

## Logica de reorden automatico

### Importados

Punto de reorden = stock_minimo + (lead_time x consumo_diario) x 1.30

- Buffer alto: 60-90 dias + 30% colchon
- Alerta temprana al gerente de compras

### Locales

Punto de reorden = stock_minimo + (lead_time x consumo_diario) x 1.10

- Buffer corto: 7-15 dias + 10% colchon
- Reposicion agil (1-2 dias)

---

## BOM automatico por orden de trabajo

Cuando el comercial crea una cotizacion, el sistema:
1. Sugiere lista de materiales basado en historicos
2. Calcula cantidades estimadas
3. Verifica disponibilidad en bodega
4. Marca faltantes y alerta a compras
5. Permite ajuste manual del tecnico al iniciar
6. Registra diferencias para mejorar estimaciones futuras

---

## Autorizaciones (umbrales editables desde panel admin)

### Ordenes de compra (4 niveles, valores a definir)

- Nivel 1: Jefe de bodega autoriza libre
- Nivel 2: Gerente de compras autoriza
- Nivel 3: Gerencia general autoriza
- Nivel 4: Presidencia autoriza

### Devoluciones / ajustes

- Jefe de bodega autoriza ajustes pequenos
- Gerencia escala automaticamente cuando supera USD 300 (sugerido)
