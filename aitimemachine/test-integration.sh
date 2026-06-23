#!/bin/bash

echo "=== Testing AI Time Machine Integration ==="
echo ""

# Test 1: CLI JSON output
echo "1. Testing CLI JSON output..."
OUTPUT=$(node lib/cli-v2.js list --json 2>/dev/null)
if [ $? -eq 0 ]; then
  COUNT=$(echo "$OUTPUT" | jq 'length' 2>/dev/null)
  if [ $? -eq 0 ]; then
    echo "   ✅ CLI returns valid JSON with $COUNT checkpoints"
  else
    echo "   ❌ CLI output is not valid JSON"
    exit 1
  fi
else
  echo "   ❌ CLI command failed"
  exit 1
fi

# Test 2: API Server
echo ""
echo "2. Testing API Server..."
node lib/api-server.js > /dev/null 2>&1 &
API_PID=$!
sleep 3

# Check if server is running
if ! kill -0 $API_PID 2>/dev/null; then
  echo "   ❌ API server failed to start"
  exit 1
fi

# Test health endpoint
HEALTH=$(curl -s http://localhost:3001/health)
if echo "$HEALTH" | jq -e '.status == "ok"' > /dev/null 2>&1; then
  echo "   ✅ API server health check passed"
else
  echo "   ❌ API server health check failed"
  kill $API_PID 2>/dev/null
  exit 1
fi

# Test checkpoints endpoint
CHECKPOINTS=$(curl -s http://localhost:3001/api/checkpoints)
CP_COUNT=$(echo "$CHECKPOINTS" | jq '.checkpoints | length' 2>/dev/null)
if [ $? -eq 0 ]; then
  echo "   ✅ API returns $CP_COUNT checkpoints"
else
  echo "   ❌ API checkpoints endpoint failed"
  kill $API_PID 2>/dev/null
  exit 1
fi

kill $API_PID 2>/dev/null

# Test 3: VSCode Extension
echo ""
echo "3. Testing VSCode Extension..."
if [ -f "extensions/vscode/out/extension.js" ]; then
  echo "   ✅ Extension compiled successfully"
else
  echo "   ❌ Extension not compiled"
  exit 1
fi

# Test 4: Website
echo ""
echo "4. Testing Website..."
if [ -d "website/.next" ]; then
  echo "   ✅ Website built successfully"
else
  echo "   ❌ Website not built"
  exit 1
fi

echo ""
echo "=== All Tests Passed! ==="
echo ""
echo "To run:"
echo "  API:       node lib/api-server.js"
echo "  Website:   cd website && npm run dev"
echo "  Extension: Open extensions/vscode in VSCode, press F5"
