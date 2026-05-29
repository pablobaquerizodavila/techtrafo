#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# tt-backup.sh — Backup consolidado de TECHTRAFO
# ═══════════════════════════════════════════════════════════════════
# Respalda en UNA sola corrida:
#   1. DB PostgreSQL  → db/techtrafo-db-<stamp>.sql.gz
#   2. .env del panel → env/techtrafo-env-<stamp>.env
#   3. Código (HEAD)  → code/tech-trafo-v<ver>-<label>-<sha>-<stamp>.zip
#
# Doble destino (redundancia):
#   - Local PC .23 : /home/techtrafo/backups/{db,env,code}/
#   - NAS Nasr24   : /volume1/homes/pbaquerizo/Repositorios/techtrafo/{db,env,code}/
#                    (= ruta SMB \\Nasr24\home\Repositorios\techtrafo)
#
# Corre EN LA PC .23 (ahí están el container postgres y el repo git).
# Reemplaza a los scripts previos backup.sh + tt-backup.sh (que apuntaba
# al NAS viejo NAS1821, ya retirado tras el cambio de NAS 2026-05-27).
#
# Uso:
#   bash /home/techtrafo/techtrafo/scripts/tt-backup.sh            (label auto del último commit)
#   bash /home/techtrafo/techtrafo/scripts/tt-backup.sh <label>    (label manual)
# ═══════════════════════════════════════════════════════════════════
set -uo pipefail

# ─── Config ───
REPO_DIR="/home/techtrafo/techtrafo"
LOCAL_ROOT="/home/techtrafo/backups"
NAS_USER="pbaquerizo"
NAS_HOST="192.168.0.116"
# Backups (db/env/code) van a una carpeta SEPARADA del mirror de codigo.
NAS_ROOT="/volume1/homes/pbaquerizo/Repositorios/techtrafo-backups"
# Mirror del codigo: espejo de origin/main (lo que ve \\Nasr24\homes\...\techtrafo).
NAS_MIRROR="/volume1/homes/pbaquerizo/Repositorios/techtrafo"
SSH_KEY="/home/techtrafo/.ssh/id_ed25519"
SSH_OPTS="-q -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -i $SSH_KEY"
RETENTION_DAYS=30

STAMP=$(date +%Y%m%d-%H%M%S)
DB_FILE="techtrafo-db-${STAMP}.sql.gz"
ENV_FILE="techtrafo-env-${STAMP}.env"

mkdir -p "$LOCAL_ROOT/db" "$LOCAL_ROOT/env" "$LOCAL_ROOT/code"

echo "[$(date)] === Backup TECHTRAFO ${STAMP} ==="

# ─── 1. Dump DB ───
echo "-> [1/3] Dump PostgreSQL..."
docker exec techtrafo-postgres pg_dump -U techtrafo_admin --clean --if-exists --no-owner techtrafo \
  | gzip > "$LOCAL_ROOT/db/$DB_FILE"
if [ ! -s "$LOCAL_ROOT/db/$DB_FILE" ]; then
  echo "ERROR: dump DB vacio. Aborto."; exit 1
fi
echo "   OK DB: $(du -h "$LOCAL_ROOT/db/$DB_FILE" | cut -f1)"

# ─── 2. Snapshot .env ───
echo "-> [2/3] Snapshot .env..."
cp /opt/techtrafo/.env "$LOCAL_ROOT/env/$ENV_FILE" 2>/dev/null \
  && echo "   OK .env copiado" || echo "   WARN no se pudo leer /opt/techtrafo/.env"

# ─── 3. Snapshot codigo (git archive) ───
echo "-> [3/3] Snapshot codigo..."
if git -C "$REPO_DIR" rev-parse --git-dir >/dev/null 2>&1; then
  VERSION="unknown"
  if [ -f "$REPO_DIR/CHANGELOG.md" ]; then
    VERSION=$(grep -oE '## \[[0-9]+\.[0-9]+\.[0-9]+\]' "$REPO_DIR/CHANGELOG.md" 2>/dev/null \
              | head -n1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")
  fi
  if [ "$#" -ge 1 ] && [ -n "$1" ]; then
    LABEL="$1"
  else
    LAST_MSG=$(git -C "$REPO_DIR" log -1 --pretty=%s 2>/dev/null || echo "snapshot")
    LABEL=$(printf '%s' "$LAST_MSG" | sed -E 's/^[a-z]+(\([^)]+\))?:\s*//' \
            | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/^-//;s/-$//' | cut -c1-50)
    [ -z "$LABEL" ] && LABEL="snapshot"
  fi
  SHORT_SHA=$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo "nogit")
  ZIP_NAME="tech-trafo-v${VERSION}-${LABEL}-${SHORT_SHA}-${STAMP}.zip"
  git -C "$REPO_DIR" archive --format=zip HEAD -o "$LOCAL_ROOT/code/$ZIP_NAME" 2>/dev/null \
    && echo "   OK codigo: $ZIP_NAME ($(du -h "$LOCAL_ROOT/code/$ZIP_NAME" | cut -f1))" \
    || echo "   WARN git archive fallo"
else
  echo "   WARN $REPO_DIR no es repo git, omito snapshot de codigo"
fi

# ─── 4. Copia al NAS ───
echo "-> Copiando al NAS ${NAS_ROOT}..."
ssh $SSH_OPTS "${NAS_USER}@${NAS_HOST}" "mkdir -p '${NAS_ROOT}/db' '${NAS_ROOT}/env' '${NAS_ROOT}/code'" 2>/dev/null
NAS_OK=0
for sub in db env code; do
  tar -C "$LOCAL_ROOT/$sub" -cf - . 2>/dev/null \
    | ssh $SSH_OPTS "${NAS_USER}@${NAS_HOST}" "tar -C '${NAS_ROOT}/$sub' -xf -" 2>/dev/null \
    || NAS_OK=1
done
[ "$NAS_OK" -eq 0 ] && echo "   OK copiado al NAS (db/env/code)" || echo "   ERROR copiando al NAS (local quedo OK)"

# ─── 4b. Sincronizar el MIRROR del codigo (espejo de origin/main) ───
# Mantiene \\Nasr24\homes\pbaquerizo\Repositorios\techtrafo identico al repo.
# Usa origin/main si hay conexion; si no, HEAD local.
echo "-> Sincronizando mirror de codigo en ${NAS_MIRROR}..."
if git -C "$REPO_DIR" rev-parse --git-dir >/dev/null 2>&1; then
  REF="HEAD"
  git -C "$REPO_DIR" fetch -q origin main 2>/dev/null && REF="origin/main"
  ssh $SSH_OPTS "${NAS_USER}@${NAS_HOST}" "mkdir -p '${NAS_MIRROR}'" 2>/dev/null
  git -C "$REPO_DIR" archive "$REF" \
    | ssh $SSH_OPTS "${NAS_USER}@${NAS_HOST}" "tar -C '${NAS_MIRROR}' -xf -" 2>/dev/null \
    && echo "   OK mirror sincronizado ($REF)" || echo "   WARN no se pudo sincronizar mirror"
fi

# ─── 5. Retencion ───
echo "-> Retencion ${RETENTION_DAYS} dias (local + NAS)..."
for sub in db env code; do
  find "$LOCAL_ROOT/$sub" -type f -mtime +${RETENTION_DAYS} -delete 2>/dev/null
done
ssh $SSH_OPTS "${NAS_USER}@${NAS_HOST}" \
  "for s in db env code; do find '${NAS_ROOT}'/\$s -type f -mtime +${RETENTION_DAYS} -delete 2>/dev/null; done" 2>/dev/null

echo "[$(date)] === Backup completo ==="
