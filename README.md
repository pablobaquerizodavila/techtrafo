# TECHTRAFO — Sistema Integral de Gestión

> Plataforma de gestión empresarial para TECHTRAFO, empresa dedicada a la reparación, mantenimiento, ensamblaje y fabricación de transformadores eléctricos de 150 kVA hasta 10 MVA en Samborondón, Ecuador.

![Estado](https://img.shields.io/badge/estado-en%20producci%C3%B3n%20interna-success)
![Versión](https://img.shields.io/badge/versión-0.12.0-blue)
![Licencia](https://img.shields.io/badge/licencia-privada-red)

**URLs públicas:**
- [https://panel.techtrafo.com](https://panel.techtrafo.com) — panel administrativo (Next.js)
- [https://api.techtrafo.com](https://api.techtrafo.com) — backend REST (Express)
- [https://portal.techtrafo.com](https://portal.techtrafo.com) — portal cliente (Next.js, mismo build, ruta `/portal`)
- [https://techtrafo.com](https://techtrafo.com) — landing comercial (NAS Web Station)

---

## Qué es este proyecto

Sistema digital integral que orquesta toda la operación de TECHTRAFO desde el primer contacto comercial hasta la entrega final del transformador, la posventa y la telemetría del equipo en sitio.

**Cubre hoy:**
- **Comercial** — clientes, cotizaciones con revisiones, contratos con plan de pagos
- **Expedientes** — hoja de ruta del pedido del cliente con hitos auditables, **gates de aprobación**, **cronómetros en tiempo real por hito**, **4 acciones post-rechazo** (reintentar / reabrir hito anterior / escalar a otro rol / cancelar expediente) y **reactivación** desde estado terminal para Presidencia/Gerencia General/Gerencia Comercial
- **SLA editable** — plantilla maestra de hitos y override per-expediente desde la UI, con badge de "estancado" calculado en vivo
- **Visita técnica con formulario estandarizado** — secciones de datos generales, mediciones (V/I/aceite), hallazgos check-list, recomendación; al guardar genera **Informe Técnico** numerado automáticamente y descargable como PDF o despachable por email al cliente
- **Producción** — Órdenes de Trabajo (OT) con pipelines de pasos por tipo de ruta (9 / 11 / 6 pasos para reparación / fabricación / mantenimiento) y gates de QA, **Gantt visual** plan vs real, **evidencias** (fotos / PDFs) por paso y **trazabilidad** completa de cambios
- **Catálogo de transformadores** — equipos del cliente con características técnicas completas (capacidad, tipo, tensiones, conexión, dimensiones) e historial trazable por intervención
- **Áreas, causas de demora, reprocesos, tiempos-hombre** — productividad real por área y por responsable
- **Bodega** — categorías, ítems, ubicaciones, stock con lotes y series, kárdex
- **Notificaciones email** — alertas SMTP automáticas para estancamientos, gates esperando aprobación, escalaciones, garantías por vencer (30d/7d) y resoluciones; relay vía Synology MailPlus con **DKIM/SPF/DMARC** en `techtrafo.com`; las notificaciones de expedientes en estado terminal (cancelado/ganado/perdido) se ocultan automáticamente del menú
- **Dashboard ejecutivo de producción** — KPIs, semáforo de fases, matriz comparativa OT + expedientes, alertas activas, capacidad por área, causas de demora, productividad
- **Generación de PDFs** — cotización / contrato / OT / informe técnico con **4 niveles de detalle visible** (N1 cliente resumen, N2 cliente detallado, N3 interno comercial con márgenes, N4 interno completo con auditoría) y validación server-side por rol
- **Portal cliente** — vista limpia en `portal.techtrafo.com` (o `panel.techtrafo.com/portal`) con timeline simplificado, mapping interno→externo, KPIs propios sin info sensible
- **Garantías + reclamos + intervenciones** — CRUD completo con auto-creación al completar OT, alertas por vencer 30d/7d, gestión de reclamos y dictámenes
- **Roles y permisos granulares** — `modulo.accion` configurables desde UI + super_admin bypass + guards anti self-escalation (un admin no puede modificar su propio rol/activo ni asignar permisos que él mismo no tiene)
- **Admin de usuarios completo** — alta, baja, edición, reset de password, plantillas de hitos editables; **self-service `/perfil`** para que cualquier usuario cambie su email y password
- **SCADA (FASE 7)** — bridge MQTT→InfluxDB para telemetría de transformadores en sitio; simulador integrado en el stack para generar datos de prueba; topic `techtrafo/transformador/<equipo_id>/<variable>` con payload `{valor, unidad, ts}`
- **Monitorización y alerting con Grafana (FASE 6+8)** — 5 dashboards provisionados (comercial, planta, financiero, garantías, SCADA) + 5+ reglas de alerta versionadas (estancamiento de hitos, garantías por vencer, OT atrasadas, telemetría fuera de rango)
- **Hardening de seguridad** — auditoría completa OWASP Top 10 cerrada: permisos en 39 endpoints (IDOR), CSRF double-submit cookie, rate limiting (login/registro/password), JWT con `token_version` para revocación, error handler que no filtra stack en producción, nginx con snippet `block-credential-scans` para `.env / .git / service-account.json / wp-*`

## Arquitectura

Sistema distribuido en tres hosts dentro de la LAN, expuesto a internet via una VM nginx que termina TLS.

```
Internet (186.101.238.135)
   |
   v  router NAT 80/443
VM nginx 192.168.0.7  (Ubuntu 22.04 + Let's Encrypt SAN)
   |   termina TLS y enruta por server_name
   +-- techtrafo.com / www.techtrafo.com    -->  NAS Web Station :80    (landing pública)
   +-- panel.techtrafo.com                  -->  PC Ubuntu :3002        (frontend Next.js)
   +-- portal.techtrafo.com                 -->  PC Ubuntu :3002 /portal (mismo build)
   +-- api.techtrafo.com                    -->  PC Ubuntu :3000        (backend Express)

NAS Synology DS1821+ 192.168.0.116  (DSM 7.3.2)
   +-- Web Station: techtrafo.com (landing comercial)
   +-- MailPlus Server: SMTP submission 465/587 + DKIM en techtrafo.com (rspamd)
       cuenta operativa: notificaciones@techtrafo.com (alias techtrafonotif)
   +-- DSM admin en :7800 (puerto custom)

PC Ubuntu 192.168.0.23  (Docker Compose stack)
   +-- techtrafo-api          Express + TS + Prisma (puerto 3000) + workers in-process
   +-- techtrafo-web          Next.js 15 + App Router (puerto 3002)
   +-- techtrafo-postgres     PostgreSQL 16.14 (datos del negocio)
   +-- techtrafo-redis        cache, colas y store de rate limit
   +-- techtrafo-grafana      dashboards de KPIs + alerting (puerto 3001)
   +-- techtrafo-influxdb     series temporales SCADA (puerto 8086)
   +-- techtrafo-mosquitto    broker MQTT (puerto 1883)
   +-- techtrafo-simulador    generador de telemetría de prueba
   +-- techtrafo-nginx        proxy local + health check
```

### Stack tecnológico

- **Backend:** Node.js 22 + Express + TypeScript + Prisma (cliente, no motor de migrations) + bcrypt + jsonwebtoken + zod + nodemailer + **mqtt** + **@influxdata/influxdb-client** + **express-rate-limit (Redis store)** + PDFKit
- **Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui + sonner + lucide-react
- **Base de datos:** PostgreSQL 16 con extensión pgcrypto + 5 schemas de dominio
- **Cache/colas:** Redis 7
- **Monitorización:** Grafana OSS sobre PostgreSQL + InfluxDB (provisioning YAML versionado)
- **Email:** Synology MailPlus relay con DKIM/SPF/DMARC en `techtrafo.com`
- **Series temporales:** InfluxDB 2.7 alimentado por bridge MQTT→Influx propio
- **MQTT:** Eclipse Mosquitto 2
- **Storage:** filesystem local en `/uploads` (MinIO provisionado para etapa siguiente)
- **Orquestación:** Docker Compose
- **TLS público:** Let's Encrypt vía certbot --webroot (cert SAN cubre panel + api + portal)

### Modelo de datos

5 schemas en PostgreSQL, ~45 tablas + 7+ vistas:

| Schema | Tablas principales | Qué contiene |
|---|---|---|
| `core` | roles, **usuarios (con `cliente_id` opcional y `token_version`)**, configuracion, auditoria, notificaciones | Auth, audit log, cola de email, revocación JWT |
| `comercial` | clientes, cliente_contactos, cotizaciones, cotizacion_lineas, cotizacion_revisiones, contratos, contrato_pagos, expedientes, expediente_hitos, hito_plantillas, visitas_tecnicas (con `datos_inspeccion JSONB`), informes_tecnicos (con `datos_inspeccion JSONB`), hito_estados_cliente | Pipeline comercial + hoja de ruta + formulario estandarizado de visita |
| `inventario` | categorias_item, ubicaciones, items, lotes, series, stock, movimientos_stock | Bodega con trazabilidad por lote/serie |
| `produccion` | ot, ot_pasos, ot_evidencias, paso_plantillas, transformadores, areas, causas_demora, reprocesos, tiempos_trabajo | OT con pasos y gates + transformadores + áreas/causas/tiempos |
| `posventa` | garantias (con FK opcional a transformadores), reclamos, intervenciones | Garantías + reclamos + dictámenes |

**Vistas críticas:**
- `comercial.v_expediente_pipeline` — calcula `estancado` en runtime comparando `horas_transcurridas` vs `sla_horas`
- `produccion.v_transformador_historial` — todas las OT por equipo con duración real
- `produccion.v_carga_por_area` — pasos en curso / pendientes / completados últimos 30d por área
- `produccion.v_productividad_responsable` — horas + OT + pasos completados por usuario en 30d
- `produccion.v_causas_demora_agregado` — incidencias y días perdidos por causa
- `posventa.v_garantias_por_vencer` — vigentes a ≤ 30 días

**Convenciones**: `created_at`/`updated_at` en inglés; `creado_por`/`actualizado_por` UUID a `core.usuarios`; BIGSERIAL para PKs de negocio (UUID solo en usuarios); naming snake_case plural; soft-delete vía columna `estado`; códigos auto-generados con `SPLIT_PART` (NUNCA `SUBSTRING` con BigInt).

**Auditoría automática**: 2 funciones genéricas (`core.fn_set_updated_at`, `core.fn_auditar`) aplicadas vía triggers en todas las tablas de negocio. El backend setea `app.usuario_id` con `set_config` dentro de cada transacción de write (helper `withAppUser(userId, tx)`) para que el trigger registre quién hizo el cambio.

**Triggers de sincronización** (migration 010): cambios de estado en cotizaciones, contratos y OT actualizan automáticamente los hitos del expediente correspondiente. Cerrar una OT marca completos los hitos de producción y activa "entrega".

## Estructura del repositorio

```
techtrafo/
├── README.md
├── CHANGELOG.md
├── HANDOFF.md                                    # Estado y handoff de sesión
├── .gitignore
├── docs/                                         # Documentación de procesos
│   ├── 00-vision-general/
│   ├── 01-procesos/
│   ├── 02-modulos/
│   ├── 03-decisiones/                            # ADRs
│   └── diagramas/
├── infrastructure/
│   ├── docker/
│   │   └── docker-compose.yml                    # Stack completo (~12 servicios incluido SCADA)
│   ├── nginx/
│   │   ├── sites/                                # vhosts panel/api/portal
│   │   └── block-credential-scans.conf           # snippet anti scan .env/.git/wp-*
│   └── scripts/
├── database/
│   ├── migrations/                               # 001 init -> 016 datos-inspeccion
│   └── seeds/
├── backend/
│   ├── Dockerfile.dev
│   ├── package.json, tsconfig.json
│   ├── prisma/schema.prisma                      # generado por `prisma db pull`
│   └── src/
│       ├── server.ts                             # Express + CSRF + rate-limit + workers
│       ├── config/env.ts                         # zod (SMTP, INFLUX_*, MQTT_*, JWT_*, ...)
│       ├── db/client.ts, db/withAppUser.ts
│       ├── auth/                                 # JWT + bcrypt + permisos + token_version + CSRF
│       ├── routes/
│       │   ├── health.ts, auth.ts, clientes.ts
│       │   ├── cotizaciones.ts, contratos.ts, inventario.ts
│       │   ├── admin.ts                          # usuarios + roles + reset password + hito-plantillas
│       │   ├── expedientes.ts                    # incluye reintentar/reabrir/escalar/cancelar/reactivar
│       │   ├── visitas-tecnicas.ts, informes-tecnicos.ts
│       │   ├── ot.ts, transformadores.ts
│       │   ├── produccion.ts                     # Dashboard ejecutivo
│       │   ├── notificaciones.ts                 # filtra expedientes terminales
│       │   ├── portal.ts                         # Portal cliente
│       │   └── pdf.ts                            # 4 niveles validados por rol
│       ├── services/                             # email.ts (multi-template) + notificaciones.ts
│       ├── workers/
│       │   ├── notificaciones-worker.ts          # cron in-process SMTP
│       │   ├── garantias-worker.ts               # alertas 30d/7d
│       │   └── scada-bridge.ts                   # MQTT -> Influx (toggle por env)
│       ├── scripts/seed-admin.ts
│       └── utils/bigint.ts
└── frontend/
    ├── Dockerfile.dev
    ├── package.json, tsconfig.json
    └── src/
        ├── middleware.ts                         # protección + CSRF cookie
        ├── app/
        │   ├── layout.tsx, page.tsx
        │   ├── login/, register/
        │   ├── portal/                           # Vista pública filtrada por cliente_id
        │   └── (app)/
        │       ├── dashboard/
        │       ├── clientes/, cotizaciones/, contratos/, inventario/
        │       ├── expedientes/[id]              # Pipeline + cronómetros + acciones post-rechazo + reactivar
        │       ├── ot/[id], ot/nueva
        │       ├── transformadores/[id]
        │       ├── produccion/
        │       ├── notificaciones/
        │       ├── perfil/                       # self-service email + password
        │       └── admin/usuarios, admin/roles, admin/hito-plantillas
        ├── components/
        │   ├── ui/                               # shadcn
        │   ├── cronometro.tsx                    # contador horas:minutos en vivo
        │   ├── visita-tecnica-form.tsx           # formulario estandarizado
        │   └── informe-tecnico-dialog.tsx        # ver + PDF + email
        └── lib/                                  # api.ts + helpers de dominio
```

## Cómo ejecutar el stack

Todo va en Docker. Desde la raíz del repo en el PC Ubuntu (192.168.0.23):

```bash
# Levantar todo
docker compose -f infrastructure/docker/docker-compose.yml up -d

# Ver estado
docker compose -f infrastructure/docker/docker-compose.yml ps

# Logs en vivo de un servicio
docker compose -f infrastructure/docker/docker-compose.yml logs -f api

# Aplicar una nueva migration SQL
docker exec -i techtrafo-postgres psql -U techtrafo_admin -d techtrafo \
  < database/migrations/NNN-descripcion.sql

# Regenerar Prisma client tras una migration nueva
docker exec techtrafo-api npx prisma db pull
docker exec techtrafo-api npx prisma generate
docker compose -f infrastructure/docker/docker-compose.yml restart api
```

### Variables de entorno relevantes

El archivo real vive en `/opt/techtrafo/.env` (symlink desde `infrastructure/docker/.env`). En git solo está `.env.example`.

Bloques principales:
- **PostgreSQL**, **Redis**, **Grafana** (credenciales internas)
- **Auth**: `JWT_SECRET` (mínimo 32 caracteres), `JWT_EXPIRES_IN=8h`, `BCRYPT_ROUNDS=12`
- **CORS**: `CORS_ORIGINS=https://panel.techtrafo.com,https://portal.techtrafo.com`
- **SMTP**: `SMTP_HOST=192.168.0.116`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER=techtrafonotif`, `SMTP_PASS=***`, `SMTP_FROM="TECHTRAFO Notificaciones <notificaciones@techtrafo.com>"`, `SMTP_SKIP_TLS_VERIFY=true` (solo LAN)
- **SCADA**: `SCADA_BRIDGE_ENABLED=true`, `MQTT_URL=mqtt://mosquitto:1883`, `MQTT_TOPIC_PREFIX=techtrafo/transformador`, `INFLUX_URL=http://influxdb:8086`, `INFLUX_TOKEN=***`, `INFLUX_ORG=techtrafo`, `INFLUX_BUCKET=scada`
- **Panel/Portal**: `PANEL_URL=https://panel.techtrafo.com`, `PORTAL_URL=https://portal.techtrafo.com`, `NOTIF_WORKER_INTERVAL_SECONDS=300`, `GARANTIAS_WORKER_INTERVAL_SECONDS=86400`
- **Uploads**: `UPLOAD_DIR=/uploads`

## API endpoints actuales (v0.12.0)

### Public
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Status del API y conexión a DB/Redis |
| POST | `/api/auth/register` | Registro público (queda pendiente de aprobación, rate-limited) |
| POST | `/api/auth/login` | Login → cookie HttpOnly + CSRF cookie (`Domain=.techtrafo.com`, rate-limited) |
| POST | `/api/auth/logout` | Limpia cookie + incrementa `token_version` para invalidar otros devices |

### Autenticado
| Recurso | Ruta base | Endpoints clave |
|---|---|---|
| Usuario actual | `/api/auth/me` | GET / PATCH (self-service email) |
| Cambio password | `/api/auth/change-password` | POST (rate-limited) |
| Clientes | `/api/clientes` | GET (paginado/filtros), GET `:id`, POST, PATCH, DELETE (soft) — todos con `requirePermission` |
| Cotizaciones | `/api/cotizaciones` | CRUD + transiciones + revisiones |
| Contratos | `/api/contratos` | CRUD + plan de pagos |
| Inventario | `/api/inventario` | Catálogo + stock + movimientos |
| Expedientes | `/api/expedientes` | CRUD + `/:id/hitos/:hitoId/{iniciar,aprobar,rechazar,reintentar,reabrir-anterior,escalar}` + PATCH SLA + `/:id/{cancelar,reactivar}` + `/dashboard/resumen` |
| Visitas técnicas | `/api/visitas-tecnicas` | CRUD + persistencia de `datos_inspeccion JSONB` |
| Informes técnicos | `/api/informes-tecnicos` | CRUD + auto-numeración INF-YYYY-NNNN + descargar PDF + enviar por email |
| OT | `/api/ot` | CRUD + transiciones + pasos + Gantt + evidencias + dashboard |
| Transformadores | `/api/transformadores` | CRUD + `/cliente/:id` + historial agregado |
| Producción | `/api/produccion/{dashboard,areas,causas-demora,tiempos,reprocesos}` | KPIs + catálogos editables |
| Garantías | `/api/garantias` | CRUD + reclamos + intervenciones + dashboard |
| Notificaciones | `/api/notificaciones` | Bandeja + resumen (filtra expedientes terminales) |
| Portal cliente | `/api/portal/{mis-expedientes,expediente/:id,mis-transformadores,resumen}` | Filtrado por `cliente_id` del usuario |
| PDFs | `/api/pdf/{cotizacion,contrato,ot,informe-tecnico}/:id?nivel=N` | 4 niveles validados por rol |
| Auditoría | `/api/auditoria/{ot,expediente}/:id` | Historial completo |
| Admin | `/api/admin/{usuarios,roles,permisos/catalogo,hito-plantillas}` | Gestión + reset password + plantillas editables + guards anti self-escalation |

## Estado del proyecto

### FASE 1 — Procesos (COMPLETADA — v0.1.0)
- Arquitectura técnica definida (ADRs)
- Flujo comercial validado (17 pasos en 6 etapas)
- Flujo de producción real (28 pasos, 5 gates)
- Centro de configuración parametrizable

### FASE 2 — Infraestructura base (COMPLETADA — v0.2.0)
- Docker stack operativo + PostgreSQL 16 + 12 roles base + Grafana

### FASE 3 — Stack vertical (COMPLETADA — v0.3.0)
- Modelado de negocio + backend Express/TS/Prisma + auth JWT cookie + CRUD clientes + frontend Next.js + reverse proxy con SSL

### FASE 4 — Módulos de operación (COMPLETADA — v0.5.0)
- Cotizaciones, contratos, inventario, OT con pipelines + gates, PDFs 4 niveles, garantías + reclamos, expedientes con hitos, visitas e informes técnicos, notificaciones email, dashboards A/B/C/D/E (producción, transformadores, áreas/causas, portal cliente, Gantt + evidencias + auditoría)

### FASE 5 — Portal cliente externo (COMPLETADA — v0.6.0)
- DNS `portal.techtrafo.com` en GoDaddy + cert SAN en VM nginx
- Reverse proxy independiente sirviendo `/portal` del mismo build Next.js

### FASE 6 — Dashboards Grafana (COMPLETADA — v0.7.0)
- 4 dashboards iniciales versionados en `infrastructure/docker/grafana/dashboards/`:
  - `01-comercial.json` — pipeline, conversiones, ticket promedio
  - `02-planta.json` — carga por área, pasos atrasados, productividad
  - `03-financiero.json` — facturación proyectada, cobranza, pagos
  - `04-garantias.json` — vigentes, por vencer, reclamos abiertos

### Hardening nginx (v0.7.0)
- Snippet `block-credential-scans.conf` aplicado a panel/api/portal: 444 inmediato a `.env / .git / service-account.json / wp-*` antes de proxypass

### FASE 7 — SCADA (COMPLETADA — v0.8.0)
- InfluxDB 2.7 + Mosquitto añadidos al compose
- Bridge MQTT → Influx (`workers/scada-bridge.ts`) con toggle por env
- Simulador integrado que publica V/I/aceite/temp por transformador
- Dashboard Grafana `05-scada.json` con paneles tiempo real por equipo

### FASE 8 — Grafana alerting (COMPLETADA — v0.9.0)
- Provisioning YAML versionado: `alerting/contact-points.yaml`, `alerting/policies.yaml`, `alerting/rules/*.yaml`
- 5+ reglas:
  - Estancamiento de hitos críticos > SLA
  - Garantías vigentes con vencimiento ≤ 30/7d
  - OT con pasos atrasados vs plan
  - SCADA: temperatura aceite > umbral
  - SCADA: corriente fuera de rango sostenida
- Notificación SMTP con plantilla custom y links profundos al panel

### Admin + self-service (v0.10.0)
- CRUD completo de usuarios (alta, baja, edición, reset password)
- Edición de email desde admin y desde `/perfil`
- CRUD de plantillas maestras de hitos
- Guards anti self-escalation: un admin no puede modificar su propio `rol_id`/`activo`, ni asignar permisos que él mismo no tiene
- Edición de SLA por plantilla y per-hito desde el panel

### UX expedientes (v0.10.1 → v0.11.0)
- Cronómetros en vivo por hito (horas:minutos) en hojas de ruta
- Formulario estandarizado de visita técnica → genera informe técnico
- Informe técnico: visualizar, descargar PDF, enviar por email al cliente
- 4 acciones post-rechazo: reintentar / reabrir hito anterior / escalar a otro rol / cancelar expediente
- Email de escalación con destinatarios resueltos por rol_destino
- Cancelar expediente con `estado='cancelado'` (corregido bug que usaba `'cerrado'` inválido)
- Reactivar expediente desde estado terminal para Presidencia / Gerencia General / Gerencia Comercial

### Seguridad — auditoría OWASP cerrada (v0.11.0)
- **C1 IDOR**: `requirePermission` añadido a 39 endpoints (clientes, cotizaciones, contratos, inventario, expedientes)
- **C2 self-escalation**: guards en admin para evitar promoción propia y elevación vía permisos
- **CSRF**: double-submit cookie (`csrf_token` HttpOnly=false + header `x-csrf-token`)
- **Rate limit**: login / register / change-password con Redis store
- **JWT revocación**: `core.usuarios.token_version` se compara en middleware; logout incrementa, invalidando todos los tokens emitidos antes
- **Error handler seguro**: no expone `err.message` en producción
- **Morgan sanitizado**: no loguea cookies ni headers `authorization`

### Email a `techtrafo.com` (v0.12.0)
- Migración de `notificaciones@medicvip.org` a `notificaciones@techtrafo.com`
- DKIM via rspamd en Synology MailPlus (signed pass en Gmail/Outlook)
- SPF + DMARC `p=quarantine` en zona DNS
- Cuentas `techtrafonotif` + `pbaquerizo` en MailPlus
- Aliases en `login_map` para compatibilidad con el cliente SMTP

### Notificaciones de expedientes terminales (v0.12.0)
- `/api/notificaciones` y `/api/notificaciones/resumen` filtran con `NOT EXISTS` contra expedientes en estado `cancelado/ganado/perdido`
- Las notificaciones siguen en DB para auditoría pero no aparecen en la UI

### Roadmap próximo
- Object storage MinIO para evidencias y PDFs (hoy filesystem)
- Más reglas de alerta SCADA (presión, vibración) cuando lleguen sensores físicos
- Importación masiva de transformadores existentes desde Excel
- App móvil PWA para ingenieros de campo (offline-first para hallazgos)

## Backups

Backups en `/home/techtrafo/backups/` con timestamp:
```bash
# Crear backup manual
ssh techtrafo@192.168.0.23 'cd /home/techtrafo/backups \
  && STAMP=$(date +%Y%m%d-%H%M%S) \
  && docker exec techtrafo-postgres pg_dump -U techtrafo_admin --clean --if-exists --no-owner techtrafo \
     | gzip > techtrafo-db-${STAMP}.sql.gz \
  && cp /opt/techtrafo/.env techtrafo-env-${STAMP}.env \
  && chmod 600 techtrafo-env-${STAMP}.env'

# Restaurar
gunzip -c techtrafo-db-YYYYMMDD-HHMMSS.sql.gz \
  | docker exec -i techtrafo-postgres psql -U techtrafo_admin -d techtrafo
```

## Contacto

Propietario: Pablo Baquerizo Davila
Empresa: TECHTRAFO — Samborondón, Ecuador
