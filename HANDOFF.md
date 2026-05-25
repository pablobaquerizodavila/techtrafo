# TECHTRAFO — Handoff entre sesiones de Claude

> Documento para que una nueva sesión de Claude arranque sin perder contexto sobre el estado del proyecto. Leer COMPLETO antes de hacer cambios. Última actualización: **2026-05-24 · v0.13.0 · plantillas de cotización con check de stock + revisión interna escalonada + gating de roles en expedientes**.

---

## 1. Estado del proyecto en 30 segundos

- **Empresa**: TECHTRAFO — fabricación, reparación y mantenimiento de transformadores eléctricos (150 kVA → 10 MVA), Samborondón, Ecuador.
- **Versión actual**: `v0.13.0`. La sesión `0.12.0 → 0.13.0` cerró:
  - **Form editable del informe técnico** con secciones de diagnóstico / pronóstico / trabajos / estimaciones (sobre `datos_inspeccion JSONB`)
  - **Fix crítico del PDF**: `pintarPie` causaba "Maximum call stack" cuando el documento pasaba a 2+ páginas (margen inferior se restaura ahora durante el render del footer)
  - **Gating de acciones en expedientes por rol designado**: solo el responsable o aprobador del hito (o un override `presidencia/gerencia_general/gerencia_comercial`) puede iniciar/aprobar/rechazar/reintentar/reabrir/escalar
  - **Atajos contextuales en hitos**: botón "Ver/Emitir cotización/contrato/OT/informe" dentro de cada hito del expediente
  - **Auto-link cotización ↔ expediente**: emitir cotización desde el flujo del expediente la deja vinculada (`expedientes.cotizacion_id`)
  - **Revisión interna escalonada de cotizaciones** (`gerencia_comercial → gerencia_general → presidencia`): migration 017, 4 endpoints + historial + bloqueo de "enviar al cliente" hasta aprobación + notificaciones email automáticas
  - **Plantillas de cotización con check de stock**: migration 018, CRUD de plantillas en `/admin/cotizacion-plantillas`, endpoint `POST /api/cotizaciones/desde-plantilla` que valida stock en `inventario.stock` y marca líneas con flag `pendiente_aprovisionamiento` + días de aprovisionamiento. **Autocomplete de items con sincronización automática del costo desde bodega** al momento de emitir
  - Fix Prisma: el FK escalar `actualizado_por` dejó de ser aceptado en UpdateInput tras agregar nuevos FKs a `core.usuarios` — ahora se usa la relación nombrada
  - Notificaciones email para revisión interna (solicitar/escalar → rol destino; aprobar/rechazar → vendedor original)
- **Próximo trabajo natural** (no bloquea ni urge):
  - Módulo de compras / asignación a bodega para resolver el aprovisionamiento de líneas pendientes (hoy el tiempo es manual por componente)
  - Validación opcional de margen mínimo por gerencia general (rechazo automático si margen < X%)
  - Iterar campos del form de visita técnica e informe técnico con data real
  - Definir si bodega compra o existe departamento de compras (Pablo lo confirma con su equipo)
- **Repo**: https://github.com/pablobaquerizodavila/techtrafo (branch `main`)

## 2. Topología real (no la del CLAUDE.md genérico)

```
Internet (186.101.238.135)
  └─ NAT 80/443 → VM nginx 192.168.0.7 (Ubuntu 22.04 + Let's Encrypt)
      ├─ techtrafo.com / www       → NAS Web Station :80 (landing)
      ├─ panel.techtrafo.com       → PC Ubuntu :3002 (frontend Next.js, panel interno)
      ├─ portal.techtrafo.com      → PC Ubuntu :3002 (mismo container, middleware reescribe a /portal/*)
      └─ api.techtrafo.com         → PC Ubuntu :3000 (backend Express)

  El cert SAN /etc/letsencrypt/live/panel.techtrafo.com/ cubre los 3 subdomains
  (panel + api + portal). Renovación automática vía certbot timer.

NAS Synology DS1821+ 192.168.0.116 (DSM 7.3.2)
  ├─ Web Station: techtrafo.com (landing comercial estática)
  └─ MailPlus Server: SMTP submission 465/587 con DKIM en eneural.org, medicvip.org, siscormed.com
      Y ADEMÁS techtrafo.com (agregado en v0.12.0 con DKIM rspamd manual).
      Cuenta operativa actual: notificaciones@techtrafo.com (alias techtrafonotif).

PC Ubuntu 192.168.0.23 (Docker Compose stack)
  ├─ techtrafo-api        Express+TS+Prisma  :3000  (workers: notificaciones + scada-bridge in-process)
  ├─ techtrafo-web        Next.js 15 App Router :3002
  ├─ techtrafo-postgres   PostgreSQL 16.14 :5432 (datos de negocio)
  ├─ techtrafo-redis      :6379
  ├─ techtrafo-grafana    :3001 (5 dashboards provisioned, datasources Postgres + Influx)
  ├─ techtrafo-influxdb   :8086 (telemetria SCADA, retention 30d)
  ├─ techtrafo-mosquitto  :1883 interno (MQTT broker, sin port host)
  ├─ techtrafo-simulador  perfil "simulador" — publica lecturas demo (apagar cuando haya hardware)
  └─ techtrafo-nginx      proxy local + health
```

Volúmenes Docker importantes:
- `/home/techtrafo/techtrafo/backend` → `/app` (código backend live-reload via ts-node-dev)
- `/home/techtrafo/techtrafo/frontend` → `/app` (código frontend live-reload via next dev)
- `/home/techtrafo/techtrafo/uploads` → `/uploads` (evidencias de OT, montado al api)
- `/opt/techtrafo/postgres-data` → datos persistentes de PostgreSQL

## 3. Credenciales para operar (USAR SSH+plink, NO copiar/pegar al user)

> Pablo NO quiere comandos a copiar/pegar. Ejecutar TODO vía SSH desde `plink` o `pscp`.

| Host | Usuario | Password | Para qué |
|---|---|---|---|
| `192.168.0.23` (PC Ubuntu, Docker host) | `techtrafo` | `techtrafo$` | Operar contenedores, editar archivos del repo |
| `192.168.0.7` (VM nginx, voip-panel-01) | `pbaquerizo` | `Groundunder8299$` | Editar nginx vhost en `/etc/nginx/sites-available/netvoice` (un solo archivo para todos los dominios — Netvoice, TECHTRAFO, MedicVIP, Siscormed). Sudo con password. |
| `192.168.0.116` (NAS Synology) | `pbaquerizo` | `Groundunder8299*` | Inspeccionar/operar Synology, configurar MailPlus |
| PostgreSQL en container | `techtrafo_admin` | `Cambiar_Esta_Password_Segura_2026` | Consultas DB directas |
| Cuenta SMTP TECHTRAFO en MailPlus | `techtrafonotif` (alias `notificaciones@techtrafo.com`) | Persiste en /opt/techtrafo/.env como SMTP_PASS | Saliente desde el worker |
| Usuario admin del panel | `pablobaquerizodavila@gmail.com` | (Pablo lo recuerda) | Login web |
| Usuario cliente DEMO del portal | `cliente.petroecuador@techtrafo.com` | `lZTGKAM2VKx55bru` | Probar vista cliente en `/portal` |

**Comandos típicos** (vía plink/pscp desde Windows):

```bash
# Inspeccionar contenedor
plink -batch -ssh -pw 'techtrafo$' techtrafo@192.168.0.23 'docker ps'

# Subir archivo al server
pscp -batch -pw 'techtrafo$' "C:\Users\Pablo B\techtrafo\<archivo>" \
  techtrafo@192.168.0.23:/home/techtrafo/techtrafo/<destino>

# Postgres directo
plink ... 'docker exec techtrafo-postgres psql -U techtrafo_admin -d techtrafo -c "SELECT ..."'

# Aplicar migration
plink ... 'docker exec -i techtrafo-postgres psql -U techtrafo_admin -d techtrafo < /home/techtrafo/techtrafo/database/migrations/NNN.sql'

# Regenerar Prisma tras migration nueva
plink ... 'docker exec techtrafo-api npx prisma db pull && docker exec techtrafo-api npx prisma generate'

# Sincronizar schema.prisma al local
pscp ... techtrafo@192.168.0.23:/home/techtrafo/techtrafo/backend/prisma/schema.prisma "C:\Users\Pablo B\techtrafo\backend\prisma\schema.prisma"

# Backup ad-hoc
plink ... 'cd /home/techtrafo/backups && STAMP=$(date +%Y%m%d-%H%M%S) && docker exec techtrafo-postgres pg_dump -U techtrafo_admin --clean --if-exists --no-owner techtrafo | gzip > techtrafo-db-${STAMP}.sql.gz && cp /opt/techtrafo/.env techtrafo-env-${STAMP}.env'
```

## 4. Convenciones que respeta el repo

- **DB en SQL puro** en `database/migrations/NNN-*.sql` aplicado manualmente. Prisma es solo **cliente** (`prisma db pull` + `generate`), **NUNCA** se usa para migrations.
- Tras una migration, hay que: aplicar SQL → `prisma db pull` → `prisma generate` → restart api → bajar `schema.prisma` al local.
- **Triggers de auditoría** automáticos: `core.fn_auditar()` + `core.fn_set_updated_at()` aplicados via trigger en cada tabla de negocio. El backend setea `app.usuario_id` con `set_config` dentro de cada transacción (helper `withAppUser`).
- **Naming**: snake_case plural, `created_at`/`updated_at` en inglés, `creado_por`/`actualizado_por` UUID.
- **PKs**: BIGSERIAL para todo el negocio, UUID solo para `core.usuarios`.
- **Soft-delete** vía columna `estado` (nunca DELETE físico).
- **Códigos auto** con SPLIT_PART (NUNCA SUBSTRING con BigInt — bug recurrente): `COT-YYYY-NNNN`, `OT-YYYY-NNNN`, `EXP-YYYY-NNNN`, `GAR-YYYY-NNNN`, `INF-YYYY-NNNN`, `REC-YYYY-NNNN`, `TRF-YYYY-NNNN`.
- **Permisos**: granular `modulo.accion`, formato legacy `modulo` también soportado, `all: true` comodín, super_admin bypassa todo.
- **JWT en cookie HttpOnly** con `Domain=.techtrafo.com` en producción. Default 8h. Revocación por `token_version` en DB.
- **Cookies y CORS**: backend en `api.techtrafo.com`, frontend en `panel.techtrafo.com` comparten cookie por dominio padre `.techtrafo.com`.
- **Prisma — campos FK escalares en UpdateInput**: cuando un modelo tiene múltiples FKs a otra tabla (ej. `cotizaciones` → 6 FKs a `core.usuarios`), Prisma desambigua exponiendo solo las relaciones nombradas en UpdateInput, no el FK escalar. Usar la relación: `usuarios_cotizaciones_actualizado_porTousuarios: { connect: { id: userId } }`. CreateInput sí acepta FK escalar.

## 5. Estructura del repo (orientación rápida)

```
techtrafo/
├── README.md, CHANGELOG.md, HANDOFF.md
├── docs/                        # ADRs y diagramas
├── infrastructure/docker/       # docker-compose.yml + Dockerfiles + grafana provisioning
│   └── nginx/block-credential-scans.conf
├── database/migrations/         # SQL puro 001 → 018
├── backend/                     # API
│   ├── package.json
│   ├── prisma/schema.prisma     # GENERADO por db pull, NO editar a mano
│   └── src/
│       ├── server.ts
│       ├── config/env.ts        # zod, incluye SMTP, UPLOAD_DIR, INFLUX_*, MQTT_*, etc
│       ├── auth/                # JWT + middleware con permisos + csrf + rate-limit
│       ├── db/                  # client.ts + withAppUser.ts
│       ├── routes/              # 14 routers (cotizacion-plantillas es nuevo en v0.13.0)
│       ├── services/            # email.ts (multi-template), notificaciones.ts, pdf/*
│       └── workers/             # notificaciones-worker, garantias-worker, scada-bridge
├── frontend/                    # Next.js 15 App Router
│   ├── package.json
│   └── src/
│       ├── middleware.ts        # auth gate por cookie + host rewrite a /portal
│       ├── app/
│       │   ├── (app)/           # layout autenticado con sidebar dinámico
│       │   │   ├── admin/{usuarios, roles, hito-plantillas, cotizacion-plantillas}
│       │   │   ├── cotizaciones/[id] (con panel de revisión interna)
│       │   │   ├── expedientes/[id]   (con atajos por hito + gating de botones)
│       │   │   └── ...
│       │   └── portal, login, register
│       ├── components/ui/       # shadcn (button, dialog, select, table...)
│       ├── components/          # cronometro, visita-tecnica-form, informe-tecnico-form, informe-tecnico-dialog
│       └── lib/                 # api.ts + 11 helpers de dominio (incluye cotizacion-plantillas)
└── _backups/                    # backups locales mirror del server (gitignored)
```

## 6. Endpoints REST al cierre v0.13.0

15 routers. Ver `README.md` sección "API endpoints actuales" para listado completo. Highlights nuevos en v0.13.0:

- `/api/cotizaciones`:
  - `POST /desde-plantilla` — genera cotización desde plantilla con check de stock; vincula a expediente si `expediente_id` viene en el body
  - `POST /:id/revision-interna/{solicitar,aprobar,rechazar,escalar}` — flujo de aprobación interna jerárquica
  - `GET /:id/revision-interna/historial`
  - `POST /` ahora acepta `expediente_id` opcional para auto-linkear
  - El campo `lineaSchema` acepta `pendiente_aprovisionamiento`, `tiempo_aprovisionamiento_dias`, `categoria` (se preservan al editar)
- `/api/cotizacion-plantillas` (NUEVO router):
  - CRUD completo, solo roles override (`presidencia/gerencia_general/gerencia_comercial`) pueden modificar
  - GET para listar/leer es público con `cotizaciones.read`
- `/api/expedientes`:
  - Todos los endpoints de hito ahora validan `puedeActuarEnHito(user, hito, accion)`. Si no pasa → 403 `rol_no_designado`
  - `POST /:id/cancelar` exige rol override
  - `PATCH /:id/hitos/:hitoId` (SLA) exige rol override

## 7. Decisiones de Pablo a respetar (de memoria persistente)

- **NUNCA** tocar `panel.eneural.org` (VM nginx) ni el sitio principal `eneural.org` — esa VM es de Netvoice y aloja también el frontend de TECHTRAFO. Cualquier cambio en nginx hay que validarlo con cuidado.
- **NO** sugerir rotación de passwords compartidas en chat.
- **Operar directo vía SSH** desde plink/pscp — Pablo NO quiere copiar-pegar comandos.
- **Backup + commit + push después de cada hito** (ya está documentado en CHANGELOG). El backup va a `/home/techtrafo/backups/` con timestamp.
- **Repo local en Windows con `.git`** (desde v0.13.0): el repo "real" sigue viviendo en el server en `/home/techtrafo/techtrafo/` con git, pero `C:\Users\Pablo B\techtrafo\` también es ahora un repo git apuntando al mismo remoto. Si haces cambios en el server vía pscp y commiteas allí, puedes hacer `git pull` en local. Si haces cambios en local desde un editor, también puedes `git push`. El flujo principal sigue siendo: edit local (Claude) → pscp al server → commit/push desde server.
- **Cache después de cambio de contenido**: si Pablo ve la versión vieja en el panel, sugerir incógnito ANTES de investigar el server.

## 8. Backlog y trabajo cerrado

### v0.10.0 — v0.12.0 (sesiones previas, cerrado)
- FASE 4 plus, FASE 5 portal cliente, FASE 6 (4 dashboards Grafana), Hardening nginx, FASE 7 SCADA, FASE 8 alerting, admin user management + self-service, edición SLA, cronómetros, form visita técnica → informe → email.
- **Auditoría de seguridad COMPLETA**: 4 CRITICAL + 3 HIGH + 4 MEDIUM cerrados. H5/H6 mitigados por aislamiento.
- Email migrado a `notificaciones@techtrafo.com` con DKIM en techtrafo.com.
- Notificaciones filtran expedientes en estado terminal.
- Reactivar expediente desde estado terminal (override roles).

### v0.13.0 — sesión 2026-05-24 (cerrado)

**Form editable del informe técnico** (commit `edbf1e5`)
- Nuevo componente `informe-tecnico-form.tsx` con 5 secciones: diagnóstico (causa raíz / severidad / componentes afectados), pronóstico (vida útil / riesgo), trabajos requeridos (multi-check), estimaciones (repuestos locales / tiempos / rango costo), decisión técnica
- Se invoca desde `InformeTecnicoDialog` cuando el informe está en `borrador` o `rechazado`
- Persistencia en `informes_tecnicos.datos_inspeccion JSONB` (extiende los keys ya usados por la visita)
- PDF renderer extendido para mostrar las nuevas secciones (`DIAGNOSTICO_FIELDS`, `ESTIMACION_FIELDS`, componentes_afectados, trabajos_requeridos)

**Fix crítico PDF** (commit `99ca7cf`)
- Síntoma: `RangeError: Maximum call stack size exceeded` al enviar email del informe técnico, después de mis cambios al renderer.
- Causa raíz: `pintarPie` hace `doc.text(footerText, 50, h-28, { width, align: "center" })`. La coordenada y=h-28 está debajo del bottom margin (h-80). El text wrapper de PDFKit interpreta eso como overflow y dispara `addPage` internamente. Como `pintarPie` se llama desde el listener `pageAdded`, eso reentraría el listener → bucle infinito.
- Fix aplicado: en `pintarPie` se baja temporalmente `doc.page.margins.bottom = 5` antes del text del footer, y se restaura al original después. El wrapper deja de ver overflow.

**Gating de acciones en expedientes por rol designado** (commit `4aeb914`)
- Helper `puedeActuarEnHito(user, hito, accion)` tanto en backend (`backend/src/routes/expedientes.ts`) como en frontend (`frontend/src/lib/expedientes.ts`).
- Reglas:
  - `iniciar`: responsable asignado (si hay) o cualquiera con permiso si no hay responsable
  - `aprobar` / `rechazar`: solo el rol que coincide con `rol_aprobador_id` del hito
  - `reintentar` / `reabrir_anterior` / `escalar`: el responsable del hito rechazado
  - `editar_sla`: solo override
- Override: `presidencia`, `gerencia_general`, `gerencia_comercial`, `super_admin` pasan todos los chequeos.
- Backend devuelve `403 { error: "rol_no_designado", accion: "..." }`. Frontend oculta botones.

**Atajos contextuales en hitos** (commit `b6136ef`)
- Cada hito en `/expedientes/[id]` muestra un botón "Ver/Emitir documento" basado en su `codigo`:
  - codigo contiene "cotizacion" → si `expediente.cotizaciones` existe → "Ver cotización"; si no → "Emitir cotización" (link a `/cotizaciones/nueva?expediente_id=X`)
  - Similar para contrato, OT, informe técnico (este último abre el dialog inline)

**Auto-link cotización ↔ expediente** (commit `307622e`)
- `POST /api/cotizaciones` y `POST /api/cotizaciones/desde-plantilla` aceptan `expediente_id` opcional.
- Si viene: valida que el expediente exista, esté `activo` y que el `cliente_id` coincida. Luego, después de crear la cotización, hace `UPDATE expedientes SET cotizacion_id = nueva.id`.
- `/cotizaciones/nueva` lee `?expediente_id=X` de la URL, precarga el cliente y redirige al expediente tras crear.

**Revisión interna escalonada de cotizaciones** (commits `d6b3ad0`, `c2428f8`)
- Migration 017: 6 columnas en `cotizaciones` (`revision_interna_estado`, `_nivel`, `_solicitada_por`, `_solicitada_at`, `_resuelta_por`, `_resuelta_at`, `_motivo_rechazo`) + tabla `cotizacion_revision_interna_historial`
- 4 endpoints en `routes/cotizaciones.ts`:
  - `POST /:id/revision-interna/solicitar` — vendedor solicita; estado pasa a `pendiente` nivel 1
  - `POST /:id/revision-interna/aprobar` — el rol del nivel actual aprueba; estado → `aprobada`
  - `POST /:id/revision-interna/rechazar` — vuelve al vendedor con motivo
  - `POST /:id/revision-interna/escalar` — sube de nivel (1→2→3); tope 3
  - `GET /:id/revision-interna/historial` — lista cronológica
- Mapeo nivel ↔ rol: `1=gerencia_comercial, 2=gerencia_general, 3=presidencia`
- Bloqueo en `POST /:id/transicion` con `accion="enviar"`: si `revision_interna_estado !== "aprobada"` → 409 `revision_interna_pendiente`
- Notificaciones email automáticas (`templateRevisionInternaCotizacion` en `email.ts` + `notificarRevisionCotizacion` en `notificaciones.ts`):
  - Solicitar / Escalar → notifica a todos los usuarios del rol destino
  - Aprobar / Rechazar → notifica al vendedor original (campo `revision_interna_solicitada_por`)
- UI: panel "Revisión interna" en `/cotizaciones/[id]` con badge de estado por color, botones contextuales según rol+estado, historial expandible.

**Plantillas de cotización con check de stock** (commits `e76b92e`, `c6a226f`, `4981201`, `4e48c55`)
- Migration 018:
  - `cotizacion_plantillas` (cabecera): código, nombre, tipo_servicio, rango kVA, margen %, contingencia %, IVA %, tiempo entrega base, condiciones de pago/observaciones default, activo
  - `plantilla_componentes`: pertenece a plantilla, con categoría (11 opciones: materia_prima/consumible/mano_obra/servicio_externo/ensayo/transporte/documentacion/garantia/indirecto/imprevisto/otro), `item_id` FK opcional a `inventario.items`, cantidad, unidad, precio, costo, días aprovisionamiento default
  - `cotizacion_lineas`: 3 columnas nuevas `pendiente_aprovisionamiento`, `tiempo_aprovisionamiento_dias`, `categoria`
  - `cotizaciones`: 2 columnas nuevas `plantilla_id` (FK), `contingencia_porcentaje`
- Router nuevo `backend/src/routes/cotizacion-plantillas.ts` con CRUD (solo override roles pueden POST/PATCH/DELETE)
- Endpoint nuevo en cotizaciones: `POST /api/cotizaciones/desde-plantilla`:
  - Lee componentes de la plantilla
  - Para cada componente con `item_id`: **re-lee `costo_referencia` actual del item** (sincroniza con bodega; el costo cacheado en la plantilla solo se usa como fallback). También suma `inventario.stock` para validar disponibilidad
  - Si hay stock < cantidad → flag `pendiente_aprovisionamiento=true` + `tiempo_aprovisionamiento_dias`
  - Si `precio_unitario_default=0` → calcula precio = `costo × (1+contingencia%) × (1+margen%)`
  - Tiempo entrega = base + max(días aprovisionamiento) con texto descriptivo
- UI nueva en `frontend/src/app/(app)/admin/cotizacion-plantillas/`:
  - Listado con archivar (soft = activo=false)
  - Form de creación/edición con autocomplete de items (HTML `<datalist>` nativo): escribe código → sugerencias filtradas con código+nombre+costo → al elegir autollena unidad, costo (queda deshabilitado), descripción (si estaba vacía)
- Botón "Desde plantilla" en `/cotizaciones/nueva` cuando viene de expediente
- Badge "🛒 Pendiente compra · Xd" en líneas de cotización (UI + PDF)
- Sidebar link en admin: "Plantillas de cotización"

**Fix Prisma actualizado_por** (commit `8aaa012`)
- Tras agregar nuevos FKs a `core.usuarios` en migration 017 (revision_interna_solicitada_por, revision_interna_resuelta_por), Prisma desambiguó las 6 relaciones de `cotizaciones` → `core.usuarios` y dejó de exponer `actualizado_por` como campo escalar en UpdateInput.
- Fix: usar la relación nombrada en PATCH y DELETE de cotizaciones:
  ```ts
  data: { usuarios_cotizaciones_actualizado_porTousuarios: { connect: { id: userId } } }
  ```
- CreateInput sigue aceptando el FK escalar, por eso `POST` no se vio afectado.

### Backlog próximo (no urgente)
- **Módulo de compras** o asignación a bodega para resolver el aprovisionamiento de líneas pendientes — hoy el tiempo es manual, cuando exista compras se puede automatizar con datos reales de proveedores. Pablo todavía no decidió si será un departamento nuevo o si bodega hace las compras.
- **Validación de margen mínimo** por gerencia general (rechazo automático si margen < X% configurable)
- Iterar campos del form de visita técnica e informe técnico con data real
- Object storage MinIO para evidencias y PDFs (hoy filesystem)
- Importación masiva de transformadores existentes desde Excel
- App móvil PWA para ingenieros de campo (offline-first para hallazgos)
- Más reglas de alerta SCADA cuando lleguen sensores físicos

## 9. Gotchas / errores recurrentes

- **`npm install <pkg>` en el container API purga devDependencies** (ts-node-dev se va). Solución: hacer rebuild de la imagen API con `docker compose build api && docker rm -fv techtrafo-api && docker compose up -d api`. Pasó con multer y nodemailer.
- **JWT expirado → loop login/dashboard**: el middleware redirige a /login si la cookie está, y /login redirige a /dashboard. Fix: `SessionExpiredButton` que llama POST `/api/auth/logout` y hace `window.location.href = "/login"`. Ya está en producción.
- **Cookie con `Domain=.techtrafo.com`** no se guarda en curl contra localhost. Para probar endpoints autenticados localmente, usar el browser real o forzar `Domain=localhost` temporalmente.
- **`UPDATE ... FROM ... JOIN`** en Postgres NO permite joinear la tabla updateada en el FROM. Usar CTE (ver migration 013 — error y fix).
- **`SUBSTRING(codigo, ...)` con BigInt**: bug histórico. Usar `SPLIT_PART(codigo, '-', N)::INTEGER`.
- **Hashes bcrypt con `$`** se rompen en bash one-liners. Generar y aplicar SIEMPRE dentro del container con `docker exec ... node -e "..."`.
- **Synology MailPlus**: tiene 4 capas de control (active_member_table, local_recipient_map, login_map, alias.db). Crear cuentas nuevas necesita la UI de DSM. Reusar las existentes.
- **PDFKit con listener `pageAdded`**: si el listener pinta texto a coordenadas absolutas debajo del bottom margin (ej. footer en y=h-28 con margin.bottom=80), el text wrapper interpreta eso como overflow y dispara otro `addPage`, generando recursión infinita. Solución: bajar temporalmente `doc.page.margins.bottom` durante el render del footer.
- **Prisma UpdateInput** rechaza FK escalar cuando hay múltiples FKs al mismo modelo destino. Usar relación nombrada (`usuarios_<tabla>_<campo>Tousuarios: { connect: {...} }`).

## 10. Cómo arrancar la nueva sesión

En la nueva sesión de Claude, pasa este prompt inicial:

> Soy Pablo Baquerizo, dueño de TECHTRAFO (fab/rep/mant de transformadores en Samborondón).
> Antes de hacer cualquier cosa, lee `C:\Users\Pablo B\techtrafo\HANDOFF.md` completo — ahí está el contexto del proyecto, credenciales SSH para operar, convenciones del repo y backlog pendiente.
> Operá SIEMPRE vía plink/pscp sobre el server `techtrafo@192.168.0.23` (no me pidas copiar comandos). Cuando termines de leer el handoff, decime un resumen corto del estado y preguntame qué seguimos.

La nueva sesión va a leer este archivo, va a entender todo, y vamos a poder retomar donde dejamos.
