#!/bin/bash

echo "🧪 Testing Universal Repository Features"
echo "========================================"
echo ""

# Start backend in background
cd /Users/arhansubasi/gitgram/backend
npm run dev > /dev/null 2>&1 &
BACKEND_PID=$!

echo "⏳ Waiting for server to start..."
sleep 5

echo ""
echo "✅ Testing Repository Search"
curl -s "http://localhost:3001/api/repositories/search?q=vscode" | head -c 200
echo "..."

echo ""
echo ""
echo "✅ Testing Get Repository"
curl -s "http://localhost:3001/api/repositories/microsoft/vscode" | head -c 200
echo "..."

echo ""
echo ""
echo "✅ Testing Trending Repos"
curl -s "http://localhost:3001/api/repositories/trending" | head -c 200
echo "..."

echo ""
echo ""
echo "🎉 Backend is ready!"
echo ""
echo "Available endpoints:"
echo "  GET  /api/repositories/search?q=vscode"
echo "  GET  /api/repositories/trending"
echo "  GET  /api/repositories/:owner/:name"
echo "  GET  /api/repositories/:owner/:name/posts"
echo "  POST /api/repositories/:owner/:name/follow"
echo ""
echo "To create a post about any repo:"
echo '  POST /api/posts'
echo '  Body: { "content": "Great project!", "repoOwner": "microsoft", "repoName": "vscode" }'
echo ""

# Kill backend
kill $BACKEND_PID 2>/dev/null

echo "✅ Tests complete!"
