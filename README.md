# TECHTRAFO — Sistema Integral de Gestion

> Plataforma de gestion empresarial para TECHTRAFO, empresa dedicada a la reparacion, mantenimiento, ensamblaje y fabricacion de transformadores electricos de 500 kVA hasta 3 MVA.

![Estado](https://img.shields.io/badge/estado-fase%202%20completada-green)
![Version](https://img.shields.io/badge/version-0.2.0-blue)
![Licencia](https://img.shields.io/badge/licencia-privada-red)

---

## Que es este proyecto

Sistema digital integral que orquesta toda la operacion de TECHTRAFO desde el primer contacto comercial hasta la entrega final del transformador y su posventa.

Cubre:
- Gestion comercial — captacion, cotizacion, contrato, facturacion
- Produccion tecnica — flujo real de planta con 28 pasos y 5 gates de calidad
- Bodega automatizada — stock de materia prima con reorden inteligente
- Caja flexible — planes de pago 100% configurables por contrato
- KPIs en tiempo real — dashboards Grafana para gerencia, comercial y planta
- Garantias y posventa — trazabilidad completa hasta 3 anos

## Arquitectura

Sistema distribuido en dos hosts dentro de la LAN de TECHTRAFO:

| Host | IP | Rol |
|---|---|---|
| NAS Synology DS1621+ | 192.168.0.164 | Web publica + frontend + proxy reverso |
| PC Ubuntu host | 192.168.0.23 | Backend, base de datos, Grafana, servicios internos |

### Dominios

- techtrafo.com — web corporativa publica (NAS)
- panel.techtrafo.com — frontend del sistema (NAS)
- api.techtrafo.com — backend API (PC Ubuntu, proxiado por NAS)

### Stack tecnologico

- Backend: Node.js + Express + PostgreSQL 16 + Redis
- Frontend: Next.js
- Monitorizacion: Grafana OSS
- Storage: MinIO (S3-compatible)
- Series temporales: InfluxDB (provisionado para SCADA futuro)
- Orquestacion: Docker Compose
- Proxy reverso + SSL: nginx en DSM con Let's Encrypt

## Estructura del repositorio

\`\`\`
techtrafo/
├── README.md
├── CHANGELOG.md
├── .gitignore
├── docs/                    # Documentacion de procesos (FASE 1)
│   ├── 00-vision-general/
│   ├── 01-procesos/
│   ├── 02-modulos/
│   ├── 03-decisiones/
│   └── diagramas/
├── infrastructure/          # Docker, nginx, scripts (FASE 2)
│   ├── docker/
│   ├── nginx/
│   └── scripts/
├── database/                # Migraciones SQL y seeds
│   ├── migrations/
│   └── seeds/
├── backend/                 # API REST Node.js (por desarrollar)
└── frontend/                # Panel Next.js (por desarrollar)
\`\`\`

## Estado del proyecto

### FASE 1 — Diseno de procesos (COMPLETADA)
- Arquitectura tecnica definida
- Flujo comercial validado (17 pasos en 6 etapas)
- Flujo de produccion real (28 pasos, 5 gates)
- Modulos: caja flexible, bodega automatizada, cotizador
- Centro de configuracion con todos los parametros editables

### FASE 2 — Infraestructura (COMPLETADA)
- Docker Engine 29.5.2 + Docker Compose v5.1.4 instalados
- Stack base operativo: postgres + redis + grafana + nginx
- PostgreSQL 16.14 con schema core inicial
- 12 roles base + 17 parametros de configuracion
- Grafana conectado a PostgreSQL como datasource validado

### FASE 3 — Desarrollo (PENDIENTE)
- API REST del backend
- Frontend del panel administrativo
- Integracion con Grafana
- Implementacion de checklists digitales

## Contacto

Propietario: Pablo Baquerizo Davila
Empresa: TECHTRAFO
