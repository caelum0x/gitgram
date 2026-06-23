#!/bin/bash

echo "=== PHASE 1 & 2 COMPLETION CHECK ==="
echo ""

echo "PHASE 1: Core Engine"
echo "-------------------"
test -f src/core/selective-restore.ts && echo "✓ selective-restore.ts" || echo "✗ MISSING"
test -f src/core/diff-engine.ts && echo "✓ diff-engine.ts" || echo "✗ MISSING"
test -f src/core/timeline-index.ts && echo "✓ timeline-index.ts" || echo "✗ MISSING"
test -f src/core/search-engine.ts && echo "✓ search-engine.ts" || echo "✗ MISSING"
test -f src/core/bloom-filter.ts && echo "✓ bloom-filter.ts" || echo "✗ MISSING"
test -f src/core/file-comparator.ts && echo "✓ file-comparator.ts" || echo "✗ MISSING"
test -f src/core/file-history-tracker.ts && echo "✓ file-history-tracker.ts" || echo "✗ MISSING"

echo ""
echo "PHASE 2: MCP Tools"
echo "------------------"
grep -q "name: 'restore_files'" src/mcp-daemon.ts && echo "✓ restore_files tool" || echo "✗ MISSING"
grep -q "name: 'get_file_diff'" src/mcp-daemon.ts && echo "✓ get_file_diff tool" || echo "✗ MISSING"
grep -q "name: 'get_timeline'" src/mcp-daemon.ts && echo "✓ get_timeline tool" || echo "✗ MISSING"
grep -q "name: 'search_content'" src/mcp-daemon.ts && echo "✓ search_content tool" || echo "✗ MISSING"
grep -q "name: 'get_file_history'" src/mcp-daemon.ts && echo "✓ get_file_history tool" || echo "✗ MISSING"

grep -q "case 'restore_files':" src/mcp-daemon.ts && echo "✓ restore_files handler" || echo "✗ MISSING"
grep -q "case 'get_file_diff':" src/mcp-daemon.ts && echo "✓ get_file_diff handler" || echo "✗ MISSING"
grep -q "case 'get_timeline':" src/mcp-daemon.ts && echo "✓ get_timeline handler" || echo "✗ MISSING"
grep -q "case 'search_content':" src/mcp-daemon.ts && echo "✓ search_content handler" || echo "✗ MISSING"
grep -q "case 'get_file_history':" src/mcp-daemon.ts && echo "✓ get_file_history handler" || echo "✗ MISSING"

echo ""
echo "Build Status"
echo "------------"
npm run build > /dev/null 2>&1 && echo "✓ Build successful" || echo "✗ Build failed"

echo ""
echo "Compiled Files"
echo "--------------"
test -f lib/core/selective-restore.js && echo "✓ selective-restore.js" || echo "✗ MISSING"
test -f lib/core/diff-engine.js && echo "✓ diff-engine.js" || echo "✗ MISSING"
test -f lib/core/timeline-index.js && echo "✓ timeline-index.js" || echo "✗ MISSING"
test -f lib/core/search-engine.js && echo "✓ search-engine.js" || echo "✗ MISSING"
test -f lib/mcp-daemon.js && echo "✓ mcp-daemon.js" || echo "✗ MISSING"

echo ""
echo "=== SUMMARY ==="
PHASE1_FILES=7
PHASE2_TOOLS=5
PHASE2_HANDLERS=5

PHASE1_COUNT=$(ls src/core/{selective-restore,diff-engine,timeline-index,search-engine,bloom-filter,file-comparator,file-history-tracker}.ts 2>/dev/null | wc -l)
PHASE2_TOOL_COUNT=$(grep -c "name: '\(restore_files\|get_file_diff\|get_timeline\|search_content\|get_file_history\)'" src/mcp-daemon.ts)
PHASE2_HANDLER_COUNT=$(grep -c "case '\(restore_files\|get_file_diff\|get_timeline\|search_content\|get_file_history\)':" src/mcp-daemon.ts)

echo "Phase 1: $PHASE1_COUNT/$PHASE1_FILES files"
echo "Phase 2: $PHASE2_TOOL_COUNT/$PHASE2_TOOLS tool definitions"
echo "Phase 2: $PHASE2_HANDLER_COUNT/$PHASE2_HANDLERS tool handlers"

if [ $PHASE1_COUNT -eq $PHASE1_FILES ] && [ $PHASE2_TOOL_COUNT -eq $PHASE2_TOOLS ] && [ $PHASE2_HANDLER_COUNT -eq $PHASE2_HANDLERS ]; then
  echo ""
  echo "✅ PHASE 1 & 2 COMPLETE"
else
  echo ""
  echo "⚠️  INCOMPLETE"
fi
