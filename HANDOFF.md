# TECHTRAFO — Handoff entre sesiones de Claude

> Documento para que una nueva sesión de Claude arranque sin perder contexto sobre el estado del proyecto. Leer COMPLETO antes de hacer cambios. Última actualización: **2026-06-01 · accesos cliente al portal + fix crash API + hardening + correo a mailcow**.

> 📄 **Ver también [`ACCESO-Y-BACKUPS.md`](ACCESO-Y-BACKUPS.md)** — guía de hosts, credenciales, ubicación de backups y recuperación desde PC nueva.

---

## 00. Trabajo desde 2 PCs (escritorio + laptop) — PROTOCOLO

Pablo alterna entre 2 PCs Windows, cada una con su sesión de Claude y su mirror
local del repo. Para que el estado esté SIEMPRE consistente sin importar la PC:

**Mental model**: el trabajo NO vive en las PCs. Vive en GitHub (código + este
HANDOFF), en el server `.23` (sistema + DB + donde se commitea) y en el NAS
(backups + mirror). Las PCs son terminales intercambiables.

**REGLA DE ORO**: commit + push SIEMPRE desde el server `.23`, nunca desde la PC.
Antes de editar, `git pull` en el server. Así da igual qué PC se use.

**Al INICIAR sesión (cualquier PC)** — Claude corre esto primero:
```bash
plink -ssh -pw "techtrafo$" techtrafo@192.168.0.23 \
  'bash /home/techtrafo/techtrafo/scripts/session-start.sh'
```
(hace git fetch+ff a origin/main si el working tree está limpio, avisa si hay
cambios sin commitear, y muestra HEAD + últimos commits + estado de containers).
Después leer este HANDOFF §0 para el estado al cierre anterior.

**Al CERRAR sesión** — Claude:
1. Commit + push DESDE el server `.23` (no desde la PC).
2. Actualizar HANDOFF §0 con lo hecho.
3. `bash scripts/tt-backup.sh` (DB+env+código al NAS + sincroniza mirror).

**El mirror local de cada PC** (`C:\Users\<user>\techtrafo\`) es scratch para
editar. Si se va a editar local antes de pscp, primero alinearlo:
`git fetch origin && git reset --hard origin/main`. NO es la fuente de verdad.

> ⚠️ CRLF: `.gitattributes` fuerza `eol=lf`. Si un script `.sh` editado desde
> Windows llega al server con `\r` (rompe bash), normalizar con `sed -i 's/\r$//'`.

---

## 0. Estado al cierre 2026-06-05 (leer primero)

**Sesión 2026-06-01→05 — accesos de cliente al portal, fix de crash del API, hardening, cutover de correo a mailcow, aprobación de cotización desde el portal, representante legal del cliente, plantillas de contrato, card de "etapas en riesgo (SLA)" en el dashboard, corrección/verificación de infra de hosting y módulo financiero.**

- ✅ **Accesos al portal por cliente** (commit `87a0de5`). En `/clientes` (alta y edición) se crean/gestionan logins rol `cliente` que ven los expedientes del cliente. Backend: 5 endpoints `/api/clientes/:id/accesos[...]` en `clientes.ts`. Frontend: `cliente-accesos.tsx` (gestión en edición) + sección "Acceso al portal" en `cliente-form.tsx` (alta con 1er acceso opcional) + helpers en `lib/clientes.ts`. Multi-acceso por cliente; el admin define la pass; email de login separado del email general del cliente.
- ✅ **Login super_admin restaurado**. La cuenta `pablobaquerizodavila@gmail.com` (rol `presidencia`, `es_super_admin=true`) no podía entrar porque **el proceso del API estaba caído**, NO por la contraseña. Pass reseteada a una temporal → **Pablo debe cambiarla al entrar**. Nota: NO existe un rol literal `super_admin`; es la columna booleana `core.roles.es_super_admin` (solo `presidencia` la tiene en true).
- ✅ **Bug de crash del API corregido** (commit `9a3945a`) — causa raíz del login caído. Dos `select` Prisma pedían `items.codigo` y `lotes.codigo` (campos inexistentes; los reales son `codigo_interno` y `numero_lote`). Sin try/catch, la unhandled rejection MATABA el proceso Node entero → panel inaccesible. Archivos: `cotizacion-plantillas.ts` GET /:id, `recepciones.ts` GET /:id.
- ✅ **Red de seguridad anti-crash** (commit `ee8a608`). `server.ts` ahora tiene `process.on("unhandledRejection")` y `process.on("uncaughtException")` que loguean y mantienen el proceso vivo. Antes no había (solo SIGTERM/SIGINT) y ts-node-dev no revive al hijo, por eso un solo bug tumbaba todo el panel.
- ✅ **Correo migrado de MailPlus a mailcow** (commit `280d318`). El panel envía notificaciones por la VM mailcow `192.168.0.3:465` (SMTPS) autenticando como `noreply@techtrafo.com` (el buzón `techtrafonotif@` NO existe en mailcow). Config SMTP en `/opt/techtrafo/.env` (backup `/opt/techtrafo/.env.bak-mailcow-20260601`). Tras editar ese `.env`: `cd infrastructure/docker && docker compose up -d --force-recreate api grafana` (usar los nombres de SERVICIO `api`/`grafana`, no los `container_name`; `docker restart` NO relee `.env`). Verificado end-to-end: DKIM/SPF/DMARC = pass, llega al inbox de Gmail. Se conecta por IP LAN `.3` y no por `mail.techtrafo.com` porque **mailcow es una VM SOBRE el propio Synology** (`.116` hostea el VMM; la VM es `.3`) y el endpoint público `:465` lo fronta el Synology con su cert `pbaquerizo.synology.me`; al ser IP privada, `services/email.ts` desactiva la verificación de cert. Detalle en memoria `project-mailcow-migration`.
- ✅ Health-check del dashboard: label "SMTP MailPlus (NAS)" → "SMTP mailcow"; comentarios de `email.ts` actualizados.
- ✅ **Aprobación de cotización desde el portal del cliente** (commit `aae6550`). En `/portal/expediente/[id]`, cuando el hito `aprobacion_cliente` está `en_curso` **y** la cotización vinculada está `enviada`, el cliente ve una tarjeta de acción: **Ver PDF** (nivel cliente, sin costos internos), **Aprobar** o **Rechazar** (con motivo). Backend en `portal.ts` (todo `requireClienteId` + doble filtro por `cliente_id`): `GET /portal/cotizacion/:id/pdf`, `POST /portal/cotizacion/:id/aprobar` (`enviada→aprobada` + completa el hito `aprobacion_cliente` + avanza al siguiente hito `contrato` + notifica al ejecutivo vía `notificarResolucionHito`), `POST /portal/cotizacion/:id/rechazar` (`enviada→rechazada` + motivo en `notas_internas`; el hito queda `en_curso` en espera de cotización corregida). Frontend: `lib/portal.ts` (helpers) + `cotizacion-approval.tsx` (nuevo) + gating en `page.tsx`. Reusa `withAppUser`, el `$executeRaw` de `cotizaciones.ts`, el bloque de avance de hito de `expedientes.ts:610-620` y los helpers de `services/pdf`. Verificado: tsc limpio, frontend compila, endpoints 401, y lógica de aprobar probada en transacción con rollback. El rol `cliente` solo tiene permisos `{portal.read, portal_seguimiento}` (no `cotizaciones:*`), por eso los endpoints son portal-scoped.
- ✅ **Fix `/contratos/nuevo`** (commit `d55440b`): acepta `?expediente_id=` además de `?cotizacion=` (resuelve la cotización del expediente). El botón "Emitir contrato" del expediente enlazaba con `expediente_id` y daba error de parámetro.
- ✅ **Representante legal del cliente** (commit `a217fce`, migration 023). 4 columnas en `comercial.clientes` (`rep_legal_nombres/apellidos/cedula/cargo`); cargo = Gerente General/Presidente/Apoderado. **Obligatorios si `tipo_persona='juridica'`** (zod superRefine en create + guard en PATCH leyendo el cliente existente). Sección en `cliente-form.tsx`. Se imprime en el PDF del contrato (`renderContrato`, bloque "Partes del contrato"). Recordar: tras tocar `schema.prisma` correr `docker exec techtrafo-api npx prisma generate`.
- ✅ **Plantillas de contrato** (commits `dafa5fc` backend + `b453a26` frontend, migration 024). Tablas `comercial.contrato_plantillas` + `contrato_plantilla_pagos` (preset en %) + `contratos.clausulas` (snapshot). Cláusulas con variables `{{...}}` → motor `backend/src/services/plantilla-vars.ts`. Ruta `contrato-plantillas.ts` (CRUD, solo roles override). Admin en `/admin/contrato-plantillas` (link en nav, `layout.tsx`). Selector en `/contratos/nuevo` pre-rellena cláusulas + plan de pagos; al crear, el backend renderiza variables con datos reales (incl. rep legal) y **snapshotea** en `contratos.clausulas`; el PDF imprime "Cláusulas y condiciones". Plantilla demo `PLT-CONTRATO-STD` (id 1) sembrada.
- ✅ **Card "Etapas en riesgo por tiempo"** en el dashboard (commit `eeaa1b9`). `GET /api/dashboard/procesos-en-riesgo`: hitos `en_curso` con `>=80%` del SLA consumido (`(now-fecha_inicio)/sla_horas`), sin resolver, orden desc, una fila por etapa. Colores 80-89 amarillo / 90-99 naranja / 100+ rojo. Componente `components/procesos-riesgo-card.tsx`, insertado en `dashboard/page.tsx`.

- 🌐 **Infra de hosting CONFIRMADA 2026-06-01 (por fingerprint de cert TLS):** el edge público de `techtrafo.com/medicvip/siscormed/panel/api` ES la **VM `.7`** (NAT 80/443 → `.7`), tal como dicen §2/§3 — **NO `.23`**. Prueba: el cert que sirve `panel.techtrafo.com` públicamente (Let's Encrypt issuer **E7**, fingerprint `A8:7E…`) es DISTINTO al de `web-nginx` en `.23` (issuer **E8**, `A0:C2…`) → son servidores TLS distintos; el público es `.7`, que proxea panel/api a `.23:3002`/`:3000` y los sitios al NAS. El stack `web-public` de `.23` SÍ es redundante (no recibe el NAT). ⚠️ Durante esta misma sesión llegué a la conclusión ERRÓNEA de que el edge era `.23` (me basé en que `.23` podía servir + un 307 que en realidad venía relayado por `.7`); el test de cert lo desmintió. **Para verificar el edge real siempre comparar el fingerprint del cert público vs el local, no solo el código HTTP.**

- ✅ **Módulo Financiero** (commit `96c5d2e`, migration 025). Menú **Finanzas** para `financiero`/`presidencia`/`gerencia_general`/`gerencia_comercial` (rol `financiero` NUEVO + permiso módulo `finanzas`; `finanzas.read` dado a esos 4). Backend `finanzas.ts` (`requirePermission("finanzas","read")`): `GET /api/finanzas/resumen` (KPIs contratado/cobrado/por_cobrar/cartera_vencida/anticipos + por_tipo + aging + tendencia + pagos-vs-cotizaciones), `/cartera-vencida`, `/cobros`. El dinero sale de `comercial.contratos` (`monto_total`) + `contrato_pagos` (`monto_pagado`/`monto_estipulado`/`estado`); el tipo de orden de `cotizaciones.tipo_servicio` (contrato→cotización). Frontend: `/finanzas` (resumen con 3 gráficos **recharts**) + `/finanzas/cartera` + `/finanzas/cobros`; `components/finanzas/charts.tsx`; nav gateado por `finanzas.read` en `layout.tsx`. **recharts agregado** → ⚠️ para deps de frontend: `docker exec techtrafo-web npm install <pkg>` (el dir está volume-mounted; actualiza package.json/lock del host). Sembrada **data demo**: contratos `CTR-2026-D001/2/3` + cotizaciones `COT-2026-D002/3` (revertir: `DELETE FROM comercial.contrato_pagos WHERE contrato_id IN (SELECT id FROM comercial.contratos WHERE codigo LIKE 'CTR-2026-D00%'); DELETE FROM comercial.contratos WHERE codigo LIKE 'CTR-2026-D00%'; DELETE FROM comercial.cotizaciones WHERE codigo LIKE 'COT-2026-D00%';`). "soporte" no es tipo del sistema (cae en "otro").

- ✅ **Editar / Reversar cobros** (commit `10117ed`) + **fix del PATCH de pagos** (`3bb7259`). En `/contratos/[id]` → Plan de pagos, sobre una cuota con `monto_pagado>0`: **Editar** (ajusta el total pagado/fecha/referencia, recalcula estado) y **Reversar** (vuelve a pendiente, pagado $0, **motivo obligatorio** guardado en observaciones). Mismo permiso `contratos.cobrar`; en contratos vigentes y completados. El resumen de Finanzas lo refleja en vivo. ⚠️ **Bug arreglado:** `PATCH /contratos/:id/pagos/:pagoId` aplicaba **un UPDATE por campo** → al reversar ponía `monto_pagado=0` con `estado` aún `'pagado'` y violaba el CHECK (`estado_pago_inconsistente`). Ahora aplica **todos los campos en UN solo UPDATE** (provisto o valor actual) → el CHECK se evalúa sobre el estado final. (Solo frontend + ese fix backend; sin migración.)

- ✅ **Manual de procesos autoactualizable (Fase 1)** — nuevo menú **Ayuda → Manual de procesos** (`/manual`), visible a todos los usuarios internos. Documenta el **pipeline operativo** (del catálogo de hitos), los procesos transversales (Compras, Cobros, Finanzas, Portal) y la **matriz de roles**. Clave de diseño: **una sola fuente → in-panel + PDF**, separando **narrativa** (`backend/src/services/manual/contenido.ts`, versionada — se edita en el MISMO commit del cambio de proceso) de **datos vivos** (orden de hitos, SLA, quién aprueba, accesos por rol → se leen de la DB en `armar.ts` y se **autoactualizan**). Backend nuevo: `services/manual/{contenido,armar,pdf}.ts` + `routes/manual.ts` (mount en `server.ts`); `GET /api/manual` (JSON) y `GET /api/manual/pdf` (pdfkit, mismo motor de marca que cotizaciones/contratos). Frontend: `lib/manual.ts` + `app/(app)/manual/page.tsx` + nav (grupo "Ayuda") en `layout.tsx`; botón **Descargar PDF** (fetch→blob). Acceso = `requireAuth` (sin permiso específico); **sin migración**. Nota: roles sin narrativa caen a su nombre técnico + accesos derivados (fallback intencional).

- ✅ **Manual — Fase 2: diagrama de flujo + vista "mi rol"**. La página `/manual` ahora muestra un **diagrama de flujo vertical** del proceso operativo (nodos conectados, badges de gate `⟂ aprueba X`, ojo de visibilidad-cliente, y la **bifurcación de producción** por tipo: fabricación / reparación / mantenimiento) + **mini-flujos** horizontales en los procesos transversales. Cada etapa lleva `roles[]` = ejecutores (de la narrativa) **∪ aprobador** (en vivo, de `hito_plantillas.rol_aprobador`). `GET /api/manual` devuelve `miRol {rol_nombre, accesoTotal}` del usuario; la página **resalta en cobre** las etapas del rol logueado y ofrece un toggle **“Solo mi rol”** que filtra/atenúa el resto (oculto si el rol tiene acceso total o no ejecuta etapas). Cambios: `contenido.ts` (+`roles` por paso), `armar.ts` (+`roles`/`ramas`), `routes/manual.ts` (+`miRol`), `lib/manual.ts` + `manual/page.tsx` (diagrama/mini-flujo/toggle). El PDF no cambió (la visual es in-panel).

- ✅ **Manual — Fase 3: detector de drift + skill documentador (#46 COMPLETA)**. Mecanismo para que la narrativa NO quede desactualizada: `backend/src/services/manual/drift.ts` (`detectarDrift()`) compara el sistema real (hitos/roles/permisos activos en la DB) contra la narrativa (`contenido.ts`) y reporta huecos en 5 categorías (hitos/roles sin narrativa, narrativa huérfana, permisos sin etiqueta). Se usa desde: **CLI** `backend/scripts/manual-drift.ts` (`docker exec techtrafo-api npx ts-node --transpile-only /app/scripts/manual-drift.ts`; exit 0=ok, 2=drift) y **`GET /api/manual/drift`** (solo acceso total) → la página `/manual` muestra un **badge ámbar** a los admins cuando hay drift. El **skill `manual-doc`** (user-space `~/.claude/skills/manual-doc/SKILL.md`, NO en el repo) es el runbook: corre el detector, redacta/actualiza la narrativa, verifica (tsc + drift=0) y commitea/pushea/backupea por el protocolo. Hoy: **drift = 0** (todo documentado). Invocá `/manual-doc` (o "actualizá el manual") tras agregar un hito/rol/permiso/proceso. Cambios repo: `services/manual/drift.ts`, `scripts/manual-drift.ts`, `routes/manual.ts` (+`/drift`), `lib/manual.ts` + `manual/page.tsx` (badge).

- ✅ **Manual — gráficos de proceso (PDF + in-panel)**. El **PDF** ahora incluye un **diagrama de flujo dibujado** (`diagramaFlujo()` en `services/manual/pdf.ts`, pdfkit): cajas conectadas por flechas, **rombo ámbar** en los gates (con `aprueba X · SLA · cliente ve/interno`), y la **bifurcación de producción** como nodo azul con 3 ramas (fabricación/reparación/mantenimiento) y bus de re-unión. Reemplaza la tabla "Pipeline completo" del PDF. ⚠️ al paginar, resetear `y = doc.y` (NO una constante) porque `pintarCabecera` deja `doc.y=110` bajo el header. Verificación visual: `pdftoppm -png` en `.23` (tiene poppler+gs) → leer el PNG. **In-panel**: el diagrama se volvió un **flowchart con decisiones** — los gates se dibujan como **rombos** (`rotate-45`) con el lenguaje «¿Aprueba X? Sí → continúa · No → se corrige». Cambios: `services/manual/pdf.ts`, `manual/page.tsx`.

**Pendientes abiertos al cierre:**
- Pablo debe **cambiar su contraseña temporal** del panel.
- Tarea #34: test e2e real (emitir cotización y confirmar arribo del correo), ahora contra mailcow.
- ✅ Portal-aprobación PROBADO por Pablo: aprobó `COT-2026-0001` como `paulette@gmail.com` → la cotización pasó a `aprobada` y el proceso avanzó al hito `contrato` (hoy `en_curso`). Queda lista para probar la emisión de contrato CON plantilla desde el expediente 1.
- **Datos demo a revertir cuando se quiera:** (a) card del dashboard — hito 7 (EXP-2026-0001 "Contrato firmado") tiene `fecha_inicio` backdateado a ~108% para mostrar fila roja → normalizar con `UPDATE comercial.expediente_hitos SET fecha_inicio=NOW() WHERE id=7;`. (b) cliente 2 (telcomag S.A) tiene un representante legal de prueba. (c) plantilla demo `PLT-CONTRATO-STD`.
- El fronting público de mailcow / mover los puertos de correo del Synology a la VM es scope de la **sesión mailcow**, no del panel.

---

## 0b. Estado al cierre 2026-05-29 (sesión anterior)

**Todo operativo tras el cambio de NAS** (ver §2 para la topología nueva):
- ✅ Panel TECHTRAFO + sitios públicos (techtrafo.com, medicvip.org, siscormed.com) con HTTPS Let's Encrypt
- ✅ Email saliente: MailPlus en NAS nuevo con DKIM/SPF/DMARC en 4 dominios. Cuenta `techtrafonotif@techtrafo.com` (pass en `.env` y en ACCESO-Y-BACKUPS.md). `notif-worker SMTP OK`.
- ✅ NAS accesible **solo por LAN** `https://192.168.0.116:5001` (warning self-signed esperado, Pablo eligió aceptarlo — NO exponerlo a dominio)
- ✅ **VM `.7` voip-panel-01 RECONSTRUIDA y VIVA** (Pablo la reconstruyó en otra sesión, 2026-05-28). Es el **reverse proxy central** (nginx 1.18, vhost `/etc/nginx/sites-enabled/netvoice`). Credencial: `pbaquerizo` / `Groundunder8299` (SIN el `$`). Routing real:
  - `techtrafo.com` / `medicvip.org` / `siscormed.com` → proxy_pass → **NAS `192.168.0.116`** (Web Station). El sitio techtrafo vive en `/volume2/web/techtrafo/app.jsx` en el NAS — EDITAR AHÍ, no en `.23`.
  - `panel.techtrafo.com` → proxy → `.23:3002` · `api.techtrafo.com` → proxy → `.23:3000`
  - `eneural.org` / `panel.eneural.org` → Netvoice (frontend en `.7` + Asterisk `192.168.0.161:8088`)
- ⚠️ El stack `web-public` (web-nginx + web-php) que armé en `.23` el 2026-05-27 quedó **REDUNDANTE** — el NAT del router va a `.7`, no a `.23`. No recibe tráfico. Decidir si retirarlo o dejarlo standby.
- ✅ **Netvoice OPERATIVO** otra vez (eneural.org / panel.eneural.org sirven desde `.7`).

**Trabajado en sesión 2026-05-29**:
- ✅ **Migration 022**: columna `nombre_usuario VARCHAR(50) UNIQUE NOT NULL` en `core.usuarios`
- ✅ **Registro de usuarios**: nuevo campo "Nombre de usuario" (mínimo 3 chars, alfanumérico + puntos/guiones) — el email ya no es el identificador visible
- ✅ **Formulario clientes**: quitada sección "Habilitar crédito"; campos dirección fiscal, ciudad, provincia, país, teléfono, email ahora son obligatorios; provincia es dropdown con las 24 provincias de Ecuador; sitio web acepta cualquier dominio (sin validación URL estricta); país default = Ecuador
- ✅ **PC nueva configurada**: plink en `C:\Program Files\PuTTY\plink.exe`, hostkey server `.23` = `ssh-ed25519 255 SHA256:tjQeyEAeaOk0T9XLKPOCKIrdqeQsyrMNsY+inkj8e60`, git credenciales GitHub OK
- ✅ **Fix hitos sin responsable** (commit `de37198`): `puedeActuarEnHito` para reintentar/reabrir/escalar ahora hace fallback a `rol_aprobador_id` cuando `responsable_id = null` (hitos auto-arrancados por el pipeline). Los endpoints `reintentar`, `reabrir-anterior`, `escalar` pasan de requerir `expedientes.write` a `expedientes.aprobar`. Esto desbloquea a `ingeniero_diagnostico` (y otros roles aprobadores) después de rechazar un hito. **Root cause original**: los botones Aprobar/Rechazar son correctos y aparecen cuando el hito está en `en_curso`; el reporte inicial era porque `visita_tecnica` aún no había sido auto-arrancada (faltaba que `gerencia_comercial` aprobara `validacion_credito` primero).

**Pendiente inmediato**:
- ⚠️ **README.md desactualizado** — dice v0.13.0, hay que actualizarlo a v0.14.0 (módulo Compras)
- ⚠️ **Backup automático cron (#45)** — `scripts/backup.sh` existe pero no está configurado como cron en PC `.23`

**Backlog priorizado (15 tareas, ver tracker o fin de este doc)**:
- **P1 cierre**: send-as `notificaciones@` en MailPlus (#31) · versionar stack web-public en git (#32) · CHANGELOG (#33) · test email e2e (#34)
- **P2**: containers n8n/openclaw (#35) · prueba e2e con data real (#42) · umbrales reales de OC (#43) · monitor SSL (#44) · backup automático cron (#45)
- **P3 panel**: form manual SC/OC (#37) · PDF de OC (#38) · margen mínimo (#39) · portal proveedor (#40) · no conformidades (#41)
- **P4**: reconstruir Netvoice (#36)

**Gotchas nuevos aprendidos esta jornada** (ver §9):
- `docker restart` NO recarga `.env` → usar `docker compose up -d --force-recreate <svc>`
- DKIM en Synology MailPlus: la UI engaña, hay que configurar rspamd manualmente (claves en `/var/packages/MailPlus-Server/var/lib/rspamd/dkim/`)
- nodemailer AUTH LOGIN requiere `SMTP_USER` con `@dominio` completo (Python smtplib acepta solo el username)
- Cuando algo "no aparece" en el panel tras un cambio → **primero probar incógnito/Ctrl+Shift+R** (suele ser cache del browser, no bug del server)

**Configuración PC nueva (2026-05-29)**:
- Repo clonado en `C:\Users\pablo\techtrafo\Userspablotechtrafo\` (ahí está el `.git`)
- plink/pscp en `C:\Program Files\PuTTY\` — usar siempre con `-hostkey "ssh-ed25519 255 SHA256:tjQeyEAeaOk0T9XLKPOCKIrdqeQsyrMNsY+inkj8e60"` para el server `.23`
- Credenciales GitHub configuradas en GCM (cuenta `pablobaquerizodavila`)
- Backup destino NAS: `\\Nasr24\homes\pbaquerizo\Repositorios\techtrafo` (robocopy /MIR /XD .git)
- Claude opera vía plink/pscp — NO generar comandos para copiar/pegar

---

## 1. Estado del proyecto en 30 segundos

- **Empresa**: TECHTRAFO — fabricación, reparación y mantenimiento de transformadores eléctricos (150 kVA → 10 MVA), Samborondón, Ecuador.
- **Versión actual**: `v0.14.0`. La sesión `0.13.0 → 0.14.0` cerró el **módulo de Compras (Fase 1 + Fase 2)**:
  - Schema nuevo `compras` con 10 tablas: `proveedores`, `item_proveedores`, `solicitudes`, `solicitud_lineas`, `ordenes_compra`, `orden_compra_lineas`, `recepciones`, `recepcion_lineas`, `item_proveedor_precios_historial`, `config_aprobacion`. Migrations 019 + 020.
  - Roles nuevos: `jefe_compras` y `comprador`.
  - Aprobación escalonada por monto (config_aprobacion seed con 4 niveles: comprador / jefe_compras / gerencia_general / presidencia).
  - 5 routers backend: `/api/proveedores`, `/api/solicitudes-compra`, `/api/ordenes-compra`, `/api/recepciones`, `/api/compras-dashboard`.
  - Flujo SC: borrador → enviada → aprobada → convertida_en_oc. La conversión a OC resuelve precios desde `item_proveedores` y asigna aprobador requerido por monto.
  - Flujo OC: borrador → en_revision → aprobada → enviada → confirmada → recibida_parcial → recibida_total. Aprobación verifica jerarquía del rol del usuario.
  - **Recepción es la pieza clave**: al confirmar, dispara `inventario.movimientos_stock` (trigger ya existente actualiza stock real), acumula cantidades en OC, ajusta estado de OC, y si `precio_real` ≠ `items.costo_referencia` actualiza el item **y** escribe historial (`compras.item_proveedor_precios_historial`).
  - Integración con cotizaciones: `POST /api/cotizaciones/desde-plantilla` ya re-leía `costo_referencia` al emitir → ahora ese costo refleja la última recepción automáticamente.
  - Vistas: `compras.v_stock_consolidado` y `compras.v_items_bajo_reorden`. Endpoint `GET /compras-dashboard/alertas-stock` + acción "generar SC con seleccionados".
  - Frontend: `/compras` dashboard, listados/detalle de SC/OC/recepciones, form `/compras/recepciones/nueva?oc=X` (saldos pre-cargados, precio real opcional, ubicación bodega por línea), `/admin/proveedores` CRUD completo. Sidebar nuevo bloque "🛒 Compras".
  - Decisión: **NO** hay worker autónomo que cree SCs por stock — el equipo dispara desde UI (evita spam).
- **Versión `v0.13.0`** (sesión anterior, cerrada):
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
  - **Validación de margen mínimo** por gerencia general en cotizaciones (rechazo automático si margen < X% configurable)
  - **Form de creación manual de SC y OC desde cero** — hoy SC nace de cotización/alerta y OC nace de SC. A veces puede ser útil crear directo.
  - **PDF de OC** para envío formal al proveedor (mismo motor que cotizaciones/contratos).
  - **Portal de proveedor** con auth limitada (confirmación de OC, carga de proforma/factura, actualización de estado de despacho).
  - **Calidad / no conformidades** con workflow contra proveedor (devolución, nota de crédito, reposición).
  - Definir umbrales de aprobación reales con Pablo (los seeds son tentativos: $500/$5K/$30K).
  - Iterar campos del form de visita técnica e informe técnico con data real
- **Repo**: https://github.com/pablobaquerizodavila/techtrafo (branch `main`)

## 2. Topología real (actualizada 2026-05-27 tras cambio de NAS)

> ⚠️ **HISTÓRICO 2026-05-27 → 2026-05-29 (corregido)**: se cambió el NAS Synology y temporalmente la VM `.7` quedó caída. Durante esa ventana se armó un stack reverse-proxy de respaldo en `.23` (`web-public`). PERO Pablo **reconstruyó la VM `.7` voip-panel-01** en otra sesión (2026-05-28) y ESA es la que está en producción ahora: es el reverse proxy central que recibe el NAT del router y enruta a NAS/`.23`/Netvoice (ver §0). El stack `web-public` de `.23` quedó redundante. La VM `.7` ya NO está en el NAS viejo — corre en hardware independiente. **Netvoice está operativo de nuevo.**

### Red física — DOS routers en serie

```
Internet · ISP CNT
       │
       ▼
ONT Huawei EG8145V5
  Admin: http://192.168.100.1    ← acceso solo desde LAN .100/24
  WAN: IP pública 186.101.238.135
  LAN: 192.168.100.0/24
  Forward → 192.168.100.89 (el TP-Link)
       │
       ▼
Router TP-Link AX6600 Wi-Fi 6   ← ROUTER REAL DE LA RED
  Admin: http://192.168.0.1      ← acá viven las reglas de Port Forwarding
  WAN: 192.168.100.89 (del Huawei)
  LAN: 192.168.0.0/24
  Gateway interno: 192.168.0.1
```

### Port Forwarding del TP-Link (estado actual)

| Service Name | Puerto ext | Destino LAN | Estado |
|---|---|---|---|
| HTTP | 80 | `192.168.0.7` (VM reverse proxy) | ✅ OK — todo entra por `.7` |
| HTTPS | 443 | `192.168.0.7` | ✅ OK — `.7` enruta a NAS/`.23`/Netvoice |
| MailPlus-SMTP | 25 | `192.168.0.116` (NAS) | ✅ OK |
| MailPlus-IMAP | 993 | `192.168.0.116` | ✅ OK |
| MailPlus-STARTTLS | 587 | `192.168.0.116` | ✅ OK |
| MailPlus-SMTPS | 465 | `192.168.0.116` | ✅ OK |
| Netvoice-SIP | 5060/UDP | `192.168.0.161` (Asterisk) | ✅ Netvoice operativo |

> ⚠️ El NAT 80/443 va a la **VM `.7`** (nginx reverse proxy central), NO a `.23` como decía la versión anterior de este doc. `.7` hace el fan-out a NAS (sitios), `.23` (panel/api) y Netvoice. El stack `web-public` de `.23` quedó redundante.

### Servicios públicos

```
Internet → Router TP-Link → PC Ubuntu 192.168.0.23
                              └─ web-nginx (puerto 80+443, SSL Let's Encrypt)
                                  ├─ techtrafo.com / www → /home/techtrafo/sites/techtrafo
                                  ├─ medicvip.org / www  → /home/techtrafo/sites/medicvip (PHP 8.2)
                                  ├─ siscormed.com / www → /home/techtrafo/sites/siscormed (HTML + PHP /api)
                                  ├─ panel.techtrafo.com  → proxy techtrafo-web:3002
                                  ├─ api.techtrafo.com    → proxy techtrafo-api:3000
                                  └─ portal.techtrafo.com → proxy techtrafo-web:3002
                              └─ web-php (php-fpm 8.2)

3 certificados Let's Encrypt (vencen 2026-08-26, renueva cron diario 03:00):
  - techtrafo.com (SAN: techtrafo.com, www, panel, api, portal)
  - medicvip.org (SAN: medicvip.org, www)
  - siscormed.com (SAN: siscormed.com, www)

mediconline.com NO está en esta infra — apunta a hosting externo (67.225.160.133).
```

### NAS Synology nuevo (hostname `Nasr24`)

```
192.168.0.116 (eth0) + 192.168.0.88 (eth1)  ← 2 NICs en LAN, llegan al mismo NAS
DSM 7.3.2-86009 (instalación 2026-03-17)

  ├─ /volume1/  (7 TB · ContainerManager appdata + homes + photos)
  ├─ /volume2/  (3.5 TB · web/ con los sitios + MailPlus)
  │   └─ /volume2/web/   ← ORIGEN de los sitios (mirror RO, no producción)
  │        ├─ techtrafo/    (5.0 MB · landing JSX+CSS+assets)
  │        ├─ medicvip/     (424 KB · HTML + PHP + uploads)
  │        ├─ siscormed/    (328 KB · HTML + PHP /api)
  │        └─ mediconline/  (372 KB · backup local, sitio real está afuera)
  └─ /volume3/  (3.5 TB · surveillance / backups)

  ├─ MailPlus Server      ⚠️ Paquete instalado pero SIN CONFIGURAR (dominios + DKIM perdidos)
  ├─ Web Station          ⚠️ Instalado pero virgen (vhosts perdidos · no se usa actualmente)
  ├─ Container Manager    ⚠️ Estado de containers n8n/openclaw pendiente verificar
  └─ Virtualization Mgr   ⚠️ Sin VMs (las que había se perdieron con el NAS viejo)
```

### PC Ubuntu 192.168.0.23 (Docker Compose stacks)

```
Stack original: /home/techtrafo/techtrafo/infrastructure/docker/
  ├─ techtrafo-api        Express+TS+Prisma  :3000
  ├─ techtrafo-web        Next.js 15 App Router :3002
  ├─ techtrafo-postgres   PostgreSQL 16.14 :5432 (127.0.0.1)
  ├─ techtrafo-redis      :6379 (127.0.0.1)
  ├─ techtrafo-grafana    :3001
  ├─ techtrafo-influxdb   :8086 (127.0.0.1)
  ├─ techtrafo-mosquitto  :1883 interno
  ├─ techtrafo-simulador  perfil "simulador" demo
  └─ techtrafo-nginx      proxy interno health en :8080

Stack web público NUEVO: /home/techtrafo/web-public/    ← agregado 2026-05-27
  ├─ web-nginx            :80 + :443 (frontfacing del internet)
  └─ web-php              :9000 (PHP 8.2-fpm para sitios)
  Comparten red docker `techtrafo_net` para proxy_pass a techtrafo-api/web.

Auto-renovación SSL: cron @ 03:00 /home/techtrafo/web-public/certbot-renew.sh
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
| `192.168.0.7` (VM nginx, voip-panel-01) | `pbaquerizo` | `Groundunder8299` ⚠️ SIN `$` | ✅ **VIVA — reverse proxy central** + Netvoice. Reconstruida 2026-05-28. vhost en `/etc/nginx/sites-enabled/netvoice` (todos los dominios). El sitio `techtrafo.com` lo proxea al NAS (`/volume2/web/techtrafo/` — EDITAR AHÍ). |
| `192.168.0.116` o `.88` (NAS Synology nuevo, hostname `Nasr24`) | `pbaquerizo` | `Groundunder8299*` | Admin DSM (`:5001` HTTPS), SSH, MailPlus. ⚠️ password termina con `*` no `$`. Sudo requiere password. `synowebapi` / `synopkg` requieren path absoluto `/usr/syno/bin/` |
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
- **NUNCA usar `TRUNCATE ... CASCADE` en tablas raíz como `comercial.clientes` o `core.usuarios`**: las FKs `creado_por`/`actualizado_por` de la mayoría de las tablas a `core.usuarios` están con `ON DELETE CASCADE`, así que un TRUNCATE cascadea por toda la cadena y vacía el DB completo (items, ubicaciones, plantillas, hitos, roles, proveedores, todo). Para wipes acotados usar `DELETE FROM` en orden topológico — DELETE respeta los `ON DELETE` específicos sin propagar de más. Patrón seguro:
  ```sql
  BEGIN;
    DELETE FROM core.usuarios WHERE cliente_id IS NOT NULL;
    DELETE FROM produccion.transformadores;
    DELETE FROM comercial.clientes;
    ALTER SEQUENCE comercial.clientes_id_seq RESTART WITH 1;
  COMMIT;
  ```
  Quemado en sesión 2026-05-26: TRUNCATE clientes CASCADE vació todo el DB, hubo que restaurar desde backup pre-wipe.

## 10. Cómo arrancar la nueva sesión

En la nueva sesión de Claude, pasa este prompt inicial:

> Soy Pablo Baquerizo, dueño de TECHTRAFO (fab/rep/mant de transformadores en Samborondón).
> Antes de hacer cualquier cosa, lee `C:\Users\Pablo B\techtrafo\HANDOFF.md` completo — ahí está el contexto del proyecto, credenciales SSH para operar, convenciones del repo y backlog pendiente.
> Operá SIEMPRE vía plink/pscp sobre el server `techtrafo@192.168.0.23` (no me pidas copiar comandos). Cuando termines de leer el handoff, decime un resumen corto del estado y preguntame qué seguimos.

La nueva sesión va a leer este archivo, va a entender todo, y vamos a poder retomar donde dejamos.
