#!/usr/bin/env bash
# setup-aitm-tools.sh
# Builds and configures all AITM companion tools:
#   - beads           (Go binary, external/beads/cmd/bd)
#   - gitnexus        (npm, external/gitnexus/gitnexus)
#   - pal-mcp-server  (Python venv, external/pal-mcp-server)
#   - context7 mcp    (pnpm/npm, external/context7/packages/mcp)
#
# Designed to be defensive: a failure in one tool does NOT abort the others.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXTERNAL="$ROOT/external"

# ── colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

ok()   { echo -e "${GREEN}[ok]${RESET}  $*"; }
warn() { echo -e "${YELLOW}[warn]${RESET} $*"; }
fail() { echo -e "${RED}[fail]${RESET} $*"; }
step() { echo -e "\n${CYAN}==> $*${RESET}"; }

ERRORS=()

# ── helpers ───────────────────────────────────────────────────────────────────
require_dir() {
  local dir="$1" name="$2"
  if [[ ! -d "$dir" ]]; then
    fail "$name directory not found: $dir"
    return 1
  fi
  return 0
}

# Run a named build function; record failure but continue
run_step() {
  local name="$1"; shift
  if "$@"; then
    ok "$name done"
  else
    fail "$name FAILED (exit $?)"
    ERRORS+=("$name")
  fi
}

# ── 1. beads (Go) ─────────────────────────────────────────────────────────────
build_beads() {
  step "beads — Go binary (cmd/bd)"

  if ! command -v go &>/dev/null; then
    warn "Go not found — skipping beads build"
    warn "Install from https://go.dev/dl/"
    return 0
  fi

  local beads_dir="$EXTERNAL/beads"
  require_dir "$beads_dir" "beads" || return 1

  # Prefer cmd/bd; fall back to cmd/beads or root package
  local cmd_path=""
  if [[ -f "$beads_dir/cmd/bd/main.go" ]]; then
    cmd_path="./cmd/bd"
  elif [[ -f "$beads_dir/cmd/beads/main.go" ]]; then
    cmd_path="./cmd/beads"
  else
    warn "No cmd/bd or cmd/beads found — attempting root package build"
    cmd_path="."
  fi

  local out_bin="$beads_dir/bd"
  (
    cd "$beads_dir"
    go build -o "$out_bin" "$cmd_path"
  )
  ok "beads binary at $out_bin"
  echo "  run:  $out_bin --help"
}

# ── 2. gitnexus (npm) ─────────────────────────────────────────────────────────
build_gitnexus() {
  step "gitnexus — npm install + build"

  local gnx_dir="$EXTERNAL/gitnexus"
  require_dir "$gnx_dir" "gitnexus" || return 1

  # The main CLI lives in the gitnexus/ sub-package
  local pkg_dir="$gnx_dir/gitnexus"
  if [[ ! -d "$pkg_dir" ]]; then
    warn "gitnexus/gitnexus sub-directory not found; trying root"
    pkg_dir="$gnx_dir"
  fi

  if ! command -v npm &>/dev/null; then
    fail "npm not found — cannot build gitnexus"
    return 1
  fi

  (
    cd "$pkg_dir"
    echo "  Installing dependencies..."
    npm install --prefer-offline --no-fund --no-audit 2>&1 | tail -3
    echo "  Building..."
    npm run build 2>&1 | tail -5
  )
  ok "gitnexus built in $pkg_dir"
}

# ── 3. pal-mcp-server (Python venv) ───────────────────────────────────────────
setup_pal_mcp() {
  step "pal-mcp-server — Python venv + requirements"

  local pal_dir="$EXTERNAL/pal-mcp-server"
  require_dir "$pal_dir" "pal-mcp-server" || return 1

  if ! command -v python3 &>/dev/null; then
    fail "python3 not found — cannot set up pal-mcp-server"
    fail "Install Python 3.10+ from https://python.org"
    return 1
  fi

  local python_version
  python_version="$(python3 --version 2>&1)"
  echo "  Using $python_version"

  local venv_dir="$pal_dir/.venv"

  if [[ ! -d "$venv_dir" ]]; then
    echo "  Creating venv at $venv_dir ..."
    python3 -m venv "$venv_dir"
  else
    echo "  venv already exists, reusing"
  fi

  local pip="$venv_dir/bin/pip"

  if [[ -f "$pal_dir/requirements.txt" ]]; then
    echo "  Installing requirements.txt ..."
    "$pip" install --quiet -r "$pal_dir/requirements.txt"
  else
    warn "requirements.txt not found in $pal_dir"
  fi

  if [[ -f "$pal_dir/requirements-dev.txt" ]]; then
    echo "  Installing requirements-dev.txt ..."
    "$pip" install --quiet -r "$pal_dir/requirements-dev.txt"
  fi

  ok "pal-mcp-server venv ready at $venv_dir"
  echo "  activate: source $venv_dir/bin/activate"
  echo "  run:      $venv_dir/bin/python $pal_dir/server.py"
}

# ── 4. context7 packages/mcp ──────────────────────────────────────────────────
build_context7_mcp() {
  step "context7 — packages/mcp build"

  local ctx7_dir="$EXTERNAL/context7"
  require_dir "$ctx7_dir" "context7" || return 1

  local mcp_dir="$ctx7_dir/packages/mcp"
  require_dir "$mcp_dir" "context7/packages/mcp" || return 1

  # Prefer pnpm (the repo uses pnpm workspaces), fall back to npm
  local pkg_cmd
  if command -v pnpm &>/dev/null; then
    pkg_cmd="pnpm"
  elif command -v npm &>/dev/null; then
    pkg_cmd="npm"
    warn "pnpm not found; falling back to npm (workspace installs may be incomplete)"
  else
    fail "Neither pnpm nor npm found — cannot build context7"
    return 1
  fi

  (
    cd "$mcp_dir"
    echo "  Installing dependencies (${pkg_cmd})..."
    "$pkg_cmd" install --prefer-offline 2>&1 | tail -3
    echo "  Building..."
    "$pkg_cmd" run build 2>&1 | tail -5
  )
  ok "context7/packages/mcp built"
  echo "  run:  node $mcp_dir/dist/index.js --transport http"
}

# ── main ──────────────────────────────────────────────────────────────────────
echo -e "\n${CYAN}AITM companion tools setup${RESET}"
echo "Repository root: $ROOT"
echo "External tools:  $EXTERNAL"

run_step "beads"          build_beads
run_step "gitnexus"       build_gitnexus
run_step "pal-mcp-server" setup_pal_mcp
run_step "context7-mcp"   build_context7_mcp

echo ""
echo "----------------------------------------------"
if [[ ${#ERRORS[@]} -eq 0 ]]; then
  echo -e "${GREEN}All tools set up successfully.${RESET}"
else
  echo -e "${RED}Setup completed with errors in: ${ERRORS[*]}${RESET}"
  echo "Review the output above, fix the issues, then re-run."
  exit 1
fi

echo ""
echo "Quick reference:"
echo "  beads:          $EXTERNAL/beads/bd --help"
echo "  gitnexus:       cd $EXTERNAL/gitnexus/gitnexus && npm run serve"
echo "  pal-mcp-server: source $EXTERNAL/pal-mcp-server/.venv/bin/activate && python $EXTERNAL/pal-mcp-server/server.py"
echo "  context7-mcp:   node $EXTERNAL/context7/packages/mcp/dist/index.js --transport http"
