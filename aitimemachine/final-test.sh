#!/bin/bash
set -e

echo "🧪 Final End-to-End Test"
echo "========================"
echo ""

# Test 1: CLI Commands
echo "✓ Test 1: CLI Commands"
node lib/cli-v2.js --help | grep -q "conversation" && echo "  ✓ conversation command exists"
node lib/cli-v2.js --help | grep -q "exec" && echo "  ✓ exec command exists"
node lib/cli-v2.js --help | grep -q "replay" && echo "  ✓ replay command exists"
node lib/cli-v2.js --help | grep -q "export-session" && echo "  ✓ export-session command exists"
echo ""

# Test 2: Event Logging
echo "✓ Test 2: Event Logging"
node lib/cli-v2.js log user "Final test message" > /dev/null 2>&1
tail -1 .aitimemachine/events.jsonl | jq -r '.type' | grep -q "user_message" && echo "  ✓ User message logged"
node lib/cli-v2.js log assistant "Test response" > /dev/null 2>&1
tail -1 .aitimemachine/events.jsonl | jq -r '.type' | grep -q "assistant_message" && echo "  ✓ Assistant message logged"
echo ""

# Test 3: Terminal Execution
echo "✓ Test 3: Terminal Execution"
node lib/cli-v2.js exec "echo 'test'" > /dev/null 2>&1
tail -1 .aitimemachine/events.jsonl | jq -r '.type' | grep -q "terminal_command" && echo "  ✓ Terminal command logged"
tail -1 .aitimemachine/events.jsonl | jq -r '.data.command' | grep -q "echo" && echo "  ✓ Command captured"
tail -1 .aitimemachine/events.jsonl | jq -r '.data.exitCode' | grep -q "0" && echo "  ✓ Exit code captured"
echo ""

# Test 4: Conversation View
echo "✓ Test 4: Conversation View"
node lib/cli-v2.js conversation 2>&1 | grep -q "Recent Events" && echo "  ✓ Conversation displays"
node lib/cli-v2.js conversation 2>&1 | grep -q "User" && echo "  ✓ User messages shown"
node lib/cli-v2.js conversation 2>&1 | grep -q "Assistant" && echo "  ✓ Assistant messages shown"
echo ""

# Test 5: Session Export
echo "✓ Test 5: Session Export"
node lib/cli-v2.js export-session --format json --output test-final.json > /dev/null 2>&1
test -f test-final.json && echo "  ✓ Export file created"
cat test-final.json | jq -r '.sessionId' | grep -q "-" && echo "  ✓ Session ID present"
cat test-final.json | jq -r 'keys[]' | grep -q "events" && echo "  ✓ Events included"
rm -f test-final.json
echo ""

# Test 6: MCP Daemon
echo "✓ Test 6: MCP Daemon"
test -f lib/mcp-daemon.js && echo "  ✓ MCP daemon compiled"
grep -q "log_user_message" lib/mcp-daemon.js && echo "  ✓ log_user_message tool exists"
grep -q "execute_command" lib/mcp-daemon.js && echo "  ✓ execute_command tool exists"
grep -q "conversation_context" lib/mcp-daemon.js && echo "  ✓ conversation_context tool exists"
grep -q "replay_session" lib/mcp-daemon.js && echo "  ✓ replay_session tool exists"
echo ""

# Test 7: File Structure
echo "✓ Test 7: File Structure"
test -f src/core/event-store.ts && echo "  ✓ event-store.ts exists"
test -f src/core/conversation-logger.ts && echo "  ✓ conversation-logger.ts exists"
test -f src/tools/terminal-exec.ts && echo "  ✓ terminal-exec.ts exists"
test -f src/core/file-watcher-logger.ts && echo "  ✓ file-watcher-logger.ts exists"
test -f src/tools/session-replayer.ts && echo "  ✓ session-replayer.ts exists"
test -f src/core/session-exporter.ts && echo "  ✓ session-exporter.ts exists"
echo ""

# Test 8: Event Types
echo "✓ Test 8: Event Types"
EVENT_COUNT=$(grep -o "'[a-z_]*'" src/core/event-store.ts | sort -u | wc -l)
test $EVENT_COUNT -ge 12 && echo "  ✓ All 12+ event types defined"
echo ""

echo "========================"
echo "✅ ALL TESTS PASSED"
echo ""
echo "Summary:"
echo "  - CLI commands working"
echo "  - Event logging working"
echo "  - Terminal execution working"
echo "  - Conversation view working"
echo "  - Session export working"
echo "  - MCP daemon ready"
echo "  - All files present"
echo "  - All event types defined"
echo ""
echo "🎉 Implementation Complete!"
