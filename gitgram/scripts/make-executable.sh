#!/bin/bash

# Make all scripts executable

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🔧 Making all scripts executable..."

# List of scripts to make executable
SCRIPTS=(
  "backup-database.sh"
  "restore-database.sh"
  "optimize-database.sh"
  "setup-ssl.sh"
  "setup-nginx-lb.sh"
  "setup-monitoring.sh"
  "setup-autoscaling.sh"
  "deploy-production.sh"
  "health-check.sh"
  "monitor-scaling.sh"
)

for script in "${SCRIPTS[@]}"; do
  if [ -f "$SCRIPT_DIR/$script" ]; then
    chmod +x "$SCRIPT_DIR/$script"
    echo "✅ Made $script executable"
  else
    echo "⚠️  $script not found"
  fi
done

echo ""
echo "✅ All scripts are now executable!"
echo ""
echo "Available scripts:"
echo "  ./scripts/backup-database.sh       - Backup database"
echo "  ./scripts/restore-database.sh      - Restore database"
echo "  ./scripts/optimize-database.sh     - Optimize database"
echo "  ./scripts/setup-ssl.sh             - Setup SSL certificates"
echo "  ./scripts/setup-nginx-lb.sh        - Setup Nginx load balancer"
echo "  ./scripts/setup-monitoring.sh      - Setup monitoring"
echo "  ./scripts/setup-autoscaling.sh     - Setup auto-scaling"
echo "  ./scripts/deploy-production.sh     - Deploy to production"
echo "  ./scripts/health-check.sh          - Run health checks"
echo "  ./scripts/monitor-scaling.sh       - Monitor scaling"

exit 0
