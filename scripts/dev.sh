#!/usr/bin/env bash
# =============================================================================
# dev.sh — Developer onboarding script for the Gitgram + AITM monorepo
# =============================================================================
# Usage:
#   bash scripts/dev.sh           # full setup (infra + deps + migrations)
#   bash scripts/dev.sh --infra   # infra only (postgres + redis)
#   bash scripts/dev.sh --help    # show this help
# =============================================================================
set -euo pipefail

# -----------------------------------------------------------------------------
# Colours
# -----------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

ok()   { echo -e "  ${GREEN}✔${RESET}  $*"; }
info() { echo -e "  ${CYAN}→${RESET}  $*"; }
warn() { echo -e "  ${YELLOW}⚠${RESET}  $*"; }
fail() { echo -e "  ${RED}✘${RESET}  $*"; exit 1; }
step() { echo -e "\n${BOLD}${CYAN}[dev.sh]${RESET} ${BOLD}$*${RESET}"; }

# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

infra_only=false
for arg in "$@"; do
  case "$arg" in
    --infra) infra_only=true ;;
    --help|-h)
      echo "Usage: bash scripts/dev.sh [--infra] [--help]"
      echo "  --infra   Start Postgres + Redis only, skip npm/migrations"
      exit 0
      ;;
  esac
done

# -----------------------------------------------------------------------------
# 1. Prerequisite checks
# -----------------------------------------------------------------------------
step "Checking prerequisites"

# Node >= 20
if command -v node &>/dev/null; then
  NODE_MAJOR=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
  if [[ "$NODE_MAJOR" -ge 20 ]]; then
    ok "node $(node --version)"
  else
    fail "Node.js 20+ required (found $(node --version)). Use nvm: nvm install 20"
  fi
else
  fail "node not found. Install Node.js 20+: https://nodejs.org"
fi

# npm
if command -v npm &>/dev/null; then
  ok "npm $(npm --version)"
else
  fail "npm not found"
fi

# Docker
if command -v docker &>/dev/null; then
  if docker info &>/dev/null 2>&1; then
    ok "docker $(docker --version | awk '{print $3}' | tr -d ',')"
  else
    fail "Docker daemon is not running. Start Docker Desktop (or your daemon) and retry."
  fi
else
  fail "docker not found. Install Docker Desktop: https://docs.docker.com/get-docker/"
fi

# docker compose (v2 plugin)
if docker compose version &>/dev/null 2>&1; then
  ok "docker compose $(docker compose version --short 2>/dev/null || echo 'v2')"
else
  fail "docker compose (v2) not found. Update Docker Desktop or install the plugin."
fi

# git
if command -v git &>/dev/null; then
  ok "git $(git --version | awk '{print $3}')"
else
  warn "git not found — version control features will be limited."
fi

# -----------------------------------------------------------------------------
# 2. Copy .env.example → .env (never overwrites existing files)
# -----------------------------------------------------------------------------
step "Setting up environment files"

copy_env() {
  local example="$REPO_ROOT/$1"
  local target="$REPO_ROOT/$2"
  if [[ ! -f "$example" ]]; then
    warn "Example not found: $1 (skipping)"
    return
  fi
  if [[ -f "$target" ]]; then
    ok "$2 already exists — skipping"
  else
    cp "$example" "$target"
    ok "Created $2 from $1"
    warn "  Edit $2 and fill in any required secrets before running services."
  fi
}

copy_env ".env.gitgram.example"       ".env.gitgram"
copy_env ".env.gitgram-web.example"   ".env.gitgram-web"
copy_env ".env.aitm-api.example"      ".env.aitm-api"
copy_env ".env.aitm-website.example"  ".env.aitm-website"
copy_env ".env.postgres.example"      ".env.postgres"

# -----------------------------------------------------------------------------
# 3. Start infrastructure (postgres + redis)
# -----------------------------------------------------------------------------
step "Starting infrastructure (postgres + redis)"

cd "$REPO_ROOT"

docker compose up -d postgres redis

info "Waiting for postgres to be healthy…"
RETRIES=20
until docker compose exec -T postgres pg_isready -U gitgram -d gitgram &>/dev/null; do
  RETRIES=$((RETRIES - 1))
  if [[ $RETRIES -le 0 ]]; then
    fail "Postgres did not become healthy after 100 s. Check: docker compose logs postgres"
  fi
  sleep 5
done
ok "Postgres is healthy"

info "Waiting for redis to be healthy…"
RETRIES=10
until docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; do
  RETRIES=$((RETRIES - 1))
  if [[ $RETRIES -le 0 ]]; then
    fail "Redis did not become healthy after 50 s. Check: docker compose logs redis"
  fi
  sleep 5
done
ok "Redis is healthy"

if $infra_only; then
  echo ""
  echo -e "${GREEN}${BOLD}Infrastructure is up.${RESET}"
  echo -e "  Postgres → ${CYAN}postgresql://gitgram:gitgram_dev@localhost:5432/gitgram${RESET}"
  echo -e "  Redis    → ${CYAN}redis://localhost:6379${RESET}"
  exit 0
fi

# -----------------------------------------------------------------------------
# 4. Install npm dependencies
# -----------------------------------------------------------------------------
step "Installing npm dependencies"

PACKAGES=(
  "gitgram/backend"
  "gitgram/web"
  "aitimemachine/api-server"
  "aitimemachine/mcp"
)

for pkg in "${PACKAGES[@]}"; do
  pkg_path="$REPO_ROOT/$pkg"
  if [[ -f "$pkg_path/package.json" ]]; then
    info "npm ci → $pkg"
    npm ci --prefix "$pkg_path" --silent
    ok "$pkg"
  else
    warn "$pkg/package.json not found — skipping"
  fi
done

# -----------------------------------------------------------------------------
# 5. Run database migrations
# -----------------------------------------------------------------------------
step "Running database migrations"

# Gitgram backend — Prisma
GITGRAM_BACKEND="$REPO_ROOT/gitgram/backend"
if [[ -f "$GITGRAM_BACKEND/package.json" ]]; then
  info "Prisma migrate deploy → gitgram/backend"
  DATABASE_URL="postgresql://gitgram:gitgram_dev@localhost:5432/gitgram" \
    npx --prefix "$GITGRAM_BACKEND" prisma migrate deploy 2>&1 | tail -5
  ok "Gitgram migrations applied"
else
  warn "gitgram/backend not found — skipping Prisma migration"
fi

# AITM API — Drizzle
AITM_API="$REPO_ROOT/aitimemachine/api-server"
if [[ -f "$AITM_API/package.json" ]]; then
  AITM_MIGRATE_SCRIPT=$(node -e "const p=require('$AITM_API/package.json'); process.stdout.write(p.scripts&&p.scripts['db:migrate']?'db:migrate':p.scripts&&p.scripts['migrate']?'migrate':'')" 2>/dev/null || true)
  if [[ -n "$AITM_MIGRATE_SCRIPT" ]]; then
    info "npm run $AITM_MIGRATE_SCRIPT → aitimemachine/api-server"
    DATABASE_URL="postgresql://gitgram:gitgram_dev@localhost:5432/gitgram" \
      npm run "$AITM_MIGRATE_SCRIPT" --prefix "$AITM_API" 2>&1 | tail -5
    ok "AITM migrations applied"
  else
    warn "No migrate script found in aitimemachine/api-server/package.json — skipping"
  fi
else
  warn "aitimemachine/api-server not found — skipping Drizzle migration"
fi

# -----------------------------------------------------------------------------
# Done
# -----------------------------------------------------------------------------
echo ""
echo -e "${GREEN}${BOLD}Dev environment is ready.${RESET}"
echo ""
echo -e "  ${BOLD}Infrastructure${RESET}"
echo -e "    Postgres  → ${CYAN}postgresql://gitgram:gitgram_dev@localhost:5432/gitgram${RESET}"
echo -e "    Redis     → ${CYAN}redis://localhost:6379${RESET}"
echo ""
echo -e "  ${BOLD}Start all services${RESET}"
echo -e "    ${CYAN}docker compose up${RESET}"
echo -e "    ${CYAN}docker compose --profile tools up${RESET}  (+ GitNexus + Context7)"
echo ""
echo -e "  ${BOLD}Start individual services (native, hot-reload)${RESET}"
echo -e "    ${CYAN}npm run dev:gitgram-backend${RESET}  →  http://localhost:4000"
echo -e "    ${CYAN}npm run dev:gitgram-web${RESET}      →  http://localhost:3000"
echo -e "    ${CYAN}npm run dev:aitm-api${RESET}         →  http://localhost:3001"
echo -e "    ${CYAN}npm run dev:aitm-mcp${RESET}         →  stdio / http://localhost:3003"
echo ""
echo -e "  ${BOLD}Tear down${RESET}"
echo -e "    ${CYAN}docker compose down -v${RESET}       (removes volumes too)"
echo ""
