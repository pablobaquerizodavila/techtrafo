# TECHTRAFO — Sistema Integral de Gestion

> Plataforma de gestion empresarial para TECHTRAFO, empresa dedicada a la reparacion, mantenimiento, ensamblaje y fabricacion de transformadores electricos de 500 kVA hasta 3 MVA.

![Estado](https://img.shields.io/badge/estado-fase%203%20completada-green)
![Version](https://img.shields.io/badge/version-0.3.0-blue)
![Licencia](https://img.shields.io/badge/licencia-privada-red)

**URLs publicas:**
- [https://panel.techtrafo.com](https://panel.techtrafo.com) — panel administrativo
- [https://api.techtrafo.com](https://api.techtrafo.com) — backend REST

---

## Que es este proyecto

Sistema digital integral que orquesta toda la operacion de TECHTRAFO desde el primer contacto comercial hasta la entrega final del transformador y su posventa.

Cubre:
- **Comercial** — captacion, cotizacion, contrato, facturacion
- **Produccion tecnica** — flujo real de planta con 28 pasos y 5 gates de calidad
- **Bodega automatizada** — stock de materia prima con reorden inteligente, lotes y series
- **Caja flexible** — planes de pago configurables por contrato (anticipos, hitos, saldo)
- **Garantias y posventa** — trazabilidad por serie hasta 3 anos, reclamos e intervenciones
- **KPIs en tiempo real** — dashboards Grafana sobre PostgreSQL

## Arquitectura

Sistema distribuido en tres hosts dentro de la LAN, expuesto a internet via una VM nginx que termina TLS.

```
Internet (186.101.238.135)
   |
   v  router NAT 80/443
VM nginx 192.168.0.7  (Ubuntu 22.04 + Let's Encrypt)
   |   termina TLS y enruta por server_name
   +-- techtrafo.com / www.techtrafo.com  -->  NAS Web Station :80 (landing publica)
   +-- panel.techtrafo.com                -->  PC Ubuntu :3002  (frontend Next.js)
   +-- api.techtrafo.com                  -->  PC Ubuntu :3000  (backend Express)

NAS Synology DS1821+ 192.168.0.116  (DSM 7.3.2)
   +-- Web Station: techtrafo.com (landing comercial, React/JSX)
   +-- DSM admin en :7800 (puerto custom)

PC Ubuntu 192.168.0.23  (Docker Compose stack)
   +-- techtrafo-api      Express + TS + Prisma (puerto 3000)
   +-- techtrafo-web      Next.js 15 + App Router (puerto 3002)
   +-- techtrafo-postgres PostgreSQL 16.14 (datos del negocio)
   +-- techtrafo-redis    cache y colas
   +-- techtrafo-grafana  dashboards de KPIs (puerto 3001)
   +-- techtrafo-nginx    proxy local + health check
```

### Stack tecnologico

- **Backend:** Node.js 22 + Express + TypeScript + Prisma (cliente, no motor de migrations) + bcrypt + jsonwebtoken + zod
- **Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui + sonner
- **Base de datos:** PostgreSQL 16 con extension pgcrypto + 5 schemas de dominio
- **Cache/colas:** Redis 7
- **Monitorizacion:** Grafana OSS sobre PostgreSQL
- **Storage:** MinIO (provisionado para archivos en FASE futura)
- **Series temporales:** InfluxDB (provisionado para SCADA futuro)
- **Orquestacion:** Docker Compose
- **TLS publico:** Let's Encrypt via certbot --webroot (auto-renew)

### Modelo de datos

5 schemas en PostgreSQL, ~22 tablas + 1 vista:

| Schema | Tablas | Que contiene |
|---|---|---|
| `core` | roles, usuarios, configuracion, auditoria | Sistema, autenticacion, audit log |
| `comercial` | clientes, cliente_contactos, cotizaciones, cotizacion_lineas, cotizacion_revisiones, contratos, contrato_pagos | Pipeline comercial completo |
| `inventario` | categorias_item, ubicaciones, items, lotes, series, stock, movimientos_stock | Bodega con trazabilidad por lote/serie |
| `produccion` | ot, ot_pasos, ot_evidencias, vista v_ot_consumos | OT con 28 pasos + 5 gates de QC |
| `posventa` | garantias, reclamos, intervenciones | Garantias hasta 3 anos |

**Convenciones**: `created_at`/`updated_at` en ingles; `creado_por`/`actualizado_por` UUID a `core.usuarios`; BIGSERIAL para PKs de negocio (UUID solo en usuarios); naming snake_case plural; soft-delete via columna `estado`.

**Auditoria automatica**: 2 funciones genericas (`core.fn_set_updated_at`, `core.fn_auditar`) aplicadas via triggers en todas las tablas de negocio. El backend setea `app.usuario_id` con `set_config` dentro de cada transaccion de write para que el trigger registre quien hizo el cambio.

## Estructura del repositorio

```
techtrafo/
├── README.md
├── CHANGELOG.md
├── .gitignore
├── docs/                       # Documentacion de procesos (FASE 1)
│   ├── 00-vision-general/
│   ├── 01-procesos/
│   ├── 02-modulos/
│   ├── 03-decisiones/          # ADRs
│   └── diagramas/
├── infrastructure/             # Infra y orquestacion (FASE 2)
│   ├── docker/
│   │   └── docker-compose.yml  # Stack completo (postgres, redis, grafana, nginx, api, web)
│   ├── nginx/
│   └── scripts/
├── database/                   # SQL puro (NO Prisma migrations)
│   ├── migrations/             # 001-init + 002-007 modelado del negocio
│   └── seeds/
├── backend/                    # API REST Node.js + Express + TS + Prisma
│   ├── Dockerfile.dev
│   ├── package.json, tsconfig.json
│   ├── prisma/schema.prisma    # Generado por `prisma db pull` (NO editar a mano)
│   └── src/
│       ├── server.ts           # Entrypoint Express
│       ├── config/env.ts       # Validacion de env vars con zod
│       ├── db/client.ts        # Prisma client singleton
│       ├── db/withAppUser.ts   # Transaccion + set_config para auditoria
│       ├── auth/               # JWT + bcrypt + middleware
│       ├── routes/             # health, auth, clientes
│       ├── scripts/seed-admin.ts
│       └── utils/bigint.ts     # Shim BigInt -> JSON
└── frontend/                   # Panel Next.js + Tailwind + shadcn/ui
    ├── Dockerfile.dev
    ├── package.json, tsconfig.json
    ├── tailwind.config.ts, components.json
    └── src/
        ├── app/                # App Router
        │   ├── layout.tsx, page.tsx
        │   ├── login/
        │   └── (app)/          # Layout autenticado con sidebar
        │       ├── dashboard/
        │       └── clientes/
        ├── components/ui/      # Componentes shadcn
        ├── lib/                # api.ts, auth.ts, clientes.ts, utils.ts
        └── middleware.ts       # Proteccion de rutas autenticadas
```

## Como ejecutar el stack

Todo va en Docker. Desde la raiz del repo en el PC Ubuntu (192.168.0.23):

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
docker compose -f infrastructure/docker/docker-compose.yml build api
docker compose -f infrastructure/docker/docker-compose.yml up -d --force-recreate api
```

## API endpoints actuales (v0.3.0)

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| GET | `/api/health` | publico | Status del API y conexion a DB |
| POST | `/api/auth/login` | publico | Login con `{email, password}` -> cookie HttpOnly |
| POST | `/api/auth/logout` | publico | Limpia cookie |
| GET | `/api/auth/me` | si | Devuelve el usuario actual |
| GET | `/api/clientes` | si | Lista paginada con filtros `q/estado/segmento/sector` |
| GET | `/api/clientes/:id` | si | Detalle con contactos |
| POST | `/api/clientes` | si | Crear (zod, 409 si RUC duplicado) |
| PATCH | `/api/clientes/:id` | si | Actualizar parcial |
| DELETE | `/api/clientes/:id` | si | Soft delete (estado=archivado) -> 204 |

## Estado del proyecto

### FASE 1 — Procesos (COMPLETADA — v0.1.0)
- Arquitectura tecnica definida (ADRs en `docs/03-decisiones/`)
- Flujo comercial validado (17 pasos en 6 etapas)
- Flujo de produccion real (28 pasos, 5 gates)
- Modulos: caja flexible, bodega automatizada, cotizador
- Centro de configuracion parametrizable

### FASE 2 — Infraestructura base (COMPLETADA — v0.2.0)
- Docker stack operativo (postgres, redis, grafana, nginx)
- PostgreSQL 16.14 con schema core
- 12 roles base + 17 parametros de configuracion
- Grafana conectado a PostgreSQL

### FASE 3 — Desarrollo del stack vertical (COMPLETADA — v0.3.0)
- **3.1** Modelado completo de la BD del negocio (6 migrations: clientes, bodega, cotizaciones, contratos, OT, garantias)
- **3.2** Backend scaffolding (Express + TS + Prisma dockerizado)
- **3.3** Autenticacion (JWT en cookie HttpOnly + bcrypt + middleware por rol)
- **3.4** CRUD completo de clientes con auditoria automatica
- **3.5** Frontend scaffolding (Next.js 15 App Router + Tailwind + shadcn/ui)
- **3.6** Vista de clientes (tabla, filtros, modal CRUD, toasts)
- **3.7** Reverse proxy + DNS + SSL en `panel.techtrafo.com` y `api.techtrafo.com`

### Proximos pasos (FASE 4 planeada)
- CRUD del resto de modulos: cotizaciones, contratos, OT, garantias, bodega
- Generacion de PDFs (cotizaciones, contratos, certificados)
- Dashboards Grafana con KPIs de negocio
- Modulo de archivos en MinIO (fotos OT, certificados de ensayo)
- Notificaciones email para garantias proximas a vencer

## Contacto

Propietario: Pablo Baquerizo Davila
Empresa: TECHTRAFO — Samborondon, Ecuador
