#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# session-start.sh — Arranque de sesión (correr al INICIAR en cualquier PC)
# ═══════════════════════════════════════════════════════════════════
# Asegura que el server .23 (fuente de verdad del codigo) esté al día con
# GitHub antes de empezar a trabajar, y muestra el estado para que Claude
# (y vos) sepan exactamente dónde quedó todo, sin importar desde qué PC.
#
# Uso (desde cualquier PC):
#   plink -ssh -pw "techtrafo$" techtrafo@192.168.0.23 \
#     'bash /home/techtrafo/techtrafo/scripts/session-start.sh'
# ═══════════════════════════════════════════════════════════════════
set -uo pipefail
cd /home/techtrafo/techtrafo

echo "═══ ARRANQUE DE SESIÓN · $(date) ═══"
echo

# 1) Traer lo último de GitHub
echo "→ git fetch origin..."
git fetch -q origin 2>&1

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
DIRTY=$(git status --porcelain | wc -l | tr -d ' ')

# 2) Si hay trabajo sin commitear en el server, AVISAR (no pisar)
if [ "$DIRTY" -ne 0 ]; then
  echo "⚠ HAY $DIRTY cambios sin commitear en el server:"
  git status --short
  echo "  → Revisar antes de continuar. NO se hizo pull para no pisarlos."
else
  # 3) Working tree limpio → alinear con origin/main
  if [ "$LOCAL" != "$REMOTE" ]; then
    echo "→ Actualizando server a origin/main..."
    git merge --ff-only origin/main 2>&1 | tail -2 || {
      echo "⚠ No se pudo fast-forward (server diverge). Revisar manualmente."
    }
  else
    echo "✓ Server ya estaba sincronizado con GitHub."
  fi
fi

echo
echo "═══ ESTADO ACTUAL ═══"
echo "HEAD:        $(git rev-parse --short HEAD)  ($(git log -1 --pretty=%s | cut -c1-70))"
echo "origin/main: $(git rev-parse --short origin/main)"
echo
echo "→ Últimos 5 commits:"
git log -5 --pretty='  %h  %ad  %s' --date=format:'%m-%d %H:%M' 2>&1
echo
echo "→ Containers del panel:"
docker ps --format '  {{.Names}}: {{.Status}}' 2>/dev/null | grep techtrafo | head
echo
echo "Tip: leer HANDOFF.md §0 para el estado al cierre de la última sesión."
echo "═══ Listo para trabajar ═══"
