# Edge nginx — reverse proxy / TLS terminator público

> **Infra COMPARTIDA** (no solo TECHTRAFO). Es el único punto público 80/443 de
> todos los dominios. Se versiona aquí porque su pérdida en 2026-07-03 nos dejó
> sin backup del config — esta carpeta existe para que la próxima vez sea
> *restaurar*, no *reconstruir desde cero*.

## Qué es

VM Ubuntu 22.04 **`nginx-webserver`** con IP estática **`192.168.0.7`**
(usuario `pbaquerizo`). El router TP-Link (`192.168.0.1`) hace NAT de `80/443`
→ `.7`. DNS de todos los dominios en GoDaddy → `186.101.238.135`.

La VM es un **reverse proxy puro** (no sirve PHP): termina TLS con Let's Encrypt
y hace proxy a los backends reales.

## Mapa de dominios → upstream

| Dominio(s) | Upstream | Cert |
|---|---|---|
| techtrafo.com, www | NAS `192.168.0.116:80` (Web Station) | techtrafo.com (SAN) |
| medicvip.org, www | NAS `:80` | medicvip.org |
| siscormed.com, www | NAS `:80` | siscormed.com |
| buscoartista.com, www | NAS `:80` | buscoartista.com |
| telcomag.com, www | NAS `:80` | telcomag.com |
| panel.techtrafo.com | `.23:443` (web-nginx → techtrafo-web:3002) | techtrafo.com (SAN) |
| api.techtrafo.com | `.23:443` (web-nginx → techtrafo-api:3000) | techtrafo.com (SAN) |
| portal.techtrafo.com | `.23:443` (web-nginx → techtrafo-web:3002) | techtrafo.com (SAN) |
| fundacionpablobaquerizo.org, www | **estático local** `/var/www/fundacionpablobaquerizo` | fundacionpablobaquerizo.org |

`panel/api/portal` proxean a la `.23` por **HTTPS con `proxy_ssl_verify off`**
porque los contenedores `techtrafo-web/api` sólo escuchan en `127.0.0.1:3002/3000`
dentro de la `.23`; el `web-nginx` de la `.23` (`:443`, publica en LAN) los rutea
por Host. No exponer los contenedores a la LAN.

> ⛔ **eneural.org / panel.eneural.org NO están aquí a propósito.** Vivían en la
> VM vieja; Pablo los migrará a su propia VM aparte. No re-agregarlos sin pedírselo.

## Reconstruir desde cero (runbook)

Sobre una VM Ubuntu limpia con la IP `.7` (o re-IP con `scripts/edge-reip.sh`):

```bash
sudo apt-get update && sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo bash scripts/edge-phase1.sh          # HTTP + proxy + webroot ACME
# (asegurar NAT 80/443 -> .7 en el router)
# emitir certs (6 grupos):
sudo certbot certonly --webroot -w /var/www/certbot --non-interactive --agree-tos \
  -m pablobaquerizodavila@gmail.com \
  -d techtrafo.com -d www.techtrafo.com -d panel.techtrafo.com -d api.techtrafo.com -d portal.techtrafo.com
# ...idem medicvip.org, siscormed.com, buscoartista.com, telcomag.com,
#    fundacionpablobaquerizo.org (cada uno con su www)
sudo bash scripts/edge-phase2.sh          # HTTPS + redirect 80->443
# funpabad: subir index.html + assets/ del repo fundacionpablobaquerizo a
#           /var/www/fundacionpablobaquerizo
```

Renovación de certs: `certbot.timer` (systemd) + hook
`/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh`.

## Archivos

- `scripts/edge-reip.sh` — fija IP estática `.7` (con auto-revert de seguridad).
- `scripts/edge-phase1.sh` — nginx HTTP-only (proxy + webroot ACME).
- `scripts/edge-phase2.sh` — nginx final HTTPS (sintaxis nginx 1.18 `listen 443 ssl http2;`).
- `conf.d/*.conf`, `snippets/block-scans.conf` — snapshot renderizado de lo que
  corre en `.7` (fuente de verdad = los scripts; esto es respaldo).

## Hardening / firewall (2026-07-09)

El edge es el único host expuesto a internet, así que se endureció en 3 capas
(scripts en `scripts/`, snapshots en `hardening/`):

1. **ufw** (`edge-ufw.sh`) — default-deny entrante: `80/443` desde cualquier IP,
   `22` **solo desde LAN `192.168.0.0/24`**. Se aplica con auto-`disable` a 120 s
   salvo `touch /tmp/ufw_ok` (anti-lockout).
2. **fail2ban** (`edge-fail2ban.sh` + `hardening/jail.local` + `nginx-scans.conf`)
   — jails: `sshd` (systemd), `nginx-botsearch`, `nginx-limit-req`, y `nginx-scans`
   (filtro custom que banea escaneos `.env`/`.git`/`wp-*`/`xmlrpc`/etc). Bans vía
   `ufw`. **Whitelist LAN + localhost** (nunca autobanearnos).
3. **Rate-limiting nginx** (`edge-nginx-limits.sh` → `conf.d/00-limits.conf`) —
   `limit_req` 30r/s burst 80 + `limit_conn` 50 por IP, status 429.
4. **Geo-whitelist Ecuador** (`edge-geo-ec.sh`) — fail2ban **nunca banea IPs de
   Ecuador** (decisión de Pablo). Se hace con un `ipset ec_ips` (~313 CIDRs de
   ipdeny.com) + `ignorecommand` en jail.local. Servicio de boot `ec-ipset.service`
   restaura el set; timer `ec-ipset-refresh.timer` lo refresca semanal (Dom 04:30).
   ⚠️ Baja la protección para orígenes ecuatorianos; el rate-limiting de nginx sí
   sigue aplicando a todos. Fail-safe: si el set no existe, fail2ban opera normal.

> ⚠️ Si te bloqueas por ufw: la VM tiene consola en el VMM del NAS; `sudo ufw disable`.
> El jail `sshd` no aplica a la LAN (whitelisted), así que operar por SSH desde la
> oficina nunca dispara ban.

---

Reconstruido 2026-07-03 tras borrado accidental de la VM edge. Endurecido 2026-07-09.
