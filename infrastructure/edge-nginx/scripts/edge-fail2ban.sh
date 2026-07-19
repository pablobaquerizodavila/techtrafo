#!/usr/bin/env bash
# fail2ban en el edge .7: sshd + nginx (botsearch/limit-req/scans), ban vía ufw.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq fail2ban >/dev/null 2>&1

# filtro custom para escaneos web
cat > /etc/fail2ban/filter.d/nginx-scans.conf <<'EOF'
[Definition]
failregex = ^<HOST> -.*"(?:GET|POST|HEAD|PUT|OPTIONS) [^"]*(?:\.env|/\.git|/wp-login\.php|/wp-admin|/xmlrpc\.php|/vendor/|/\.aws|/config\.php|/phpMyAdmin|/phpmyadmin|/\.ssh|/actuator|/solr/|/boaform|/\.vscode)[^"]*" .*$
ignoreregex =
EOF

# jails
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
ignoreip = 127.0.0.1/8 ::1 192.168.0.0/24
banaction = ufw
backend = auto

[sshd]
enabled = true
backend = systemd
maxretry = 4
bantime  = 2h

[nginx-botsearch]
enabled = true
logpath = /var/log/nginx/access.log
maxretry = 3
bantime  = 2h

[nginx-limit-req]
enabled = true
logpath = /var/log/nginx/error.log
maxretry = 10
bantime  = 30m

[nginx-scans]
enabled  = true
port     = http,https
filter   = nginx-scans
logpath  = /var/log/nginx/access.log
maxretry = 2
bantime  = 6h
EOF

systemctl enable fail2ban >/dev/null 2>&1
systemctl restart fail2ban
sleep 2
echo "=== fail2ban status ==="
fail2ban-client status
echo "=== test filtro nginx-scans (linea de escaneo simulada) ==="
printf '45.66.66.66 - - [10/Jul/2026:21:00:00 -0500] "GET /.env HTTP/1.1" 404 153 "-" "curl/8.0"\n' > /tmp/scan-sample.log
fail2ban-regex /tmp/scan-sample.log /etc/fail2ban/filter.d/nginx-scans.conf 2>/dev/null | grep -iE "Failregex|matched|lines" | head -6
