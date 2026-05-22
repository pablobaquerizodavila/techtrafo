# ADR-003 - Frontend en NAS + Backend en PC Ubuntu

> Estado: Aceptada
> Fecha: 2026-05-22
> Decisor: Pablo Baquerizo Davila

---

## Contexto

Definir donde alojar:
1. Web corporativa techtrafo.com (ya funcionando en NAS)
2. Frontend del sistema TECHTRAFO (nuevo)

Opciones evaluadas:
- Todo en el PC Ubuntu
- Todo en el NAS
- Separados: frontend en NAS + backend en PC

---

## Decision

Frontend en NAS Synology + Backend en PC Ubuntu.

### Topologia

| Dominio | Host | Proposito |
|---|---|---|
| techtrafo.com | NAS | Web corporativa (sin cambios) |
| panel.techtrafo.com | NAS | Frontend del sistema (nuevo) |
| api.techtrafo.com | NAS proxy a PC Ubuntu | Backend API REST |

---

## Razones

### Seguridad por capas
- PC Ubuntu nunca se expone a internet directamente
- Solo el NAS recibe trafico externo
- Datos sensibles detras de dos firewalls

### Aprovechamiento de infraestructura
- NAS ya tiene Let's Encrypt funcionando
- NAS ya tiene reverse proxy nativo
- Web techtrafo.com ya sirve desde ahi

### Separacion de responsabilidades
- NAS: capa publica (archivos estaticos, SSL, proxy)
- PC Ubuntu: capa privada (logica de negocio, BD, Grafana)

### Resiliencia
- Si el PC se cae, techtrafo.com sigue funcionando
- Si el NAS se cae, PC sigue procesando localmente
- Backups cruzados naturales

---

## Flujo de una peticion tipica

1. Usuario abre panel.techtrafo.com
2. DNS resuelve a IP publica de TECHTRAFO
3. Router hace port forward 443 al NAS
4. NAS sirve el frontend estatico
5. Frontend hace peticion a api.techtrafo.com/clientes
6. NAS reverse proxy reenvia a 192.168.0.23:3000
7. Backend consulta PostgreSQL
8. Respuesta vuelve por el mismo camino

---

## Implementacion del frontend en NAS

Opcion A (recomendado): Sitio estatico
- Next.js compilado con next export
- HTML/CSS/JS servidos por Web Station
- Mas rapido, menos consumo

Opcion B: Contenedor Docker
- Frontend corre en Container Manager del NAS
- Mas flexible si requiere SSR

---

## Reverse proxy en NAS (DSM Application Portal)

- techtrafo.com           -> localhost:80 (Web Station)
- panel.techtrafo.com     -> carpeta estatica en el NAS
- api.techtrafo.com       -> 192.168.0.23:3000 (PC Ubuntu)

---

## Decision sobre el correo

El correo @techtrafo.com no se usa actualmente, queda fuera del alcance.
