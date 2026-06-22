#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Deprecated full-docker rehearsal script
# Run from project root: bash deploy/deploy.sh
# Canonical launch path: docs/runbook.md
# =============================================================================

COMPOSE_FILE="docker-compose.prod.yml"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$PROJECT_DIR"

echo "========================================="
echo " Deprecated Docker Rehearsal Deploy"
echo "========================================="
echo "This script is not the canonical launch path."
echo "Use docs/runbook.md for the PM2-based manual launch contract."
echo ""

# Pull latest code
if [ -d .git ]; then
    echo "[1/4] Pulling latest code..."
    git pull --ff-only
else
    echo "[1/4] Not a git repo, skipping pull."
fi

# Build all images
echo "[2/4] Building Docker images..."
docker compose -f "$COMPOSE_FILE" build

# Start/restart services
echo "[3/4] Starting services..."
docker compose -f "$COMPOSE_FILE" up -d

# Cleanup old images
echo "[4/4] Cleaning up old images..."
docker image prune -f

echo ""
echo "========================================="
echo " Deployment Complete!"
echo "========================================="
echo ""
docker compose -f "$COMPOSE_FILE" ps
