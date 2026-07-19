#!/usr/bin/env bash
# Rate-limiting global por IP en el edge (anti-flood). Idempotente.
set -euo pipefail
cat > /etc/nginx/conf.d/00-limits.conf <<'EOF'
# Rate-limiting global por IP (anti-flood). Definido en http (conf.d).
limit_req_zone  $binary_remote_addr zone=perip:10m  rate=30r/s;
limit_conn_zone $binary_remote_addr zone=connperip:10m;
limit_req_status 429;
limit_conn_status 429;
limit_req  zone=perip burst=80 nodelay;
limit_conn connperip 50;
EOF
nginx -t && systemctl reload nginx
echo "nginx limits OK"
