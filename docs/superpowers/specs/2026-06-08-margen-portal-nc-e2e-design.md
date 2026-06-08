# Design: #39 Margen mínimo · #40 Portal proveedor · #41 No conformidades · #42 E2E

**Fecha:** 2026-06-08  
**Estado:** Aprobado por Pablo  
**Repo:** techtrafo · branch main

---

## #39 — Validación de margen mínimo en cotizaciones

### Objetivo
Impedir que un vendedor emita una cotización con margen por debajo del umbral mínimo definido por tipo de servicio. Roles gerenciales pueden forzarlo con registro auditable.

### Modelo de datos

Nueva tabla `comercial.config_margen_minimo`:
```sql
id               serial PRIMARY KEY
tipo_servicio    varchar(40) NOT NULL UNIQUE  -- fabricacion|mantenimiento|reparacion|otro
margen_minimo    numeric(5,2) NOT NULL        -- porcentaje, ej. 20.00
actualizado_por  uuid REFERENCES core.usuarios(id)
updated_at       timestamptz DEFAULT now()
```

Seed inicial (valores ajustables desde admin):
| tipo_servicio  | margen_minimo |
|----------------|--------------|
| fabricacion    | 25.00        |
| mantenimiento  | 20.00        |
| reparacion     | 20.00        |
| otro           | 15.00        |

### Lógica de negocio

**Guard activo al emitir** (transición `estado → emitida`):
1. Leer `config_margen_minimo` para el `tipo_servicio` de la cotización.
2. Si `margen_porcentaje < margen_minimo`:
   - Roles `vendedor`, `tecnico_planta`, `tecnico_campo` → `400 { error: "margen_insuficiente", margen_actual, margen_minimo, tipo_servicio }`
   - Roles `gerencia_comercial`, `gerencia_general`, `presidencia` → pueden pasar con `?forzar_margen=true`. Se añade nota automática a `notas_internas`: `[SISTEMA] Margen forzado: {margen_actual}% (mínimo {margen_minimo}%) por {nombre_usuario} el {fecha}`.
3. Si `margen_porcentaje >= margen_minimo` → continúa normal.

**Endpoint de configuración** (solo `presidencia` / `super_admin`):
- `GET /api/cotizaciones/config-margen` — lista los 4 umbrales
- `PATCH /api/cotizaciones/config-margen/:tipo_servicio` — actualiza `margen_minimo`

### Frontend

- **Indicador en form de cotización:** badge dinámico bajo el campo `margen_porcentaje`:
  - Verde: `≥ umbral`
  - Amarillo: `< umbral + 5%` (zona de advertencia)
  - Rojo: `< umbral`
- **Al intentar emitir con margen bajo:** diálogo de confirmación para roles autorizados con texto: *"El margen ({X}%) está por debajo del mínimo para {tipo_servicio} ({Y}%). ¿Confirmar emisión de todas formas?"*. Para roles no autorizados: error bloqueante sin diálogo.
- **Página de admin** `/admin/config-margen` (gateada por `presidencia`/`super_admin`): tabla editable con los 4 umbrales.

### Archivos afectados
- `database/migrations/026-config-margen-minimo.sql` (nueva tabla + seed)
- `backend/src/routes/cotizaciones.ts` (guard en PATCH estado → emitida)
- `frontend/src/app/(app)/cotizaciones/[id]/page.tsx` (badge + diálogo)
- `frontend/src/app/(app)/admin/config-margen/page.tsx` (nueva página)
- `frontend/src/app/(app)/layout.tsx` (nav link en Admin)

---

## #40 — Portal de proveedor con auth limitada

### Objetivo
Dar a cada proveedor acceso a un portal web donde ve sus OCs, acusa recibo formalmente y sube su factura. Auth separada del panel interno, análoga al portal de clientes.

### Modelo de datos

**Migration 027-proveedor-portal:**
```sql
-- Vincular usuario a proveedor
ALTER TABLE core.usuarios ADD COLUMN proveedor_id bigint REFERENCES compras.proveedores(id);

-- Campos de respuesta del proveedor en OC
ALTER TABLE compras.ordenes_compra ADD COLUMN acuse_recibo_at timestamptz;
ALTER TABLE compras.ordenes_compra ADD COLUMN factura_proveedor_numero varchar(80);
ALTER TABLE compras.ordenes_compra ADD COLUMN factura_proveedor_url text;
```

**Nuevo rol:** `proveedor` — en `core.roles` con `permisos = {}` (sin acceso al panel interno; el portal usa middleware propio).

### Backend — `/api/proveedor-portal`

Middleware `requireProveedorId`: análogo a `requireClienteId`. Requiere `req.user.proveedor_id != null`.

Endpoints:
| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/mis-ocs` | OCs donde `proveedor_id = user.proveedor_id`, con estado, fechas, líneas resumidas |
| `GET` | `/oc/:id` | Detalle completo (líneas, totales, condiciones pago, lugar entrega) |
| `POST` | `/oc/:id/acusar-recibo` | Stampa `acuse_recibo_at = now()`. Idempotente. |
| `POST` | `/oc/:id/factura` | Body: `{ numero, url }`. Guarda `factura_proveedor_numero` + `factura_proveedor_url`. La URL es texto libre (el proveedor pega un link a Drive/Dropbox/etc. — no hay upload propio en el servidor). |

Restricciones de seguridad:
- Todos los endpoints verifican que la OC pertenece al `proveedor_id` del usuario.
- No expone: precios de otras OCs, datos de clientes, márgenes internos.

### Frontend — `/proveedor`

Sección distinta de `/portal` (que es para clientes). Layout minimalista, sin nav interno completo.

Páginas:
- `/proveedor` → redirect a `/proveedor/mis-ocs`
- `/proveedor/mis-ocs` — tabla de OCs con estado, fecha, monto total, badge de acuse recibo
- `/proveedor/oc/[id]` — detalle: líneas, condiciones, botón "Acusar recibo" + sección subir factura

Estados visuales en la OC:
- `enviada` → "Pendiente de acuse"
- `acuse_recibo_at` presente → "Acuse registrado ✓" + fecha
- `factura_proveedor_url` presente → "Factura subida ✓"

### Admin — Ficha de proveedor

En `/admin/proveedores/[id]`: sección **"Acceso al portal"** (igual a la de clientes) con:
- Campo para email del usuario portal
- Botón "Crear acceso" → crea `core.usuarios` con rol `proveedor` + `proveedor_id` vinculado
- Mostrar si ya tiene acceso activo

### Archivos afectados
- `database/migrations/027-proveedor-portal.sql`
- `backend/src/routes/proveedor-portal.ts` (nuevo)
- `backend/src/server.ts` (mount `/api/proveedor-portal`)
- `frontend/src/lib/proveedor-portal.ts` (nuevo — helpers y tipos)
- `frontend/src/app/(app)/proveedor/` (nuevas páginas)
- `frontend/src/app/(app)/admin/proveedores/[id]/page.tsx` (sección acceso)

---

## #41 — Calidad / No conformidades en recepciones

### Objetivo
Registrar, trackear y cerrar no conformidades detectadas durante la inspección de recepciones. Trigger automático al marcar líneas como no conformes; ciclo de vida propio con asignación de responsable y acciones correctivas.

### Modelo de datos — Migration 028

```sql
-- Tabla principal de no conformidades
CREATE TABLE compras.no_conformidades (
  id                  bigserial PRIMARY KEY,
  codigo              varchar(20) NOT NULL UNIQUE,  -- NC-2026-0001
  recepcion_id        bigint NOT NULL REFERENCES compras.recepciones(id),
  orden_compra_id     bigint REFERENCES compras.ordenes_compra(id),
  proveedor_id        bigint REFERENCES compras.proveedores(id),
  tipo                varchar(30) NOT NULL CHECK (tipo IN ('cantidad','calidad','documentacion','otro')),
  descripcion         text NOT NULL,
  accion_tomada       text,
  estado              varchar(20) NOT NULL DEFAULT 'abierta'
                      CHECK (estado IN ('abierta','en_proceso','cerrada')),
  responsable_id      uuid REFERENCES core.usuarios(id),
  fecha_cierre        timestamptz,
  costo_impacto       numeric(12,2),          -- opcional
  creado_por          uuid REFERENCES core.usuarios(id),
  actualizado_por     uuid REFERENCES core.usuarios(id),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- Líneas afectadas de la recepción
CREATE TABLE compras.nc_lineas (
  id                    bigserial PRIMARY KEY,
  no_conformidad_id     bigint NOT NULL REFERENCES compras.no_conformidades(id) ON DELETE CASCADE,
  recepcion_linea_id    bigint NOT NULL REFERENCES compras.recepcion_lineas(id),
  cantidad_no_conforme  numeric(12,3) NOT NULL,
  motivo                text,
  created_at            timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX idx_nc_recepcion  ON compras.no_conformidades(recepcion_id);
CREATE INDEX idx_nc_proveedor  ON compras.no_conformidades(proveedor_id);
CREATE INDEX idx_nc_estado     ON compras.no_conformidades(estado);
CREATE INDEX idx_nc_lineas_nc  ON compras.nc_lineas(no_conformidad_id);
```

**Secuencia de código:** `NC-{YYYY}-{NNNN}` (4 dígitos, reinicia por año).

### Lógica de trigger automático

En `POST /api/recepciones` y `PATCH /api/recepciones/:id/lineas`:
1. Filtrar líneas con `resultado_inspeccion = 'no_conforme'`.
2. Si las hay y no existe NC con estado `abierta` o `en_proceso` para esa recepción → crear `no_conformidades` + `nc_lineas`. (Si ya hay una NC activa, no se crea duplicado; se actualiza `nc_lineas` si cambian las cantidades.)
3. Enviar notificación email al `responsable_calidad_id` de la recepción (si está definido), usando el notif-worker.

### Backend — `/api/no-conformidades`

| Método | Ruta | Permiso | Descripción |
|--------|------|---------|-------------|
| `GET` | `/` | `compras.read` | Lista paginada con filtros: estado, proveedor_id, fecha_desde/hasta |
| `GET` | `/:id` | `compras.read` | Detalle con nc_lineas + recepción + OC |
| `PATCH` | `/:id` | `compras.write` | Actualizar: estado, accion_tomada, responsable_id, costo_impacto |
| `POST` | `/:id/cerrar` | `compras.write` | Transición a `cerrada` + `fecha_cierre = now()` |

### Frontend

- **`/compras/no-conformidades`** — tabla filtrable por estado/proveedor/fecha. Badge numérico en nav con count de NCs `abierta`.
- **`/compras/no-conformidades/[id]`** — detalle: datos de recepción/OC/proveedor, líneas afectadas, historial de estado, campo acción tomada, botón cerrar.
- **Desde recepción:** en `/compras/recepciones/[id]`, si hay NC asociada → link directo "Ver No Conformidad".
- **Nav:** sub-link bajo "Compras" → "No conformidades" (visible para roles con `compras.read`).

### Notificación
Al crear una NC: tipo `nc_creada`, destinatario = `responsable_calidad_id` de la recepción (si existe), asunto `[TECHTRAFO] Nueva no conformidad: {codigo_nc} — {proveedor}`.

### Archivos afectados
- `database/migrations/028-no-conformidades.sql`
- `backend/src/routes/no-conformidades.ts` (nuevo)
- `backend/src/routes/recepciones.ts` (trigger automático al guardar líneas)
- `backend/src/services/notificaciones.ts` (nuevo tipo `nc_creada`)
- `backend/src/server.ts` (mount `/api/no-conformidades`)
- `frontend/src/lib/no-conformidades.ts` (nuevo)
- `frontend/src/app/(app)/compras/no-conformidades/` (nuevas páginas)
- `frontend/src/app/(app)/compras/recepciones/[id]/page.tsx` (link a NC)
- `frontend/src/app/(app)/layout.tsx` (nav badge)

---

## #42 — Prueba E2E con data real

### Objetivo
Validar que el ciclo completo del panel funciona de punta a punta con un expediente y cliente reales.

### Checklist (ejecutar en orden en el panel)

**Fase 1 — Comercial**
- [ ] Crear o seleccionar cliente real con representante legal
- [ ] Abrir expediente nuevo con tipo_servicio definido
- [ ] Emitir cotización — verificar que el guard de margen mínimo funciona
- [ ] Aprobar cotización desde el portal de cliente (o internamente)
- [ ] Generar contrato vinculado a la cotización

**Fase 2 — Compras**
- [ ] Crear solicitud de compra para materiales del expediente
- [ ] Generar OC desde la solicitud, asignar proveedor real
- [ ] Descargar PDF de OC y verificar que está completo
- [ ] (Opcional) Usar portal proveedor para acusar recibo
- [ ] Registrar recepción — marcar al menos 1 línea como `no_conforme` y verificar que se crea la NC automáticamente

**Fase 3 — Notificaciones**
- [ ] Verificar que las notificaciones de hitos llegaron al correo de Enrique (`egonzales@techtrafo.com`)
- [ ] Verificar que llegó notificación de NC al responsable de calidad

**Fase 4 — Finanzas**
- [ ] Abrir `/finanzas` y verificar que el contrato aparece en los KPIs
- [ ] Registrar un pago en el contrato y verificar que `cobrado` y `por_cobrar` actualizan

**Criterio de éxito:** Todos los pasos completados sin errores HTTP, datos consistentes entre módulos, emails llegaron.

---

## Orden de implementación recomendado

1. **#39** — más corta, valor inmediato (protege márgenes)
2. **#41** — migration + backend + frontend, listo para usar con data real
3. **#40** — más extensa (nuevo flujo de auth)
4. **#42** — último, con todo lo anterior en su lugar
