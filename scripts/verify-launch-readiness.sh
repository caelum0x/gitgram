#!/usr/bin/env bash
set -euo pipefail

TARGET_ENV="${1:-all}"
if [[ "${TARGET_ENV}" != "all" && "${TARGET_ENV}" != "staging" && "${TARGET_ENV}" != "production" ]]; then
  echo "Usage: $0 [all|staging|production] [core|full]" >&2
  exit 1
fi

VALIDATION_PROFILE="${2:-core}"
if [[ "${VALIDATION_PROFILE}" != "core" && "${VALIDATION_PROFILE}" != "full" ]]; then
  echo "Usage: $0 [all|staging|production] [core|full]" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_TYPECHECK="${RUN_TYPECHECK:-0}"
RUN_LOCAL_SMOKE="${RUN_LOCAL_SMOKE:-0}"

MISSING_FILES=()
FAILED_STEPS=()

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

require_file() {
  local path="$1"
  if [[ ! -f "${path}" ]]; then
    MISSING_FILES+=("${path}")
  fi
}

resolve_env_file() {
  local base="$1"
  local env_name="$2"
  local candidate="${base}.${env_name}"

  if [[ -f "${candidate}" ]]; then
    printf '%s' "${candidate}"
    return 0
  fi

  printf '%s' "${base}"
}

require_env_set() {
  local env_name="$1"
  require_file "$(resolve_env_file "${ROOT_DIR}/.env.gitgram" "${env_name}")"
  require_file "$(resolve_env_file "${ROOT_DIR}/.env.gitgram-web" "${env_name}")"
  require_file "$(resolve_env_file "${ROOT_DIR}/.env.aitm-api" "${env_name}")"
}

log "=== Launch Readiness Gate ==="
log "Repo: ${ROOT_DIR}"
log "Profile: ${VALIDATION_PROFILE}"

log ""
log "1) Checking required commands"
check_cmd bash
check_cmd node
check_cmd npm
check_cmd pm2

log "PASS node: $(node -v)"
log "PASS npm: $(npm -v)"
log "PASS pm2 command: $(command -v pm2)"

log ""
log "2) Checking launch artifacts"
require_file "${ROOT_DIR}/gitgram/ecosystem.config.js"
require_file "${ROOT_DIR}/aitimemachine/deploy/ecosystem.config.cjs"
require_file "${ROOT_DIR}/.env.gitgram.example"
require_file "${ROOT_DIR}/.env.gitgram-web.example"
require_file "${ROOT_DIR}/.env.aitm-api.example"

if [[ "${#MISSING_FILES[@]}" -gt 0 ]]; then
  log "Missing launch artifacts:"
  for item in "${MISSING_FILES[@]}"; do
    log "  - ${item}"
  done
  exit 1
fi
log "PASS launch artifacts present"

log ""
log "3) Checking operator env files"
MISSING_FILES=()
if [[ "${TARGET_ENV}" == "all" ]]; then
  require_env_set "staging"
  require_env_set "production"
else
  require_env_set "${TARGET_ENV}"
fi

if [[ "${#MISSING_FILES[@]}" -gt 0 ]]; then
  log "Missing operator env files:"
  for item in "${MISSING_FILES[@]}"; do
    log "  - ${item}"
  done
  log ""
  log "Create them from the templates. Preferred layout:"
  log "  cp .env.gitgram.example .env.gitgram.production"
  log "  cp .env.gitgram-web.example .env.gitgram-web.production"
  log "  cp .env.aitm-api.example .env.aitm-api.production"
  log "  cp .env.gitgram.example .env.gitgram.staging"
  log "  cp .env.gitgram-web.example .env.gitgram-web.staging"
  log "  cp .env.aitm-api.example .env.aitm-api.staging"
  log "Fallback layout still supported:"
  log "  cp .env.gitgram.example .env.gitgram"
  log "  cp .env.gitgram-web.example .env.gitgram-web"
  log "  cp .env.aitm-api.example .env.aitm-api"
  log "  # optional"
  log "  cp .env.aitm-website.example .env.aitm-website"
  exit 1
fi
log "PASS operator env files present"

validate_env() {
  local env_name="$1"
  log ""
  log "4) Validating ${VALIDATION_PROFILE} secrets contract for ${env_name}"
  if ! bash "${ROOT_DIR}/scripts/validate-prod-secrets.sh" "${env_name}" "${VALIDATION_PROFILE}"; then
    FAILED_STEPS+=("secrets:${env_name}:${VALIDATION_PROFILE}")
  fi
}

if [[ "${TARGET_ENV}" == "all" ]]; then
  validate_env "staging"
  validate_env "production"
else
  validate_env "${TARGET_ENV}"
fi

log ""
log "5) Verifying AITM npm package publishability"
if ! npm --prefix "${ROOT_DIR}" run verify:aitm-packages; then
  FAILED_STEPS+=("aitm-packages")
fi

if [[ "${RUN_TYPECHECK}" == "1" ]]; then
  log ""
  log "6) Running typechecks"
  if ! npm --prefix "${ROOT_DIR}" run typecheck:gitgram; then
    FAILED_STEPS+=("typecheck:gitgram")
  fi
  if ! npm --prefix "${ROOT_DIR}" run typecheck:aitm; then
    FAILED_STEPS+=("typecheck:aitm")
  fi
else
  log ""
  log "6) Skipping typechecks (set RUN_TYPECHECK=1 to enable)"
fi

if [[ "${RUN_LOCAL_SMOKE}" == "1" ]]; then
  log ""
  log "7) Running local smoke script"
  if ! bash "${ROOT_DIR}/scripts/smoke-local-launch.sh"; then
    FAILED_STEPS+=("local-smoke")
  fi
else
  log ""
  log "7) Skipping local smoke (set RUN_LOCAL_SMOKE=1 to enable)"
fi

if [[ "${#FAILED_STEPS[@]}" -gt 0 ]]; then
  log ""
  log "Launch readiness failed."
  log "Failed checks:"
  for item in "${FAILED_STEPS[@]}"; do
    log "  - ${item}"
  done
  exit 1
fi

log ""
log "Launch readiness checks passed."
