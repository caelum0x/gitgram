#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

GITGRAM_BACKEND_HEALTH_URL="${GITGRAM_BACKEND_HEALTH_URL:-http://localhost:4000/health}"
GITGRAM_WEB_URL="${GITGRAM_WEB_URL:-http://localhost:3000}"
AITM_API_HEALTH_URL="${AITM_API_HEALTH_URL:-http://localhost:3001/health}"

SKIP_HTTP="${SKIP_HTTP:-0}"
RUN_AITM_CLI_SMOKE="${RUN_AITM_CLI_SMOKE:-0}"
RUN_AITM_MCP_SMOKE="${RUN_AITM_MCP_SMOKE:-0}"
AUTO_START="${AUTO_START:-0}"

log() {
  printf '%s\n' "$1"
}

check_cmd() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    log "Missing required command: ${cmd}"
    exit 1
  fi
}

check_http() {
  local label="$1"
  local url="$2"
  if curl -fsS --max-time 8 "${url}" >/dev/null; then
    log "PASS ${label}: ${url}"
  else
    log "FAIL ${label}: ${url}"
    return 1
  fi
}

start_services_if_requested() {
  if [[ "${AUTO_START}" != "1" ]]; then
    return 0
  fi

  check_cmd docker
  log ""
  log "Starting local services via docker compose (AUTO_START=1)"
  (
    cd "${ROOT_DIR}"
    docker compose up -d postgres redis gitgram-backend gitgram-web aitm-api
  )
}

wait_for_http() {
  local label="$1"
  local url="$2"
  local retries="${3:-30}"
  local sleep_seconds="${4:-2}"

  for _ in $(seq 1 "${retries}"); do
    if curl -fsS --max-time 8 "${url}" >/dev/null 2>&1; then
      return 0
    fi
    sleep "${sleep_seconds}"
  done

  log "FAIL ${label}: ${url} did not become ready after ${retries} attempts"
  return 1
}

log "=== Stage A Local Smoke Check ==="
log "Repo: ${ROOT_DIR}"

check_cmd npm
check_cmd curl

log ""
log "1) Validating local AITM env minimums"
npm --prefix "${ROOT_DIR}" run verify:aitm-local

log ""
log "2) Verifying AITM npm package tarballs"
npm --prefix "${ROOT_DIR}" run verify:aitm-packages

if [[ "${SKIP_HTTP}" == "1" ]]; then
  log ""
  log "3) HTTP health checks skipped (SKIP_HTTP=1)"
else
  start_services_if_requested
  log ""
  log "3) Checking live local service health endpoints"
  if [[ "${AUTO_START}" == "1" ]]; then
    wait_for_http "Gitgram backend health" "${GITGRAM_BACKEND_HEALTH_URL}"
    wait_for_http "Gitgram web" "${GITGRAM_WEB_URL}"
    wait_for_http "AITM API health" "${AITM_API_HEALTH_URL}"
  fi
  check_http "Gitgram backend health" "${GITGRAM_BACKEND_HEALTH_URL}"
  check_http "Gitgram web" "${GITGRAM_WEB_URL}"
  check_http "AITM API health" "${AITM_API_HEALTH_URL}"
fi

if [[ "${RUN_AITM_CLI_SMOKE}" == "1" ]]; then
  log ""
  log "4) Running AITM CLI smoke test"
  bash "${ROOT_DIR}/aitimemachine/scripts/cli-smoke-test.sh"
fi

if [[ "${RUN_AITM_MCP_SMOKE}" == "1" ]]; then
  log ""
  log "5) Running AITM MCP smoke test"
  bash "${ROOT_DIR}/aitimemachine/scripts/mcp-smoke-test.sh"
fi

log ""
log "Stage A local smoke checks completed."
