#!/usr/bin/env bash
# Phase 2 — configs finales HTTPS del edge (nginx 1.18 -> 'listen 443 ssl http2;')
set -euo pipefail
NAS="192.168.0.116"
DOCK="192.168.0.23"

# snippet anti credential-scan (para subdominios techtrafo proxied)
sudo tee /etc/nginx/snippets/block-scans.conf >/dev/null <<'NGINX'
location ~* /(\.env|\.git|wp-login\.php|wp-admin|service-account\.json|\.aws/|config\.php)$ { deny all; return 404; }
NGINX

# --- sitios NAS: HTTP->redirect + HTTPS proxy ---
gen_nas () {  # $1 file, $2 server_names, $3 certname
  sudo tee /etc/nginx/conf.d/$1.conf >/dev/null <<NGINX
server {
    listen 80;
    server_name $2;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl http2;
    server_name $2;
    ssl_certificate     /etc/letsencrypt/live/$3/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$3/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:10m;
    location / {
        proxy_pass http://$NAS;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        client_max_body_size 25M;
        proxy_read_timeout 60s;
    }
}
NGINX
}
gen_nas techtrafo    "techtrafo.com www.techtrafo.com"        techtrafo.com
gen_nas medicvip     "medicvip.org www.medicvip.org"          medicvip.org
gen_nas siscormed    "siscormed.com www.siscormed.com"        siscormed.com
gen_nas buscoartista "buscoartista.com www.buscoartista.com"  buscoartista.com
gen_nas telcomag     "telcomag.com www.telcomag.com"          telcomag.com

# --- panel/api/portal.techtrafo.com -> .23 web-nginx :443 (cert techtrafo.com) ---
gen_dock () {  # $1 file, $2 server_name
  sudo tee /etc/nginx/conf.d/$1.conf >/dev/null <<NGINX
server {
    listen 80;
    server_name $2;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl http2;
    server_name $2;
    ssl_certificate     /etc/letsencrypt/live/techtrafo.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/techtrafo.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    include /etc/nginx/snippets/block-scans.conf;
    location / {
        proxy_pass https://$DOCK;
        proxy_ssl_verify off;
        proxy_ssl_server_name on;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_http_version 1.1;
        client_max_body_size 25M;
        proxy_read_timeout 120s;
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
    location / { return 301 https://$host$request_uri; }
}
server {
    listen 443 ssl http2;
    server_name fundacionpablobaquerizo.org www.fundacionpablobaquerizo.org;
    ssl_certificate     /etc/letsencrypt/live/fundacionpablobaquerizo.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/fundacionpablobaquerizo.org/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    root /var/www/fundacionpablobaquerizo;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
}
NGINX

# --- default: hosts no configurados -> 444 (http y https) ---
sudo tee /etc/nginx/conf.d/00-default.conf >/dev/null <<'NGINX'
server {
    listen 80 default_server;
    server_name _;
    location /healthz { access_log off; return 200 "ok\n"; add_header Content-Type text/plain; }
    location / { return 444; }
}
server {
    listen 443 ssl http2 default_server;
    server_name _;
    ssl_certificate     /etc/letsencrypt/live/techtrafo.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/techtrafo.com/privkey.pem;
    return 444;
}
NGINX

sudo nginx -t
sudo systemctl reload nginx
echo "=== PHASE2 OK ==="
