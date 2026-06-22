#!/usr/bin/env bash
set -euo pipefail

TARGET_ENV="${1:-production}"
if [[ "${TARGET_ENV}" != "production" && "${TARGET_ENV}" != "staging" && "${TARGET_ENV}" != "local" ]]; then
  echo "Usage: $0 [production|staging|local] [core|full]" >&2
  exit 1
fi

VALIDATION_PROFILE="${2:-full}"
if [[ "${VALIDATION_PROFILE}" != "core" && "${VALIDATION_PROFILE}" != "full" ]]; then
  echo "Usage: $0 [production|staging|local] [core|full]" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

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

MISSING=()
INVALID=()

if [[ "${TARGET_ENV}" == "local" ]]; then
  AITM_ENV_FILE="${ROOT_DIR}/aitimemachine/api-server/.env"
  if [[ -f "${AITM_ENV_FILE}" ]]; then
    set -a
    # shellcheck source=/dev/null
    source "${AITM_ENV_FILE}"
    set +a
  fi
fi

load_prefixed_env_file() {
  local product_prefix="$1"
  local file="$2"

  if [[ ! -f "${file}" ]]; then
    return 0
  fi

  while IFS='=' read -r key _; do
    if [[ ! "${key}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      continue
    fi

    local prefixed="${product_prefix}_${key}"
    if [[ -n "${!prefixed:-}" ]]; then
      continue
    fi

    local value
    value="$(
      bash -c '
        set -a
        source "$1"
        printf "%s" "${!2}"
      ' _ "${file}" "${key}"
    )"

    export "${prefixed}=${value}"
  done < <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "${file}" || true)
}

if [[ "${TARGET_ENV}" != "local" ]]; then
  GITGRAM_ENV_FILE="$(resolve_env_file "${ROOT_DIR}/.env.gitgram" "${TARGET_ENV}")"
  GITGRAM_WEB_ENV_FILE="$(resolve_env_file "${ROOT_DIR}/.env.gitgram-web" "${TARGET_ENV}")"
  AITM_API_ENV_FILE="$(resolve_env_file "${ROOT_DIR}/.env.aitm-api" "${TARGET_ENV}")"
  AITM_WEBSITE_ENV_FILE="$(resolve_env_file "${ROOT_DIR}/.env.aitm-website" "${TARGET_ENV}")"

  load_prefixed_env_file "GITGRAM" "${GITGRAM_ENV_FILE}"
  load_prefixed_env_file "GITGRAM" "${GITGRAM_WEB_ENV_FILE}"
  load_prefixed_env_file "AITM" "${AITM_API_ENV_FILE}"
  load_prefixed_env_file "AITM" "${AITM_WEBSITE_ENV_FILE}"
fi

add_missing() {
  MISSING+=("$1")
}

add_invalid() {
  INVALID+=("$1")
}

resolve_value() {
  local product_prefix="$1"
  local key="$2"
  local prefixed="${product_prefix}_${key}"

  if [[ -n "${!prefixed:-}" ]]; then
    printf '%s' "${!prefixed}"
    return 0
  fi

  if [[ -n "${!key:-}" ]]; then
    printf '%s' "${!key}"
    return 0
  fi

  printf ''
}

validate_not_placeholder() {
  local label="$1"
  local value="$2"
  local lowered
  lowered="$(printf '%s' "${value}" | tr '[:upper:]' '[:lower:]')"

  local patterns=(
    "change_me"
    "replace-with"
    "your_"
    "your-"
    "example"
    "placeholder"
    "xxx"
    "todo"
    "user:password@"
    "project.neon.tech"
  )

  for pattern in "${patterns[@]}"; do
    if [[ "${lowered}" == *"${pattern}"* ]]; then
      add_invalid "${label} looks like a placeholder value"
      return
    fi
  done
}

assert_allowed_value() {
  local product_prefix="$1"
  local key="$2"
  shift 2
  local allowed=("$@")
  local label="${product_prefix}_${key}"
  local value
  value="$(resolve_value "${product_prefix}" "${key}")"

  if [[ -z "${value}" ]]; then
    return 0
  fi

  for candidate in "${allowed[@]}"; do
    if [[ "${value}" == "${candidate}" ]]; then
      return 0
    fi
  done

  add_invalid "${label} must be one of: ${allowed[*]} (found ${value})"
}

assert_required() {
  local product_prefix="$1"
  local key="$2"
  local label="${product_prefix}_${key}"
  local value
  value="$(resolve_value "${product_prefix}" "${key}")"

  if [[ -z "${value}" ]]; then
    add_missing "${label} (or unprefixed ${key})"
    return
  fi

  validate_not_placeholder "${label}" "${value}"
}

assert_one_of() {
  local product_prefix="$1"
  local key_a="$2"
  local key_b="$3"
  local label_a="${product_prefix}_${key_a}"
  local label_b="${product_prefix}_${key_b}"
  local value_a value_b
  value_a="$(resolve_value "${product_prefix}" "${key_a}")"
  value_b="$(resolve_value "${product_prefix}" "${key_b}")"

  if [[ -z "${value_a}" && -z "${value_b}" ]]; then
    add_missing "one of ${label_a} or ${label_b} (or unprefixed variants)"
    return
  fi

  if [[ -n "${value_a}" ]]; then
    validate_not_placeholder "${label_a}" "${value_a}"
  fi
  if [[ -n "${value_b}" ]]; then
    validate_not_placeholder "${label_b}" "${value_b}"
  fi
}

assert_example_has_keys() {
  local file="$1"
  shift
  local keys=("$@")
  local missing_local=()

  for key in "${keys[@]}"; do
    if ! rg -q "^[[:space:]]*${key}=" "${file}"; then
      missing_local+=("${key}")
    fi
  done

  if [[ "${#missing_local[@]}" -gt 0 ]]; then
    add_invalid "Missing keys in ${file}: ${missing_local[*]}"
  fi
}

assert_pair_if_either_present() {
  local product_prefix="$1"
  local key_a="$2"
  local key_b="$3"
  local label_a="${product_prefix}_${key_a}"
  local label_b="${product_prefix}_${key_b}"
  local value_a value_b
  value_a="$(resolve_value "${product_prefix}" "${key_a}")"
  value_b="$(resolve_value "${product_prefix}" "${key_b}")"

  if [[ -z "${value_a}" && -z "${value_b}" ]]; then
    return 0
  fi

  if [[ -z "${value_a}" ]]; then
    add_missing "${label_a} (required when ${label_b} is set)"
  else
    validate_not_placeholder "${label_a}" "${value_a}"
  fi

  if [[ -z "${value_b}" ]]; then
    add_missing "${label_b} (required when ${label_a} is set)"
  else
    validate_not_placeholder "${label_b}" "${value_b}"
  fi
}

if [[ "${TARGET_ENV}" == "local" ]]; then
  # Minimal keys to run AITM API in local development without paid integrations.
  assert_required "AITM" "DATABASE_URL"
else
  # Gitgram backend + web core deploy requirements
  assert_required "GITGRAM" "DATABASE_URL"
  assert_required "GITGRAM" "REDIS_URL"
  assert_required "GITGRAM" "JWT_SECRET"
  assert_required "GITGRAM" "JWT_REFRESH_SECRET"
  assert_required "GITGRAM" "FRONTEND_URL"
  assert_required "GITGRAM" "CORS_ORIGIN"
  assert_required "GITGRAM" "STORAGE_TYPE"
  assert_allowed_value "GITGRAM" "STORAGE_TYPE" "local" "s3"
  assert_required "GITGRAM" "NEXT_PUBLIC_API_URL"
  assert_one_of "GITGRAM" "NEXT_PUBLIC_WS_URL" "NEXT_PUBLIC_SOCKET_URL"

  storage_type="$(resolve_value "GITGRAM" "STORAGE_TYPE")"
  if [[ "${storage_type}" == "s3" ]]; then
    assert_required "GITGRAM" "AWS_ACCESS_KEY_ID"
    assert_required "GITGRAM" "AWS_SECRET_ACCESS_KEY"
    assert_required "GITGRAM" "AWS_S3_BUCKET"
    assert_required "GITGRAM" "AWS_REGION"
  fi

  # AITM API core deploy requirements
  assert_required "AITM" "DATABASE_URL"
  assert_required "AITM" "INTERNAL_SECRET"
  assert_required "AITM" "CORS_ORIGIN"
  assert_required "AITM" "WEBSITE_URL"

  # Optional AITM website/self-hosted dashboard vars: validate pairs if present.
  assert_pair_if_either_present "AITM" "CLERK_SECRET_KEY" "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
  assert_pair_if_either_present "AITM" "API_URL" "NEXT_PUBLIC_API_URL"
  assert_pair_if_either_present "AITM" "NEXT_PUBLIC_POLAR_PRO_PRODUCT_ID" "NEXT_PUBLIC_POLAR_TEAM_PRODUCT_ID"

  if [[ "${VALIDATION_PROFILE}" == "full" ]]; then
    # Third-party integrations needed for a full launch contract.
    assert_required "GITGRAM" "GITHUB_CLIENT_ID"
    assert_required "GITGRAM" "GITHUB_CLIENT_SECRET"
    assert_required "GITGRAM" "NEXT_PUBLIC_GITHUB_CLIENT_ID"
    assert_required "GITGRAM" "POLAR_ACCESS_TOKEN"
    assert_required "GITGRAM" "POLAR_WEBHOOK_SECRET"
    assert_required "GITGRAM" "POLAR_PREMIUM_PRODUCT_ID"
    assert_required "GITGRAM" "POLAR_CREATOR_PRODUCT_ID"
    assert_required "GITGRAM" "POLAR_MODE"
    assert_allowed_value "GITGRAM" "POLAR_MODE" "sandbox" "production"
    assert_required "GITGRAM" "RESEND_API_KEY"
    assert_required "GITGRAM" "SENTRY_DSN"

    assert_required "AITM" "POLAR_ACCESS_TOKEN"
    assert_required "AITM" "POLAR_MODE"
    assert_allowed_value "AITM" "POLAR_MODE" "sandbox" "production"
    assert_required "AITM" "POLAR_WEBHOOK_SECRET"
    assert_required "AITM" "POLAR_PRO_PRODUCT_ID"
    assert_required "AITM" "POLAR_TEAM_PRODUCT_ID"
    assert_required "AITM" "RESEND_API_KEY"
    assert_required "AITM" "SENTRY_DSN"
  else
    # Core mode still validates provider mode if it is already set.
    assert_allowed_value "GITGRAM" "POLAR_MODE" "sandbox" "production"
    assert_allowed_value "AITM" "POLAR_MODE" "sandbox" "production"
  fi
fi

if [[ "${TARGET_ENV}" == "production" ]]; then
  polar_mode="$(resolve_value "GITGRAM" "POLAR_MODE")"
  if [[ -n "${polar_mode}" && "${polar_mode}" != "production" ]]; then
    add_invalid "GITGRAM_POLAR_MODE must be production for a production launch"
  fi

  aitm_polar_mode="$(resolve_value "AITM" "POLAR_MODE")"
  if [[ -n "${aitm_polar_mode}" && "${aitm_polar_mode}" != "production" ]]; then
    add_invalid "AITM_POLAR_MODE must be production for a production launch"
  fi

  clerk_pub="$(resolve_value "AITM" "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY")"
  if [[ -n "${clerk_pub}" && "${clerk_pub}" == pk_test_* ]]; then
    add_invalid "AITM_NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must be live key in production (found test key pattern)"
  fi
fi

# Keep env templates aligned with required contract keys.
assert_example_has_keys "${ROOT_DIR}/gitgram/backend/.env.example" \
  DATABASE_URL JWT_SECRET JWT_REFRESH_SECRET FRONTEND_URL REDIS_URL \
  GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET \
  POLAR_ACCESS_TOKEN POLAR_WEBHOOK_SECRET POLAR_PREMIUM_PRODUCT_ID POLAR_CREATOR_PRODUCT_ID \
  RESEND_API_KEY SENTRY_DSN STORAGE_TYPE

assert_example_has_keys "${ROOT_DIR}/aitimemachine/api-server/.env.example" \
  DATABASE_URL INTERNAL_SECRET CORS_ORIGIN WEBSITE_URL \
  POLAR_ACCESS_TOKEN POLAR_MODE POLAR_WEBHOOK_SECRET POLAR_PRO_PRODUCT_ID POLAR_TEAM_PRODUCT_ID

assert_example_has_keys "${ROOT_DIR}/gitgram/web/.env.example" \
  NEXT_PUBLIC_API_URL NEXT_PUBLIC_WS_URL NEXT_PUBLIC_GITHUB_CLIENT_ID

assert_example_has_keys "${ROOT_DIR}/aitimemachine/website/.env.example" \
  CLERK_SECRET_KEY NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY NEXT_PUBLIC_API_URL API_URL INTERNAL_SECRET \
  POLAR_ACCESS_TOKEN POLAR_MODE NEXT_PUBLIC_POLAR_PRO_PRODUCT_ID NEXT_PUBLIC_POLAR_TEAM_PRODUCT_ID

assert_example_has_keys "${ROOT_DIR}/.env.gitgram.example" \
  DATABASE_URL REDIS_URL JWT_SECRET JWT_REFRESH_SECRET FRONTEND_URL CORS_ORIGIN \
  GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET POLAR_ACCESS_TOKEN POLAR_WEBHOOK_SECRET \
  POLAR_PREMIUM_PRODUCT_ID POLAR_CREATOR_PRODUCT_ID POLAR_MODE STORAGE_TYPE

assert_example_has_keys "${ROOT_DIR}/.env.gitgram-web.example" \
  NEXT_PUBLIC_API_URL NEXT_PUBLIC_WS_URL NEXT_PUBLIC_GITHUB_CLIENT_ID

assert_example_has_keys "${ROOT_DIR}/.env.aitm-api.example" \
  DATABASE_URL INTERNAL_SECRET CORS_ORIGIN WEBSITE_URL POLAR_ACCESS_TOKEN POLAR_MODE POLAR_WEBHOOK_SECRET \
  POLAR_PRO_PRODUCT_ID POLAR_TEAM_PRODUCT_ID

assert_example_has_keys "${ROOT_DIR}/.env.aitm-website.example" \
  NEXT_PUBLIC_API_URL API_URL INTERNAL_SECRET NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY CLERK_SECRET_KEY \
  POLAR_ACCESS_TOKEN POLAR_MODE NEXT_PUBLIC_POLAR_PRO_PRODUCT_ID NEXT_PUBLIC_POLAR_TEAM_PRODUCT_ID

if [[ "${#MISSING[@]}" -eq 0 && "${#INVALID[@]}" -eq 0 ]]; then
  echo "Secrets validation passed for ${TARGET_ENV} (${VALIDATION_PROFILE})."
  exit 0
fi

echo "Secrets validation failed for ${TARGET_ENV} (${VALIDATION_PROFILE})."

if [[ "${#MISSING[@]}" -gt 0 ]]; then
  echo ""
  echo "Missing variables:"
  for item in "${MISSING[@]}"; do
    echo "  - ${item}"
  done
fi

if [[ "${#INVALID[@]}" -gt 0 ]]; then
  echo ""
  echo "Invalid values/config:"
  for item in "${INVALID[@]}"; do
    echo "  - ${item}"
  done
fi

exit 1
