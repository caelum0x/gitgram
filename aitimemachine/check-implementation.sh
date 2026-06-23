#!/bin/bash
echo "=== Checking Implementation Against Design ==="
echo ""

echo "✓ Step 1: Event Store"
test -f src/core/event-store.ts && echo "  ✓ src/core/event-store.ts exists" || echo "  ✗ MISSING"

echo ""
echo "✓ Step 2: Conversation Logger"
test -f src/core/conversation-logger.ts && echo "  ✓ src/core/conversation-logger.ts exists" || echo "  ✗ MISSING"

echo ""
echo "✓ Step 3: MCP Integration"
grep -q "ConversationLogger" src/mcp-daemon.ts && echo "  ✓ MCP Daemon uses ConversationLogger" || echo "  ✗ MISSING"

echo ""
echo "✓ Step 4: Context Rehydration"
grep -q "generateRestoreContextWithConversation" src/tools/rewind.ts && echo "  ✓ Context rehydration implemented" || echo "  ✗ MISSING"

echo ""
echo "✓ Step 5: Additional Features"
test -f src/tools/terminal-exec.ts && echo "  ✓ Terminal execution" || echo "  ✗ MISSING"
test -f src/core/file-watcher-logger.ts && echo "  ✓ File watcher" || echo "  ✗ MISSING"
test -f src/tools/session-replayer.ts && echo "  ✓ Session replay" || echo "  ✗ MISSING"
test -f src/core/session-exporter.ts && echo "  ✓ Session export" || echo "  ✗ MISSING"
test -f src/core/content-storage.ts && echo "  ✓ Content storage" || echo "  ✗ MISSING"

echo ""
echo "=== Event Types Implemented ==="
grep -o "type: '[^']*'" src/core/event-store.ts | sort -u

echo ""
echo "=== MCP Tools for Conversation ==="
grep -E "name: '(log_|conversation_|replay_|export_|execute_)" src/mcp-daemon.ts | grep -o "'[^']*'" | sort -u
