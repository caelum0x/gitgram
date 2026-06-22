#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Deprecated full-docker log helper
# Usage: bash deploy/logs.sh [service-name]
# Canonical runtime logs: pm2 logs ... per docs/runbook.md
# =============================================================================

COMPOSE_FILE="docker-compose.prod.yml"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$PROJECT_DIR"

SERVICE="${1:-}"

if [ -n "$SERVICE" ]; then
    echo "This script targets the non-canonical docker-compose.prod.yml path."
    echo "Tailing logs for: $SERVICE"
    docker compose -f "$COMPOSE_FILE" logs -f --tail=100 "$SERVICE"
else
    echo "This script targets the non-canonical docker-compose.prod.yml path."
    echo "Tailing logs for all services"
    docker compose -f "$COMPOSE_FILE" logs -f --tail=50
fi
