# Changelog

Todos los cambios notables de este proyecto se documentan aqui.

El formato sigue Keep a Changelog y este proyecto adhiere a Semantic Versioning.

---

## [0.5.0] — 2026-05-23 — FASE 4 cierre

### Agregado — Dashboards C/D/E + 4.6 PDFs + 4.7 Garantías

#### Dashboard C — Áreas, causas de demora, reprocesos, tiempos
- Migration 013: 4 tablas nuevas + 3 vistas agregadas (`v_carga_por_area`, `v_productividad_responsable`, `v_causas_demora_agregado`).
- Catálogo de 11 áreas seedeadas (ingeniería, compras, núcleo, bobinado, ensamble, tanque, pintura, secado, pruebas, despacho, servicio) con color hex y orden visual.
- 10 causas de demora tipificadas en 6 categorías (materiales, personal, calidad, técnica, cliente, operativa).
- `produccion.reprocesos` con `dias_perdidos` + `costo_estimado` opcional + flag resuelto.
- `produccion.tiempos_trabajo` (horas-hombre por usuario/OT/paso/área).
- FK `ot_pasos.area_id` + `ot_pasos.causa_demora_id` con asignación automática de áreas a los pasos ya instanciados vía CTE.
- Dashboard `/produccion`: los 3 bloques DUMMY del fondo (capacidad, causas, productividad) **pasaron a data real** desde las nuevas vistas.
- UI: dialog "Registrar tiempo" + dialog "Reportar reproceso" en detalle de OT con resolución inline.

#### Dashboard D — Roles + vista cliente con mapping
- Migration 014: `usuarios.cliente_id` (FK opcional a `comercial.clientes`).
- Rol `auditor` agregado (solo lectura, sin info sensible).
- `comercial.hito_estados_cliente`: 15 mappings hito_codigo → label_cliente con emoji (editable a futuro).
- `routes/portal.ts` con 4 endpoints protegidos por `requireClienteId`. Filtran TODO por `cliente_id` del usuario y devuelven solo hitos `visible_cliente=true` con mapping ejecutivo.
- `/portal` y `/portal/expediente/[id]` con vista limpia (sin responsables, demoras, reprocesos, costos internos).
- Sidebar simplificado automático para rol cliente: solo "Mi cuenta" + Notificaciones.
- `/dashboard` redirige a `/portal` si el usuario es cliente.

#### Dashboard E — Gantt + Evidencias + Trazabilidad
- `services/email.ts`: nada. (Multer es nuevo).
- `routes/evidencias.ts`: subir/listar/descargar/eliminar archivos por OT y paso con multer (filesystem local `/uploads/evidencias/{ot_id}/`). Validación de mime types, límite 20 MB configurable, path traversal protection. Ruta guardada RELATIVA al UPLOAD_DIR para portabilidad futura a MinIO.
- `routes/auditoria.ts`: GET `/ot/:id` y `/expediente/:id` combinan `core.auditoria` con cambios sobre pasos, evidencias, tiempos y reprocesos.
- `/api/ot/:id/gantt`: distribuye pasos sobre el rango planeado y devuelve plan vs real.
- Frontend: `GanttOT` componente SVG puro (sin libs) con barras plan vs real coloreadas por estado, línea "HOY", tooltips. `EvidenciasPanel` con galería de fotos + lightbox + lista de PDFs. `AuditoriaPanel` colapsable con diff visual antes/después.
- `docker-compose.yml`: nuevo volumen `../../uploads:/uploads` montado al api.

#### 4.6 — Generación de PDFs con 4 niveles de detalle
- Stack: **PDFKit** (lightweight, sin Chromium).
- `services/pdf/base.ts`: helpers reutilizables (cabecera corporativa con franja oscura, pie con marca de nivel y aviso CONFIDENCIAL si N≥3, paleta TECHTRAFO, tablas zebra, totales destacados).
- `services/pdf/documentos.ts`: 4 generadores (cotización, contrato, OT, informe técnico).
- `routes/pdf.ts`: 4 endpoints `GET /api/pdf/{recurso}/:id?nivel=N`.
- **Validación server-side del nivel**: cliente max=2, interno no-super_admin max=3, super_admin max=4. Aunque el query pida N=4 se entrega el nivel permitido.
- Por nivel:
  - N1: cabecera + cliente + total único + condiciones
  - N2: + tabla detallada con líneas, IVA, descuento global, plan de pagos, pasos
  - N3: + costo unitario + margen por línea + notas internas + resultados de gates QA + recomendación destacada
  - N4: + historial de revisiones + auditoría completa
- Frontend: `PdfButton` dropdown con descripción visual por nivel, integrado en cotización/contrato/OT.

#### 4.7 — Garantías + reclamos + intervenciones
- Migration 015: `posventa.garantias.transformador_id` (FK opcional) + `serie_id` opcional + CHECK que exige al menos uno + `ot_id_origen` para trazar origen.
- Vista `v_garantias_por_vencer` para alertas (vigentes ≤ 30 días).
- `routes/garantias.ts`: CRUD con código `GAR-YYYY-NNNN` auto + dashboard/resumen con 4 KPIs.
- Reclamos anidados con `REC-YYYY-NNNN` auto, severidad (baja/media/alta/crítica), canal de entrada (telefono/email/whatsapp/visita/web), cerrar exige resolución + setea fecha_cierre + dictaminado_por.
- Intervenciones con número auto-incremental por reclamo (visita_diagnostico/reparacion/reemplazo/calibracion/asesoria/otro) + resultado (exitoso/parcial/fallido).
- **Auto-creación de garantía al completar OT**: 12 meses para reparación/mantenimiento, 24 para fabricación. Si falla, no rompe la transición (try/catch + log).
- UI: `/garantias` listado con KPIs clickables como filtro, highlight amarillo de filas ≤ 30 días. `/garantias/[id]` detalle con stats banner (días restantes coloreado), reclamos en cards con severidad, botones inline "+ intervención" y "cerrar" con dialog de resolución.

### Mejorado
- Sidebar agrega entry "🛡️ Garantías" + "⚡ Transformadores" + "📊 Dashboard producción".
- `/dashboard` reescrito: accesos rápidos por permiso + roadmap (antes era placeholder de FASE 3 desactualizado).
- `SessionExpiredButton` cliente que limpia cookie y hace hard navigation a `/login` (resuelve loop dashboard↔login cuando JWT expira).
- Middleware con validación de forma JWT antes de redirigir desde `/login` (heurística defensiva).
- Matriz comparativa del dashboard producción muestra capacidad real en kVA/MVA desde transformador vinculado (ya no chip DUMMY).
- Dashboard producción muestra responsables, áreas y causas reales (los 3 bloques DUMMY pasaron a producción).

### Infraestructura
- `docker-compose.yml`: volumen `../../uploads:/uploads` para evidencias + env `UPLOAD_DIR`.
- Backup workflow consolidado con varios snapshots en `/home/techtrafo/backups/`.
- Migrations 011, 012, 013, 014, 015 aplicadas en prod.
- Bump version 0.3.0 → 0.5.0 en backend y frontend.

### Notas técnicas
- **Total de migrations: 15** (001 → 015).
- **Endpoints REST agregados en FASE 4**: ~60 nuevos endpoints sobre 12 routers.
- **Tablas DB al cierre**: ~40 tablas + 7 vistas agregadas.
- **Permisos granulares**: 8 módulos × N acciones (clientes, cotizaciones, contratos, inventario, expedientes, ot, admin, portal).

---

## [0.4.5] — 2026-05-23

### Agregado — FASE 4: módulos de operación + Dashboard de producción

#### 4.1 — Cotizaciones
- CRUD completo con líneas, revisiones (historial inmutable de versiones) y transiciones de estado: `borrador → enviada → aprobada/rechazada/vencida/cancelada → convertida`.
- Generación auto de código `COT-YYYY-NNNN` con `SPLIT_PART` para evitar el bug de `SUBSTRING` con BigInt.
- UI con form de líneas dinámicas, cálculo en vivo de subtotal/IVA/total, validación zod.

#### 4.3 — Inventario
- API y UI de catálogo (categorías, ubicaciones, ítems) y stock con lotes/series + kárdex de movimientos.

#### 4.4 — Contratos
- CRUD con plan de pagos por hitos. Transiciones `borrador → vigente → suspendido/completado/cancelado`.

#### 4.5 — Órdenes de Trabajo
- Migration 011: `produccion.paso_plantillas` con seed de 9/11/6 pasos (con 2/3/1 gates de QA) para `reparacion / fabricacion / mantenimiento`.
- API completa de OT con código `OT-YYYY-NNNN`, transiciones (iniciar / pausar / completar / cancelar) y operaciones por paso (iniciar / completar / rechazar gate / saltar).
- Vinculación automática `expedientes.ot_id` al crear OT desde contrato.
- Trigger `fn_sync_hito_ot`: cerrar OT marca hitos de producción del expediente como completados y activa "entrega".
- UI con pipeline visual, barra de progreso, gates resaltados con border amarillo.

#### 4.8 — Roles, super_admin y aprobación de usuarios
- Migration 008: campo `es_super_admin` en `roles`, campo `estado_aprobacion` en `usuarios` (`pendiente / aprobado / rechazado`).
- `/register` público que crea usuario en estado pendiente.
- `/admin/usuarios` y `/admin/roles` con matriz de permisos editable desde UI.
- Catálogo de permisos granular `modulo.accion`: clientes, cotizaciones, contratos, inventario, expedientes, ot, admin.
- Renombrado consistente `cliente_externo → cliente` en todo el catálogo.

#### 4.A — Migration 010: hoja de ruta del pedido
- 6 tablas nuevas: `hito_plantillas`, `expedientes`, `expediente_hitos`, `visitas_tecnicas`, `informes_tecnicos`, `core.notificaciones`.
- 3 trigger functions de sincronización (cotización / contrato / OT → hitos).
- Vista `comercial.v_expediente_pipeline` calcula `estancado` en runtime usando `horas_transcurridas` vs `sla_horas`.
- Seed de 17 hitos con SLAs por etapa.

#### 4.B — API de expedientes / visitas / informes
- CRUD completo con instanciación automática de hitos al crear expediente.
- Workflow de gates: `iniciar / aprobar / rechazar` por hito, con validación de rol aprobador (super_admin bypass).
- Cascada: aprobar hito activa el siguiente en orden.
- Informes técnicos con número auto `INF-YYYY-NNNN` y estados `borrador / en_revision / aprobado / rechazado`.

#### 4.C — UI tablero de expedientes
- `/expedientes` listado con KPIs (activos, estancados clickable como filtro, ganados), filtros y búsqueda.
- `/expedientes/[id]` pipeline gráfico de los 15 hitos con iconos por estado, highlight rojo para estancados, botones inline iniciar/aprobar/rechazar.
- Cards de documentos relacionados + panel lateral con visitas + informes.

#### 4.D — Notificaciones email
- Backend: nodemailer + 3 templates HTML, worker `setInterval` in-process (default 5 min) que detecta estancamientos vía `v_expediente_pipeline` (idempotente por día) y procesa cola con reintentos.
- Ganchos en iniciar / aprobar / rechazar / crear expediente → email al rol aprobador y al ejecutivo.
- SMTP configurado contra **Synology MailPlus** (192.168.0.116:465) con cuenta `notificaciones@medicvip.org` (DKIM/SPF/DMARC operacional).
- Frontend: `/notificaciones` bandeja + badge con polling 60s en sidebar.
- Modo dry-run automático si `SMTP_HOST` no está configurado.

#### Dashboard A — Dashboard ejecutivo de producción
- Migration: ninguna (usa data existente).
- `GET /api/produccion/dashboard` unifica KPIs + semáforo de fases (verde/amarillo/rojo/azul/gris calculado en SQL) + matriz comparativa unificada OT + expedientes + rankings + alertas + próximas entregas.
- `/produccion` con 9 KPIs ejecutivos, semáforo con barras, matriz con 4 filtros, refresh automático 60s.
- Bloques DUMMY claramente etiquetados para capacidad por área, causas de demora y productividad (pendiente migration 013).

#### Dashboard B — Migration 012: transformadores
- Nueva tabla `produccion.transformadores` con identificación (código auto, marca, modelo, serie), características técnicas completas (tipo de los 7 del prompt, capacidad kVA, tensiones, conexión, grupo vectorial, fases, frecuencia, refrigeración), dimensiones y ciclo de vida.
- FK desde `ot.transformador_id` y `expedientes.transformador_id` (nullable).
- Vista `v_transformador_historial` con duración real por OT.
- API CRUD + búsqueda + endpoint `/cliente/:id` para selects + `historial_stats` agregado en detalle.
- UI: listado con filtros, ficha con stats banner y historial completo, formulario en 4 bloques.
- Integración con OT: selector de transformador autocarga los del cliente del contrato; el detalle de OT muestra card destacada del equipo.
- Matriz del dashboard ya muestra capacidad real (`500 kVA`, `1 MVA`).
- Seed de 2 equipos demo: Siemens TPV-500 (500 kVA) y ABB POT-1MVA-V2 (1 MVA).

### Mejorado
- Dashboard placeholder `/dashboard` reescrito: accesos rápidos por permiso + roadmap actual (antes era texto de FASE 3 desactualizado).
- Fix de loop login/dashboard cuando el JWT expira: `SessionExpiredButton` cliente que limpia cookie via `/api/auth/logout` y hard navigation, + middleware con validación de forma JWT antes de redirigir.

### Infraestructura
- Backup workflow documentado en README + scripts manuales en `/home/techtrafo/backups/`.
- `docker-compose.yml`: nuevas env vars SMTP inyectadas al servicio `api`.

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
