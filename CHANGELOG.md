# Changelog

Todos los cambios notables de este proyecto se documentan aqui.

El formato sigue Keep a Changelog y este proyecto adhiere a Semantic Versioning.

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
