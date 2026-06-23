#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NPM_CACHE_DIR="${ROOT_DIR}/../.tmp/npm-cache"
PACK_OUTPUT_DIR="${ROOT_DIR}/../.tmp/npm-packages"
UNPACK_ROOT_DIR="${ROOT_DIR}/../.tmp/npm-unpacked"

mkdir -p "${NPM_CACHE_DIR}"
rm -rf "${PACK_OUTPUT_DIR}" "${UNPACK_ROOT_DIR}"
mkdir -p "${PACK_OUTPUT_DIR}" "${UNPACK_ROOT_DIR}"

read_package_field() {
  local package_json="$1"
  local field_path="$2"

  node -e '
    const fs = require("fs");
    const packageJson = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const pathParts = process.argv[2].split(".");
    let current = packageJson;
    for (const part of pathParts) {
      current = current?.[part];
    }
    process.stdout.write(current === undefined ? "" : String(current));
  ' "${package_json}" "${field_path}"
}

assert_package_field() {
  local package_json="$1"
  local field_path="$2"
  local expected_value="$3"
  local actual_value

  actual_value="$(read_package_field "${package_json}" "${field_path}")"
  if [[ "${actual_value}" != "${expected_value}" ]]; then
    echo "ERROR: Expected ${field_path}=${expected_value}, found ${actual_value:-<empty>}" >&2
    exit 1
  fi
}

run_pack_check() {
  local package_dir="$1"
  local package_name="$2"
  local required_path="$3"

  echo ""
  echo "==> Verifying ${package_name} in ${package_dir}"
  pushd "${package_dir}" >/dev/null

  local output
  output="$(npm_config_cache="${NPM_CACHE_DIR}" npm pack --dry-run 2>&1)"
  echo "${output}"

  local actual_name
  actual_name="$(node -p "require('./package.json').name")"
  if [[ "${actual_name}" != "${package_name}" ]]; then
    echo "ERROR: Expected package name ${package_name}, found ${actual_name}" >&2
    popd >/dev/null
    exit 1
  fi

  if ! grep -q "${required_path}" <<<"${output}"; then
    echo "ERROR: ${package_name} tarball is missing required file: ${required_path}" >&2
    popd >/dev/null
    exit 1
  fi

  popd >/dev/null
}

run_tarball_check() {
  local package_dir="$1"
  local package_name="$2"
  local required_path="$3"
  local unpack_name="$4"

  echo ""
  echo "==> Packing ${package_name} for real tarball inspection"
  pushd "${package_dir}" >/dev/null

  local tarball_name
  tarball_name="$(npm_config_cache="${NPM_CACHE_DIR}" npm pack --pack-destination "${PACK_OUTPUT_DIR}" | tail -1)"
  popd >/dev/null

  local tarball_path="${PACK_OUTPUT_DIR}/${tarball_name}"
  local unpack_dir="${UNPACK_ROOT_DIR}/${unpack_name}"
  mkdir -p "${unpack_dir}"
  tar -xzf "${tarball_path}" -C "${unpack_dir}"

  local package_root="${unpack_dir}/package"
  local package_json="${package_root}/package.json"

  if [[ ! -f "${package_json}" ]]; then
    echo "ERROR: Tarball for ${package_name} is missing package.json" >&2
    exit 1
  fi

  assert_package_field "${package_json}" "name" "${package_name}"

  if [[ ! -f "${package_root}/${required_path}" ]]; then
    echo "ERROR: Tarball for ${package_name} is missing ${required_path}" >&2
    exit 1
  fi

  if [[ ! -f "${package_root}/README.md" || ! -f "${package_root}/LICENSE" ]]; then
    echo "ERROR: Tarball for ${package_name} is missing README.md or LICENSE" >&2
    exit 1
  fi
}

run_pack_check "${ROOT_DIR}" "@gitgram/timemachine" "lib/cli-v2.js"
run_tarball_check "${ROOT_DIR}" "@gitgram/timemachine" "lib/cli-v2.js" "timemachine"
assert_package_field "${UNPACK_ROOT_DIR}/timemachine/package/package.json" "bin.aitm" "lib/cli-v2.js"
assert_package_field "${UNPACK_ROOT_DIR}/timemachine/package/package.json" "bin.aitimemachine" "lib/cli-v2.js"

run_pack_check "${ROOT_DIR}/mcp" "@gitgram/timemachine-mcp" "dist/index.js"
run_tarball_check "${ROOT_DIR}/mcp" "@gitgram/timemachine-mcp" "dist/index.js" "timemachine-mcp"
assert_package_field "${UNPACK_ROOT_DIR}/timemachine-mcp/package/package.json" "bin.aitm-mcp" "dist/index.js"
assert_package_field "${UNPACK_ROOT_DIR}/timemachine-mcp/package/package.json" "bin.aitm-mcp-client" "dist/client.js"
assert_package_field "${UNPACK_ROOT_DIR}/timemachine-mcp/package/package.json" "dependencies.@gitgram/timemachine" "^2.0.0"
if [[ ! -f "${UNPACK_ROOT_DIR}/timemachine-mcp/package/server.json" ]]; then
  echo "ERROR: Tarball for @gitgram/timemachine-mcp is missing server.json" >&2
  exit 1
fi

echo ""
echo "All npm package publishability checks passed."
