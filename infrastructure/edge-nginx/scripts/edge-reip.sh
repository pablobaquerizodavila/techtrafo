#!/usr/bin/env bash
# Re-IP de nginx-webserver a 192.168.0.7 estática, con auto-revert de seguridad.
set -euo pipefail

BK=/root/netplan-backup
mkdir -p "$BK"
cp /etc/netplan/50-cloud-init.yaml "$BK/50-cloud-init.yaml.orig" 2>/dev/null || true

# cloud-init no debe revertir la red en reboots
cat > /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg <<'EOF'
network: {config: disabled}
EOF

# config estática .7
cat > /etc/netplan/50-cloud-init.yaml <<'EOF'
network:
  version: 2
  ethernets:
    ens3:
      dhcp4: false
      addresses: [192.168.0.7/24]
      routes:
        - to: default
          via: 192.168.0.1
      nameservers:
        addresses: [192.168.0.1, 8.8.8.8, 1.1.1.1]
EOF
chmod 600 /etc/netplan/50-cloud-init.yaml

# valida YAML ANTES de aplicar (si falla, aborta y no cambia nada)
netplan generate

# aplica en detached + auto-revert a DHCP si no confirmo en ~100s
cat > /root/reip-apply.sh <<'EOF'
#!/usr/bin/env bash
sleep 3
netplan apply
sleep 100
if [ ! -f /tmp/reip_ok ]; then
  rm -f /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg
  if [ -f /root/netplan-backup/50-cloud-init.yaml.orig ]; then
    cp /root/netplan-backup/50-cloud-init.yaml.orig /etc/netplan/50-cloud-init.yaml
  else
    printf 'network:\n  version: 2\n  ethernets:\n    ens3:\n      dhcp4: true\n' > /etc/netplan/50-cloud-init.yaml
  fi
  netplan apply
fi
EOF
chmod +x /root/reip-apply.sh
nohup /root/reip-apply.sh >/tmp/reip.log 2>&1 </dev/null &
echo "REIP_SCHEDULED (auto-revert ~100s salvo /tmp/reip_ok)"
