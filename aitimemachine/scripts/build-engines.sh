#!/usr/bin/env bash
#
# build-engines.sh — build every vendored repo that AITM merges in as a
# first-party engine, then link them so api-server / mcp resolve in-process.
#
# Engines:
#   memory   : beads (Go binary)        + context7 (TS SDK)
#   git      : git (vendored C source)  + gitnexus (TS lib) + gitnexus-shared
#   agentic  : a2a (@a2a-js/sdk TS)     + pal-mcp-server (Python venv)
#
# Idempotent. Optional steps soft-fail (logged) so a missing toolchain for one
# engine never blocks the others. Run from anywhere.
set -uo pipefail

AITM_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="$AITM_ROOT/bin"
ENGINES_DIR="$AITM_ROOT/engines"
mkdir -p "$BIN_DIR" "$ENGINES_DIR"

ok()   { printf '\033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '\033[33m⚠\033[0m %s\n' "$1"; }
step() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }

# ── TS workspaces (must build before api-server / mcp can resolve imports) ──
step "TS engine libraries"

build_ts() {
  local dir="$1" label="$2" cmd="${3:-npm run build}"
  if [ -d "$AITM_ROOT/$dir" ]; then
    ( cd "$AITM_ROOT/$dir" && eval "$cmd" ) && ok "$label built" || warn "$label build failed (run npm install first?)"
  else
    warn "$label: $dir missing — skipped"
  fi
}

build_ts "gitnexus-shared" "gitnexus-shared"
build_ts "context7/packages/sdk" "@upstash/context7-sdk"
build_ts "a2a" "@a2a-js/sdk"
# gitnexus has a custom builder that inlines gitnexus-shared and emits the library entry
build_ts "gitnexus" "gitnexus" "node scripts/build.js"

# ── beads (Go) → bundled bd binary ──
step "beads (Go task/issue memory)"
if command -v go >/dev/null 2>&1; then
  ( cd "$AITM_ROOT/beads" && CGO_ENABLED=1 make 2>/dev/null || CGO_ENABLED=1 go build -o bd ./... ) \
    && { [ -f "$AITM_ROOT/beads/bd" ] && cp "$AITM_ROOT/beads/bd" "$BIN_DIR/bd" && chmod +x "$BIN_DIR/bd" && ok "beads → bin/bd"; } \
    || warn "beads build failed"
else
  warn "go not found — beads not built (bd binary will be unavailable)"
fi

# ── git (vendored C source = upstream Git) → bundled git binary ──
step "git (vendored C source)"
if command -v make >/dev/null 2>&1 && command -v cc >/dev/null 2>&1; then
  ( cd "$AITM_ROOT/git" && make -j"$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)" 2>/dev/null ) \
    && { [ -x "$AITM_ROOT/git/git" ] && cp "$AITM_ROOT/git/git" "$BIN_DIR/git" && chmod +x "$BIN_DIR/git" && ok "git → bin/git"; } \
    || warn "git build failed — git-engine falls back to system git"
else
  warn "make/cc not found — git not built; git-engine uses system git"
fi

# ── pal-mcp-server (Python) → bundled venv ──
step "pal-mcp-server (Python agent execution)"
PAL_VENV="${PAL_VENV_DIR:-$ENGINES_DIR/pal}"
if command -v python3 >/dev/null 2>&1; then
  python3 -m venv "$PAL_VENV" \
    && "$PAL_VENV/bin/pip" install --quiet --upgrade pip \
    && "$PAL_VENV/bin/pip" install --quiet "$AITM_ROOT/pal-mcp-server" \
    && ok "pal venv → $PAL_VENV" \
    || warn "pal venv provisioning failed"
else
  warn "python3 not found — PAL engine unavailable"
fi

# ── link new file: deps into api-server + mcp ──
step "link workspace deps"
for pkg in api-server mcp; do
  if [ -f "$AITM_ROOT/$pkg/package.json" ]; then
    ( cd "$AITM_ROOT/$pkg" && npm install --no-audit --no-fund ) && ok "$pkg deps linked" || warn "$pkg npm install failed"
  fi
done

step "done"
ok "Engines built. Verify: GET /v1/health/providers should report beads/context7/gitnexus/pal/git."
echo "  bundled binaries: $BIN_DIR"
echo "  pal venv:         $PAL_VENV"
