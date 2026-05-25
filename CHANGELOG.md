# Changelog

Todos los cambios notables de este proyecto se documentan aqui.

El formato sigue Keep a Changelog y este proyecto adhiere a Semantic Versioning.

---

## [0.16.1] — 2026-05-25 — chore(tooling): script automatizado de backup al NAS

Automatiza el workflow de snapshot al NAS que veniamos haciendo a mano
despues de cada commit + push.

Nuevo en `scripts/`:

- `scripts/tt-backup.sh` — script bash que genera un snapshot zip del
  estado de HEAD via `git archive`, lo deposita en `\\NAS1821\...\
  tech-trafo-commit-backup\code\` y refresca README.md + CHANGELOG.md
  en el raiz del backup. Auto-detecta version del primer encabezado
  `## [X.Y.Z]` del CHANGELOG y auto-detecta label slug-eando el
  subject del ultimo commit (le quita el prefijo `type(scope):` y
  lo convierte a kebab-case ASCII).

- `scripts/README.md` — documentacion: pre-requisitos, uso, salida,
  errores comunes y workflow tipico.

Validaciones del script:

- Verifica que sea un repositorio git valido
- Verifica branch (`main` por default, con override interactivo)
- Verifica working tree limpio
- Verifica sync con `origin/main` (fetch + comparar SHAs)
- Verifica acceso al NAS via SMB
- Falla rapido (`set -euo pipefail`) si algo no cumple

Uso:

```bash
# Auto-detecta label del commit msg
./scripts/tt-backup.sh

# Con label explicito (recomendado para hitos)
./scripts/tt-backup.sh voltage-os-ola-3c
```

Salida en NAS:

```
tech-trafo-v0.16.1-chore-tooling-script-automatizado-<sha>-<ts>.zip
```

A partir de ahora cada commit + push hecho con asistente IA invocara
el script automaticamente. Para uso manual: invocar desde la raiz
del repo despues de cualquier `git push` exitoso.

---

## [0.16.0] — 2026-05-25 — Voltage OS Ola 3C: cierre del rebrand

Ultima ola del rebrand. Migra al lenguaje Voltage OS las paginas que
quedaban: inventario, transformadores, portal cliente y notificaciones.

Con esta ola, **el rebrand Voltage OS queda completo al 100%** salvo el
refactor de los hitos internos en /expedientes/[id] (logica compleja
que decidimos no tocar para no introducir bugs).

Inventario (4 paginas):

- `/inventario` (hub): PageHeader con LED copper si hay alertas, 3
  StatCard como atajos (Items copper, Stock teal, Movimientos),
  Panel de "Atencion requerida" con tonos amber/rose si hay alertas,
  Panel "Acerca de Bodega" con descripcion del flujo.
- `/inventario/items` (catalogo): PageHeader + HeaderActionPrimary,
  filtros compactos h-8, badges de trazabilidad (Serie=warning,
  Lote=teal, Sin stock/Cantidad=muted), precio en copper, acciones
  Pencil/Archive con tono.
- `/inventario/stock`: 2 Panels paralelos para alertas (reorden=amber,
  vencimiento=rose) con empty state celebrativo green cuando estan en
  cero, tabla con codigo copper y cantidad mono.
- `/inventario/movimientos`: filtro Select compacto, tabla con flecha
  origen->destino en copper, cantidad mono semibold.

Transformadores (2 paginas):

- `/transformadores` (lista): codigo copper, capacidad en ttteal con
  glow, badge copper para OT count con icono Factory.
- `/transformadores/[id]` (detalle): hero card glow copper con
  capacidad ttteal grande, 4 StatCards de historial (intervenciones,
  completadas green, en curso copper, ultima fecha), 2 grids con
  caracteristicas tecnicas y cliente, timeline de OT con estado
  tonal por intervencion.

Portal cliente (2 paginas):

- `/portal` (mi cuenta): 4 StatCard del resumen, ExpedienteCard con
  badge tonal por estado, progress bar gradient ttteal->copper.
- `/portal/expediente/[id]` (detalle pedido): hero card destacado
  con gradient copper italico del estado actual, progress bar grande,
  Panel "Tu equipo" con datos tecnicos, timeline con iconos animados
  (CheckCircle2 verde, Clock copper animate-pulse glow, Circle muted),
  documentos (Cotizacion copper, Contrato teal).

Notificaciones (1 pagina):

- `/notificaciones`: PageHeader con LED copper si hay estancamientos,
  list-items con border-l tonal por tipo (estancado/rechazado=rose,
  espera=amber, aprobado=green), icono en mini-box glass, badge
  enviado/pendiente, link expediente en copper.

Total Voltage OS rebrand:
- Foundation: tokens, fonts, sidebar, dashboard, /produccion
- Ola 1: 6 listas + 3 componentes shared (PageHeader, Panel, StatCard)
- Ola 2A: 5 detalle [id] + 4 sub-paneles OT
- Ola 2B: 5 formularios nueva/o
- Ola 3A: auth (login/register/perfil) + admin (8 paginas)
- Ola 3B: compras (8 paginas) + proveedores (2)
- Ola 3C: inventario (4) + transformadores (2) + portal (2) + notif (1)

**Total ~55 paginas + 4 sub-componentes + 3 shared components = todo el
panel.techtrafo.com en lenguaje Voltage OS coherente.**

Backup de cada ola en `\\\\NAS1821\\Carpeta Hellius\\Documentos Helius\\
companias\\Desarrollos\\Techtrafo\\tech-trafo-commit-backup\\code\\`
como snapshots zip con timestamp + sha corto.

---

## [0.15.3] — 2026-05-25 — Voltage OS Ola 3B: compras + proveedores

Migra al lenguaje Voltage OS las 10 paginas del modulo de compras y
las paginas de proveedores que faltaron en la Ola 3A.

Compras (7 paginas):

- `/compras`: dashboard con 5 StatCards (OCs abiertas, solicitudes
  pendientes, recepciones, alertas de stock, proveedores), Panel
  destacado de "Comprado este mes" con monto copper glow, tabla de
  alertas con checkbox accent-copper y boton "Generar SC", quick
  links a las sub-paginas con icono y hover copper.
- `/compras/solicitudes`: filtros como pills tone-based (copper activo,
  glass inactivos), tabla con codigos copper enlazables.
- `/compras/solicitudes/[id]`: PageHeader con badges multiples, panel
  de total destacado, panel de acciones con botones tone-based
  (Enviar/Aprobar=primary, Rechazar=destructive, Cancelar=ghost),
  panel de motivo de rechazo, tabla de lineas con codigos copper,
  metadatos en grid de 4 cols.
- `/compras/ordenes-compra`: mismo patron de pills, badge tone por
  estado (copper para aprobada, teal para enviada/confirmada,
  success para recibida_total).
- `/compras/ordenes-compra/[id]`: 4 Panels (total, acciones,
  motivo rechazo, confirmacion proveedor), tabla de lineas con
  progress bar de recepcion en el header del panel, panel de
  recepciones de esta OC con badges.
- `/compras/recepciones`: filtros pills, tabla con codigos OC en teal
  (cross-link).
- `/compras/recepciones/[id]`: PageHeader con metadatos en el meta,
  panel de acciones para borrador (Confirmar / Anular), tabla de
  lineas con recibida en green, rechazada en rose, badge tonal por
  inspeccion.
- `/compras/recepciones/nueva`: 2 Panels (documentos, lineas a
  recibir), Selects shadcn (no `<select>` nativo), inputs h-8
  compactos para cantidades/precio/inspeccion/ubicacion.

Proveedores (faltantes de Ola 3A):

- `/admin/proveedores/nuevo`: 4 Panels tematicos (identificacion,
  contacto, condiciones, capacidades), FormField helper.
- `/admin/proveedores/[id]`: header con badge de estado y rating
  con Star amber, botones tone-based (Editar/Archivar/Guardar/
  Cancelar), 2 Panels (identificacion+contacto, items que
  suministra), KV component con soporte de mono. Mismo grid en
  modo edicion y vista.

Patron consistente para todos:
- PageHeader con breadcrumb completo de compras
- HeaderActionGhost para "← Dashboard" o "← Volver"
- Panel glass con headers font-mono uppercase
- Filtros como botones pill copper activo / glass inactivo
- Tablas con header font-mono [10px] tracking-wider
- Codigos en copper, RUC/factura/datos en font-mono
- Empty states tematicos con icono + mensaje

Toda la Ola 3 sub-bloque "compras + auth + admin" cerrada.
Pendiente Ola 3C: /inventario/*, /transformadores/*, /portal/*,
/notificaciones, y refactor cuidadoso de hitos en
/expedientes/[id].

---

## [0.15.2] — 2026-05-25 — Voltage OS Ola 3A: admin + auth

Migra al lenguaje Voltage OS las paginas de administracion y autenticacion:

- `/login`: hero con brand mark copper + glow, gradient title
  (Tech + trafo italico), ambient glow corners (copper sup-izq +
  teal inf-der), form glass con backdrop-blur, callout rose para
  errores. Cambio de fondo `bg-muted/30` claro a la base dark Voltage.
- `/register`: misma estetica que /login, shell reutilizable interno
  con titulo/subtitulo/contenido. Pantalla de confirmacion con
  CheckCircle2 green pulsante.
- `/perfil`: PageHeader, 3 Panels (cuenta con avatar teal grande,
  informacion personal, cambiar contrasena). Boton save copper con
  glow, layout coherente con el resto del panel.
- `/admin/usuarios`: filtros compactos h-8, tabla con avatar gradient
  por usuario, badges de rol (`super` en copper, `inactivo` en muted),
  acciones inline copper/rose para aprobar/rechazar pendientes y
  iconos para editar/reset-password/toggle-activo en aprobados.
- `/admin/roles`: cada rol como Panel glass con icon copper, badges
  (super=copper, all-access=teal), matriz de permisos en grids con
  checkbox accent-copper, dialog nuevo rol mantiene logica.
- `/admin/hito-plantillas`: agrupado por tipo de servicio en Panels
  separados, badges (visible-cliente=teal, requiere-aprobacion=warning).
- `/admin/cotizacion-plantillas`: codigo en copper, contadores de
  componentes en badge teal.
- `/admin/proveedores`: Select (no `<select>` nativo) con border-glass,
  calificacion con estrella amber, codigo de proveedor en copper.

Pendiente para proxima sub-ola: /admin/proveedores/nuevo y /[id]
(no eran lo mas visible — pasarlas con el batch de /compras).

---

## [0.15.1] — 2026-05-25 — Voltage OS Ola 2B: formularios `nueva/o`

Migra al lenguaje Voltage OS los 5 formularios de creacion:

- `/ot/nueva`: 3 Panels tematicos (contrato+equipo, planificacion, detalles),
  selects encadenados (contrato -> transformadores del cliente).
- `/cotizaciones/nueva`: selector de modo (manual / desde plantilla) con
  botones tone-based copper, plantilla seleccionada como card glass con
  badges de margen/contingencia/IVA/componentes (badge `copper` y `teal`).
- `/contratos/nuevo`: 4 Panels (fechas, monto, plan de pagos, observaciones).
  Tabla del plan de pagos con inputs compactos h-8 border-glass, footer
  con suma vs total (green si coincide, amber si no).
- `/expedientes/nuevo`: 2 Panels (cliente+origen, descripcion).
- `/transformadores/nuevo`: 4 Panels (identificacion, tecnicas, dimensiones,
  ciclo de vida). 18 campos en grids de 2-4 columnas, inputs numericos
  con font-mono.

Patron consistente para todos:

- PageHeader sticky con breadcrumb pill y back ghost.
- FormField helper local: Label font-mono uppercase + asterisco copper.
- Botones: Cancelar ghost glass, accion primaria copper con glow.
- Error inline como callout rose con border + bg.
- Toaster con `theme='dark'`.

Con esto se completa la **Ola 2 (detalle + formularios)**. Quedan para
la Ola 3 las paginas auxiliares: /admin/*, /compras/*, /inventario/*,
/transformadores/* (no nueva), /portal/*, /notificaciones, /perfil,
/login, /register.

---

## [0.15.0] — 2026-05-25 — Voltage OS: identidad visual del panel

Rediseno visual integral del panel de gestion (panel.techtrafo.com) con
una nueva identidad llamada "Voltage OS": dark refinado con acentos
copper + teal, paneles glass con inset-highlight, LEDs operacionales
tomados de la propuesta "Alta Tension", y tipografia display Bricolage
Grotesque + Geist Mono para data.

### Foundation (commits 569097a, 8cefa7f, b4a75b1)

- Tokens CSS de Voltage OS en `globals.css`: paleta dark con primary
  copper (#ff6b35), ring copper, destructive rose; utilities custom
  `bg-glass / border-glass / inset-highlight / glow-copper /
  text-glow-rose / led-green / led-copper` con keyframes propios.
- Mesh sutil de fondo (radial copper sup-izq + teal inf-der).
- Scroll discreto en paneles.
- `tailwind.config.ts`: colores `copper` y `ttteal` con variantes
  soft/deep, fontFamily mapeada a CSS vars, keyframes pulse/ping.
- Fonts Bricolage Grotesque (display) + Geist Mono (data) cargadas
  via `next/font/google` y expuestas como CSS vars.
- Sidebar refactor: brand mark con gradiente copper + glow, search
  bar visual con atajo K, grupos con labels font-mono, LED verde
  pulsante para "Sistema operativo".
- Dashboard ejecutivo (/dashboard): header sticky con gradient title
  (foreground -> copper italic), 6 KPIs con tono dinamico, hero card
  copper, atencion requerida con border-left tonal, modulos tiles.
- Dashboard de planta (/produccion): donut SVG con drop-shadow glow
  por segmento, KPI hero 4 cards, proximas entregas como timeline,
  matriz con badges OT/EXP copper/teal, capacidad/causas/productividad.

### Ola 1 (commit 126bf91)

Componentes shared nuevos en `src/components/`:

- `page-header.tsx`: PageHeader sticky con breadcrumb pill, gradient
  title, meta info opcional, slot de acciones. HeaderActionPrimary
  (copper con glow), HeaderActionGhost (glass) y LiveBadge.
- `panel.tsx`: Panel glass reutilizable + EmptyState + StatCard con
  tonos copper/teal/rose/amber/green y soporte de active/onClick
  para KPIs interactivos (filtros tipo expedientes estancados).
- `live-datetime.tsx`: LiveTime y LiveDate client components que
  resuelven el bug de SSR + UTC. Renderizan en zona horaria
  America/Guayaquil y refrescan cada 30s.

Componentes shadcn actualizados:

- `badge.tsx`: variants Voltage OS, agrega `copper` y `teal`;
  destructive, success y warning como tintes glass (sin green-100
  ni yellow-100 hardcoded); outline con border-glass.
- `select.tsx`: trigger con border-glass + focus border-glass-strong,
  content con backdrop-blur, sin mas `bg-white`/`dark:bg-slate-900`
  hardcoded — todo via tokens semanticos (bg-popover).

6 listas migradas: /clientes, /ot, /expedientes, /cotizaciones,
/contratos, /garantias. Cada una con header sticky Voltage OS,
StatCards tonalizados (copper para activos, rose para alertas,
green para OK, amber para warnings), Panel glass con filtros
compactos h-8, badges Voltage OS, hover sutil, paginacion tonal.

### Ola 2A (este commit)

5 paginas de detalle [id] refactorizadas:

- `/contratos/[id]`: PageHeader, StatCard financiero (monto/pagado/
  saldo/plan), plan de pagos en Panel padded=false con monto pagado
  en green, dialog de cobro mantiene logica.
- `/cotizaciones/[id]`: PageHeader, panel de revision interna con
  tono dinamico por estado (green/teal/rose/glass), historial mono
  colapsable, transiciones con botones tone-based.
- `/ot/[id]`: PageHeader con badges multiples (estado/prioridad/
  atrasada), 3 info cards (responsable con avatar gradient,
  fechas planeadas, fechas reales), transformador como hero card
  con glow copper, pasos con tinte por estado (rechazado=rose,
  en_curso=copper, completado=green/saltado=glass), gate amber
  border-l, action buttons tone-based.
- `/ot/[id]/gantt.tsx`: SVG con colores Voltage OS, drop-shadow
  glow en barras por estado, linea HOY copper.
- `/ot/[id]/evidencias-panel.tsx`: Panel glass, galeria con
  gradient overlay, lightbox sin cambios.
- `/ot/[id]/tiempos-reprocesos-panel.tsx`: 2 panels paralelos
  glass, empty state celebrativo verde para sin reprocesos.
- `/ot/[id]/auditoria-panel.tsx`: Panel colapsable glass, JSON
  diff antes/despues con tintes rose/green.
- `/garantias/[id]`: PageHeader, 4 StatCards de cobertura con
  tono por dias restantes, equipo y origen como hero cards
  clickables.
- `/expedientes/[id]`: PageHeader, info cards (cliente con icons,
  ejecutivo con avatar, fechas con KVLine), DocCard glass.
  Logica interna de hitos preservada sin tocar para no
  introducir bugs (la migrare en una ola posterior con cuidado).

Todas las fechas/horas con `timeZone: "America/Guayaquil"`.

### Pendiente (Ola 2B y Ola 3)

- **Ola 2B**: 5 formularios `nueva/o` (OT, cotizaciones, contratos,
  expedientes, transformadores).
- **Ola 3**: /admin/*, /compras/*, /inventario/*, /transformadores/*,
  /portal/*, /notificaciones, /perfil, /login, /register, mas
  refactor cuidadoso de la seccion de hitos en /expedientes/[id].

### Workflow de backups

A partir de esta version, los backups, snapshots de codigo y READMEs
locales se centralizan en `\\NAS1821\Carpeta Hellius\Documentos
Helius\compañias\Desarrollos\Techtrafo\tech-trafo-commit-backup` con
estructura: `_archive/` (migracion de los backups anteriores), `code/`
(snapshots por commit con timestamp + version), `db-dumps/` (todos los
`.sql.gz` historicos), `README.md` y `CHANGELOG.md` actualizados.

---

## [0.14.0] — 2026-05-24 — Modulo de Compras (Fase 1 + 2)

Cubre el documento de especificacion de Pablo: proveedores, solicitudes internas, ordenes de compra con aprobacion escalonada, recepciones que afectan bodega y costo de items.

### Nuevo schema `compras` (migrations 019 + 020)

- `compras.proveedores` — catalogo con codigo PRV-YYYY-NNNN auto, contacto, condiciones default, calificacion calculada desde recepciones (% entregas a tiempo).
- `compras.item_proveedores` — relacion N:N items↔proveedores con precio vigente, tiempo entrega, moneda, condiciones, `es_principal` (trigger garantiza unicidad por item). Reemplaza al texto `items.proveedor_preferido`. Nueva FK `items.proveedor_principal_id`.
- `compras.solicitudes` + `solicitud_lineas` — SC con codigo SC-YYYY-NNNN. Estados: borrador → enviada → aprobada → convertida_en_oc. Origen: manual / cotizacion / stock_minimo / expediente.
- `compras.ordenes_compra` + `orden_compra_lineas` — OC con codigo OC-YYYY-NNNN. 10 estados (borrador → en_revision → aprobada → enviada → confirmada → recibida_parcial → recibida_total → cerrada). Aprobacion escalonada por monto.
- `compras.recepciones` + `recepcion_lineas` — codigo REC-YYYY-NNNN. Borrador hasta que se confirma. Al confirmar, dispara movimientos_stock + actualizacion de costo.
- `compras.item_proveedor_precios_historial` — trazabilidad de cada cambio de costo_referencia desde recepcion.
- `compras.config_aprobacion` — umbrales monetarios por rol. Seeds iniciales: `≤$500 comprador`, `$500–$5K jefe_compras`, `$5K–$30K gerencia_general`, `>$30K presidencia`.
- `compras.v_stock_consolidado` y `compras.v_items_bajo_reorden` — vistas para alertas de stock.
- Roles nuevos en `core.roles`: `jefe_compras` (aprueba dentro de umbral, recibe), `comprador` (emite SC/OC).

### Backend (5 routers nuevos)

- `routes/proveedores.ts` — CRUD + relacion item↔proveedor + endpoint `GET /buscar-por-item/:itemId` para comparativo.
- `routes/solicitudes-compra.ts` — CRUD borrador + flujo de aprobacion + endpoint `POST /:id/convertir-en-oc` (genera OC borrador con precios resueltos desde `item_proveedores` y aprobador por monto).
- `routes/ordenes-compra.ts` — CRUD + flujo completo (`solicitar-aprobacion / aprobar / rechazar / enviar / confirmar / cancelar`). Aprobacion verifica jerarquia: `presidencia > gerencia_general > gerencia_comercial > jefe_compras > comprador`. Endpoint `GET /config/umbrales` para mostrar la tabla.
- `routes/recepciones.ts` — `POST /` crea recepcion borrador validando saldos. `POST /:id/confirmar` es la operacion clave: por cada linea aprobada con cantidad > 0 inserta `inventario.movimientos_stock` (trigger actualiza stock), acumula `cantidad_recibida` en OC lineas, recalcula `estado_linea` y `estado` de la OC, si `precio_real` difiere actualiza `items.costo_referencia` + escribe `item_proveedor_precios_historial`, y suma contadores del proveedor (entregas a tiempo, no conformidades, calificacion).
- `routes/compras-dashboard.ts` — KPIs, lista de items bajo punto_reorden, generacion masiva de SC desde alertas, historial de precios por item.

### Frontend (10 paginas + 1 helper)

- `lib/compras.ts` — tipos + clientes API de todo el modulo.
- `/admin/proveedores` (listado, `/nuevo`, `/[id]` con tab items que suministra).
- `/compras` — dashboard con 8 KPIs + tabla de alertas de stock con seleccion para generar SC.
- `/compras/solicitudes` (listado + detalle con boton convertir-en-oc).
- `/compras/ordenes-compra` (listado + detalle con todos los botones de transicion + ver recepciones).
- `/compras/recepciones` (listado + detalle con confirmar/anular).
- `/compras/recepciones/nueva?oc=X` — form contra OC con saldos, precio real opcional, resultado de inspeccion por linea y ubicacion bodega destino.
- Sidebar: nuevo bloque "🛒 Compras" + sublinks para los roles con permiso `compras`.

### Integraciones

- `inventario.movimientos_stock.referencia_tipo='compra'` con `referencia_id=OC.id` cierra el ciclo de bodega.
- Cuando se actualiza `items.costo_referencia` desde recepcion, el endpoint `POST /api/cotizaciones/desde-plantilla` (ya existente) usa el costo nuevo automaticamente al re-leer el item — la plantilla queda sincronizada con el costo real de bodega sin intervencion adicional.
- Alertas de stock por `punto_reorden` se exponen via endpoint; el equipo de compras dispara la generacion de SC manualmente desde la UI (no worker autonomo para no spamear SCs).

### Pendiente (futuras iteraciones)

- Form de creacion manual de SC y de OC desde cero (hoy la OC se crea desde SC aprobada; la SC desde cotizacion o alerta de stock).
- Validacion de margen minimo por gerencia general en cotizaciones.
- Portal de proveedor con auth limitada (confirmacion de OC, carga de proforma/factura).
- Calidad / no conformidades con workflow contra proveedor (devolucion, nota de credito).
- PDF de OC para envio formal al proveedor.

---

## [0.12.0] — 2026-05-24 — MEDIUM de auditoria cerrados

### Seguridad — M1, M3, M5, M7

#### M1 — Path traversal + CRLF en evidencias
- `routes/evidencias.ts` GET /file: el check anterior usaba `path.join` que NO resuelve `..`. Ahora `path.resolve()` colapsa el path y se compara contra `uploadRoot + path.sep`. Defensa contra `ruta_archivo` con `..` (que no deberia llegar de cliente, pero sirve como defensa en profundidad si el DB se compromete).
- Content-Disposition: filename ahora striplea `\r`, `\n` y `"`. Sin esto, un titulo malicioso podria inyectar headers (HTTP response splitting).
- multer destination: ahora valida `otId` ANTES de crear el directorio. Antes, si llegaba `:id=../malicioso`, multer creaba el directorio fuera de baseDir (aunque el handler luego rechazaria el request, el directorio quedaba creado).
- DELETE evidencia: mismo check anti-traversal en `unlinkSync`.

#### M3 — Sanitizacion de URLs en morgan
- `server.ts`: formato custom + `morgan.token("sanitized-url")` que redacta valores de query params sospechosos: `token`, `password`, `csrf`, `authorization`, `secret`, `api_key`/`apikey`, `jwt`. Antes el log podia contener secretos si alguien los pasaba en query string. Validado: `?token=SECRETO&password=hunter2&keep=ok` se loggea como `?token=[REDACTED]&password=[REDACTED]&keep=ok`.

#### M5 — GET /admin/roles no expone permisos
- `routes/admin.ts`: el campo `permisos` solo se devuelve si `req.user.es_super_admin === true`. Antes, cualquier usuario autenticado (incluido un cliente del portal) podia listar permisos completos de todos los roles -> facilita planning de escalation. Resto recibe `id, nombre, descripcion, es_super_admin, activo`.

#### M7 — JWT revocation via token_version
- Migration 018: `core.usuarios.token_version INTEGER NOT NULL DEFAULT 1`.
- `auth/jwt.ts`: `JwtPayload` ahora incluye `tv: number`.
- `auth/middleware.ts` `requireAuth`: compara `payload.tv` contra `usuario.token_version` actual en DB. Si difiere -> 401 `token_revoked`.
- `routes/auth.ts`:
  - `login`: firma JWT con `tv: usuario.token_version`.
  - `logout`: ahora requiere auth e incrementa token_version (cierre de sesion GLOBAL, defensa contra cookie robada). Costo: deslogueo de otros dispositivos del mismo user.
  - `change-password`: incrementa token_version al cambiar password.
- `routes/admin.ts` reset password: incrementa token_version del target (forza logout en todos sus dispositivos).
- Validado: login -> tv=1, request OK, logout -> tv=2, mismo cookie -> 401 token_revoked.

### Auditoria de seguridad COMPLETADA
- **0 CRITICAL** abiertos (4 cerrados en v0.10.1).
- **0 HIGH** abiertos (3 cerrados en v0.11.0, H5/H6 mitigados por aislamiento).
- **0 MEDIUM** con riesgo real abiertos (4 cerrados en v0.12.0).
- El sistema esta listo para abrir `portal.techtrafo.com` a clientes externos cuando se quiera.

### Nota operativa
Esta version invalida todas las sesiones existentes al hacer deploy:
- JWTs viejos no tienen `tv` en payload -> middleware responde 401 `token_revoked` en cada request.
- Frontend debe manejar 401 -> redirect a /login (ya esta).
- Usuarios deben re-loguearse despues del deploy.

---

## [0.11.0] — 2026-05-24 — HIGH de auditoria de seguridad cerrados

### Seguridad — H2, H3, H4

#### H4 — Grafana DB readonly user
- Migration 017: rol `grafana_ro` (NOLOGIN inicial, password seteada via env). SELECT-only en schemas `comercial`, `posventa`, `produccion`. Sin acceso a `core` (donde estan `usuarios.password_hash`) ni a `inventario`.
- `infrastructure/docker/grafana/provisioning/datasources/postgres.yaml`: usa `grafana_ro` + `${GRAFANA_DB_PASSWORD}`.
- `docker-compose.yml`: pass-through de `GRAFANA_DB_PASSWORD` al container.
- `.env`: nueva variable `GRAFANA_DB_PASSWORD` (32 chars random).
- Validado: query desde Grafana API funciona, `core.usuarios` da `permission denied for schema core`.

#### H2 — Rate limit en endpoints sensibles
- `backend/src/auth/rate-limit.ts` con `express-rate-limit`. Cuotas por IP:
  - `loginLimiter`: 10/15min (skipSuccessful para no bloquear logins legitimos)
  - `registerLimiter`: 3/1h (no skipSuccessful para evitar creacion masiva)
  - `changePasswordLimiter`: 10/15min
  - `enviarEmailLimiter`: 30/1h
- `server.ts`: `app.set("trust proxy", 1)` para que el rate-limit ratee por X-Forwarded-For real (no por IP del proxy nginx).
- `routes/auth.ts`: limiters aplicados a `/login`, `/register`, `/change-password`.
- `routes/informes-tecnicos.ts`: `enviarEmailLimiter` aplicado a `/:id/enviar-email`.
- Respuesta 429 con `retry_after_seconds` + headers `RateLimit-*` draft-7.
- Validado: 10 logins -> 401, 11vo -> 429. Trust proxy separa buckets por X-Forwarded-For correctamente.

#### H3 — CSRF double-submit cookie
- `backend/src/auth/csrf.ts`: cookie `techtrafo_csrf` (no HttpOnly, 8h, SameSite=Lax, Domain=.techtrafo.com en prod) + middleware `csrfProtection`.
- Patron double-submit: login setea cookie con token random (32 bytes hex). En cada mutation, el frontend lee la cookie y la envia como header `X-CSRF-Token`. Backend valida que coincidan.
- Exenciones: metodos safe (GET/HEAD/OPTIONS), `/api/auth/login|register|logout`, requests sin cookie de sesion (caen en 401 por requireAuth).
- `routes/auth.ts`: `setCsrfCookie` en `/login`, `clearCsrfCookie` en `/logout`.
- `server.ts`: `csrfProtection` montado globalmente despues de `cookieParser`.
- `frontend/src/lib/api.ts`: helper lee `document.cookie` y agrega header `X-CSRF-Token` en mutations.
- Validado: POST sin header -> 403 `csrf_token_invalid`; POST con header valido -> pasa middleware CSRF.
- **Nota**: sesiones activas al deploy quedan sin cookie csrf. Usuarios deben hacer logout+login para que se les setee.

### Nota sobre portal externo
Los 3 HIGH que bloqueaban abrir `portal.techtrafo.com` a clientes externos estan cerrados (junto con los CRITICAL de v0.10.1). Pendientes ahora: MEDIUM/LOW de la auditoria + decision sobre H5 (mosquitto auth) y H6 (grafana port mapping) — ambos mitigados por aislamiento de red. Ver HANDOFF.md seccion 8 para el estado completo.

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
