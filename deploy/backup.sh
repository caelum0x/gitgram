#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Deprecated full-docker backup helper
# Usage: bash deploy/backup.sh
# Canonical backup procedure: docs/runbook.md
# =============================================================================

COMPOSE_FILE="docker-compose.prod.yml"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="$PROJECT_DIR/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

cd "$PROJECT_DIR"

mkdir -p "$BACKUP_DIR"

echo "========================================="
echo " Deprecated Docker Backup Helper — $TIMESTAMP"
echo "========================================="
echo "This script only applies to the non-canonical docker-compose.prod.yml path."
echo "Use docs/runbook.md for the launch backup gate."
echo ""

# --- PostgreSQL ---
echo "[1/3] Backing up PostgreSQL..."
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dumpall -U "${POSTGRES_USER:-gitgram}" \
  | gzip > "$BACKUP_DIR/postgres_$TIMESTAMP.sql.gz"
echo "  Saved: postgres_$TIMESTAMP.sql.gz ($(du -h "$BACKUP_DIR/postgres_$TIMESTAMP.sql.gz" | cut -f1))"

# --- Redis ---
echo "[2/3] Backing up Redis..."
docker compose -f "$COMPOSE_FILE" exec -T redis redis-cli BGSAVE > /dev/null 2>&1 || true
sleep 2
docker compose -f "$COMPOSE_FILE" cp redis:/data/dump.rdb "$BACKUP_DIR/redis_$TIMESTAMP.rdb" 2>/dev/null || echo "  Redis backup skipped (no dump.rdb)"

# --- Uploads ---
echo "[3/3] Backing up uploads..."
if [ -d "$PROJECT_DIR/gitgram/backend/uploads" ]; then
  tar -czf "$BACKUP_DIR/uploads_$TIMESTAMP.tar.gz" -C "$PROJECT_DIR/gitgram/backend" uploads
  echo "  Saved: uploads_$TIMESTAMP.tar.gz"
else
  echo "  No uploads directory found, skipping."
fi

# --- Cleanup old backups (keep last 7 days) ---
echo ""
echo "Cleaning backups older than 7 days..."
find "$BACKUP_DIR" -name "*.gz" -mtime +7 -delete 2>/dev/null || true
find "$BACKUP_DIR" -name "*.rdb" -mtime +7 -delete 2>/dev/null || true

echo ""
echo "========================================="
echo " Backup Complete!"
echo "========================================="
ls -lh "$BACKUP_DIR"/*_$TIMESTAMP.* 2>/dev/null
