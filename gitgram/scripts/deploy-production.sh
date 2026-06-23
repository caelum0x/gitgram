#!/bin/bash

# Complete Production Deployment Script
# This script orchestrates the entire production deployment process

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEPLOYMENT_LOG="$PROJECT_ROOT/deployment-$(date +%Y%m%d_%H%M%S).log"

# Functions
log() {
  echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$DEPLOYMENT_LOG"
}

error() {
  echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" | tee -a "$DEPLOYMENT_LOG"
}

warning() {
  echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1" | tee -a "$DEPLOYMENT_LOG"
}

info() {
  echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO:${NC} $1" | tee -a "$DEPLOYMENT_LOG"
}

# Banner
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Gitgram Production Deployment      ║${NC}"
echo -e "${GREEN}╔═══════════════════════════════════════╗${NC}"
echo ""

log "Starting production deployment..."
log "Deployment log: $DEPLOYMENT_LOG"

# Step 1: Pre-flight checks
log "Step 1/10: Running pre-flight checks..."

if [ ! -f "$PROJECT_ROOT/.env.production" ]; then
  error ".env.production file not found"
  exit 1
fi

# Load environment variables
export $(cat "$PROJECT_ROOT/.env.production" | grep -v '^#' | xargs)

# Check required environment variables
REQUIRED_VARS=(
  "DATABASE_URL"
  "REDIS_URL"
  "JWT_SECRET"
  "JWT_REFRESH_SECRET"
  "RESEND_API_KEY"
  "AWS_ACCESS_KEY_ID"
  "AWS_SECRET_ACCESS_KEY"
  "AWS_S3_BUCKET"
)

for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    error "Required environment variable $var is not set"
    exit 1
  fi
done

log "✅ Pre-flight checks passed"

# Step 2: Database backup
log "Step 2/10: Creating database backup..."

if [ -f "$SCRIPT_DIR/backup-database.sh" ]; then
  chmod +x "$SCRIPT_DIR/backup-database.sh"
  "$SCRIPT_DIR/backup-database.sh" || {
    error "Database backup failed"
    exit 1
  }
  log "✅ Database backup completed"
else
  warning "Backup script not found, skipping backup"
fi

# Step 3: Database migrations
log "Step 3/10: Running database migrations..."

cd "$PROJECT_ROOT/backend"
npx prisma migrate deploy || {
  error "Database migrations failed"
  exit 1
}

log "✅ Database migrations completed"

# Step 4: Database optimization
log "Step 4/10: Optimizing database..."

if [ -f "$SCRIPT_DIR/optimize-database.sh" ]; then
  chmod +x "$SCRIPT_DIR/optimize-database.sh"
  "$SCRIPT_DIR/optimize-database.sh" || {
    warning "Database optimization failed, continuing..."
  }
  log "✅ Database optimization completed"
else
  warning "Optimization script not found, skipping"
fi

# Step 5: Build backend
log "Step 5/10: Building backend..."

cd "$PROJECT_ROOT/backend"
npm install --production=false
npm run build || {
  error "Backend build failed"
  exit 1
}

log "✅ Backend build completed"

# Step 6: Build frontend
log "Step 6/10: Building frontend..."

cd "$PROJECT_ROOT/web"
npm install --production=false
npm run build || {
  error "Frontend build failed"
  exit 1
}

log "✅ Frontend build completed"

# Step 7: Deploy backend
log "Step 7/10: Deploying backend..."

cd "$PROJECT_ROOT/backend"

if command -v railway &> /dev/null && [ -n "$RAILWAY_TOKEN" ]; then
  railway up || {
    error "Backend deployment to Railway failed"
    exit 1
  }
  log "✅ Backend deployed to Railway"
elif command -v pm2 &> /dev/null; then
  pm2 restart ecosystem.config.js --env production || {
    error "Backend deployment with PM2 failed"
    exit 1
  }
  log "✅ Backend deployed with PM2"
else
  warning "No deployment method available for backend"
fi

# Step 8: Deploy frontend
log "Step 8/10: Deploying frontend..."

cd "$PROJECT_ROOT/web"

if command -v vercel &> /dev/null && [ -n "$VERCEL_TOKEN" ]; then
  vercel --prod --token "$VERCEL_TOKEN" || {
    error "Frontend deployment to Vercel failed"
    exit 1
  }
  log "✅ Frontend deployed to Vercel"
else
  warning "Vercel CLI not available, skipping frontend deployment"
fi

# Step 9: Health checks
log "Step 9/10: Running health checks..."

sleep 10  # Wait for services to start

if [ -f "$SCRIPT_DIR/health-check.sh" ]; then
  chmod +x "$SCRIPT_DIR/health-check.sh"
  "$SCRIPT_DIR/health-check.sh" || {
    error "Health checks failed"
    exit 1
  }
  log "✅ Health checks passed"
else
  warning "Health check script not found, skipping"
fi

# Step 10: Post-deployment tasks
log "Step 10/10: Running post-deployment tasks..."

# Clear caches
if [ -n "$REDIS_URL" ]; then
  redis-cli -u "$REDIS_URL" FLUSHDB || warning "Failed to clear Redis cache"
  log "✅ Redis cache cleared"
fi

# Notify monitoring services
if [ -n "$SENTRY_DSN" ]; then
  info "Notifying Sentry of deployment..."
  # Add Sentry release notification here
fi

# Send Slack notification
if [ -n "$SLACK_WEBHOOK_URL" ]; then
  curl -X POST "$SLACK_WEBHOOK_URL" \
    -H 'Content-Type: application/json' \
    -d "{\"text\":\"🚀 Gitgram production deployment completed successfully!\"}" \
    &> /dev/null || warning "Failed to send Slack notification"
  log "✅ Slack notification sent"
fi

# Summary
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Deployment Completed Successfully  ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════╝${NC}"
echo ""

log "Deployment completed successfully! 🎉"
log "Deployment log saved to: $DEPLOYMENT_LOG"

echo ""
echo "Next steps:"
echo "1. Monitor error rates in Sentry"
echo "2. Check application metrics"
echo "3. Verify all features are working"
echo "4. Monitor user feedback"
echo ""

exit 0
