# TECHTRAFO — Sistema Integral de Gestión

> Plataforma de gestión empresarial para TECHTRAFO, empresa dedicada a la reparación, mantenimiento, ensamblaje y fabricación de transformadores eléctricos de 150 kVA hasta 10 MVA en Samborondón, Ecuador.

![Estado](https://img.shields.io/badge/estado-FASE%204%20completa-success)
![Versión](https://img.shields.io/badge/versión-0.5.0-blue)
![Licencia](https://img.shields.io/badge/licencia-privada-red)

**URLs públicas:**
- [https://panel.techtrafo.com](https://panel.techtrafo.com) — panel administrativo (Next.js)
- [https://api.techtrafo.com](https://api.techtrafo.com) — backend REST (Express)
- [https://techtrafo.com](https://techtrafo.com) — landing comercial (NAS Web Station)

---

## Qué es este proyecto

Sistema digital integral que orquesta toda la operación de TECHTRAFO desde el primer contacto comercial hasta la entrega final del transformador y su posventa.

**Cubre hoy:**
- **Comercial** — clientes, cotizaciones con revisiones, contratos con plan de pagos
- **Expedientes** — hoja de ruta del pedido del cliente con 15 hitos auditables y gates de aprobación
- **Producción** — Órdenes de Trabajo (OT) con pipelines de pasos por tipo de ruta (9 / 11 / 6 pasos para reparación / fabricación / mantenimiento) y gates de QA, **Gantt visual** plan vs real, **evidencias** (fotos / PDFs) por paso y **trazabilidad** completa de cambios
- **Catálogo de transformadores** — equipos del cliente con características técnicas completas (capacidad, tipo, tensiones, conexión, dimensiones) e historial trazable por intervención
- **Áreas, causas de demora, reprocesos, tiempos-hombre** — productividad real por área y por responsable
- **Bodega** — categorías, ítems, ubicaciones, stock con lotes y series, kárdex
- **Notificaciones email** — alertas SMTP automáticas para estancamientos, gates esperando aprobación y resoluciones (relay vía Synology MailPlus con DKIM)
- **Dashboard ejecutivo de producción** — KPIs, semáforo de fases, matriz comparativa OT + expedientes, alertas activas, capacidad por área, causas de demora, productividad
- **Generación de PDFs** — cotización / contrato / OT / informe técnico con **4 niveles de detalle visible** (N1 cliente resumen, N2 cliente detallado, N3 interno comercial con márgenes, N4 interno completo con auditoría) y validación server-side por rol
- **Portal cliente** — vista limpia en `/portal` con timeline simplificado, mapping interno→externo, KPIs propios sin info sensible
- **Garantías + reclamos + intervenciones** — CRUD completo con auto-creación al completar OT, alertas por vencer 30d, gestión de reclamos y dictámenes
- **Roles y permisos granulares** — `modulo.accion` configurables desde UI + super_admin bypass

**Provisionado para fases siguientes:**
- FASE 5 — Portal cliente en subdomain propio `portal.techtrafo.com`
- FASE 6 — Dashboards Grafana sobre PostgreSQL
- Series temporales SCADA en InfluxDB
- Object storage para archivos en MinIO (hoy filesystem local en `/uploads`)

## Arquitectura

Sistema distribuido en tres hosts dentro de la LAN, expuesto a internet via una VM nginx que termina TLS.

```
Internet (186.101.238.135)
   |
   v  router NAT 80/443
VM nginx 192.168.0.7  (Ubuntu 22.04 + Let's Encrypt)
   |   termina TLS y enruta por server_name
   +-- techtrafo.com / www.techtrafo.com  -->  NAS Web Station :80  (landing pública)
   +-- panel.techtrafo.com                -->  PC Ubuntu :3002      (frontend Next.js)
   +-- api.techtrafo.com                  -->  PC Ubuntu :3000      (backend Express)

NAS Synology DS1821+ 192.168.0.116  (DSM 7.3.2)
   +-- Web Station: techtrafo.com (landing comercial)
   +-- MailPlus Server: SMTP submission 465/587 + DKIM en eneural.org/medicvip.org/siscormed.com
   +-- DSM admin en :7800 (puerto custom)

PC Ubuntu 192.168.0.23  (Docker Compose stack)
   +-- techtrafo-api      Express + TS + Prisma (puerto 3000) + worker de notificaciones
   +-- techtrafo-web      Next.js 15 + App Router (puerto 3002)
   +-- techtrafo-postgres PostgreSQL 16.14 (datos del negocio)
   +-- techtrafo-redis    cache y colas
   +-- techtrafo-grafana  dashboards de KPIs (puerto 3001)
   +-- techtrafo-nginx    proxy local + health check
```

### Stack tecnológico

- **Backend:** Node.js 22 + Express + TypeScript + Prisma (cliente, no motor de migrations) + bcrypt + jsonwebtoken + zod + nodemailer
- **Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui + sonner + lucide-react
- **Base de datos:** PostgreSQL 16 con extensión pgcrypto + 5 schemas de dominio
- **Cache/colas:** Redis 7
- **Monitorización:** Grafana OSS sobre PostgreSQL
- **Email:** Synology MailPlus relay con DKIM/SPF/DMARC
- **Storage:** MinIO (provisionado, sin uso)
- **Series temporales:** InfluxDB (provisionado, sin uso)
- **Orquestación:** Docker Compose
- **TLS público:** Let's Encrypt vía certbot --webroot (auto-renew)

### Modelo de datos

5 schemas en PostgreSQL, ~40 tablas + 7 vistas (al cierre FASE 4):

| Schema | Tablas principales | Qué contiene |
|---|---|---|
| `core` | roles, **usuarios (con `cliente_id` opcional)**, configuracion, auditoria, notificaciones | Auth, audit log, cola de email |
| `comercial` | clientes, cliente_contactos, cotizaciones, cotizacion_lineas, cotizacion_revisiones, contratos, contrato_pagos, expedientes, expediente_hitos, hito_plantillas, visitas_tecnicas, informes_tecnicos, **hito_estados_cliente** | Pipeline comercial + hoja de ruta + mapping para portal cliente |
| `inventario` | categorias_item, ubicaciones, items, lotes, series, stock, movimientos_stock | Bodega con trazabilidad por lote/serie |
| `produccion` | ot, ot_pasos, ot_evidencias, paso_plantillas, transformadores, **areas, causas_demora, reprocesos, tiempos_trabajo** | OT con pasos y gates + transformadores + áreas/causas/tiempos |
| `posventa` | garantias (con FK opcional a transformadores), reclamos, intervenciones | Garantías + reclamos + dictámenes |

**Vistas críticas:**
- `comercial.v_expediente_pipeline` — calcula `estancado` en runtime comparando `horas_transcurridas` vs `sla_horas`
- `produccion.v_transformador_historial` — todas las OT por equipo con duración real
- `produccion.v_carga_por_area` — pasos en curso / pendientes / completados últimos 30d por área
- `produccion.v_productividad_responsable` — horas + OT + pasos completados por usuario en 30d
- `produccion.v_causas_demora_agregado` — incidencias y días perdidos por causa
- `posventa.v_garantias_por_vencer` — vigentes a ≤ 30 días

**Convenciones**: `created_at`/`updated_at` en inglés; `creado_por`/`actualizado_por` UUID a `core.usuarios`; BIGSERIAL para PKs de negocio (UUID solo en usuarios); naming snake_case plural; soft-delete vía columna `estado`.

**Auditoría automática**: 2 funciones genéricas (`core.fn_set_updated_at`, `core.fn_auditar`) aplicadas vía triggers en todas las tablas de negocio. El backend setea `app.usuario_id` con `set_config` dentro de cada transacción de write para que el trigger registre quién hizo el cambio.

**Triggers de sincronización** (migration 010): cambios de estado en cotizaciones, contratos y OT actualizan automáticamente los hitos del expediente correspondiente. Cerrar una OT marca completos los hitos de producción y activa "entrega".

## Estructura del repositorio

```
techtrafo/
├── README.md
├── CHANGELOG.md
├── .gitignore
├── docs/                                       # Documentación de procesos (FASE 1)
│   ├── 00-vision-general/
│   ├── 01-procesos/
│   ├── 02-modulos/
│   ├── 03-decisiones/                          # ADRs
│   └── diagramas/
├── infrastructure/                             # Infra y orquestación (FASE 2)
│   ├── docker/
│   │   └── docker-compose.yml                  # Stack completo (12 servicios)
│   ├── nginx/
│   └── scripts/
├── database/                                   # SQL puro (NO Prisma migrations)
│   ├── migrations/                             # 001 init -> 012 transformadores
│   └── seeds/
├── backend/                                    # API REST Node.js + Express + TS + Prisma
│   ├── Dockerfile.dev
│   ├── package.json, tsconfig.json
│   ├── prisma/schema.prisma                    # Generado por `prisma db pull` (NO editar a mano)
│   └── src/
│       ├── server.ts                           # Entrypoint Express + worker init
│       ├── config/env.ts                       # Validación env vars con zod (incluye SMTP)
│       ├── db/client.ts, db/withAppUser.ts     # Prisma client + helper de auditoría
│       ├── auth/                               # JWT + bcrypt + middleware con permisos
│       ├── routes/                             # 12 routers
│       │   ├── health.ts, auth.ts, clientes.ts
│       │   ├── cotizaciones.ts, contratos.ts, inventario.ts, admin.ts
│       │   ├── expedientes.ts, visitas-tecnicas.ts, informes-tecnicos.ts
│       │   ├── ot.ts, transformadores.ts
│       │   ├── produccion.ts                   # Dashboard ejecutivo agregado
│       │   └── notificaciones.ts               # Bandeja del usuario
│       ├── services/                           # email.ts + notificaciones.ts
│       ├── workers/                            # notificaciones-worker.ts (in-process cron)
│       ├── scripts/seed-admin.ts
│       └── utils/bigint.ts                     # Shim BigInt -> JSON
└── frontend/                                   # Panel Next.js + Tailwind + shadcn/ui
    ├── Dockerfile.dev
    ├── package.json, tsconfig.json
    ├── tailwind.config.ts, components.json
    └── src/
        ├── middleware.ts                       # Protección de rutas autenticadas
        ├── app/                                # App Router
        │   ├── layout.tsx, page.tsx
        │   ├── login/, register/
        │   └── (app)/                          # Layout autenticado con sidebar dinámico
        │       ├── dashboard/                  # Bienvenida + accesos rápidos por permiso
        │       ├── clientes/, cotizaciones/, contratos/, inventario/
        │       ├── expedientes/[id]            # Pipeline gráfico de hitos
        │       ├── ot/[id], ot/nueva           # Pipeline de pasos con gates
        │       ├── transformadores/[id]        # Ficha + historial de intervenciones
        │       ├── produccion/                 # Dashboard ejecutivo de planta
        │       ├── notificaciones/             # Bandeja con badge en sidebar
        │       └── admin/usuarios, admin/roles # Gestión de usuarios y permisos
        ├── components/ui/                      # Componentes shadcn
        └── lib/                                # api.ts + 9 helpers de dominio
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
- **Auth**: `JWT_SECRET` (mínimo 32 caracteres), `JWT_EXPIRES_IN=8h`
- **CORS**: `CORS_ORIGINS=https://panel.techtrafo.com,...`
- **SMTP** (4.D): `SMTP_HOST=192.168.0.116`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER=notificaciones`, `SMTP_PASS=***`, `SMTP_FROM="TECHTRAFO Notificaciones <notificaciones@medicvip.org>"`
- **Panel**: `PANEL_URL=https://panel.techtrafo.com`, `NOTIF_WORKER_INTERVAL_SECONDS=300`

## API endpoints actuales (v0.5.0)

### Public
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Status del API y conexión a DB |
| POST | `/api/auth/register` | Registro público (queda pendiente de aprobación) |
| POST | `/api/auth/login` | Login → cookie HttpOnly con `Domain=.techtrafo.com` |
| POST | `/api/auth/logout` | Limpia cookie |

### Autenticado
| Recurso | Ruta base | Endpoints |
|---|---|---|
| Usuario actual | `/api/auth/me` | GET |
| Clientes | `/api/clientes` | GET (paginado/filtros), GET `:id`, POST, PATCH, DELETE (soft) |
| Cotizaciones | `/api/cotizaciones` | CRUD + transiciones de estado + revisiones |
| Contratos | `/api/contratos` | CRUD + plan de pagos |
| Inventario | `/api/inventario` | Catálogo + stock + movimientos |
| Expedientes | `/api/expedientes` | CRUD + `/:id/hitos/:hitoId/{iniciar,aprobar,rechazar}` + `/dashboard/resumen` |
| Visitas técnicas | `/api/visitas-tecnicas` | CRUD |
| Informes técnicos | `/api/informes-tecnicos` | CRUD con auto-numeración INF-YYYY-NNNN |
| OT | `/api/ot` | CRUD + transiciones + `/:id/pasos/:pasoId/{iniciar,completar,rechazar,saltar}` + `/:id/gantt` + `/:id/evidencias` (POST/GET/DELETE) + `/dashboard/resumen` |
| Transformadores | `/api/transformadores` | CRUD + `/cliente/:id` + historial agregado |
| Producción (dashboard) | `/api/produccion/dashboard` | KPIs + semáforo + matriz + alertas + rankings + capacidad/causas/productividad reales |
| Producción (catálogos) | `/api/produccion/{areas,causas-demora,tiempos,reprocesos}` | CRUD de áreas, causas, registro de horas-hombre y reprocesos |
| Garantías | `/api/garantias` | CRUD + `/:id/reclamos[/:rId/intervenciones]` + `/dashboard/resumen` |
| Notificaciones | `/api/notificaciones` | Bandeja del usuario + `/resumen` |
| Portal cliente | `/api/portal/{mis-expedientes,expediente/:id,mis-transformadores,resumen}` | Filtrado por cliente_id del usuario, sin info sensible |
| PDFs | `/api/pdf/{cotizacion,contrato,ot,informe-tecnico}/:id?nivel=N` | 4 niveles validados server-side por rol |
| Auditoría | `/api/auditoria/{ot,expediente}/:id` | Historial completo de cambios |
| Admin | `/api/admin/{usuarios,roles,permisos/catalogo}` | Gestión usuarios + roles + catálogo de permisos |

## Estado del proyecto

### FASE 1 — Procesos (COMPLETADA — v0.1.0)
- Arquitectura técnica definida (ADRs en `docs/03-decisiones/`)
- Flujo comercial validado (17 pasos en 6 etapas)
- Flujo de producción real (28 pasos, 5 gates)
- Módulos: caja flexible, bodega automatizada, cotizador
- Centro de configuración parametrizable

### FASE 2 — Infraestructura base (COMPLETADA — v0.2.0)
- Docker stack operativo (postgres, redis, grafana, nginx)
- PostgreSQL 16.14 con schema core
- 12 roles base + 17 parámetros de configuración
- Grafana conectado a PostgreSQL

### FASE 3 — Desarrollo del stack vertical (COMPLETADA — v0.3.0)
- **3.1** Modelado completo del negocio (6 migrations: clientes, bodega, cotizaciones, contratos, OT, garantías)
- **3.2** Backend scaffolding (Express + TS + Prisma dockerizado)
- **3.3** Autenticación (JWT en cookie HttpOnly + bcrypt + middleware por rol)
- **3.4** CRUD completo de clientes con auditoría automática
- **3.5** Frontend scaffolding (Next.js 15 App Router + Tailwind + shadcn/ui)
- **3.6** Vista de clientes (tabla, filtros, modal CRUD, toasts)
- **3.7** Reverse proxy + DNS + SSL en `panel.techtrafo.com` y `api.techtrafo.com`

### FASE 4 — Módulos de operación (COMPLETADA — v0.5.0)
- **4.1** API y vista de cotizaciones con revisiones y transiciones de estado ✅
- **4.3** API y vista de inventario (catálogo + stock + movimientos) ✅
- **4.4** API y vista de contratos con plan de pagos ✅
- **4.5** API y vista de OT con pipeline de pasos y gates ✅
- **4.6** Generación de PDFs con 4 niveles de detalle (PDFKit) validados server-side por rol ✅
- **4.7** Garantías + reclamos + intervenciones con auto-creación al completar OT, alertas por vencer 30d ✅
- **4.8** Roles super_admin + estado_aprobacion + CRUD admin (usuarios, roles) ✅
- **4.A** Migration 010: expedientes + hitos + visitas + informes técnicos ✅
- **4.B** API completa de expedientes / visitas / informes ✅
- **4.C** UI tablero de expedientes (pipeline gráfico + aprobaciones inline) ✅
- **4.D** Notificaciones email vía Synology MailPlus con worker in-process ✅
- **Dashboard A** — Dashboard ejecutivo de producción `/produccion` ✅
- **Dashboard B** — Migration 012 transformadores + UI + integración con OT ✅
- **Dashboard C** — Migration 013 áreas + causas_demora + reprocesos + tiempos_trabajo ✅
- **Dashboard D** — Rol auditor + vista cliente `/portal` con mapping estados internos→externos ✅
- **Dashboard E** — Gantt SVG + evidencias UI (fotos / PDFs) + trazabilidad de auditoría ✅

### FASE 5 — Portal cliente externo (PENDIENTE)
- Subdomain `portal.techtrafo.com` con DNS + reverse proxy propios
- (La vista `/portal` ya funciona en `panel.techtrafo.com` desde FASE 4 — Dashboard D)

### FASE 6 — Dashboards Grafana (PENDIENTE)
- KPIs financieros y de planta sobre PostgreSQL
- Series temporales en InfluxDB para SCADA

## Backups

Backups automáticos en `/home/techtrafo/backups/` con timestamp:
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
