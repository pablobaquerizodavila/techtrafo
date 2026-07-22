# Módulo "Requerimientos de Desarrollo" (DEV) — Diseño

**Fecha:** 2026-07-22
**Estado:** aprobado por Pablo (diseño). Pendiente: spec review → plan → implementación.

## Objetivo

Módulo interno de ticketing donde cualquier usuario del sistema registra necesidades,
mejoras, errores o nuevos desarrollos, y el **Área de Desarrollo** los revisa, gestiona,
asigna, cambia de estado y les da seguimiento — con historial inmutable, comentarios,
adjuntos, notificaciones (in-app + email) y panel de indicadores. Totalmente integrado
al sistema TECHTRAFO existente (no una app aparte).

## Decisiones tomadas (con Pablo, 2026-07-22)

1. **Código de ticket:** `DEV-000001` — contador **global** de 6 dígitos, sin año, sin reinicio.
2. **Área de Desarrollo:** se crea un **rol nuevo `desarrollo`** con el permiso de gestión.
   Pablo asigna usuarios a ese rol desde Admin → Usuarios.
3. **Notificaciones:** **campana in-app** (centro de notificaciones reutilizable) **+ email**
   por el worker existente.
4. **Estados/tipos/prioridades:** **fijos en código** (`VARCHAR + CHECK`), no administrables por UI.

## Contexto de arquitectura (patrones a respetar — verificado 2026-07-22)

- **DB:** PostgreSQL, migraciones SQL a mano en `database/migrations/NNN-*.sql` (siguiente = `030`),
  aplicadas con `docker compose exec postgres psql -f /scripts/030-...sql`. Prisma es introspectado
  (`prisma db pull` + `prisma generate`), NO `prisma migrate`. `previewFeatures=["multiSchema"]`.
- **Convención de tablas:** PK `BIGSERIAL`; `created_at`/`updated_at TIMESTAMPTZ`; `creado_por`/
  `actualizado_por UUID → core.usuarios`; ciclo de vida por columna `estado` (no delete físico);
  snake_case plural. Triggers genéricos `core.fn_set_updated_at()` (BEFORE UPDATE) y `core.fn_auditar()`
  (AFTER I/U/D → `core.auditoria`, lee `current_setting('app.usuario_id')`).
- **Código secuencial:** trigger `BEFORE INSERT` con `MAX(...)+1` + `LPAD`. Molde:
  `compras.fn_generar_codigo_oc` en `020-compras-ordenes-recepciones.sql`.
- **Backend:** Express+TS, router por módulo montado en `server.ts` (`app.use("/api/...", router)`).
  `requireAuth` global + `requirePermission(modulo, accion)` por endpoint. Escrituras vía
  `withAppUser(userId, tx => ...)` (para que la auditoría capture autor). Validación **zod**.
  Molde de router CRUD + transiciones: `backend/src/routes/ordenes-compra.ts`.
- **Adjuntos:** multer `diskStorage` (molde `backend/src/routes/evidencias.ts`), se guarda ruta
  relativa a `env.UPLOAD_DIR`; descarga con helper `backend/src/utils/serveStoredFile.ts`
  (protección path-traversal, `path.resolve`, sanitiza nombre).
- **Notificaciones:** cola `core.notificaciones` (email) + worker `setInterval` en
  `backend/src/workers/notificaciones-worker.ts`. Servicios en `backend/src/services/notificaciones.ts`
  (`crear()` + `notificar*`, buscar destinatarios por rol). Templates en `services/email.ts`
  (`layout()` + `escapeHtml()` obligatorio en todo valor dinámico).
- **RBAC:** permisos JSONB en `core.roles.permisos`, claves `"modulo.accion"`. `es_super_admin`
  bypassa. Catálogo de permisos del panel Admin: `backend/src/routes/admin.ts` (añadir el módulo).
- **Frontend:** Next 15 App Router, design system "Voltage OS". Menú en `frontend/src/app/(app)/layout.tsx`
  (gate por `hasPerm`). Rutas internas en `frontend/src/middleware.ts` (`INTERNAL_ROOTS`). Componentes
  compartidos: `PageHeader`, `HeaderActionPrimary`, `Panel`, `StatCard`, `Badge` (variants), `Table*`,
  `Select*` (value `"_"` = todos), `Dialog*`, `sonner` (toast). Cliente API: `lib/api.ts`
  (`apiFetch`, `ApiError`, CSRF header, `credentials:"include"`). Lib por dominio en `lib/*.ts`.
  Subida de archivos con `fetch` directo + FormData; descarga por URL absoluta a un endpoint `/file`.
  Confirmaciones con `window.confirm`/`window.prompt`. **Molde: módulo OT** (`app/(app)/ot/page.tsx`,
  `ot/[id]/page.tsx`, `lib/ot.ts`).
- **Sin precedente en el repo (se crean):** UI de comentarios/hilo, campana de notificaciones in-app,
  export CSV.

## Modelo de datos (migración `030-requerimientos-desarrollo.sql`, schema `desarrollo`)

Añadir `desarrollo` a `datasource.schemas` en `schema.prisma`.

### `desarrollo.requerimientos`
| Columna | Tipo | Notas |
|---|---|---|
| id | BIGSERIAL PK | |
| codigo | VARCHAR(30) UNIQUE NOT NULL | `DEV-000001`, trigger BEFORE INSERT |
| titulo | VARCHAR(200) NOT NULL | |
| tipo | VARCHAR(30) NOT NULL | CHECK: nuevo_desarrollo, mejora, correccion_error, cambio_configuracion, integracion, reporte_consulta, otro |
| modulo_relacionado | VARCHAR(120) | opcional, texto libre (con datalist de módulos en UI) |
| descripcion | TEXT NOT NULL | |
| problema | TEXT | necesidad a resolver |
| resultado_esperado | TEXT | |
| prioridad_sugerida | VARCHAR(10) NOT NULL DEFAULT 'media' | CHECK: baja, media, alta, urgente (la pone el solicitante) |
| prioridad | VARCHAR(10) | CHECK igual; definitiva, la pone Desarrollo (NULL hasta que se define) |
| estado | VARCHAR(25) NOT NULL DEFAULT 'registrado' | CHECK: los 11 estados |
| solicitante_id | UUID NOT NULL → core.usuarios | |
| asignado_a | UUID → core.usuarios | responsable, NULL hasta asignar |
| fecha_requerida | DATE | opcional (la pide el solicitante) |
| fecha_estimada_entrega | DATE | la pone Desarrollo |
| creado_por | UUID → core.usuarios | |
| actualizado_por | UUID → core.usuarios | |
| created_at | TIMESTAMPTZ DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ DEFAULT NOW() | |

Estados (CHECK): `registrado, en_revision, pendiente_informacion, aprobado, rechazado,
en_planificacion, en_desarrollo, en_pruebas, listo_produccion, completado, cancelado`.

Índices: `(estado)`, `(asignado_a)`, `(solicitante_id)`, `(created_at DESC)`, `(prioridad)`.

### `desarrollo.requerimiento_comentarios`
`id BIGSERIAL PK`, `requerimiento_id BIGINT NOT NULL → requerimientos ON DELETE CASCADE`,
`autor_id UUID → core.usuarios`, `cuerpo TEXT NOT NULL`, `es_tecnico BOOLEAN DEFAULT FALSE`
(true = comentario del Área de Desarrollo), `created_at`. **Inmutable** (sin UPDATE/DELETE por
usuarios normales; sin trigger updated_at). Índice `(requerimiento_id, created_at)`.

### `desarrollo.requerimiento_adjuntos`
`id BIGSERIAL PK`, `requerimiento_id BIGINT NOT NULL → ... ON DELETE CASCADE`,
`ruta_relativa TEXT NOT NULL` (relativa a UPLOAD_DIR), `nombre_original VARCHAR(255)`,
`mime VARCHAR(120)`, `tamano_bytes BIGINT`, `subido_por UUID → core.usuarios`, `created_at`.
Índice `(requerimiento_id)`.

### `desarrollo.requerimiento_historial`
`id BIGSERIAL PK`, `requerimiento_id BIGINT NOT NULL → ... ON DELETE CASCADE`,
`accion VARCHAR(30) NOT NULL` (CHECK: creado, cambio_estado, cambio_prioridad, cambio_responsable,
solicitud_info, comentario, adjunto, modificacion, estimacion), `detalle JSONB DEFAULT '{}'`
(valores antes/después, ej. `{"de":"registrado","a":"en_revision"}`), `por_usuario_id UUID → core.usuarios`,
`rol_actuante VARCHAR(50)`, `created_at TIMESTAMPTZ DEFAULT NOW()`. **Append-only** — sin
UPDATE/DELETE, ningún permiso lo modifica. Índice `(requerimiento_id, created_at DESC)`.

### Extensión de `core.notificaciones` (para campana in-app)
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`: `leido BOOLEAN NOT NULL DEFAULT FALSE`,
`leido_at TIMESTAMPTZ`, `enlace VARCHAR(300)` (ruta relativa in-app, ej. `/requerimientos/123`).
Aditivo — no rompe la cola de email. Índice `(destinatario_id, leido, created_at DESC)`.

### Triggers por tabla
- `requerimientos`, `requerimiento_comentarios`(solo auditar), `requerimiento_adjuntos`(solo auditar):
  `tg_*_auditar` (AFTER I/U/D → `core.fn_auditar`). `requerimientos` además `tg_*_updated_at`.
- `requerimiento_historial`: sin triggers (append-only; `core.auditoria` igual lo captura).
- `fn_generar_codigo_dev` + `tg_req_codigo` (BEFORE INSERT en requerimientos):
  ```sql
  IF NEW.codigo IS NOT NULL AND LENGTH(NEW.codigo) > 0 THEN RETURN NEW; END IF;
  SELECT COALESCE(MAX(SUBSTRING(codigo FROM 5)::INTEGER), 0) INTO v_max
    FROM desarrollo.requerimientos WHERE codigo LIKE 'DEV-%';
  NEW.codigo := 'DEV-' || LPAD((v_max+1)::TEXT, 6, '0');
  ```
  (Colisión bajo concurrencia mitigada por UNIQUE — patrón aceptado del proyecto.)

### Rol y permisos (en la misma migración)
- `INSERT INTO core.roles (nombre, descripcion, permisos) VALUES ('desarrollo', 'Área de Desarrollo',
  jsonb_build_object('desarrollo.read',true,'desarrollo.crear',true,'desarrollo.gestionar',true)) ON CONFLICT DO NOTHING`.
- A **todos los roles internos** (no `cliente_externo`/`cliente`) se les añade `desarrollo.read` + `desarrollo.crear`
  vía `UPDATE core.roles SET permisos = permisos || jsonb_build_object('desarrollo.read',true,'desarrollo.crear',true)
  WHERE nombre NOT IN ('cliente_externo','cliente')`.
- super_admin (presidencia/gerencias) ya bypassa.

## Máquina de estados (dirigida por Desarrollo)

| Desde | Hacia permitido |
|---|---|
| registrado | en_revision, rechazado, cancelado |
| en_revision | pendiente_informacion, aprobado, rechazado, cancelado |
| pendiente_informacion | en_revision, cancelado |
| aprobado | en_planificacion, cancelado |
| en_planificacion | en_desarrollo, cancelado |
| en_desarrollo | en_pruebas, pendiente_informacion, cancelado |
| en_pruebas | listo_produccion, en_desarrollo, cancelado |
| listo_produccion | completado, cancelado |
| completado | (terminal) |
| rechazado | (terminal) |
| cancelado | (terminal) |

- Solo `desarrollo.gestionar` cambia estados. Excepción: el **solicitante** puede `cancelar` los
  propios mientras el estado ∈ {registrado, en_revision, pendiente_informacion}.
- `completado` exige `asignado_a` no nulo (CHECK o validación de app).

## Permisos → capacidades

| Permiso | Capacidades |
|---|---|
| `desarrollo.read` | ver requerimientos (scope: propios si NO tiene gestionar; todos si lo tiene), ver historial/comentarios/adjuntos de los visibles |
| `desarrollo.crear` | crear requerimiento, comentar/adjuntar/responder-info en los propios, cancelar propios (estados tempranos) |
| `desarrollo.gestionar` | ver todos, cambiar estado, prioridad definitiva, asignar responsable, estimar fecha, comentar técnico, solicitar info, aprobar/rechazar/completar |
| super_admin | todo + reasignar + reportes |

Scope de visibilidad se aplica **en el router** (WHERE `solicitante_id = req.user.id` si no tiene gestionar).

## Backend (`backend/src/routes/requerimientos.ts`, montado `/api/requerimientos`)

Todos con `requireAuth`; permiso por endpoint; escrituras en `withAppUser`; cada mutación escribe
fila en `requerimiento_historial` y dispara `void notificar*(...).catch(...)`.

- `GET /` — lista con filtros (q, estado, prioridad, tipo, modulo, solicitante, responsable, rango
  fechas, bandeja) + paginación (`page`, `limit=25`, devuelve `{data, pagination}`); scope por rol.
- `GET /resumen` — KPIs del panel.
- `GET /export` — CSV server-side (respeta filtros + scope; `Content-Type text/csv`, `Content-Disposition attachment`).
- `GET /:id` — detalle (propio o gestionar) con solicitante/responsable embebidos.
- `POST /` — crear (`desarrollo.crear`); zod; genera código; historial `creado`; notifica a Desarrollo.
- `PATCH /:id` — editar campos propios (solicitante mientras estado temprano) o gestionar; historial `modificacion`.
- `POST /:id/estado` — cambiar estado (gestionar); valida transición; historial + notifica.
- `POST /:id/prioridad` — prioridad definitiva (gestionar).
- `POST /:id/asignar` — asignar responsable (gestionar); notifica al asignado.
- `POST /:id/estimar` — fecha estimada (gestionar).
- `POST /:id/solicitar-info` — pasa a pendiente_informacion + comentario (gestionar); notifica al solicitante.
- `POST /:id/cancelar` — cancelar (gestionar; o solicitante en estados tempranos).
- `GET|POST /:id/comentarios` — listar/agregar comentario (visible: propio o gestionar).
- `GET|POST /:id/adjuntos`, `GET /:id/adjuntos/:adjId/file` — multer + serveStoredFile.
- `GET /:id/historial` — timeline.

Extender `TipoNotificacion` y añadir `templateRequerimiento*` + `notificar*`. Añadir el módulo
`desarrollo` al catálogo de permisos en `routes/admin.ts`.

### Notificaciones in-app (extender `backend/src/routes/notificaciones.ts`)
- `GET /api/notificaciones` — las del usuario (paginado), `GET /api/notificaciones/unread-count`,
  `POST /api/notificaciones/:id/leer`, `POST /api/notificaciones/leer-todas`.

## Frontend (molde: OT)

- **Menú:** flag `puedeVerRequerimientos = hasPerm(user,"desarrollo","read")` + `NavGroup`/`NavLink`
  a `/requerimientos` (icono lucide) en `(app)/layout.tsx`. Añadir `/requerimientos` a `INTERNAL_ROOTS`
  en `middleware.ts`.
- **`/requerimientos/page.tsx`** (listado): 8 bandejas como tabs de filtro preseteado
  (Mis / Todos / Pend. revisión / Asignados a mí / En desarrollo / Pend. info / Completados / Cancelados),
  filtros (ticket, palabra clave, solicitante, responsable, estado, prioridad, tipo, módulo, rango fechas),
  paginación, `StatCard` KPIs, "Nuevo requerimiento", "Exportar CSV". Debounce 300ms en búsqueda.
- **`/requerimientos/nueva/page.tsx`**: formulario (todos los campos), validación, adjuntar archivos.
- **`/requerimientos/[id]/page.tsx`**: detalle + sub-paneles `comentarios-panel.tsx`,
  `adjuntos-panel.tsx`, `historial-panel.tsx`; acciones de estado condicionadas por estado + permiso,
  con `window.confirm`/`window.prompt` (motivo de rechazo, etc.); badges estado/prioridad con `Badge` variants.
- **`lib/requerimientos.ts`**: interfaces, `type EstadoReq`/`PrioridadReq`/`TipoReq`, helpers
  `estadoReqVariant`/`prioridadReqVariant`/`*Label`, funciones API, upload FormData, URL de descarga.
- **Campana:** componente `components/notificaciones-bell.tsx` en el header del layout (badge no-leídas,
  dropdown, click → `enlace`); `lib/notificaciones.ts`.

## Panel de control (KPIs, en `GET /resumen` + header del listado + vista dedicada)

Total, nuevos (registrado), en revisión, en desarrollo, pendientes de información, completados,
por prioridad, por responsable, tiempo promedio de atención (created_at → completado),
requerimientos vencidos (`fecha_requerida < hoy` y no completado/cancelado).

## Reglas transversales

- Sin borrado físico (cancelar / estado). Historial y auditoría inmutables.
- Campos obligatorios validados (zod + CHECK). Adjuntos protegidos (serveStoredFile + permiso + scope).
- Toda operación registra fecha/hora/usuario (withAppUser → core.auditoria + historial explícito).
- Aislamiento: solicitante sin `gestionar` no ve requerimientos ajenos (scope en el WHERE).
- Paginación en todas las listas. Export CSV respeta filtros y scope.
- Responsive y consistente con "Voltage OS". Confirmaciones antes de acciones importantes.

## Fases de implementación (Subagent-Driven Development)

1. **DB + backend core:** migración `030` (tablas, triggers, código, rol/permisos, extensión notificaciones),
   `prisma db pull`+`generate`, router `requerimientos.ts` (list scoped + detail + create + edit + estado/
   transiciones + historial), catálogo de permisos. Deploy a `.23`, smoke test.
2. **Comentarios + adjuntos:** endpoints + multer + serveStoredFile.
3. **Notificaciones:** servicios `notificar*` + templates email + endpoints in-app + worker (reuso).
4. **Frontend módulo:** menú + middleware + listado/bandejas/filtros/KPIs + form nueva + detalle/paneles/acciones + campana.
5. **Panel KPIs + export CSV + pruebas funcionales + documentación + instrucciones de deploy.**

Cada fase: implementar → review spec → review calidad → deploy `.23` → smoke → commit+push+backup (regla de oro).

## Entregables (al finalizar)

1. Migración `database/migrations/030-requerimientos-desarrollo.sql`.
2. Backend: router + servicios + templates + permisos.
3. Frontend: páginas, lib, componentes, campana, entrada de menú.
4. Validaciones (zod) y permisos (RBAC + scope).
5. Pruebas funcionales (smoke E2E de los flujos principales).
6. Documentación breve (README del módulo o sección en HANDOFF/CHANGELOG).
7. Instrucciones de despliegue a producción (aplicar migración con psql, `prisma generate`,
   rebuild de contenedores api/web, verificación).
