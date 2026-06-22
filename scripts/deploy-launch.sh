#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-}"
if [[ -z "${ENVIRONMENT}" || ! "${ENVIRONMENT}" =~ ^(staging|production)$ ]]; then
  echo "Usage: $0 <staging|production> [--gitgram-only] [--aitm-only] [--skip-verify] [--verify-profile core|full] [--skip-install] [--skip-typecheck] [--dry-run]" >&2
  exit 1
fi
shift || true

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GITGRAM_DIR="${ROOT_DIR}/gitgram"
AITM_DIR="${ROOT_DIR}/aitimemachine"

GITGRAM_ONLY=0
AITM_ONLY=0
SKIP_VERIFY=0
VERIFY_PROFILE="${VERIFY_PROFILE:-core}"
SKIP_INSTALL=0
SKIP_TYPECHECK=0
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --gitgram-only) GITGRAM_ONLY=1; shift ;;
    --aitm-only) AITM_ONLY=1; shift ;;
    --skip-verify) SKIP_VERIFY=1; shift ;;
    --verify-profile)
      VERIFY_PROFILE="${2:-}"
      if [[ "${VERIFY_PROFILE}" != "core" && "${VERIFY_PROFILE}" != "full" ]]; then
        echo "Invalid verify profile: ${VERIFY_PROFILE}" >&2
        exit 1
      fi
      shift 2
      ;;
    --skip-install) SKIP_INSTALL=1; shift ;;
    --skip-typecheck) SKIP_TYPECHECK=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

if [[ "${GITGRAM_ONLY}" == "1" && "${AITM_ONLY}" == "1" ]]; then
  echo "Use either --gitgram-only or --aitm-only, not both." >&2
  exit 1
fi

run_cmd() {
  if [[ "${DRY_RUN}" == "1" ]]; then
    printf 'DRY_RUN '
    printf '%q ' "$@"
    printf '\n'
    return 0
  fi
  "$@"
}

run_bash() {
  local cmd="$1"
  if [[ "${DRY_RUN}" == "1" ]]; then
    printf 'DRY_RUN bash -lc %q\n' "${cmd}"
    return 0
  fi
  bash -lc "${cmd}"
}

log() {
  printf '%s\n' "$1"
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

check_cmd() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "Missing required command: ${cmd}" >&2
    exit 1
  fi
}

wait_for_http() {
  local label="$1"
  local url="$2"
  local retries="${3:-20}"
  local sleep_seconds="${4:-2}"

  if [[ "${DRY_RUN}" == "1" ]]; then
    log "DRY_RUN health check ${label}: ${url}"
    return 0
  fi

  for _ in $(seq 1 "${retries}"); do
    if curl -fsS --max-time 8 "${url}" >/dev/null 2>&1; then
      log "PASS ${label}: ${url}"
      return 0
    fi
    sleep "${sleep_seconds}"
  done

  echo "Health check failed for ${label}: ${url}" >&2
  return 1
}

pm2_apply() {
  local cwd="$1"
  local ecosystem_file="$2"
  local app_name="$3"
  shift 3

  local source_lines=""
  local env_file
  for env_file in "$@"; do
    source_lines="${source_lines}source \"${env_file}\"\n"
  done

  local script
  script="$(cat <<EOF
set -euo pipefail
set -a
$(printf '%b' "${source_lines}")
set +a
cd "${cwd}"
if pm2 describe "${app_name}" >/dev/null 2>&1; then
  pm2 restart "${app_name}" --update-env
else
  pm2 start "${ecosystem_file}" --only "${app_name}"
fi
pm2 save
EOF
)"
  run_bash "${script}"
}

log "=== Manual Launch Deploy ==="
log "Environment: ${ENVIRONMENT}"
log "Verify profile: ${VERIFY_PROFILE}"
log "Root: ${ROOT_DIR}"

GITGRAM_ENV_FILE="$(resolve_env_file "${ROOT_DIR}/.env.gitgram" "${ENVIRONMENT}")"
GITGRAM_WEB_ENV_FILE="$(resolve_env_file "${ROOT_DIR}/.env.gitgram-web" "${ENVIRONMENT}")"
AITM_API_ENV_FILE="$(resolve_env_file "${ROOT_DIR}/.env.aitm-api" "${ENVIRONMENT}")"

check_cmd bash
check_cmd node
check_cmd npm
check_cmd pm2
check_cmd curl

if [[ "${SKIP_VERIFY}" != "1" ]]; then
  log ""
  log "1) Verifying launch readiness"
  run_cmd bash "${ROOT_DIR}/scripts/verify-launch-readiness.sh" "${ENVIRONMENT}" "${VERIFY_PROFILE}"
else
  log ""
  log "1) Skipping launch readiness verification"
fi

if [[ "${AITM_ONLY}" != "1" ]]; then
  log ""
  log "2) Deploying Gitgram backend"
  log "Gitgram backend env: ${GITGRAM_ENV_FILE}"
  run_cmd mkdir -p "${GITGRAM_DIR}/logs"
  if [[ "${SKIP_INSTALL}" != "1" ]]; then
    run_bash "cd \"${GITGRAM_DIR}/backend\" && npm ci --legacy-peer-deps"
  fi
  run_bash "set -a; source \"${GITGRAM_ENV_FILE}\"; set +a; cd \"${GITGRAM_DIR}/backend\" && npx prisma generate && npx prisma migrate deploy && npm run build"
  if [[ "${SKIP_TYPECHECK}" != "1" ]]; then
    run_bash "cd \"${GITGRAM_DIR}/backend\" && npx tsc --noEmit"
  fi
  pm2_apply "${GITGRAM_DIR}" "ecosystem.config.js" "gitgram-api" "${GITGRAM_ENV_FILE}"

  log ""
  log "3) Deploying Gitgram web"
  log "Gitgram web env: ${GITGRAM_WEB_ENV_FILE}"
  if [[ "${SKIP_INSTALL}" != "1" ]]; then
    run_bash "cd \"${GITGRAM_DIR}/web\" && npm ci --legacy-peer-deps"
  fi
  run_bash "set -a; source \"${GITGRAM_WEB_ENV_FILE}\"; set +a; cd \"${GITGRAM_DIR}/web\" && npm run build"
  if [[ "${SKIP_TYPECHECK}" != "1" ]]; then
    run_bash "cd \"${GITGRAM_DIR}/web\" && npx tsc --noEmit"
  fi
  pm2_apply "${GITGRAM_DIR}" "ecosystem.config.js" "gitgram-web" "${GITGRAM_WEB_ENV_FILE}"

  log ""
  log "4) Verifying Gitgram local health"
  wait_for_http "Gitgram backend health" "http://127.0.0.1:4000/health"
  wait_for_http "Gitgram backend readiness" "http://127.0.0.1:4000/health/ready"
  wait_for_http "Gitgram web" "http://127.0.0.1:3000/"
fi

if [[ "${GITGRAM_ONLY}" != "1" ]]; then
  log ""
  log "5) Deploying AITM API"
  log "AITM API env: ${AITM_API_ENV_FILE}"
  if [[ "${SKIP_INSTALL}" != "1" ]]; then
    run_bash "cd \"${AITM_DIR}/api-server\" && npm ci"
  fi
  run_bash "set -a; source \"${AITM_API_ENV_FILE}\"; set +a; cd \"${AITM_DIR}/api-server\" && npm run db:migrate && npm run build"
  if [[ "${SKIP_TYPECHECK}" != "1" ]]; then
    run_bash "cd \"${AITM_DIR}\" && npx tsc --noEmit && cd api-server && npx tsc --noEmit"
  fi
  pm2_apply "${AITM_DIR}" "deploy/ecosystem.config.cjs" "aitm-api" "${AITM_API_ENV_FILE}"

  log ""
  log "6) Verifying AITM local health"
  wait_for_http "AITM API health" "http://127.0.0.1:3001/health"
  wait_for_http "AITM API readiness" "http://127.0.0.1:3001/health/ready"
fi

log ""
log "Manual launch deploy flow completed."
