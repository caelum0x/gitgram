#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "scripts/deploy-gitgram.sh now wraps the PM2/manual launch flow."
echo "For multi-service deploys use scripts/deploy-launch.sh directly."
exec "${SCRIPT_DIR}/deploy-launch.sh" "$@" --gitgram-only
