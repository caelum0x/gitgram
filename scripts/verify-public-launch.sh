#!/usr/bin/env bash
set -euo pipefail

GITGRAM_PUBLIC_URL="${GITGRAM_PUBLIC_URL:-https://gitgram.app}"
AITM_API_PUBLIC_URL="${AITM_API_PUBLIC_URL:-https://timemachine-api.gitgram.app}"
AITM_WEBSITE_PUBLIC_URL="${AITM_WEBSITE_PUBLIC_URL:-https://timemachine.gitgram.app}"
SKIP_AITM_WEBSITE="${SKIP_AITM_WEBSITE:-0}"

log() {
  printf '%s\n' "$1"
}

check_http_ok() {
  local label="$1"
  local url="$2"
  if curl -fsSL --max-time 15 "${url}" >/dev/null; then
    log "PASS ${label}: ${url}"
  else
    log "FAIL ${label}: ${url}"
    return 1
  fi
}

log "=== Public Launch Verification ==="
log "Gitgram: ${GITGRAM_PUBLIC_URL}"
log "AITM API: ${AITM_API_PUBLIC_URL}"

check_http_ok "Gitgram web" "${GITGRAM_PUBLIC_URL}"
check_http_ok "Gitgram backend health" "${GITGRAM_PUBLIC_URL}/api/health"
check_http_ok "Gitgram backend readiness" "${GITGRAM_PUBLIC_URL}/api/health/ready"
check_http_ok "AITM API health" "${AITM_API_PUBLIC_URL}/health"
check_http_ok "AITM API readiness" "${AITM_API_PUBLIC_URL}/health/ready"

if [[ "${SKIP_AITM_WEBSITE}" != "1" ]]; then
  check_http_ok "AITM website" "${AITM_WEBSITE_PUBLIC_URL}"
fi

log ""
log "Public launch verification passed."
