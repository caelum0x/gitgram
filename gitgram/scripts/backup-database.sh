#!/bin/bash

# Automated Backup Script for Gitgram Production Database
# This script creates automated backups with rotation and compression

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/var/backups/gitgram}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
S3_BUCKET="${S3_BUCKET:-}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="gitgram_backup_${TIMESTAMP}.sql.gz"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Load environment variables
if [ -f .env.production ]; then
  export $(cat .env.production | grep -v '^#' | xargs)
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}❌ ERROR: DATABASE_URL is not set${NC}"
  exit 1
fi

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo -e "${GREEN}🔄 Starting database backup...${NC}"
echo "Timestamp: $TIMESTAMP"
echo "Backup file: $BACKUP_FILE"

# Create backup
echo -e "${YELLOW}📦 Creating database dump...${NC}"
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_DIR/$BACKUP_FILE"

if [ $? -eq 0 ]; then
  BACKUP_SIZE=$(du -h "$BACKUP_DIR/$BACKUP_FILE" | cut -f1)
  echo -e "${GREEN}✅ Backup created successfully: $BACKUP_SIZE${NC}"
else
  echo -e "${RED}❌ Backup failed${NC}"
  exit 1
fi

# Upload to S3 if configured
if [ -n "$S3_BUCKET" ]; then
  echo -e "${YELLOW}☁️  Uploading to S3...${NC}"
  
  if command -v aws &> /dev/null; then
    aws s3 cp "$BACKUP_DIR/$BACKUP_FILE" "s3://$S3_BUCKET/backups/$BACKUP_FILE"
    
    if [ $? -eq 0 ]; then
      echo -e "${GREEN}✅ Uploaded to S3 successfully${NC}"
    else
      echo -e "${RED}❌ S3 upload failed${NC}"
    fi
  else
    echo -e "${YELLOW}⚠️  AWS CLI not installed, skipping S3 upload${NC}"
  fi
fi

# Remove old backups
echo -e "${YELLOW}🧹 Cleaning up old backups (older than $RETENTION_DAYS days)...${NC}"
find "$BACKUP_DIR" -name "gitgram_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete

REMAINING_BACKUPS=$(ls -1 "$BACKUP_DIR"/gitgram_backup_*.sql.gz 2>/dev/null | wc -l)
echo -e "${GREEN}✅ Cleanup complete. Remaining backups: $REMAINING_BACKUPS${NC}"

# List recent backups
echo ""
echo -e "${GREEN}📋 Recent backups:${NC}"
ls -lh "$BACKUP_DIR"/gitgram_backup_*.sql.gz 2>/dev/null | tail -5 || echo "No backups found"

# Send notification (optional)
if [ -n "$SLACK_WEBHOOK_URL" ]; then
  curl -X POST "$SLACK_WEBHOOK_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"text\":\"✅ Gitgram database backup completed: $BACKUP_FILE ($BACKUP_SIZE)\"}" \
    &> /dev/null
fi

echo ""
echo -e "${GREEN}✅ Backup process completed successfully!${NC}"

# Exit with success
exit 0
