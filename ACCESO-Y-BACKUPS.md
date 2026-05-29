# TECHTRAFO — Acceso y Backups · Guía de recuperación desde PC nueva

> Documento para retomar la operación desde una computadora nueva (o tras
> reinstalar Windows). Contiene hosts, credenciales, ubicación de backups y
> procedimientos de restauración. **Repo privado** — no publicar.
> Última actualización: **2026-05-27**.

---

## 1. Mapa de hosts e IPs

| Host | IP | Qué corre | Acceso admin |
|---|---|---|---|
| **PC Ubuntu (Docker host)** | `192.168.0.23` | Panel TECHTRAFO (api/web/postgres/redis/grafana/influx) + stack web público (nginx + php-fpm) | SSH puerto 22 |
| **NAS Synology `Nasr24`** | `192.168.0.116` (eth0) + `192.168.0.88` (eth1) | MailPlus (email), Container Manager, archivos | DSM web `https://192.168.0.116:5001` + SSH 22 |
| **Router TP-Link AX6600** | `192.168.0.1` | Router LAN + Port Forwarding (NAT real) | Web `http://192.168.0.1` |
| **ONT Huawei EG8145V5** | `192.168.100.1` | Modem ISP CNT (reenvía al TP-Link `192.168.100.89`) | Web `http://192.168.100.1` |
| ~~VM nginx voip-panel-01~~ | ~~`192.168.0.7`~~ | ❌ PERDIDA (Netvoice, vivía en VMM del NAS viejo) | — |

**IP pública**: `186.101.238.135` (CNT, estática). DNS en **GoDaddy** (ns43/ns44.domaincontrol.com).

---

## 2. Credenciales SSH y servicios

| Servicio | Usuario | Password | Notas |
|---|---|---|---|
| PC `.23` (Docker host) | `techtrafo` | `techtrafo$` | sudo con password. Todo el panel + web público corre acá. |
| NAS `.116` / `.88` | `pbaquerizo` | `Groundunder8299*` | ⚠️ termina en `*` (no `$`). DSM admin + SSH. `synowebapi`/`synopkg` requieren path `/usr/syno/bin/`. |
| PostgreSQL (container) | `techtrafo_admin` | `Cambiar_Esta_Password_Segura_2026` | Solo accesible dentro de `techtrafo-postgres` o `127.0.0.1:5432` en `.23`. |
| SMTP MailPlus | `techtrafonotif@techtrafo.com` | `xr6zs4QiYYV44mcy6ap8` | Cuenta de notificaciones del panel. Host `192.168.0.116:465` SMTPS. |
| Usuario admin panel | `pablobaquerizodavila@gmail.com` | (Pablo lo recuerda) | Login web del panel TECHTRAFO. |
| GitHub repo | — | (token/credencial de Pablo) | https://github.com/pablobaquerizodavila/techtrafo |

> Las host keys SSH cambiaron tras el cambio de NAS. La primera vez que conectes
> desde una PC nueva, plink/ssh te pedirá aceptar la nueva clave — es esperado.

---

## 3. Conectarse desde una PC nueva (Windows)

### Opción A — PuTTY (plink/pscp), como se usó en estas sesiones
1. Descargar PuTTY: https://www.putty.org → instala `plink.exe` y `pscp.exe` en PATH.
2. Conexión a la PC Docker:
   ```
   plink -ssh -pw "techtrafo$" techtrafo@192.168.0.23
   ```
   (la primera vez acepta la host key con `y`)
3. Conexión al NAS:
   ```
   plink -ssh -pw "Groundunder8299*" pbaquerizo@192.168.0.116
   ```
4. Copiar archivos:
   ```
   pscp -pw "techtrafo$" "archivo-local" techtrafo@192.168.0.23:/ruta/destino
   pscp -pw "techtrafo$" techtrafo@192.168.0.23:/ruta/origen "destino-local"
   ```

### Opción B — OpenSSH nativo de Windows (PowerShell)
```powershell
ssh techtrafo@192.168.0.23
scp archivo techtrafo@192.168.0.23:/ruta/
```

### Clonar el repo en la PC nueva
```
git clone https://github.com/pablobaquerizodavila/techtrafo.git "C:\Users\<tu-user>\techtrafo"
```
El HANDOFF.md y este documento viven dentro del repo.

---

## 4. Ubicación de los BACKUPS

### 4.1 Backups del panel TECHTRAFO (DB + .env)
**Ruta**: `/home/techtrafo/backups/` en la PC `.23`

Cada backup es un par de archivos con timestamp:
- `techtrafo-db-YYYYMMDD-HHMMSS.sql.gz` → dump completo de PostgreSQL (gzip)
- `techtrafo-env-YYYYMMDD-HHMMSS.env` → snapshot del `.env` del panel (credenciales)

Son **manuales** (se generan al cerrar cada hito). Ver §6 para automatizarlos.

Backup destacado: `techtrafo-db-20260526-151950-pre-wipe-clientes.sql.gz` (antes del wipe de clientes ficticios).

### 4.2 Código fuente
- **Panel TECHTRAFO**: repo git en `/home/techtrafo/techtrafo/` (PC `.23`) ↔ GitHub `pablobaquerizodavila/techtrafo` ↔ mirror local `C:\Users\Pablo B\techtrafo\`
- **Stack web público**: `/home/techtrafo/web-public/` en PC `.23` — ⚠️ **NO versionado todavía** (tarea pendiente). Contiene docker-compose, nginx configs, certbot-renew.sh.
- **Sitios web**: `/home/techtrafo/sites/{techtrafo,medicvip,siscormed}/` en PC `.23` (rsync del NAS).

### 4.3 Certificados SSL (Let's Encrypt)
**Ruta**: `/home/techtrafo/web-public/certbot/conf/live/techtrafo.com/` en PC `.23`
- `fullchain.pem`, `privkey.pem`
- 3 certs: techtrafo.com (SAN: www/panel/api/portal), medicvip.org, siscormed.com
- Renovación automática: cron diario 03:00 (`/home/techtrafo/web-public/certbot-renew.sh`)

### 4.4 Claves DKIM (email)
**Ruta**: `/var/packages/MailPlus-Server/var/lib/rspamd/dkim/` en el NAS `.116`
- `<dominio>.default.key` (privada) + `<dominio>.default.dns.txt` (registro DNS público)
- 4 dominios: techtrafo.com, medicvip.org, siscormed.com, eneural.org

### 4.5 Data del NAS (mailboxes, archivos)
- Mailboxes MailPlus: `/volume2/MailPlus/@local/` en el NAS
- Sitios web origen: `/volume2/web/` en el NAS
- Backups Synology nativos (Hyper Backup / Active Backup): revisar en DSM si hay configurados

---

## 5. Procedimientos de restauración

### 5.1 Restaurar la base de datos del panel
```bash
# Desde la PC .23 (o vía plink):
gunzip -c /home/techtrafo/backups/techtrafo-db-<STAMP>.sql.gz \
  | docker exec -i techtrafo-postgres psql -U techtrafo_admin -d techtrafo
```

### 5.2 Restaurar el .env del panel
```bash
sudo cp /home/techtrafo/backups/techtrafo-env-<STAMP>.env /opt/techtrafo/.env
cd /home/techtrafo/techtrafo/infrastructure/docker
docker compose up -d --force-recreate api   # IMPORTANTE: restart NO recarga .env, hay que recrear
```

### 5.3 Levantar el panel desde cero (PC nueva como host)
```bash
git clone https://github.com/pablobaquerizodavila/techtrafo.git
cd techtrafo/infrastructure/docker
# colocar /opt/techtrafo/.env (desde backup) y /opt/techtrafo/postgres-data
docker compose up -d
# restaurar DB (§5.1)
```

### 5.4 Levantar el stack web público
```bash
# /home/techtrafo/web-public/ no está en git todavía — copiarlo del backup
# o de la PC actual. Luego:
cd /home/techtrafo/web-public
docker compose up -d
docker exec web-nginx nginx -s reload
```

---

## 6. Backup manual ad-hoc (comando completo)

Para generar un backup ahora mismo (DB + env) desde plink:
```bash
plink -ssh -pw "techtrafo$" techtrafo@192.168.0.23 \
  'cd /home/techtrafo/backups && STAMP=$(date +%Y%m%d-%H%M%S) && \
   docker exec techtrafo-postgres pg_dump -U techtrafo_admin --clean --if-exists --no-owner techtrafo | gzip > techtrafo-db-${STAMP}.sql.gz && \
   cp /opt/techtrafo/.env techtrafo-env-${STAMP}.env'
```

### Pendiente: automatizar (tarea #45)
Hoy los backups son manuales. Recomendado agregar cron diario en la PC `.23`:
```cron
0 2 * * * cd /home/techtrafo/backups && STAMP=$(date +\%Y\%m\%d-\%H\%M\%S) && docker exec techtrafo-postgres pg_dump -U techtrafo_admin --clean --if-exists --no-owner techtrafo | gzip > techtrafo-db-${STAMP}.sql.gz && cp /opt/techtrafo/.env techtrafo-env-${STAMP}.env && find . -name "techtrafo-db-*.sql.gz" -mtime +30 -delete
```

---

## 7. Qué instalar en una PC nueva para operar

| Herramienta | Para qué |
|---|---|
| **PuTTY** (plink, pscp) o **OpenSSH** | Conexión SSH a `.23` y NAS |
| **Git** | Clonar el repo `pablobaquerizodavila/techtrafo` |
| Editor (VS Code) | Editar código local antes de pscp al server |
| Navegador | DSM (`https://192.168.0.116:5001`), panel (`https://panel.techtrafo.com`), router (`http://192.168.0.1`) |

> El flujo de trabajo es: editar local en `C:\Users\<user>\techtrafo\` → `pscp` al server → commit/push desde el server (o local). El stack corre 100% en la PC `.23` y el NAS — la PC de trabajo solo es para editar y operar por SSH.

---

## 8. Servicios y URLs operativas (post-restauración NAS 2026-05-27)

| URL | Estado |
|---|---|
| `https://panel.techtrafo.com` | ✅ Panel interno |
| `https://api.techtrafo.com` | ✅ API |
| `https://portal.techtrafo.com` | ✅ Portal cliente |
| `https://techtrafo.com` | ✅ Landing |
| `https://medicvip.org` | ✅ Sitio PHP |
| `https://siscormed.com` | ✅ Sitio HTML+PHP |
| `https://192.168.0.116:5001` | ✅ DSM NAS (solo LAN, warning self-signed esperado) |
| `https://eneural.org` / `panel.eneural.org` | ❌ Netvoice — pendiente reconstruir (tarea #36) |

Email saliente: ✅ `techtrafonotif@techtrafo.com` vía MailPlus con DKIM/SPF/DMARC en 4 dominios.
