#!/usr/bin/env bash
# ufw para el edge .7 con auto-revert de seguridad.
set -euo pipefail

ufw default deny incoming
ufw default allow outgoing
ufw allow from 192.168.0.0/24 to any port 22 proto tcp comment 'SSH solo LAN'
ufw allow 80/tcp  comment 'HTTP publico'
ufw allow 443/tcp comment 'HTTPS publico'

# auto-disable en 120s si no confirmo conectividad (anti-lockout)
cat > /root/ufw-safe.sh <<'EOF'
#!/usr/bin/env bash
sleep 120
[ -f /tmp/ufw_ok ] || ufw --force disable
EOF
chmod +x /root/ufw-safe.sh
rm -f /tmp/ufw_ok
nohup /root/ufw-safe.sh >/tmp/ufw-safe.log 2>&1 </dev/null &

ufw --force enable
echo "=== UFW_ENABLED (auto-disable 120s salvo /tmp/ufw_ok) ==="
ufw status verbose
