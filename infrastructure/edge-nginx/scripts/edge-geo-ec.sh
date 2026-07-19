#!/usr/bin/env bash
# Whitelist de Ecuador en fail2ban via ipset + ignorecommand, con refresco semanal.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ipset curl >/dev/null 2>&1

# --- script de refresco de la lista de CIDRs de Ecuador ---
cat > /usr/local/bin/ec-ipset-refresh.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
URL="https://www.ipdeny.com/ipblocks/data/aggregated/ec-aggregated.zone"
TMP="$(mktemp)"
if curl -fsS --max-time 40 "$URL" -o "$TMP" && [ -s "$TMP" ]; then
  ipset create ec_ips_new hash:net family inet maxelem 131072 -exist
  ipset flush ec_ips_new
  while read -r cidr; do
    [ -n "$cidr" ] && ipset add ec_ips_new "$cidr" -exist
  done < "$TMP"
  ipset create ec_ips hash:net family inet maxelem 131072 -exist
  ipset swap ec_ips_new ec_ips
  ipset destroy ec_ips_new
  ipset save ec_ips > /etc/ipset-ec.conf
  logger -t ec-ipset "ec_ips refreshed: $(ipset list ec_ips | grep -c '/') cidrs"
else
  logger -t ec-ipset "refresh FAILED (download)"; rm -f "$TMP"; exit 1
fi
rm -f "$TMP"
EOF
chmod +x /usr/local/bin/ec-ipset-refresh.sh

# --- ignorecommand para fail2ban (exit 0 => ignorar) ---
cat > /usr/local/bin/f2b-ignore-ec.sh <<'EOF'
#!/bin/sh
if ipset test ec_ips "$1" >/dev/null 2>&1; then echo "$1"; exit 0; fi
exit 1
EOF
chmod +x /usr/local/bin/f2b-ignore-ec.sh

# --- poblar la lista ahora ---
/usr/local/bin/ec-ipset-refresh.sh || echo "WARN: refresh inicial fallo (fail2ban sigue normal)"

# --- boot: restaurar el set antes de fail2ban ---
cat > /etc/systemd/system/ec-ipset.service <<'EOF'
[Unit]
Description=Restore Ecuador ipset (ec_ips)
Before=fail2ban.service
Wants=network-online.target
After=network-online.target
[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/sh -c 'ipset restore < /etc/ipset-ec.conf 2>/dev/null || /usr/local/bin/ec-ipset-refresh.sh'
[Install]
WantedBy=multi-user.target
EOF

# --- refresco semanal ---
cat > /etc/systemd/system/ec-ipset-refresh.service <<'EOF'
[Unit]
Description=Refresh Ecuador ipset from ipdeny
Wants=network-online.target
After=network-online.target
[Service]
Type=oneshot
ExecStart=/usr/local/bin/ec-ipset-refresh.sh
EOF
cat > /etc/systemd/system/ec-ipset-refresh.timer <<'EOF'
[Unit]
Description=Weekly refresh of Ecuador ipset
[Timer]
OnCalendar=Sun 04:30
Persistent=true
[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable ec-ipset.service >/dev/null 2>&1
systemctl enable --now ec-ipset-refresh.timer >/dev/null 2>&1

# --- fail2ban: agregar ignorecommand (idempotente) ---
if ! grep -q '^ignorecommand' /etc/fail2ban/jail.local; then
  sed -i '/^ignoreip =/a ignorecommand = /usr/local/bin/f2b-ignore-ec.sh <ip>' /etc/fail2ban/jail.local
fi
fail2ban-client reload >/dev/null 2>&1

echo "=== RESULTADO ==="
echo -n "ec_ips CIDRs: "; (ipset list ec_ips 2>/dev/null | grep -c '/') || echo 0
echo -n "test 186.101.238.135 (EC): "; /usr/local/bin/f2b-ignore-ec.sh 186.101.238.135 >/dev/null 2>&1 && echo "IGNORED ✓" || echo "no"
echo -n "test 8.8.8.8 (US):         "; /usr/local/bin/f2b-ignore-ec.sh 8.8.8.8 >/dev/null 2>&1 && echo "IGNORED (mal)" || echo "no-ignore ✓"
echo -n "jail.local: "; grep '^ignorecommand' /etc/fail2ban/jail.local || true
echo -n "servicios: "; systemctl is-enabled ec-ipset.service ec-ipset-refresh.timer 2>/dev/null | tr '\n' ' '; echo
