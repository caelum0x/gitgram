#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# analyze-with-gitnexus.sh
#
# Usage: ./scripts/analyze-with-gitnexus.sh <REPO>
#
# REPO must be one of:
#   gitgram-backend   gitgram-web   aitm-api   aitm-mcp
# ---------------------------------------------------------------------------

MONOREPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GITNEXUS_DIR="${MONOREPO_ROOT}/aitimemachine/gitnexus"
GITNEXUS_CLI="${GITNEXUS_DIR}/dist/cli/index.js"

# ---------------------------------------------------------------------------
# Argument handling
# ---------------------------------------------------------------------------
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <REPO>"
  echo ""
  echo "Available repos:"
  echo "  gitgram-backend   -> gitgram/backend"
  echo "  gitgram-web       -> gitgram/web"
  echo "  aitm-api          -> aitimemachine/api-server"
  echo "  aitm-mcp          -> aitimemachine/mcp"
  exit 1
fi

REPO="$1"

# ---------------------------------------------------------------------------
# Map repo name -> absolute path + display name
# ---------------------------------------------------------------------------
case "${REPO}" in
  gitgram-backend)
    REPO_PATH="${MONOREPO_ROOT}/gitgram/backend"
    REPO_NAME="gitgram-backend"
    ;;
  gitgram-web)
    REPO_PATH="${MONOREPO_ROOT}/gitgram/web"
    REPO_NAME="gitgram-web"
    ;;
  aitm-api)
    REPO_PATH="${MONOREPO_ROOT}/aitimemachine/api-server"
    REPO_NAME="aitm-api"
    ;;
  aitm-mcp)
    REPO_PATH="${MONOREPO_ROOT}/aitimemachine/mcp"
    REPO_NAME="aitm-mcp"
    ;;
  *)
    echo "ERROR: Unknown repo '${REPO}'"
    echo "Valid options: gitgram-backend, gitgram-web, aitm-api, aitm-mcp"
    exit 1
    ;;
esac

if [[ ! -d "${REPO_PATH}" ]]; then
  echo "ERROR: Repo path does not exist: ${REPO_PATH}"
  exit 1
fi

# ---------------------------------------------------------------------------
# Build gitnexus if dist/cli/index.js is missing
# ---------------------------------------------------------------------------
if [[ ! -f "${GITNEXUS_CLI}" ]]; then
  echo "gitnexus CLI not built. Building now..."
  echo "  -> ${GITNEXUS_DIR}"

  if [[ ! -d "${GITNEXUS_DIR}/node_modules" ]]; then
    echo "Installing gitnexus dependencies..."
    (cd "${GITNEXUS_DIR}" && npm install)
  fi

  (cd "${GITNEXUS_DIR}" && npm run build)

  if [[ ! -f "${GITNEXUS_CLI}" ]]; then
    echo "ERROR: Build completed but ${GITNEXUS_CLI} still not found."
    exit 1
  fi

  echo "Build complete."
else
  echo "gitnexus CLI already built: ${GITNEXUS_CLI}"
fi

# ---------------------------------------------------------------------------
# Run analysis
# ---------------------------------------------------------------------------
echo ""
echo "Analyzing '${REPO_NAME}' at:"
echo "  ${REPO_PATH}"
echo ""

node "${GITNEXUS_CLI}" analyze "${REPO_PATH}" --name "${REPO_NAME}"

# ---------------------------------------------------------------------------
# Post-analysis instructions
# ---------------------------------------------------------------------------
echo ""
echo "---------------------------------------------------------------------"
echo "Analysis complete for '${REPO_NAME}'."
echo ""
echo "To start the gitnexus server and query the index:"
echo ""
echo "  cd ${GITNEXUS_DIR}"
echo "  npm run serve"
echo ""
echo "The server listens on http://localhost:3001 by default."
echo ""
echo "To use it with the AITM MCP server:"
echo ""
echo "  cd ${MONOREPO_ROOT}/aitimemachine/mcp"
echo "  npm run dev:with-gitnexus"
echo "---------------------------------------------------------------------"
