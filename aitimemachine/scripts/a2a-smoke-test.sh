#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${A2A_SMOKE_PORT:-3012}"
BASE_URL="http://127.0.0.1:${PORT}"
SERVER_PID=""
TMP_DIR="$(mktemp -d)"

pass() {
  echo "PASS: $1"
}

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

cleanup() {
  if [[ -n "${SERVER_PID}" ]] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
  rm -rf "${TMP_DIR}"
}

trap cleanup EXIT

cd "${ROOT_DIR}"

echo "Building MCP package for smoke test..."
(
  cd mcp
  npm run build >/dev/null
)

(
  cd mcp
  node dist/index.js --transport http --port "${PORT}"
) >"${TMP_DIR}/server.log" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 40); do
  if curl --max-time 2 -sS "${BASE_URL}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

if ! curl --max-time 2 -sS "${BASE_URL}/health" >/dev/null 2>&1; then
  cat "${TMP_DIR}/server.log" >&2 || true
  fail "MCP HTTP server did not become ready on port ${PORT}"
fi

CARD_BODY="${TMP_DIR}/agent-card.json"
curl --max-time 10 -sS "${BASE_URL}/.well-known/agent-card.json" >"${CARD_BODY}"
jq -e '
  .protocolVersion == "0.3.0" and
  .preferredTransport == "JSONRPC" and
  (.url | endswith("/a2a")) and
  (.skills | length > 0)
' "${CARD_BODY}" >/dev/null || fail "Agent card does not expose the expected A2A contract"
pass "Agent card exposes protocolVersion, preferredTransport, /a2a url, and skills"

SEND_RESPONSE="${TMP_DIR}/message-send.json"
curl --max-time 10 -sS -X POST "${BASE_URL}/a2a" \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"message/send","params":{"message":{"kind":"message","messageId":"smoke-msg-1","role":"user","parts":[{"kind":"text","text":"create a checkpoint"}]},"metadata":{"skillId":"checkpoint","description":"smoke test checkpoint"}}}' \
  >"${SEND_RESPONSE}"
jq -e '
  .jsonrpc == "2.0" and
  .result.kind == "task" and
  (.result.artifacts[0].parts[0].text | length > 0) and
  .result.status.state == "completed"
' "${SEND_RESPONSE}" >/dev/null || fail "Canonical message/send response is not a completed A2A task"
pass "Canonical message/send returns a completed A2A task result"

LEGACY_RESPONSE="${TMP_DIR}/legacy-send.json"
curl --max-time 10 -sS -X POST "${BASE_URL}/a2a" \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":2,"method":"tasks/send","params":{"id":"legacy-smoke","skill_id":"checkpoint","message":{"role":"user","parts":[{"type":"text","text":"legacy checkpoint"}]},"metadata":{"description":"legacy smoke request"}}}' \
  >"${LEGACY_RESPONSE}"
jq -e '
  .jsonrpc == "2.0" and
  .result.kind == "task" and
  .result.id == "legacy-smoke"
' "${LEGACY_RESPONSE}" >/dev/null || fail "Legacy tasks/send compatibility broke"
pass "Legacy tasks/send remains backward compatible"

FAILED_TASK_RESPONSE="${TMP_DIR}/failed-task.json"
curl --max-time 10 -sS -X POST "${BASE_URL}/a2a" \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":25,"method":"message/send","params":{"message":{"kind":"message","messageId":"smoke-msg-fail","role":"user","parts":[{"kind":"text","text":"restore without checkpoint id"}]},"metadata":{"skillId":"restore"}}}' \
  >"${FAILED_TASK_RESPONSE}"
jq -e '
  .jsonrpc == "2.0" and
  .result.kind == "task" and
  .result.status.state == "failed" and
  (.result.artifacts[0].parts[0].text | length > 0)
' "${FAILED_TASK_RESPONSE}" >/dev/null || fail "Tool execution failures should return a failed A2A task"
pass "Tool execution failures return a failed A2A task"

STREAM_RESPONSE="${TMP_DIR}/message-stream.txt"
STREAM_STATUS="$(curl --max-time 10 -sS -o "${STREAM_RESPONSE}" -w '%{http_code}' -X POST "${BASE_URL}/a2a" \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":3,"method":"message/stream","params":{"message":{"kind":"message","messageId":"smoke-msg-2","role":"user","parts":[{"kind":"text","text":"stream please"}]},"metadata":{"skillId":"checkpoint"}}}')"
[[ "${STREAM_STATUS}" == "501" ]] || fail "message/stream should return HTTP 501, got ${STREAM_STATUS}"
jq -e '.error.code == -32004' "${STREAM_RESPONSE}" >/dev/null || fail "message/stream should return A2A unsupported-operation code -32004"
pass "Unsupported message/stream returns the expected A2A error"

INVALID_RESPONSE="${TMP_DIR}/invalid-send.txt"
INVALID_STATUS="$(curl --max-time 10 -sS -o "${INVALID_RESPONSE}" -w '%{http_code}' -X POST "${BASE_URL}/a2a" \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":4,"method":"message/send","params":{"message":{"role":"user","parts":[{"kind":"text","text":"missing kind"}]},"metadata":{"skillId":"checkpoint"}}}')"
[[ "${INVALID_STATUS}" == "400" ]] || fail "Invalid message/send payload should return HTTP 400, got ${INVALID_STATUS}"
jq -e '.error.code == -32602' "${INVALID_RESPONSE}" >/dev/null || fail "Invalid message/send payload should return JSON-RPC invalid params code -32602"
pass "Invalid A2A payloads return JSON-RPC invalid params"

PARSE_RESPONSE="${TMP_DIR}/parse-error.txt"
PARSE_STATUS="$(curl --max-time 10 -sS -o "${PARSE_RESPONSE}" -w '%{http_code}' -X POST "${BASE_URL}/a2a" \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":7,"method":"message/send","params":')"
[[ "${PARSE_STATUS}" == "400" ]] || fail "Malformed JSON should return HTTP 400, got ${PARSE_STATUS}"
jq -e '.error.code == -32700' "${PARSE_RESPONSE}" >/dev/null || fail "Malformed JSON should return JSON-RPC parse error code -32700"
pass "Malformed JSON returns JSON-RPC parse errors"

echo "A2A smoke test passed."
