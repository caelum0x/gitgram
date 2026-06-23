#!/bin/bash

# Database Restore Script
# This script restores a database backup

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/var/backups/gitgram}"

# Load environment variables
if [ -f .env.production ]; then
  export $(cat .env.production | grep -v '^#' | xargs)
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}❌ ERROR: DATABASE_URL is not set${NC}"
  exit 1
fi

# Check if backup file is provided
if [ -z "$1" ]; then
  echo -e "${YELLOW}Available backups:${NC}"
  ls -lh "$BACKUP_DIR"/gitgram_backup_*.sql.gz 2>/dev/null || echo "No backups found"
  echo ""
  echo "Usage: $0 <backup_file>"
  echo "Example: $0 gitgram_backup_20250101_120000.sql.gz"
  exit 1
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [ ! -f "$BACKUP_DIR/$BACKUP_FILE" ]; then
  echo -e "${RED}❌ ERROR: Backup file not found: $BACKUP_DIR/$BACKUP_FILE${NC}"
  exit 1
fi

# Confirmation prompt
echo -e "${YELLOW}⚠️  WARNING: This will restore the database from backup${NC}"
echo "Backup file: $BACKUP_FILE"
echo "Database: $DATABASE_URL"
echo ""
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo -e "${YELLOW}Restore cancelled${NC}"
  exit 0
fi

# Create a backup of current database before restore
echo -e "${YELLOW}📦 Creating safety backup of current database...${NC}"
SAFETY_BACKUP="gitgram_pre_restore_$(date +%Y%m%d_%H%M%S).sql.gz"
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_DIR/$SAFETY_BACKUP"
echo -e "${GREEN}✅ Safety backup created: $SAFETY_BACKUP${NC}"

# Restore database
echo -e "${YELLOW}🔄 Restoring database...${NC}"
gunzip -c "$BACKUP_DIR/$BACKUP_FILE" | psql "$DATABASE_URL"

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Database restored successfully${NC}"
else
  echo -e "${RED}❌ Restore failed${NC}"
  echo -e "${YELLOW}You can restore from safety backup: $SAFETY_BACKUP${NC}"
  exit 1
fi

# Run migrations to ensure schema is up to date
echo -e "${YELLOW}🔄 Running migrations...${NC}"
cd "$(dirname "$0")/../backend"
npx prisma migrate deploy

echo ""
echo -e "${GREEN}✅ Restore process completed successfully!${NC}"

exit 0
