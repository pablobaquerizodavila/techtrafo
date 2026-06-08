# infrastructure/web-public

Stack nginx + php-fpm para los sitios públicos y el reverse proxy HTTPS.

**Ruta live en el server:** `/home/techtrafo/web-public/`

## Arrancar / actualizar

```bash
cd /home/techtrafo/web-public
docker compose up -d          # primera vez
docker exec web-nginx nginx -s reload   # recargar conf sin bajar
docker compose restart web-nginx        # bajar y subir nginx
```

## Dominios servidos

| Dominio | Tipo | Destino |
|---------|------|---------|
| `techtrafo.com` | estático HTML | `/var/www/sites/techtrafo` |
| `panel.techtrafo.com` | reverse proxy | `techtrafo-web:3002` |
| `api.techtrafo.com` | reverse proxy | `techtrafo-api:3000` |
| `portal.techtrafo.com` | reverse proxy | `techtrafo-web:3002` |
| `medicvip.org` | PHP 8.2 | `/var/www/sites/medicvip` |
| `siscormed.com` | HTML + PHP API | `/var/www/sites/siscormed` |

## Certs Let's Encrypt

Gestionados por certbot. Los archivos `.pem` están en
`/home/techtrafo/web-public/certbot/conf/live/` (no versionados).

Renovación automática via cron (corre diario a las 3:00 AM):
```
0 3 * * * /home/techtrafo/web-public/certbot-renew.sh >> /home/techtrafo/web-public/nginx/logs/certbot-renew.log 2>&1
```
El script con lógica de alertas está en `certbot-renew.sh` (root del repo).

### Emitir cert nuevo (primera vez o dominio nuevo)
```bash
docker run --rm   -v /home/techtrafo/web-public/certbot/conf:/etc/letsencrypt   -v /home/techtrafo/web-public/certbot/www:/var/www/certbot   certbot/certbot certonly --webroot -w /var/www/certbot   -d dominio.com -d www.dominio.com   --email pablobaquerizodavila@gmail.com --agree-tos --no-eff-email
```

## No versionado (.gitignore)

- `certbot/conf/live/` — claves privadas y certs
- `certbot/conf/archive/` — histórico de certs
- `certbot/conf/accounts/` — credenciales ACME
- `nginx/logs/` — access/error logs
