# TECHTRAFO — Handoff entre sesiones de Claude

> Documento para que una nueva sesión de Claude arranque sin perder contexto sobre el estado del proyecto. Leer COMPLETO antes de hacer cambios. Última actualización: **2026-05-23 · v0.9.0 · FASE 8 cerrada**.

---

## 1. Estado del proyecto en 30 segundos

- **Empresa**: TECHTRAFO — fabricación, reparación y mantenimiento de transformadores eléctricos (150 kVA → 10 MVA), Samborondón, Ecuador.
- **Versión actual**: `v0.9.0` (FASE 8 completa). FASE 4 plus, FASE 5, FASE 6, hardening, FASE 7 (SCADA), y FASE 8 (Grafana alerting con email) cerradas.
- **Próximo trabajo**: cuando llegue hardware real → reemplazar simulador por gateway IoT. Ver ADR-004. Sumar reglas de alerting según necesidad (umbrales V/I/vibración, garantías por vencer, reclamos).
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
      (NO tiene techtrafo.com configurado — usamos notificaciones@medicvip.org para email)

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
| Cuenta SMTP TECHTRAFO en MailPlus | `notificaciones` | `VpdFs5gpdZ49yvqs3KHjJ8bE` | Saliente desde el worker (alias `notificaciones@medicvip.org`) |
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
- **JWT en cookie HttpOnly** con `Domain=.techtrafo.com` en producción. Default 8h.
- **Cookies y CORS**: backend en `api.techtrafo.com`, frontend en `panel.techtrafo.com` comparten cookie por dominio padre `.techtrafo.com`.

## 5. Estructura del repo (orientación rápida)

```
techtrafo/
├── README.md, CHANGELOG.md, HANDOFF.md
├── docs/                        # ADRs y diagramas
├── infrastructure/docker/       # docker-compose.yml + Dockerfiles
├── database/migrations/         # SQL puro 001 → 015
├── backend/                     # API
│   ├── package.json (v0.5.0)
│   ├── prisma/schema.prisma     # GENERADO por db pull, NO editar a mano
│   └── src/
│       ├── server.ts
│       ├── config/env.ts        # zod, incluye SMTP, UPLOAD_DIR, etc
│       ├── auth/                # JWT + middleware con permisos
│       ├── db/                  # client.ts + withAppUser.ts
│       ├── routes/              # 12 routers
│       ├── services/            # email.ts, notificaciones.ts, pdf/*
│       └── workers/             # notificaciones-worker.ts
├── frontend/                    # Next.js 15 App Router
│   ├── package.json (v0.5.0)
│   └── src/
│       ├── middleware.ts        # auth gate por cookie
│       ├── app/
│       │   ├── (app)/           # layout autenticado con sidebar dinámico
│       │   └── login, register
│       ├── components/ui/       # shadcn (button, dialog, select, table...)
│       └── lib/                 # api.ts + 10 helpers de dominio
└── _backups/                    # backups locales mirror del server (gitignored si .gitignore existe)
```

## 6. Endpoints REST al cierre v0.5.0

12 routers. Ver `README.md` sección "API endpoints actuales" para listado completo. Highlights:
- `/api/auth/*` login/logout/me/register
- `/api/clientes`, `/api/cotizaciones`, `/api/contratos`, `/api/inventario`
- `/api/expedientes` (con hitos), `/api/visitas-tecnicas`, `/api/informes-tecnicos`
- `/api/ot` (con pasos, gantt, evidencias)
- `/api/transformadores`
- `/api/produccion/{dashboard,areas,causas-demora,tiempos,reprocesos}`
- `/api/garantias` (con reclamos, intervenciones)
- `/api/portal/*` — solo cliente con `cliente_id` asociado
- `/api/pdf/{cotizacion,contrato,ot,informe-tecnico}/:id?nivel=N` (1-4)
- `/api/auditoria/{ot,expediente}/:id`
- `/api/notificaciones` + `/resumen`
- `/api/admin/{usuarios,roles,permisos/catalogo}`

## 7. Decisiones de Pablo a respetar (de memoria persistente)

- **NUNCA** tocar `panel.eneural.org` (VM nginx) ni el sitio principal `eneural.org` — esa VM es de Netvoice y aloja también el frontend de TECHTRAFO. Cualquier cambio en nginx hay que validarlo con cuidado.
- **NO** sugerir rotación de passwords compartidas en chat.
- **Operar directo vía SSH** desde plink/pscp — Pablo NO quiere copiar-pegar comandos.
- **Backup + commit + push después de cada hito** (ya está documentado en CHANGELOG). El backup va a `/home/techtrafo/backups/` con timestamp.
- **Mirror local** del repo: Pablo trabaja con el código en `C:\Users\Pablo B\techtrafo\` (sin `.git`). El repo "real" vive en el server en `/home/techtrafo/techtrafo/` con git. Sincronizamos vía `pscp`. El local NO está vinculado a git pero los archivos se mantienen al día via pscp en cada cambio.
- **Cache después de cambio de contenido**: si Pablo ve la versión vieja en el panel, sugerir incógnito ANTES de investigar el server.

## 8. Backlog pendiente (corto)

### FASE 4 plus — CERRADA (2026-05-23)
- Botón PDF agregado en detalle de informe técnico (dentro del listado del expediente).
- Worker cron procesa `posventa.v_garantias_por_vencer` y encola email al cliente:
  - umbral `7d` si `dias_restantes <= 7`, sino `30d` si `<= 30`
  - idempotente por `(garantia_id, umbral)` — 1 sola notif por garantía y umbral en toda su vida
  - destinatario: `clientes.email` (silencioso si NULL — se activa cuando el cliente tenga email)

### FASE 5 — Portal cliente externo — CERRADA (2026-05-23)
- Subdomain `portal.techtrafo.com` en producción con SSL.
- Arquitectura elegida: **misma app Next.js**, middleware reescribe por host.
  - Cliente entra a `portal.techtrafo.com/expediente/5` → internamente sirve `/portal/expediente/5`.
  - Paths internos (`/dashboard`, `/cotizaciones`, `/ot`, etc.) → redirect a `/` (no expone módulos admin).
  - Post-login: si `Host` es portal → `/portal`, sino → `/dashboard`.
- Cert SAN expandido para cubrir panel + api + portal (un solo cert, una sola renovación).
- DNS A record creado en GoDaddy: `portal` → `186.101.238.135`.

### FASE 6 — Dashboards Grafana — CERRADA (2026-05-23)
- Datasource Postgres provisioned (uid `postgres-techtrafo`) via `infrastructure/docker/grafana/provisioning/datasources/postgres.yaml`. ReadOnly desde UI (la fuente de verdad es el yaml).
- 3 dashboards en folder TECHTRAFO:
  - `comercial-pipeline` — expedientes/cotizaciones/contratos + hitos estancados
  - `planta-produccion` — OTs, carga por área, causas de demora, productividad
  - `financiero-facturacion` — pipeline USD, contratado/mes, cobranza pendiente
- Acceso: http://192.168.0.23:3001 (LAN only — no se expuso públicamente por seguridad).
- Para editar un dashboard: la UI permite editar y "guardar como JSON". Bajar el JSON actualizado a `infrastructure/docker/grafana/dashboards/` y subir via pscp.
- `updateIntervalSeconds: 30` en providers.yaml → cambios al JSON se reflejan automático sin restart.

### FASE 6 plus — Dashboard Garantías — CERRADA (2026-05-23)
- `garantias-posventa`: KPIs vigentes/por vencer/reclamos + tabla próximas a vencer.

### Hardening nginx — CERRADO (2026-05-23)
- Snippet `infrastructure/nginx/block-credential-scans.conf` incluido en panel/api/portal vhosts.
- 0 scans llegan al backend.

### FASE 7 — SCADA híbrida con simulador — CERRADA (2026-05-23)
- ADR-004: Opción C híbrida con simulador puente.
- InfluxDB 2.7 + Mosquitto MQTT 2 corriendo en compose. Datasource Influx provisioned en Grafana.
- Bridge MQTT→Influx embebido en API (`backend/src/workers/scada-bridge.ts`). Toggle: `SCADA_BRIDGE_ENABLED`.
- Simulador en container aparte (perfil `simulador`) publica 8 variables c/10s.
- Dashboard `scada-transformador` con time series de temperatura/V/I/vibración/humedad.
- Contrato MQTT: `techtrafo/transformador/<equipo_id>/<variable>` + payload `{valor, unidad, ts}`. Cuando llegue hardware real, basta apagar el simulador y conectar gateway al mismo topic.

### FASE 8 — Grafana Alerting con email — CERRADA (2026-05-23)
- SMTP configurado en Grafana (`GF_SMTP_*` en compose, reusa cuenta MailPlus).
- Contact point `pablo-email` → pablobaquerizodavila@gmail.com (provisioned).
- Notification policy default (group_wait 30s, group_interval 5m, repeat 4h).
- 2 alert rules provisioned (folder TECHTRAFO):
  - `alert-scada-temp-aceite`: Influx Flux, temperatura_aceite > 80°C por 1m → critical
  - `alert-comercial-hitos-estancados`: Postgres, COUNT(v_expediente_pipeline WHERE estancado) > 0 por 2m → warning
- Validado end-to-end con email real recibido.
- Provisioning yamls en `infrastructure/docker/grafana/provisioning/alerting/`.

### Backlog pendiente
- (sin hitos críticos abiertos)

## 9. Gotchas / errores recurrentes

- **`npm install <pkg>` en el container API purga devDependencies** (ts-node-dev se va). Solución: hacer rebuild de la imagen API con `docker compose build api && docker rm -fv techtrafo-api && docker compose up -d api`. Pasó con multer y nodemailer.
- **JWT expirado → loop login/dashboard**: el middleware redirige a /login si la cookie está, y /login redirige a /dashboard. Fix: `SessionExpiredButton` que llama POST `/api/auth/logout` y hace `window.location.href = "/login"`. Ya está en producción.
- **Cookie con `Domain=.techtrafo.com`** no se guarda en curl contra localhost. Para probar endpoints autenticados localmente, usar el browser real o forzar `Domain=localhost` temporalmente.
- **`UPDATE ... FROM ... JOIN`** en Postgres NO permite joinear la tabla updateada en el FROM. Usar CTE (ver migration 013 — error y fix).
- **`SUBSTRING(codigo, ...)` con BigInt**: bug histórico. Usar `SPLIT_PART(codigo, '-', N)::INTEGER`.
- **Hashes bcrypt con `$`** se rompen en bash one-liners. Generar y aplicar SIEMPRE dentro del container con `docker exec ... node -e "..."`.
- **Synology MailPlus**: tiene 3 capas de control (login_map, email_owner.db, activated_recipients_map). Crear cuentas nuevas necesita la UI de DSM. Reusar las existentes.

## 10. Cómo arrancar la nueva sesión

En la nueva sesión de Claude, pasa este prompt inicial:

> Soy Pablo Baquerizo, dueño de TECHTRAFO (fab/rep/mant de transformadores en Samborondón).
> Antes de hacer cualquier cosa, lee `C:\Users\Pablo B\techtrafo\HANDOFF.md` completo — ahí está el contexto del proyecto, credenciales SSH para operar, convenciones del repo y backlog pendiente.
> Operá SIEMPRE vía plink/pscp sobre el server `techtrafo@192.168.0.23` (no me pidas copiar comandos). Cuando termines de leer el handoff, decime un resumen corto del estado y preguntame qué seguimos.

La nueva sesión va a leer este archivo, va a entender todo, y vamos a poder retomar donde dejamos.
