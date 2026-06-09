# Diseño: Portal Proveedor — Subida de Factura con Notificación Email

**Fecha:** 2026-06-09  
**Estado:** Aprobado  
**Alcance:** Portal proveedor (módulo compras) — reemplazar input de URL externa por upload real de archivo, con notificación email al equipo interno.

---

## Contexto

El portal proveedor ya tiene un endpoint `POST /api/proveedor-portal/oc/:id/factura` que acepta `{ numero, url }` (JSON, URL externa). El proveedor puede indicar el número y pegar un link externo a su factura. No hay notificación al equipo interno cuando esto ocurre.

Este diseño reemplaza ese flujo por uno completo: subida de archivo PDF/imagen al servidor + notificación email automática a `jefe_compras` y `financiero`.

---

## Flujo completo

```
Proveedor (portal /proveedor/oc/[id])
  └─ POST /api/proveedor-portal/oc/:id/factura
       multipart/form-data: { numero: string, archivo: File }
              │
              ▼
     multer guarda en /uploads/facturas-proveedor/<uuid>-<originalname>
     (filtro: application/pdf + image/*, límite 10 MB)
              │
              ▼
     UPDATE compras.ordenes_compra SET
       factura_proveedor_numero          = <numero>
       factura_proveedor_url             = '/uploads/facturas-proveedor/<uuid>-<originalname>'
       factura_proveedor_nombre_original = <originalname>
              │
              ▼
     notificarFacturaProveedorSubida(ocId)
       → INSERT INTO core.notificaciones (una fila por destinatario)
       → destinatarios: todos los usuarios activos con rol jefe_compras o financiero
              │
              ▼
     notif-worker (cada ~5 min, proceso existente)
       → SMTP via mailcow (192.168.0.3:465)
       → asunto: "Nueva factura recibida — OC-YYYY-NNNN · <Proveedor>"
       → body: datos OC + número de factura + botón "Ver orden de compra"
```

---

## Base de datos

### Migration 029

```sql
-- 029-factura-proveedor-upload.sql
ALTER TABLE compras.ordenes_compra
  ADD COLUMN IF NOT EXISTS factura_proveedor_nombre_original VARCHAR(255);
```

`factura_proveedor_url` ya existe (TEXT). Pasa de guardar una URL externa a guardar la ruta servida por el API (`/uploads/facturas-proveedor/<uuid>-<filename>`). Sin cambio de tipo ni de nombre.

**Post-migration:**
```bash
docker exec techtrafo-api npx prisma db pull
docker exec techtrafo-api npx prisma generate
docker compose -f infrastructure/docker/docker-compose.yml up -d --force-recreate api
```

---

## Backend

### `routes/proveedor-portal.ts`

- Agregar instancia de `multer` con `diskStorage`:
  - `destination`: `path.join(env.UPLOAD_DIR, 'facturas-proveedor')` (crear si no existe)
  - `filename`: `${uuid()}-${sanitized_originalname}`
  - `fileFilter`: acepta solo `application/pdf` e `image/*`; rechaza otros con error 400
  - `limits.fileSize`: 10 MB (o `env.UPLOAD_MAX_BYTES` si ya está definido)
- Reemplazar handler de `POST /:id/factura`:
  - Aplica multer como middleware (`upload.single('archivo')`)
  - Valida que `req.file` exista → 400 `archivo_requerido`
  - Valida que `req.body.numero` sea string no vacío, max 80 chars → 400
  - Guarda la **ruta relativa** a `UPLOAD_DIR` en `factura_proveedor_url` (mismo patrón que evidencias: `path.relative(env.UPLOAD_DIR, req.file.path)`)
  - Guarda `factura_proveedor_nombre_original = file.originalname`
  - Llama `notificarFacturaProveedorSubida(ocId)` — fire-and-forget con catch que loguea (no bloquea la respuesta)
  - Responde con la OC actualizada
- Agregar `GET /:id/factura/file` — descarga del archivo para el proveedor:
  - Middleware: `requireProveedorId` + verificación de que la OC pertenece al proveedor
  - Verifica que `factura_proveedor_url` no sea null → 404
  - Path traversal check: `fullPath` debe empezar con `UPLOAD_DIR` resuelto
  - `res.setHeader('Content-Type', mime)` + `fs.createReadStream(fullPath).pipe(res)`

### `services/email.ts`

Nuevo template `templateFacturaProveedorSubida`:

```typescript
templateFacturaProveedorSubida(params: {
  oc_codigo: string
  proveedor_nombre: string
  factura_numero: string
  panel_url: string       // https://panel.techtrafo.com/compras/ordenes-compra/<id>
}): { subject: string; html: string; text: string }
```

- Asunto: `Nueva factura recibida — ${oc_codigo} · ${proveedor_nombre}`
- Body: nombre del proveedor, código OC, número de factura recibida, botón "Ver orden de compra" → `panel_url`
- Mismo layout HTML (`layout()` + `escapeHtml()`) que los otros templates existentes

### `services/notificaciones.ts`

Nuevo tipo en el union `TipoNotificacion`:
```typescript
| "factura_proveedor_subida"
```

Nueva función:
```typescript
async function notificarFacturaProveedorSubida(ocId: number): Promise<void>
```

Lógica:
1. Busca la OC con `proveedor_id` + nombre del proveedor (`proveedores.razon_social`)
2. Busca todos los usuarios activos con rol `jefe_compras` o `financiero` (puede ser 0)
3. Si no hay destinatarios: `console.warn(...)` y retorna sin error
4. Inserta una fila en `core.notificaciones` por cada destinatario:
   - `tipo`: `"factura_proveedor_subida"`
   - `destinatario_id`: UUID del usuario
   - `destinatario_email`: email del usuario
   - `asunto` / `cuerpo_html` / `cuerpo_texto`: desde `templateFacturaProveedorSubida`
   - `contexto`: `{ orden_compra_id: ocId, proveedor_id: ... }`
   - `enviado`: false

---

## Frontend

### `app/(proveedor)/oc/[id]/page.tsx` (o componente de factura)

**Estado actual:** dos `<input type="text">` — número + URL externa.

**Estado nuevo:**
- `<input type="text">` — número de factura (sin cambio)
- `<input type="file" accept="application/pdf,image/*">` — archivo
- Submit construye `FormData` con campos `numero` + `archivo` (en lugar de `JSON.stringify`)

### `lib/portal.ts`

Actualizar `subirFactura()`:
```typescript
// Antes: fetch con JSON body
// Después: fetch con FormData
const fd = new FormData()
fd.append('numero', numero)
fd.append('archivo', archivo)
fetch(url, { method: 'POST', body: fd })  // sin Content-Type header (lo pone el browser)
```

**UX post-subida:**
- Si no hay factura: mostrar form de subida
- Si ya hay factura: mostrar `factura_proveedor_nombre_original` + botón "Ver factura" + botón "Reemplazar"
- "Ver factura" llama `GET /api/proveedor-portal/oc/:id/factura/file` y abre el stream en nueva pestaña (no URL directa al disco — sigue el mismo patrón que evidencias de OT)

**Panel interno (jefe_compras / financiero):**
- Agregar `GET /api/ordenes-compra/:id/factura/file` en el router interno de OC (requiere `compras.read`)
- Misma lógica de stream + path traversal check
- El detalle de OC en el panel interno muestra el nombre del archivo + botón "Ver factura del proveedor" que llama este endpoint

---

## Manejo de errores

| Caso | Respuesta |
|------|-----------|
| No viene archivo | 400 `archivo_requerido` |
| Tipo de archivo no permitido | 400 `tipo_archivo_invalido` |
| Archivo > 10 MB | 400 `archivo_demasiado_grande` |
| OC no pertenece al proveedor | 403 (middleware existente) |
| Fallo al encolar notificación | Loguea error, no falla el endpoint (la factura ya quedó guardada) |
| No hay destinatarios para notificación | `console.warn`, no falla |

---

## Archivos modificados

| Archivo | Tipo de cambio |
|---------|---------------|
| `database/migrations/029-factura-proveedor-upload.sql` | Nuevo |
| `backend/src/routes/proveedor-portal.ts` | Modificar POST factura + agregar GET factura/file |
| `backend/src/routes/ordenes-compra.ts` | Agregar GET /:id/factura/file (panel interno) |
| `backend/src/services/email.ts` | Agregar templateFacturaProveedorSubida() |
| `backend/src/services/notificaciones.ts` | Agregar tipo + notificarFacturaProveedorSubida() |
| `backend/prisma/schema.prisma` | Regenerar (db pull) |
| `frontend/src/lib/portal.ts` | Cambiar subirFactura() a FormData |
| `frontend/src/app/(proveedor)/oc/[id]/...` | Cambiar form a file input + botón ver |
| `frontend/src/app/(app)/compras/ordenes-compra/[id]/...` | Mostrar nombre de factura + botón ver |

**No requiere** nuevas tablas, nuevo worker, nuevas rutas de notificaciones, ni cambios en nginx.
