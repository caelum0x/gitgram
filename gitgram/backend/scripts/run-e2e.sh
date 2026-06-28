#!/usr/bin/env bash
# =============================================================================
# Run the Gitgram backend E2E suite against an ephemeral Postgres + Redis.
#
# Spins up docker-compose.test.yml, points DATABASE_URL / REDIS_URL at the
# containers, runs the E2E Jest config, and tears the containers down.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${BACKEND_DIR}/docker-compose.test.yml"

export DATABASE_URL="postgresql://gitgram_test:gitgram_test@localhost:5433/gitgram_test"
export REDIS_URL="redis://localhost:6380"
export NODE_ENV="test"

cleanup() {
  docker compose -f "${COMPOSE_FILE}" down -v >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> Starting ephemeral Postgres + Redis"
docker compose -f "${COMPOSE_FILE}" up -d --wait

echo "==> Running E2E suite"
cd "${BACKEND_DIR}"
npm run test:e2e
