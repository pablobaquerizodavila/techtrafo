# Changelog

Todos los cambios notables de este proyecto se documentan aqui.

El formato sigue Keep a Changelog y este proyecto adhiere a Semantic Versioning.

---

## [0.3.0] — 2026-05-22

### Agregado — FASE 3: desarrollo del stack vertical

#### 3.1 Modelado de la BD del negocio
- 6 migrations SQL nuevas, 4 schemas de dominio nuevos (`comercial`, `inventario`, `produccion`, `posventa`), ~22 tablas + 1 vista
- 2 funciones genericas reutilizables: `core.fn_set_updated_at`, `core.fn_auditar`
- Trigger de auditoria automatica en todas las tablas de negocio (lee `app.usuario_id` de la sesion)
- Funcion `inventario.fn_aplicar_movimiento_stock` que mantiene `inventario.stock` cuando se inserta en `movimientos_stock`
- Movimientos de stock inmutables (solo INSERT, correcciones via ajuste contrario)
- CHECK `cantidad >= 0` protege contra stock negativo silencioso
- FK pendiente cerrada: `inventario.series.ot_id_origen` -> `produccion.ot.id` (resuelto en migration 006)
- Test funcional por migration: flujos completos con ROLLBACK, validacion de CHECKs y constraints

Commits: `cdfa36a` (002), `3006aca` (003), `412e128` (004), `6cfdb63` (005), `1b2b122` (006), `b5c2b20` (007)

#### 3.2 Backend scaffolding (Express + TS + Prisma)
- Node 22 alpine dockerizado, servicio `techtrafo-api` en el compose existente
- Prisma como cliente (no como motor de migrations); schema introspectado de la DB con `prisma db pull` (24 modelos)
- `DATABASE_URL` armada en el compose desde el `.env` del host (sin secretos en codigo)
- Validacion de env vars con zod (falla rapido si falta algo)
- Endpoint `GET /api/health` con check de conexion a DB
- Helper `BigInt.prototype.toJSON` para serializar BIGSERIAL a Number en JSON
- `prisma generate` explicito en Dockerfile despues del COPY (no depender de postinstall)

Commits: `b7e9cd2`, `f3bc982`

#### 3.3 Auth (JWT + bcrypt)
- POST `/api/auth/login`, POST `/api/auth/logout`, GET `/api/auth/me`
- JWT en cookie HttpOnly + SameSite=Lax + Secure (en prod) + Domain=.techtrafo.com (en prod, para subdominios)
- bcrypt rounds=12 para password hashing
- Middleware `requireAuth` carga el usuario desde DB en cada request (rol actualizado vivo)
- Middleware `requireRole(...roles)` para autorizacion granular
- Mensaje unico `invalid_credentials` para usuario inexistente o password incorrecta (no user enumeration)
- Script `seed-admin` idempotente para crear/actualizar primer admin
- JWT_SECRET generado con openssl rand 48 bytes, validado por zod (min 32 chars)

Commits: `9f74497`, `7b02b1a`, `3ae50e4`

#### 3.4 CRUD de clientes con auditoria automatica
- GET (paginado + filtros `q/estado/segmento/sector`), GET `/:id` (con contactos), POST, PATCH, DELETE (soft)
- Validacion zod con manejo de errores 400/409/404
- `creado_por`/`actualizado_por` se setean automaticamente desde `req.user.id`
- Helper `withAppUser(userId, tx => ...)`: transaccion + `set_config('app.usuario_id', $1, true)` parametrizado (seguro contra SQL injection) -> trigger de auditoria registra el usuario
- Soft delete via `estado='archivado'`; default oculta archivados; `?estado=archivado` los muestra
- Patron replicable para futuros modulos (cotizaciones, contratos, OT, garantias)

Commit: `d12f0c7`

#### 3.5 Frontend scaffolding (Next.js 15 + App Router)
- Servicio `techtrafo-web` en docker-compose (puerto 3002, red `techtrafo_net`)
- Next.js 15.5 + TypeScript + Tailwind 3.4 + 4 componentes shadcn (Button, Input, Label, Card) creados manualmente sin CLI interactiva
- `lib/api.ts`: fetch wrapper con `credentials: 'include'` para cookie auth
- `lib/auth.ts`: helpers `login`, `logout`, `getCurrentUser`
- `/login` con form funcional consumiendo POST `/api/auth/login`
- `middleware.ts` redirige a `/login` si no hay cookie `techtrafo_session`
- `/dashboard` como Server Component que consume `/api/auth/me` SSR con la cookie del request
- AppLayout con sidebar (Dashboard, Clientes) y boton de logout

Commit: `abf6938`

#### 3.6 Vista de listado de clientes
- Tabla paginada con busqueda debounced (300ms) por razon social, RUC o nombre comercial
- Filtros independientes: estado, segmento, sector (cada uno resetea paginacion)
- Boton "Nuevo cliente" abre modal con ClienteForm (cubre los 17 campos del modelo)
- Click en lapiz: edita el cliente en el mismo modal precargado
- Boton archivar con `confirm()` antes; DELETE soft
- Badges de estado coloreados (activo=verde, archivado=amarillo, bloqueado=rojo, inactivo=gris)
- Toasts via `sonner` para feedback de exito/error
- Componentes shadcn nuevos: Table, Dialog, Select, Badge, Textarea
- Deps anadidas: `@radix-ui/react-dialog`, `@radix-ui/react-select`, `sonner`

Commits: `2cb6a52`, `6414ed3`

#### 3.7 Reverse proxy + DNS + SSL
- Topologia descubierta: VM nginx en 192.168.0.7 hace TLS termination y reverse proxy hacia el NAS (sitios publicos) y hacia el PC Ubuntu (panel/api)
- A records anadidos en GoDaddy: `panel.techtrafo.com` y `api.techtrafo.com` -> 186.101.238.135
- Cert Let's Encrypt emitido via `certbot --webroot` cubriendo ambos subdominios (auto-renew configurado, expira 2026-08-20)
- 3 server blocks appended al `/etc/nginx/sites-available/netvoice` de la VM (con `tee -a`, sin nano):
  - HTTP `panel.techtrafo.com api.techtrafo.com` -> acme-challenge + redirect a HTTPS
  - HTTPS `panel.techtrafo.com` -> `proxy_pass http://192.168.0.23:3002` con Upgrade/Connection para HMR
  - HTTPS `api.techtrafo.com` -> `proxy_pass http://192.168.0.23:3000`
- Backup automatico del archivo nginx antes de cada cambio (`netvoice.backup-pre-techtrafo-panel-*`)
- Cookie de auth con `Domain=.techtrafo.com` en produccion para compartir entre subdominios
- CORS del backend ajustado a `https://panel.techtrafo.com`
- `NEXT_PUBLIC_API_URL=https://api.techtrafo.com` en el frontend
- **eneural.org / panel.eneural.org / Netvoice intactos** durante todo el cambio

Commit: `3ae50e4`

### Notas de seguridad

- JWT_SECRET no esta en el repo (vive solo en `/opt/techtrafo/.env` del host)
- Token de GitHub configurado via `credential.helper store` del git en el host (no en URL del remote)
- Cookie de sesion es HttpOnly+Secure+SameSite=Lax (inaccesible a JS, solo viaja sobre HTTPS)
- Mismo mensaje de error para email inexistente vs password incorrecta (no user enumeration)
- bcrypt rounds=12 (~250 ms por hash, balance CPU vs ataque por fuerza bruta)

### URLs

- `https://panel.techtrafo.com` -> panel administrativo (login + dashboard + /clientes)
- `https://api.techtrafo.com/api/health` -> healthcheck publico del backend
- `https://techtrafo.com` -> landing comercial (servida por NAS Web Station, no tocada en esta fase)

---

## [0.2.0] — 2026-05-22

### Agregado — FASE 2 infraestructura base

#### Docker stack
- Docker Engine 29.5.2 + Docker Compose v5.1.4 instalados en PC Ubuntu
- Stack base operativo con 4 contenedores: postgres, redis, grafana, nginx
- Estructura /opt/techtrafo con permisos UID correctos por servicio
- Configuracion docker-compose.yml versionada
- Plantilla .env.example sin secretos

#### Base de datos
- PostgreSQL 16.14 con schema core inicial
- 4 tablas: roles, usuarios, configuracion, auditoria
- 6 indices para busquedas frecuentes
- Extension pgcrypto activada para UUIDs y hashing
- 12 roles base del sistema cargados
- 17 parametros de configuracion iniciales

#### Grafana
- Grafana OSS conectado a PostgreSQL como datasource validado
- Acceso desde LAN en puerto 3001
- Login admin con password segura cambiada
- Query de prueba exitosa contra core.roles

#### Nginx
- Pagina de bienvenida con tabla de servicios activos
- Endpoint /health para validacion automatizada
- Configuracion versionada

---

## [0.1.0] — 2026-05-22

### Agregado — FASE 1 procesos

#### Arquitectura
- Arquitectura hibrida NAS + PC Ubuntu definida
- 8 servicios Docker provisionados (6 activos + 2 para SCADA futuro)
- Decision: opcion B de Grafana (KPIs de negocio sin sensores fisicos al inicio)

#### Flujo comercial
- 17 pasos en 6 etapas validados
- Canales de entrada, asignacion automatica, validacion de cliente
- Integracion con contrato, anticipo, factura por avance y liquidacion
- Posventa con NPS, programa de mantenimiento y reclamos de garantia

#### Flujo de produccion
- Adoptado el flujo real de TECHTRAFO (28 pasos, 5 gates de prueba)
- Bifurcacion reparacion (Ruta A) vs fabricacion nueva (Ruta B)
- Loops de retrabajo: correccion de fuga, recuperacion de conductores, rediseno
- Integracion con hitos de caja, captura Grafana y checklists por area

#### Modulos
- Caja con plan de pagos flexible (cualquier porcentaje por hito, 1-N hitos)
- Reglas diferenciadas por cliente privado vs publico
- Bodega con catalogo importado/local, escaneo de codigos, BOM automatico
- Cotizador con margen libre y 3 niveles de detalle visible al cliente
- Centro de configuracion con todos los parametros editables

#### Reglas de negocio
- Autoridad ejecutiva: Presidencia, Gerencia General, Gerencia Comercial al 100%
- Facturacion adelantada permitida (hito completo mas proximo)
- Cliente publico pausa produccion ante mora; privado solo alerta
- Equipo no se libera fisicamente si % cobrado menor que 100%

### Documentado
- README principal con vision general del proyecto
- .gitignore configurado para Node.js, Docker y secretos
- Estructura inicial de carpetas
