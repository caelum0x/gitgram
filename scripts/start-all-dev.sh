#!/usr/bin/env bash
# start-all-dev.sh
# Starts all core dev services for the Gitgram-AI monorepo:
#
#   Service                    Port / URL
#   ────────────────────────   ─────────────────────────────
#   gitgram/backend            http://localhost:3000
#   gitgram/web (Next.js)      http://localhost:3001  (next dev default = 3000,
#                              but backend already owns that, so web uses 3001
#                              via PORT env — or the Next.js default if unset)
#   aitimemachine/api-server   http://localhost:3001  (its own default)
#
# NOTE: gitgram/backend defaults to PORT 3000.
#       aitimemachine/api-server defaults to PORT 3001.
#       gitgram/web (Next.js) defaults to PORT 3000; to avoid clash it is
#       started on PORT 3002 here.  Override with GITGRAM_WEB_PORT env var.
#
# Uses `concurrently` when available (npm install -g concurrently).
# Falls back to printing manual commands.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ── colours ──────────────────────────────────────────────────────────────────
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RESET='\033[0m'

# ── configurable ports ────────────────────────────────────────────────────────
BACKEND_PORT="${GITGRAM_BACKEND_PORT:-3000}"
WEB_PORT="${GITGRAM_WEB_PORT:-3002}"
AITM_PORT="${AITM_API_PORT:-3001}"

# ── service directories ───────────────────────────────────────────────────────
BACKEND_DIR="$ROOT/gitgram/backend"
WEB_DIR="$ROOT/gitgram/web"
AITM_DIR="$ROOT/aitimemachine/api-server"

# ── banner ────────────────────────────────────────────────────────────────────
echo -e "\n${CYAN}Gitgram-AI — dev services${RESET}"
echo ""
echo "  Service                       Command              URL"
echo "  ─────────────────────────────────────────────────────────────────────"
echo "  gitgram/backend               npm run dev          http://localhost:${BACKEND_PORT}"
echo "  gitgram/web (Next.js)         npm run dev          http://localhost:${WEB_PORT}"
echo "  aitimemachine/api-server      npm run dev          http://localhost:${AITM_PORT}"
echo ""

# ── preflight checks ─────────────────────────────────────────────────────────
MISSING=()
for pair in "gitgram/backend:$BACKEND_DIR" "gitgram/web:$WEB_DIR" "aitimemachine/api-server:$AITM_DIR"; do
  name="${pair%%:*}"
  dir="${pair#*:}"
  if [[ ! -d "$dir" ]]; then
    echo -e "${YELLOW}[warn]${RESET} Directory not found: $dir (${name} will be skipped)"
    MISSING+=("$name")
  fi
done

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo ""
fi

# Build the npm dev commands with explicit PORT assignments
BACKEND_CMD="cd \"$BACKEND_DIR\" && PORT=$BACKEND_PORT npm run dev"
WEB_CMD="cd \"$WEB_DIR\" && PORT=$WEB_PORT npm run dev"
AITM_CMD="cd \"$AITM_DIR\" && PORT=$AITM_PORT npm run dev"

# ── try concurrently ─────────────────────────────────────────────────────────
if command -v concurrently &>/dev/null; then
  echo -e "${GREEN}Starting all services with concurrently...${RESET}"
  echo "(Press Ctrl+C to stop all)"
  echo ""

  # Build argument list; skip missing service dirs
  CONC_ARGS=()
  CONC_NAMES=()

  [[ ! " ${MISSING[*]} " =~ " gitgram/backend " ]] && {
    CONC_ARGS+=("$BACKEND_CMD")
    CONC_NAMES+=("backend")
  }
  [[ ! " ${MISSING[*]} " =~ " gitgram/web " ]] && {
    CONC_ARGS+=("$WEB_CMD")
    CONC_NAMES+=("web")
  }
  [[ ! " ${MISSING[*]} " =~ " aitimemachine/api-server " ]] && {
    CONC_ARGS+=("$AITM_CMD")
    CONC_NAMES+=("aitm-api")
  }

  if [[ ${#CONC_ARGS[@]} -eq 0 ]]; then
    echo "No service directories found. Nothing to start."
    exit 1
  fi

  # Build --names flag
  NAMES_FLAG="$(IFS=','; echo "${CONC_NAMES[*]}")"

  concurrently \
    --kill-others-on-fail \
    --prefix "[{name}]" \
    --names "$NAMES_FLAG" \
    --prefix-colors "cyan,magenta,green" \
    "${CONC_ARGS[@]}"

else
  # ── fallback: print manual commands ────────────────────────────────────────
  echo -e "${YELLOW}concurrently not found.${RESET}"
  echo "Install it globally to start all services in one terminal:"
  echo "  npm install -g concurrently"
  echo ""
  echo "To start services manually, open three terminal windows and run:"
  echo ""
  echo "  # Terminal 1 — gitgram/backend"
  if [[ ! " ${MISSING[*]} " =~ " gitgram/backend " ]]; then
    echo "  cd $BACKEND_DIR"
    echo "  PORT=$BACKEND_PORT npm run dev"
  else
    echo "  (directory not found: $BACKEND_DIR)"
  fi
  echo ""
  echo "  # Terminal 2 — gitgram/web"
  if [[ ! " ${MISSING[*]} " =~ " gitgram/web " ]]; then
    echo "  cd $WEB_DIR"
    echo "  PORT=$WEB_PORT npm run dev"
  else
    echo "  (directory not found: $WEB_DIR)"
  fi
  echo ""
  echo "  # Terminal 3 — aitimemachine/api-server"
  if [[ ! " ${MISSING[*]} " =~ " aitimemachine/api-server " ]]; then
    echo "  cd $AITM_DIR"
    echo "  PORT=$AITM_PORT npm run dev"
  else
    echo "  (directory not found: $AITM_DIR)"
  fi
  echo ""
  echo "Port overrides (set before running this script):"
  echo "  GITGRAM_BACKEND_PORT=3000  (default)"
  echo "  GITGRAM_WEB_PORT=3002      (default)"
  echo "  AITM_API_PORT=3001         (default)"
fi
