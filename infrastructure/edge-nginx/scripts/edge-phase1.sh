#!/usr/bin/env bash
# Phase 1 — reconstrucción del edge nginx en nginx-webserver (192.168.0.19)
# HTTP-only: proxy a upstreams + webroot ACME listo para certbot.
# eneural.org / panel.eneural.org QUEDAN FUERA a propósito (zona NO TOCAR).
set -euo pipefail

NAS="192.168.0.116"        # Web Station :80 (sitios estáticos/PHP)
DOCK="192.168.0.23"        # web-nginx :443 (panel/api/portal → containers)

sudo mkdir -p /var/www/certbot /var/www/fundacionpablobaquerizo
sudo rm -f /etc/nginx/sites-enabled/default
echo "<h1>funpabad — contenido pendiente de deploy</h1>" | sudo tee /var/www/fundacionpablobaquerizo/index.html >/dev/null

# --- sitios estáticos/PHP servidos por el NAS (proxy Host-preserving) ---
gen_nas () {  # $1 = nombre archivo, $2 = server_name(s)
  sudo tee /etc/nginx/conf.d/$1.conf >/dev/null <<NGINX
server {
    listen 80;
    server_name $2;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / {
        proxy_pass http://$NAS;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        client_max_body_size 25M;
    }
}
NGINX
}

gen_nas techtrafo   "techtrafo.com www.techtrafo.com"
gen_nas medicvip    "medicvip.org www.medicvip.org"
gen_nas siscormed   "siscormed.com www.siscormed.com"
gen_nas buscoartista "buscoartista.com www.buscoartista.com"
gen_nas telcomag    "telcomag.com www.telcomag.com"

# --- panel/api/portal.techtrafo.com → .23 web-nginx (:443, verify off) ---
gen_dock () {  # $1 = archivo, $2 = server_name
  sudo tee /etc/nginx/conf.d/$1.conf >/dev/null <<NGINX
server {
    listen 80;
    server_name $2;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / {
        proxy_pass https://$DOCK;
        proxy_ssl_verify off;
        proxy_ssl_server_name on;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_http_version 1.1;
        client_max_body_size 25M;
    }
}
NGINX
}

gen_dock panel-techtrafo  "panel.techtrafo.com"
gen_dock api-techtrafo    "api.techtrafo.com"
gen_dock portal-techtrafo "portal.techtrafo.com"

# --- funpabad estático local ---
sudo tee /etc/nginx/conf.d/funpabad.conf >/dev/null <<'NGINX'
server {
    listen 80;
    server_name fundacionpablobaquerizo.org www.fundacionpablobaquerizo.org;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    root /var/www/fundacionpablobaquerizo;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
}
NGINX

# --- default: hosts no configurados → 444 ---
sudo tee /etc/nginx/conf.d/00-default.conf >/dev/null <<'NGINX'
server {
    listen 80 default_server;
    server_name _;
    location /healthz { access_log off; return 200 "ok\n"; add_header Content-Type text/plain; }
    location / { return 444; }
}
NGINX

sudo nginx -t
sudo systemctl reload nginx
echo "=== PHASE1 OK ==="
sudo ls /etc/nginx/conf.d/
