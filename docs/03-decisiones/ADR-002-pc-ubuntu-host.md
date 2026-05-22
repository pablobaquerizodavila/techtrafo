# ADR-002 - PC Ubuntu como host del backend

> Estado: Aceptada
> Fecha: 2026-05-22
> Decisor: Pablo Baquerizo Davila

---

## Contexto

Se evaluaron tres opciones para hospedar la infraestructura:

1. NAS Synology dedicado (DS1621+ con RAM ampliada a 32 GB)
2. PC Windows dedicado (Windows + Hyper-V)
3. PC Ubuntu dedicado (Ubuntu + Docker Compose)

---

## Decision

**PC Ubuntu como host del backend con Docker Compose.**

El PC Ubuntu (192.168.0.23) ya estaba disponible. Stack completo corre como contenedores Docker administrados con Docker Compose.

---

## Razones

1. **Recursos disponibles** - el PC ya existe (14 GB RAM, NVMe 468 GB)
2. **Familiaridad** - el usuario conoce Ubuntu
3. **Eficiencia** - contenedores Docker consumen 10x menos RAM que VMs
4. **Stack nativo Linux** - todos los servicios son nativos Linux
5. **Cero licencias** - Ubuntu + Docker sin costo
6. **Estandar industrial** - Docker Compose es lo que usan todas las empresas
7. **Portabilidad** - la configuracion funciona identica en cloud, VPS o cualquier Linux

---

## Por que NO se eligio NAS Synology consolidado

- Requeria ampliacion de RAM (4 GB -> 32 GB) con costo y logistica
- Synology VMM impone limites que Docker no tiene
- Mezclar web publica + 6 VMs concentra demasiado riesgo

## Por que NO se eligio Windows + Hyper-V

- Windows 10/11 Pro no esta pensado para servidor 24/7
- Windows Server requiere licencia costosa
- VMs Hyper-V consumen mas recursos que Docker
- Stack es Linux-native, Windows agrega complejidad innecesaria

---

## Servicios Docker

| Servicio | Imagen | Puerto |
|---|---|---|
| postgres | postgres:16-alpine | 5432 |
| redis | redis:7-alpine | 6379 |
| grafana | grafana/grafana-oss | 3001 |
| nginx | nginx:alpine | 8080 |
| minio | minio/minio (pendiente) | 9000/9001 |
| influxdb | influxdb:2.7 (apagado) | 8086 |
| mosquitto | eclipse-mosquitto:2 (apagado) | 1883 |

---

## Validado en produccion

- Fecha: 2026-05-22
- Docker Engine: 29.5.2
- Docker Compose: v5.1.4
- 4 contenedores activos
