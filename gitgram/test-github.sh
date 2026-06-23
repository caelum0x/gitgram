#!/bin/bash

echo "🧪 Testing GitHub Integration"
echo "============================="
echo ""

# Check if backend is running
if ! curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo "❌ Backend is not running!"
    echo "Start it with: cd backend && npm run dev"
    exit 1
fi

echo "✅ Backend is running"
echo ""

echo "1️⃣ Testing Repository Search"
echo "----------------------------"
echo "Searching for 'vscode'..."
echo ""

response=$(curl -s "http://localhost:3001/api/repositories/search?q=vscode")
echo "$response" | jq '.' 2>/dev/null || echo "$response"
echo ""

echo "2️⃣ Testing Get Repository"
echo "------------------------"
echo "Fetching microsoft/vscode..."
echo ""

response=$(curl -s "http://localhost:3001/api/repositories/microsoft/vscode")
echo "$response" | jq '.' 2>/dev/null || echo "$response"
echo ""

echo "3️⃣ Testing Trending Repositories"
echo "-------------------------------"
echo "Fetching trending TypeScript repos..."
echo ""

response=$(curl -s "http://localhost:3001/api/repositories/trending?language=typescript")
echo "$response" | jq '.' 2>/dev/null || echo "$response"
echo ""

echo "4️⃣ Testing Rate Limit"
echo "--------------------"
echo "Checking GitHub API rate limit..."
echo ""

if [ -n "$GITHUB_TOKEN" ]; then
    curl -s -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/rate_limit | jq '.rate'
else
    curl -s https://api.github.com/rate_limit | jq '.rate'
fi
echo ""

echo "✅ GitHub Integration Tests Complete!"
echo ""
echo "Tips:"
echo "  - Add GITHUB_TOKEN to .env for 5000 req/hour"
echo "  - Without token: 60 req/hour"
echo "  - Get token: https://github.com/settings/tokens"
echo ""
