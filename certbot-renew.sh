#!/bin/bash
# =================================================================
# certbot-renew.sh — renovacion automatica Let's Encrypt + monitor
# Cron: 0 3 * * * /home/techtrafo/web-public/certbot-renew.sh \
#         >> /home/techtrafo/web-public/nginx/logs/certbot-renew.log 2>&1
# =================================================================
# Cambios #44 (2026-06-08):
#   - Eliminar --quiet: el cron captura todo el output con timestamps
#   - Alertar por email si certbot falla (exit != 0)
#   - Alertar si algun cert esta a <20 dias de vencer
#   - Solo recargar nginx si hubo renovacion efectiva
# =================================================================

CERT_CONF="/home/techtrafo/web-public/certbot/conf"
ALERT_PY="/home/techtrafo/techtrafo/scripts/tt-alert.py"
ALERT_TO="pablobaquerizodavila@gmail.com"
# Solo para mostrar en el cuerpo de las alertas (el cron escribe aqui):
LOG_PATH="/home/techtrafo/web-public/nginx/logs/certbot-renew.log"

log()   { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
alert() {
  local subj="$1" body="$2"
  log "Enviando alerta: $subj"
  ALERT_SUBJECT="$subj" ALERT_BODY="$body" ALERT_TO="$ALERT_TO" \
    python3 "$ALERT_PY" || log "WARN: alerta no pudo enviarse (revisar tt-alert.py)"
}

# ─── 1. Renovar certs ──────────────────────────────────────────
log "Iniciando certbot renew..."
RENEW_OUT=$(docker run --rm \
  -v "${CERT_CONF}:/etc/letsencrypt" \
  -v "/home/techtrafo/web-public/certbot/www:/var/www/certbot" \
  certbot/certbot renew --webroot -w /var/www/certbot 2>&1)
RC=$?

# Imprimir output de certbot (capturado por cron al log)
echo "$RENEW_OUT"
log "certbot exit: $RC"

if [ $RC -ne 0 ]; then
  alert "[TECHTRAFO] ALERTA: Renovacion SSL fallo" \
"Certbot renewal FALLO en $(hostname) el $(date '+%Y-%m-%d %H:%M:%S').

Exit code: $RC

--- Output de certbot ---
${RENEW_OUT}
---

Revisar: ${LOG_PATH}
Renovar manualmente si es necesario: bash /home/techtrafo/web-public/certbot-renew.sh"
fi

# ─── 2. Recargar nginx solo si hubo renovacion efectiva ────────
if echo "$RENEW_OUT" | grep -qiE "successfully renewed|congratulations|new certificate"; then
  log "Cert renovado, recargando nginx..."
  docker exec web-nginx nginx -s reload 2>&1 \
    && log "nginx reload OK" \
    || log "WARN: nginx reload fallo"
else
  log "Sin renovaciones — nginx no necesita recarga"
fi

# ─── 3. Verificar vencimiento (<20 dias = alerta temprana) ─────
WARN_SEC=$((20 * 86400))   # 20 dias en segundos
CERT_FOUND=0
for CERT_FILE in "${CERT_CONF}/live"/*/fullchain.pem; do
  [ -f "$CERT_FILE" ] || continue
  CERT_FOUND=1
  DOMAIN=$(basename "$(dirname "$CERT_FILE")")
  if ! openssl x509 -checkend $WARN_SEC -noout -in "$CERT_FILE" 2>/dev/null; then
    END_DATE=$(openssl x509 -enddate -noout -in "$CERT_FILE" | cut -d= -f2)
    log "AVISO: cert '$DOMAIN' vence el $END_DATE (menos de 20 dias)"
    alert "[TECHTRAFO] AVISO: Cert SSL '$DOMAIN' vence pronto" \
"El certificado SSL de ${DOMAIN} vence el ${END_DATE} (menos de 20 dias).

Certbot lo renovara automaticamente cuando queden <30 dias.
Si hay algun problema, ejecutar: bash /home/techtrafo/web-public/certbot-renew.sh

Log: ${LOG_PATH}"
  else
    END_DATE=$(openssl x509 -enddate -noout -in "$CERT_FILE" | cut -d= -f2)
    log "Cert '$DOMAIN' OK (vence: $END_DATE)"
  fi
done

[ $CERT_FOUND -eq 0 ] && log "WARN: no se encontraron certs en ${CERT_CONF}/live/"
log "Finalizado"
