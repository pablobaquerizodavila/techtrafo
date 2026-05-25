#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# tt-backup.sh — Snapshot del repo al NAS post-commit
# ═══════════════════════════════════════════════════════════════
#
# Crea un snapshot zip del estado actual de HEAD al NAS1821 y
# refresca README.md + CHANGELOG.md en la carpeta raíz del backup.
#
# Pre-requisitos:
#   - Estar en main (o pasar override)
#   - Working tree limpio (sin cambios sin commit)
#   - Local sincronizado con origin/main
#   - NAS accesible via SMB en \\NAS1821\Carpeta Hellius\...
#
# Uso:
#   ./scripts/tt-backup.sh                       (auto-detecta label del commit)
#   ./scripts/tt-backup.sh <label>               (label manual)
#   ./scripts/tt-backup.sh voltage-os-ola-3c     (ejemplo)
#
# Salida:
#   tech-trafo-v<version>-<label>-<sha>-<YYYY-MM-DD-HHMM>.zip
#   en \\NAS1821\...\tech-trafo-commit-backup\code\
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Configuración ───
BACKUP_ROOT='//NAS1821/Carpeta Hellius/Documentos Helius/compañias/Desarrollos/Techtrafo/tech-trafo-commit-backup'

# ─── Colores (sólo si terminal soporta) ───
if [ -t 1 ] && command -v tput >/dev/null && [ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]; then
  C_RED=$(tput setaf 1); C_GREEN=$(tput setaf 2); C_YELLOW=$(tput setaf 3)
  C_CYAN=$(tput setaf 6); C_BOLD=$(tput bold); C_RESET=$(tput sgr0)
else
  C_RED=""; C_GREEN=""; C_YELLOW=""; C_CYAN=""; C_BOLD=""; C_RESET=""
fi

info()  { printf "%s%s%s\n" "$C_CYAN" "$1" "$C_RESET"; }
ok()    { printf "%s✓ %s%s\n" "$C_GREEN" "$1" "$C_RESET"; }
warn()  { printf "%s⚠ %s%s\n" "$C_YELLOW" "$1" "$C_RESET" >&2; }
err()   { printf "%s✗ %s%s\n" "$C_RED" "$1" "$C_RESET" >&2; }

# ─── 1. Verificar repo git ───
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  err "No estás en un repositorio git"
  exit 1
fi

# Asegurar cwd = root del repo
ROOT_REPO=$(git rev-parse --show-toplevel)
cd "$ROOT_REPO"

# ─── 2. Branch check ───
BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "DETACHED")
if [ "$BRANCH" != "main" ]; then
  warn "Estás en branch '$BRANCH' (no main). ¿Continuar igual?"
  printf "  [s/N] "
  read -r ans
  case "$ans" in
    s|S|y|Y|si|sí|yes) ;;
    *) err "Cancelado"; exit 1 ;;
  esac
fi

# ─── 3. Working tree limpio ───
if [ -n "$(git status --porcelain)" ]; then
  err "Hay cambios sin commitear. Hacé commit o stash primero:"
  git status --short
  exit 1
fi

# ─── 4. Sincronización con origin ───
info "Verificando sincronización con origin/$BRANCH…"
if ! git fetch --quiet origin "$BRANCH" 2>/dev/null; then
  warn "No se pudo hacer fetch (sin conexión a GitHub?). Sigo con HEAD local."
else
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo "")
  if [ -n "$REMOTE" ] && [ "$LOCAL" != "$REMOTE" ]; then
    err "Local y origin/$BRANCH no están sincronizados:"
    err "  local:  $LOCAL"
    err "  origin: $REMOTE"
    err "Hacé git pull o git push primero."
    exit 1
  fi
fi

# ─── 5. Verificar acceso al NAS ───
if [ ! -d "$BACKUP_ROOT" ]; then
  err "NAS no accesible: $BACKUP_ROOT"
  err "Verificá conexión SMB al NAS1821 desde el explorador de Windows"
  exit 1
fi

# Crear estructura si no existe
mkdir -p "$BACKUP_ROOT/code" "$BACKUP_ROOT/db-dumps" "$BACKUP_ROOT/_archive"

# ─── 6. Calcular nombre del snapshot ───
# Versión: primera entrada del CHANGELOG con formato ## [X.Y.Z]
VERSION="unknown"
if [ -f CHANGELOG.md ]; then
  VERSION=$(grep -oE '## \[[0-9]+\.[0-9]+\.[0-9]+\]' CHANGELOG.md 2>/dev/null \
            | head -n1 \
            | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "unknown")
fi

# Label: arg 1 explícito, o slug del último commit subject
if [ "$#" -ge 1 ] && [ -n "$1" ]; then
  LABEL="$1"
else
  # Saca el subject del último commit, le quita prefijo "type(scope): "
  # y lo convierte a slug ascii lowercase con guiones
  LAST_MSG=$(git log -1 --pretty=%s 2>/dev/null || echo "snapshot")
  LABEL=$(printf '%s' "$LAST_MSG" \
          | sed -E 's/^[a-z]+(\([^)]+\))?:\s*//' \
          | tr '[:upper:]' '[:lower:]' \
          | tr -cs 'a-z0-9' '-' \
          | sed 's/^-//;s/-$//' \
          | cut -c1-60)
  [ -z "$LABEL" ] && LABEL="snapshot"
fi

SHORT_SHA=$(git rev-parse --short HEAD)
TS=$(date +%Y-%m-%d-%H%M)
NAME="tech-trafo-v${VERSION}-${LABEL}-${SHORT_SHA}-${TS}"

# ─── 7. Generar snapshot ───
info "Creando snapshot…"
printf "  versión: %s%s%s\n" "$C_BOLD" "$VERSION" "$C_RESET"
printf "  label:   %s%s%s\n" "$C_BOLD" "$LABEL" "$C_RESET"
printf "  sha:     %s%s%s\n" "$C_BOLD" "$SHORT_SHA" "$C_RESET"
printf "  archivo: %s.zip\n" "$NAME"

# git archive a temp + mover (evita locks en NAS)
TMP_ZIP=$(mktemp -t "tt-backup-XXXXXX.zip")
trap 'rm -f "$TMP_ZIP"' EXIT

git archive --format=zip HEAD -o "$TMP_ZIP"
mv "$TMP_ZIP" "$BACKUP_ROOT/code/${NAME}.zip"
trap - EXIT

# ─── 8. Refrescar README + CHANGELOG en raíz del backup ───
[ -f README.md ]    && cp README.md    "$BACKUP_ROOT/README.md"
[ -f CHANGELOG.md ] && cp CHANGELOG.md "$BACKUP_ROOT/CHANGELOG.md"

# ─── 9. Reporte ───
SIZE=$(du -h "$BACKUP_ROOT/code/${NAME}.zip" | cut -f1)
TOTAL=$(find "$BACKUP_ROOT/code" -maxdepth 1 -name '*.zip' 2>/dev/null | wc -l | tr -d ' ')

echo ""
ok "Snapshot creado · ${SIZE}"
printf "  %s↳%s %s/code/%s.zip\n" "$C_CYAN" "$C_RESET" "$BACKUP_ROOT" "$NAME"
ok "README.md + CHANGELOG.md refrescados en raíz del backup"
printf "  %s↳%s Total snapshots históricos: %s%s%s\n" "$C_CYAN" "$C_RESET" "$C_BOLD" "$TOTAL" "$C_RESET"
echo ""
