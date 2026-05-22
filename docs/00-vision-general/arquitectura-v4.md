# Arquitectura tecnica v4 - TECHTRAFO

> Estado: consolidada y aprobada
> Ultima revision: mayo 2026
> Version: 4.0

---

## 1. Vision general

Sistema de gestion integral para TECHTRAFO desplegado en arquitectura hibrida sobre dos hosts dentro de la LAN corporativa, con separacion clara entre capa publica (NAS) y capa privada de procesamiento (PC Ubuntu).

### Principios de diseno

1. Seguridad por capas: el PC con datos sensibles nunca se expone a internet
2. Aprovechamiento de infraestructura existente: el NAS sigue cumpliendo su rol actual
3. Escalabilidad gradual: Grafana SCADA y sensores pueden agregarse sin redisenar
4. Configuracion sin codigo: todos los parametros de negocio se editan desde panel admin
5. Trazabilidad total: cada accion queda auditada con usuario, fecha y motivo

---

## 2. Topologia fisica

| Host | IP | Rol |
|---|---|---|
| NAS Synology DS1621+ | 192.168.0.164 | Web publica + frontend + proxy reverso + backups |
| PC Ubuntu host | 192.168.0.23 | Backend, base de datos, Grafana, servicios internos |

### Stack tecnologico

- Backend: Node.js + Express + PostgreSQL 16 + Redis
- Frontend: Next.js (exportado estatico o contenedor)
- Monitorizacion: Grafana OSS sobre PostgreSQL
- Storage: MinIO (S3-compatible) para fotos y documentos
- Series temporales: InfluxDB (provisionado para SCADA futuro)
- Mensajeria: Mosquitto MQTT (provisionado para sensores futuros)
- Orquestacion: Docker Compose
- Proxy reverso + SSL: nginx en DSM con Let's Encrypt

---

## 3. Division de responsabilidades

### NAS Synology DS1621+ (192.168.0.164)

- Web corporativa techtrafo.com (Web Station)
- Frontend panel.techtrafo.com (Next.js estatico)
- Reverse proxy con SSL (Application Portal nativo + Let's Encrypt)
- Unico punto de entrada externo (DSM Firewall + port forward del router)
- Almacenamiento de backups del PC (rsync sobre SSH)

### PC Ubuntu host (192.168.0.23)

- API REST y logica de negocio (Node.js + Express)
- Base de datos relacional (PostgreSQL 16)
- Cache, sesiones y colas (Redis 7)
- Dashboards de KPIs (Grafana OSS)
- Storage de fotos y documentos (MinIO)
- Series temporales para SCADA futuro (InfluxDB, apagado por defecto)
- Mensajeria de sensores futura (Mosquitto MQTT, apagado por defecto)

---

## 4. Flujo de trafico

### Peticion externa (usuario en internet)

1. Usuario abre panel.techtrafo.com
2. DNS resuelve a IP publica de TECHTRAFO
3. Router hace port forward 443 al NAS
4. Reverse proxy del NAS lee el host header
5. Sirve el frontend desde Web Station del NAS
6. El frontend hace peticiones a api.techtrafo.com
7. Reverse proxy reenvia al PC Ubuntu puerto 3000
8. Backend procesa y consulta PostgreSQL
9. Respuesta vuelve por el mismo camino

---

## 5. Capacidad y dimensionamiento

### Requerimientos PC Ubuntu

| Recurso | Validado en produccion |
|---|---|
| CPU | x86 con virtualizacion |
| RAM | 14 GB (recomendado 32 GB) |
| Disco SSD | 468 GB NVMe |
| Red | Gigabit |

---

## 6. Seguridad

### Capas de proteccion

1. Firewall del router: solo abre 80/443 hacia el NAS
2. Firewall del NAS (DSM): bloquea todo excepto 80/443/22
3. Reverse proxy del NAS: valida hosts permitidos
4. Firewall del PC Ubuntu (ufw): solo conexiones desde NAS
5. Red Docker interna: servicios se comunican por nombre, no expuestos
6. Volumenes con permisos restrictivos por UID

### Gestion de secretos

- Variables sensibles en archivo .env fuera del repositorio
- Repositorio incluye .env.example con plantilla sin valores
- Permisos chmod 600 en el archivo .env

---

## 7. Backups y recuperacion

### Estrategia 3-2-1

- 3 copias de los datos (produccion + backup local + backup NAS)
- 2 medios diferentes (SSD del PC + HDD del NAS)
- 1 copia fuera del sitio (pendiente definir)

---

## 8. Decisiones relacionadas

Ver carpeta docs/03-decisiones/ para los ADR:

- ADR-001: Grafana en modo Opcion B
- ADR-002: PC Ubuntu como host del backend
- ADR-003: Frontend en NAS + Backend en PC
