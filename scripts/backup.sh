#!/bin/bash
# Backup del panel TECHTRAFO: dump DB + snapshot .env.
# Guarda local en /home/techtrafo/backups/ Y copia al NAS
# (\\Nasr24\home\Repositorios\techtrafo  =  /volume1/homes/pbaquerizo/Repositorios/techtrafo).
#
# Uso: bash /home/techtrafo/backup.sh
set -u

LOCAL_DIR="/home/techtrafo/backups"
NAS_USER="pbaquerizo"
NAS_HOST="192.168.0.116"
NAS_DIR="/volume1/homes/pbaquerizo/Repositorios/techtrafo"
SSH_KEY="/home/techtrafo/.ssh/id_ed25519"
SSH_OPTS="-q -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -i $SSH_KEY"

STAMP=$(date +%Y%m%d-%H%M%S)
DB_FILE="techtrafo-db-${STAMP}.sql.gz"
ENV_FILE="techtrafo-env-${STAMP}.env"

mkdir -p "$LOCAL_DIR"
cd "$LOCAL_DIR" || exit 1

echo "[$(date)] === Backup TECHTRAFO ${STAMP} ==="

# 1) Dump DB
echo "→ Dump PostgreSQL..."
docker exec techtrafo-postgres pg_dump -U techtrafo_admin --clean --if-exists --no-owner techtrafo \
  | gzip > "$DB_FILE"
if [ ! -s "$DB_FILE" ]; then
  echo "✗ ERROR: el dump quedó vacío. Aborto."
  exit 1
fi

# 2) Snapshot .env
echo "→ Copia .env..."
cp /opt/techtrafo/.env "$ENV_FILE" 2>/dev/null || echo "  (warn: no se pudo leer /opt/techtrafo/.env)"

echo "→ Local OK: $(du -h "$DB_FILE" | cut -f1)  $DB_FILE"

# 3) Copia al NAS
echo "→ Copiando al NAS ${NAS_DIR}..."
ssh $SSH_OPTS "${NAS_USER}@${NAS_HOST}" "mkdir -p '${NAS_DIR}'" 2>/dev/null
# tar over ssh evita problemas de versión rsync y del banner SSH
tar -C "$LOCAL_DIR" -cf - "$DB_FILE" "$ENV_FILE" 2>/dev/null \
  | ssh $SSH_OPTS "${NAS_USER}@${NAS_HOST}" "tar -C '${NAS_DIR}' -xf -" 2>/dev/null
if [ $? -eq 0 ]; then
  echo "✓ Copiado al NAS"
else
  echo "✗ ERROR copiando al NAS (backup local quedó OK igual)"
fi

# 4) Retención: borrar backups de más de 30 días (local y NAS)
echo "→ Retención 30 días..."
find "$LOCAL_DIR" -name "techtrafo-db-*.sql.gz" -mtime +30 -delete 2>/dev/null
find "$LOCAL_DIR" -name "techtrafo-env-*.env"   -mtime +30 -delete 2>/dev/null
ssh $SSH_OPTS "${NAS_USER}@${NAS_HOST}" \
  "find '${NAS_DIR}' -name 'techtrafo-db-*.sql.gz' -mtime +30 -delete 2>/dev/null; \
   find '${NAS_DIR}' -name 'techtrafo-env-*.env' -mtime +30 -delete 2>/dev/null" 2>/dev/null

echo "[$(date)] === Backup completo ==="
