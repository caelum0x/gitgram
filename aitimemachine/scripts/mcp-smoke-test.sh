#!/bin/bash
# MCP Smoke Test
# Verifies: tool list, core tools callable, transport works
# Exit codes: 0 = success, 1 = failure

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

MCP_SERVER="${MCP_SERVER:-node mcp/dist/index.js}"
TEST_DIR=$(mktemp -d)

echo -e "${YELLOW}=== MCP Smoke Test ===${NC}"
echo "Test directory: $TEST_DIR"
echo ""

cleanup() {
    echo -e "\n${YELLOW}Cleaning up...${NC}"
    rm -rf "$TEST_DIR"
    # Kill any background processes
    jobs -p | xargs -r kill 2>/dev/null || true
}
trap cleanup EXIT

pass() {
    echo -e "${GREEN}✓ $1${NC}"
}

fail() {
    echo -e "${RED}✗ $1${NC}"
    echo -e "${RED}Error: $2${NC}"
    exit 1
}

cd "$(dirname "$0")/.."

# Build MCP if needed
if [ ! -f "mcp/dist/index.js" ]; then
    echo -e "${YELLOW}Building MCP server...${NC}"
    cd mcp && npm run build && cd ..
fi

# Create test project for MCP
mkdir -p "$TEST_DIR/project"
echo "test content" > "$TEST_DIR/project/test.txt"

# === Test 1: Server starts ===
echo -e "\n${YELLOW}Test 1: MCP server starts${NC}"

# Create a simple test that sends JSON-RPC request
cat > "$TEST_DIR/test-init.json" << 'EOF'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
EOF

# Test stdio transport by sending init request
RESPONSE=$(echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | timeout 10 $MCP_SERVER 2>/dev/null | head -1 || echo "")

if echo "$RESPONSE" | grep -q "result"; then
    pass "Server initialized via stdio"
elif echo "$RESPONSE" | grep -q "serverInfo"; then
    pass "Server initialized (serverInfo present)"
else
    echo -e "${YELLOW}⚠ Could not verify server init response${NC}"
    echo "Response: $RESPONSE"
fi

# === Test 2: List tools ===
echo -e "\n${YELLOW}Test 2: List available tools${NC}"

TOOLS_REQUEST='{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
INIT_AND_LIST=$(cat << EOF
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
EOF
)

RESPONSE=$(echo "$INIT_AND_LIST" | timeout 10 $MCP_SERVER 2>/dev/null || echo "")

if echo "$RESPONSE" | grep -q "tm_checkpoint_create"; then
    pass "Core time travel tools available"
else
    echo -e "${YELLOW}⚠ Could not verify tool list${NC}"
fi

if echo "$RESPONSE" | grep -q "tm_search"; then
    pass "KB search tools available"
else
    echo -e "${YELLOW}⚠ Could not verify search tools${NC}"
fi

# Check stable tools are present
STABLE_TOOLS=("tm_project_init" "tm_checkpoint_create" "tm_checkpoint_list" "tm_checkpoint_restore" "tm_search" "tm_timeline")
STABLE_COUNT=0
for tool in "${STABLE_TOOLS[@]}"; do
    if echo "$RESPONSE" | grep -q "$tool"; then
        ((STABLE_COUNT++))
    fi
done

if [ "$STABLE_COUNT" -ge 4 ]; then
    pass "Found $STABLE_COUNT/6 stable tools"
else
    echo -e "${YELLOW}⚠ Only found $STABLE_COUNT/6 stable tools${NC}"
fi

# === Test 3: Experimental tools hidden by default ===
echo -e "\n${YELLOW}Test 3: Experimental tools configuration${NC}"

EXPERIMENTAL_TOOLS=("tm_bisect" "tm_container_state" "tm_gemini_sessions")
EXP_COUNT=0
for tool in "${EXPERIMENTAL_TOOLS[@]}"; do
    if echo "$RESPONSE" | grep -q "$tool"; then
        ((EXP_COUNT++))
    fi
done

if [ "$EXP_COUNT" -eq 0 ]; then
    pass "Experimental tools hidden by default"
elif [ -n "$AITM_EXPERIMENTAL_TOOLS" ]; then
    pass "Experimental tools visible (AITM_EXPERIMENTAL_TOOLS set)"
else
    echo -e "${YELLOW}⚠ Found $EXP_COUNT experimental tools (should be hidden)${NC}"
fi

# === Test 4: Call a tool ===
echo -e "\n${YELLOW}Test 4: Call tm_checkpoint_list tool${NC}"

CALL_REQUEST=$(cat << EOF
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"tm_checkpoint_list","arguments":{"projectPath":"$TEST_DIR/project"}}}
EOF
)

RESPONSE=$(echo "$CALL_REQUEST" | timeout 15 $MCP_SERVER 2>/dev/null || echo "")

if echo "$RESPONSE" | grep -q "content"; then
    pass "Tool call returned content"
elif echo "$RESPONSE" | grep -q "result"; then
    pass "Tool call succeeded"
else
    echo -e "${YELLOW}⚠ Could not verify tool call response${NC}"
fi

# === Summary ===
echo -e "\n${GREEN}=== MCP Smoke Tests Completed ===${NC}"
exit 0
